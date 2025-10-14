import React, { useState, useEffect, useCallback } from 'react';
import api, { resolveAssetUrl } from '../api';
import { getModuleTheme } from '../constants/moduleThemes';

const CATEGORY_OPTIONS = {
    sale: [
        { value: 'electronics', label: '电子产品' },
        { value: 'books', label: '图书教材' },
        { value: 'clothing', label: '服饰鞋包' },
        { value: 'life', label: '生活用品' },
        { value: 'service', label: '跑腿服务' },
        { value: 'others', label: '其他' },
    ],
    acquire: [
        { value: 'electronics', label: '电子产品' },
        { value: 'books', label: '图书教材' },
        { value: 'clothing', label: '服饰鞋包' },
        { value: 'life', label: '生活用品' },
        { value: 'service', label: '跑腿服务' },
        { value: 'others', label: '其他' },
    ],
    help: [
        { value: 'study', label: '学习求助' },
        { value: 'life', label: '生活求助' },
        { value: 'tech', label: '技术求助' },
        { value: 'others', label: '其他' },
    ],
    lostfound: [
        { value: 'lost', label: '寻物启事' },
        { value: 'found', label: '失物招领' },
    ],
};

const getDefaultCategory = (type) => {
    const options = CATEGORY_OPTIONS[type] || [];
    return options[0]?.value || '';
};

const PostModal = ({ isOpen, onClose, editingItem, onSaveSuccess }) => {
    const getInitialState = useCallback(() => {
        const initialType = editingItem?.type || 'sale';
        return {
            type: initialType,
            title: editingItem?.title || '',
            description: editingItem?.description || '',
            price: editingItem?.price || '',
            category: editingItem?.category || getDefaultCategory(initialType),
        };
    }, [editingItem]);

    const [formData, setFormData] = useState(() => getInitialState());
    const [existingImages, setExistingImages] = useState([]);
    const [newImages, setNewImages] = useState([]);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const MAX_IMAGE_COUNT = 10;

    const resetNewImages = useCallback(() => {
        setNewImages(prev => {
            prev.forEach(item => {
                if (item?.preview) {
                    URL.revokeObjectURL(item.preview);
                }
            });
            return [];
        });
    }, []);

    // 当编辑项变化时 (打开/切换模态框)，重置表单并加载已有图片
    useEffect(() => {
        let cancelled = false;

        if (!isOpen) {
            resetNewImages();
            setExistingImages([]);
            return () => {
                cancelled = true;
            };
        }

        const initialState = getInitialState();
        setFormData(initialState);
        setError('');
        resetNewImages();
        setExistingImages([]);

        if (editingItem?.id) {
            setIsDetailLoading(true);
            api.get(`/api/listings/${editingItem.id}/detail`)
                .then(({ data }) => {
                    if (cancelled) return;
                    const listing = data?.listing;
                    if (!listing) {
                        setExistingImages([]);
                        return;
                    }
                    if (Array.isArray(listing.images) && listing.images.length > 0) {
                        setExistingImages(
                            listing.images
                                .filter((image) => image.image_url)
                                .map((image) => ({
                                    id: image.id ?? null,
                                    rawUrl: image.image_url,
                                }))
                        );
                    } else if (listing.image_url) {
                        setExistingImages([{ id: null, rawUrl: listing.image_url }]);
                    } else {
                        setExistingImages([]);
                    }
                })
                .catch((err) => {
                    console.error('加载帖子详情失败:', err);
                    if (!cancelled) {
                        setExistingImages([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setIsDetailLoading(false);
                    }
                });
        } else {
            setIsDetailLoading(false);
        }

        return () => {
            cancelled = true;
        };
    }, [isOpen, editingItem, getInitialState, resetNewImages]);

    useEffect(() => () => {
        resetNewImages();
    }, [resetNewImages]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;

        if (name === 'type') {
            setFormData(prev => ({
                ...prev,
                type: value,
                category: getDefaultCategory(value),
                price: value === 'sale' || value === 'acquire' ? prev.price : '',
            }));
            return;
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageChange = useCallback((event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) {
            return;
        }

        const availableSlots = MAX_IMAGE_COUNT - existingImages.length - newImages.length;
        if (availableSlots <= 0) {
            alert(`最多上传 ${MAX_IMAGE_COUNT} 张图片`);
            event.target.value = '';
            return;
        }

        const selectedFiles = files.slice(0, availableSlots);
        const mapped = selectedFiles.map((file) => ({
            file,
            preview: URL.createObjectURL(file),
        }));

        setNewImages(prev => [...prev, ...mapped]);

        if (selectedFiles.length < files.length) {
            alert(`已达到最多 ${MAX_IMAGE_COUNT} 张图片限制，部分图片未添加。`);
        }

        event.target.value = '';
    }, [existingImages.length, newImages.length, MAX_IMAGE_COUNT]);

    const handleRemoveExistingImage = useCallback((index) => {
        setExistingImages(prev => prev.filter((_, idx) => idx !== index));
    }, []);

    const handleRemoveNewImage = useCallback((index) => {
        setNewImages(prev => {
            const next = [...prev];
            const [removed] = next.splice(index, 1);
            if (removed?.preview) {
                URL.revokeObjectURL(removed.preview);
            }
            return next;
        });
    }, []);

    const totalImages = existingImages.length + newImages.length;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        
        // 使用 FormData 来发送包含文件的表单
        const submissionData = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
            if (value === null || value === undefined || key === 'image') {
                return;
            }

            if (key === 'price' && !(formData.type === 'sale' || formData.type === 'acquire')) {
                return; // 非交易类帖子不需要价格
            }

            submissionData.append(key, value);
        });

        if (!(formData.type === 'sale' || formData.type === 'acquire')) {
            submissionData.append('price', 0);
        }

        newImages.forEach(({ file }) => {
            submissionData.append('images', file);
        });

        if (editingItem) {
            const keepIds = existingImages
                .map((image) => image.id)
                .filter((id) => Number.isInteger(id));
            submissionData.append('keepImageIds', JSON.stringify(keepIds));

            if (!keepIds.length && existingImages.length > 0 && existingImages[0].rawUrl) {
                submissionData.append('existingImageUrl', existingImages[0].rawUrl);
            }
        }

        try {
            if (editingItem) {
                // 编辑模式
                await api.put(`/api/listings/${editingItem.id}`, submissionData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            } else {
                // 发布模式
                await api.post('/api/listings', submissionData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            }
            resetNewImages();
            onSaveSuccess(); // 通知父组件刷新
            onClose(); // 关闭模态框
        } catch (err) {
            setError(err.response?.data?.message || '操作失败，请重试');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    // 根据类型决定是否显示价格字段
    const showPriceField = formData.type === 'sale' || formData.type === 'acquire';

    const theme = getModuleTheme(formData.type);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden">
                {/* Header */}
                <div className={`${theme.headerBg} ${theme.headerText} px-6 py-4 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{theme.icon}</span>
                        <h3 className="text-lg font-semibold">{theme.title}</h3>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">×</button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    {/* type / category quick pill */}
                    <div className="mb-5 flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded-full border ${theme.accentPill} ${theme.accentBorder}`}>类型</span>
                        <select name="type" value={formData.type} onChange={handleInputChange} className={`px-3 py-2 border rounded-md ${theme.inputFocus}`}>
                            <option value="sale">出售商品</option>
                            <option value="acquire">收购需求</option>
                            <option value="help">帮帮忙</option>
                            <option value="lostfound">失物招领</option>
                        </select>
                        <span className={`ml-3 px-2 py-1 text-xs rounded-full border ${theme.accentPill} ${theme.accentBorder}`}>{theme.categoryLabel}</span>
                        <select
                            name="category"
                            value={formData.category}
                            onChange={handleInputChange}
                            className={`px-3 py-2 border rounded-md ${theme.inputFocus}`}
                        >
                            {(CATEGORY_OPTIONS[formData.type] || []).map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    {error && <p className="text-red-600 bg-red-50 border border-red-200 p-3 rounded-md mb-4">{error}</p>}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">标题*</label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                placeholder={theme.titlePlaceholder}
                                onChange={handleInputChange}
                                required
                                className={`w-full mt-1 px-3 py-2 border rounded-md ${theme.inputFocus}`}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">详细内容*</label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleInputChange}
                                placeholder={theme.descPlaceholder}
                                required
                                rows="4"
                                className={`w-full mt-1 px-3 py-2 border rounded-md ${theme.inputFocus}`}
                            ></textarea>
                            <p className="mt-1 text-xs text-gray-500">{theme.descHelp}</p>
                        </div>
                        {showPriceField && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{theme.priceLabel || '价格 (元)'}</label>
                                <input
                                    type="number"
                                    name="price"
                                    value={formData.price}
                                    onChange={handleInputChange}
                                    required
                                    min="0"
                                    step="0.01"
                                    className={`w-full mt-1 px-3 py-2 border rounded-md ${theme.inputFocus}`}
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700">图片</label>
                            <input
                                type="file"
                                name="images"
                                onChange={handleImageChange}
                                accept="image/*"
                                multiple
                                className={`w-full mt-1 text-sm`}
                            />
                            <p className="mt-1 text-xs text-gray-500">{theme.imageHelp} 已选择 {totalImages} 张（最多 {MAX_IMAGE_COUNT} 张）。</p>
                            {isDetailLoading ? (
                                <p className="mt-2 text-xs text-gray-400">正在加载已有图片...</p>
                            ) : (
                                (existingImages.length > 0 || newImages.length > 0) && (
                                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {existingImages.map((image, index) => (
                                            <div key={`existing-${image.id ?? index}`} className="relative group">
                                                <img
                                                    src={resolveAssetUrl(image.rawUrl)}
                                                    alt={`已上传图片 ${index + 1}`}
                                                    className="w-full h-32 object-cover rounded-lg border border-gray-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveExistingImage(index)}
                                                    className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-7 h-7 rounded-full bg-black/60 text-white text-xs"
                                                    title="删除"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                        {newImages.map((image, index) => (
                                            <div key={`new-${index}`} className="relative group">
                                                <img
                                                    src={image.preview}
                                                    alt={`待上传图片 ${index + 1}`}
                                                    className="w-full h-32 object-cover rounded-lg border border-gray-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveNewImage(index)}
                                                    className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-7 h-7 rounded-full bg-black/60 text-white text-xs"
                                                    title="删除"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-100">取消</button>
                        <button type="submit" disabled={isLoading || isDetailLoading} className={`px-4 py-2 ${theme.buttonBg} ${theme.buttonText} rounded-md disabled:opacity-60`}>
                            {isDetailLoading ? '加载图片中...' : isLoading ? '保存中...' : '确认发布'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PostModal;