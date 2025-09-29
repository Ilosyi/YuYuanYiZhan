import axios from 'axios';

const sanitizeUrl = (url) => url.replace(/\/$/, '');
const ABSOLUTE_ASSET_REGEX = /^(?:https?:|data:|blob:)/i;

const ensureLeadingSlash = (value) => {
    if (!value) return '';
    return value.startsWith('/') ? value : `/${value}`;
};

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

export { API_BASE_URL, resolveAssetUrl };
export default api;