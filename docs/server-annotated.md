# server.js 逐行注释与导读（教学版）



> 阅读方式建议：
> - 左右分屏：左边打开 `backend/server.js`，右边查看本文。
> - 本文以“章节 + 片段 + 逐行释义”的方式进行，片段后的“要点小结”会帮你快速复盘。

---

## 目录
- A. 基础概念速通（什么是 Node.js/Express/REST/WebSocket）
- B. 第 1 章：引入模块与创建应用（第 1-30 行）
- C. 第 2 章：工具函数（头像兜底、上传路径、删除文件、解析保留图片）（第 31-120 行）
- D. 第 3 章：中间件配置（CORS/JSON/静态目录）（第 121-170 行）
- E. 第 4 章：数据库连接池与初始化（第 171-… 行）
- F. 第 5 章：文件上传（Multer）与中间件
- G. 第 6 章：鉴权（JWT）与辅助
- H. 第 7 章：账户与邮箱验证码（Nodemailer）
- I. 第 8 章：业务路由（Users/Listings/Errands/Orders/Messages/Replies）
- J. 第 9 章：WebSocket 聊天服务（ws）
- K. 第 10 章：托管前端与启动服务

> 行号为近似参考，随着代码演进略有偏差，请以实际文件为准。

---

## A. 基础概念速通
- Node.js：让你在服务器上运行 JavaScript 的平台。
- Express：一款轻量的 Web 框架，负责处理 HTTP 请求、路由与中间件。
- REST API：用 HTTP 的 GET/POST/PUT/DELETE 表达“读/增/改/删”的风格。
- WebSocket：一条长连接，前后端可以互相“推送”消息（不像 HTTP 每次都要请求）。

---

## B. 第 1 章：引入模块与创建应用（第 1-30 行）

代码片段（简化）：
```js
require('dotenv').config();            // 1. 加载 .env 环境变量
const express = require('express');     // 2. 引入 Express 框架
const http = require('http');           // 3. Node 自带 HTTP 模块，用于承载 Express
const path = require('path');           // 4. 处理文件与目录路径
const fs = require('fs');               // 5. 读写文件（删除上传图片等）
const mysql = require('mysql2/promise');// 6. 连接 MySQL（promise 版便于 async/await）
const bodyParser = require('body-parser'); // 7. 解析 JSON/表单
const cors = require('cors');           // 8. 处理跨域 CORS
const multer = require('multer');       // 9. 处理表单文件上传
const bcrypt = require('bcrypt');       // 10. 密码哈希/验证
const jwt = require('jsonwebtoken');    // 11. 签发与校验 JWT 令牌
const nodemailer = require('nodemailer');//12. 发送邮件（验证码）
const { WebSocketServer } = require('ws');//13. WebSocket 服务端

const app = express();                  // 14. 创建一个 Express 应用
const server = http.createServer(app);  // 15. 用 HTTP 承载 Express（便于后续挂 WS）
const port = process.env.PORT || 3000;  // 16. 端口：从 .env 取，默认 3000
const uploadsRoot = path.join(__dirname, 'uploads');         // 17. 上传目录
const defaultImagesRoot = path.join(__dirname, '..', 'frontend', 'public', 'default-images');
const DEFAULT_AVATAR_URL = '/default-images/default-avatar.jpg'; // 18. 默认头像 URL
```
逐行释义：
- 1：读取 `.env` 文件，把内容放进 `process.env`，例如 `DB_HOST`、`JWT_SECRET`。
- 2-13：加载项目用到的库（见右侧注释）。
- 14：创建 Express 实例，后续所有“路由/中间件”都挂在它上面。
- 15：用 Node 的 `http.createServer(app)` 把 Express 包起来：这是为了同时在同一个端口上跑 WebSocket（WS 需要直接操作底层 server）。
- 16：确定启动端口，优先用环境变量；没有就使用 3000。
- 17-18：准备静态资源目录（上传图片和默认头像）。

要点小结：这部分就是“准备工具、创建服务”，和“把配置读进来”。

---

## C. 第 2 章：工具函数（第 31-120 行）
- `withAvatarFallback(value)`：如果用户没设置头像，给它一个默认头像地址。
- `resolveUploadAbsolutePath(value)`：把以 `/uploads/` 开头的 URL 转成磁盘绝对路径，并且“确保它真的在 uploads 目录里面”，避免安全问题。
- `gatherUploadedImages(req)`：因为可能前端用 `images[]` 或单个 `image` 字段上传，这里“合并收集”一下本次请求里上传的图片文件。
- `buildImageUrl(file)`：Multer 保存后只知道文件名，这里把它拼成对外可访问的 URL：`/uploads/<filename>`。
- `isLocalUploadUrl(value)`：检查一个 URL 是否是本服务管理的上传文件（是不是以 `/uploads/` 开头）。
- `deletePhysicalFiles(urls)`：把上面这些 URL 转成绝对路径然后 `fs.unlinkSync` 删除物理文件（删除前做存在性与安全校验）。
- `parseKeepImageIds(raw)`：解析“保留哪些图片 ID”的列表，兼容传字符串或数组，过滤出大于 0 的整数。

为什么要有这些？
- 上传/编辑帖子时，前端可能既有旧图也有新图；删除旧图要落到磁盘删除，避免脏文件堆积。
- 安全地做文件删除，避免用户构造“跳出目录”的路径删除了不该删的东西。

---

## D. 第 3 章：中间件配置（第 121-170 行）
核心片段：
```js
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map(s=>s.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/default-images', express.static(defaultImagesRoot));
```
说明：
- CORS：浏览器安全策略的跨域白名单。若 `.env` 没配白名单，则开发阶段默认放行（方便调试）。
- `bodyParser`：把请求体解析成对象，便于拿到 `req.body`。
- `express.static`：把某个目录暴露成“静态资源目录”（图片可被浏览器直接访问）。

---

## E. 第 4 章：数据库连接池与初始化
- 连接池 `mysql.createPool({...})`：设定连接信息与连接池参数，统一时区为 `+08:00`。
- `initializeDatabase()`：
  - 创建/修复多个表：`messages`、`listing_images`、`user_profiles`、`user_follows`、`user_favorites` 等。
  - 为 `listings` 表补充“跑腿”相关字段与索引（`errand_*` 系列、`idx_errand_runner`）。
  - 回填历史数据（把 `listings.image_url` 同步到 `listing_images`）。
- 为什么放在应用启动里：保证“没有迁移也不至于启动就报表不存在”的错，幂等式执行，不破坏已有数据。

> 提示：SQL 片段请在源码中查看（关键词：`CREATE TABLE IF NOT EXISTS`）。

---

## F. 第 5 章：文件上传（Multer）
- 配置磁盘存储（文件名格式：`image-<timestamp>-<rand>.<ext>`）。
- 三个中间件：
  - `uploadListingImages`：字段 `images`，最多 10 张图片。
  - `uploadAvatar`：字段 `avatar`，单文件上传。
  - `uploadErrandProof`：字段 `evidence`，用于跑腿完成证明。
- 使用位置：发布/编辑帖子、上传头像、提交跑腿证明。

---

## G. 第 6 章：鉴权（JWT）
- `authenticateToken`：从请求头 `Authorization: Bearer <token>` 里解析并校验 JWT，失败就返回 401。
- `tryDecodeToken`：有些接口不是强制登录，但如果带了 Token 也可以解析出来用。

---

## H. 第 7 章：账户与邮箱验证码（Nodemailer）
- `isValidStudentId`：校验学号格式（首字母 + 年份 + 流水号范围）。
- `buildEduEmailFromStudentId`：学号衍生校邮 `xxx@hust.edu.cn`。
- `createMailTransporter`：根据 `.env` 构造邮件发送器，端口/SSL/账号/授权码等。
- `sendVerificationEmail(to, code)`：实际发验证码，如果未启用 SMTP 则退化为控制台输出（开发模式）。

---

## I. 第 8 章：业务路由
> 下列均为“REST 风格”接口，前端通过 Axios 请求，后端返回 JSON。

- 认证（Auth）
  - POST `/api/auth/register`（兼容 `/api/register`）：注册
  - POST `/api/auth/login`：登录 → 返回 `{ accessToken, user }`
  - POST `/api/auth/request-email-code`：申请邮箱验证码
  - POST `/api/auth/verify-email-code`：校验验证码并注册

- 用户（User/Profile/Follow/Favorite）
  - GET `/api/users/me`、GET `/api/users/:id/profile`、PUT `/api/users/me`
  - POST `/api/users/me/avatar`（上传头像）
  - 关注/取关/粉丝/关注列表/搜索
  - 收藏：GET `/api/users/me/favorites`、POST `/api/listings/:id/favorite`、DELETE `/api/listings/:id/favorite`

- 帖子/任务（Listings）
  - GET `/api/listings`、POST `/api/listings`、PUT `/api/listings/:id`、DELETE `/api/listings/:id`
  - GET `/api/listings/:id/detail`

- 跑腿（Errands，`listings.type='errand'`）
  - POST `/api/errands/:id/accept`（接单）
  - POST `/api/errands/:id/proof`（提交完成证明，含图片）
  - POST `/api/errands/:id/confirm`（发布者确认完成）

- 订单（Orders）
  - POST `/api/orders`（创建）
  - GET `/api/orders?role=buyer|seller|runner`（按角色查询）
  - PUT `/api/orders/:id/status`（状态流转）

- 消息与回复（Messages & Replies）
  - GET `/api/messages/conversations`（会话摘要）
  - GET `/api/messages/conversations/:otherUserId/messages`（历史消息）
  - POST `/api/messages/conversations/:otherUserId/read`（标记已读）
  - GET `/api/listings/:id/replies` / POST `/api/listings/:id/replies` / PUT `/api/replies/:id` / DELETE `/api/replies/:id`

每组路由内部通常具备：
- 参数校验（是否为正整数、是否有权限）。
- 业务校验（状态是否允许变更）。
- SQL 查询/更新（使用 `await pool.execute(sql, params)`）。
- 错误处理（try/catch → 返回 4xx/5xx 与 message）。

---

## J. 第 9 章：WebSocket 聊天服务
- 端点：`/ws`，连接 URL 需要带上 `?token=<JWT>`。
- 握手：服务端解析并校验 JWT，不合法直接关闭连接（4001）。
- 事件：
  - `message`：收发消息（存库后广播给双方）。
  - `conversation:update`：会话摘要（未读数、最后一条消息）更新。
- 断开与错误：从在线映射表里移除该用户的 socket，避免资源泄露。

---

## K. 第 10 章：托管前端与启动服务
- 可选：`SERVE_FRONTEND=true` 时托管 `../frontend/dist` 为静态前端。
- 启动：`server.listen(port, '0.0.0.0', ...)`；控制台打印 HTTP 与 WS 端点地址。

---

## FAQ：为什么不是“每一行都加注释”？
- 真正逐行给 2700+ 行都写注释，会让代码非常臃肿、难以维护。
- 我们采用“片段+逐行+小结”的教学方式，并为每个大模块做了用途说明；配合源码内已有的函数注释，足以让没有 JS/Node 基础的同学快速看懂并定位逻辑。
- 如果你确实需要某个函数/路由的逐行版，请告诉我函数名或行号范围，我能继续按同样风格补全细化。

---

祝阅读顺利，建议边看边在 Postman/Thunder Client 中调用接口，效果更直观。