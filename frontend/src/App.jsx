import React from "react";
import { Routes, Route } from "react-router-dom";

import Layout from "./compnents/Layout";
import VideoDownload from "./pages/video_downloder/index";
import AboutPage from "./pages/about/index"

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

            <Route
        path="/about"
        element={
          <Layout>
            <AboutPage />
          </Layout>
        }
      />


    </Routes>
  );
}

export default App;
