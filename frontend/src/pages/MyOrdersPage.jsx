// frontend/src/pages/MyOrdersPage.jsx
// [请用此版本完全替换]
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import OrderCard from '../components/OrderCard';

const MyOrdersPage = () => {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [activeTab, setActiveTab] = useState('buyer'); // 'buyer' or 'seller'
    const [filterStatus, setFilterStatus] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const statuses = { all: '全部', to_pay: '待付款', to_ship: '待发货', to_receive: '待收货', completed: '已完成', cancelled: '已取消' };

    const fetchOrders = useCallback(async () => {
        if (!user) {
            setIsLoading(false); // 用户未登录，停止加载状态
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.get('/api/orders', {
                params: {
                    role: activeTab, // ✅ 确保这里传递的是正确的 activeTab
                    status: filterStatus !== 'all' ? filterStatus : undefined,
                }
            });
            // console.log("Fetched orders for role:", activeTab, response.data); // 调试输出
            setOrders(response.data);
        } catch (err) {
            setError('加载订单失败，请稍后重试。');
            console.error("Error fetching orders:", err);
        } finally {
            setIsLoading(false);
        }
    }, [user, activeTab, filterStatus]); // 依赖项包含所有会影响查询的变量

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);
    
    const handleTabClick = (tab) => {
        setActiveTab(tab);
        setFilterStatus('all'); // 切换标签时重置状态筛选
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">我的订单</h2>
            
            <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => handleTabClick('buyer')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'buyer' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        我买到的
                    </button>
                    <button
                        onClick={() => handleTabClick('seller')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'seller' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        我卖出的
                    </button>
                </nav>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
                {Object.entries(statuses).map(([key, value]) => (
                    <button key={key} onClick={() => setFilterStatus(key)} 
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === key ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                        {value}
                    </button>
                ))}
            </div>

            {isLoading ? <p className="text-center py-10">加载订单中...</p> : error ? <p className="text-center text-red-500 py-10">{error}</p> : (
                orders.length > 0 ? (
                    <div className="space-y-4">
                        {/* ✅ 确保 OrderCard 接收到正确的 role prop */}
                        {orders.map(order => <OrderCard key={order.id} order={order} role={activeTab} onUpdate={fetchOrders} />)}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 mt-10">这里空空如也~</p>
                )
            )}
        </div>
    );
};

export default MyOrdersPage;