import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        const userData = localStorage.getItem('user');
        if (token && userData) {
            setUser(JSON.parse(userData));
        }
        setIsLoading(false);
    }, []);

    const login = async (username, password) => {
        const response = await api.post('/api/auth/login', { username, password });
        const { accessToken, user } = response.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
    };

    const register = async (username, password) => {
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
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        return user;
    };

    const logout = () => {
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
            {!isLoading && children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    return useContext(AuthContext);
};