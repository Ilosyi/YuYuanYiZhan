// frontend/src/pages/UserCenterPage.jsx
// 版本: 2.0 - 用户中心（资料、关注、收藏、头像上传、用户搜索）

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api, { resolveAssetUrl } from '../api';
import ListingCard from '../components/ListingCard';
import { getModuleTheme } from '../constants/moduleThemes';
import { getDefaultListingImage, FALLBACK_IMAGE } from '../constants/defaultImages';
import { useAuth } from '../context/AuthContext';

const DEFAULT_AVATAR = resolveAssetUrl('/default-images/default-avatar.jpg');

const LISTING_TYPE_LABELS = {
    sale: '闲置出售',
    acquire: '求购',
    help: '帮帮忙',
    lostfound: '失物招领',
};

const emptyProfile = {
    displayName: '',
    studentId: '',
    contactPhone: '',
    bio: '',
};

const deriveListingTypeKey = (item) => {
    if (!item) return 'sale';
    const type = item.type || item.listingType;
    if (type === 'lost' || type === 'found' || type === 'lostfound') {
        return 'lostfound';
    }
    if (type === 'help') return 'help';
    if (type === 'acquire') return 'acquire';
    return type || 'sale';
};

const resolveListingImageUrl = (value, listingType) => {
    const resolved = resolveAssetUrl(value);
    if (resolved) {
        return resolved;
    }
    return getDefaultListingImage(listingType) || FALLBACK_IMAGE;
};

const formatDateTime = (value) => {
    if (!value) return '';
    try {
        return new Date(value).toLocaleString('zh-CN', { hour12: false });
    } catch (error) {
        return value;
    }
};

const UserInfoBadge = ({ label, value }) => (
    <div className="flex flex-col items-center bg-indigo-50 text-indigo-700 px-4 py-3 rounded-xl border border-indigo-100 min-w-[100px]">
        <span className="text-lg font-semibold">{value ?? 0}</span>
        <span className="text-xs tracking-wide">{label}</span>
    </div>
);

const FollowUserCard = ({ item, onToggleFollow, onPreviewListings }) => {
    const displayName = item.displayName || item.username;
    const avatarSrc = resolveAssetUrl(item.avatarUrl) || DEFAULT_AVATAR;

    return (
        <div className="flex items-start gap-4 bg-white shadow-sm rounded-xl p-4 border border-gray-100">
            <img src={avatarSrc} alt={displayName} className="w-12 h-12 rounded-full object-cover border border-gray-200" />
            <div className="flex-1 space-y-2">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="text-base font-semibold text-gray-900">{displayName}</h4>
                        <p className="text-xs text-gray-500">@{item.username}</p>
                    </div>
                    <div className="flex gap-2">
                        {onPreviewListings && (
                            <button
                                type="button"
                                onClick={() => onPreviewListings(item)}
                                className="px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
                            >
                                查看TA的发布
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onToggleFollow(item)}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                                item.isFollowedByCurrentUser
                                    ? 'border-gray-300 text-gray-600 hover:bg-gray-100'
                                    : 'border-amber-400 text-amber-600 bg-amber-50 hover:bg-amber-100'
                            }`}
                        >
                            {item.isFollowedByCurrentUser ? '取消关注' : '关注'}
                        </button>
                    </div>
                </div>
                {item.bio && <p className="text-sm text-gray-600 line-clamp-2">{item.bio}</p>}
                <div className="text-xs text-gray-400">
                    {item.isFollowingCurrentUser ? '互相关注' : item.isFollowedByCurrentUser ? '已关注' : '未关注'}
                    {item.followedAt ? ` · 关注时间：${formatDateTime(item.followedAt)}` : ''}
                </div>
            </div>
        </div>
    );
};

const UserCenterPage = ({ currentUser, onNavigate = () => {} }) => {
    const { user: authUser } = useAuth();
    const effectiveUser = currentUser || authUser;

    const [profile, setProfile] = useState(null);
    const [formState, setFormState] = useState(emptyProfile);
    const [feedback, setFeedback] = useState('');
    const [activeTab, setActiveTab] = useState('profile');

    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
    const [avatarUploading, setAvatarUploading] = useState(false);

    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [favoriteFilter, setFavoriteFilter] = useState('all');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const [viewedUser, setViewedUser] = useState(null);
    const [viewedListings, setViewedListings] = useState([]);
    const [viewedLoading, setViewedLoading] = useState(false);

    const [isProfileLoading, setIsProfileLoading] = useState(true);
    const [isProfileSaving, setIsProfileSaving] = useState(false);
    const [followersLoading, setFollowersLoading] = useState(false);
    const [followingLoading, setFollowingLoading] = useState(false);
    const [favoritesLoading, setFavoritesLoading] = useState(false);

    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [detailListing, setDetailListing] = useState(null);
    const [detailReplies, setDetailReplies] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const [detailReplyContent, setDetailReplyContent] = useState('');
    const [detailActiveImageIndex, setDetailActiveImageIndex] = useState(0);

    useEffect(() => {
        return () => {
            if (avatarPreviewUrl && avatarPreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreviewUrl);
            }
        };
    }, [avatarPreviewUrl]);

    const avatarDisplay = avatarPreviewUrl || resolveAssetUrl(profile?.profile?.avatarUrl) || resolveAssetUrl(profile?.avatarUrl) || DEFAULT_AVATAR;

    const loadProfile = useCallback(async () => {
        if (!effectiveUser) {
            setProfile(null);
            setIsProfileLoading(false);
            return;
        }
        setIsProfileLoading(true);
        try {
            const { data } = await api.get('/api/users/me');
            setProfile(data);
            setFormState({
                displayName: data?.profile?.displayName || '',
                studentId: data?.profile?.studentId || '',
                contactPhone: data?.profile?.contactPhone || '',
                bio: data?.profile?.bio || '',
            });
        } catch (error) {
            console.error('加载用户资料失败:', error);
            setFeedback('加载资料失败，请稍后再试。');
        } finally {
            setIsProfileLoading(false);
        }
    }, [effectiveUser]);

    const loadFollowers = useCallback(async () => {
        if (!profile?.id) return;
        setFollowersLoading(true);
        try {
            const { data } = await api.get(`/api/users/${profile.id}/followers`);
            setFollowers(data?.followers || []);
        } catch (error) {
            console.error('加载粉丝列表失败:', error);
            setFeedback('粉丝列表加载失败。');
        } finally {
            setFollowersLoading(false);
        }
    }, [profile?.id]);

    const loadFollowing = useCallback(async () => {
        if (!profile?.id) return;
        setFollowingLoading(true);
        try {
            const { data } = await api.get(`/api/users/${profile.id}/following`);
            setFollowing(data?.following || []);
        } catch (error) {
            console.error('加载关注列表失败:', error);
            setFeedback('关注列表加载失败。');
        } finally {
            setFollowingLoading(false);
        }
    }, [profile?.id]);

    const loadFavorites = useCallback(async () => {
        setFavoritesLoading(true);
        try {
            const { data } = await api.get('/api/users/me/favorites');
            setFavorites(data?.favorites || []);
        } catch (error) {
            console.error('加载收藏失败:', error);
            setFeedback('收藏列表加载失败。');
        } finally {
            setFavoritesLoading(false);
        }
    }, []);

    const openUserProfile = useCallback(async (userId) => {
        if (!userId || userId === profile?.id) {
            setViewedUser(null);
            setViewedListings([]);
            return;
        }
        setViewedLoading(true);
        setViewedUser(null);
        setViewedListings([]);
        try {
            const [{ data: profileData }, { data: listingsData }] = await Promise.all([
                api.get(`/api/users/${userId}/profile`),
                api.get('/api/listings', { params: { userId } }),
            ]);
            setViewedUser(profileData);
            setViewedListings(listingsData || []);
        } catch (error) {
            console.error('加载用户主页失败:', error);
            setFeedback('加载该用户主页失败，请稍后再试。');
        } finally {
            setViewedLoading(false);
        }
    }, [profile?.id]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    useEffect(() => {
        if (!profile?.id) return;
        if (activeTab === 'followers') {
            loadFollowers();
        } else if (activeTab === 'following') {
            loadFollowing();
        } else if (activeTab === 'favorites') {
            loadFavorites();
        }
    }, [activeTab, profile?.id, loadFollowers, loadFollowing, loadFavorites]);

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormState((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmitProfile = async (event) => {
        event.preventDefault();
        setIsProfileSaving(true);
        setFeedback('');
        try {
            const payload = {
                displayName: formState.displayName,
                studentId: formState.studentId,
                contactPhone: formState.contactPhone,
                bio: formState.bio,
            };
            await api.put('/api/users/me', payload);
            await loadProfile();
            setFeedback('资料已保存。');
        } catch (error) {
            console.error('保存资料失败:', error);
            setFeedback(error.response?.data?.message || '资料保存失败，请稍后再试。');
        } finally {
            setIsProfileSaving(false);
        }
    };

    const handleAvatarFileChange = (event) => {
        const file = event.target.files?.[0];
        setFeedback('');
        if (!file) {
            setAvatarFile(null);
            if (avatarPreviewUrl && avatarPreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreviewUrl);
            }
            setAvatarPreviewUrl('');
            return;
        }
        if (avatarPreviewUrl && avatarPreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(avatarPreviewUrl);
        }
        setAvatarFile(file);
        setAvatarPreviewUrl(URL.createObjectURL(file));
    };

    const handleUploadAvatar = async () => {
        if (!avatarFile) {
            setFeedback('请选择一张头像图片。');
            return;
        }
        setAvatarUploading(true);
        setFeedback('');
        try {
            const formData = new FormData();
            formData.append('avatar', avatarFile);
            await api.post('/api/users/me/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (avatarPreviewUrl && avatarPreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreviewUrl);
            }
            setAvatarFile(null);
            setAvatarPreviewUrl('');
            await loadProfile();
            setFeedback('头像已更新。');
        } catch (error) {
            console.error('上传头像失败:', error);
            setFeedback(error.response?.data?.message || '头像上传失败，请稍后再试。');
        } finally {
            setAvatarUploading(false);
        }
    };

    const toggleFollow = useCallback(async (targetId, currentlyFollowing) => {
        try {
            if (currentlyFollowing) {
                await api.delete(`/api/users/${targetId}/follow`);
            } else {
                await api.post(`/api/users/${targetId}/follow`);
            }
            await loadProfile();
            setFeedback(currentlyFollowing ? '已取消关注。' : '关注成功！');
            return !currentlyFollowing;
        } catch (error) {
            console.error('关注操作失败:', error);
            setFeedback(error.response?.data?.message || '操作失败，请稍后再试。');
            return null;
        }
    }, [loadProfile]);

    const handleToggleFollowFromList = async (item) => {
        if (!item?.id) return;
        const newState = await toggleFollow(item.id, item.isFollowedByCurrentUser);
        if (newState === null) return;

        const mutateEntry = (entry) => (
            entry.id === item.id
                ? { ...entry, isFollowedByCurrentUser: newState }
                : entry
        );

        setFollowers((prev) => prev.map(mutateEntry));
        setFollowing((prev) => prev.map(mutateEntry));
        setSearchResults((prev) => prev.map(mutateEntry));

        setViewedUser((prev) => {
            if (!prev || prev.id !== item.id) return prev;
            const delta = newState ? 1 : -1;
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    followers: Math.max(0, (prev.stats?.followers ?? 0) + delta),
                },
                relationship: {
                    ...prev.relationship,
                    isFollowing: newState,
                },
            };
        });

        if (activeTab === 'followers') {
            loadFollowers();
        } else if (activeTab === 'following') {
            loadFollowing();
        }
    };

    const handleToggleFollowForViewed = async () => {
        if (!viewedUser) return;
        const currentState = Boolean(viewedUser.relationship?.isFollowing);
        const newState = await toggleFollow(viewedUser.id, currentState);
        if (newState === null) return;

        const delta = newState ? 1 : -1;

        setViewedUser((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    followers: Math.max(0, (prev.stats?.followers ?? 0) + delta),
                },
                relationship: {
                    ...prev.relationship,
                    isFollowing: newState,
                },
            };
        });

        const mutateEntry = (entry) => (
            entry.id === viewedUser.id
                ? { ...entry, isFollowedByCurrentUser: newState }
                : entry
        );

        setFollowers((prev) => prev.map(mutateEntry));
        setFollowing((prev) => prev.map(mutateEntry));
        setSearchResults((prev) => prev.map(mutateEntry));
    };

    const handleSearchSubmit = async (event) => {
        event.preventDefault();
        const query = searchQuery.trim();
        setFeedback('');
        if (!query) {
            setSearchResults([]);
            return;
        }
        setSearchLoading(true);
        try {
            const { data } = await api.get('/api/users/search', {
                params: { q: query },
            });
            const normalized = (data?.results || []).map((result) => ({
                id: result.id,
                username: result.username,
                displayName: result.displayName || result.username,
                studentId: result.studentId || '',
                avatarUrl: result.avatarUrl || null,
                bio: result.bio || '',
                isFollowedByCurrentUser: Boolean(result.relationship?.isFollowing),
                isFollowingCurrentUser: Boolean(result.relationship?.isFollower),
            }));
            setSearchResults(normalized.filter((entry) => entry.id !== profile?.id));
        } catch (error) {
            console.error('用户搜索失败:', error);
            setFeedback(error.response?.data?.message || '搜索失败，请稍后再试。');
        } finally {
            setSearchLoading(false);
        }
    };

    const handleContactViewedListing = useCallback((listing) => {
        if (!effectiveUser) {
            setFeedback('请先登录后再联系对方。');
            return;
        }
        if (!listing) {
            setFeedback('暂时无法处理该帖子。');
            return;
        }

        const ownerId = listing.user_id || listing.owner_id || viewedUser?.id;
        if (!ownerId) {
            setFeedback('无法获取发布者信息。');
            return;
        }
        if (ownerId === effectiveUser.id) {
            setFeedback('这是您自己发布的内容。');
            return;
        }

        const ownerName = listing.user_name || listing.owner_name || viewedUser?.profile?.displayName || viewedUser?.username || '对方';
        const typeKey = deriveListingTypeKey(listing);
        const imageUrl = resolveListingImageUrl(listing.image_url, typeKey);

        try {
            window.localStorage.setItem(
                'yy_pending_chat',
                JSON.stringify({
                    userId: ownerId,
                    username: ownerName,
                    listing: {
                        id: listing.id,
                        type: listing.type || typeKey,
                        title: listing.title,
                        price: listing.price,
                        imageUrl,
                        ownerId,
                        ownerName,
                        source: 'user-center-view',
                    },
                })
            );
            setFeedback('');
            setDetailError('');
        } catch (storageError) {
            console.warn('无法记录待跳转的会话。', storageError);
        }

        onNavigate('messages');
    }, [effectiveUser, onNavigate, viewedUser]);

    const loadListingDetail = useCallback(async (listingId) => {
        if (!listingId) return;
        setDetailLoading(true);
        setDetailError('');
        try {
            const { data } = await api.get(`/api/listings/${listingId}/detail`);
            setDetailListing(data.listing || null);
            setDetailReplies(data.replies || []);
            setDetailActiveImageIndex(0);
        } catch (error) {
            console.error('加载帖子详情失败:', error);
            setDetailError(error.response?.data?.message || '详情加载失败，请稍后再试。');
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const handleOpenListingDetail = useCallback((item) => {
        if (!item?.id) return;
        setIsDetailOpen(true);
        setDetailListing(null);
        setDetailReplies([]);
        setDetailError('');
        setDetailReplyContent('');
        setDetailActiveImageIndex(0);
        loadListingDetail(item.id);
    }, [loadListingDetail]);

    const handleCloseListingDetail = useCallback(() => {
        setIsDetailOpen(false);
        setDetailListing(null);
        setDetailReplies([]);
        setDetailError('');
        setDetailReplyContent('');
        setDetailActiveImageIndex(0);
        setDetailLoading(false);
    }, []);

    const handleDetailReplySubmit = useCallback(async () => {
        if (!detailListing) return;
        if (!effectiveUser) {
            setFeedback('请先登录后再回复。');
            return;
        }
        const content = detailReplyContent.trim();
        if (!content) {
            setDetailError('回复内容不能为空。');
            return;
        }
        try {
            setDetailError('');
            await api.post(`/api/listings/${detailListing.id}/replies`, { content });
            setDetailReplyContent('');
            await loadListingDetail(detailListing.id);
        } catch (error) {
            console.error('回复失败:', error);
            setDetailError(error.response?.data?.message || '回复失败，请稍后再试。');
        }
    }, [detailListing, detailReplyContent, effectiveUser, loadListingDetail]);

    const handleContactFromDetail = useCallback((listing) => {
        if (!listing) return;
        if (!effectiveUser) {
            setFeedback('请先登录后再联系对方。');
            return;
        }

        const ownerId = listing.user_id || listing.owner_id;
        if (!ownerId) {
            setDetailError('无法获取发布者信息。');
            return;
        }
        if (ownerId === effectiveUser.id) {
            setDetailError('这是您自己发布的内容。');
            return;
        }

        const ownerName = listing.user_name || listing.owner_name || '对方';
        const typeKey = deriveListingTypeKey(listing);
        const imageUrl = resolveListingImageUrl(listing.image_url, typeKey);

        try {
            window.localStorage.setItem(
                'yy_pending_chat',
                JSON.stringify({
                    userId: ownerId,
                    username: ownerName,
                    listing: {
                        id: listing.id,
                        type: listing.type || typeKey,
                        title: listing.title,
                        price: listing.price,
                        imageUrl,
                        ownerId,
                        ownerName,
                        source: 'user-center-detail',
                    },
                })
            );
            setFeedback('');
        } catch (storageError) {
            console.warn('无法记录待跳转的会话。', storageError);
        }

        onNavigate('messages');
    }, [effectiveUser, onNavigate]);

    const handlePurchaseFromDetail = useCallback(async (listing) => {
        if (!listing) return;
        if (!effectiveUser) {
            setFeedback('请先登录再进行购买。');
            return;
        }
        const numericPrice = Number(listing.price);
        const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
        const confirmMessage = hasValidPrice
            ? `确定以 ¥${numericPrice.toLocaleString()} 购买 “${listing.title}” 吗？`
            : `确定购买 “${listing.title}” 吗？`;
        if (!window.confirm(confirmMessage)) {
            return;
        }
        try {
            setDetailError('');
            await api.post('/api/orders', { listingId: listing.id });
            setFeedback('下单成功！可以在“我的订单”中查看进度。');
            handleCloseListingDetail();
            onNavigate('myOrders');
        } catch (error) {
            console.error('下单失败:', error);
            setDetailError(error.response?.data?.message || '下单失败，请稍后再试。');
        }
    }, [effectiveUser, handleCloseListingDetail, onNavigate]);

    const handleToggleFavorite = async (item, shouldFavorite) => {
        if (!item?.id) return;
        try {
            if (shouldFavorite) {
                await api.post(`/api/listings/${item.id}/favorite`);
            } else {
                await api.delete(`/api/listings/${item.id}/favorite`);
            }
            await loadFavorites();
            await loadProfile();
            setFeedback(shouldFavorite ? '已收藏该帖子。' : '已取消收藏。');
        } catch (error) {
            console.error('收藏操作失败:', error);
            setFeedback(error.response?.data?.message || '收藏操作失败，请稍后再试。');
        }
    };

    const detailGalleryImages = useMemo(() => {
        if (!detailListing) return [];
        const listingTypeKey = deriveListingTypeKey(detailListing);
        if (Array.isArray(detailListing.images) && detailListing.images.length > 0) {
            return detailListing.images
                .filter((image) => image?.image_url)
                .map((image) => ({
                    id: image.id ?? image.image_url,
                    url: resolveListingImageUrl(image.image_url, listingTypeKey),
                }));
        }
        if (detailListing.image_url) {
            return [{ id: detailListing.image_url, url: resolveListingImageUrl(detailListing.image_url, listingTypeKey) }];
        }
        return [];
    }, [detailListing]);

    const detailImageFallbackType = useMemo(() => {
        if (!detailListing) return 'sale';
        return deriveListingTypeKey(detailListing);
    }, [detailListing]);

    const detailTypeLabel = useMemo(() => {
        if (!detailListing) return '';
        const key = deriveListingTypeKey(detailListing);
        return LISTING_TYPE_LABELS[key] || detailListing.type || key;
    }, [detailListing]);

    const detailOwnerId = detailListing ? (detailListing.user_id || detailListing.owner_id) : null;

    useEffect(() => {
        if (!isDetailOpen) return;
        if (detailGalleryImages.length === 0) {
            setDetailActiveImageIndex(0);
            return;
        }
        setDetailActiveImageIndex((prev) => Math.min(prev, detailGalleryImages.length - 1));
    }, [detailGalleryImages.length, isDetailOpen]);

    const favoriteIdSet = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);
    const filteredFavorites = useMemo(() => {
        if (favoriteFilter === 'all') {
            return favorites;
        }
        const normalized = favoriteFilter.toLowerCase();
        return favorites.filter((item) => deriveListingTypeKey(item).toLowerCase() === normalized);
    }, [favorites, favoriteFilter]);

    const tabConfigs = useMemo(() => {
        const stats = profile?.stats || {};
        return [
            { key: 'profile', label: '资料设置' },
            { key: 'followers', label: `粉丝 ${stats.followers ?? 0}` },
            { key: 'following', label: `关注 ${stats.following ?? 0}` },
            { key: 'favorites', label: `我的收藏 ${stats.favorites ?? 0}` },
            { key: 'search', label: '用户搜索' },
        ];
    }, [profile?.stats]);

    const theme = getModuleTheme('sale');

    if (!effectiveUser) {
        return <div className="text-sm text-gray-500">请先登录后再访问用户中心。</div>;
    }

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow p-6 flex flex-col md:flex-row gap-6">
                <div className="flex-shrink-0">
                    <img
                        src={avatarDisplay}
                        alt={formState.displayName || profile?.username || '用户头像'}
                        className="w-28 h-28 rounded-2xl object-cover border border-gray-200 shadow-sm"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = DEFAULT_AVATAR;
                        }}
                    />
                </div>
                <div className="flex-1 space-y-3">
                    <div>
                        <h2 className="text-2xl font-semibold text-gray-900">{profile?.profile?.displayName || profile?.username || '未命名用户'}</h2>
                        <p className="text-sm text-gray-500">账号 ID：{profile?.id}</p>
                        <p className="text-sm text-gray-500">注册时间：{formatDateTime(profile?.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <UserInfoBadge label="关注" value={profile?.stats?.following} />
                        <UserInfoBadge label="粉丝" value={profile?.stats?.followers} />
                        <UserInfoBadge label="发布" value={profile?.stats?.listings} />
                        <UserInfoBadge label="收藏" value={profile?.stats?.favorites} />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => onNavigate('home')}
                            className={`px-4 py-2 rounded-md text-sm text-white ${theme.buttonBg}`}
                        >
                            返回首页探索
                        </button>
                        <button
                            type="button"
                            onClick={() => onNavigate('myListings')}
                            className="px-4 py-2 rounded-md text-sm border border-gray-300 text-gray-700 hover:bg-gray-100"
                        >
                            管理我的发布
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="flex flex-wrap border-b border-gray-100">
                    {tabConfigs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab.key);
                                setFeedback('');
                            }}
                            className={`px-4 md:px-6 py-3 text-sm font-medium transition-colors ${
                                activeTab === tab.key
                                    ? 'text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="p-6 space-y-6">
                    {feedback && (
                        <div className="px-4 py-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md">
                            {feedback}
                        </div>
                    )}

                    {activeTab === 'profile' && (
                        <form onSubmit={handleSubmitProfile} className="max-w-3xl space-y-5">
                            {isProfileLoading ? (
                                <p className="text-sm text-gray-500">资料加载中...</p>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <label className="flex flex-col gap-2 text-sm">
                                            <span className="text-gray-600">昵称</span>
                                            <input
                                                type="text"
                                                name="displayName"
                                                value={formState.displayName}
                                                onChange={handleFormChange}
                                                placeholder="展示名称"
                                                className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-2 text-sm">
                                            <span className="text-gray-600">学号</span>
                                            <input
                                                type="text"
                                                name="studentId"
                                                value={formState.studentId}
                                                onChange={handleFormChange}
                                                placeholder="仅用于校内信任认证"
                                                className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-2 text-sm">
                                            <span className="text-gray-600">联系方式</span>
                                            <input
                                                type="text"
                                                name="contactPhone"
                                                value={formState.contactPhone}
                                                onChange={handleFormChange}
                                                placeholder="手机号或微信号"
                                                className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                                            />
                                        </label>
                                    </div>
                                    <div className="flex flex-col gap-2 text-sm">
                                        <span className="text-gray-600">上传头像</span>
                                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={avatarPreviewUrl || resolveAssetUrl(profile?.profile?.avatarUrl) || DEFAULT_AVATAR}
                                                    alt="头像预览"
                                                    className="w-16 h-16 rounded-xl object-cover border border-gray-200"
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = DEFAULT_AVATAR;
                                                    }}
                                                />
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleAvatarFileChange}
                                                    className="text-sm text-gray-600"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleUploadAvatar}
                                                disabled={avatarUploading}
                                                className={`px-4 py-2 rounded-md text-white ${
                                                    avatarUploading ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-500'
                                                }`}
                                            >
                                                {avatarUploading ? '上传中...' : '上传新头像'}
                                            </button>
                                        </div>
                                    </div>
                                    <label className="flex flex-col gap-2 text-sm">
                                        <span className="text-gray-600">个人简介</span>
                                        <textarea
                                            name="bio"
                                            rows={4}
                                            value={formState.bio}
                                            onChange={handleFormChange}
                                            placeholder="简单介绍自己，方便建立信任"
                                            className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                                        />
                                    </label>
                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={isProfileSaving}
                                            className={`px-5 py-2 rounded-md text-white ${
                                                isProfileSaving ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-500'
                                            }`}
                                        >
                                            {isProfileSaving ? '保存中...' : '保存修改'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </form>
                    )}

                    {activeTab === 'followers' && (
                        <div className="space-y-4">
                            {followersLoading ? (
                                <p className="text-sm text-gray-500">粉丝列表加载中...</p>
                            ) : followers.length === 0 ? (
                                <p className="text-sm text-gray-500">暂时还没有粉丝。</p>
                            ) : (
                                followers.map((item) => (
                                    <FollowUserCard
                                        key={item.id}
                                        item={item}
                                        onToggleFollow={handleToggleFollowFromList}
                                        onPreviewListings={(entry) => openUserProfile(entry.id)}
                                    />
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'following' && (
                        <div className="space-y-4">
                            {followingLoading ? (
                                <p className="text-sm text-gray-500">关注列表加载中...</p>
                            ) : following.length === 0 ? (
                                <p className="text-sm text-gray-500">暂未关注任何人。</p>
                            ) : (
                                following.map((item) => (
                                    <FollowUserCard
                                        key={item.id}
                                        item={item}
                                        onToggleFollow={handleToggleFollowFromList}
                                        onPreviewListings={(entry) => openUserProfile(entry.id)}
                                    />
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'favorites' && (
                        <div className="space-y-4">
                            {favoritesLoading ? (
                                <p className="text-sm text-gray-500">收藏列表加载中...</p>
                            ) : favorites.length === 0 ? (
                                <p className="text-sm text-gray-500">还没有收藏任何帖子，去首页逛逛吧。</p>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { key: 'all', label: '全部' },
                                            { key: 'sale', label: '出售' },
                                            { key: 'acquire', label: '收购' },
                                            { key: 'help', label: '帮帮忙' },
                                            { key: 'lostfound', label: '失物招领' },
                                        ].map((option) => (
                                            <button
                                                key={option.key}
                                                type="button"
                                                onClick={() => setFavoriteFilter(option.key)}
                                                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                                                    favoriteFilter === option.key
                                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-600 shadow-sm'
                                                        : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    {filteredFavorites.length === 0 ? (
                                        <p className="text-sm text-gray-500">该分类下暂无收藏内容。</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                            {filteredFavorites.map((item) => (
                                                <ListingCard
                                                    key={item.id}
                                                    item={item}
                                                    isFavorited={favoriteIdSet.has(item.id)}
                                                    onToggleFavorite={handleToggleFavorite}
                                                    onOpenDetail={handleOpenListingDetail}
                                                    theme={getModuleTheme(item.type || 'sale')}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'search' && (
                        <div className="space-y-5">
                            <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="输入昵称、用户名或学号"
                                    className="flex-1 min-w-[220px] px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500"
                                >
                                    搜索用户
                                </button>
                            </form>

                            {searchLoading ? (
                                <p className="text-sm text-gray-500">正在搜索，请稍候...</p>
                            ) : searchResults.length === 0 ? (
                                <p className="text-sm text-gray-500">{searchQuery ? '没有找到匹配的用户。' : '搜索并关注感兴趣的同学吧。'}</p>
                            ) : (
                                <div className="space-y-4">
                                    {searchResults.map((item) => (
                                        <FollowUserCard
                                            key={item.id}
                                            item={item}
                                            onToggleFollow={handleToggleFollowFromList}
                                            onPreviewListings={(entry) => openUserProfile(entry.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {viewedLoading && (
                <div className="bg-white rounded-2xl shadow p-6 mt-6">
                    <p className="text-sm text-gray-500">正在加载用户主页...</p>
                </div>
            )}

            {viewedUser && !viewedLoading && (
                <div className="bg-white rounded-2xl shadow p-6 space-y-5">
                    <div className="flex items-start gap-4">
                        <img
                            src={resolveAssetUrl(viewedUser.profile?.avatarUrl) || resolveAssetUrl(viewedUser.avatarUrl) || DEFAULT_AVATAR}
                            alt={viewedUser.profile?.displayName || viewedUser.username}
                            className="w-20 h-20 rounded-xl object-cover border border-gray-200"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = DEFAULT_AVATAR;
                            }}
                        />
                        <div className="flex-1 space-y-2">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-900">{viewedUser.profile?.displayName || viewedUser.username}</h3>
                                    <p className="text-sm text-gray-500">@{viewedUser.username}</p>
                                    {viewedUser.profile?.studentId && (
                                        <p className="text-sm text-gray-500">学号：{viewedUser.profile.studentId}</p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleToggleFollowForViewed}
                                        className={`px-4 py-2 rounded-md text-sm border ${
                                            viewedUser.relationship?.isFollowing
                                                ? 'border-gray-300 text-gray-700 hover:bg-gray-100'
                                                : 'border-amber-400 text-amber-600 bg-amber-50 hover:bg-amber-100'
                                        }`}
                                    >
                                        {viewedUser.relationship?.isFollowing ? '取消关注' : '关注'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setViewedUser(null);
                                            setViewedListings([]);
                                            setViewedLoading(false);
                                        }}
                                        className="px-4 py-2 rounded-md text-sm border border-gray-300 text-gray-600 hover:bg-gray-100"
                                    >
                                        关闭
                                    </button>
                                </div>
                            </div>
                            {viewedUser.profile?.bio && <p className="text-sm text-gray-600">{viewedUser.profile.bio}</p>}
                            <div className="flex gap-4 text-xs text-gray-500">
                                <span>关注 {viewedUser.stats?.following ?? 0}</span>
                                <span>粉丝 {viewedUser.stats?.followers ?? 0}</span>
                                <span>发布 {viewedUser.stats?.listings ?? 0}</span>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-5 space-y-4">
                        <h4 className="text-lg font-semibold text-gray-800">TA 的发布</h4>
                        {viewedListings.length === 0 ? (
                            <p className="text-sm text-gray-500">该用户暂无发布内容。</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {viewedListings.map((item) => (
                                    <ListingCard
                                        key={item.id}
                                        item={item}
                                        isFavorited={favoriteIdSet.has(item.id)}
                                        onToggleFavorite={handleToggleFavorite}
                                        onContact={handleContactViewedListing}
                                        onOpenDetail={handleOpenListingDetail}
                                        theme={getModuleTheme(item.type || 'sale')}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isDetailOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4 py-6">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h3 className="text-xl font-semibold text-gray-900">
                                {detailListing?.type === 'sale' ? '商品详情' : '帖子详情'}
                            </h3>
                            <button
                                type="button"
                                onClick={handleCloseListingDetail}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="关闭详情"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                            {detailLoading && <p className="text-center text-gray-500 py-10">加载详情中...</p>}
                            {detailError && !detailLoading && (
                                <p className="text-center text-red-500 py-4">{detailError}</p>
                            )}
                            {!detailLoading && detailListing && (
                                <>
                                    <div className="space-y-3">
                                        <h4 className="text-2xl font-bold text-gray-900">{detailListing.title}</h4>
                                        <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                                            <span>类型：{detailTypeLabel}</span>
                                            {detailListing.category && <span>分类：{detailListing.category}</span>}
                                            <span>发布者：{detailListing.owner_name || detailListing.user_name}</span>
                                            <span>发布时间：{formatDateTime(detailListing.created_at)}</span>
                                        </div>
                                        {detailListing.type === 'sale' && (
                                            <div className="text-2xl font-semibold text-emerald-600">
                                                {detailListing.price ? `¥${Number(detailListing.price).toLocaleString()}` : '议价'}
                                            </div>
                                        )}

                                        {/* 添加出发地点和目的地点显示 */}
                                        {(detailListing.category === '跑腿服务' || detailListing.category === 'errand') && (
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

                                        {detailGalleryImages.length > 0 && (
                                            <div className="space-y-3">
                                                <div className="relative">
                                                    <img
                                                        src={detailGalleryImages[Math.min(detailActiveImageIndex, detailGalleryImages.length - 1)]?.url}
                                                        alt={detailListing.title}
                                                        className="w-full rounded-lg border border-gray-100 object-cover max-h-96"
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.src = getDefaultListingImage(detailImageFallbackType) || FALLBACK_IMAGE;
                                                        }}
                                                    />
                                                    {detailGalleryImages.length > 1 && (
                                                        <span className="absolute top-2 right-2 px-2 py-0.5 text-xs bg-black/60 text-white rounded-full">
                                                            {detailActiveImageIndex + 1} / {detailGalleryImages.length}
                                                        </span>
                                                    )}
                                                </div>
                                                {detailGalleryImages.length > 1 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {detailGalleryImages.map((image, index) => (
                                                            <button
                                                                type="button"
                                                                key={image.id ?? index}
                                                                onClick={() => setDetailActiveImageIndex(index)}
                                                                className={`relative w-16 h-16 rounded-lg overflow-hidden border ${
                                                                    index === detailActiveImageIndex
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
                                value={detailReplyContent}
                                onChange={(e) => setDetailReplyContent(e.target.value)}
                                placeholder={effectiveUser ? '输入你的回复...' : '登录后才能回复'}
                                rows={3}
                                disabled={!effectiveUser || detailLoading || !detailListing}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                            />
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-3">
                                <div className="flex flex-wrap gap-2">
                                    {detailListing && detailOwnerId && detailOwnerId !== effectiveUser?.id && (
                                        <button
                                            type="button"
                                            onClick={() => handleContactFromDetail(detailListing)}
                                            className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                                        >
                                            联系对方
                                        </button>
                                    )}
                                    {detailListing && detailListing.type === 'sale' && detailOwnerId && detailOwnerId !== effectiveUser?.id && detailListing.status === 'available' && (
                                        <button
                                            type="button"
                                            onClick={() => handlePurchaseFromDetail(detailListing)}
                                            className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
                                        >
                                            立即购买
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDetailReplySubmit}
                                    disabled={!effectiveUser || detailLoading || !detailListing}
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

export default UserCenterPage;
