import React, { useState, useEffect } from 'react';
import api from '../api';
import ListingCard from '../components/ListingCard';

const HomePage = () => {
    const [activeMode, setActiveMode] = useState('sale');
    const [listings, setListings] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState('all');

    useEffect(() => {
        const fetchListings = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await api.get('/api/listings', {
                    params: { 
                        type: activeMode,
                        searchTerm: searchTerm || undefined, // 如果为空则不发送该参数
                        category: category !== 'all' ? category : undefined,
                    }
                });
                setListings(response.data);
            } catch (err) {
                setError('数据加载失败，请稍后再试。');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        
        const debounceFetch = setTimeout(() => {
            fetchListings();
        }, 300); // 添加防抖，优化搜索体验

        return () => clearTimeout(debounceFetch); // 清除定时器
    }, [activeMode, searchTerm, category]);

    const handlePurchase = (item) => {
        // TODO: 第二部分实现
        alert(`即将购买: ${item.title}`);
    };

    const handleContact = (item) => {
        // TODO: 第三部分实现
        alert(`即将联系发布者: ${item.user_name}`);
    };

    const modeText = { sale: '购买', acquire: '收购', help: '帮帮忙', lostfound: '失物招领' };
    const categories = {
        sale: { all: '所有分类', electronics: '电子产品', books: '图书教材', life: '生活用品', others: '其他' },
        acquire: { all: '所有分类', electronics: '电子产品', books: '图书教材', life: '生活用品', others: '其他' },
        help: { all: '所有类型', course: '课程相关', study: '学习问题', life: '生活咨询', others: '其他求助' },
        lostfound: { all: '全部', lost: '寻物启事', found: '失物招领' },
    };

    return (
        <div>
            <div className="mb-6 bg-white p-4 rounded-lg shadow">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex border border-gray-200 rounded-md">
                        {Object.keys(modeText).map(mode => (
                            <button key={mode} onClick={() => setActiveMode(mode)}
                                className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${activeMode === mode ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-indigo-50'} first:rounded-l-md last:rounded-r-md`}>
                                {modeText[mode]}
                            </button>
                        ))}
                    </div>
                    <div className="flex-grow flex gap-4 w-full md:w-auto">
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={`在"${modeText[activeMode]}"中搜索...`} className="w-full px-4 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        <select value={category} onChange={e => setCategory(e.target.value)} className="px-4 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                            {Object.entries(categories[activeMode]).map(([key, value]) => (
                                <option key={key} value={key}>{value}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            {isLoading ? <p className="text-center text-gray-500 py-10">加载中...</p> : error ? <p className="text-center text-red-500 py-10">{error}</p> : (
                listings.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {listings.map(item => <ListingCard key={item.id} item={item} onPurchase={handlePurchase} onContact={handleContact} />)}
                    </div>
                ) : <p className="text-center text-gray-500 py-10">当前分类下暂无内容。</p>
            )}
        </div>
    );
};

export default HomePage;