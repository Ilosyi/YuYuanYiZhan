import React from 'react';

// '我的消息' 主页面组件
const MyMessagesPage = ({ currentUser }) => {
    // 在真实应用中，这里会从API获取会话列表
    const mockConversations = [
        { id: 1, otherUser: '李四', lastMessage: '你好，自行车还在吗？', listingTitle: '求购二手自行车', timestamp: '昨天 18:30' },
        { id: 2, otherUser: '王五', lastMessage: '好的，明天下午在西十二教学楼门口交易。', listingTitle: '专业相机 Canon EOS R5', timestamp: '2天前' },
    ];

    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">我的消息</h2>
            
            <div className="bg-white rounded-lg shadow-md">
                <ul className="divide-y divide-gray-200">
                    {mockConversations.map(convo => (
                        <li key={convo.id} className="p-4 hover:bg-gray-50 cursor-pointer">
                            <div className="flex justify-between items-center">
                                <p className="font-semibold text-gray-800">{convo.otherUser}</p>
                                <p className="text-xs text-gray-400">{convo.timestamp}</p>
                            </div>
                            <p className="text-sm text-gray-600 mt-1 truncate">
                                <span className="font-medium">[{convo.listingTitle}]</span> {convo.lastMessage}
                            </p>
                        </li>
                    ))}
                </ul>
                {mockConversations.length === 0 && <p className="p-6 text-center text-gray-500">你还没有任何消息。</p>}
            </div>
        </div>
    );
};

export default MyMessagesPage;