// frontend/src/pages/MyListingsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import MyListingCard from '../components/MyListingCard'; // 假设 MyListingCard 是一个独立组件

const MyListingsPage = ({ currentUser, onEditListing }) => {
    const [myListings, setMyListings] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterType, setFilterType] = useState('all'); // ✅ 新增：类型筛选状态
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const statuses = { all: '全部状态', available: '上架中', in_progress: '交易中', completed: '已完成' };
    const types = { all: '全部分类', sale: '出售', acquire: '收购', help: '帮帮忙', lostfound: '失物招领' }; // ✅ 新增：类型定义

    const fetchMyListings = useCallback(async () => {
        if (!currentUser) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.get('/api/listings', {
                params: {
                    userId: currentUser.id,
                    status: filterStatus !== 'all' ? filterStatus : undefined,
                    type: filterType !== 'all' ? filterType : undefined, // ✅ 新增：将类型参数传给API
                }
            });
            setMyListings(response.data);
        } catch (err) {
            setError('加载我的发布失败，请稍后重试。');
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, filterStatus, filterType]); // ✅ 新增：依赖项

    useEffect(() => {
        fetchMyListings();
    }, [fetchMyListings]);

    const handleDelete = async (listingId) => {
        if (window.confirm('确定要删除这个发布吗？此操作不可恢复。')) {
            try {
                await api.delete(`/api/listings/${listingId}`);
                fetchMyListings();
                alert('删除成功！');
            } catch (err) {
                alert(err.response?.data?.message || '删除失败，请稍后再试。');
            }
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">我的发布</h2>
                <button onClick={() => onEditListing(null)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">发布新内容</button>
            </div>
            
            {/* ✅ 新增：类型筛选栏 */}
            <div className="flex flex-wrap gap-2 mb-4">
                <span className="self-center text-sm font-medium text-gray-600">类型:</span>
                {Object.entries(types).map(([key, value]) => (
                    <button key={key} onClick={() => setFilterType(key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType === key ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                        {value}
                    </button>
                ))}
            </div>
            
            {/* 状态筛选栏 */}
            <div className="flex flex-wrap gap-2 mb-6">
                <span className="self-center text-sm font-medium text-gray-600">状态:</span>
                {Object.entries(statuses).map(([key, value]) => (
                    <button key={key} onClick={() => setFilterStatus(key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === key ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                        {value}
                    </button>
                ))}
            </div>

            {/* Listings Grid */}
            {isLoading ? <p>加载中...</p> : error ? <p className="text-red-500">{error}</p> : (
                myListings.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {myListings.map(item => (
                            <MyListingCard key={item.id} item={item} onEdit={() => onEditListing(item)} onDelete={() => handleDelete(item.id)} />
                        ))}
                    </div>
                ) : <p className="text-center text-gray-500 mt-10">你还没有发布任何内容。</p>
            )}
        </div>
    );
};

// 建议将 MyListingCard 放到自己的文件中，例如 src/components/MyListingCard.jsx
// ... MyListingCard 组件定义 ...

export default MyListingsPage;
