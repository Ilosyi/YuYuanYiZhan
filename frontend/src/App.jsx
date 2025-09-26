import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
// 导入其他页面组件，即使它们暂时是占位符
import MyListingsPage from './pages/MyListingsPage';
import MyOrdersPage from './pages/MyOrdersPage';
import MyMessagesPage from './pages/MyMessagesPage';

// Header 组件，现在包含用户信息和登出按钮
const Header = ({ activeNav, setActiveNav }) => {
    const { user, logout } = useAuth();
    const navItems = {
        home: '首页',
        myListings: '我的发布',
        myOrders: '我的订单',
        messages: '我的消息',
    };

    return (
        <header className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50">
            <div className="container mx-auto px-4">
                <div className="flex justify-between items-center h-16">
                    <div className="text-2xl font-bold cursor-pointer" onClick={() => setActiveNav('home')}>喻园易站</div>
                    <div className="flex items-center">
                        <nav className="hidden md:flex items-center space-x-2">
                            {Object.entries(navItems).map(([key, value]) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveNav(key)}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 
                                        ${activeNav === key ? 'bg-indigo-800' : 'hover:bg-indigo-600'}`}
                                >
                                    {value}
                                </button>
                            ))}
                        </nav>
                        <div className="ml-4 pl-4 border-l border-indigo-500">
                            {user ? (
                                <div className="flex items-center space-x-3">
                                    <span className="text-sm">欢迎, {user.username}</span>
                                    <button onClick={logout} className="px-3 py-1 text-sm bg-indigo-500 rounded-md hover:bg-indigo-400">登出</button>
                                </div>
                            ) : (
                                <span className="text-sm">请登录</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

// 主应用布局组件
function MainApp() {
    const { user, isLoading } = useAuth();
    const [activeNav, setActiveNav] = useState('home');
    const [authView, setAuthView] = useState('login'); // 'login' or 'register'

    // 当AuthContext正在加载时，显示加载指示
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center">加载中...</div>;
    }

    // 如果用户未登录，显示登录或注册页面
    if (!user) {
        return authView === 'login' ? (
            <LoginPage onViewChange={() => setAuthView('register')} />
        ) : (
            <RegisterPage onViewChange={() => setAuthView('login')} />
        );
    }
    
    // 如果用户已登录，渲染主应用界面
    const renderContent = () => {
        switch (activeNav) {
            case 'home': return <HomePage />;
            case 'myListings': return <MyListingsPage currentUser={user} />;
            case 'myOrders': return <MyOrdersPage currentUser={user} />;
            case 'messages': return <MyMessagesPage currentUser={user} />;
            default: return <HomePage />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <Header activeNav={activeNav} setActiveNav={setActiveNav} />
            <main className="container mx-auto p-4 md:p-6">
                {renderContent()}
            </main>
        </div>
    );
}

// 顶层App组件，包裹AuthProvider
function App() {
    return (
        <AuthProvider>
            <MainApp />
        </AuthProvider>
    );
}

export default App;