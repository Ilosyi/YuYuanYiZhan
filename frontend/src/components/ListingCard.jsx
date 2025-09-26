import React from 'react';

const API_BASE_URL = 'http://localhost:3000';

const ListingCard = ({ item, onPurchase, onContact }) => {
    const statusText = { available: '上架中', in_progress: '交易中', completed: '已售出' };
    const statusColor = { available: 'bg-green-100 text-green-800', in_progress: 'bg-yellow-100 text-yellow-800', completed: 'bg-gray-100 text-gray-800' };

    const formattedPrice = `¥${Number(item.price).toLocaleString()}`;
    const imageUrl = item.image_url?.startsWith('http') ? item.image_url : `${API_BASE_URL}${item.image_url}`;

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 flex flex-col">
            <div className="h-48 w-full bg-gray-200 overflow-hidden">
                <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src='https://via.placeholder.com/400x300?text=Image+Error' }}/>
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
                    {item.price > 0 && (
                        <div className="flex justify-between items-center">
                            <span className="text-xl font-bold text-indigo-600">{formattedPrice}</span>
                            {item.status === 'available' ? (
                                <div className="flex space-x-2">
                                    {item.type === 'sale' && <button onClick={() => onPurchase(item)} className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">立即购买</button>}
                                    <button onClick={() => onContact(item)} className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">联系对方</button>
                                </div>
                            ) : (
                                <div className="px-3 py-1 bg-gray-200 text-gray-500 text-sm rounded-md">{statusText[item.status]}</div>
                            )}
                        </div>
                    )}
                    {item.price === 0 && item.type !== 'sale' && item.type !== 'acquire' && (
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