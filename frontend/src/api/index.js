import axios from 'axios';
// 统一管理前端与后端的接口地址与静态资源 URL 解析
// 目标：
// - 自动推断 API Base URL（本地开发、生产部署、自定义 .env）
// - 兜底处理图片等静态资源的完整可访问地址
// - 在每个请求头自动附带 JWT，保持会话登录态

// 去掉末尾的斜杠，避免 "http://host/" + "/api" 拼接成双斜杠
const sanitizeUrl = (url) => url.replace(/\/$/, '');
const ABSOLUTE_ASSET_REGEX = /^(?:https?:|data:|blob:)/i;

const ensureLeadingSlash = (value) => {
    if (!value) return '';
    return value.startsWith('/') ? value : `/${value}`;
};

// 自动计算后端 API 的 Base URL
// 优先级：VITE_API_BASE_URL(.env) > 浏览器 window.location 推断 > 本地兜底
const getApiBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (envUrl && envUrl.trim()) {
        return sanitizeUrl(envUrl.trim());
    }

    if (typeof window !== 'undefined') {
        const { protocol, hostname, port } = window.location;

        if (import.meta.env.DEV) {
            const devApiPort = import.meta.env.VITE_DEV_API_PORT || '3000';
            return `${protocol}//${hostname}:${devApiPort}`;
        }

        if (!port || port === '80' || port === '443') {
            return `${protocol}//${hostname}`;
        }

        return `${protocol}//${hostname}:${port}`;
    }

    return 'http://localhost:3000';
};

const API_BASE_URL = sanitizeUrl(getApiBaseUrl());

// 统一把后端返回的资源路径（/uploads/xx.jpg 或相对路径）转换成可访问的完整 URL
// - 已是绝对地址（http/https/data/blob）则原样返回
// - 否则拼接到 API_BASE_URL 的 origin 上
const resolveAssetUrl = (value) => {
    if (!value) return '';
    if (ABSOLUTE_ASSET_REGEX.test(value)) {
        return value;
    }

    const normalized = ensureLeadingSlash(value);

    try {
        const base = new URL(API_BASE_URL);
        return `${base.origin}${normalized}`;
    } catch (error) {
        if (typeof window !== 'undefined' && window.location?.origin) {
            return `${window.location.origin}${normalized}`;
        }
        return normalized;
    }
};

// 共享 axios 实例，集中配置 baseURL 与拦截器
const api = axios.create({
    baseURL: API_BASE_URL,
});

// 请求拦截器：在每个请求头自动添加 JWT Token（若已登录）
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

export { API_BASE_URL, resolveAssetUrl };
export default api;