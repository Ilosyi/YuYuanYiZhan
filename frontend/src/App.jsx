// frontend/src/App.jsx
// 版本: 1.3 - 补全所有导航链接和视图切换逻辑

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import MyListingsPage from './pages/MyListingsPage';
import MyOrdersPage from './pages/MyOrdersPage';
import MyMessagesPage from './pages/MyMessagesPage';
import UserCenterPage from './pages/UserCenterPage';
import PostModal from './components/PostModal';

// Header 组件，现在包含用户信息和登出按钮
const Header = ({ activeNav, setActiveNav, onPostNewClick }) => {
    const { user, logout } = useAuth();
    
    // ✅ 修正：补全所有的导航项
    const navItems = {
    home: '首页',
    myListings: '我的发布',
    myOrders: '我的订单',
    messages: '我的消息',
    userCenter: '用户中心',
    };

    return (
        <header className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50">
            <div className="container mx-auto px-4">
                <div className="flex justify-between items-center h-16">
                    <div className="text-2xl font-bold cursor-pointer" onClick={() => setActiveNav('home')}>喻园易站</div>
                    <div className="flex items-center">
                        {user && (
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
                        )}
                        <div className="ml-4 pl-4 border-l border-indigo-500 flex items-center space-x-3">
                            {user ? (
                                <>
                                    <button onClick={onPostNewClick} className="px-3 py-1.5 text-sm bg-green-500 rounded-md hover:bg-green-400">发布+</button>
                                    <span className="text-sm">欢迎, {user.username}</span>
                                    <button onClick={logout} className="px-3 py-1 text-sm bg-indigo-500 rounded-md hover:bg-indigo-400">登出</button>
                                </>
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


function MainApp() {
    const { user, isLoading } = useAuth();
    const [activeNav, setActiveNav] = useState('home');
    const [authView, setAuthView] = useState('login');

    // Modal State Management
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const triggerRefresh = () => setRefreshTrigger(c => c + 1);

    const handleOpenModal = (item = null) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
    };

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center">加载中...</div>;
    }

    if (!user) {
        return authView === 'login' ? (
            <LoginPage onViewChange={() => setAuthView('register')} />
        ) : (
            <RegisterPage onViewChange={() => setAuthView('login')} />
        );
    }
    
    const renderContent = () => {
      switch (activeNav) {
          case 'home': 
              // ✅ 将 setActiveNav 传递给 HomePage
              return <HomePage key={refreshTrigger} onNavigate={setActiveNav} />;
          case 'myListings': 
              return <MyListingsPage key={refreshTrigger} currentUser={user} onEditListing={handleOpenModal} />;
          case 'myOrders': 
              return <MyOrdersPage key={refreshTrigger} currentUser={user} />;
          case 'messages': 
              return <MyMessagesPage currentUser={user} />;
          case 'userCenter':
              return <UserCenterPage key={refreshTrigger} currentUser={user} onNavigate={setActiveNav} />;
          default: 
              return <HomePage onNavigate={setActiveNav} />;
      }
  };

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <Header activeNav={activeNav} setActiveNav={setActiveNav} onPostNewClick={() => handleOpenModal(null)} />
            <main className="container mx-auto p-4 md:p-6">
                {renderContent()}
            </main>
            <PostModal 
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                editingItem={editingItem}
                onSaveSuccess={triggerRefresh}
            />
        </div>
    );
}

function App() {
    return (
        <AuthProvider>
            <MainApp />
        </AuthProvider>
    );
}

export default App;