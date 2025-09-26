// =================================================================
// “喻园易站” - 后端服务器主文件
// 版本: 1.3 - 实现完整的订单状态流转API
// =================================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs'); // 新增: 用于删除图片文件
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// =================================================================
// 1. 中间件配置 (Middleware Configuration)
// =================================================================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =================================================================
// 2. 数据库连接池 (Database Pool)
// =================================================================
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+08:00'
});

// =================================================================
// 3. 文件上传配置 (Multer File Upload)
// =================================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// =================================================================
// 4. 认证中间件 (Authentication Middleware)
// =================================================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// =================================================================
// 5. API 路由定义 (API Routes)
// =================================================================

// --- 5.1 用户认证路由 (Auth Routes) ---
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || password.length < 6) {
        return res.status(400).json({ message: 'Username and password (min 6 chars) are required.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword]
        );
        res.status(201).json({ message: 'User registered successfully!', userId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Username already exists.' });
        }
        res.status(500).json({ message: 'Database error', error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const user = users[0];
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const tokenPayload = { id: user.id, username: user.username };
        const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ accessToken, user: tokenPayload });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// --- 5.2 帖子/商品路由 (Listings Routes) ---

// 获取帖子列表 (公开接口)
app.get('/api/listings', async (req, res) => {
    try {
        const { type, userId, status, searchTerm, category } = req.query;
        let sql = 'SELECT * FROM listings WHERE 1=1';
        const params = [];
        if (type) { sql += ' AND type = ?'; params.push(type); }
        if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
        if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
        if (searchTerm) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${searchTerm}%`, `%${searchTerm}%`); }
        if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category); }
        sql += ' ORDER BY created_at DESC';
        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 发布新帖子 (受保护接口)
app.post('/api/listings', authenticateToken, upload.single('image'), async (req, res) => {
    const { title, description, price, category, type } = req.body;
    const { id: userId, username: userName } = req.user;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!title || !description || !type) {
        return res.status(400).json({ message: 'Title, description, and type are required.' });
    }
    try {
        const sql = `
            INSERT INTO listings (title, description, price, category, user_id, user_name, type, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool.execute(sql, [title, description, price || 0, category, userId, userName, type, imageUrl]);
        res.status(201).json({ message: 'Listing created successfully!', listingId: result.insertId });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 更新帖子 (新增 PUT 路由)
app.put('/api/listings/:id', authenticateToken, upload.single('image'), async (req, res) => {
    const listingId = req.params.id;
    const { id: userId } = req.user;
    const { title, description, price, category, existingImageUrl } = req.body;

    let imageUrl = existingImageUrl;
    if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
    }

    try {
        const [listings] = await pool.execute('SELECT * FROM listings WHERE id = ?', [listingId]);
        if (listings.length === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }
        if (listings[0].user_id !== userId) {
            return res.status(403).json({ message: 'Forbidden: You do not own this listing.' });
        }

        // 删除旧图片
        if (req.file && listings[0].image_url) {
            const oldImagePath = path.join(__dirname, listings[0].image_url);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        const sql = `
            UPDATE listings SET title = ?, description = ?, price = ?, category = ?, image_url = ?
            WHERE id = ? AND user_id = ?
        `;
        await pool.execute(sql, [title, description, price, category, imageUrl, listingId, userId]);

        res.json({ message: 'Listing updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 删除帖子 (增强版 DELETE 路由)
app.delete('/api/listings/:id', authenticateToken, async (req, res) => {
    const listingId = req.params.id;
    const { id: userId } = req.user;
    try {
        const [listings] = await pool.execute('SELECT image_url FROM listings WHERE id = ? AND user_id = ?', [listingId, userId]);
        if (listings.length === 0) {
            return res.status(403).json({ message: 'Forbidden: You do not own this listing or it does not exist.' });
        }
        const { image_url } = listings[0];

        const [result] = await pool.execute('DELETE FROM listings WHERE id = ? AND user_id = ?', [listingId, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }

        if (image_url) {
            const imagePath = path.join(__dirname, image_url);
            if (fs.existsSync(imagePath)) {
                fs.unlink(imagePath, (err) => {
                    if (err) console.error("Error deleting image file:", err);
                });
            }
        }

        res.json({ message: 'Listing deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// --- 5.3 订单路由 (Orders Routes) --- (全部为受保护接口)

// 创建订单 (买家点击“立即购买”)
app.post('/api/orders', authenticateToken, async (req, res) => {
    const { listingId } = req.body;
    const { id: buyerId } = req.user;
    if (!listingId) {
        return res.status(400).json({ message: 'Listing ID is required.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [listings] = await connection.execute('SELECT * FROM listings WHERE id = ? FOR UPDATE', [listingId]);
        if (listings.length === 0 || listings[0].status !== 'available' || listings[0].user_id === buyerId) {
            await connection.rollback();
            return res.status(400).json({ message: 'This item is not available for purchase or it is your own item.' });
        }
        const listing = listings[0];
        
        const [orderResult] = await connection.execute(
            'INSERT INTO orders (listing_id, buyer_id, seller_id, price, status) VALUES (?, ?, ?, ?, "to_pay")',
            [listing.id, buyerId, listing.user_id, listing.price]
        );
        await connection.execute('UPDATE listings SET status = "in_progress" WHERE id = ?', [listing.id]);
        
        await connection.commit();
        res.status(201).json({ message: 'Order created successfully!', orderId: orderResult.insertId });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// 获取我的订单列表
app.get('/api/orders', authenticateToken, async (req, res) => {
    const { id: userId } = req.user;
    const { role, status } = req.query; // role: 'buyer' or 'seller'
    if (!['buyer', 'seller'].includes(role)) {
        return res.status(400).json({ message: 'Role must be "buyer" or "seller".' });
    }
    try {
        let sql = `
            SELECT o.*, l.title as listing_title, l.image_url as listing_image_url,
            u_buyer.username as buyer_name, u_seller.username as seller_name
            FROM orders o
            JOIN listings l ON o.listing_id = l.id
            JOIN users u_buyer ON o.buyer_id = u_buyer.id
            JOIN users u_seller ON o.seller_id = u_seller.id
            WHERE ${role === 'buyer' ? 'o.buyer_id' : 'o.seller_id'} = ?
        `;
        const params = [userId];
        if(status && status !== 'all') {
            sql += ' AND o.status = ?';
            params.push(status);
        }
        sql += ' ORDER BY o.created_at DESC';
        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// [核心更新] 更新订单状态 (支付、发货、确认收货、取消)
app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
    const orderId = req.params.id;
    const { id: userId } = req.user;
    const { newStatus } = req.body;

    const validStatuses = ['to_ship', 'to_receive', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ message: 'Invalid new status provided.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [orders] = await connection.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Order not found.' });
        }
        const order = orders[0];
        const listingId = order.listing_id;

        // 权限校验
        let canUpdate = false;
        // 买家支付：to_pay -> to_ship
        if (newStatus === 'to_ship' && order.status === 'to_pay' && order.buyer_id === userId) canUpdate = true;       // 买家“支付”
        if (newStatus === 'to_receive' && order.status === 'to_ship' && order.seller_id === userId) canUpdate = true; // 卖家“发货”
        if (newStatus === 'completed' && order.status === 'to_receive' && order.buyer_id === userId) canUpdate = true;   // 买家“确认收货”
        if (newStatus === 'cancelled' && ['to_pay', 'to_ship'].includes(order.status) && (order.buyer_id === userId || order.seller_id === userId)) canUpdate = true; // 双方可取消早期订单

        if (!canUpdate) {
            await connection.rollback();
            return res.status(403).json({ message: 'Forbidden: You cannot perform this action on this order.' });
        }

        // 1. 更新订单状态
        await connection.execute('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);

        // 2. 根据新状态更新商品状态
        if (newStatus === 'completed') {
            await connection.execute('UPDATE listings SET status = "completed" WHERE id = ?', [listingId]);
        } else if (newStatus === 'cancelled') {
            await connection.execute('UPDATE listings SET status = "available" WHERE id = ?', [listingId]);
        }
        
        await connection.commit();
        res.json({ message: `Order status updated to ${newStatus} successfully.` });

    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});


// --- 5.4 回复路由 (Replies Routes) ---
app.get('/api/listings/:id/replies', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM replies WHERE listing_id = ? ORDER BY created_at ASC', [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

app.post('/api/listings/:id/replies', authenticateToken, async (req, res) => {
    const listingId = req.params.id;
    const { content } = req.body;
    const { id: userId, username: userName } = req.user;
    if (!content) {
        return res.status(400).json({ message: 'Reply content cannot be empty.' });
    }
    try {
        const [result] = await pool.execute(
            'INSERT INTO replies (listing_id, user_id, user_name, content) VALUES (?, ?, ?, ?)',
            [listingId, userId, userName, content]
        );
        res.status(201).json({ message: 'Reply posted successfully!', replyId: result.insertId });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// =================================================================
// 6. 启动服务器 (Start Server)
// =================================================================
app.listen(port, '0.0.0.0', () => {
    console.log(`Backend server is running on http://0.0.0.0:${port}`);
    console.log(`Local access: http://localhost:${port}`);
    console.log(`Network access: http://192.168.31.157:${port}`);
    console.log('Press Ctrl+C to stop the server.');
});
