// frontend/src/components/MyListingCard.jsx
import React from 'react';
import { resolveAssetUrl } from '../api';
import { getDefaultListingImage, FALLBACK_IMAGE } from '../constants/defaultImages';

const variantClasses = (variant, disabled) => {
    if (disabled) {
        return 'bg-gray-200 text-gray-500 cursor-not-allowed';
    }
    switch (variant) {
        case 'view':
            return 'border border-gray-300 text-gray-700 hover:bg-gray-50';
        case 'delete':
            return 'bg-red-500 text-white hover:bg-red-600';
        case 'success':
            return 'bg-emerald-600 text-white hover:bg-emerald-500';
        case 'primary':
            return 'bg-indigo-600 text-white hover:bg-indigo-700';
        case 'edit':
        default:
            return 'bg-yellow-500 text-white hover:bg-yellow-600';
    }
};

const MyListingCard = ({
    item,
    onEdit,
    onDelete,
    onView,
    extraActions = [],
    canEdit = true,
    canDelete = true,
}) => {
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
    const defaultImage = resolveAssetUrl(getDefaultListingImage(item.type));
    const imageUrl = resolvedImage || defaultImage || FALLBACK_IMAGE;
    const hasMultipleImages = Number(item.images_count || item.image_count || 0) > 1;

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
            <div className="relative h-40 bg-gray-200">
                <img
                    src={imageUrl}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = FALLBACK_IMAGE;
                    }}
                />
                {hasMultipleImages && (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 text-xs bg-black/60 text-white rounded-full">多图</span>
                )}
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
                <div className="mt-4 flex flex-wrap gap-2">
                    {onView && (
                        <button
                            onClick={onView}
                            className={`min-w-[120px] px-3 py-2 text-sm rounded ${variantClasses('view', false)}`}
                            type="button"
                        >
                            查看详情
                        </button>
                    )}
                    {extraActions.map(({ key, label, onClick, disabled = false, variant = 'primary' }) => (
                        <button
                            key={key || label}
                            onClick={onClick}
                            disabled={disabled}
                            className={`min-w-[120px] px-3 py-2 text-sm rounded ${variantClasses(variant, disabled)}`}
                            type="button"
                        >
                            {label}
                        </button>
                    ))}
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            disabled={!canEdit}
                            className={`min-w-[120px] px-3 py-2 text-sm rounded ${variantClasses('edit', !canEdit)}`}
                            type="button"
                        >
                            编辑
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={onDelete}
                            disabled={!canDelete}
                            className={`min-w-[120px] px-3 py-2 text-sm rounded ${variantClasses('delete', !canDelete)}`}
                            type="button"
                        >
                            删除
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MyListingCard;


