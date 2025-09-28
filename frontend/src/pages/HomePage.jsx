// frontend/src/pages/HomePage.jsx
// 版本: 1.1 - 实现动态分类筛选

import React, { useState, useEffect, useCallback } from 'react';
import api, { API_BASE_URL } from '../api';
import ListingCard from '../components/ListingCard';
import { useAuth } from '../context/AuthContext';

const CATEGORY_CONFIG = {
    sale: {
        all: '所有分类',
        electronics: '电子产品',
        books: '图书教材',
        clothing: '服饰鞋包',
        life: '生活用品',
        service: '跑腿服务',
        others: '其他',
    },
    acquire: {
        all: '所有分类',
        electronics: '电子产品',
        books: '图书教材',
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
    },
};

const MODE_TEXT = {
    sale: '出售',
    acquire: '收购',
    help: '帮帮忙',
    lostfound: '失物招领',
};

const formatDateTime = (value) => {
    if (!value) return '';
    try {
        return new Date(value).toLocaleString('zh-CN', { hour12: false });
    } catch {
        return value;
    }
};

const resolveImageUrl = (value) => {
    if (!value) {
        return 'https://via.placeholder.com/400x250?text=YuYuanYiZhan';
    }
    if (value.startsWith('http')) {
        return value;
    }
    try {
        const base = new URL(API_BASE_URL);
        return `${base.origin}${value}`;
    } catch {
        return value;
    }
};

const InfoCard = ({ item, onOpenDetail, onContact, isLostFound }) => {
    const badgeText = isLostFound ? (item.type === 'found' ? '招领' : '寻物') : item.category;
    const badgeStyle = isLostFound
        ? item.type === 'found'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-orange-100 text-orange-700'
        : 'bg-indigo-100 text-indigo-700';

    const imageUrl = resolveImageUrl(item.image_url);

    return (
        <div
            onClick={() => onOpenDetail(item)}
            className="bg-white rounded-xl shadow hover:shadow-lg transition-shadow duration-200 cursor-pointer overflow-hidden"
        >
            <div className="h-44 bg-gray-100 overflow-hidden">
                <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" />
            </div>
            <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">{item.title}</h3>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${badgeStyle}`}>
                        {badgeText || '其他'}
                    </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-3">{item.description || item.content}</p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>发布者：{item.user_name || item.owner_name}</span>
                    <span>{formatDateTime(item.created_at)}</span>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetail(item);
                        }}
                        className="px-3 py-1.5 text-sm rounded-md border border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                    >
                        查看详情
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onContact(item);
                        }}
                        className="px-3 py-1.5 text-sm rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
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
    const [detailReplies, setDetailReplies] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const [replyContent, setReplyContent] = useState('');

    useEffect(() => {
        setCategory('all');
        setSearchTerm('');
    }, [activeMode]);

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
                },
            });
            setListings(response.data);
        } catch (err) {
            console.error(err);
            setError('数据加载失败，请稍后重试。');
        } finally {
            setIsLoading(false);
        }
    }, [activeMode, searchTerm, category]);

    useEffect(() => {
        const timer = setTimeout(fetchListings, 250);
        return () => clearTimeout(timer);
    }, [fetchListings]);

    const handlePurchase = async (item) => {
        if (!user) {
            alert('请先登录再进行购买。');
            return;
        }
        if (window.confirm(`确定以 ¥${Number(item.price).toLocaleString()} 购买 "${item.title}" 吗？`)) {
            try {
                await api.post('/api/orders', { listingId: item.id });
                alert('下单成功！您可以在“我的订单”中查看进度。');
                onNavigate('myOrders');
            } catch (err) {
                alert(err.response?.data?.message || '下单失败，请稍后再试。');
                fetchListings();
            }
        }
    };

    const handleContact = (item) => {
        if (!user) {
            alert('请先登录后再联系对方。');
            return;
        }
        if (!item.user_id) {
            alert('无法获取发布者信息。');
            return;
        }

        if (item.user_id === user.id) {
            alert('这是您自己发布的内容哦。');
            return;
        }

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
                        imageUrl: resolveImageUrl(item.image_url),
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

    const loadDetail = async (listingId) => {
        setDetailLoading(true);
        setDetailError('');
        try {
            const { data } = await api.get(`/api/listings/${listingId}/detail`);
            setDetailListing(data.listing);
            setDetailReplies(data.replies || []);
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
            alert('请登录后再回复。');
            return;
        }
        const content = replyContent.trim();
        if (!content) {
            alert('回复内容不能为空。');
            return;
        }
        try {
            await api.post(`/api/listings/${detailListing.id}/replies`, { content });
            setReplyContent('');
            await loadDetail(detailListing.id);
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.message || '回复失败，请稍后再试。');
        }
    };

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {listings.map(item => (
                        <ListingCard
                            key={item.id}
                            item={item}
                            onPurchase={handlePurchase}
                            onContact={handleContact}
                        />
                    ))}
                </div>
            );
        }

        const isLostFound = activeMode === 'lostfound';
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {listings.map(item => (
                    <InfoCard
                        key={item.id}
                        item={item}
                        isLostFound={isLostFound}
                        onOpenDetail={openDetail}
                        onContact={handleContact}
                    />
                ))}
            </div>
        );
    };

    return (
        <div>
            <div className="mb-6 bg-white p-4 rounded-lg shadow">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex border border-gray-200 rounded-md overflow-hidden">
                        {Object.keys(MODE_TEXT).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setActiveMode(mode)}
                                className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                    activeMode === mode
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-600 hover:bg-indigo-50'
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
                            className="w-full px-4 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="px-4 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white min-w-[140px]"
                        >
                            {Object.entries(currentCategories).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            {renderContent()}

            {isDetailOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center px-4 py-6 z-50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h3 className="text-xl font-semibold text-gray-900">帖子详情</h3>
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
                                            <span>类型：{MODE_TEXT[detailListing.type] || detailListing.type}</span>
                                            <span>分类：{detailListing.category}</span>
                                            <span>发布者：{detailListing.owner_name || detailListing.user_name}</span>
                                            <span>发布时间：{formatDateTime(detailListing.created_at)}</span>
                                        </div>
                                        {detailListing.image_url && (
                                            <img
                                                src={detailListing.image_url.startsWith('http') ? detailListing.image_url : `${window.location.origin.replace(':5173', ':3000')}${detailListing.image_url}`}
                                                alt={detailListing.title}
                                                className="w-full rounded-lg border border-gray-100"
                                            />
                                        )}
                                        <p className="leading-relaxed text-gray-700 whitespace-pre-line">{detailListing.description}</p>
                                    </div>

                                    <div className="pt-4 border-t border-gray-100">
                                        <h5 className="text-lg font-semibold text-gray-800 mb-3">留言 ({detailReplies.length})</h5>
                                        <div className="space-y-3">
                                            {detailReplies.length === 0 && (
                                                <p className="text-sm text-gray-500">暂无回复，快来抢沙发吧～</p>
                                            )}
                                            {detailReplies.map((reply) => (
                                                <div key={reply.id} className="bg-gray-50 rounded-lg px-4 py-3 space-y-1">
                                                    <div className="flex justify-between text-sm text-gray-500">
                                                        <span>{reply.user_name}</span>
                                                        <span>{formatDateTime(reply.created_at)}</span>
                                                    </div>
                                                    <p className="text-gray-700 text-sm whitespace-pre-line">{reply.content}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                            <textarea
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                placeholder={user ? '输入你的回复...' : '登录后才能回复'}
                                rows={3}
                                disabled={!user || detailLoading}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                            />
                            <div className="flex justify-end mt-3">
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