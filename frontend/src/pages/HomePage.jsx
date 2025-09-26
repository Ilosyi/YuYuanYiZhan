// frontend/src/pages/HomePage.jsx
// 版本: 1.1 - 实现动态分类筛选

import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import ListingCard from '../components/ListingCard'; // 确保已导入 ListingCard
import { useAuth } from '../context/AuthContext';

const HomePage = () => {
    const [activeMode, setActiveMode] = useState('sale'); // 当前选中的模式
    const [listings, setListings] = useState([]); // 帖子列表
    const [isLoading, setIsLoading] = useState(false); // 加载状态
    const [error, setError] = useState(null); // 错误信息

    const [searchTerm, setSearchTerm] = useState(''); // 搜索关键词
    const [category, setCategory] = useState('all'); // 当前选中的分类

    // 定义不同模式下的分类选项
    const categoriesConfig = {
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
            lost: '寻物启事', // 寻找丢失的物品
            found: '失物招领', // 发现并招领物品
        },
    };

    // 模式文本映射
    const modeText = { 
        sale: '出售', 
        acquire: '收购', 
        help: '帮帮忙', 
        lostfound: '失物招领' 
    };

    // 获取当前模式下的分类选项
    const currentCategories = categoriesConfig[activeMode];

    // 当 activeMode 变化时，重置 category 为当前模式的 'all' 选项
    useEffect(() => {
        setCategory('all');
        setSearchTerm(''); // 切换模式时也清除搜索词
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
                    category: category !== 'all' ? category : undefined, // 只有非'all'才发送category
                }
            });
            setListings(response.data);
        } catch (err) {
            setError('数据加载失败，请稍后再试。');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [activeMode, searchTerm, category]);

    useEffect(() => {
        const debounceFetch = setTimeout(() => {
            fetchListings();
        }, 300); // 添加防抖，优化搜索体验

        return () => clearTimeout(debounceFetch); // 清除定时器
    }, [fetchListings]); // 依赖项现在只包含 fetchListings

    const { user } = useAuth(); // 获取当前登录用户

   
    // ✅ 核心更新：实现完整的购买逻辑
    const handlePurchase = async (item) => {
        if (!user) {
            alert('请先登录再进行购买！');
            return;
        }
        if (window.confirm(`确定要以 ¥${item.price} 的价格购买 "${item.title}" 吗？`)) {
            try {
                const response = await api.post('/api/orders', { listingId: item.id });
                alert('下单成功！请前往“我的订单”页面查看并完成支付。');
                onNavigate('myOrders'); // 下单成功后，自动跳转到订单页面
            } catch (error) {
                alert(error.response?.data?.message || '下单失败，该商品可能已被预定或不存在。');
                console.error(error);
                fetchListings(); // 如果下单失败，刷新列表以获取最新状态
            }
        }
    };

    const handleContact = (item) => {
        alert(`功能待实现: 联系 ${item.user_name} 关于 ${item.title}`);
        onNavigate('messages'); // 点击联系后，跳转到消息页面
    };

    return (
        <div>
            <div className="mb-6 bg-white p-4 rounded-lg shadow">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    {/* 模式切换按钮 */}
                    <div className="flex border border-gray-200 rounded-md">
                        {Object.keys(modeText).map(mode => (
                            <button key={mode} onClick={() => setActiveMode(mode)}
                                className={`px-4 py-2 text-sm font-medium transition-colors duration-200 
                                            ${activeMode === mode ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-indigo-50'} 
                                            first:rounded-l-md last:rounded-r-md`}>
                                {modeText[mode]}
                            </button>
                        ))}
                    </div>
                    {/* 搜索框和动态分类选择 */}
                    <div className="flex-grow flex flex-col md:flex-row gap-4 w-full md:w-auto">
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={`搜索"${modeText[activeMode]}"...`} className="w-full px-4 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        <select value={category} onChange={e => setCategory(e.target.value)} className="px-4 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white min-w-[120px]">
                            {Object.entries(currentCategories).map(([key, value]) => (
                                <option key={key} value={key}>{value}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            {isLoading ? <p className="text-center text-gray-500 py-10">加载中...</p> : error ? <p className="text-center text-red-500 py-10">{error}</p> : (
                listings.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {listings.map(item => (
                            <ListingCard key={item.id} item={item} onPurchase={handlePurchase} onContact={handleContact} />
                        ))}
                    </div>
                ) : <p className="text-center text-gray-500 py-10">当前分类下暂无内容。</p>
            )}
        </div>
    );
};

export default HomePage;