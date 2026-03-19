# 🚀 Hostinger VPS Deployment Guide — Video Downloader API v2.0

## 1. Initial VPS Setup (run as root)

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Python + yt-dlp
apt install -y python3 python3-pip ffmpeg
pip3 install -U yt-dlp

# Verify
node -v        # ≥ 20
yt-dlp --version
ffmpeg -version

# Install PM2 globally
npm install -g pm2
```

## 2. Clone / Upload Your Code

```bash
# Option A: Git
cd /var/www
git clone https://github.com/YOUR_ORG/video-api.git
cd video-api

# Option B: SCP from local machine
scp -r ./upgraded root@YOUR_VPS_IP:/var/www/video-api
```

## 3. Install Dependencies

```bash
cd /var/www/video-api
npm install --omit=dev
```

## 4. Environment File

```bash
cp .env.example .env
nano .env    # Fill in your real values
```

## 5. Folder Permissions

```bash
mkdir -p /var/www/video-api/downloads /var/www/video-api/logs
chown -R www-data:www-data /var/www/video-api
chmod 755 /var/www/video-api/downloads
```

## 6. Start with PM2

```bash
npm run pm2:start

# Auto-restart on VPS reboot
pm2 startup
pm2 save
```

## 7. Nginx Setup

```bash
# Install nginx
apt install -y nginx

# Copy config
cp nginx.conf.example /etc/nginx/sites-available/video-api
nano /etc/nginx/sites-available/video-api   # Edit domain name

# Enable site
ln -s /etc/nginx/sites-available/video-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Add rate limit zone to /etc/nginx/nginx.conf inside http {}:
# limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;
```

## 8. SSL Certificate (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.video.teckvora.com
# Auto-renew:
crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 9. Keep yt-dlp Updated (cronjob)

```bash
crontab -e
# Add — update yt-dlp weekly at 3am Sunday:
0 3 * * 0 /usr/local/bin/pip3 install -U yt-dlp >> /var/log/ytdlp-update.log 2>&1
```

## 10. API Endpoints Reference

| Method | Route                  | Description                        |
|--------|------------------------|------------------------------------|
| GET    | /health                | Server health check                |
| GET    | /api/video/info        | Video metadata (`?url=...`)        |
| GET    | /api/video/formats     | List qualities & platforms         |
| POST   | /api/video/url         | Get direct stream URL              |
| POST   | /api/video/download    | Download to server → stream file   |
| POST   | /api/video/preview     | Download + byte-range stream       |
| DELETE | /api/video/cleanup     | Remove old temp files              |

### POST body example:
```json
{
  "url": "https://www.youtube.com/watch?v=XXXX",
  "quality": "medium"
}
```
Quality options: `best`, `high`, `medium`, `low`, `audio`

## 11. Monitoring

```bash
pm2 logs video-api        # Live logs
pm2 monit                 # Dashboard
tail -f logs/error-*.log  # Error logs
```
