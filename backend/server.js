// =================================================================
// “喻园易站” - 后端服务器主文件
// 版本: 4.1
// 初学者导读：本文件的逐行详解见 docs/server-annotated.md（不影响运行的讲解版说明）。
// =================================================================

// 加载 .env 环境变量（例如数据库、SMTP、JWT 密钥等），放最前面保证后续能读取到
require('dotenv').config();
// 引入 Express：Node.js 最常用的 Web 框架，用来写 API 接口
const express = require('express');
// 原生 HTTP 模块：用它把 Express 应用托管到一个 HTTP 服务器上
const http = require('http');
// 处理文件与目录路径的工具（跨平台安全处理路径）
const path = require('path');
// 文件系统模块：这里主要用来删除已上传的图片等文件
const fs = require('fs'); // 新增: 用于删除图片文件
// mysql2 的 Promise 版本：方便用 async/await 操作数据库
const mysql = require('mysql2/promise');
// 解析请求体 JSON 与表单的中间件
const bodyParser = require('body-parser');
// 处理跨域（CORS），允许前端在不同域名/端口访问后端
const cors = require('cors');
// 处理文件上传的中间件（用于帖子图片、头像、跑腿凭证等）
const multer = require('multer');
// 用来给密码做哈希/比对（永远不要明文存密码）
const bcrypt = require('bcrypt');
// JSON Web Token：登录后给用户签发的令牌，后续接口用它来鉴权
const jwt = require('jsonwebtoken');
// 发邮件的库：用于发送邮箱验证码
const nodemailer = require('nodemailer');
// WebSocket 服务器：用于即时消息（站内私信）
const { WebSocketServer } = require('ws');

// 创建一个 Express 应用
const app = express();
// 使用原生 http.createServer 托管 app，后面还能把 WebSocket 也挂到同一个端口
const server = http.createServer(app);
// 服务监听的端口号，优先用环境变量 PORT，默认 3000
const port = process.env.PORT || 3000;
// 上传目录的绝对路径：所有用户上传的图片都会保存在这里
const uploadsRoot = path.join(__dirname, 'uploads');
// 默认图片目录（前端 public 下的静态默认资源，例如默认头像）
const defaultImagesRoot = path.join(__dirname, '..', 'frontend', 'public', 'default-images');
// 默认头像 URL，当用户没设置头像时使用
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
    // 去掉开头的 / 或 \，防止越权到磁盘根目录
    const sanitized = value.replace(/^[\\/]+/, '');
    // 解析成绝对路径
    const absolutePath = path.resolve(__dirname, sanitized);
    const uploadsRootWithSep = `${uploadsRoot}${path.sep}`;
    // 安全校验：必须在 uploads 目录内（禁止路径穿越）
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
        // 仅当路径合法且文件确实存在时才删除
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
// 允许的跨域来源白名单，来自环境变量 CORS_ORIGINS（用英文逗号分隔）
// 例：http://localhost:5173,https://yourdomain.com
// 若未配置或为空，则表示放行所有来源（开发期更方便）
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')              // 把逗号分隔的字符串拆成数组
    .map(origin => origin.trim()) // 去掉每个地址两侧的空格
    .filter(Boolean);        // 过滤掉空字符串

/** CORS 配置：若未配置白名单或请求无 Origin，则放行；否则仅允许白名单内域名 */
const corsOptions = {
    // 自定义跨域验证：
    // - 无 Origin（如 Postman）或未配置白名单时，直接放行
    // - 否则仅允许在白名单中的来源
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        // 不在白名单内则拒绝
        return callback(new Error('Not allowed by CORS'));
    },
    // 允许携带 Cookie/Authorization 等凭据
    credentials: true
};

// 启用 CORS 跨域支持
app.use(cors(corsOptions));
// 预检请求（OPTIONS）同样需要设置 CORS 响应头
app.options('*', cors(corsOptions));
// 解析 application/json 请求体
app.use(bodyParser.json());
// 解析 application/x-www-form-urlencoded 表单数据
app.use(bodyParser.urlencoded({ extended: true }));
// 暴露上传目录供前端直接访问图片（/uploads/xxx.jpg）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 暴露默认图片目录（例如默认头像）
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
    // 数据库地址/账号/密码/库名都来自环境变量，避免把敏感信息写进代码
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // 连接池参数：当连接都被占用时是否等待
    waitForConnections: true,
    // 连接池最大连接数（并发很高时可以适当调大）
    connectionLimit: 10,
    // 等待队列上限（0 表示不限制）
    queueLimit: 0,
    // 统一设置为东八区，便于和前端展示一致
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
        // 建表：站内消息（支持未读/已读、会话统计）
        await pool.execute(createMessagesTableSQL);
        // 建表：帖子图集（多图按 sort_order 排序）
        await pool.execute(createListingImagesTableSQL);
        // 建表：用户扩展资料（头像/昵称/学号/电话/签名）
        await pool.execute(createUserProfilesTableSQL);
        // 建表：关注关系（唯一约束避免重复关注）
        await pool.execute(createUserFollowsTableSQL);
        // 建表：收藏关系（唯一约束避免重复收藏）
        await pool.execute(createUserFavoritesTableSQL);
        // 建表：邮箱验证码（含过期时间与尝试次数）
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
        // 跑腿订单相关字段：支付/接单/完成/私密备注
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_paid TINYINT(1) NOT NULL DEFAULT 0');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_paid 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_paid_at DATETIME NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_paid_at 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_runner_id INT NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_runner_id 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_accept_at DATETIME NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_accept_at 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_completion_image_url VARCHAR(500) NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_completion_image_url 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_completion_note TEXT NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_completion_note 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_private_note TEXT NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_private_note 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_completion_at DATETIME NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_completion_at 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD COLUMN errand_payment_released_at DATETIME NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.warn('为 listings 表添加 errand_payment_released_at 失败：', e.message);
            }
        }
        try {
            await pool.execute('ALTER TABLE listings ADD INDEX idx_errand_runner (errand_runner_id)');
        } catch (e) {
            if (e.code !== 'ER_DUP_KEYNAME') {
                console.warn('为 listings 表添加 idx_errand_runner 索引失败：', e.message);
            }
        }
        // 数据修复：历史跑腿帖子若未标记支付，则默认视为已支付（便于后续接单流程）
        try {
            await pool.execute(`
                UPDATE listings
                SET errand_paid = 1,
                    errand_paid_at = COALESCE(errand_paid_at, NOW())
                WHERE type = 'errand'
                  AND (errand_paid IS NULL OR errand_paid = 0)
            `);
        } catch (e) {
            console.warn('初始化跑腿订单支付状态失败：', e.message);
        }
        // 同步封面图到图集表：若 listing_images 尚无对应记录则补一条
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

// 启动时执行一次数据库初始化（建表/加字段/补索引等），幂等设计，重复执行也安全
initializeDatabase();

// =================================================================
// 3. 文件上传配置 (Multer File Upload)
// =================================================================
// 配置 Multer 的磁盘存储引擎，定义文件保存路径和文件名生成规则
const storage = multer.diskStorage({
    // 定义文件保存的目标目录
    // destination 的函数签名：(req, file, cb) => void
    // - req: 本次请求对象（可用于根据路由动态决定保存目录）
    // - file: 当前正在处理的文件对象（包含原始文件名、MIME 类型等）
    // - cb: 回调函数，形如 cb(error, destinationPath)
    destination: (req, file, cb) => {
        // 这里将所有上传的文件保存到项目根目录下的 'uploads/' 文件夹
        // 注意：'uploads/' 会被上面 app.use('/uploads', express.static(...)) 映射为可直接访问的静态资源
        cb(null, 'uploads/');
    },
    // 定义文件保存时的文件名
    // filename 的函数签名：(req, file, cb) => void
    // - 通过回调返回最终文件名，确保唯一性并保留原始扩展名
    filename: (req, file, cb) => {
        // 生成唯一后缀：时间戳（避免冲突）+ 随机数（同一毫秒多文件）
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // 获取原始文件的扩展名（如 .jpg、.png）
        const ext = path.extname(file.originalname);
        // 构造最终文件名：固定前缀 'image-' + 唯一后缀 + 原始扩展名
        // 例如：image-1620000000000-123456789.jpg
        cb(null, 'image-' + uniqueSuffix + ext);
    }
});

// 通用上传中间件：限制大小为 5MB，仅允许图片类型
// 说明：multer(options) 会返回一个中间件工厂，后续通过 .single/.array/.fields 细化字段规则
const upload = multer({
    storage: storage, // 使用上面自定义的磁盘存储
    // 单个文件大小上限：5MB，避免占用过多磁盘空间
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    // 仅允许图片类型（根据 MIME 类型判断）
    // fileFilter 的签名：(req, file, cb) => void；cb(null, true) 表示接受该文件
    fileFilter: (req, file, cb) => {
        // 常见图片 MIME：image/jpeg, image/png, image/webp, image/gif 等
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            // 拒绝非图片文件，第二个参数 false 表示不接收
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// 帖子图片上传（支持 images[] 多图与 image 单图）
// 使用 upload.fields 来同时处理多个字段：
// - name: 字段名；maxCount: 该字段允许的最大文件数
// 处理后，multer 会把文件列表挂在 req.files 对应字段上（如 req.files.images）
const uploadListingImages = upload.fields([
    // 支持一次性上传多张图片：images[]
    { name: 'images', maxCount: 10 },
    // 同时兼容单张图片字段：image
    { name: 'image', maxCount: 1 }
]);
// 用户头像上传（单文件）：处理完成后文件对象位于 req.file
const uploadAvatar = upload.single('avatar'); // 头像只允许单文件
// 跑腿订单完成凭证（单文件）：处理完成后文件对象位于 req.file
const uploadErrandProof = upload.single('evidence'); // 跑腿完成凭证，单文件

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

/** 判断帖子是否为收购模块下的跑腿订单 */
const isErrandListingRecord = (record) => Boolean(record && record.type === 'errand');

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
    // 1) 查基础用户表（id/用户名/注册时间）
    const [userRows] = await pool.execute(
        'SELECT id, username, created_at FROM users WHERE id = ?',
        [targetUserId]
    );
    if (!userRows.length) {
        return null; // 用户不存在
    }

    const user = userRows[0];
    // 2) 查扩展资料（昵称/学号/电话/头像/签名）
    const [profileRows] = await pool.execute(
        'SELECT display_name, student_id, contact_phone, avatar_url, bio, updated_at FROM user_profiles WHERE user_id = ?',
        [targetUserId]
    );
    const profile = profileRows[0] || null;

    // 3) 统计信息：关注数、粉丝数、发帖数、收藏数
    const [[stats]] = await pool.execute(
        `SELECT
            (SELECT COUNT(*) FROM user_follows WHERE follower_id = ?) AS following_count, -- 我关注了多少人
            (SELECT COUNT(*) FROM user_follows WHERE following_id = ?) AS follower_count, -- 有多少人关注我
            (SELECT COUNT(*) FROM listings WHERE user_id = ?) AS listings_count,           -- 我的发帖数
            (SELECT COUNT(*) FROM user_favorites WHERE user_id = ?) AS favorites_count     -- 我的收藏数
        `,
        [targetUserId, targetUserId, targetUserId, targetUserId]
    );

    // 4) 关系：是自己、是否互相关注
    let relationship = {
        isSelf: currentUserId === targetUserId,
        isFollowing: false, // 当前用户是否关注了对方
        isFollower: false   // 对方是否关注了当前用户
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
            avatarUrl: withAvatarFallback(profile?.avatar_url), // 无头像则兜底默认头像
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
    // followers：查看“谁在关注 target”；following：查看“target 关注了谁”
    const isFollowersMode = mode === 'followers';
    const selectColumn = isFollowersMode ? 'uf.follower_id' : 'uf.following_id'; // 取另一端用户
    const whereColumn = isFollowersMode ? 'uf.following_id' : 'uf.follower_id'; // 以 target 作为过滤条件

    const [rows] = await pool.execute(
        `SELECT 
            ${selectColumn} AS user_id,
            u.username,
            up.display_name,
            up.avatar_url,
            up.bio,
            uf.created_at AS relation_created_at,
            -- 当前登录用户是否已关注对方
            EXISTS(
                SELECT 1 FROM user_follows 
                WHERE follower_id = ? AND following_id = ${selectColumn}
            ) AS is_followed_by_current,
            -- 对方是否关注了当前登录用户（互关）
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
    // 用户收藏列表：联合帖子表并统计每个帖子的图片数量
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
    const authHeader = req.headers['authorization']; // 形如：Bearer xxxx.yyyy.zzzz
    const token = authHeader && authHeader.split(' ')[1]; // 取出第二段令牌
    if (token == null) return res.sendStatus(401); // 未携带令牌 -> 未认证

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // 令牌无效或过期 -> 禁止访问
        req.user = user; // 解出的载荷：{ id, username }
        next();
    });
};

/**
 * 可选解析 Authorization 头部的 Bearer Token，失败时返回 null
 * @param {import('express').Request} req
 * @returns {{ id: number, username: string } | null}
 */
const tryDecodeToken = (req) => {
    const authHeader = req.headers?.['authorization'];
    if (!authHeader) return null;
    const [scheme, token] = authHeader.split(' ');
    if (!token || scheme?.toLowerCase() !== 'bearer') return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET); // 校验通过返回载荷，否则抛错
    } catch {
        return null;
    }
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
        // 创建 SMTP 发送器（云服务器需确保防火墙放行、供应商未封锁 SMTP）
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
        // 开发/回退模式：不真正发邮件，只在控制台打印，便于本地调试
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
        // 频率限制：60 秒内不可重复申请，防止被滥用炸邮箱
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
        const codeHash = await bcrypt.hash(code, 10); // 只保存哈希，不保存明文
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 分钟有效期
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null; // 记录请求来源 IP

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
        if (record.attempt_count >= 5) { // 尝试次数过多，要求重新获取
            await connection.rollback();
            return res.status(429).json({ message: '尝试过多，请重新获取验证码。' });
        }

        const match = await bcrypt.compare(code, record.code_hash);
        if (!match) {
            // 校验失败：尝试次数 +1（防暴力枚举）
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
        // 传入 targetId = currentId，以便返回关系中 isSelf=true
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
        // 与当前用户对比，补充“是否已关注/是否粉丝”等关系
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

        // 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现“有则更新、无则插入”
        // avatar_url 仅当请求体明确提供时才覆盖；否则保留数据库中的旧值
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

        // 返回最新快照，便于前端立即刷新
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

    const newAvatarUrl = buildImageUrl(req.file); // 生成 /uploads/... 供前端直连
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

        // 若旧头像也是本地上传的文件，则删除物理文件，避免磁盘堆积
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

    // 目标用户必须存在
    const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [targetId]);
    if (!users.length) {
        return res.status(404).json({ message: 'User not found.' });
    }

    try {
        // 唯一约束 (follower_id, following_id) 确保不会重复关注
        await pool.execute(
            `INSERT INTO user_follows (follower_id, following_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE created_at = created_at`,
            [currentUserId, targetId]
        );
        // 返回对方的快照和自己的统计，便于前端同步 UI
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
        // followers 模式：列出“谁在关注 targetId”
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
        // following 模式：列出“targetId 关注了谁”
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

    const likeValue = `%${keyword}%`; // 模糊查询
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

    // 目标帖子必须存在
    const [listings] = await pool.execute('SELECT id FROM listings WHERE id = ?', [listingId]);
    if (!listings.length) {
        return res.status(404).json({ message: 'Listing not found.' });
    }

    try {
        // upsert：重复收藏会更新时间，前端即可用该时间排序
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
        // 尝试解析查看者身份（未登录也可访问列表，用于控制跑腿隐私字段显隐）
        const viewer = tryDecodeToken(req);
        const viewerId = viewer?.id ? Number(viewer.id) : null;
        // 读取查询参数：类型、作者、状态、关键词、分类、细分项、起止地点
        const { type, userId, status, searchTerm, category, itemType, startLocation, endLocation } = req.query;
        // 基础 SQL：同时统计每个帖子的图片数量，便于前端展示
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
    if ((type === 'sale' || type === 'acquire' || type === 'errand') && category === 'service') {
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
        
        sql += ' ORDER BY l.created_at DESC'; // 最新发布的排最前
        const [rows] = await pool.execute(sql, params); // 执行查询
        // 展示友好化：地点中文/自定义文本，并隐藏敏感跑腿信息
        const presented = rows.map((raw) => {
            const row = { ...raw };
            const isErrand = row.type === 'errand';
            if (isErrand) {
                const allowedIds = new Set([Number(row.user_id)]);
                if (row.errand_runner_id != null) {
                    allowedIds.add(Number(row.errand_runner_id));
                }
                const canViewFull = Boolean(viewerId && allowedIds.has(viewerId));
                if (!canViewFull) {
                    row.image_url = null;
                    row.images_count = 0;
                    row.start_location = null;
                    row.end_location = null;
                    row.errand_completion_image_url = null;
                    row.errand_completion_note = null;
                    row.errand_private_note = null;
                }
                row.errand_locked = !canViewFull;
            } else {
                row.errand_private_note = null;
            }
            row.start_location = presentLocation(row.start_location);
            row.end_location = presentLocation(row.end_location);
            return row;
        });
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
    const { title, description, category, type, start_location, end_location } = req.body; // 帖子基本信息
    const { id: userId, username: userName } = req.user; // 作者信息来自 token
    const uploadedImages = gatherUploadedImages(req); // 本次上传的所有图片
    const coverImageUrl = uploadedImages.length ? buildImageUrl(uploadedImages[0]) : null; // 封面=第一张图

    if (!title || !description || !type) {
        return res.status(400).json({ message: 'Title, description, and type are required.' });
    }

    // 价格处理：表单可能出现重复字段 -> 取第一个；非数字或负数则归零
    const rawPriceInput = Array.isArray(req.body?.price) ? req.body.price[0] : req.body?.price;
    const parsedPrice = Number(rawPriceInput);
    const normalizedPrice = Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0;
    const isErrandOrder = type === 'errand';
    if (isErrandOrder && normalizedPrice <= 0) {
        return res.status(400).json({ message: '跑腿代办需设置大于 0 的酬劳。' });
    }

    let connection;
    try {
    connection = await pool.getConnection();
    await connection.beginTransaction(); // 开启事务：确保多表写入的一致性

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
                  lost_student_id,
                  errand_paid, errand_paid_at, errand_runner_id, errand_accept_at,
                  errand_completion_image_url, errand_completion_note, errand_private_note, errand_completion_at, errand_payment_released_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?,
            ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?)
    `;
    const shouldStoreLocations = isErrandOrder && category === 'service'; // 仅跑腿服务才保存起止地点
        const startLoc = shouldStoreLocations ? normalizeFormLocation(start_location) : null;
        const endLoc = shouldStoreLocations ? normalizeFormLocation(end_location) : null;
        // 丢失者学号（仅 lostfound 模块允许）
        let lostStudentId = sanitizeNullableString(req.body?.lostStudentId ?? req.body?.lost_student_id, 16);
        if (type !== 'lostfound') {
            lostStudentId = null;
        } else if (lostStudentId && !isValidStudentId(lostStudentId)) {
            await connection.rollback();
            return res.status(400).json({ message: '丢失者学号格式不合法。' });
        }
        const errandPaid = isErrandOrder ? 1 : 0;
        const errandPaidAt = isErrandOrder ? new Date() : null;
        const errandPrivateNote = isErrandOrder ? sanitizeNullableString(req.body?.errandPrivateNote ?? req.body?.errand_private_note, 2000) : null;
        const [result] = await connection.execute(sql, [
            title, description, normalizedPrice, category, userId, userName, type, coverImageUrl,
            bookType, bookMajor,
            lectureLocation, lectureStartAt, lectureEndAt,
            startLoc, endLoc,
            lostStudentId,
            errandPaid, errandPaidAt, null, null,
            null, null, errandPrivateNote, null, null
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

        await connection.commit(); // 提交事务

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
        console.error('创建帖子失败', err);
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
    const { title, description, category, existingImageUrl, start_location, end_location } = req.body;
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

        const allowedTypes = new Set(['sale', 'acquire', 'help', 'lostfound', 'errand']);
        const rawType = sanitizeNullableString(req.body?.type, 32);
        const nextType = allowedTypes.has(rawType) ? rawType : listings[0].type;

        // 价格：仅出售/收购保留，其他类型默认 0
        let normalizedPrice = 0;
        if (nextType === 'sale' || nextType === 'acquire' || nextType === 'errand') {
            const rawPrice = Array.isArray(req.body?.price) ? req.body.price[0] : req.body?.price;
            const numericPrice = Number(rawPrice);
            normalizedPrice = Number.isFinite(numericPrice) ? numericPrice : Number(listings[0].price || 0);
        }
        const isErrandListing = nextType === 'errand';
        if (isErrandListing && normalizedPrice <= 0) {
            await connection.rollback();
            return res.status(400).json({ message: '跑腿代办需设置大于 0 的酬劳。' });
        }

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

        let lostStudentId = sanitizeNullableString(req.body?.lostStudentId ?? req.body?.lost_student_id, 16);
        if (nextType !== 'lostfound') {
            lostStudentId = null;
        } else if (lostStudentId && !isValidStudentId(lostStudentId)) {
            await connection.rollback();
            return res.status(400).json({ message: '丢失者学号格式不合法。' });
        }

        const sql = `
            UPDATE listings SET title = ?, description = ?, price = ?, category = ?, type = ?, image_url = ?,
            book_type = ?, book_major = ?,
            lecture_location = ?, lecture_start_at = ?, lecture_end_at = ?,
            start_location = ?, end_location = ?,
            lost_student_id = ?,
            errand_private_note = ?
            WHERE id = ? AND user_id = ?
        `;
        const shouldStoreLocations = isErrandListing && category === 'service';
        const startLoc = shouldStoreLocations
            ? (start_location === undefined ? listings[0].start_location : normalizeFormLocation(start_location))
            : null;
        const endLoc = shouldStoreLocations
            ? (end_location === undefined ? listings[0].end_location : normalizeFormLocation(end_location))
            : null;
        let errandPrivateNote = null;
        if (isErrandListing) {
            const rawPrivate = req.body?.errandPrivateNote ?? req.body?.errand_private_note;
            if (rawPrivate === undefined) {
                errandPrivateNote = listings[0].errand_private_note ?? null;
            } else {
                errandPrivateNote = sanitizeNullableString(rawPrivate, 2000);
            }
        }
        await connection.execute(sql, [
            title, description, normalizedPrice, category, nextType, coverImageUrl,
            bookType, bookMajor,
            lectureLocation, lectureStartAt, lectureEndAt,
            startLoc, endLoc,
            lostStudentId,
            errandPrivateNote,
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
        const [listings] = await pool.execute('SELECT image_url, errand_completion_image_url FROM listings WHERE id = ? AND user_id = ?', [listingId, userId]);
        if (listings.length === 0) {
            return res.status(403).json({ message: 'Forbidden: You do not own this listing or it does not exist.' });
        }
        const { image_url, errand_completion_image_url } = listings[0];

        const [galleryImages] = await pool.execute(
            'SELECT image_url FROM listing_images WHERE listing_id = ?',
            [listingId]
        );
        const filesToDelete = new Set();
        if (image_url) {
            filesToDelete.add(image_url);
        }
        if (errand_completion_image_url) {
            filesToDelete.add(errand_completion_image_url);
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
    const viewer = tryDecodeToken(req);
    const viewerId = viewer?.id ? Number(viewer.id) : null;
    try {
        const [listings] = await pool.execute(`
            SELECT l.*, u.username AS owner_name, runner.username AS errand_runner_name
            FROM listings l
            JOIN users u ON l.user_id = u.id
            LEFT JOIN users runner ON l.errand_runner_id = runner.id
            WHERE l.id = ?
        `, [listingId]);

        if (listings.length === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }

        const listing = listings[0];
    const isSensitiveErrand = listing.type === 'errand';
        if (isSensitiveErrand) {
            const allowedIds = new Set([Number(listing.user_id)]);
            if (listing.errand_runner_id) {
                allowedIds.add(Number(listing.errand_runner_id));
            }
            if (!viewerId || !allowedIds.has(viewerId)) {
                return res.status(403).json({ message: '该跑腿订单详情仅接单人和发布者可见。' });
            }
        }

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

// 跑腿订单：接单
app.post('/api/errands/:id/accept', authenticateToken, async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
        return res.status(400).json({ message: 'Invalid listing id.' });
    }
    const runnerId = req.user.id;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction(); // 事务保护：锁定记录并原子更新

        // 加 FOR UPDATE：防止并发接单造成抢占
        const [rows] = await connection.execute('SELECT * FROM listings WHERE id = ? FOR UPDATE', [listingId]);
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ message: 'Listing not found.' });
        }
        const listing = rows[0];
        if (!isErrandListingRecord(listing)) {
            await connection.rollback();
            return res.status(400).json({ message: '该帖子不是跑腿订单，无法接单。' });
        }
        if (Number(listing.user_id) === runnerId) {
            await connection.rollback();
            return res.status(400).json({ message: '不能接自己的跑腿订单。' });
        }
        if (listing.status !== 'available') {
            await connection.rollback();
            return res.status(409).json({ message: '该跑腿订单已被接或不在上架中。' });
        }
        if (listing.errand_runner_id) {
            await connection.rollback();
            return res.status(409).json({ message: '已有同学接下该跑腿订单。' });
        }
        const paidFlag = Number(listing.errand_paid || 0) === 1 || Boolean(listing.errand_paid_at); // 模拟支付完成
        if (!paidFlag) {
            await connection.rollback();
            return res.status(409).json({ message: '发单人尚未完成支付，暂无法接单。' });
        }

        await connection.execute(
            'UPDATE listings SET errand_runner_id = ?, errand_accept_at = NOW(), status = "in_progress" WHERE id = ?',
            [runnerId, listingId]
        );

        try {
            await connection.execute(
                'INSERT INTO messages (listing_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)',
                [listingId, runnerId, listing.user_id, '有同学已接单，请及时关注任务进度。']
            );
        } catch (messageError) {
            console.warn('接单通知发送失败：', messageError.message);
        }

        await connection.commit();
        res.json({ message: '接单成功，请按要求完成任务。' });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// 跑腿订单：上传完成凭证
app.post('/api/errands/:id/proof', authenticateToken, uploadErrandProof, async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
        if (req.file) deletePhysicalFiles([buildImageUrl(req.file)]);
        return res.status(400).json({ message: 'Invalid listing id.' });
    }
    const runnerId = req.user.id;
    const proofFile = req.file; // 由 multer 注入
    if (!proofFile) {
        return res.status(400).json({ message: '请上传完成照片作为凭证。' });
    }
    const proofUrl = buildImageUrl(proofFile);
    const proofNote = sanitizeNullableString(req.body?.note, 500);

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT * FROM listings WHERE id = ? FOR UPDATE', [listingId]); // 锁行
        if (!rows.length) {
            await connection.rollback();
            deletePhysicalFiles([proofUrl]);
            return res.status(404).json({ message: 'Listing not found.' });
        }
        const listing = rows[0];
        if (!isErrandListingRecord(listing)) {
            await connection.rollback();
            deletePhysicalFiles([proofUrl]);
            return res.status(400).json({ message: '该帖子不是跑腿订单，无法上传凭证。' });
        }
        if (Number(listing.errand_runner_id) !== runnerId) {
            await connection.rollback();
            deletePhysicalFiles([proofUrl]);
            return res.status(403).json({ message: '仅接单人可以上传完成凭证。' });
        }
        if (listing.status !== 'in_progress') {
            await connection.rollback();
            deletePhysicalFiles([proofUrl]);
            return res.status(409).json({ message: '当前状态不允许上传完成凭证。' });
        }

        const previousProof = listing.errand_completion_image_url; // 若有旧凭证，成功后删除旧文件，避免堆积
        await connection.execute(
            'UPDATE listings SET errand_completion_image_url = ?, errand_completion_note = ?, errand_completion_at = NOW() WHERE id = ?',
            [proofUrl, proofNote, listingId]
        );

        try {
            await connection.execute(
                'INSERT INTO messages (listing_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)',
                [listingId, runnerId, listing.user_id, '跑腿订单已提交完成凭证，请及时确认。']
            );
        } catch (messageError) {
            console.warn('完成凭证通知发送失败：', messageError.message);
        }

        await connection.commit();
        if (previousProof && previousProof !== proofUrl) {
            deletePhysicalFiles([previousProof]);
        }
        res.json({ message: '凭证上传成功，请等待发单人确认。', proofUrl });
    } catch (err) {
        if (connection) await connection.rollback();
        deletePhysicalFiles([proofUrl]);
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// 跑腿订单：发单人确认完成，释放酬劳
app.post('/api/errands/:id/confirm', authenticateToken, async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
        return res.status(400).json({ message: 'Invalid listing id.' });
    }
    const ownerId = req.user.id;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute('SELECT * FROM listings WHERE id = ? FOR UPDATE', [listingId]);
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ message: 'Listing not found.' });
        }
        const listing = rows[0];
        if (!isErrandListingRecord(listing)) {
            await connection.rollback();
            return res.status(400).json({ message: '该帖子不是跑腿订单，无法确认完成。' });
        }
        if (Number(listing.user_id) !== ownerId) {
            await connection.rollback();
            return res.status(403).json({ message: '仅发单人可以确认完成。' });
        }
        if (!listing.errand_runner_id) {
            await connection.rollback();
            return res.status(409).json({ message: '尚未有同学接单，无法确认完成。' });
        }
        if (!listing.errand_completion_image_url) {
            await connection.rollback();
            return res.status(409).json({ message: '对方尚未上传完成凭证。' });
        }
        if (listing.status === 'completed') {
            await connection.rollback();
            return res.status(409).json({ message: '该跑腿订单已确认完成。' });
        }

        await connection.execute(
            'UPDATE listings SET status = "completed", errand_payment_released_at = NOW() WHERE id = ?',
            [listingId]
        );

        try {
            await connection.execute(
                'INSERT INTO messages (listing_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)',
                [listingId, ownerId, listing.errand_runner_id, '跑腿订单已确认完成，酬劳已划转。']
            );
        } catch (messageError) {
            console.warn('确认完成通知发送失败：', messageError.message);
        }

        await connection.commit();
    res.json({ message: '已确认完成，酬劳已模拟转账给接单人。' }); // 此处为演示逻辑，实际应对接支付平台
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    } finally {
        if (connection) connection.release();
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

        const [listings] = await connection.execute('SELECT * FROM listings WHERE id = ? FOR UPDATE', [listingId]); // 锁定商品，防止并发购买
        if (listings.length === 0 || listings[0].status !== 'available' || listings[0].user_id === buyerId) {
            await connection.rollback();
            return res.status(400).json({ message: 'This item is not available for purchase or it is your own item.' });
        }
        const listing = listings[0];
        
        const [orderResult] = await connection.execute(
            'INSERT INTO orders (listing_id, buyer_id, seller_id, price, status) VALUES (?, ?, ?, ?, "to_pay")',
            [listing.id, buyerId, listing.user_id, listing.price]
        );
    await connection.execute('UPDATE listings SET status = "in_progress" WHERE id = ?', [listing.id]); // 下单后设为进行中
        
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
    const { role, status } = req.query; // role: 'buyer' | 'seller' | 'runner'
    if (!['buyer', 'seller', 'runner'].includes(role)) {
        return res.status(400).json({ message: 'Role must be "buyer"、"seller" 或 "runner".' });
    }
    try {
    if (role === 'runner') { // 跑腿订单视图：来自 listings（非 orders 表）
            let sql = `
                SELECT 
                    l.id AS listing_id,
                    l.title AS listing_title,
                    l.description,
                    l.price,
                    l.status,
                    l.type AS listing_type,
                    l.image_url AS listing_image_url,
                    l.errand_accept_at,
                    l.errand_completion_at,
                    l.errand_payment_released_at,
                    l.errand_completion_image_url,
                    l.errand_completion_note,
                    l.errand_private_note,
                    l.start_location,
                    l.end_location,
                    l.user_id AS seller_id,
                    owner.username AS seller_name,
                    l.errand_runner_id AS buyer_id,
                    runner.username AS buyer_name
                FROM listings l
                JOIN users owner ON l.user_id = owner.id
                LEFT JOIN users runner ON l.errand_runner_id = runner.id
                WHERE l.type = 'errand' AND l.errand_runner_id = ?
            `;
            const params = [userId];
            if (status && status !== 'all') {
                sql += ' AND l.status = ?';
                params.push(status);
            }
            sql += ' ORDER BY COALESCE(l.errand_accept_at, l.created_at) DESC';
            const [rows] = await pool.execute(sql, params);
            const formatted = rows.map((row) => ({ // 统一为前端提供订单风格字段
                id: `errand-${row.listing_id}`,
                listing_id: row.listing_id,
                listing_title: row.listing_title,
                listing_image_url: row.listing_image_url,
                listing_type: row.listing_type,
                price: row.price,
                status: row.status,
                seller_id: row.seller_id,
                seller_name: row.seller_name,
                buyer_id: row.buyer_id,
                buyer_name: row.buyer_name,
                errand_accept_at: row.errand_accept_at,
                errand_completion_at: row.errand_completion_at,
                errand_payment_released_at: row.errand_payment_released_at,
                errand_completion_image_url: row.errand_completion_image_url,
                errand_completion_note: row.errand_completion_note,
                errand_private_note: row.errand_private_note,
                start_location: row.start_location,
                end_location: row.end_location,
                order_kind: 'errand'
            }));
            return res.json(formatted);
        }

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
        console.error('[Orders] Failed to fetch orders', {
            userId,
            role,
            status,
            error: err.message,
            stack: err.stack
        });
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

    const [orders] = await connection.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]); // 锁定订单
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Order not found.' });
        }
        const order = orders[0];
        const listingId = order.listing_id;

    // 权限校验：只允许当前状态正确且对应角色的用户更新
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
        // 聚合每个对话对象的最新一条消息与未读数
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

        // 双向消息拉取，限制最多 500 条按时间升序
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
        if (!Number.isInteger(listingId) || listingId <= 0) {
            return res.status(400).json({ message: 'Invalid listing id.' });
        }

        const viewer = tryDecodeToken(req);
        const viewerId = viewer?.id ? Number(viewer.id) : null;
        const [[listing]] = await pool.execute(
            'SELECT user_id, type, category, errand_runner_id FROM listings WHERE id = ? LIMIT 1',
            [listingId]
        );
        if (!listing) {
            return res.status(404).json({ message: 'Listing not found.' });
        }
        if (isErrandListingRecord(listing)) {
            const allowedIds = new Set([Number(listing.user_id)]);
            if (listing.errand_runner_id) allowedIds.add(Number(listing.errand_runner_id));
            if (!viewerId || !allowedIds.has(viewerId)) {
                return res.status(403).json({ message: '跑腿订单留言仅接单人和发布者可见。' });
            }
        }

        const [rows] = await pool.execute(
            'SELECT id, user_id, user_name, content, created_at, parent_reply_id FROM replies WHERE listing_id = ? ORDER BY created_at ASC',
            [listingId]
        );
        // 构建二级评论树：顶级 + children（只到第二层，避免过深嵌套）
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
    if (!Number.isInteger(listingId) || listingId <= 0) {
        return res.status(400).json({ message: 'Invalid listing id.' });
    }
    if (!text) {
        return res.status(400).json({ message: 'Reply content cannot be empty.' });
    }
    try {
        const [[listing]] = await pool.execute(
            'SELECT user_id, type, category, errand_runner_id FROM listings WHERE id = ? LIMIT 1',
            [listingId]
        );
        if (!listing) {
            return res.status(404).json({ message: 'Listing not found.' });
        }
        if (isErrandListingRecord(listing)) {
            const allowedIds = new Set([Number(listing.user_id)]);
            if (listing.errand_runner_id) allowedIds.add(Number(listing.errand_runner_id));
            if (!allowedIds.has(userId)) {
                return res.status(403).json({ message: '跑腿订单暂不支持公开留言。' });
            }
        }

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
    const [[row]] = await pool.execute('SELECT id, user_id FROM replies WHERE id = ? LIMIT 1', [replyId]); // 校验所有权
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

    const [[row]] = await connection.execute('SELECT id, user_id FROM replies WHERE id = ? FOR UPDATE', [replyId]); // 锁定待删评论
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

        socket.user = user; // 把登录用户挂到 socket 上，后续消息发送要用
        registerSocket(user.id, socket); // 记录到在线连接表
        sendJson(socket, { type: 'ready' }); // 告知客户端连接就绪

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
                // 1) 持久化消息到数据库
                const [result] = await pool.execute(
                    'INSERT INTO messages (sender_id, receiver_id, content, listing_id) VALUES (?, ?, ?, ?)',
                    [user.id, toUserId, content, listingId || null]
                );

                const messageId = result.insertId;
                // 2) 查出带用户名的完整消息（发给双方）
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

                // 3) 即时推送给双方当前在线的所有连接
                broadcastToUser(user.id, messagePayload);
                broadcastToUser(toUserId, messagePayload);

                // 4) 刷新双方的“最近会话”摘要（未读/最后消息）
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
    // 监听所有网卡（0.0.0.0）以便容器/云服务器对外访问
    console.log(`Backend server is running on http://0.0.0.0:${port}`);
    console.log(`Local access: http://localhost:${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
    console.log('Press Ctrl+C to stop the server.');
});
