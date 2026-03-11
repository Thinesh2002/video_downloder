import axios from "axios";

export const API_BASE_URL = "http://video-api.teckvora.com";

const API = axios.create({
  baseURL: `${API_BASE_URL}/api`,
});

export default API;