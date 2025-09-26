import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

// '我的发布' 卡片组件
const MyListingCard = ({ item, onEdit, onDelete }) => {
    const statusText = { available: '上架中', in_progress: '交易中', completed: '已完成' };
    const statusColor = { available: 'bg-green-100 text-green-800', in_progress: 'bg-yellow-100 text-yellow-800', completed: 'bg-gray-100 text-gray-800' };
    const imageUrl = item.image_url?.startsWith('http') ? item.image_url : `${API_BASE_URL}${item.image_url}`;

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
            <div className="h-40 bg-gray-200"><img src={imageUrl} alt={item.title} className="w-full h-full object-cover"/></div>
            <div className="p-4 flex-grow flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="text-md font-semibold text-gray-900 line-clamp-2">{item.title}</h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${statusColor[item.status]}`}>
                            {statusText[item.status]}
                        </span>
                    </div>
                    {item.price > 0 && <p className="text-lg font-bold text-indigo-600">¥{item.price}</p>}
                </div>
                <div className="mt-4 flex space-x-2">
                    <button onClick={() => onEdit(item)} className="flex-1 text-sm bg-yellow-500 text-white rounded px-3 py-2 hover:bg-yellow-600">编辑</button>
                    <button onClick={() => onDelete(item.id)} className="flex-1 text-sm bg-red-500 text-white rounded px-3 py-2 hover:bg-red-600">删除</button>
                </div>
            </div>
        </div>
    );
};

// '我的发布' 主页面组件
const MyListingsPage = ({ currentUser, onEditListing }) => {
    const [myListings, setMyListings] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const statuses = {
        all: '全部',
        available: '上架中',
        in_progress: '交易中',
        completed: '已完成',
    };

    useEffect(() => {
        const fetchMyListings = async () => {
            if (!currentUser) return;
            setIsLoading(true);
            setError(null);
            try {
                const response = await axios.get(`${API_BASE_URL}/api/listings`, {
                    params: {
                        userId: currentUser.id,
                        status: filterStatus,
                    }
                });
                setMyListings(response.data);
            } catch (err) {
                setError('加载我的发布失败，请稍后重试。');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMyListings();
    }, [currentUser, filterStatus]);
    
    const handleDelete = async (listingId) => {
        if (window.confirm('确定要删除这个发布吗？')) {
            try {
                await axios.delete(`${API_BASE_URL}/api/listings/${listingId}`);
                // 重新加载列表
                setMyListings(prev => prev.filter(item => item.id !== listingId));
                alert('删除成功！');
            } catch (err) {
                alert('删除失败，请稍后再试。');
                console.error(err);
            }
        }
    };


    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">我的发布</h2>
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">发布新内容</button>
            </div>

            {/* Status Filter */}
            <div className="flex space-x-2 mb-6 bg-white p-2 rounded-lg shadow-sm">
                {Object.entries(statuses).map(([key, value]) => (
                    <button
                        key={key}
                        onClick={() => setFilterStatus(key)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            filterStatus === key ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        {value}
                    </button>
                ))}
            </div>

            {/* Listings Grid */}
            {isLoading ? <p>加载中...</p> : error ? <p className="text-red-500">{error}</p> : (
                myListings.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {myListings.map(item => (
                            <MyListingCard key={item.id} item={item} onEdit={onEditListing} onDelete={handleDelete} />
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 mt-10">你还没有发布任何内容。</p>
                )
            )}
        </div>
    );
};

export default MyListingsPage;