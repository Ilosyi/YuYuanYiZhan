// frontend/src/pages/MyOrdersPage.jsx
// [请用此版本完全替换]
import React, { useState, useEffect, useCallback } from 'react';
import api, { resolveAssetUrl } from '../api';
import { useAuth } from '../context/AuthContext';
import OrderCard from '../components/OrderCard';
import { useToast } from '../context/ToastContext';
import { getDefaultListingImage, FALLBACK_IMAGE } from '../constants/defaultImages';

const deriveListingTypeKey = (rawType) => {
    if (!rawType) return 'sale';
    if (rawType === 'lost' || rawType === 'found' || rawType === 'lostfound') return 'lostfound';
    if (rawType === 'help') return 'help';
    if (rawType === 'acquire') return 'acquire';
    return rawType || 'sale';
};

const MyOrdersPage = ({ currentUser, onNavigate = () => {} }) => {
    const { user } = useAuth();
    const toast = useToast();
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

    const handleContact = useCallback((order, roleKey) => {
        if (!user) {
            toast.info('请先登录后再联系对方。');
            return;
        }
        if (!order) {
            toast.error('暂时无法处理该订单。');
            return;
        }

        const counterpartId = roleKey === 'buyer' ? order.seller_id : order.buyer_id;
        const counterpartName = roleKey === 'buyer' ? order.seller_name : order.buyer_name;

        if (!counterpartId) {
            toast.error('无法获取对方信息。');
            return;
        }
        if (counterpartId === user.id) {
            toast.info('这是您自己的订单记录。');
            return;
        }

        const listingTypeKey = deriveListingTypeKey(order.listing_type);
        const imageUrl = resolveAssetUrl(order.listing_image_url) || getDefaultListingImage(listingTypeKey) || FALLBACK_IMAGE;

        try {
            window.localStorage.setItem(
                'yy_pending_chat',
                JSON.stringify({
                    userId: counterpartId,
                    username: counterpartName,
                    listing: {
                        id: order.listing_id,
                        type: order.listing_type || listingTypeKey,
                        title: order.listing_title,
                        price: order.price,
                        imageUrl,
                        ownerId: order.seller_id,
                        ownerName: order.seller_name,
                        source: 'orders',
                    },
                })
            );
        } catch (storageError) {
            console.warn('无法记录待跳转的会话。', storageError);
        }

        onNavigate('messages');
    }, [user, onNavigate]);

    return (
        <div className="min-h-full bg-gradient-to-b from-gray-50 to-white">
            {/* Header */}
            <div className="mb-6 bg-white rounded-xl shadow p-5">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <span>🧾</span>
                    我的订单
                </h2>
                <p className="mt-1 text-sm text-gray-500">查看你买到的与卖出的订单，支持状态筛选与实时更新。</p>
            </div>

            <div className="border-b border-gray-200 mb-6 bg-white rounded-xl shadow px-4">
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
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === key ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {value}
                    </button>
                ))}
            </div>

            {isLoading ? <p className="text-center py-10">加载订单中...</p> : error ? <p className="text-center text-red-500 py-10">{error}</p> : (
                orders.length > 0 ? (
                    <div className="space-y-4">
                        {/* ✅ 确保 OrderCard 接收到正确的 role prop */}
                        {orders.map(order => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                role={activeTab}
                                onUpdate={fetchOrders}
                                onContact={handleContact}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-gray-500 mt-10">
                        <div className="text-5xl mb-3">📭</div>
                        <p>这里空空如也~</p>
                    </div>
                )
            )}
        </div>
    );
};

export default MyOrdersPage;