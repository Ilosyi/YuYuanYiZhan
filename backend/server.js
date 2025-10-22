// =================================================================
// “喻园易站” - 后端服务器主文件
// 版本: 1.3 - 实现完整的订单状态流转API
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
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const uploadsRoot = path.join(__dirname, 'uploads');
const defaultImagesRoot = path.join(__dirname, '..', 'frontend', 'public', 'default-images');
const DEFAULT_AVATAR_URL = '/default-images/default-avatar.jpg';

const withAvatarFallback = (value) => value || DEFAULT_AVATAR_URL;

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

const buildImageUrl = (file) => `/uploads/${file.filename}`;

const isLocalUploadUrl = (value) => typeof value === 'string' && value.startsWith('/uploads/');

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
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

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
    try {
        await pool.execute(createMessagesTableSQL);
        await pool.execute(createListingImagesTableSQL);
        await pool.execute(createUserProfilesTableSQL);
        await pool.execute(createUserFollowsTableSQL);
        await pool.execute(createUserFavoritesTableSQL);
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

const uploadListingImages = upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'image', maxCount: 1 }
]);
const uploadAvatar = upload.single('avatar');

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

// --- 5.1.1 用户资料路由 (User Profile Routes) ---
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

app.put('/api/users/me', authenticateToken, async (req, res) => {
    const displayName = sanitizeNullableString(req.body.displayName, 255);
    const studentId = sanitizeNullableString(req.body.studentId, 50);
    const contactPhone = sanitizeNullableString(req.body.contactPhone, 50);
    const avatarUrl = sanitizeNullableString(req.body.avatarUrl, 500);
    const bio = sanitizeNullableString(req.body.bio, 2000);

    try {
        await pool.execute(
            `INSERT INTO user_profiles (user_id, display_name, student_id, contact_phone, avatar_url, bio)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 display_name = VALUES(display_name),
                 student_id = VALUES(student_id),
                 contact_phone = VALUES(contact_phone),
                 /* 仅当客户端明确提供 avatarUrl 时才更新；否则保留原值 */
                 avatar_url = IFNULL(VALUES(avatar_url), avatar_url),
                 bio = VALUES(bio)`
            ,
            [req.user.id, displayName, studentId, contactPhone, avatarUrl, bio]
        );

    const snapshot = await getUserProfileSnapshot(req.user.id, req.user.id);
        res.json({ message: 'Profile updated successfully.', profile: snapshot });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update profile.', error: error.message });
    }
});

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

app.get('/api/users/me/favorites', authenticateToken, async (req, res) => {
    try {
        const favorites = await fetchFavoriteListings(req.user.id);
        res.json({ favorites });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load favorites.', error: error.message });
    }
});

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
app.get('/api/listings', async (req, res) => {
    try {
        const { type, userId, status, searchTerm, category } = req.query;
        let sql = `
            SELECT l.*, (
                SELECT COUNT(*) FROM listing_images li WHERE li.listing_id = l.id
            ) AS images_count
            FROM listings l
            WHERE 1=1
        `;
        const params = [];
        if (type) { sql += ' AND l.type = ?'; params.push(type); }
        if (userId) { sql += ' AND l.user_id = ?'; params.push(userId); }
        if (status && status !== 'all') { sql += ' AND l.status = ?'; params.push(status); }
        if (searchTerm) { sql += ' AND (l.title LIKE ? OR l.description LIKE ?)'; params.push(`%${searchTerm}%`, `%${searchTerm}%`); }
        if (category && category !== 'all') { sql += ' AND l.category = ?'; params.push(category); }
        sql += ' ORDER BY l.created_at DESC';
        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 发布新帖子 (受保护接口)
app.post('/api/listings', authenticateToken, uploadListingImages, async (req, res) => {
    const { title, description, price, category, type } = req.body;
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

        const sql = `
            INSERT INTO listings (title, description, price, category, user_id, user_name, type, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await connection.execute(sql, [title, description, price || 0, category, userId, userName, type, coverImageUrl]);

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
app.put('/api/listings/:id', authenticateToken, uploadListingImages, async (req, res) => {
    const listingId = req.params.id;
    const { id: userId } = req.user;
    const { title, description, price, category, existingImageUrl } = req.body;
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

        const sql = `
            UPDATE listings SET title = ?, description = ?, price = ?, category = ?, image_url = ?
            WHERE id = ? AND user_id = ?
        `;
        await connection.execute(sql, [title, description, price, category, coverImageUrl, listingId, userId]);

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
        const [images] = await pool.execute(
            'SELECT id, image_url, sort_order FROM listing_images WHERE listing_id = ? ORDER BY sort_order, id',
            [listingId]
        );
        listing.images = images;
        const [replies] = await pool.execute(`
            SELECT r.id, r.user_id, r.user_name, r.content, r.created_at
            FROM replies r
            WHERE r.listing_id = ?
            ORDER BY r.created_at ASC
        `, [listingId]);

        res.json({ listing, replies });
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

// =================================================================
// 6. WebSocket 服务器 (WebSocket Server)
// =================================================================
const activeClients = new Map(); // userId -> Set<WebSocket>

const sendJson = (socket, payload) => {
    if (!socket || socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(payload));
};

const broadcastToUser = (userId, payload) => {
    const sockets = activeClients.get(userId);
    if (!sockets) return;
    sockets.forEach(socket => sendJson(socket, payload));
};

const registerSocket = (userId, socket) => {
    if (!activeClients.has(userId)) {
        activeClients.set(userId, new Set());
    }
    activeClients.get(userId).add(socket);
};

const unregisterSocket = (userId, socket) => {
    if (!activeClients.has(userId)) return;
    const sockets = activeClients.get(userId);
    sockets.delete(socket);
    if (sockets.size === 0) {
        activeClients.delete(userId);
    }
};

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

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket, req) => {
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

        socket.on('close', () => {
            if (socket.user) {
                unregisterSocket(socket.user.id, socket);
            }
        });

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
if (process.env.SERVE_FRONTEND === 'true') {
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
