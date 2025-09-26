import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

// 订单卡片组件
const OrderCard = ({ order, role }) => {
    const isBuyer = role === 'buyer';
    const statusText = { to_pay: '待付款', to_receive: '待收货', completed: '已完成', cancelled: '已取消' };
    const statusColor = { to_pay: 'bg-red-100 text-red-800', to_receive: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800', cancelled: 'bg-gray-100 text-gray-800' };
    const imageUrl = order.listing_image_url?.startsWith('http') ? order.listing_image_url : `${API_BASE_URL}${order.listing_image_url}`;

    return (
        <div className="bg-white rounded-lg shadow-md p-4 flex flex-col md:flex-row gap-4">
            <img src={imageUrl} alt={order.listing_title} className="w-full md:w-32 h-32 object-cover rounded-md flex-shrink-0" />
            <div className="flex-grow flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-start">
                        <h3 className="text-lg font-semibold text-gray-800">{order.listing_title}</h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColor[order.status]}`}>{statusText[order.status]}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                        {isBuyer ? `卖家: ${order.seller_id}` : `买家: ${order.buyer_id}`}
                    </p>
                </div>
                <div className="flex justify-between items-end mt-4">
                    <p className="text-xl font-bold text-indigo-600">¥{order.price}</p>
                    <div className="flex space-x-2">
                        {isBuyer && order.status === 'to_pay' && <button className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">去支付</button>}
                        {isBuyer && order.status === 'to_receive' && <button className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">确认收货</button>}
                        <button className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">联系对方</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// '我的订单' 主页面组件
const MyOrdersPage = ({ currentUser }) => {
    const [orders, setOrders] = useState([]);
    const [activeTab, setActiveTab] = useState('buyer'); // 'buyer' or 'seller'
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchOrders = async () => {
            if (!currentUser) return;
            setIsLoading(true);
            setError(null);
            try {
                const response = await axios.get(`${API_BASE_URL}/api/orders`, {
                    params: {
                        userId: currentUser.id,
                        role: activeTab,
                    }
                });
                setOrders(response.data);
            } catch (err) {
                setError('加载订单失败，请稍后重试。');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchOrders();
    }, [currentUser, activeTab]);

    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">我的订单</h2>
            
            {/* Tabs */}
            <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('buyer')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'buyer' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        我买到的
                    </button>
                    <button
                        onClick={() => setActiveTab('seller')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'seller' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        我卖出的
                    </button>
                </nav>
            </div>

            {/* Orders List */}
            {isLoading ? <p>加载中...</p> : error ? <p className="text-red-500">{error}</p> : (
                orders.length > 0 ? (
                    <div className="space-y-4">
                        {orders.map(order => <OrderCard key={order.id} order={order} role={activeTab} />)}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 mt-10">你还没有相关的订单。</p>
                )
            )}
        </div>
    );
};

export default MyOrdersPage;