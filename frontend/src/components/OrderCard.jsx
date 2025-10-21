// frontend/src/components/OrderCard.jsx
// [请用此版本完全替换]
import React from 'react';
import api, { resolveAssetUrl } from '../api';
import { getDefaultListingImage, FALLBACK_IMAGE } from '../constants/defaultImages';

const deriveListingTypeKey = (rawType) => {
    if (!rawType) return 'sale';
    if (rawType === 'lost' || rawType === 'found' || rawType === 'lostfound') return 'lostfound';
    if (rawType === 'help') return 'help';
    if (rawType === 'acquire') return 'acquire';
    return rawType || 'sale';
};

const OrderCard = ({ order, role, onUpdate, onContact = () => {} }) => {
    // ✅ isBuyer 变量直接来自 props.role，确保它与 MyOrdersPage 中的 activeTab 保持一致
    const isBuyer = role === 'buyer'; 

    const statusText = { to_pay: '待付款', to_ship: '待发货', to_receive: '待收货', completed: '已完成', cancelled: '已取消' };
    const statusColor = { to_pay: 'bg-red-100 text-red-800', to_ship: 'bg-orange-100 text-orange-800', to_receive: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800', cancelled: 'bg-gray-100 text-gray-800' };
    const listingTypeKey = deriveListingTypeKey(order.listing_type);
    const resolvedImage = resolveAssetUrl(order.listing_image_url);
    const imageUrl = resolvedImage || getDefaultListingImage(listingTypeKey) || FALLBACK_IMAGE;

    const handleUpdateStatus = async (newStatus) => {
        const actionText = {
            to_ship: '模拟支付成功！卖家将为您发货。',
            to_receive: '确定要标记为“已发货”吗？',
            completed: '确定您已收到商品吗？此操作不可逆。',
            cancelled: '确定要取消这个订单吗？'
        }[newStatus];

        if (!window.confirm(actionText)) return;

        try {
            await api.put(`/api/orders/${order.id}/status`, { newStatus });
            alert('操作成功！');
            onUpdate(); // 通知父组件刷新列表
        } catch (error) {
            alert(error.response?.data?.message || '操作失败，请刷新后重试。');
            console.error(error);
        }
    };
    
    const renderActionButtons = () => {
        if (order.status === 'completed' || order.status === 'cancelled') {
            return null; // 完成或取消的订单没有操作按钮
        }

        if (isBuyer) { // 作为买家
            switch (order.status) {
                case 'to_pay':
                    return (
                        <>
                            <button onClick={() => handleUpdateStatus('to_ship')} className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">去支付</button>
                            <button onClick={() => handleUpdateStatus('cancelled')} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">取消订单</button>
                        </>
                    );
                case 'to_receive':
                    return <button onClick={() => handleUpdateStatus('completed')} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">确认收货</button>;
                default:
                    return null;
            }
        } else { // 作为卖家
            switch (order.status) {
                case 'to_pay': // 卖家也可以取消待付款订单
                     return <button onClick={() => handleUpdateStatus('cancelled')} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">取消订单</button>;
                case 'to_ship':
                    return <button onClick={() => handleUpdateStatus('to_receive')} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">我已发货</button>;
                default:
                    return null;
            }
        }
    };

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
                        {/* ✅ 根据 isBuyer 显示正确的买家/卖家信息 */}
                        {isBuyer ? `卖家: ${order.seller_name}` : `买家: ${order.buyer_name}`}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">订单号: {order.id}</p>
                </div>
                <div className="flex justify-between items-end mt-4">
                    <p className="text-xl font-bold text-indigo-600">¥{order.price}</p>
                    <div className="flex space-x-2">
                        {renderActionButtons()}
                        {/* 仅在订单未完成/未取消时显示“联系对方”按钮 */}
                        {order.status !== 'completed' && order.status !== 'cancelled' && (
                           <button
                                onClick={() => onContact(order, role)}
                                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                           >
                                联系对方
                           </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderCard;