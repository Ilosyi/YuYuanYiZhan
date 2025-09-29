// frontend/src/components/MyListingCard.jsx
import React from 'react';
import { resolveAssetUrl } from '../api';

const FALLBACK_IMAGE = 'https://via.placeholder.com/400x300?text=YuYuanYiZhan';

const MyListingCard = ({ item, onEdit, onDelete }) => {
    const statusText = {
        available: '上架中',
        in_progress: '交易中',
        completed: '已完成'
    };
    const statusColor = {
        available: 'bg-green-100 text-green-800',
        in_progress: 'bg-yellow-100 text-yellow-800',
        completed: 'bg-gray-100 text-gray-800'
    };
    const resolvedImage = resolveAssetUrl(item.image_url);
    const imageUrl = resolvedImage || FALLBACK_IMAGE;

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
            <div className="h-40 bg-gray-200">
                <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" />
            </div>
            <div className="p-4 flex-grow flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="text-md font-semibold text-gray-900 line-clamp-2">{item.title}</h3>
                        <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${statusColor[item.status]}`}
                        >
                            {statusText[item.status]}
                        </span>
                    </div>
                    {item.price > 0 && (
                        <p className="text-lg font-bold text-indigo-600">¥{item.price}</p>
                    )}
                </div>
                <div className="mt-4 flex space-x-2">
                    <button
                        onClick={onEdit}
                        className="flex-1 text-sm bg-yellow-500 text-white rounded px-3 py-2 hover:bg-yellow-600"
                    >
                        编辑
                    </button>
                    <button
                        onClick={onDelete}
                        className="flex-1 text-sm bg-red-500 text-white rounded px-3 py-2 hover:bg-red-600"
                    >
                        删除
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MyListingCard;


