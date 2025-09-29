import React, { useState, useEffect, useCallback } from 'react';
import api, { resolveAssetUrl } from '../api';

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
            image: null,
        };
    }, [editingItem]);

    const [formData, setFormData] = useState(() => getInitialState());
    const [imagePreview, setImagePreview] = useState(() => {
        if (!editingItem?.image_url) return null;
        return resolveAssetUrl(editingItem.image_url);
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // 当编辑项变化时 (打开/切换模态框)，重置表单
    useEffect(() => {
        if (isOpen) {
            const initialState = getInitialState();
            setFormData(initialState);
            const preview = editingItem?.image_url
                ? resolveAssetUrl(editingItem.image_url)
                : null;
            setImagePreview(preview);
            setError('');
        }
    }, [isOpen, editingItem, getInitialState]);

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

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData(prev => ({ ...prev, image: file }));
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        
        // 使用 FormData 来发送包含文件的表单
        const submissionData = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
            if (value === null || value === undefined) {
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
        
        // 如果是编辑，且没有上传新图片，把现有图片URL传回去
        if (editingItem && !formData.image) {
            submissionData.append('existingImageUrl', editingItem.image_url);
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-lg w-full max-h-screen overflow-y-auto">
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold">{editingItem ? '编辑' : '发布'}内容</h3>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
                    </div>

                    {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}
                    
                    <div className="space-y-4">
                        {/* 字段... */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700">类型*</label>
                            <select name="type" value={formData.type} onChange={handleInputChange} className="w-full mt-1 p-2 border rounded-md">
                                <option value="sale">出售商品</option>
                                <option value="acquire">收购需求</option>
                                <option value="help">帮帮忙</option>
                                <option value="lostfound">失物招领</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">标题*</label>
                            <input type="text" name="title" value={formData.title} onChange={handleInputChange} required className="w-full mt-1 p-2 border rounded-md" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">详细内容*</label>
                            <textarea name="description" value={formData.description} onChange={handleInputChange} required rows="4" className="w-full mt-1 p-2 border rounded-md"></textarea>
                        </div>
                        {showPriceField && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">价格* (元)</label>
                                <input type="number" name="price" value={formData.price} onChange={handleInputChange} required min="0" step="0.01" className="w-full mt-1 p-2 border rounded-md" />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700">分类</label>
                            <select
                                name="category"
                                value={formData.category}
                                onChange={handleInputChange}
                                className="w-full mt-1 p-2 border rounded-md"
                            >
                                {(CATEGORY_OPTIONS[formData.type] || []).map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">图片</label>
                            <input type="file" name="image" onChange={handleImageChange} accept="image/*" className="w-full mt-1 text-sm" />
                            {imagePreview && <img src={imagePreview} alt="Preview" className="mt-2 rounded-md max-h-40" />}
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-100">取消</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                            {isLoading ? '保存中...' : '确认发布'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PostModal;