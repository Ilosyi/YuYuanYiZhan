import React, { useState, useEffect, useCallback } from 'react';
import api, { resolveAssetUrl } from '../api';
import { getModuleTheme } from '../constants/moduleThemes';

// 地点选项常量
const LOCATION_OPTIONS = [
    { value: 'qinyuan', label: '沁苑' },
    { value: 'yunyuan', label: '韵苑' },
    { value: 'zisong', label: '紫菘' },
    // 新增固定地点（直接以中文作为值，便于展示与后端筛选）
    { value: '西区宿舍', label: '西区宿舍' },
    { value: '博士公寓', label: '博士公寓' },
    { value: '南大门', label: '南大门' },
    { value: '南二门', label: '南二门' },
    { value: '南三门', label: '南三门' },
    { value: '南四门', label: '南四门' },
    { value: '生活门', label: '生活门' },
    { value: '东大门', label: '东大门' },
    { value: '紫菘门', label: '紫菘门' },
    { value: 'other', label: '其他 (请自填)' }
];

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
    // 修改CATEGORY_OPTIONS中的物品分类键名
    lostfound: {
        types: [
            { value: 'lost', label: '寻物启事' },
            { value: 'found', label: '失物招领' },
        ],
        items: [
            { value: 'campusIdCard', label: '校园卡' },  // 去掉下划线
            { value: 'studentIdCard', label: '学生证' },    // 去掉下划线
            { value: 'textbook', label: '教材' },
            { value: 'bag', label: '书包' },
            { value: 'other', label: '其他' },
        ]
    },
};

const getDefaultCategory = (type) => {
    if (type === 'lostfound') {
        // 失物招领默认值格式: "类型_物品"，默认为寻物_其他
        return 'lost_other';
    }
    const options = CATEGORY_OPTIONS[type] || [];
    return options[0]?.value || '';
};

const PostModal = ({ isOpen, onClose, editingItem, onSaveSuccess }) => {
    // 修改 getInitialState 函数，使用下划线命名法与后端保持一致
    // 修改getInitialState函数，统一使用驼峰命名
    const getInitialState = useCallback(() => {
        const initialType = editingItem?.type || 'sale';
        const initialCategory = editingItem?.category || getDefaultCategory(initialType);
        
        // 解析失物招领的分类信息
        let lostFoundType = '';
        let lostFoundItem = '';
        if (initialType === 'lostfound' && initialCategory.includes('_')) {
            const [type, item] = initialCategory.split('_');
            lostFoundType = type || 'lost';
            lostFoundItem = item || 'other';
        }
        
        // 4. 修改 getInitialState 函数，移除不必要的自定义地点字段
        return {
            type: initialType,
            title: editingItem?.title || '',
            description: editingItem?.description || '',
            price: editingItem?.price || '',
            category: initialCategory,
            lostFoundType,
            lostFoundItem,
            // 只保留必要的地点字段
            startLocation: editingItem?.start_location || '',
            endLocation: editingItem?.end_location || ''
            // 移除自定义地点字段
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
            // 在获取帖子详情后添加地点信息的映射
            api.get(`/api/listings/${editingItem.id}/detail`)
                .then(({ data }) => {
                    if (cancelled) return;
                    const listing = data?.listing;
                    if (!listing) {
                        setExistingImages([]);
                        return;
                    }
                    // 加载图片信息...
                    
                    // 添加地点信息的映射 - 下划线命名法转驼峰命名法
                    setFormData(prev => ({
                        ...prev,
                        // 将数据库中的下划线命名字段映射到表单的驼峰命名状态
                        startLocation: listing.start_location || '',
                        endLocation: listing.end_location || '',
                        // 如果地点是自定义地点，需要设置相应的字段
                        customStartLocation: ['qinyuan', 'yunyuan', 'zisong'].includes(listing.start_location) ? '' : listing.start_location || '',
                        customEndLocation: ['qinyuan', 'yunyuan', 'zisong'].includes(listing.end_location) ? '' : listing.end_location || ''
                    }));
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

    // 修改表单字段更新函数，确保使用正确的字段名
    // 修改handleInputChange函数中类型变化时的重置逻辑
    const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // 特殊处理类型变化时重置相关字段
    if (name === 'type') {
    setFormData(prev => ({
    ...prev,
    [name]: value,
    category: getDefaultCategory(value),
    lostFoundType: '',
    lostFoundItem: '',
    // 简化地点字段重置
    startLocation: '',
    endLocation: ''
    // 移除自定义地点字段
    }));
    return;
    }
    
    // 其他代码保持不变
    if ((name === 'lostFoundType' || name === 'lostFoundItem') && formData.type === 'lostfound') {
        // 当失物招领类型或物品变化时，更新category字段为"类型_物品"格式
        const type = name === 'lostFoundType' ? value : formData.lostFoundType || 'lost';
        const item = name === 'lostFoundItem' ? value : formData.lostFoundItem || 'other';
        setFormData(prev => ({
            ...prev,
            [name]: value,
            category: `${type}_${item}`
        }));
        return;
    }
    
    // 特殊处理分类变化时重置相关字段
    if (name === 'category') {
        // 失物招领的分类有特殊格式
        if (formData.type === 'lostfound') {
            const [type, item] = value.split('_');
            setFormData(prev => ({
                ...prev,
                category: value,
                // 使用正确的驼峰命名
                ...(!['service'].includes(value) && {
                    startLocation: '',
                    endLocation: ''
                })
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                category: value,
                // 非跑腿服务分类时重置地点信息
                ...(!['service'].includes(value) && {
                    startLocation: '',
                    endLocation: '',
                    customStartLocation: '',
                    customEndLocation: ''
                })
            }));
        }
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

    // 确保 handleSubmit 函数正确处理地点字段
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        
        // 使用 FormData 来发送包含文件的表单
        const submissionData = new FormData();
        
        // 处理普通字段（跳过错误的蛇形命名地点键，防止重复字段导致数组值）
        Object.entries(formData).forEach(([key, value]) => {
            if (value === null || value === undefined || key === 'image') {
                return;
            }
            if (key === 'start_location' || key === 'end_location') {
                return;
            }
        
            if (key === 'price' && !(formData.type === 'sale' || formData.type === 'acquire')) {
                return; // 非交易类帖子不需要价格
            }
            
            // 保留普通字段
            submissionData.append(key, value);
        });
        
        // 添加地点字段的映射 - 驼峰命名法转下划线命名法
        // 将“其他”替换为自定义输入值
        let startLoc = formData.startLocation;
        if (startLoc === 'other') {
            startLoc = (formData.customStartLocation || '').trim();
        }
        if (startLoc) {
            submissionData.append('start_location', startLoc);
        }
        let endLoc = formData.endLocation;
        if (endLoc === 'other') {
            endLoc = (formData.customEndLocation || '').trim();
        }
        if (endLoc) {
            submissionData.append('end_location', endLoc);
        }
    
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
    
    // 根据类型和分类决定是否显示地点字段
    const showLocationFields = formData.type === 'sale' || formData.type === 'acquire' ? formData.category === 'service' : false;

    const theme = getModuleTheme(formData.type);

    // 在返回的JSX中修改表单容器的类名
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className={`${theme.headerBg} ${theme.headerText} px-6 py-4 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{theme.icon}</span>
                        <h3 className="text-lg font-semibold">{theme.title}</h3>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">×</button>
                </div>

                {/* 修改表单容器，添加滚动功能 */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(92vh-150px)]">
                    {/* type / category quick pill */}
                    <div className="mb-5 flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded-full border ${theme.accentPill} ${theme.accentBorder}`}>类型</span>
                        <select name="type" value={formData.type} onChange={handleInputChange} className={`px-3 py-2 border rounded-md ${theme.inputFocus}`}>
                            <option value="sale">出售商品</option>
                            <option value="acquire">收购需求</option>
                            <option value="help">帮帮忙</option>
                            <option value="lostfound">失物招领</option>
                        </select>
                        
                        {formData.type === 'lostfound' ? (
                            <>
                                <span className={`ml-3 px-2 py-1 text-xs rounded-full border ${theme.accentPill} ${theme.accentBorder}`}>信息类型</span>
                                <select
                                    name="lostFoundType"
                                    value={formData.lostFoundType}
                                    onChange={handleInputChange}
                                    className={`px-3 py-2 border rounded-md ${theme.inputFocus}`}
                                >
                                    {CATEGORY_OPTIONS.lostfound.types.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <span className={`ml-3 px-2 py-1 text-xs rounded-full border ${theme.accentPill} ${theme.accentBorder}`}>物品分类</span>
                                <select
                                    name="lostFoundItem"
                                    value={formData.lostFoundItem}
                                    onChange={handleInputChange}
                                    className={`px-3 py-2 border rounded-md ${theme.inputFocus}`}
                                >
                                    {CATEGORY_OPTIONS.lostfound.items.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </>
                        ) : (
                            <>
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
                            </>
                        )}
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
                        {/* 添加地点字段 */}
                        {showLocationFields && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">出发地点*</label>
                                    <div className="mt-1">
                                        <select
                                            name="startLocation"
                                            value={formData.startLocation}
                                            onChange={handleInputChange}
                                            className={`w-full px-3 py-2 border rounded-md ${theme.inputFocus}`}
                                        >
                                            <option value="">请选择出发地点</option>
                                            {LOCATION_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                        {formData.startLocation === 'other' && (
                                            <input
                                                type="text"
                                                name="customStartLocation"
                                                value={formData.customStartLocation}
                                                onChange={handleInputChange}
                                                placeholder="请输入自定义出发地点"
                                                required
                                                className={`w-full mt-2 px-3 py-2 border rounded-md ${theme.inputFocus}`}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">目的地点*</label>
                                    <div className="mt-1">
                                        <select
                                            name="endLocation"
                                            value={formData.endLocation}
                                            onChange={handleInputChange}
                                            className={`w-full px-3 py-2 border rounded-md ${theme.inputFocus}`}
                                        >
                                            <option value="">请选择目的地点</option>
                                            {LOCATION_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                        {formData.endLocation === 'other' && (
                                            <input
                                                type="text"
                                                name="customEndLocation"
                                                value={formData.customEndLocation}
                                                onChange={handleInputChange}
                                                placeholder="请输入自定义目的地点"
                                                required
                                                className={`w-full mt-2 px-3 py-2 border rounded-md ${theme.inputFocus}`}
                                            />
                                        )}
                                    </div>
                                </div>
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