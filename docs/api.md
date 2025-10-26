# 喻园易站 后端 API 参考 (v4.1)

本文件汇总 backend/server.js 中实现的接口与约定，便于前后端协作与测试。

- 基础地址：`http://<host>:<port>`，默认 `http://localhost:3000`
- WebSocket：`ws://<host>:<port>/ws?token=<JWT>`
- 所有受保护接口需在请求头携带：`Authorization: Bearer <JWT>`
- 静态资源：
  - 上传文件：`/uploads/**`
  - 默认图片：`/default-images/**`
- 上传限制：图片 MIME 类型，单文件最大 5MB
- 数据库时区：`+08:00`

## 认证与用户

### 申请邮箱验证码（新增）
- POST `/api/auth/request-email-code`
- Body(JSON)：`{ studentId }`
  - 学号格式：`U/M/I/Dyyyyxxxxx`（`xxxxx` 在 `10001-99999`，如 `U202312345`）
  - 邮箱将被构造为：`<studentId>@hust.edu.cn`，其中首字母会被规范为小写（例如 `U202312345` -> `u202312345@hust.edu.cn`）
- 频控：60 秒内不可重复申请；验证码 10 分钟有效
- 200 -> `{ message }`

### 校验验证码并注册（新增）
- POST `/api/auth/verify-email-code`
- Body(JSON)：`{ studentId, code, username, password }`
  - `password` ≥ 6 位；`username` 未提供时默认使用学号小写
  - 学号与邮箱校验通过后，创建用户并绑定到 `user_profiles.student_id`
- 201 -> `{ accessToken, user }`

### 注册
- POST `/api/auth/register` 或 `/api/register`
- Body(JSON)：`{ username, password }`（password ≥ 6）
- 201 -> `{ userId }`；409 重名；400 参数错误
 - 说明：该方式仅供开发/调试使用，不进行学号/邮箱绑定；该用户的 `student_id` 将保持为空且不可修改。

### 登录
- POST `/api/auth/login`
- Body(JSON)：`{ username, password }`
- 200 -> `{ accessToken, user: { id, username } }`

### 获取当前用户资料
- GET `/api/users/me`（需登录）
- 200 -> 用户资料快照：
  - `profile.avatarUrl` 有默认头像兜底
  - `stats`：following/followers/listings/favorites
  - `relationship.isSelf` 恒为 true

### 查看任意用户资料
- GET `/api/users/:id/profile`（需登录）
- 200 -> 与 `me` 相同结构，含与当前用户的关系标记

### 更新我的资料
- PUT `/api/users/me`（需登录）
- Body(JSON)：`{ displayName, contactPhone, avatarUrl, bio }`
  - 注意：`student_id` 为注册时一次性绑定字段（邮箱验证码注册时写入；普通注册为空），注册后不可修改；若提交包含该字段将返回 400。
  - `avatarUrl` 仅在“明确提供”时覆盖，未提供则保持不变
- 200 -> 更新后的资料快照

### 上传头像
- POST `/api/users/me/avatar`（需登录）
- FormData：`avatar: <file>`
- 200 -> `{ avatarUrl, profile }`
  - 若旧头像是本地上传（以 `/uploads/` 开头）则会被删除

### 关注/取关
- POST `/api/users/:id/follow`（需登录） -> 关注
- DELETE `/api/users/:id/follow`（需登录） -> 取关

### 粉丝/关注列表
- GET `/api/users/:id/followers`（需登录） -> `{ followers: [...] }`
- GET `/api/users/:id/following`（需登录） -> `{ following: [...] }`

### 用户搜索
- GET `/api/users/search?q=keyword`（需登录）
- 200 -> `{ results: [...] }`，支持用户名/昵称/学号模糊匹配

### 我的收藏列表
- GET `/api/users/me/favorites`（需登录） -> `{ favorites: [...] }`

### 收藏/取消收藏帖子
- POST `/api/listings/:id/favorite`（需登录）
- DELETE `/api/listings/:id/favorite`（需登录）

## 帖子/商品（Listings）

### 列表查询（公开）
- GET `/api/listings`
- Query：`type, userId, status, searchTerm, category`
- 200 -> `[ { ... , images_count } ]`

### 新建帖子（需登录）
- POST `/api/listings`
- FormData：
  - 文本：`title, description, price, category, type, start_location, end_location`
  - 文件：`images[]`（最多10张），`image`（可选单图封面）
- 处理规则：
  - 若上传多图，则自动将第一张作为封面，同时写入 `listing_images(sort_order)`
- 201 -> `{ listingId }`

### 更新帖子（需登录，作者）
- PUT `/api/listings/:id`
- FormData：
  - 文本：`title, description, price, category, existingImageUrl, start_location, end_location`
  - 文本：`keepImageIds`（JSON 数组，保留的图集 ID；未提供则默认为保留全部已有图片）
  - 文件：`images[]` 或 `image`（新增图片）
- 处理规则：
  - 先删除未保留的图片记录（并在事务提交后清理物理文件）
  - 新增图片按递增 `sort_order` 追加，封面取图集第一张；若图集为空回退 `existingImageUrl`
- 200 -> `{ message: 'Listing updated successfully.' }`

### 删除帖子（需登录，作者）
- DELETE `/api/listings/:id`
- 处理：删除数据库记录后，会将封面+相册中的本地文件统一清理
- 200 -> `{ message: 'Listing deleted successfully.' }`

### 帖子详情（公开）
- GET `/api/listings/:id/detail`
- 200 -> `{ listing, replies }`
  - `listing.images`: `[{ id, image_url, sort_order }, ...]`

### 回复（公开读取，登录发布）
- GET `/api/listings/:id/replies`
- POST `/api/listings/:id/replies`（需登录） Body(JSON)：`{ content }`

## 订单（Orders）

### 创建订单（买家）
- POST `/api/orders`（需登录） Body(JSON)：`{ listingId }`
- 校验：不可购买自己商品；仅可购买 `available` 状态商品
- 成功：商品状态转 `in_progress`
- 201 -> `{ orderId }`

### 查询我的订单
- GET `/api/orders?role=buyer|seller&status=all|to_pay|to_ship|to_receive|completed|cancelled`（需登录）
- 200 -> 订单数组，含 `listing_*` 与买卖家用户名

### 更新订单状态
- PUT `/api/orders/:id/status`（需登录） Body(JSON)：`{ newStatus }`
- 流转规则：
  - 买家支付：`to_pay` -> `to_ship`
  - 卖家发货：`to_ship` -> `to_receive`
  - 买家收货：`to_receive` -> `completed`（同时商品置 `completed`）
  - 取消订单：早期节点可取消 -> `cancelled`（商品恢复 `available`）

## 私信（Messages）

### 最近会话摘要
- GET `/api/messages/conversations`（需登录）
- 200 -> `[ { otherUserId, otherUsername, lastMessage, lastMessageAt, unreadCount }, ... ]`

### 与某用户的消息列表
- GET `/api/messages/conversations/:otherUserId/messages`（需登录）
- 200 -> `{ otherUser: { id, username }, messages: [...] }`

### 将与某用户的未读设为已读
- POST `/api/messages/conversations/:otherUserId/read`（需登录）

## WebSocket 协议

- 地址：`ws://<host>:<port>/ws?token=<JWT>`（握手时校验 JWT）
- 发送消息：
  ```json
  {
    "type": "message",
    "toUserId": 123,
    "content": "你好",
    "listingId": 456
  }
  ```
- 服务端推送：
  - 新消息：`{ type: 'message', data: { id, senderId, senderUsername, receiverId, receiverUsername, content, createdAt, listingId } }`
  - 会话摘要更新：`{ type: 'conversation:update', data: { otherUserId, otherUsername, lastMessage, lastMessageAt, unreadCount } }`

## 静态资源与上传

- 静态目录：
  - `/uploads`（上传文件）
  - `/default-images`（内置默认图，含默认头像）
- 删除文件：仅对以 `/uploads/` 开头的本地上传文件执行（包含路径安全校验）
- 头像兜底：当 `profile.avatarUrl` 为空时，返回默认头像 `/default-images/default-avatar.jpg`

## 环境变量

- `PORT`：服务端口，默认 `3000`
- `JWT_SECRET`：JWT 签名密钥（必须）
- `DB_HOST, DB_USER, DB_PASSWORD, DB_NAME`：数据库连接
- `CORS_ORIGINS`：允许的跨域来源，逗号分隔；为空表示放行所有
- `SERVE_FRONTEND`：`true` 时托管前端构建产物
- `FRONTEND_DIST_PATH`：前端 dist 路径（可选）；未设置时默认 `../frontend/dist`
 - 邮件发送（可选）：
   - `SMTP_ENABLED`：是否启用，默认 `true`
   - `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`：SMTP 服务器配置
   - `SMTP_USER`、`SMTP_PASS`：认证信息（如需）
   - `SMTP_FROM`：发件人地址（默认 `noreply@hust.edu.cn`）

## 错误与状态码（概览）

- 400 参数错误/非法操作（如自购、非法状态流转、内容为空等）
- 401 未认证（缺少或无效 JWT）
- 403 无权限（如非作者修改/删除）
- 404 资源不存在
- 409 冲突（如注册重名）
- 500 服务器错误（含数据库错误、文件操作失败等）

---

如需生成 OpenAPI/Swagger 文档，我可以基于该文件快速导出 `openapi.yaml` 并加上 Swagger UI 以便浏览与调试。
