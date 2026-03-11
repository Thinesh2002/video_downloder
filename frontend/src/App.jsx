import React from "react";
import { Routes, Route } from "react-router-dom";

import Layout from "./compnents/Layout";
import VideoDownload from "./Pages/video_download/index";

import "./index.css";

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout>
            <VideoDownload />
          </Layout>
        }
      />
    </Routes>
  );
}

export default App;