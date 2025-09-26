import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const LoginPage = ({ onViewChange }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await login(username, password);
            // 登录成功后，App.jsx中的逻辑会自动切换视图
        } catch (err) {
            setError(err.response?.data?.message || '登录失败，请检查用户名和密码。');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900">欢迎回到喻园易站</h1>
                    <p className="mt-2 text-gray-600">登录以继续</p>
                </div>
                
                {error && <p className="text-center text-red-500 bg-red-100 p-3 rounded-md">{error}</p>}

                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">用户名</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">密码</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                        >
                            {isLoading ? '登录中...' : '登录'}
                        </button>
                    </div>
                </form>

                <p className="text-sm text-center text-gray-600">
                    还没有账户？{' '}
                    <button onClick={() => onViewChange('register')} className="font-medium text-indigo-600 hover:text-indigo-500">
                        立即注册
                    </button>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;