# backend 说明

本目录为后端服务（Node.js + Express + MySQL）。核心文件为 `server.js`，集成了表结构初始化、鉴权、文件上传、业务路由、WebSocket 私信、以及（可选）静态前端托管。

## 技术栈与主要依赖

- 运行时：Node.js
- Web 框架：Express
- 数据库：MySQL（`mysql2/promise`）
- 身份与加密：JWT（`jsonwebtoken`）、`bcrypt`
- 上传：`multer`（磁盘存储到 `uploads/`）
- 邮件：`nodemailer`（邮箱验证码）
- WebSocket：`ws`

## server.js 结构概览

1) 常量与工具
- 头像与上传路径处理：`withAvatarFallback`、`resolveUploadAbsolutePath`、`buildImageUrl`、`isLocalUploadUrl`、`deletePhysicalFiles`、`parseKeepImageIds`
- 位置字段规范化：`normalizeFormLocation`、`normalizeDbLocation`、`presentLocation`
- 类型判断：`isErrandListingRecord`

2) 数据库初始化
- `initializeDatabase()`：
  - 创建核心表：`users`、`listings`、`listing_images`、`messages`、`user_profiles`、`user_follows`、`user_favorites` 等。
  - 对 `listings` 增加跑腿相关列：`errand_paid`、`errand_paid_at`、`errand_runner_id`、`errand_accept_at`、`errand_completion_image_url`、`errand_completion_note`、`errand_private_note`、`errand_completion_at`、`errand_payment_released_at` 及索引 `idx_errand_runner`。

3) 中间件与上传
- CORS、JSON 解析、静态目录 `/uploads`。
- Multer 存储配置（文件名：`image-<timestamp>-<rand>.<ext>`）。
- 上传中间件：
  - `uploadListingImages`（fields：`images` 最多 10）
  - `uploadAvatar`（single：`avatar`）
  - `uploadErrandProof`（single：`evidence`）

4) 鉴权
- `authenticateToken(req,res,next)`：从 `Authorization: Bearer` 解析 JWT。
- `tryDecodeToken(req)`：在部分场景解析但不强制。

5) 邮箱验证码注册
- `isValidStudentId`、`buildEduEmailFromStudentId`、`createMailTransporter`、`sendVerificationEmail`
- 相关路由见“认证模块”。

6) WebSocket 私信
- 帮助函数：`sendJson`、`broadcastToUser`、`registerSocket`、`unregisterSocket`、`buildConversationSnapshot`
- 端点：`/ws?token=<JWT>`，在连接时校验 JWT，收发 `message` 与 `conversation:update`。

7) 可选前端托管与启动
- `SERVE_FRONTEND=true` 时托管 `FRONTEND_DIST_PATH`（默认 `../frontend/dist`）。
- 服务器监听：`http://0.0.0.0:<PORT>`，并输出 WebSocket 端点。

## 路由一览（按模块）

### 认证（Auth）
- POST `/api/auth/register` → 传统注册（兼容路径 `/api/register`）
- POST `/api/auth/login` → 登录，返回 `accessToken` 与 `user`
- POST `/api/auth/request-email-code` → 申请邮箱验证码（学号→`@hust.edu.cn`），含频率限制与过期
- POST `/api/auth/verify-email-code` → 校验验证码并注册，返回 `accessToken` 与 `user`

### 用户（User/Profile/Follow/Favorite）
- GET `/api/users/me` → 获取自身概要、统计（关注/粉丝/收藏数等）
- GET `/api/users/:id/profile` → 获取指定用户的公开资料
- PUT `/api/users/me` → 更新本人资料
- POST `/api/users/me/avatar` → 上传头像（Multer：`avatar`）
- POST `/api/users/:id/follow` → 关注用户
- DELETE `/api/users/:id/follow` → 取关用户
- GET `/api/users/:id/followers` → 获取粉丝列表
- GET `/api/users/:id/following` → 获取关注列表
- GET `/api/users/search` → 搜索用户
- GET `/api/users/me/favorites` → 我的收藏列表
- POST `/api/listings/:id/favorite` → 收藏帖子
- DELETE `/api/listings/:id/favorite` → 取消收藏

### 帖子/任务（Listings）
- GET `/api/listings` → 列表查询（类型、分类、关键字、状态、用户、分页等）
- POST `/api/listings` → 新建（Multer：`images` 最多 10）
- PUT `/api/listings/:id` → 编辑（可增量上传图片）
- DELETE `/api/listings/:id` → 删除
- GET `/api/listings/:id/detail` → 详情（含图片/作者/扩展字段）

### 跑腿（Errands，基于 listings.type='errand'）
- POST `/api/errands/:id/accept` → 接单（写入 `errand_runner_id`、`errand_accept_at`）
- POST `/api/errands/:id/proof` → 跑腿完成证明上传（Multer：`evidence`，写入 `errand_completion_image_url/Note`）
- POST `/api/errands/:id/confirm` → 发布者确认完成（写入 `errand_completion_at/errand_payment_released_at`）

### 订单（Orders）
- POST `/api/orders` → 创建订单
- GET `/api/orders?role=buyer|seller|runner` → 查询我的订单（按角色）
- PUT `/api/orders/:id/status` → 订单状态流转（含校验与权限）

### 消息（Messages & Replies）
- GET `/api/messages/conversations` → 会话摘要列表（含最后消息与未读数）
- GET `/api/messages/conversations/:otherUserId/messages` → 拉取两人的历史消息
- POST `/api/messages/conversations/:otherUserId/read` → 标记与某人的消息为已读
- GET `/api/listings/:id/replies` → 帖子回复列表
- POST `/api/listings/:id/replies` → 新增回复
- PUT `/api/replies/:id` → 编辑回复
- DELETE `/api/replies/:id` → 删除回复

## 关键辅助函数与作用

- `sanitizeNullableString(value,maxLength)`：对可选字符串裁剪/清洗，防止注入与超长
- 位置字段：`normalizeFormLocation`（表单→DB）、`normalizeDbLocation`（DB→存储）、`presentLocation`（DB→响应）
- 邮箱注册：`isValidStudentId`（学号校验）、`buildEduEmailFromStudentId`（拼校邮）、`createMailTransporter`（构造 nodemailer transporter）
- 鉴权：`authenticateToken`（中间件）、`tryDecodeToken`（非强制解析）
- 上传工具：`gatherUploadedImages`、`buildImageUrl`、`deletePhysicalFiles`（删除废弃物理文件）
- WebSocket：`sendJson`、`broadcastToUser`、`registerSocket`、`unregisterSocket`、`buildConversationSnapshot`（生成会话摘要）

## 错误处理与日志

- 路由层 try/catch：失败返回 `4xx/5xx` 与错误消息。
- 邮箱验证码路由在失败时会输出 `request-email-code error:` 日志，有助定位 SMTP 问题（鉴权失败/端口不可达）。
- WebSocket 消息发送与连接建立处均包含错误日志。

## 环境变量（节选）

```env
PORT=3000
DB_HOST=127.0.0.1
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=yuyuan_yizhan
JWT_SECRET=replace_with_a_strong_secret
CORS_ORIGINS=http://localhost:5173
SERVE_FRONTEND=false
FRONTEND_DIST_PATH=../frontend/dist

# SMTP（邮箱验证码注册，可选）
SMTP_ENABLED=true
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_app_password
SMTP_FROM=Your Name <your_smtp_user@example.com>
```

## 部署与反向代理要点

- 静态上传目录 `backend/uploads/` 需持久化（挂载磁盘/对象存储）。
- 反代：
  - `/api` → Node 端口
  - `/uploads` → 静态目录
  - `/ws` → WebSocket（需透传 `Upgrade/Connection`，调整超时）
- 云服务器发信：放行 465/587 端口；使用真实 SMTP 域名与“授权码”（如 QQ/网易）。

---

如需更详细的接口参数与响应结构，可在本文件基础上补充 API 字段说明或生成 OpenAPI 文档。