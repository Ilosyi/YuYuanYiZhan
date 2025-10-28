// =================================================================
// “喻园易站” - 后端服务器主文件
// 版本: 4.1
// =================================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs'); // 新增: 用于删除图片文件
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const uploadsRoot = path.join(__dirname, 'uploads');
const defaultImagesRoot = path.join(__dirname, '..', 'frontend', 'public', 'default-images');
const DEFAULT_AVATAR_URL = '/default-images/default-avatar.jpg';

/**
 * 使用默认头像作为兜底
 * @param {string|null|undefined} value 头像 URL
 * @returns {string} 可用的头像 URL
 */
const withAvatarFallback = (value) => value || DEFAULT_AVATAR_URL;

/**
 * 将以 /uploads/ 开头的相对路径解析为磁盘绝对路径（并限制在 uploads 目录内）
 * @param {string} value 例如 '/uploads/xxx.jpg'
 * @returns {string|null} 绝对路径或 null（不合法时）
 */
const resolveUploadAbsolutePath = (value) => {
    if (!value) return null;
    const sanitized = value.replace(/^[\\/]+/, '');
    const absolutePath = path.resolve(__dirname, sanitized);
    const uploadsRootWithSep = `${uploadsRoot}${path.sep}`;
    if (absolutePath !== uploadsRoot && !absolutePath.startsWith(uploadsRootWithSep)) {
        return null;
    }
    return absolutePath;
};

/**
 * 归一化获取本次请求上传的图片（支持 images[] 与 image）
 * @param {import('express').Request} req
 * @returns {Array<Express.Multer.File>}
 */
const gatherUploadedImages = (req) => {
    const collected = [];
    if (req.files?.images?.length) {
        collected.push(...req.files.images);
    }
    if (req.files?.image?.length) {
        collected.push(...req.files.image);
    }
    return collected;
};

/**
 * 根据 Multer 保存的文件对象构造对外可访问的图片 URL
 * @param {Express.Multer.File} file
 * @returns {string}
 */
const buildImageUrl = (file) => `/uploads/${file.filename}`;

/** 判断是否是本服务保存的上传文件 URL */
const isLocalUploadUrl = (value) => typeof value === 'string' && value.startsWith('/uploads/');

/**
 * 删除一组上传文件（物理文件），自动进行路径安全校验
 * @param {string[]} imageUrls '/uploads/...' 数组
 */
const deletePhysicalFiles = (imageUrls = []) => {
    imageUrls.forEach((url) => {
        const absolute = resolveUploadAbsolutePath(url);
        if (absolute && fs.existsSync(absolute)) {
            try {
                fs.unlinkSync(absolute);
            } catch (error) {
                console.error('删除图片文件失败:', absolute, error.message);
            }
        }
    });
};

/**
 * 解析客户端提交的保留图片 ID 列表
 * @param {string|any[]} rawValue JSON 字符串或数组
 * @returns {number[]} 正整数 ID 列表
 */
const parseKeepImageIds = (rawValue) => {
    if (!rawValue) return [];
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (Array.isArray(parsed)) {
            return parsed
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value > 0);
        }
        return [];
    } catch (error) {
        console.warn('解析 keepImageIds 失败:', error.message);
        return [];
    }
};

// =================================================================
// 1. 中间件配置 (Middleware Configuration)
// =================================================================
// 允许的 CORS 来源白名单（逗号分隔），为空表示放行所有来源
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

/** CORS 配置：若未配置白名单或请求无 Origin，则放行；否则仅允许白名单内域名 */
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/default-images', express.static(defaultImagesRoot));

// =================================================================
// 2. 数据库连接池 (Database Pool)
// =================================================================
/**
 * MySQL 连接池
 * - 通过环境变量读取连接信息
 * - 设置 timezone 为东八区，便于与前端展示一致
 */
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

/**
 * 数据库初始化/修复（幂等）：
 * - 创建 messages / listing_images / user_profiles / user_follows / user_favorites 表
 * - 将 listings.image_url 回填为第一张图到 listing_images（若未同步）
 */
async function initializeDatabase() {
    const createMessagesTableSQL = `
        CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            listing_id INT NULL,
            sender_id INT NOT NULL,
            receiver_id INT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            read_at TIMESTAMP NULL,
            INDEX idx_sender_receiver (sender_id, receiver_id),
            INDEX idx_receiver_read (receiver_id, read_at),
            INDEX idx_created_at (created_at),
            CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_messages_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    const createListingImagesTableSQL = `
        CREATE TABLE IF NOT EXISTS listing_images (
            id INT AUTO_INCREMENT PRIMARY KEY,
            listing_id INT NOT NULL,
            image_url VARCHAR(500) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_listing_images_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
            INDEX idx_listing_order (listing_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    const createUserProfilesTableSQL = `
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INT PRIMARY KEY,
            display_name VARCHAR(255) NULL,
            student_id VARCHAR(50) NULL,
            contact_phone VARCHAR(50) NULL,
            avatar_url VARCHAR(500) NULL,
            bio TEXT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    const createUserFollowsTableSQL = `
        CREATE TABLE IF NOT EXISTS user_follows (
            id INT AUTO_INCREMENT PRIMARY KEY,
            follower_id INT NOT NULL,
            following_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_user_follows_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_user_follows_following FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uniq_follow UNIQUE (follower_id, following_id),
            INDEX idx_follower (follower_id),
            INDEX idx_following (following_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    const createUserFavoritesTableSQL = `
        CREATE TABLE IF NOT EXISTS user_favorites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            listing_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_user_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_user_favorites_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
            CONSTRAINT uniq_favorite UNIQUE (user_id, listing_id),
            INDEX idx_user (user_id),
            INDEX idx_listing (listing_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    const createEmailVerificationsTableSQL = `
        CREATE TABLE IF NOT EXISTS email_verifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(16) NOT NULL,
            email VARCHAR(255) NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            expires_at DATETIME NOT NULL,
            consumed TINYINT(1) NOT NULL DEFAULT 0,
            request_ip VARCHAR(64) NULL,
            attempt_count INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_student (student_id),
            INDEX idx_email (email),
            INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    try {
        await pool.execute(createMessagesTableSQL);
        await pool.execute(createListingImagesTableSQL);
        await pool.execute(createUserProfilesTableSQL);
        await pool.execute(createUserFollowsTableSQL);
        await pool.execute(createUserFavoritesTableSQL);
        await pool.execute(createEmailVerificationsTableSQL);
        // 回复表二级评论支持：为 replies 表添加 parent_reply_id（幂等）
        try {
            await pool.execute('ALTER TABLE replies ADD COLUMN parent_reply_id INT NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 replies 表添加 parent_reply_id 失败：', e.message);
            }
        }
        // 为 parent_reply_id 建立索引（幂等）
        try {
            await pool.execute('CREATE INDEX idx_replies_parent ON replies(parent_reply_id)');
        } catch (e) {
            // 索引已存在时静默
        }
        // 为图书教材细分添加可选字段：book_type（课内教材/课外教材/笔记/其他）、book_major（所属专业，文本）
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN book_type VARCHAR(50) NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 book_type 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN book_major VARCHAR(100) NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 book_major 失败：', e.message);
            }
        }
        // 失物招领：记录可选的丢失者学号
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN lost_student_id VARCHAR(16) NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 lost_student_id 失败：', e.message);
            }
        }
        // 为代课讲座分类添加字段：lecture_location、lecture_start_at、lecture_end_at
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN lecture_location VARCHAR(100) NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 lecture_location 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN lecture_start_at DATETIME NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 lecture_start_at 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN lecture_end_at DATETIME NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 lecture_end_at 失败：', e.message);
            }
        }
        await pool.execute(`
            INSERT INTO listing_images (listing_id, image_url, sort_order)
            SELECT l.id, l.image_url, 0
            FROM listings l
            WHERE l.image_url IS NOT NULL AND l.image_url <> ''
              AND NOT EXISTS (
                  SELECT 1 FROM listing_images li
                  WHERE li.listing_id = l.id AND li.image_url = l.image_url
              )
        `);
    } catch (error) {
        console.error('数据库初始化失败:', error.message);
    }
}

initializeDatabase();

// =================================================================
// 3. 文件上传配置 (Multer File Upload)
// =================================================================
/**
 * Multer 文件存储：保存到 uploads 目录，文件名 image-<timestamp>-<rand>.<ext>
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
    }
});
/**
 * 通用上传中间件：限制大小为 5MB，仅允许图片 MIME 类型
 */
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

/** 帖子图片上传（支持 images[] 多图与 image 单图） */
const uploadListingImages = upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'image', maxCount: 1 }
]);
/** 用户头像上传（单文件） */
const uploadAvatar = upload.single('avatar');

/**
 * 规范化可空字符串：去空、空转 null、超长截断
 */
const sanitizeNullableString = (value, maxLength) => {
    if (value === undefined || value === null) {
        return null;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

/**
 * 规范化前端传入的地点字段（multipart 可能出现重复字段 -> 数组）
 * - 若为数组，取最后一个非空白字符串
 * - 若为字符串，去空白后返回；为空返回 null
 */
const normalizeFormLocation = (input) => {
    if (Array.isArray(input)) {
        const last = input
            .map((v) => String(v ?? '').trim())
            .filter((v) => v.length > 0)
            .pop();
        return last || null;
    }
    const s = String(input ?? '').trim();
    return s || null;
};

/**
 * 规范化数据库中可能残留为 JSON 数组字符串的地点值（历史数据纠偏）
 */
const normalizeDbLocation = (value) => {
    if (value == null) return value;
    const s = String(value);
    if (s.startsWith('[')) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) {
                const last = arr
                    .map((v) => String(v ?? '').trim())
                    .filter((v) => v.length > 0)
                    .pop();
                return last || null;
            }
        } catch {}
    }
    return s;
};

/**
 * 将地点存储值转换为展示值：
 * - 代码 -> 中文：qinyuan/沁苑, yunyuan/韵苑, zisong/紫菘
 * - 'other'（历史数据）-> '其他地点'
 * - 其它值（自定义/文本）-> 原样返回
 */
const presentLocation = (value) => {
    if (value == null) return value;
    const code = String(normalizeDbLocation(value) || '').trim();
    const map = { qinyuan: '沁苑', yunyuan: '韵苑', zisong: '紫菘' };
    if (map[code]) return map[code];
    if (code.toLowerCase() === 'other') return '其他地点';
    return code;
};

// 预设地点列表（用于“其他地点”筛选时的排除）
// 注意：改为全中文，避免依赖 presentLocation 的显示转换
const PRESET_LOCATIONS = [
    // 校区/园区（中文）
    '沁苑', '韵苑', '紫菘',
    // 其它中文地点
    '西区宿舍', '博士公寓', '南大门', '南二门', '南三门', '南四门', '生活门', '东大门', '紫菘门'
];

/**
 * 获取用户资料快照（基本信息 + 扩展资料 + 计数 + 与当前用户关系）
 */
const getUserProfileSnapshot = async (targetUserId, currentUserId = null) => {
    const [userRows] = await pool.execute(
        'SELECT id, username, created_at FROM users WHERE id = ?',
        [targetUserId]
    );
    if (!userRows.length) {
        return null;
    }

    const user = userRows[0];
    const [profileRows] = await pool.execute(
        'SELECT display_name, student_id, contact_phone, avatar_url, bio, updated_at FROM user_profiles WHERE user_id = ?',
        [targetUserId]
    );
    const profile = profileRows[0] || null;

    const [[stats]] = await pool.execute(
        `SELECT
            (SELECT COUNT(*) FROM user_follows WHERE follower_id = ?) AS following_count,
            (SELECT COUNT(*) FROM user_follows WHERE following_id = ?) AS follower_count,
            (SELECT COUNT(*) FROM listings WHERE user_id = ?) AS listings_count,
            (SELECT COUNT(*) FROM user_favorites WHERE user_id = ?) AS favorites_count
        `,
        [targetUserId, targetUserId, targetUserId, targetUserId]
    );

    let relationship = {
        isSelf: currentUserId === targetUserId,
        isFollowing: false,
        isFollower: false
    };

    if (currentUserId && currentUserId !== targetUserId) {
        const [[followState]] = await pool.execute(
            `SELECT
                EXISTS(
                    SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?
                ) AS is_following,
                EXISTS(
                    SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?
                ) AS is_follower
            `,
            [currentUserId, targetUserId, targetUserId, currentUserId]
        );
        relationship = {
            isSelf: false,
            isFollowing: Boolean(followState?.is_following),
            isFollower: Boolean(followState?.is_follower)
        };
    }

    return {
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
        profile: {
            displayName: profile?.display_name || null,
            studentId: profile?.student_id || null,
            contactPhone: profile?.contact_phone || null,
            avatarUrl: withAvatarFallback(profile?.avatar_url),
            bio: profile?.bio || null,
            updatedAt: profile?.updated_at || null
        },
        stats: {
            following: Number(stats?.following_count || 0),
            followers: Number(stats?.follower_count || 0),
            listings: Number(stats?.listings_count || 0),
            favorites: Number(stats?.favorites_count || 0)
        },
        relationship
    };
};

/**
 * 构建关注/粉丝列表，附带与当前用户的互相关注状态
 */
const buildFollowList = async (targetUserId, currentUserId, mode = 'followers') => {
    const isFollowersMode = mode === 'followers';
    const selectColumn = isFollowersMode ? 'uf.follower_id' : 'uf.following_id';
    const whereColumn = isFollowersMode ? 'uf.following_id' : 'uf.follower_id';

    const [rows] = await pool.execute(
        `SELECT 
            ${selectColumn} AS user_id,
            u.username,
            up.display_name,
            up.avatar_url,
            up.bio,
            uf.created_at AS relation_created_at,
            EXISTS(
                SELECT 1 FROM user_follows 
                WHERE follower_id = ? AND following_id = ${selectColumn}
            ) AS is_followed_by_current,
            EXISTS(
                SELECT 1 FROM user_follows 
                WHERE follower_id = ${selectColumn} AND following_id = ?
            ) AS is_following_current
        FROM user_follows uf
        JOIN users u ON ${selectColumn} = u.id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE ${whereColumn} = ?
        ORDER BY uf.created_at DESC`,
        [currentUserId, currentUserId, targetUserId]
    );

    return rows.map((row) => ({
        id: row.user_id,
        username: row.username,
        displayName: row.display_name || null,
        avatarUrl: withAvatarFallback(row.avatar_url),
        bio: row.bio || null,
        followedAt: row.relation_created_at,
        isFollowedByCurrentUser: Boolean(row.is_followed_by_current),
        isFollowingCurrentUser: Boolean(row.is_following_current)
    }));
};

/** 查询用户收藏的帖子列表（附 images_count） */
const fetchFavoriteListings = async (userId) => {
    const [rows] = await pool.execute(
        `SELECT 
            l.*, 
            uf.created_at AS favorited_at,
            (SELECT COUNT(*) FROM listing_images li WHERE li.listing_id = l.id) AS images_count
        FROM user_favorites uf
        JOIN listings l ON uf.listing_id = l.id
        WHERE uf.user_id = ?
        ORDER BY uf.created_at DESC`,
        [userId]
    );
    return rows;
};

// =================================================================
// 4. 认证中间件 (Authentication Middleware)
// =================================================================
/**
 * JWT 认证：从 Authorization: Bearer <token> 解析校验，成功后写入 req.user
 */
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
/**
 * POST /api/auth/register | /api/register
 * 注册用户（校验密码长度、处理重复用户名）
 */
const handleRegister = async (req, res) => {
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
};

app.post('/api/auth/register', handleRegister);
app.post('/api/register', handleRegister);

/**
 * POST /api/auth/login
 * 用户登录，签发 1 天有效的 accessToken
 */
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

// --- 5.1.0 邮箱验证码注册 (Email Verification Sign-up) ---

const isValidStudentId = (raw) => {
    if (typeof raw !== 'string') return false;
    const s = raw.trim();
    // 首字母允许 U/M/I/D（大小写均可），后接 20yy + 5 位流水号
    const m = s.match(/^[UMIDumid](20\d{2})(\d{5})$/);
    if (!m) return false;
    const year = Number(m[1]);
    const serial = Number(m[2]);
    if (year < 2000 || year > 2099) return false;
    if (serial < 10001 || serial > 99999) return false;
    return true;
};

const buildEduEmailFromStudentId = (studentId) => {
    const s = String(studentId || '').trim();
    if (!s) return '@hust.edu.cn';
    const local = s.charAt(0).toLowerCase() + s.slice(1);
    return `${local}@hust.edu.cn`;
};

const createMailTransporter = () => {
    // SMTP_ENABLED 未设置时默认启用（只要配置齐全）
    const enabled = (process.env.SMTP_ENABLED || 'true').toLowerCase() === 'true';
    if (!enabled) return null;
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_PORT) return null;
    const secure = String(SMTP_SECURE || 'false').toLowerCase() === 'true';
    const auth = SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined;
    try {
        return nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure, auth });
    } catch (e) {
        console.warn('SMTP transporter 创建失败，将回退为日志模式:', e.message);
        return null;
    }
};

const sendVerificationEmail = async (to, code) => {
    const transporter = createMailTransporter();
    const from = process.env.SMTP_FROM || 'noreply@hust.edu.cn';
    const subject = '喻园易站 - 邮箱验证码';
    const text = `您的验证码是：${code}\n10 分钟内有效。如非本人操作请忽略。`;
    if (!transporter) {
        console.log(`[DevEmail] To: ${to}\nSubject: ${subject}\n${text}`);
        return { dev: true };
    }
    await transporter.sendMail({ from, to, subject, text });
    return { dev: false };
};

// 申请验证码
app.post('/api/auth/request-email-code', async (req, res) => {
    const rawStudentId = req.body?.studentId;
    const studentId = sanitizeNullableString(rawStudentId, 16);
    if (!studentId || !isValidStudentId(studentId)) {
        return res.status(400).json({ message: '学号格式不合法，应为 uyyyyxxxxx（xxxxx 在 10001-99999）。' });
    }
    const email = buildEduEmailFromStudentId(studentId);

    try {
        // 频率限制：60 秒内不可重复申请
        const [recent] = await pool.execute(
            `SELECT id, created_at, expires_at FROM email_verifications
             WHERE student_id = ? AND consumed = 0
             ORDER BY id DESC LIMIT 1`,
            [studentId]
        );
        if (recent.length) {
            const lastAt = new Date(recent[0].created_at).getTime();
            if (Date.now() - lastAt < 60 * 1000) {
                return res.status(429).json({ message: '请求过于频繁，请稍后再试。' });
            }
        }

        const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 位数字
        const codeHash = await bcrypt.hash(code, 10);
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 分钟
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;

        await pool.execute(
            `INSERT INTO email_verifications (student_id, email, code_hash, expires_at, request_ip)
             VALUES (?, ?, ?, ?, ?)`,
            [studentId, email, codeHash, expires, String(ip || '')]
        );

        await sendVerificationEmail(email, code);
        res.json({ message: '验证码已发送，请查收邮箱（10 分钟内有效）。' });
    } catch (error) {
        console.error('request-email-code error:', error.message);
        res.status(500).json({ message: '发送验证码失败，请稍后再试。' });
    }
});

// 校验验证码并注册
app.post('/api/auth/verify-email-code', async (req, res) => {
    const rawStudentId = req.body?.studentId;
    const code = String(req.body?.code || '').trim();
    let username = sanitizeNullableString(req.body?.username, 255);
    const password = String(req.body?.password || '');

    if (!rawStudentId || !isValidStudentId(rawStudentId)) {
        return res.status(400).json({ message: '学号格式不合法。' });
    }
    if (!code || code.length !== 6) {
        return res.status(400).json({ message: '验证码格式不正确。' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ message: '密码长度至少 6 位。' });
    }
    const studentId = rawStudentId.trim();
    const email = buildEduEmailFromStudentId(studentId);

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1) 校验验证码：未过期、未使用，取最新一条
        const [vRows] = await connection.execute(
            `SELECT * FROM email_verifications
             WHERE student_id = ? AND consumed = 0 AND expires_at > NOW()
             ORDER BY id DESC LIMIT 1`,
            [studentId]
        );
        if (!vRows.length) {
            await connection.rollback();
            return res.status(400).json({ message: '未找到有效的验证码，请重新获取。' });
        }
        const record = vRows[0];
        if (record.attempt_count >= 5) {
            await connection.rollback();
            return res.status(429).json({ message: '尝试过多，请重新获取验证码。' });
        }

        const match = await bcrypt.compare(code, record.code_hash);
        if (!match) {
            await connection.execute('UPDATE email_verifications SET attempt_count = attempt_count + 1 WHERE id = ?', [record.id]);
            await connection.commit();
            return res.status(400).json({ message: '验证码不正确。' });
        }

        // 2) 标记验证码已使用
        await connection.execute('UPDATE email_verifications SET consumed = 1 WHERE id = ?', [record.id]);

        // 3) 学号是否已被绑定
        const [[dupProfile]] = await connection.execute(
            'SELECT user_id FROM user_profiles WHERE student_id = ? LIMIT 1',
            [studentId]
        );
        if (dupProfile && dupProfile.user_id) {
            await connection.rollback();
            return res.status(409).json({ message: '该学号已注册，请直接登录。' });
        }

        // 4) 创建用户 + 资料
        if (!username) {
            username = studentId.toLowerCase();
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        let newUserId;
        try {
            const [result] = await connection.execute(
                'INSERT INTO users (username, password) VALUES (?, ?)',
                [username, hashedPassword]
            );
            newUserId = result.insertId;
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                await connection.rollback();
                return res.status(409).json({ message: '用户名已被占用，请更换后重试。' });
            }
            throw e;
        }

        await connection.execute(
            `INSERT INTO user_profiles (user_id, student_id, avatar_url)
             VALUES (?, ?, NULL)
             ON DUPLICATE KEY UPDATE student_id = VALUES(student_id)`,
            [newUserId, studentId]
        );

        await connection.commit();

        // 5) 签发 token
        const tokenPayload = { id: newUserId, username };
        const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({ message: '注册成功', accessToken, user: tokenPayload });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('verify-email-code error:', error.message);
        res.status(500).json({ message: '注册失败，请稍后再试。' });
    } finally {
        if (connection) connection.release();
    }
});

// --- 5.1.1 用户资料路由 (User Profile Routes) ---

/** GET /api/users/me 获取当前登录用户资料快照 */
app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        const snapshot = await getUserProfileSnapshot(req.user.id, req.user.id);
        if (!snapshot) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(snapshot);
    } catch (error) {
        res.status(500).json({ message: 'Failed to load profile.', error: error.message });
    }
});

/** GET /api/users/:id/profile 查看任意用户的公开资料（需登录） */
app.get('/api/users/:id/profile', authenticateToken, async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ message: 'Invalid user id.' });
    }
    try {
        const snapshot = await getUserProfileSnapshot(targetId, req.user.id);
        if (!snapshot) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(snapshot);
    } catch (error) {
        res.status(500).json({ message: 'Failed to load profile.', error: error.message });
    }
});
// --- 5.1.2 用户资料更新路由 (User Profile Update Routes) ---
/**
 * PUT /api/users/me 更新个人资料
 * 注意：student_id 在注册时绑定，注册后不可修改（包括普通注册时为空的情况）。
 * avatarUrl 仅在明确提供时覆盖，未提供则保持不变。
 */
app.put('/api/users/me', authenticateToken, async (req, res) => {
    const displayName = sanitizeNullableString(req.body.displayName, 255);
    const contactPhone = sanitizeNullableString(req.body.contactPhone, 50);
    const avatarUrl = sanitizeNullableString(req.body.avatarUrl, 500);
    const bio = sanitizeNullableString(req.body.bio, 2000);

    try {
        // student_id 为注册时只读字段，若请求体包含则拒绝
        if (Object.prototype.hasOwnProperty.call(req.body, 'studentId')) {
            return res.status(400).json({ message: '学号在注册时绑定，注册后不可修改。' });
        }

        await pool.execute(
            `INSERT INTO user_profiles (user_id, display_name, contact_phone, avatar_url, bio)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 display_name = VALUES(display_name),
                 contact_phone = VALUES(contact_phone),
                 /* 仅当客户端明确提供 avatarUrl 时才更新；否则保留原值 */
                 avatar_url = IFNULL(VALUES(avatar_url), avatar_url),
                 bio = VALUES(bio)`
            ,
            [req.user.id, displayName, contactPhone, avatarUrl, bio]
        );

    const snapshot = await getUserProfileSnapshot(req.user.id, req.user.id);
        res.json({ message: 'Profile updated successfully.', profile: snapshot });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update profile.', error: error.message });
    }
});
// --- 5.1.3 用户头像上传路由 (User Avatar Upload Route) ---
/**
 * POST /api/users/me/avatar 上传并更新头像；成功后删除旧头像文件（若为本地上传）
 */
app.post('/api/users/me/avatar', authenticateToken, uploadAvatar, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Avatar file is required.' });
    }

    const newAvatarUrl = buildImageUrl(req.file);
    let previousAvatarUrl = null;

    try {
        const [[existingProfile]] = await pool.execute(
            'SELECT avatar_url FROM user_profiles WHERE user_id = ?',
            [req.user.id]
        );
        previousAvatarUrl = existingProfile?.avatar_url || null;

        await pool.execute(
            `INSERT INTO user_profiles (user_id, avatar_url)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE
                 avatar_url = VALUES(avatar_url)`,
            [req.user.id, newAvatarUrl]
        );

        if (previousAvatarUrl && previousAvatarUrl !== newAvatarUrl && isLocalUploadUrl(previousAvatarUrl)) {
            deletePhysicalFiles([previousAvatarUrl]);
        }

        const snapshot = await getUserProfileSnapshot(req.user.id, req.user.id);
        res.json({ message: 'Avatar updated successfully.', avatarUrl: newAvatarUrl, profile: snapshot });
    } catch (error) {
        deletePhysicalFiles([newAvatarUrl]);
        res.status(500).json({ message: 'Failed to update avatar.', error: error.message });
    }
});
// --- 5.1.4 用户关注路由 (User Follow Routes) ---
/** POST /api/users/:id/follow 关注用户 */
app.post('/api/users/:id/follow', authenticateToken, async (req, res) => {
    const targetId = Number(req.params.id);
    const currentUserId = req.user.id;

    if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ message: 'Invalid user id.' });
    }
    if (targetId === currentUserId) {
        return res.status(400).json({ message: 'You cannot follow yourself.' });
    }

    const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [targetId]);
    if (!users.length) {
        return res.status(404).json({ message: 'User not found.' });
    }

    try {
        await pool.execute(
            `INSERT INTO user_follows (follower_id, following_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE created_at = created_at`,
            [currentUserId, targetId]
        );
        const profile = await getUserProfileSnapshot(targetId, currentUserId);
        const selfStats = (await getUserProfileSnapshot(currentUserId, currentUserId)).stats;
        res.json({ message: 'Followed successfully.', profile, selfStats });
    } catch (error) {
        res.status(500).json({ message: 'Failed to follow user.', error: error.message });
    }
});

/** DELETE /api/users/:id/follow 取消关注 */
app.delete('/api/users/:id/follow', authenticateToken, async (req, res) => {
    const targetId = Number(req.params.id);
    const currentUserId = req.user.id;

    if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ message: 'Invalid user id.' });
    }
    if (targetId === currentUserId) {
        return res.status(400).json({ message: 'You cannot unfollow yourself.' });
    }

    try {
        await pool.execute(
            'DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?',
            [currentUserId, targetId]
        );
        const profile = await getUserProfileSnapshot(targetId, currentUserId);
        const selfStats = (await getUserProfileSnapshot(currentUserId, currentUserId)).stats;
        res.json({ message: 'Unfollowed successfully.', profile, selfStats });
    } catch (error) {
        res.status(500).json({ message: 'Failed to unfollow user.', error: error.message });
    }
});

/** GET /api/users/:id/followers 获取粉丝列表 */
app.get('/api/users/:id/followers', authenticateToken, async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ message: 'Invalid user id.' });
    }
    try {
        const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [targetId]);
        if (!users.length) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const followers = await buildFollowList(targetId, req.user.id, 'followers');
        res.json({ followers });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load followers.', error: error.message });
    }
});

/** GET /api/users/:id/following 获取关注列表 */
app.get('/api/users/:id/following', authenticateToken, async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ message: 'Invalid user id.' });
    }
    try {
        const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [targetId]);
        if (!users.length) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const following = await buildFollowList(targetId, req.user.id, 'following');
        res.json({ following });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load following list.', error: error.message });
    }
});

/** GET /api/users/search?q=keyword 用户搜索（用户名/昵称/学号） */
app.get('/api/users/search', authenticateToken, async (req, res) => {
    const rawQuery = req.query.q ?? req.query.query ?? '';
    const keyword = sanitizeNullableString(rawQuery, 255);
    if (!keyword) {
        return res.json({ results: [] });
    }

    const likeValue = `%${keyword}%`;
    const currentUserId = req.user.id;

    try {
        const [rows] = await pool.execute(
            `SELECT
                u.id,
                u.username,
                u.created_at,
                up.display_name,
                up.student_id,
                up.contact_phone,
                up.avatar_url,
                up.bio,
                (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) AS following_count,
                (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) AS follower_count,
                EXISTS(
                    SELECT 1 FROM user_follows
                    WHERE follower_id = ? AND following_id = u.id
                ) AS is_followed_by_current,
                EXISTS(
                    SELECT 1 FROM user_follows
                    WHERE follower_id = u.id AND following_id = ?
                ) AS is_following_current
            FROM users u
            LEFT JOIN user_profiles up ON up.user_id = u.id
            WHERE u.username LIKE ?
               OR (up.display_name IS NOT NULL AND up.display_name LIKE ?)
               OR (up.student_id IS NOT NULL AND up.student_id LIKE ?)
            ORDER BY up.display_name IS NULL, up.display_name, u.username
            LIMIT 20`,
            [currentUserId, currentUserId, likeValue, likeValue, likeValue]
        );

        const results = rows.map((row) => ({
            id: row.id,
            username: row.username,
            createdAt: row.created_at,
            displayName: row.display_name || null,
            studentId: row.student_id || null,
            contactPhone: row.contact_phone || null,
            avatarUrl: withAvatarFallback(row.avatar_url),
            bio: row.bio || null,
            stats: {
                following: Number(row.following_count || 0),
                followers: Number(row.follower_count || 0)
            },
            relationship: {
                isSelf: row.id === currentUserId,
                isFollowing: Boolean(row.is_followed_by_current),
                isFollower: Boolean(row.is_following_current)
            }
        }));

        res.json({ results });
    } catch (error) {
        res.status(500).json({ message: 'Failed to search users.', error: error.message });
    }
});

/** GET /api/users/me/favorites 获取我的收藏列表 */
app.get('/api/users/me/favorites', authenticateToken, async (req, res) => {
    try {
        const favorites = await fetchFavoriteListings(req.user.id);
        res.json({ favorites });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load favorites.', error: error.message });
    }
});

/** POST /api/listings/:id/favorite 收藏帖子 */
app.post('/api/listings/:id/favorite', authenticateToken, async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
        return res.status(400).json({ message: 'Invalid listing id.' });
    }

    const [listings] = await pool.execute('SELECT id FROM listings WHERE id = ?', [listingId]);
    if (!listings.length) {
        return res.status(404).json({ message: 'Listing not found.' });
    }

    try {
        await pool.execute(
            `INSERT INTO user_favorites (user_id, listing_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP`,
            [req.user.id, listingId]
        );
        const stats = (await getUserProfileSnapshot(req.user.id, req.user.id)).stats;
        res.json({ message: 'Favorited successfully.', listingId, stats });
    } catch (error) {
        res.status(500).json({ message: 'Failed to favorite listing.', error: error.message });
    }
});

/** DELETE /api/listings/:id/favorite 取消收藏 */
app.delete('/api/listings/:id/favorite', authenticateToken, async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
        return res.status(400).json({ message: 'Invalid listing id.' });
    }

    try {
        await pool.execute(
            'DELETE FROM user_favorites WHERE user_id = ? AND listing_id = ?',
            [req.user.id, listingId]
        );
        const stats = (await getUserProfileSnapshot(req.user.id, req.user.id)).stats;
        res.json({ message: 'Unfavorited successfully.', listingId, stats });
    } catch (error) {
        res.status(500).json({ message: 'Failed to unfavorite listing.', error: error.message });
    }
});

// --- 5.2 帖子/商品路由 (Listings Routes) ---

// 获取帖子列表 (公开接口)
/**
 * GET /api/listings
 * 支持筛选：type, userId, status, searchTerm, category
 */
app.get('/api/listings', async (req, res) => {
    try {
        const { type, userId, status, searchTerm, category, itemType, startLocation, endLocation } = req.query;
        let sql = `
            SELECT l.*, (SELECT COUNT(*) FROM listing_images li WHERE li.listing_id = l.id) AS images_count
            FROM listings l
            WHERE 1=1
        `;
        const params = [];
        if (type) { sql += ' AND l.type = ?'; params.push(type); }
        if (userId) { sql += ' AND l.user_id = ?'; params.push(userId); }
        if (status && status !== 'all') { sql += ' AND l.status = ?'; params.push(status); }
        if (searchTerm) { sql += ' AND (l.title LIKE ? OR l.description LIKE ?)'; params.push(`%${searchTerm}%`, `%${searchTerm}%`); }
        
        // 处理分类筛选
        if (category && category !== 'all') {
            if (type === 'lostfound' && (category === 'lost' || category === 'found')) {
                sql += ' AND l.category LIKE ?';
                params.push(`${category}_%`);
            } else {
                sql += ' AND l.category = ?';
                params.push(category);
            }
        }
        
        // 处理物品类型筛选（仅对失物招领模式）
        if (type === 'lostfound' && itemType && itemType !== 'all') {
            sql += ' AND l.category LIKE ?';
            params.push(`_%${itemType}`);
        }

        // 处理图书教材细分筛选（仅在 出售/收购 且 分类为 图书教材 时）
        const bookType = sanitizeNullableString(req.query?.bookType ?? req.query?.book_type, 50);
        const bookMajor = sanitizeNullableString(req.query?.bookMajor ?? req.query?.book_major, 100);
        if ((type === 'sale' || type === 'acquire') && category === 'books') {
            if (bookType && bookType !== 'all') {
                sql += ' AND l.book_type = ?';
                params.push(bookType);
            }
            if (bookMajor) {
                sql += ' AND l.book_major LIKE ?';
                params.push(`%${bookMajor}%`);
            }
        }

        // 处理代课讲座筛选（仅在 出售/收购 且 分类为 代课讲座 时）
        if ((type === 'sale' || type === 'acquire') && category === 'lecture') {
            const lectureLocation = sanitizeNullableString(req.query?.lectureLocation ?? req.query?.lecture_location, 100);
            const lectureStartFromRaw = sanitizeNullableString(req.query?.lectureStartFrom, 100);
            const lectureEndToRaw = sanitizeNullableString(req.query?.lectureEndTo, 100);
            if (lectureLocation && lectureLocation !== 'all') {
                sql += ' AND l.lecture_location = ?';
                params.push(lectureLocation);
            }
            // 时间段筛选：若同时提供 from/to，则取区间内；只提供 from 则筛选与 from 之后仍有交集；只提供 to 则筛选至 to 之前有交集
            const parseTime = (s) => {
                try { return s ? new Date(s) : null; } catch { return null; }
            };
            const from = parseTime(lectureStartFromRaw);
            const to = parseTime(lectureEndToRaw);
            if (from && to) {
                // 区间重叠判断：lecture_end_at >= from AND lecture_start_at <= to
                sql += ' AND (l.lecture_end_at IS NOT NULL AND l.lecture_end_at >= ?) AND (l.lecture_start_at IS NOT NULL AND l.lecture_start_at <= ?)';
                params.push(from, to);
            } else if (from) {
                sql += ' AND (l.lecture_end_at IS NOT NULL AND l.lecture_end_at >= ?)';
                params.push(from);
            } else if (to) {
                sql += ' AND (l.lecture_start_at IS NOT NULL AND l.lecture_start_at <= ?)';
                params.push(to);
            }
        }
        
        // 添加地点筛选（仅对跑腿服务）
        if ((type === 'sale' || type === 'acquire') && category === 'service') {
            // 处理起始地点筛选
            if (startLocation && startLocation !== 'all') {
                if (startLocation === 'other') {
                    // 对于"其他地点"：排除所有预设地点（包含旧编码与新增中文），同时兼容历史 JSON 数组存储
                    sql += ' AND l.start_location IS NOT NULL';
                    if (PRESET_LOCATIONS.length) {
                        sql += ` AND l.start_location NOT IN (${PRESET_LOCATIONS.map(() => '?').join(', ')})`;
                        params.push(...PRESET_LOCATIONS);
                        PRESET_LOCATIONS.forEach((p) => {
                            sql += ' AND (l.start_location NOT LIKE ?)';
                            params.push(`%"${p}"%`);
                        });
                    }
                } else {
                    // 对于预设地点，精确匹配；兼容历史数据为 JSON 数组字符串的情况
                    sql += ' AND (l.start_location = ? OR (l.start_location IS NOT NULL AND l.start_location LIKE ?))';
                    params.push(startLocation, `%"${startLocation}"%`);
                }
            }
            
            // 处理目的地点筛选
            if (endLocation && endLocation !== 'all') {
                if (endLocation === 'other') {
                    // 对于"其他地点"：排除所有预设地点（包含旧编码与新增中文），同时兼容历史 JSON 数组存储
                    sql += ' AND l.end_location IS NOT NULL';
                    if (PRESET_LOCATIONS.length) {
                        sql += ` AND l.end_location NOT IN (${PRESET_LOCATIONS.map(() => '?').join(', ')})`;
                        params.push(...PRESET_LOCATIONS);
                        PRESET_LOCATIONS.forEach((p) => {
                            sql += ' AND (l.end_location NOT LIKE ?)';
                            params.push(`%"${p}"%`);
                        });
                    }
                } else {
                    // 对于预设地点，精确匹配；兼容历史数据为 JSON 数组字符串的情况
                    sql += ' AND (l.end_location = ? OR (l.end_location IS NOT NULL AND l.end_location LIKE ?))';
                    params.push(endLocation, `%"${endLocation}"%`);
                }
            }
        }
        
        sql += ' ORDER BY l.created_at DESC';
        const [rows] = await pool.execute(sql, params);
        // 展示友好化：地点中文/自定义文本
        const presented = rows.map((r) => ({
            ...r,
            start_location: presentLocation(r.start_location),
            end_location: presentLocation(r.end_location),
        }));
        res.json(presented);
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 发布新帖子 (受保护接口)
/**
 * POST /api/listings
 * 创建帖子，支持多图上传与封面自动选取，支持 start_location/end_location
 */
app.post('/api/listings', authenticateToken, uploadListingImages, async (req, res) => {
    const { title, description, price, category, type, start_location, end_location } = req.body;
    const { id: userId, username: userName } = req.user;
    const uploadedImages = gatherUploadedImages(req);
    const coverImageUrl = uploadedImages.length ? buildImageUrl(uploadedImages[0]) : null;

    if (!title || !description || !type) {
        return res.status(400).json({ message: 'Title, description, and type are required.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const rawBookType = sanitizeNullableString(req.body?.bookType ?? req.body?.book_type, 50);
        const rawBookMajor = sanitizeNullableString(req.body?.bookMajor ?? req.body?.book_major, 100);
        const bookType = category === 'books' ? rawBookType : null;
        const bookMajor = category === 'books' ? rawBookMajor : null;

        // 代课讲座字段处理
        const rawLectureLocation = sanitizeNullableString(req.body?.lectureLocation ?? req.body?.lecture_location, 100);
        const parseDateValue = (v) => {
            if (!v) return null;
            try { const d = new Date(v); return isNaN(d.getTime()) ? null : d; } catch { return null; }
        };
        const lectureLocation = category === 'lecture' ? rawLectureLocation : null;
        const lectureStartAt = category === 'lecture' ? parseDateValue(req.body?.lectureStartAt ?? req.body?.lecture_start_at) : null;
        const lectureEndAt = category === 'lecture' ? parseDateValue(req.body?.lectureEndAt ?? req.body?.lecture_end_at) : null;

        const sql = `
            INSERT INTO listings (title, description, price, category, user_id, user_name, type, image_url,
                                  book_type, book_major,
                                  lecture_location, lecture_start_at, lecture_end_at,
                                  start_location, end_location,
                                  lost_student_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    ?)
        `;
        const startLoc = normalizeFormLocation(start_location);
        const endLoc = normalizeFormLocation(end_location);
        // 丢失者学号（仅 lostfound 模块允许）
        let lostStudentId = sanitizeNullableString(req.body?.lostStudentId ?? req.body?.lost_student_id, 16);
        if (type !== 'lostfound') {
            lostStudentId = null;
        } else if (lostStudentId && !isValidStudentId(lostStudentId)) {
            await connection.rollback();
            return res.status(400).json({ message: '丢失者学号格式不合法。' });
        }
        const [result] = await connection.execute(sql, [
            title, description, price || 0, category, userId, userName, type, coverImageUrl,
            bookType, bookMajor,
            lectureLocation, lectureStartAt, lectureEndAt,
            startLoc, endLoc,
            lostStudentId
        ]);

        if (uploadedImages.length) {
            const placeholders = uploadedImages.map(() => '(?, ?, ?)').join(', ');
            const values = [];
            uploadedImages.forEach((file, index) => {
                values.push(result.insertId, buildImageUrl(file), index);
            });
            await connection.execute(
                `INSERT INTO listing_images (listing_id, image_url, sort_order) VALUES ${placeholders}`,
                values
            );
        }

        await connection.commit();

        // 提交后尝试通知可能的失主（弱依赖，失败不影响发帖）
        (async () => {
            try {
                if (lostStudentId) {
                    const [[owner]] = await pool.execute(
                        `SELECT u.id AS user_id FROM user_profiles up JOIN users u ON up.user_id = u.id
                         WHERE up.student_id = ? LIMIT 1`,
                        [lostStudentId]
                    );
                    const receiverId = owner?.user_id;
                    if (receiverId && receiverId !== userId) {
                        const content = `系统提示：可能与您相关的失物/招领信息《${title}》，请前往查看。`;
                        await pool.execute(
                            `INSERT INTO messages (listing_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)`,
                            [result.insertId, userId, receiverId, content]
                        );
                        // TODO: 可在此补充 WebSocket 推送（若当前有在线连接）
                    }
                }
            } catch (e) {
                console.warn('发送失主通知失败：', e.message);
            }
        })();

        res.status(201).json({ message: 'Listing created successfully!', listingId: result.insertId });
    } catch (err) {
        if (connection) await connection.rollback();
        deletePhysicalFiles(uploadedImages.map((file) => buildImageUrl(file)));
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// 更新帖子 (新增 PUT 路由)
/**
 * PUT /api/listings/:id
 * 仅作者可更新；支持保留/新增图片与封面重算；支持 start_location/end_location
 */
app.put('/api/listings/:id', authenticateToken, uploadListingImages, async (req, res) => {
    const listingId = req.params.id;
    const { id: userId } = req.user;
    const { title, description, price, category, existingImageUrl, start_location, end_location } = req.body;
    let keepImageIds = parseKeepImageIds(req.body.keepImageIds);
    const uploadedImages = gatherUploadedImages(req);
    const newImageUrls = uploadedImages.map((file) => buildImageUrl(file));

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [listings] = await connection.execute('SELECT * FROM listings WHERE id = ?', [listingId]);
        if (listings.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Listing not found.' });
        }
        if (listings[0].user_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ message: 'Forbidden: You do not own this listing.' });
        }

        const [currentImages] = await connection.execute(
            'SELECT id, image_url, sort_order FROM listing_images WHERE listing_id = ? ORDER BY sort_order, id',
            [listingId]
        );

        if (req.body.keepImageIds === undefined) {
            keepImageIds = currentImages.map((image) => image.id);
        }

        const keepIdSet = new Set(keepImageIds);
        const imagesToRemove = currentImages.filter((image) => !keepIdSet.has(image.id));
        const removeIds = imagesToRemove.map((image) => image.id);
        const removedImageUrls = imagesToRemove.map((image) => image.image_url);

        if (removeIds.length) {
            const placeholders = removeIds.map(() => '?').join(', ');
            await connection.execute(
                `DELETE FROM listing_images WHERE id IN (${placeholders})`,
                removeIds
            );
        }

        let maxSortOrder = currentImages
            .filter((image) => keepIdSet.has(image.id))
            .reduce((max, image) => Math.max(max, image.sort_order || 0), -1);

        if (uploadedImages.length) {
            const placeholders = uploadedImages.map(() => '(?, ?, ?)').join(', ');
            const values = [];
            uploadedImages.forEach((file, index) => {
                values.push(listingId, buildImageUrl(file), maxSortOrder + index + 1);
            });
            await connection.execute(
                `INSERT INTO listing_images (listing_id, image_url, sort_order) VALUES ${placeholders}`,
                values
            );
            maxSortOrder += uploadedImages.length;
        }

        const [updatedImages] = await connection.execute(
            'SELECT image_url FROM listing_images WHERE listing_id = ? ORDER BY sort_order, id LIMIT 1',
            [listingId]
        );
        const coverImageUrl = updatedImages.length
            ? updatedImages[0].image_url
            : existingImageUrl || null;

        const rawBookType = sanitizeNullableString(req.body?.bookType ?? req.body?.book_type, 50);
        const rawBookMajor = sanitizeNullableString(req.body?.bookMajor ?? req.body?.book_major, 100);
        const bookType = category === 'books' ? rawBookType : null;
        const bookMajor = category === 'books' ? rawBookMajor : null;

        // 代课讲座字段
        const rawLectureLocation = sanitizeNullableString(req.body?.lectureLocation ?? req.body?.lecture_location, 100);
        const parseDateValue = (v) => {
            if (!v) return null;
            try { const d = new Date(v); return isNaN(d.getTime()) ? null : d; } catch { return null; }
        };
        const lectureLocation = category === 'lecture' ? rawLectureLocation : null;
        const lectureStartAt = category === 'lecture' ? parseDateValue(req.body?.lectureStartAt ?? req.body?.lecture_start_at) : null;
        const lectureEndAt = category === 'lecture' ? parseDateValue(req.body?.lectureEndAt ?? req.body?.lecture_end_at) : null;

        const sql = `
            UPDATE listings SET title = ?, description = ?, price = ?, category = ?, image_url = ?,
            book_type = ?, book_major = ?,
            lecture_location = ?, lecture_start_at = ?, lecture_end_at = ?,
            start_location = ?, end_location = ?
            WHERE id = ? AND user_id = ?
        `;
        const startLoc = normalizeFormLocation(start_location);
        const endLoc = normalizeFormLocation(end_location);
        await connection.execute(sql, [
            title, description, price, category, coverImageUrl,
            bookType, bookMajor,
            lectureLocation, lectureStartAt, lectureEndAt,
            startLoc, endLoc,
            listingId, userId
        ]);

        await connection.commit();
        deletePhysicalFiles(removedImageUrls);

        res.json({ message: 'Listing updated successfully.' });
    } catch (err) {
        if (connection) await connection.rollback();
        deletePhysicalFiles(newImageUrls);
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// 删除帖子 (增强版 DELETE 路由)
/** DELETE /api/listings/:id 仅作者可删；删除数据库后清理物理文件 */
app.delete('/api/listings/:id', authenticateToken, async (req, res) => {
    const listingId = req.params.id;
    const { id: userId } = req.user;
    try {
        const [listings] = await pool.execute('SELECT image_url FROM listings WHERE id = ? AND user_id = ?', [listingId, userId]);
        if (listings.length === 0) {
            return res.status(403).json({ message: 'Forbidden: You do not own this listing or it does not exist.' });
        }
        const { image_url } = listings[0];

        const [galleryImages] = await pool.execute(
            'SELECT image_url FROM listing_images WHERE listing_id = ?',
            [listingId]
        );
        const filesToDelete = new Set();
        if (image_url) {
            filesToDelete.add(image_url);
        }
        galleryImages.forEach((row) => {
            if (row.image_url) {
                filesToDelete.add(row.image_url);
            }
        });

        const [result] = await pool.execute('DELETE FROM listings WHERE id = ? AND user_id = ?', [listingId, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }

        deletePhysicalFiles(Array.from(filesToDelete));

        res.json({ message: 'Listing deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

/** GET /api/listings/:id/detail 公开：帖子详情 + 图集 + 回复 */
app.get('/api/listings/:id/detail', async (req, res) => {
    const listingId = req.params.id;
    try {
        const [listings] = await pool.execute(`
            SELECT l.*, u.username AS owner_name
            FROM listings l
            JOIN users u ON l.user_id = u.id
            WHERE l.id = ?
        `, [listingId]);

        if (listings.length === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }

    const listing = listings[0];
    // 纠偏 + 展示友好化
    listing.start_location = presentLocation(listing.start_location);
    listing.end_location = presentLocation(listing.end_location);
        const [images] = await pool.execute(
            'SELECT id, image_url, sort_order FROM listing_images WHERE listing_id = ? ORDER BY sort_order, id',
            [listingId]
        );
        listing.images = images;
        const [replyRows] = await pool.execute(`
            SELECT r.id, r.user_id, r.user_name, r.content, r.created_at, r.parent_reply_id
            FROM replies r
            WHERE r.listing_id = ?
            ORDER BY r.created_at ASC
        `, [listingId]);

        // 构建二级结构：顶级评论 + children（只到第二层）
        const byId = new Map();
        const roots = [];
        replyRows.forEach(r => {
            const node = { ...r, children: [] };
            byId.set(r.id, node);
        });
        replyRows.forEach(r => {
            const node = byId.get(r.id);
            if (!r.parent_reply_id) {
                roots.push(node);
            } else {
                const parent = byId.get(r.parent_reply_id);
                if (parent) {
                    parent.children.push(node);
                } else {
                    // 容错：若父级不存在，按顶级处理
                    roots.push(node);
                }
            }
        });

        res.json({ listing, replies: roots });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// --- 5.3 订单路由 (Orders Routes) --- (全部为受保护接口)

// 创建订单 (买家点击“立即购买”)
/** POST /api/orders 创建订单，校验不可自购与可售状态 */
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
/** GET /api/orders?role=buyer|seller&status=xxx 查询我的订单 */
app.get('/api/orders', authenticateToken, async (req, res) => {
    const { id: userId } = req.user;
    const { role, status } = req.query; // role: 'buyer' or 'seller'
    if (!['buyer', 'seller'].includes(role)) {
        return res.status(400).json({ message: 'Role must be "buyer" or "seller".' });
    }
    try {
        let sql = `
            SELECT o.*, l.title as listing_title, l.image_url as listing_image_url, l.type as listing_type,
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
/**
 * PUT /api/orders/:id/status
 * 状态流转：to_pay -> to_ship -> to_receive -> completed；任一早期节点可取消 -> cancelled
 */
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

// --- 5.4 消息路由 (Messaging Routes) ---
/** GET /api/messages/conversations 最近会话摘要（含未读数） */
app.get('/api/messages/conversations', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const [rows] = await pool.execute(`
            SELECT
                IF(sender_id = ?, receiver_id, sender_id) AS other_user_id,
                MAX(created_at) AS last_message_at,
                SUBSTRING_INDEX(MAX(CONCAT(created_at, '\x1f', content)), '\x1f', -1) AS last_message,
                SUM(CASE WHEN receiver_id = ? AND read_at IS NULL THEN 1 ELSE 0 END) AS unread_count
            FROM messages
            WHERE sender_id = ? OR receiver_id = ?
            GROUP BY other_user_id
            ORDER BY last_message_at DESC
        `, [userId, userId, userId, userId]);

        if (rows.length === 0) {
            return res.json([]);
        }

        const otherIds = rows.map(row => row.other_user_id);
        const [users] = await pool.query('SELECT id, username FROM users WHERE id IN (?)', [otherIds]);
        const userMap = new Map(users.map(user => [user.id, user]));

        const conversations = rows
            .filter(row => userMap.has(row.other_user_id))
            .map(row => ({
                otherUserId: row.other_user_id,
                otherUsername: userMap.get(row.other_user_id).username,
                lastMessage: row.last_message,
                lastMessageAt: row.last_message_at,
                unreadCount: Number(row.unread_count || 0)
            }));

        res.json(conversations);
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

/** GET /api/messages/conversations/:otherUserId/messages 拉取与某用户的详细消息 */
app.get('/api/messages/conversations/:otherUserId/messages', authenticateToken, async (req, res) => {
    const { otherUserId } = req.params;
    const userId = req.user.id;
    const targetId = Number(otherUserId);

    if (!Number.isInteger(targetId)) {
        return res.status(400).json({ message: 'Invalid user id.' });
    }

    try {
        const [userRows] = await pool.execute('SELECT id, username FROM users WHERE id = ?', [targetId]);
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'Conversation target not found.' });
        }

        const [messages] = await pool.execute(`
            SELECT id, sender_id, receiver_id, content, created_at, read_at, listing_id
            FROM messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC
            LIMIT 500
        `, [userId, targetId, targetId, userId]);

        res.json({
            otherUser: {
                id: userRows[0].id,
                username: userRows[0].username
            },
            messages
        });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

/** POST /api/messages/conversations/:otherUserId/read 将与某用户的未读消息置为已读 */
app.post('/api/messages/conversations/:otherUserId/read', authenticateToken, async (req, res) => {
    const { otherUserId } = req.params;
    const userId = req.user.id;
    const targetId = Number(otherUserId);

    if (!Number.isInteger(targetId)) {
        return res.status(400).json({ message: 'Invalid user id.' });
    }

    try {
        await pool.execute(
            'UPDATE messages SET read_at = NOW() WHERE receiver_id = ? AND sender_id = ? AND read_at IS NULL',
            [userId, targetId]
        );
        res.json({ message: 'Conversation marked as read.' });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});


// --- 5.5 回复路由 (Replies Routes) ---
/** GET /api/listings/:id/replies 获取某帖子的公共回复列表 */
app.get('/api/listings/:id/replies', async (req, res) => {
    try {
        const listingId = Number(req.params.id);
        const [rows] = await pool.execute(
            'SELECT id, user_id, user_name, content, created_at, parent_reply_id FROM replies WHERE listing_id = ? ORDER BY created_at ASC',
            [listingId]
        );
        const byId = new Map();
        const roots = [];
        rows.forEach(r => byId.set(r.id, { ...r, children: [] }));
        rows.forEach(r => {
            const node = byId.get(r.id);
            if (!r.parent_reply_id) {
                roots.push(node);
            } else {
                const parent = byId.get(r.parent_reply_id);
                if (parent) parent.children.push(node); else roots.push(node);
            }
        });
        res.json(roots);
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

/** POST /api/listings/:id/replies 发表公共回复（需登录） */
app.post('/api/listings/:id/replies', authenticateToken, async (req, res) => {
    const listingId = Number(req.params.id);
    const { content, parentReplyId } = req.body || {};
    const { id: userId, username: userName } = req.user;
    const text = String(content || '').trim();
    if (!text) {
        return res.status(400).json({ message: 'Reply content cannot be empty.' });
    }
    try {
        let parentId = parentReplyId ? Number(parentReplyId) : null;
        if (parentId && (!Number.isInteger(parentId) || parentId <= 0)) {
            parentId = null;
        }

        if (parentId) {
            // 验证父评论：需属于同一帖子，且父评论自身为顶级（限制仅二级）
            const [[parentRow]] = await pool.execute(
                'SELECT id, listing_id, parent_reply_id FROM replies WHERE id = ? LIMIT 1',
                [parentId]
            );
            if (!parentRow || parentRow.listing_id !== listingId) {
                return res.status(400).json({ message: '父评论不存在或不属于该帖子。' });
            }
            if (parentRow.parent_reply_id) {
                return res.status(400).json({ message: '仅支持二级评论，无法继续嵌套。' });
            }
        }

        const [result] = await pool.execute(
            'INSERT INTO replies (listing_id, user_id, user_name, content, parent_reply_id) VALUES (?, ?, ?, ?, ?)',
            [listingId, userId, userName, text, parentId]
        );
        res.status(201).json({ message: 'Reply posted successfully!', replyId: result.insertId });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

/** PUT /api/replies/:id 编辑回复（仅作者） */
app.put('/api/replies/:id', authenticateToken, async (req, res) => {
    const replyId = Number(req.params.id);
    const { id: userId } = req.user;
    const content = String(req.body?.content || '').trim();
    if (!Number.isInteger(replyId) || replyId <= 0) {
        return res.status(400).json({ message: 'Invalid reply id.' });
    }
    if (!content) {
        return res.status(400).json({ message: '回复内容不能为空。' });
    }
    try {
        const [[row]] = await pool.execute('SELECT id, user_id FROM replies WHERE id = ? LIMIT 1', [replyId]);
        if (!row) {
            return res.status(404).json({ message: 'Reply not found.' });
        }
        if (row.user_id !== userId) {
            return res.status(403).json({ message: 'Forbidden: You do not own this reply.' });
        }
        await pool.execute('UPDATE replies SET content = ? WHERE id = ?', [content, replyId]);
        res.json({ message: 'Reply updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

/** DELETE /api/replies/:id 删除回复（仅作者；删除顶级时级联删除其子回复） */
app.delete('/api/replies/:id', authenticateToken, async (req, res) => {
    const replyId = Number(req.params.id);
    const { id: userId } = req.user;
    if (!Number.isInteger(replyId) || replyId <= 0) {
        return res.status(400).json({ message: 'Invalid reply id.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [[row]] = await connection.execute('SELECT id, user_id FROM replies WHERE id = ? FOR UPDATE', [replyId]);
        if (!row) {
            await connection.rollback();
            return res.status(404).json({ message: 'Reply not found.' });
        }
        if (row.user_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ message: 'Forbidden: You do not own this reply.' });
        }

        // 先删除子回复，再删自己（支持顶级/子级统一处理）
        await connection.execute('DELETE FROM replies WHERE parent_reply_id = ?', [replyId]);
        await connection.execute('DELETE FROM replies WHERE id = ?', [replyId]);

        await connection.commit();
        res.json({ message: 'Reply deleted successfully.' });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// =================================================================
// 6. 启动服务器 (Start Server)
// =================================================================

// =================================================================
// 6. WebSocket 服务器 (WebSocket Server)
// =================================================================
/** WebSocket 在线连接：userId -> Set<WebSocket> */
const activeClients = new Map(); // userId -> Set<WebSocket>

/** 安全发送 JSON 给某连接 */
const sendJson = (socket, payload) => {
    if (!socket || socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(payload));
};

/** 向指定用户的所有连接广播 */
const broadcastToUser = (userId, payload) => {
    const sockets = activeClients.get(userId);
    if (!sockets) return;
    sockets.forEach(socket => sendJson(socket, payload));
};

/** 记录用户新连接 */
const registerSocket = (userId, socket) => {
    if (!activeClients.has(userId)) {
        activeClients.set(userId, new Set());
    }
    activeClients.get(userId).add(socket);
};

/** 清理用户连接 */
const unregisterSocket = (userId, socket) => {
    if (!activeClients.has(userId)) return;
    const sockets = activeClients.get(userId);
    sockets.delete(socket);
    if (sockets.size === 0) {
        activeClients.delete(userId);
    }
};

/** 构建双方会话摘要（最后消息/时间/未读） */
async function buildConversationSnapshot(currentUserId, otherUserId) {
    const [rows] = await pool.execute(`
        SELECT
            MAX(created_at) AS last_message_at,
            SUBSTRING_INDEX(MAX(CONCAT(created_at, '\x1f', content)), '\x1f', -1) AS last_message,
            SUM(CASE WHEN receiver_id = ? AND read_at IS NULL THEN 1 ELSE 0 END) AS unread_count
        FROM messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `, [currentUserId, currentUserId, otherUserId, otherUserId, currentUserId]);

    if (!rows || rows.length === 0 || rows[0].last_message_at === null) {
        return null;
    }

    const [userRows] = await pool.execute('SELECT id, username FROM users WHERE id = ?', [otherUserId]);
    if (userRows.length === 0) {
        return null;
    }

    const row = rows[0];
    return {
        otherUserId,
        otherUsername: userRows[0].username,
        lastMessage: row.last_message,
        lastMessageAt: row.last_message_at,
        unreadCount: Number(row.unread_count || 0)
    };
}

/** WebSocket 服务端，路径 /ws */
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket, req) => {
    // 握手阶段：从查询参数 token 中解析并校验 JWT
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        if (!token) {
            sendJson(socket, { type: 'error', message: 'Missing authentication token.' });
            return socket.close(4001, 'Unauthorized');
        }

        let user;
        try {
            user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            sendJson(socket, { type: 'error', message: 'Invalid or expired token.' });
            return socket.close(4001, 'Unauthorized');
        }

        socket.user = user;
        registerSocket(user.id, socket);
        sendJson(socket, { type: 'ready' });

    // 处理聊天消息发送
    socket.on('message', async (messageBuffer) => {
            let payload;
            try {
                payload = JSON.parse(messageBuffer.toString());
            } catch (error) {
                return sendJson(socket, { type: 'error', message: 'Invalid JSON payload.' });
            }

            if (payload.type !== 'message') {
                return;
            }

            const toUserId = Number(payload.toUserId);
            const content = (payload.content || '').trim();
            const listingId = payload.listingId ? Number(payload.listingId) : null;

            if (!Number.isInteger(toUserId) || toUserId <= 0) {
                return sendJson(socket, { type: 'error', message: 'Invalid recipient.' });
            }

            if (!content) {
                return sendJson(socket, { type: 'error', message: 'Message content cannot be empty.' });
            }

            if (toUserId === user.id) {
                return sendJson(socket, { type: 'error', message: 'Cannot send message to yourself.' });
            }

            try {
                const [result] = await pool.execute(
                    'INSERT INTO messages (sender_id, receiver_id, content, listing_id) VALUES (?, ?, ?, ?)',
                    [user.id, toUserId, content, listingId || null]
                );

                const messageId = result.insertId;
                const [rows] = await pool.execute(`
                    SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at, m.listing_id,
                           s.username AS sender_username, r.username AS receiver_username
                    FROM messages m
                    JOIN users s ON m.sender_id = s.id
                    JOIN users r ON m.receiver_id = r.id
                    WHERE m.id = ?
                `, [messageId]);

                if (rows.length === 0) {
                    return;
                }

                const savedMessage = rows[0];
                const messagePayload = {
                    type: 'message',
                    data: {
                        id: savedMessage.id,
                        senderId: savedMessage.sender_id,
                        senderUsername: savedMessage.sender_username,
                        receiverId: savedMessage.receiver_id,
                        receiverUsername: savedMessage.receiver_username,
                        content: savedMessage.content,
                        createdAt: savedMessage.created_at,
                        listingId: savedMessage.listing_id
                    }
                };

                broadcastToUser(user.id, messagePayload);
                broadcastToUser(toUserId, messagePayload);

                const [summaryForSender, summaryForReceiver] = await Promise.all([
                    buildConversationSnapshot(user.id, toUserId),
                    buildConversationSnapshot(toUserId, user.id)
                ]);

                if (summaryForSender) {
                    broadcastToUser(user.id, { type: 'conversation:update', data: summaryForSender });
                }
                if (summaryForReceiver) {
                    broadcastToUser(toUserId, { type: 'conversation:update', data: summaryForReceiver });
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
                sendJson(socket, { type: 'error', message: 'Failed to send message.' });
            }
        });

    // 连接关闭：移除在线表映射
    socket.on('close', () => {
            if (socket.user) {
                unregisterSocket(socket.user.id, socket);
            }
        });

    // 连接错误：清理资源
    socket.on('error', () => {
            if (socket.user) {
                unregisterSocket(socket.user.id, socket);
            }
        });
    } catch (error) {
        console.error('WebSocket connection error:', error.message);
        sendJson(socket, { type: 'error', message: 'Unexpected error occurred.' });
        socket.close(1011, 'Unexpected error');
    }
});

// =================================================================
// 7. 启动服务器 (Start Server)
// =================================================================
// 可选：托管前端构建产物（生产部署时常用）
if (process.env.SERVE_FRONTEND === 'true') {
    /** 解析 dist 路径，默认 ../frontend/dist，支持通过环境变量覆盖 */
    const resolveDistPath = () => {
        if (!process.env.FRONTEND_DIST_PATH) {
            return path.resolve(__dirname, '../frontend/dist');
        }
        return path.isAbsolute(process.env.FRONTEND_DIST_PATH)
            ? process.env.FRONTEND_DIST_PATH
            : path.join(__dirname, process.env.FRONTEND_DIST_PATH);
    };

    const distPath = resolveDistPath();

    if (fs.existsSync(distPath)) {
        console.log(`[Static] Serving frontend assets from ${distPath}`);
    // 静态托管前端，并将除 /api|/uploads|/ws 外的请求回退到 index.html 以支持前端路由
    app.use(express.static(distPath));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/ws')) {
                return next();
            }
            res.sendFile(path.join(distPath, 'index.html'));
        });
    } else {
        console.warn(`[Static] SERVE_FRONTEND is enabled but path ${distPath} does not exist.`);
    }
}

server.listen(port, '0.0.0.0', () => {
    console.log(`Backend server is running on http://0.0.0.0:${port}`);
    console.log(`Local access: http://localhost:${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
    console.log('Press Ctrl+C to stop the server.');
});
