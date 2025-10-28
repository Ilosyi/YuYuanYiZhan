// frontend/src/pages/HomePage.jsx
// 版本: 1.1 - 实现动态分类筛选 + 主页主题化细节
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { resolveAssetUrl } from '../api';
import { getDefaultListingImage, FALLBACK_IMAGE } from '../constants/defaultImages';
import { getModuleTheme } from '../constants/moduleThemes';
import ListingCard from '../components/ListingCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const CATEGORY_CONFIG = {
    sale: {
        all: '所有分类',
        electronics: '电子产品',
        books: '图书教材',
        beauty: '美妆护肤',
        stationery: '文具',
        lecture: '代课讲座',
        clothing: '服饰鞋包',
        life: '生活用品',
        service: '跑腿服务',
        others: '其他',
    },
    acquire: {
        all: '所有分类',
        electronics: '电子产品',
        books: '图书教材',
        beauty: '美妆护肤',
        stationery: '文具',
        lecture: '代课讲座',
        clothing: '服饰鞋包',
        life: '生活用品',
        service: '跑腿服务',
        others: '其他',
    },
    help: {
        all: '全部求助',
        study: '学习求助',
        life: '生活求助',
        tech: '技术求助',
        others: '其他',
    },
    lostfound: {
        all: '全部',
        lost: '寻物启事',
        found: '失物招领',
        // 这里保持原有结构，用于顶部筛选
    },
};

// 添加物品分类配置
// 修改LOSTFOUND_ITEM_CONFIG的键名，与PostModal.jsx保持一致
const LOSTFOUND_ITEM_CONFIG = {
    campuscard: '校园卡',      // 去掉下划线
    studentid: '学生证',       // 去掉下划线
    textbook: '教材',
    bag: '书包',
    other: '其他',
};

// 在文件顶部添加物品类型配置
const LOSTFOUND_ITEM_TYPE_CONFIG = {
    all: '所有物品',
    studentid: '学生证',
    campuscard: '校园卡',
    bag: '书包',
    textbook: '教材',
    other: '其他'
};

const MODE_TEXT = {
    sale: '出售',
    acquire: '收购',
    help: '帮帮忙',
    lostfound: '失物招领',
};

// 图书教材类型筛选（与后端存储一致，使用中文值）
const BOOK_TYPE_CONFIG = {
    all: '所有类型',
    '课内教材': '课内教材',
    '课外教材': '课外教材',
    '笔记': '笔记',
    '其他': '其他',
};

const formatDateTime = (value) => {
    if (!value) return '';
    try {
        return new Date(value).toLocaleString('zh-CN', { hour12: false });
    } catch {
        return value;
    }
};

const deriveListingTypeKey = (item, mode) => {
    if (!item && mode) return mode || 'sale';
    if (mode === 'lostfound' || item?.type === 'lost' || item?.type === 'found') {
        return 'lostfound';
    }
    return item?.type || mode || 'sale';
};

const resolveImageUrl = (value, listingType) => {
    const resolved = resolveAssetUrl(value);
    if (resolved) {
        return resolved;
    }
    return getDefaultListingImage(listingType) || FALLBACK_IMAGE;
};

const InfoCard = ({
    item,
    onOpenDetail,
    onContact,
    onToggleFavorite,
    isFavorited = false,
    isLostFound,
    mode,
    theme,
}) => {
    let badgeText = '';
    let badgeStyle = 'bg-indigo-100 text-indigo-700';
    
    // 修改InfoCard组件中的失物招领分类解析逻辑
    if (isLostFound) {
    // 修复：确保正确解析所有物品分类（移除调试日志）
    if (item.category && item.category.includes('_')) {
        const [type, itemType] = item.category.split('_');
        const itemLabel = LOSTFOUND_ITEM_CONFIG[itemType] || '其他';
        badgeText = `${type === 'found' ? '招领' : '寻物'}: ${itemLabel}`;
    } else {
        // 兼容旧数据格式
        badgeText = item.type === 'found' ? '招领' : '寻物';
    }
    
    badgeStyle = item.type === 'found'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-orange-100 text-orange-700';
    } else {
        badgeText = item.category;
    }
    const fallbackType = deriveListingTypeKey(item, mode);
    const imageUrl = resolveImageUrl(item.image_url, fallbackType);
    const hasMultipleImages = Number(item.images_count || item.image_count || 0) > 1;

    return (
        <div
            onClick={() => onOpenDetail(item)}
            className="bg-white rounded-xl shadow hover:shadow-lg transition-shadow duration-200 cursor-pointer overflow-hidden"
        >
            <div className="relative h-32 sm:h-36 md:h-44 bg-gray-100 overflow-hidden">
                <img
                    src={imageUrl}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = getDefaultListingImage(fallbackType) || FALLBACK_IMAGE;
                    }}
                />
                {hasMultipleImages && (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 text-xs bg-black/60 text-white rounded-full">多图</span>
                )}
            </div>
            <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-2">{item.title}</h3>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${badgeStyle}`}>
                        {badgeText || '其他'}
                    </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2 sm:line-clamp-3">{item.description || item.content}</p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>发布者：{item.user_name || item.owner_name}</span>
                    <span>{formatDateTime(item.created_at)}</span>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    {typeof onToggleFavorite === 'function' && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(item, !isFavorited);
                            }}
                            className={`px-3 py-1.5 text-sm rounded-md border transition-colors duration-150 ${
                                isFavorited
                                    ? 'border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100'
                                    : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                            aria-pressed={isFavorited}
                        >
                            {isFavorited ? '已收藏' : '收藏'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetail(item);
                        }}
                        className={`px-3 py-1.5 text-sm rounded-md border border-gray-200 ${theme?.outlineHoverBorder || ''} ${theme?.outlineHoverText || ''}`}
                    >
                        查看详情
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onContact(item);
                        }}
                        className={`px-3 py-1.5 text-sm rounded-md border ${theme?.accentBorder || ''} ${theme?.accentPill || ''} hover:opacity-90`}
                    >
                        联系对方
                    </button>
                </div>
            </div>
        </div>
    );
};

const HomePage = ({ onNavigate = () => {} }) => {
    const { user } = useAuth();

    const [activeMode, setActiveMode] = useState('sale');
    const [listings, setListings] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState('all');

    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [detailListing, setDetailListing] = useState(null);
    const [detailReplies, setDetailReplies] = useState([]); // 数组：[{ id, user_name, content, created_at, children: [] }]
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const [replyContent, setReplyContent] = useState('');
    const [replyingTo, setReplyingTo] = useState(null); // { parentReplyId, targetName }
    const [editingReplyId, setEditingReplyId] = useState(null);
    const [editingContent, setEditingContent] = useState('');
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [favoriteIds, setFavoriteIds] = useState(() => new Set());
    const pendingDetailRef = useRef(null);

    // 在状态定义部分添加物品类型筛选状态
    const [itemType, setItemType] = useState('all');
    
    // 在模式切换的useEffect中重置物品类型筛选
    useEffect(() => {
    setCategory('all');
    setItemType('all'); // 重置物品类型筛选
    setSearchTerm('');
    }, [activeMode]);

    const refreshFavoriteIds = useCallback(async () => {
        if (!user) {
            setFavoriteIds(() => new Set());
            return;
        }
        try {
            const { data } = await api.get('/api/users/me/favorites');
            const ids = new Set((data?.favorites || []).map((fav) => fav.id));
            setFavoriteIds(ids);
        } catch (error) {
            console.error('加载收藏列表失败:', error);
            setFavoriteIds(() => new Set());
        }
    }, [user?.id]);

    useEffect(() => {
        refreshFavoriteIds();
    }, [refreshFavoriteIds]);

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem('yy_pending_listing_detail');
            if (stored) {
                window.localStorage.removeItem('yy_pending_listing_detail');
                const parsed = JSON.parse(stored);
                if (parsed?.listingType && parsed.listingType !== activeMode) {
                    setActiveMode(parsed.listingType);
                }
                if (parsed?.listingId) {
                    pendingDetailRef.current = parsed;
                }
            }
        } catch (error) {
            console.warn('无法读取待展示的帖子详情。', error);
        }
    }, []);

    // 在LOSTFOUND_ITEM_TYPE_CONFIG之后添加地点配置
    const LOCATION_CONFIG = {
    all: '所有地点',
    qinyuan: '沁苑',
    yunyuan: '韵苑',
    zisong: '紫菘',
    '西区宿舍': '西区宿舍',
    '博士公寓': '博士公寓',
    '南大门': '南大门',
    '南二门': '南二门',
    '南三门': '南三门',
    '南四门': '南四门',
    '生活门': '生活门',
    '东大门': '东大门',
    '紫菘门': '紫菘门',
    other: '其他地点'
    };
    
    // 在状态定义部分添加起始地点和目的地点筛选状态
    const [startLocation, setStartLocation] = useState('all');
    const [endLocation, setEndLocation] = useState('all');
    // 图书教材细分筛选
    const [bookType, setBookType] = useState('all');
    const [bookMajor, setBookMajor] = useState('');
    // 代课讲座筛选
    const [lectureLocation, setLectureLocation] = useState('all');
    const [customLectureLocation, setCustomLectureLocation] = useState('');
    const [lectureStartFrom, setLectureStartFrom] = useState('');
    const [lectureEndTo, setLectureEndTo] = useState('');
    
    // 在模式切换的useEffect中重置地点筛选状态
    useEffect(() => {
    setCategory('all');
    setItemType('all'); // 重置物品类型筛选
    setStartLocation('all'); // 重置起始地点筛选
    setEndLocation('all'); // 重置目的地点筛选
    setBookType('all');
    setBookMajor('');
    setLectureLocation('all');
    setCustomLectureLocation('');
    setLectureStartFrom('');
    setLectureEndTo('');
    setSearchTerm('');
    }, [activeMode]);

    // 分类切换时对图书筛选进行复位
    useEffect(() => {
        if (category !== 'books') {
            setBookType('all');
            setBookMajor('');
        }
        if (category !== 'lecture') {
            setLectureLocation('all');
            setCustomLectureLocation('');
            setLectureStartFrom('');
            setLectureEndTo('');
        }
    }, [category]);
    
    // 修改fetchListings函数，添加地点筛选参数
    // 确保fetchListings函数中的参数名称正确
    const fetchListings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
        const response = await api.get('/api/listings', {
            params: {
                type: activeMode,
                status: 'available',
                searchTerm: searchTerm || undefined,
                category: category !== 'all' ? category : undefined,
                itemType: activeMode === 'lostfound' && itemType !== 'all' ? itemType : undefined,
                // 确保参数名称与后端一致
                startLocation: (activeMode === 'sale' || activeMode === 'acquire') && category === 'service' && startLocation !== 'all' ? startLocation : undefined,
                endLocation: (activeMode === 'sale' || activeMode === 'acquire') && category === 'service' && endLocation !== 'all' ? endLocation : undefined,
                // 图书教材细分
                bookType: (activeMode === 'sale' || activeMode === 'acquire') && category === 'books' && bookType !== 'all' ? bookType : undefined,
                bookMajor: (activeMode === 'sale' || activeMode === 'acquire') && category === 'books' && bookMajor.trim() ? bookMajor.trim() : undefined,
                // 代课讲座筛选
                lectureLocation: (activeMode === 'sale' || activeMode === 'acquire') && category === 'lecture' && (lectureLocation !== 'all' || customLectureLocation.trim())
                    ? (lectureLocation === 'other' ? (customLectureLocation.trim() || undefined) : lectureLocation)
                    : undefined,
                lectureStartFrom: (activeMode === 'sale' || activeMode === 'acquire') && category === 'lecture' && lectureStartFrom ? lectureStartFrom : undefined,
                lectureEndTo: (activeMode === 'sale' || activeMode === 'acquire') && category === 'lecture' && lectureEndTo ? lectureEndTo : undefined,
            },
        });
        setListings(response.data);
    } catch (err) {
        console.error(err);
        setError('数据加载失败，请稍后重试。');
    } finally {
        setIsLoading(false);
    }
    }, [activeMode, searchTerm, category, itemType, startLocation, endLocation, bookType, bookMajor, lectureLocation, customLectureLocation, lectureStartFrom, lectureEndTo]);
    
    // 在UI中添加地点筛选器（在物品类型筛选器之后）
    {/* 仅在出售/收购模式且分类为跑腿服务时显示地点筛选器 */}
    {(activeMode === 'sale' || activeMode === 'acquire') && category === 'service' && (
        <>
            <select
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
                className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white min-w-[140px]`}
            >
                <option value="all">起始地点</option>
                {Object.entries(LOCATION_CONFIG).filter(([key]) => key !== 'all').map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                ))}
            </select>
            <select
                value={endLocation}
                onChange={(e) => setEndLocation(e.target.value)}
                className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white min-w-[140px]`}
            >
                <option value="all">目的地点</option>
                {Object.entries(LOCATION_CONFIG).filter(([key]) => key !== 'all').map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                ))}
            </select>
        </>
    )}

    useEffect(() => {
        const timer = setTimeout(fetchListings, 250);
        return () => clearTimeout(timer);
    }, [fetchListings]);

    useEffect(() => {
        if (pendingDetailRef.current && !isDetailOpen) {
            const { listingId } = pendingDetailRef.current;
            pendingDetailRef.current = null;
            if (listingId) {
                openDetail({ id: listingId });
            }
        }
    }, [isDetailOpen]);

    const confirm = useConfirm();
    const toast = useToast();
    const handlePurchase = async (item) => {
        if (!user) {
            toast.info('请先登录再进行购买。');
            return;
        }
        const numericPrice = Number(item.price);
        const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
        const ok = await confirm({
            title: '确认购买',
            message: hasValidPrice ? `确定以 ¥${numericPrice.toLocaleString()} 购买 “${item.title}” 吗？` : `确定购买 “${item.title}” 吗？`,
            tone: 'default',
            confirmText: '下单',
            cancelText: '取消',
        });
        if (ok) {
            try {
                await api.post('/api/orders', { listingId: item.id });
                toast.success('下单成功！您可以在“我的订单”中查看进度。');
                onNavigate('myOrders');
            } catch (err) {
                toast.error(err.response?.data?.message || '下单失败，请稍后再试。');
                fetchListings();
            }
        }
    };

    const handleToggleFavorite = async (item, shouldFavorite) => {
        if (!user) {
            toast.info('请先登录后再收藏。');
            return;
        }
        if (!item?.id) return;

        try {
            if (shouldFavorite) {
                await api.post(`/api/listings/${item.id}/favorite`);
            } else {
                await api.delete(`/api/listings/${item.id}/favorite`);
            }
            setFavoriteIds((prev) => {
                const next = new Set(prev);
                if (shouldFavorite) {
                    next.add(item.id);
                } else {
                    next.delete(item.id);
                }
                return next;
            });
        } catch (error) {
            console.error('收藏操作失败:', error);
            toast.error(error.response?.data?.message || '收藏操作失败，请稍后再试。');
        }
    };

    const handleContact = (item) => {
        if (!user) {
            toast.info('请先登录后再联系对方。');
            return;
        }
        if (!item.user_id) {
            toast.error('无法获取发布者信息。');
            return;
        }

        if (item.user_id === user.id) {
            toast.info('这是您自己发布的内容哦。');
            return;
        }

        const listingTypeKey = deriveListingTypeKey(item, activeMode);
        try {
            window.localStorage.setItem(
                'yy_pending_chat',
                JSON.stringify({
                    userId: item.user_id,
                    username: item.user_name || item.owner_name,
                    listing: {
                        id: item.id,
                        type: item.type || activeMode,
                        title: item.title,
                        price: item.price,
                        imageUrl: resolveImageUrl(item.image_url, listingTypeKey),
                        ownerId: item.user_id,
                        ownerName: item.user_name || item.owner_name,
                        source: activeMode,
                    },
                })
            );
        } catch (error) {
            console.warn('无法记录待跳转的会话。', error);
        }

        onNavigate('messages');
    };

    const normalizeReplies = (rows) => {
        if (!Array.isArray(rows)) return [];
        // 若已经是树结构（有 children），直接返回
        if (rows.some(r => Array.isArray(r.children))) return rows;
        // 否则尝试按 parent_reply_id 整理
        const byId = new Map();
        rows.forEach(r => byId.set(r.id, { ...r, children: [] }));
        const roots = [];
        rows.forEach(r => {
            const node = byId.get(r.id);
            if (!r.parent_reply_id) roots.push(node);
            else {
                const p = byId.get(r.parent_reply_id);
                if (p) p.children.push(node); else roots.push(node);
            }
        });
        return roots;
    };

    const loadDetail = async (listingId) => {
        setDetailLoading(true);
        setDetailError('');
        try {
            const { data } = await api.get(`/api/listings/${listingId}/detail`);
            setDetailListing(data.listing);
            setDetailReplies(normalizeReplies(data.replies || []));
            setActiveImageIndex(0);
        } catch (err) {
            console.error(err);
            setDetailError(err.response?.data?.message || '详情加载失败，请稍后再试。');
        } finally {
            setDetailLoading(false);
        }
    };

    const openDetail = (item) => {
        setIsDetailOpen(true);
        setReplyContent('');
        setDetailListing(null);
        setDetailReplies([]);
        loadDetail(item.id);
    };

    const closeDetail = () => {
        setIsDetailOpen(false);
        setDetailListing(null);
        setDetailReplies([]);
        setReplyContent('');
        setDetailError('');
    };

    const submitReply = async () => {
        if (!detailListing) return;
        if (!user) {
            toast.info('请登录后再回复。');
            return;
        }
        const content = replyContent.trim();
        if (!content) {
            toast.warning('回复内容不能为空。');
            return;
        }
        try {
            const payload = replyingTo && replyingTo.parentReplyId ? { content, parentReplyId: replyingTo.parentReplyId } : { content };
            await api.post(`/api/listings/${detailListing.id}/replies`, payload);
            setReplyContent('');
            setReplyingTo(null);
            await loadDetail(detailListing.id);
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || '回复失败，请稍后再试。');
        }
    };

    const totalRepliesCount = useMemo(() => {
        const countTree = (nodes) => nodes.reduce((acc, n) => acc + 1 + (Array.isArray(n.children) ? n.children.length : 0), 0);
        return countTree(detailReplies);
    }, [detailReplies]);

    const handleStartReply = (rootId, targetName) => {
        setReplyingTo({ parentReplyId: rootId, targetName });
    };

    const handleStartEdit = (reply) => {
        setEditingReplyId(reply.id);
        setEditingContent(reply.content || '');
    };

    const handleCancelEdit = () => {
        setEditingReplyId(null);
        setEditingContent('');
    };

    const handleSaveEdit = async () => {
        if (!editingReplyId) return;
        const content = (editingContent || '').trim();
        if (!content) {
            toast.warning('修改后的内容不能为空。');
            return;
        }
        try {
            await api.put(`/api/replies/${editingReplyId}`, { content });
            handleCancelEdit();
            if (detailListing) await loadDetail(detailListing.id);
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || '编辑失败，请稍后再试。');
        }
    };

    const handleDeleteReply = async (replyId) => {
        let ok = false;
        try {
            ok = await confirm({ title: '删除回复', message: '确定要删除这条回复吗？子回复将一并删除。', tone: 'danger', confirmText: '删除', cancelText: '取消' });
        } catch {
            ok = window.confirm('确定要删除这条回复吗？子回复将一并删除。');
        }
        if (!ok) return;
        try {
            await api.delete(`/api/replies/${replyId}`);
            if (detailListing) await loadDetail(detailListing.id);
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || '删除失败，请稍后再试。');
        }
    };

    const renderWithMentions = (text) => {
        const s = String(text || '');
        const parts = s.split(/(@[A-Za-z0-9_]+)/g);
        return parts.map((part, idx) => {
            if (/^@[A-Za-z0-9_]+$/.test(part)) {
                return (
                    <span key={idx} className="text-indigo-600">{part}</span>
                );
            }
            return <span key={idx}>{part}</span>;
        });
    };

    const galleryImages = useMemo(() => {
        if (!detailListing) return [];
        const listingTypeKey = deriveListingTypeKey(detailListing, detailListing?.type || activeMode);

        if (Array.isArray(detailListing.images) && detailListing.images.length > 0) {
            return detailListing.images
                .filter((image) => image?.image_url)
                .map((image) => ({
                    id: image.id ?? image.image_url,
                    url: resolveImageUrl(image.image_url, listingTypeKey),
                }));
        }
        if (detailListing.image_url) {
            return [{ id: detailListing.image_url, url: resolveImageUrl(detailListing.image_url, listingTypeKey) }];
        }
        return [];
    }, [detailListing, activeMode]);

    const detailImageFallbackType = useMemo(() => {
        if (!detailListing) return deriveListingTypeKey(null, activeMode);
        return deriveListingTypeKey(detailListing, detailListing?.type || activeMode);
    }, [detailListing, activeMode]);

    const detailModeLabel = useMemo(() => {
        if (!detailListing) return '';
        const key = deriveListingTypeKey(detailListing, detailListing?.type || activeMode);
        return MODE_TEXT[key] || detailListing.type || key;
    }, [detailListing, activeMode]);

    useEffect(() => {
        setActiveImageIndex(0);
    }, [detailListing?.id, galleryImages.length]);

    const currentCategories = CATEGORY_CONFIG[activeMode] || CATEGORY_CONFIG.sale;

    const renderContent = () => {
        if (isLoading) {
            return <p className="text-center text-gray-500 py-10">加载中...</p>;
        }
        if (error) {
            return <p className="text-center text-red-500 py-10">{error}</p>;
        }
        if (!listings.length) {
            return <p className="text-center text-gray-500 py-10">当前分类下暂无内容。</p>;
        }

        if (activeMode === 'sale' || activeMode === 'acquire') {
            return (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 md:gap-6">
                    {listings.map(item => (
                        <ListingCard
                            key={item.id}
                            item={item}
                            onPurchase={handlePurchase}
                            onContact={handleContact}
                            onOpenDetail={openDetail}
                            onToggleFavorite={handleToggleFavorite}
                            isFavorited={favoriteIds.has(item.id)}
                            theme={getModuleTheme(item.type || activeMode)}
                        />
                    ))}
                </div>
            );
        }

        const isLostFound = activeMode === 'lostfound';
        return (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-3 md:gap-5">
                {listings.map(item => (
                    <InfoCard
                        key={item.id}
                        item={item}
                        isLostFound={isLostFound}
                        mode={activeMode}
                        onOpenDetail={openDetail}
                        onContact={handleContact}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorited={favoriteIds.has(item.id)}
                        theme={getModuleTheme(isLostFound ? 'lostfound' : 'help')}
                    />
                ))}
            </div>
        );
    };

    const theme = getModuleTheme(activeMode);

    return (
        <div>
            {/* 顶部主题横幅 */}
            <div className="mb-6 rounded-2xl overflow-hidden shadow">
                <div className={`${theme.headerBg} text-white px-6 py-6 flex items-center justify-between`}>                    
                    <div className="space-y-1">
                        <h1 className="text-xl md:text-2xl font-semibold leading-tight flex items-center gap-2">
                            <span>{theme.icon}</span>
                            喻园易站 · {MODE_TEXT[activeMode]}
                        </h1>
                        <p className="text-white/90 text-sm md:text-base">发现、发布与联系，连接校园内可信的同学交易与互助</p>
                    </div>
                    <div className="hidden md:flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-white/15 text-white/90 text-xs">实时更新</span>
                        <span className="px-3 py-1 rounded-full bg-white/15 text-white/90 text-xs">当前内容 {listings.length} 条</span>
                    </div>
                </div>
                <div className="bg-white px-6 py-3 text-xs md:text-sm text-gray-600 flex flex-wrap gap-2">
                    <span className={`px-2 py-1 rounded-full border ${theme.accentPill} ${theme.accentBorder}`}>支持多图上传</span>
                    <span className={`px-2 py-1 rounded-full border ${theme.accentPill} ${theme.accentBorder}`}>违规内容将被处理</span>
                    <span className={`px-2 py-1 rounded-full border ${theme.accentPill} ${theme.accentBorder}`}>注意线下见面安全</span>
                </div>
            </div>
            <div className="mb-6 bg-white p-4 rounded-lg shadow">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex border border-gray-200 rounded-md overflow-hidden">
                        {Object.keys(MODE_TEXT).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setActiveMode(mode)}
                                className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                    activeMode === mode
                                        ? getModuleTheme(mode).buttonBg + ' text-white'
                                        : 'text-gray-600 ' + getModuleTheme(mode).softBg
                                }`}
                            >
                                {MODE_TEXT[mode]}
                            </button>
                        ))}
                    </div>
                    <div className="flex-grow flex flex-col md:flex-row gap-4 w-full md:w-auto">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={`搜索“${MODE_TEXT[activeMode]}”...`}
                            className={`w-full px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus}`}
                        />
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white min-w-[140px]`}
                        >
                            {Object.entries(currentCategories).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                        
                        {/* 仅在失物招领模式下显示物品类型筛选器 */}
                        {activeMode === 'lostfound' && (
                            <select
                                value={itemType}
                                onChange={(e) => setItemType(e.target.value)}
                                className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white min-w-[140px]`}
                            >
                                {Object.entries(LOSTFOUND_ITEM_TYPE_CONFIG).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        )}
                        
                        {/* 仅在出售/收购模式且分类为跑腿服务时显示地点筛选器 */}
                        {(activeMode === 'sale' || activeMode === 'acquire') && category === 'service' && (
                            <>
                                <select
                                    value={startLocation}
                                    onChange={(e) => setStartLocation(e.target.value)}
                                    className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white min-w-[140px]`}
                                >
                                    <option value="all">起始地点</option>
                                    {Object.entries(LOCATION_CONFIG).filter(([key]) => key !== 'all').map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                                <select
                                    value={endLocation}
                                    onChange={(e) => setEndLocation(e.target.value)}
                                    className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white min-w-[140px]`}
                                >
                                    <option value="all">目的地点</option>
                                    {Object.entries(LOCATION_CONFIG).filter(([key]) => key !== 'all').map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </>
                        )}

                        {/* 仅在出售/收购模式且分类为代课讲座时显示讲座筛选器 */}
                        {(activeMode === 'sale' || activeMode === 'acquire') && category === 'lecture' && (
                            <>
                                <select
                                    value={lectureLocation}
                                    onChange={(e) => setLectureLocation(e.target.value)}
                                    className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white min-w-[140px]`}
                                >
                                    <option value="all">讲座地点</option>
                                    {['东九楼','东十二楼','西十二楼','西五楼','other'].map((loc) => (
                                        <option key={loc} value={loc}>{loc === 'other' ? '其他地点' : loc}</option>
                                    ))}
                                </select>
                                {lectureLocation === 'other' && (
                                    <input
                                        type="text"
                                        value={customLectureLocation}
                                        onChange={(e) => setCustomLectureLocation(e.target.value)}
                                        placeholder="自定义地点"
                                        className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white`}
                                    />
                                )}
                                <input
                                    type="datetime-local"
                                    value={lectureStartFrom}
                                    onChange={(e) => setLectureStartFrom(e.target.value)}
                                    className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white`}
                                />
                                <input
                                    type="datetime-local"
                                    value={lectureEndTo}
                                    onChange={(e) => setLectureEndTo(e.target.value)}
                                    className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white`}
                                />
                            </>
                        )}

                        {/* 仅在出售/收购模式且分类为图书教材时显示图书筛选器 */}
                        {(activeMode === 'sale' || activeMode === 'acquire') && category === 'books' && (
                            <>
                                <select
                                    value={bookType}
                                    onChange={(e) => setBookType(e.target.value)}
                                    className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white min-w-[140px]`}
                                >
                                    {Object.entries(BOOK_TYPE_CONFIG).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={bookMajor}
                                    onChange={(e) => setBookMajor(e.target.value)}
                                    placeholder="所属专业（可输入）"
                                    className={`px-4 py-2 border rounded-md ${getModuleTheme(activeMode).inputFocus} bg-white`}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
            {renderContent()}

            {isDetailOpen && (
                <div className="fixed inset-0 z-50 md:bg-black md:bg-opacity-40 flex md:items-center md:justify-center px-0 md:px-4 py-0 md:py-6 bg-white">
                    <div className="bg-white rounded-none md:rounded-2xl shadow-xl w-full h-full md:w-full md:h-auto md:max-w-3xl md:max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h3 className="text-xl font-semibold text-gray-900">
                                {detailListing?.type === 'sale' ? '商品详情' : '帖子详情'}
                            </h3>
                            <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600">
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                            {detailLoading && <p className="text-center text-gray-500 py-10">加载详情中...</p>}
                            {detailError && <p className="text-center text-red-500 py-10">{detailError}</p>}
                            {!detailLoading && detailListing && (
                                <>
                                    <div className="space-y-3">
                                        <h4 className="text-2xl font-bold text-gray-900">{detailListing.title}</h4>
                                        <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                                            <span>类型：{detailModeLabel}</span>
                                            <span>分类：{detailListing.category}</span>
                                            <span>发布者：{detailListing.owner_name || detailListing.user_name}</span>
                                            <span>发布时间：{formatDateTime(detailListing.created_at)}</span>
                                        </div>
                                        {detailListing.category === 'books' && (detailListing.book_type || detailListing.book_major) && (
                                            <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                                                {detailListing.book_type && <span>图书类型：{detailListing.book_type}</span>}
                                                {detailListing.book_major && <span>所属专业：{detailListing.book_major}</span>}
                                            </div>
                                        )}
                                        {detailListing.category === 'lecture' && (detailListing.lecture_location || detailListing.lecture_start_at || detailListing.lecture_end_at) && (
                                            <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                                                {detailListing.lecture_location && <span>讲座地点：{detailListing.lecture_location}</span>}
                                                {(detailListing.lecture_start_at || detailListing.lecture_end_at) && (
                                                    <span>
                                                        时间段：
                                                        {detailListing.lecture_start_at ? formatDateTime(detailListing.lecture_start_at) : '未定'}
                                                        {` ~ `}
                                                        {detailListing.lecture_end_at ? formatDateTime(detailListing.lecture_end_at) : '未定'}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {detailListing.type === 'sale' && (
                                            <div className="text-2xl font-semibold text-emerald-600">
                                                {detailListing.price ? `¥${Number(detailListing.price).toLocaleString()}` : '议价'}
                                            </div>
                                        )}
                                        
                                        {/* 修复地点信息显示的条件判断 */}
                                        {detailListing.category === 'service' && (
                                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                                {detailListing.start_location && (
                                                    <div className="flex items-start mb-2">
                                                        <span className="text-sm font-medium text-gray-600 w-16">出发地点：</span>
                                                        <span className="text-gray-800">{detailListing.start_location}</span>
                                                    </div>
                                                )}
                                                {detailListing.end_location && (
                                                    <div className="flex items-start">
                                                        <span className="text-sm font-medium text-gray-600 w-16">目的地点：</span>
                                                        <span className="text-gray-800">{detailListing.end_location}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        {galleryImages.length > 0 && (
                                            <div className="space-y-3">
                                                <div className="relative bg-gray-100 rounded-lg border border-gray-100 flex items-center justify-center">
                                                    <img
                                                        src={galleryImages[Math.min(activeImageIndex, galleryImages.length - 1)]?.url}
                                                        alt={detailListing.title}
                                                        className="max-h-[70vh] w-full object-contain transition-transform duration-200 cursor-zoom-in"
                                                        onClick={() => {
                                                            const target = galleryImages[Math.min(activeImageIndex, galleryImages.length - 1)];
                                                            if (!target?.url) return;
                                                            window.open(target.url, '_blank', 'noopener');
                                                        }}
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.src = getDefaultListingImage(detailImageFallbackType) || FALLBACK_IMAGE;
                                                        }}
                                                    />
                                                    {galleryImages.length > 1 && (
                                                        <span className="absolute top-2 right-2 px-2 py-0.5 text-xs bg-black/60 text-white rounded-full">
                                                            {activeImageIndex + 1} / {galleryImages.length}
                                                        </span>
                                                    )}
                                                    <span className="absolute bottom-2 right-2 text-xs text-gray-500 bg-white/70 px-2 py-1 rounded-md">点击查看原图</span>
                                                </div>
                                                {galleryImages.length > 1 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {galleryImages.map((image, index) => (
                                                            <button
                                                                type="button"
                                                                key={image.id ?? index}
                                                                onClick={() => setActiveImageIndex(index)}
                                                                className={`relative w-16 h-16 rounded-lg overflow-hidden border ${
                                                                    index === activeImageIndex
                                                                        ? 'border-indigo-500 ring-2 ring-indigo-200'
                                                                        : 'border-transparent'
                                                                }`}
                                                            >
                                                                <img
                                                                    src={image.url}
                                                                    alt={`预览图 ${index + 1}`}
                                                                    className="w-full h-full object-cover"
                                                                    onError={(e) => {
                                                                        e.target.onerror = null;
                                                                        e.target.src = getDefaultListingImage(detailImageFallbackType) || FALLBACK_IMAGE;
                                                                    }}
                                                                />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <p className="leading-relaxed text-gray-700 whitespace-pre-line">{detailListing.description}</p>
                                    </div>

                                    <div className="pt-4 border-t border-gray-100">
                                        <h5 className="text-lg font-semibold text-gray-800 mb-3">留言 ({totalRepliesCount})</h5>
                                        <div className="space-y-3">
                                            {detailReplies.length === 0 && (
                                                <p className="text-sm text-gray-500">暂无回复，快来抢沙发吧～</p>
                                            )}
                                            {detailReplies.map((root) => (
                                                <div key={root.id} className="bg-gray-50 rounded-lg px-4 py-3 space-y-2">
                                                    <div className="flex justify-between text-sm text-gray-500">
                                                        <span>{root.user_name}</span>
                                                        <span>{formatDateTime(root.created_at)}</span>
                                                    </div>
                                                    {editingReplyId === root.id ? (
                                                        <div className="space-y-2">
                                                            <textarea className="w-full px-3 py-2 text-sm border rounded-md" rows={3} value={editingContent} onChange={(e)=>setEditingContent(e.target.value)} />
                                                            <div className="flex gap-2 text-xs">
                                                                <button type="button" onClick={handleSaveEdit} className="px-3 py-1 rounded bg-indigo-600 text-white">保存</button>
                                                                <button type="button" onClick={handleCancelEdit} className="px-3 py-1 rounded border">取消</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="text-gray-700 text-sm whitespace-pre-line">{renderWithMentions(root.content)}</p>
                                                    )}
                                                    <div className="text-xs text-indigo-600">
                                                        <button type="button" onClick={() => handleStartReply(root.id, root.user_name)} className="hover:underline mr-3">回复</button>
                                                        {user && user.id === root.user_id && editingReplyId !== root.id && (
                                                            <>
                                                                <button type="button" onClick={() => handleStartEdit(root)} className="hover:underline mr-3 text-gray-600">编辑</button>
                                                                <button type="button" onClick={() => handleDeleteReply(root.id)} className="hover:underline text-red-600">删除</button>
                                                            </>
                                                        )}
                                                    </div>
                                                    {Array.isArray(root.children) && root.children.length > 0 && (
                                                        <div className="mt-2 space-y-2 pl-3 border-l border-gray-200">
                                                            {root.children.map((child) => (
                                                                <div key={child.id} className="bg-white rounded-md px-3 py-2">
                                                                    <div className="flex justify-between text-xs text-gray-500">
                                                                        <span>{child.user_name}</span>
                                                                        <span>{formatDateTime(child.created_at)}</span>
                                                                    </div>
                                                                    {editingReplyId === child.id ? (
                                                                        <div className="space-y-2">
                                                                            <textarea className="w-full px-3 py-2 text-sm border rounded-md" rows={3} value={editingContent} onChange={(e)=>setEditingContent(e.target.value)} />
                                                                            <div className="flex gap-2 text-xs">
                                                                                <button type="button" onClick={handleSaveEdit} className="px-3 py-1 rounded bg-indigo-600 text-white">保存</button>
                                                                                <button type="button" onClick={handleCancelEdit} className="px-3 py-1 rounded border">取消</button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-gray-700 text-sm whitespace-pre-line">{renderWithMentions(child.content)}</p>
                                                                    )}
                                                                    <div className="text-xs text-indigo-600">
                                                                        <button type="button" onClick={() => handleStartReply(root.id, child.user_name)} className="hover:underline mr-3">回复</button>
                                                                        {user && user.id === child.user_id && editingReplyId !== child.id && (
                                                                            <>
                                                                                <button type="button" onClick={() => handleStartEdit(child)} className="hover:underline mr-3 text-gray-600">编辑</button>
                                                                                <button type="button" onClick={() => handleDeleteReply(child.id)} className="hover:underline text-red-600">删除</button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                            {replyingTo && (
                                <div className="mb-2 text-xs text-gray-600 flex items-center gap-2">
                                    <span>正在回复：@{replyingTo.targetName}</span>
                                    <button type="button" className="text-indigo-600 hover:underline" onClick={() => setReplyingTo(null)}>取消</button>
                                </div>
                            )}
                            <textarea
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                placeholder={user ? (replyingTo ? `回复 @${replyingTo.targetName}...` : '输入你的回复...') : '登录后才能回复'}
                                rows={3}
                                disabled={!user || detailLoading}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                            />
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-3">
                                <div className="flex flex-wrap gap-2">
                                    {detailListing && detailListing.user_id !== user?.id && (
                                        <button
                                            type="button"
                                            onClick={() => handleContact(detailListing)}
                                            className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                                        >
                                            联系对方
                                        </button>
                                    )}
                                    {detailListing && detailListing.type === 'sale' && detailListing.user_id !== user?.id && detailListing.status === 'available' && (
                                        <button
                                            type="button"
                                            onClick={() => handlePurchase(detailListing)}
                                            className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
                                        >
                                            立即购买
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={submitReply}
                                    disabled={!user || detailLoading}
                                    className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300"
                                >
                                    发送回复
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HomePage;