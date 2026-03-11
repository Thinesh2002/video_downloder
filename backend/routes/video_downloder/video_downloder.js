const express = require("express");
const router  = express.Router();
const { videoInfo, getUrl, downloadVideo, cleanup } = require("../../controllers/video_downloer/video_downloader");
const { previewVideo } = require("../../controllers/video_downloer/proxy_controller");

router.get("/info",         videoInfo);
router.post("/url",         getUrl);
router.post("/download",    downloadVideo);
router.post("/preview",     previewVideo);   // ← new: download+stream for preview
router.delete("/cleanup",   cleanup);

module.exports = router;