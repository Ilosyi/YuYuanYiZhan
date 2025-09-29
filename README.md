# 喻园易站（YuYuanYiZhan）

一个面向校园场景的综合服务平台，提供闲置交易、互助问答、失物招领等功能。项目采用前后端分离架构，后端基于 Node.js + Express + MySQL，前端基于 React + Vite + Tailwind CSS，通信使用 REST API 与 JWT 认证。

## 功能概览

- 用户注册、登录、JWT 鉴权
- 帖子（商品/求购）发布、更新、删除、图片上传
- 列表查询（按类型、分类、关键字、状态、用户）
- 订单创建与全流程状态流转（待支付 → 待发货 → 待收货 → 已完成/已取消）
- 留言/回复功能
- 私信聊天功能（支持实时 WebSocket 通信）
- 用户个人中心（我的发布、我的订单、我的消息）
- 支持多图片上传与评论点赞功能

## 仓库结构

```
backend/         # Node.js/Express 后端服务
frontend/        # React + Vite 前端应用
```

### 关键文件

- `backend/server.js`：后端入口与所有路由实现
- `backend/package.json`：后端依赖与脚本
- `frontend/src/api/index.js`：Axios 实例，自动附加 JWT 到请求头
- `frontend/package.json`：前端依赖与脚本
- `frontend/src/pages/`：前端页面组件
- `frontend/src/components/`：前端通用组件

## 技术栈

- **后端**：Node.js, Express, MySQL (mysql2/promise), Multer（图片上传）, JSON Web Token, Bcrypt
- **前端**：React 19, Vite 7, Axios, Tailwind CSS
- **通信**：REST API, WebSocket

## 环境要求

- Node.js 18+（建议 LTS）
- npm 9+ 或 pnpm/yarn（示例使用 npm）
- MySQL 8.x（或兼容版本）
- Tailwind 3.4.17
- 操作系统：Windows/macOS/Linux 均可

## 如何部署与进一步开发

### 部署步骤

#### 后端部署

1. 准备运行环境（Node.js 18+，MySQL 8+）。
2. 设置 `.env` 文件（参考下方“环境变量”）。
3. 安装依赖并启动服务：

```bash
cd backend
npm ci
node server.js  # 建议使用 PM2 等进程守护
```

4. 配置反向代理（如 Nginx/Apache）将 `/api` 与 `/uploads` 转发到后端服务。
5. 确保 `backend/uploads/` 目录持久化存储并定期备份。

#### 前端部署

1. 安装依赖并构建：

```bash
cd frontend
npm ci
npm run build
```

2. 将 `frontend/dist/` 部署到静态资源服务器（如 Nginx、Vercel、Netlify）。
3. 如需与后端同域部署，可通过 Nginx 提供前端静态资源，并反向代理 API 请求。

### 开发指南

1. 克隆仓库并安装依赖：

```bash
git clone <repository-url>
cd YuYuanYiZhan
npm install
```

2. 启动开发环境：

```bash
# 后端
cd backend
npm run dev

# 前端（新开终端）
cd frontend
npm run dev
```

3. 代码位置：
   - 页面：`frontend/src/pages/*`
   - 组件：`frontend/src/components/*`
   - 上下文/状态：`frontend/src/context/*`
   - API：`frontend/src/api/index.js`
   - 后端路由：`backend/server.js`

4. 数据库初始化：
   - 创建数据库与表（参考 `README.md` 中的 SQL 示例）。
   - 确保 `.env` 文件配置正确。

## 环境变量

在 `backend/` 目录下创建 `.env` 文件：

```env
PORT=3000
DB_HOST=127.0.0.1
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=yuyuan_yizhan
JWT_SECRET=replace_with_a_strong_secret
# 允许跨域的来源（可选，逗号分隔）；留空表示允许所有来源（调试方便）
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
# 部署时是否直接由 Node 服务静态前端资源
SERVE_FRONTEND=false
# 当 SERVE_FRONTEND=true 时，指定前端构建目录（相对 backend/ 或绝对路径）
FRONTEND_DIST_PATH=../frontend/dist
```

在 `frontend/` 目录下可以创建 `.env` 或 `.env.production` 设置前端 API 地址：

```env
# 显式指定后端 API 基址（默认自动根据环境推断，可覆盖）
VITE_API_BASE_URL=http://47.122.126.189
# 开发时后端监听端口（未设置时默认为 3000）
VITE_DEV_API_PORT=3000
```

## 未来开发方向

- **好友功能**：支持用户关注与粉丝模块。
- **高级搜索**：支持多条件组合查询与排序。
- **个性化推荐**：支持主页个性化推荐商品
- **多样分类**：支持按价格，距离等对商品排序。
- **通知系统**：为订单状态变更、留言回复等提供实时通知。
- **移动端适配**：优化 UI 以支持移动设备。
- **性能优化**：
  - 前端：按需加载组件与资源。
  - 后端：增加缓存层（如 Redis）。
- **测试覆盖率**：增加单元测试与集成测试，确保代码质量。

---



