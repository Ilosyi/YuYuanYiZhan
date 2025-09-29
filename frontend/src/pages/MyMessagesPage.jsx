import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { API_BASE_URL, resolveAssetUrl } from '../api';
import { useAuth } from '../context/AuthContext';

const formatTime = (value) => {
    if (!value) return '';
    try {
        const date = new Date(value);
        const now = new Date();
        const sameDay =
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();
        return sameDay
            ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    } catch {
        return value;
    }
};

const buildWebSocketUrl = (token) => {
    const base = new URL(API_BASE_URL);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${base.host}/ws?token=${token}`;
};

const resolveImageUrl = (value) => {
    if (!value) return null;
    const resolved = resolveAssetUrl(value);
    return resolved || null;
};

const ListingPreview = ({ listing, onAction, isProcessing }) => {
    if (!listing || !['sale', 'acquire'].includes(listing.type)) {
        return null;
    }

    const actionLabel = listing.type === 'sale' ? '立即购买' : '立即出售';

    return (
        <div className="border-b border-gray-100 bg-white/70 backdrop-blur-sm px-6 py-3">
            <div className="flex items-center gap-4">
                {listing.imageUrl ? (
                    <img
                        src={listing.imageUrl}
                        alt={listing.title}
                        className="w-16 h-16 rounded-lg object-cover border border-gray-100"
                    />
                ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                        无图
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-500">关联{listing.type === 'sale' ? '商品' : '求购'}：</p>
                    <p className="text-base font-semibold text-gray-800 truncate">{listing.title}</p>
                    {listing.type === 'sale' && (
                        <p className="text-sm text-rose-500 mt-1">¥{Number(listing.price || 0).toLocaleString()}</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onAction}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-sm font-medium rounded-full border border-indigo-500 text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
                >
                    {isProcessing ? '处理中...' : actionLabel}
                </button>
            </div>
        </div>
    );
};

const ChatBubble = ({ message, isOwn }) => (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
        <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
            isOwn ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none'
        }`}>
            <div className="whitespace-pre-line leading-relaxed">{message.content}</div>
            <span className={`block mt-1 text-[11px] ${isOwn ? 'text-indigo-100 text-right' : 'text-gray-400'}`}>
                {formatTime(message.createdAt || message.created_at)}
            </span>
        </div>
    </div>
);

const ConversationItem = ({ conversation, isActive, onSelect }) => (
    <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
            isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'
        }`}
    >
        <div className="flex items-center justify-between">
            <p className="font-medium text-gray-800">{conversation.otherUsername}</p>
            <span className="text-xs text-gray-400">{formatTime(conversation.lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between mt-1 text-sm text-gray-500">
            <p className="truncate max-w-[80%]">{conversation.lastMessage || '暂未开始对话'}</p>
            {conversation.unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs text-white bg-red-500 rounded-full">
                    {conversation.unreadCount}
                </span>
            )}
        </div>
    </button>
);

const MyMessagesPage = () => {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [conversationsLoading, setConversationsLoading] = useState(false);
    const [conversationsReady, setConversationsReady] = useState(false);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [wsConnected, setWsConnected] = useState(false);
    const [conversationMeta, setConversationMeta] = useState({});
    const [activeListing, setActiveListing] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const wsRef = useRef(null);
    const pendingConversationHandled = useRef(false);
    const messagesEndRef = useRef(null);
    const selectedConversationRef = useRef(null);
    const listingCacheRef = useRef(new Map());

    const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('accessToken')), []);
    const userId = user?.id;

    const upsertConversationMeta = useCallback((otherUserId, listing) => {
        if (!otherUserId || !listing) return;
        setConversationMeta(prev => {
            const existing = prev[otherUserId];
            if (existing && existing.id === listing.id) {
                const merged = { ...existing, ...listing };
                if (existing === merged) {
                    return prev;
                }
                return { ...prev, [otherUserId]: merged };
            }
            return { ...prev, [otherUserId]: listing };
        });
    }, []);

    const loadListingSnapshot = useCallback(async (listingId) => {
        if (!listingId) return null;
        const cache = listingCacheRef.current;
        if (cache.has(listingId)) {
            return cache.get(listingId);
        }
        try {
            const { data } = await api.get(`/api/listings/${listingId}/detail`);
            const listing = data?.listing;
            if (!listing) {
                cache.set(listingId, null);
                return null;
            }
            const summary = {
                id: listing.id,
                type: listing.type,
                title: listing.title,
                price: listing.price,
                imageUrl: resolveImageUrl(listing.image_url),
                ownerId: listing.user_id,
                ownerName: listing.owner_name || listing.user_name || '',
            };
            cache.set(listingId, summary);
            return summary;
        } catch (error) {
            console.error('Failed to load listing snapshot:', error);
            listingCacheRef.current.set(listingId, null);
            return null;
        }
    }, []);

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    useEffect(() => {
        if (!selectedConversation) {
            setActiveListing(null);
            return;
        }
        const meta = conversationMeta[selectedConversation.otherUserId];
        if (meta) {
            setActiveListing(meta);
        }
    }, [selectedConversation, conversationMeta]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const fetchConversations = useCallback(async () => {
        setConversationsLoading(true);
        try {
            const { data } = await api.get('/api/messages/conversations');
            let next = Array.isArray(data) ? [...data] : [];
            const current = selectedConversationRef.current;
            if (current && !next.some(item => item.otherUserId === current.otherUserId)) {
                next = [
                    {
                        otherUserId: current.otherUserId,
                        otherUsername: current.otherUsername,
                        lastMessage: '',
                        lastMessageAt: null,
                        unreadCount: 0,
                    },
                    ...next,
                ];
            }
            setConversations(next);
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
        } finally {
            setConversationsLoading(false);
            setConversationsReady(true);
        }
    }, []);

    const fetchMessages = useCallback(async (otherUserId, username, options = {}) => {
        setMessagesLoading(true);
        const { listingHint = null } = options;
        try {
            const { data } = await api.get(`/api/messages/conversations/${otherUserId}/messages`);
            const fetchedMessages = data.messages || [];
            setMessages(fetchedMessages);

            const resolved = {
                otherUserId,
                otherUsername: data.otherUser?.username || username,
            };
            setSelectedConversation(resolved);
            selectedConversationRef.current = resolved;

            let listingSummary = listingHint || conversationMeta[otherUserId] || null;
            if (!listingSummary) {
                const lastWithListing = [...fetchedMessages].reverse().find(item => item.listing_id || item.listingId);
                if (lastWithListing) {
                    const listingId = lastWithListing.listing_id || lastWithListing.listingId;
                    listingSummary = await loadListingSnapshot(listingId);
                }
            }

            if (listingSummary) {
                setActiveListing(listingSummary);
                upsertConversationMeta(otherUserId, listingSummary);
            } else if (!listingHint) {
                setActiveListing(null);
            }

            await api.post(`/api/messages/conversations/${otherUserId}/read`);
            setConversations(prev =>
                prev.map(item =>
                    item.otherUserId === otherUserId ? { ...item, unreadCount: 0 } : item
                )
            );
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        } finally {
            setMessagesLoading(false);
        }
    }, [conversationMeta, loadListingSnapshot, upsertConversationMeta]);

    useEffect(() => {
        selectedConversationRef.current = selectedConversation;
    }, [selectedConversation]);

    useEffect(() => {
        if (!userId) return;
        fetchConversations();
    }, [fetchConversations, userId]);

    useEffect(() => {
        if (!token || !userId) return;
        const wsUrl = buildWebSocketUrl(token);
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
            setWsConnected(true);
        };

        socket.onclose = () => {
            setWsConnected(false);
        };

        socket.onerror = (event) => {
            console.error('WebSocket error:', event);
        };

        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload) return;
                switch (payload.type) {
                    case 'message': {
                        const msg = payload.data;
                        if (!msg) return;
                        const conversationUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
                        const listingId = msg.listingId || msg.listing_id;
                        const activeConversation = selectedConversationRef.current;
                        setMessages(prev => {
                            if (activeConversation && conversationUserId === activeConversation.otherUserId) {
                                return [...prev, msg];
                            }
                            return prev;
                        });
                        setConversations(prev => {
                            const existing = prev.find(item => item.otherUserId === conversationUserId);
                            const filtered = prev.filter(item => item.otherUserId !== conversationUserId);
                            const unreadIncrement =
                                activeConversation && conversationUserId === activeConversation.otherUserId
                                    ? 0
                                    : msg.receiverId === userId
                                        ? 1
                                        : 0;
                            const updatedConversation = existing
                                ? {
                                      ...existing,
                                      lastMessage: msg.content,
                                      lastMessageAt: msg.createdAt,
                                      unreadCount: Math.min(99, (existing.unreadCount || 0) + unreadIncrement),
                                  }
                                : {
                                      otherUserId: conversationUserId,
                                      otherUsername: msg.senderId === userId ? msg.receiverUsername : msg.senderUsername,
                                      lastMessage: msg.content,
                                      lastMessageAt: msg.createdAt,
                                      unreadCount: unreadIncrement,
                                  };
                            return [updatedConversation, ...filtered];
                        });
                        if (listingId) {
                            loadListingSnapshot(listingId).then(summary => {
                                if (!summary) return;
                                upsertConversationMeta(conversationUserId, summary);
                                const current = selectedConversationRef.current;
                                if (current && current.otherUserId === conversationUserId) {
                                    setActiveListing(summary);
                                }
                            });
                        }
                        break;
                    }
                    case 'conversation:update': {
                        const summary = payload.data;
                        if (!summary) return;
                        setConversations(prev => {
                            const filtered = prev.filter(item => item.otherUserId !== summary.otherUserId);
                            return [summary, ...filtered];
                        });
                        break;
                    }
                    case 'error': {
                        console.error('WebSocket error payload:', payload.message);
                        break;
                    }
                    default:
                        break;
                }
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };

        return () => {
            socket.close();
            wsRef.current = null;
            setWsConnected(false);
        };
    }, [token, userId, loadListingSnapshot, upsertConversationMeta]);

    useEffect(() => {
        if (pendingConversationHandled.current) return;
        if (!conversationsReady) return;
        const raw = localStorage.getItem('yy_pending_chat');
        if (!raw) return;

        const processPending = async () => {
            localStorage.removeItem('yy_pending_chat');
            try {
                const pending = JSON.parse(raw);
                if (!pending?.userId) return;

                const listingHint = pending.listing
                    ? {
                          ...pending.listing,
                          imageUrl: resolveImageUrl(pending.listing.imageUrl || pending.listing.image_url || ''),
                      }
                    : null;

                if (listingHint) {
                    upsertConversationMeta(pending.userId, listingHint);
                    setActiveListing(listingHint);
                }

                const existing = conversations.find(item => item.otherUserId === pending.userId);
                const placeholderUsername = existing?.otherUsername || pending.username || '同学';
                const targetId = existing?.otherUserId || pending.userId;

                setConversations(prev => {
                    if (prev.some(item => item.otherUserId === targetId)) {
                        return prev;
                    }
                    return [
                        {
                            otherUserId: targetId,
                            otherUsername: placeholderUsername,
                            lastMessage: existing?.lastMessage || '',
                            lastMessageAt: existing?.lastMessageAt || null,
                            unreadCount: existing?.unreadCount || 0,
                        },
                        ...prev,
                    ];
                });

                const immediateSelection = { otherUserId: targetId, otherUsername: placeholderUsername };
                setSelectedConversation(immediateSelection);
                selectedConversationRef.current = immediateSelection;
                setMessages([]);

                await fetchMessages(targetId, placeholderUsername, { listingHint });
                pendingConversationHandled.current = true;
            } catch (error) {
                console.warn('Failed to parse pending chat:', error);
            }
        };

        processPending();
    }, [conversationsReady, conversations, fetchMessages, upsertConversationMeta]);

    const handleSelectConversation = (conversation) => {
        const meta = conversationMeta[conversation.otherUserId];
        if (meta) {
            setActiveListing(meta);
        } else {
            setActiveListing(null);
        }
        fetchMessages(conversation.otherUserId, conversation.otherUsername, { listingHint: meta });
    };

    const handleListingAction = async () => {
        if (actionLoading) return;
        if (!activeListing) return;
        if (activeListing.type === 'sale') {
            if (!userId) {
                alert('请登录后再购买。');
                return;
            }
            if (activeListing.ownerId && activeListing.ownerId === userId) {
                alert('这是您自己发布的商品。');
                return;
            }
            if (!window.confirm(`确定以 ¥${Number(activeListing.price || 0).toLocaleString()} 购买「${activeListing.title}」吗？`)) {
                return;
            }
            setActionLoading(true);
            try {
                await api.post('/api/orders', { listingId: activeListing.id });
                alert('下单成功！可在“我的订单”中查看进度。');
            } catch (error) {
                alert(error.response?.data?.message || '下单失败，请稍后再试。');
            } finally {
                setActionLoading(false);
            }
        } else if (activeListing.type === 'acquire') {
            const template = `你好，我可以出售「${activeListing.title}」，方便聊聊细节吗？`;
            setInputValue(prev => (prev && prev.trim() ? prev : template));
        }
    };

    const handleSendMessage = () => {
        if (!selectedConversation) return;
        const text = inputValue.trim();
        if (!text) return;
        if (!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            alert('消息通道未连接，请稍后再试。');
            return;
        }
        wsRef.current.send(
            JSON.stringify({
                type: 'message',
                toUserId: selectedConversation.otherUserId,
                content: text,
                listingId: activeListing?.id || undefined,
            })
        );
        setInputValue('');
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
    };

    if (!userId) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold text-gray-800">消息中心</h2>
                </div>
                <div className="bg-white rounded-2xl shadow-lg p-12 text-center text-gray-500">
                    请登录后查看消息。
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-gray-800">消息中心</h2>
                <span className={`text-sm ${wsConnected ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {wsConnected ? '实时连接已建立' : '正在连接...'}
                </span>
            </div>

            <div className="bg-white rounded-2xl shadow-lg overflow-hidden h-[70vh] flex">
                <aside className="w-1/3 border-r border-gray-100 flex flex-col">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-700">会话列表</h3>
                        <button
                            type="button"
                            onClick={fetchConversations}
                            className="text-xs text-indigo-500 hover:text-indigo-600"
                        >
                            刷新
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {conversationsLoading ? (
                            <p className="p-4 text-sm text-gray-500">正在加载会话...</p>
                        ) : conversations.length === 0 ? (
                            <p className="p-4 text-sm text-gray-500">暂无消息，去首页和同学互动吧～</p>
                        ) : (
                            conversations.map(conversation => (
                                <ConversationItem
                                    key={conversation.otherUserId}
                                    conversation={conversation}
                                    isActive={selectedConversation?.otherUserId === conversation.otherUserId}
                                    onSelect={() => handleSelectConversation(conversation)}
                                />
                            ))
                        )}
                    </div>
                </aside>

                <section className="w-2/3 flex flex-col">
                    {selectedConversation ? (
                        <>
                            <header className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                                <div>
                                    <p className="text-lg font-semibold text-gray-800">{selectedConversation.otherUsername}</p>
                                    <p className="text-xs text-gray-400">保持礼貌，文明交流</p>
                                </div>
                            </header>

                            <ListingPreview
                                listing={activeListing}
                                onAction={handleListingAction}
                                isProcessing={actionLoading}
                            />

                            <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-4">
                                {messagesLoading ? (
                                    <p className="text-center text-gray-500 mt-10">正在加载聊天记录...</p>
                                ) : messages.length === 0 ? (
                                    <p className="text-center text-gray-400 mt-10">开启对话，友好交流吧～</p>
                                ) : (
                                    messages.map(message => (
                                        <ChatBubble
                                            key={message.id || `${message.senderId || message.sender_id}-${message.createdAt || message.created_at}-${message.content?.slice(0, 10)}`}
                                            message={message}
                                            isOwn={message.sender_id ? message.sender_id === userId : message.senderId === userId}
                                        />
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <footer className="border-t border-gray-100 bg-white px-6 py-4">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 focus-within:border-indigo-400 transition-colors">
                                    <textarea
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        rows={3}
                                        placeholder="输入消息，按 Enter 发送"
                                        className="w-full bg-transparent resize-none px-4 py-3 text-sm focus:outline-none"
                                    />
                                    <div className="flex justify-between items-center px-4 pb-3">
                                        <span className="text-xs text-gray-400">请勿发送垃圾广告或违规内容</span>
                                        <button
                                            type="button"
                                            onClick={handleSendMessage}
                                            disabled={!inputValue.trim()}
                                            className="px-4 py-1.5 text-sm font-medium rounded-full bg-indigo-600 text-white disabled:bg-indigo-300"
                                        >
                                            发送
                                        </button>
                                    </div>
                                </div>
                            </footer>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                            <svg className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            <p className="text-sm">选择或发起一个会话，开始聊天</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default MyMessagesPage;