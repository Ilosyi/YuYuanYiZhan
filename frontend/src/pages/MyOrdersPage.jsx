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
    if (rawType === 'errand') return 'errand';
    return rawType || 'sale';
};

const MyOrdersPage = ({ currentUser, onNavigate = () => {} }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [orders, setOrders] = useState([]);
    const [activeTab, setActiveTab] = useState('buyer'); // 'buyer' | 'seller' | 'runner'
    const [filterStatus, setFilterStatus] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const orderStatuses = { all: '全部', to_pay: '待付款', to_ship: '待发货', to_receive: '待收货', completed: '已完成', cancelled: '已取消' };
    const errandStatuses = { all: '全部', available: '待接单', in_progress: '进行中', completed: '已完成' };
    const statusOptions = activeTab === 'runner' ? errandStatuses : orderStatuses;

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
                    role: activeTab, // ✅ buyer / seller / runner
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

    const errandStatusText = { available: '待接单', in_progress: '进行中', completed: '已完成' };
    const errandStatusColor = { available: 'bg-yellow-100 text-yellow-800', in_progress: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800' };

    const handleContact = useCallback((order, roleKey) => {
        if (!user) {
            toast.info('请先登录后再联系对方。');
            return;
        }
        if (!order) {
            toast.error('暂时无法处理该订单。');
            return;
        }

        let counterpartId;
        let counterpartName;
        if (roleKey === 'buyer') {
            counterpartId = order.seller_id;
            counterpartName = order.seller_name;
        } else if (roleKey === 'seller') {
            counterpartId = order.buyer_id;
            counterpartName = order.buyer_name;
        } else {
            counterpartId = order.seller_id;
            counterpartName = order.seller_name;
        }

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
                        source: roleKey === 'runner' ? 'errands' : 'orders',
                    },
                })
            );
        } catch (storageError) {
            console.warn('无法记录待跳转的会话。', storageError);
        }

        onNavigate('messages');
    }, [user, onNavigate]);

    const handleViewErrandDetail = useCallback((order) => {
        if (!order?.listing_id) return;
        try {
            window.localStorage.setItem(
                'yy_pending_listing_detail',
                JSON.stringify({ listingId: order.listing_id, listingType: 'errand' })
            );
        } catch (storageError) {
            console.warn('无法记录待查看的跑腿详情。', storageError);
        }
        onNavigate('home');
    }, [onNavigate]);

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
                    <button
                        onClick={() => handleTabClick('runner')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'runner' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        我的接单
                    </button>
                </nav>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
                {Object.entries(statusOptions).map(([key, value]) => (
                    <button key={key} onClick={() => setFilterStatus(key)} 
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === key ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {value}
                    </button>
                ))}
            </div>

            {isLoading ? <p className="text-center py-10">加载订单中...</p> : error ? <p className="text-center text-red-500 py-10">{error}</p> : (
                orders.length > 0 ? (
                    <div className="space-y-4">
                        {/* ✅ 根据不同角色渲染对应卡片 */}
                        {orders.map(order => {
                            if (activeTab === 'runner') {
                                const listingTypeKey = deriveListingTypeKey(order.listing_type);
                                const resolvedImage = resolveAssetUrl(order.listing_image_url);
                                const imageUrl = resolvedImage || getDefaultListingImage(listingTypeKey) || FALLBACK_IMAGE;
                                return (
                                    <div key={order.id || order.listing_id} className="bg-white rounded-lg shadow-md p-4 flex flex-col gap-3">
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <img src={imageUrl} alt={order.listing_title} className="w-full md:w-32 h-32 object-cover rounded-md" />
                                            <div className="flex-1 flex flex-col justify-between">
                                                <div>
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="text-lg font-semibold text-gray-800">{order.listing_title}</h3>
                                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${errandStatusColor[order.status] || 'bg-gray-100 text-gray-600'}`}>
                                                            {errandStatusText[order.status] || '处理中'}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-500 mt-1">发单人：{order.seller_name}</p>
                                                    <p className="text-sm text-gray-500">酬劳：¥{Number(order.price || 0).toLocaleString()}</p>
                                                    {(order.start_location || order.end_location) && (
                                                        <p className="text-xs text-gray-500 mt-1">路线：{[order.start_location, order.end_location].filter(Boolean).join(' → ')}</p>
                                                    )}
                                                    {order.errand_private_note && (
                                                        <div className="mt-3 bg-rose-50 border border-rose-100 rounded-md p-3 text-sm text-rose-700">
                                                            <div className="font-medium">隐私备注</div>
                                                            <p className="mt-1 whitespace-pre-line">{order.errand_private_note}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap justify-between items-center gap-3">
                                            <div className="text-xs text-gray-500">
                                                {order.errand_accept_at && <span className="mr-3">接单：{new Date(order.errand_accept_at).toLocaleString()}</span>}
                                                {order.errand_completion_at && <span>完成：{new Date(order.errand_completion_at).toLocaleString()}</span>}
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleViewErrandDetail(order)}
                                                    className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                                                    type="button"
                                                >
                                                    查看详情
                                                </button>
                                                <button
                                                    onClick={() => handleContact(order, 'runner')}
                                                    className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                                                    type="button"
                                                >
                                                    联系发单人
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    role={activeTab}
                                    onUpdate={fetchOrders}
                                    onContact={handleContact}
                                />
                            );
                        })}
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