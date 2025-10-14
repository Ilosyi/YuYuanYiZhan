// frontend/src/components/ListingCard.jsx
import React from 'react';
import { useAuth } from '../context/AuthContext'; // 1. 导入 useAuth hook
import { resolveAssetUrl } from '../api';
import { getDefaultListingImage, FALLBACK_IMAGE } from '../constants/defaultImages';

const ListingCard = ({ item, onPurchase, onContact, onOpenDetail, theme }) => {
    const { user } = useAuth(); // 2. 获取当前登录的用户信息

    const statusText = { available: '上架中', in_progress: '交易中', completed: '已售出' };
    const statusColor = { available: 'bg-green-100 text-green-800', in_progress: 'bg-yellow-100 text-yellow-800', completed: 'bg-gray-100 text-gray-800' };

    const numericPrice = Number(item.price ?? 0);
    const hasNumericPrice = !Number.isNaN(numericPrice);
    const hasPositivePrice = hasNumericPrice && numericPrice > 0;
    const isZeroPrice = hasNumericPrice && numericPrice === 0;
    const formattedPrice = hasNumericPrice ? `¥${numericPrice.toLocaleString()}` : '';
    const resolvedImage = resolveAssetUrl(item.image_url);
    const imageUrl = resolvedImage || getDefaultListingImage(item.type) || FALLBACK_IMAGE;
    const hasMultipleImages = Number(item.images_count || item.image_count || 0) > 1;
    const showDetailButton = Boolean(onOpenDetail);
    
    // ✅ 3. 新增检查：判断当前帖子是否由当前登录用户发布
    const isOwner = user && user.id === item.user_id;
    const isAvailable = item.status === 'available';
    const canPurchase = item.type === 'sale' && isAvailable && !isOwner && typeof onPurchase === 'function';
    const canContact = !isOwner && typeof onContact === 'function' && (
        item.type === 'acquire' || (item.type === 'sale' && isAvailable)
    );

    const handleOpenDetail = () => {
        if (onOpenDetail) {
            onOpenDetail(item);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 flex flex-col">
            <div
                className="relative h-48 w-full bg-gray-200 overflow-hidden cursor-pointer"
                onClick={handleOpenDetail}
            >
                <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src='https://via.placeholder.com/400x300?text=Image+Error' }}/>
                {hasMultipleImages && (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 text-xs bg-black/60 text-white rounded-full">
                        多图
                    </span>
                )}
            </div>
            <div className="p-4 flex flex-col flex-grow justify-between">
                <div>
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">{item.title}</h3>
                        {['sale', 'acquire'].includes(item.type) && (
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${statusColor[item.status]}`}>
                                {statusText[item.status]}
                            </span>
                        )}
                    </div>
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{item.description}</p>
                </div>
                <div className="mt-auto">
                    {hasNumericPrice && (
                        <div className="flex justify-between items-center">
                            <span className={`text-xl font-bold ${theme?.priceText || 'text-indigo-600'}`}>{formattedPrice}</span>
                            {!isAvailable && (
                                <div className="px-3 py-1 bg-gray-200 text-gray-500 text-sm rounded-md">{statusText[item.status]}</div>
                            )}
                        </div>
                    )}

                    {/* ✅ 交互按钮区 */}
                    <div className="mt-3 flex flex-wrap gap-2 justify-end">
                        {canPurchase && (
                            <button
                                onClick={() => onPurchase(item)}
                                className={`px-3 py-1 text-sm rounded-md ${theme?.buttonBg || 'bg-indigo-600 hover:bg-indigo-700'} text-white`}
                            >
                                立即购买
                            </button>
                        )}
                        {canContact && (
                            <button
                                onClick={() => onContact(item)}
                                className={`px-3 py-1 text-sm rounded-md border border-gray-300 text-gray-700 ${theme?.outlineHoverBorder || ''} ${theme?.outlineHoverText || ''}`}
                            >
                                联系对方
                            </button>
                        )}
                        {showDetailButton && (
                            <button
                                onClick={handleOpenDetail}
                                className={`px-3 py-1 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200`}
                            >
                                查看详情
                            </button>
                        )}
                    </div>

                    {/* ✅ 5. 更新 '帮帮忙' 和 '失物招领' 的联系按钮逻辑 */}
                    {!hasPositivePrice && isZeroPrice && !isOwner && typeof onContact === 'function' && !canContact && (
                        <div className="flex justify-end">
                             <button onClick={() => onContact(item)} className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">联系对方</button>
                        </div>
                    )}
                    
                    <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
                        <span>发布者: {item.user_name}</span>
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ListingCard;