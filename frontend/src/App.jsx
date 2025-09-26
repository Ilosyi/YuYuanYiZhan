// frontend/src/App.jsx
// [完整代码]
import React, { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import MyListingsPage from './pages/MyListingsPage';
import MyOrdersPage from './pages/MyOrdersPage';
import MyMessagesPage from './pages/MyMessagesPage';
import PostModal from './components/PostModal'; // 导入模态框组件

// Header 组件 (新增 onPostNewClick prop)
const Header = ({ activeNav, setActiveNav, onPostNewClick }) => {
    const { user, logout } = useAuth();
    // ...
    return (
        <header className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50">
            <div className="container mx-auto px-4">
                <div className="flex justify-between items-center h-16">
                    <div className="text-2xl font-bold cursor-pointer" onClick={() => setActiveNav('home')}>喻园易站</div>
                    <div className="flex items-center">
                        {user && (
                             <nav className="hidden md:flex items-center space-x-2">
                                {/* 导航按钮... */}
                                 <button onClick={() => setActiveNav('home')} className={`...`}>首页</button>
                                 <button onClick={() => setActiveNav('myListings')} className={`...`}>我的发布</button>
                                 {/* ... 其他导航按钮 ... */}
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
    
    // 用于触发页面数据刷新的状态
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
        // 将 onEditListing prop 传递给 MyListingsPage
        // 使用 refreshTrigger 来确保页面在保存后能刷新
        switch (activeNav) {
            case 'home': return <HomePage key={refreshTrigger} />;
            case 'myListings': return <MyListingsPage key={refreshTrigger} currentUser={user} onEditListing={handleOpenModal} />;
            case 'myOrders': return <MyOrdersPage currentUser={user} />;
            case 'messages': return <MyMessagesPage currentUser={user} />;
            default: return <HomePage />;
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
                onSaveSuccess={triggerRefresh} // 成功保存后触发刷新
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