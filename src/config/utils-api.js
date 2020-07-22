import axios from "axios";

const utilsApi = axios.create({
    baseURL: process.env.VUE_APP_UTILS_API_URL
});

export default utilsApi;
