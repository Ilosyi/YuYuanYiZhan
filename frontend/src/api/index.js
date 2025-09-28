import axios from 'axios';

// 根据当前域名动态设置 API 地址
const getApiBaseUrl = () => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    } else {
        // 局域网访问时，使用当前设备的 IP
        return `http://${hostname}:3000`;
    }
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
    baseURL: API_BASE_URL,
});

// 请求拦截器：在每个请求的头部自动添加 JWT Token
api.interceptors.request.use(
    config => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    error => {
        return Promise.reject(error);
    }
);

export { API_BASE_URL };
export default api;