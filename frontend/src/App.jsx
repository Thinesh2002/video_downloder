import React from "react";
import { Routes, Route } from "react-router-dom";

import Layout from "./compnents/Layout";
import VideoDownload from "./pages/video_downloder/index";

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
