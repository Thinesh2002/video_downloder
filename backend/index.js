require("dotenv").config()
const express = require("express")
const cors = require("cors")
const path = require("path")

const videoDownloaderRoutes = require("./routes/video_downloder/video_downloder")

const app = express()

app.use(cors())
app.use(express.json())

app.use("/api/video", videoDownloaderRoutes)

app.use("/downloads", express.static(path.join(__dirname, "downloads")))

app.get("/", (req, res) => {
  res.json({ message: "Video Downloader API Running" })
})

const PORT = process.env.PORT || 4001

app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`)
})