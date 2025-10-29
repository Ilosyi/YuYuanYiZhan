import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../api';

// 认证上下文（全局登录状态）
// - 提供 user/isLoading 状态
// - 提供 login/register/logout 以及基于邮箱验证码的注册登录
// - 自动把登录结果保存到 localStorage，刷新页面后保持会话

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // 应用初始化：从 localStorage 恢复登录态
        const token = localStorage.getItem('accessToken');
        const userData = localStorage.getItem('user');
        if (token && userData) {
            setUser(JSON.parse(userData));
        }
        setIsLoading(false);
    }, []);

    const login = async (username, password) => {
        // 账号密码登录
        const response = await api.post('/api/auth/login', { username, password });
        const { accessToken, user } = response.data;
        // 持久化到 localStorage，便于刷新后保持状态
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
    };

    const register = async (username, password) => {
        // 基础注册（不带邮箱校验的老接口，保留兼容）
        await api.post('/api/auth/register', { username, password });
    };

    // 申请邮箱验证码
    const requestEmailCode = async (studentId) => {
        const { data } = await api.post('/api/auth/request-email-code', { studentId });
        return data;
    };

    // 校验验证码并完成注册（成功后自动登录）
    const verifyEmailRegister = async ({ studentId, code, username, password }) => {
        const response = await api.post('/api/auth/verify-email-code', { studentId, code, username, password });
        const { accessToken, user } = response.data;
        // 验证成功后与普通登录一致：写入 localStorage 并更新上下文
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        return user;
    };

    const logout = () => {
        // 清除本地会话信息
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        setUser(null);
    };

    const authContextValue = {
        user,
        isLoading,
        login,
        register,
        logout,
        requestEmailCode,
        verifyEmailRegister,
    };

    return (
        <AuthContext.Provider value={authContextValue}>
            {/* isLoading 期间不渲染子组件，避免读写 localStorage 的闪烁 */}
            {!isLoading && children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    return useContext(AuthContext);
};