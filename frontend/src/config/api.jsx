import axios from "axios";

export const API_BASE_URL = "http://localhost:4001";

const API = axios.create({
  baseURL: `${API_BASE_URL}/api`,
});

export default API;