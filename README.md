# 喻园易站（YuYuanYiZhan）

一个面向校园场景的综合服务平台，提供发布/浏览二手/求购信息、下单交易、订单状态流转、留言回复等基础能力。前后端分离：后端基于 Node.js + Express + MySQL，前端基于 React + Vite + Tailwind CSS，通信使用 REST API 与 JWT 认证。

## 功能概览

- 用户注册、登录、JWT 鉴权
- 帖子（商品/求购）发布、更新、删除、图片上传
- 列表查询（按类型、分类、关键字、状态、用户）
- 订单创建与全流程状态流转（待支付 → 待发货 → 待收货 → 已完成/已取消）
- 留言/回复功能

## 仓库结构

```
backend/         # Node.js/Express API 服务
frontend/        # React + Vite 前端应用
```

关键文件：

- `backend/server.js`：后端入口与所有路由实现
- `backend/package.json`：后端依赖与脚本
- `frontend/src/api/index.js`：Axios 实例，自动附加 JWT 到请求头
- `frontend/package.json`：前端依赖与脚本

## 技术栈

- 后端：Node.js, Express, MySQL (mysql2/promise), Multer（图片上传）, JSON Web Token, Bcrypt
- 前端：React 19, Vite 7, Axios, Tailwind CSS

## 环境要求

- Node.js 18+（建议 LTS）
- npm 9+ 或 pnpm/yarn（示例使用 npm）
- MySQL 8.x（或兼容版本）
- 操作系统：Windows/macOS/Linux 均可

## 新开发者环境准备与安装指南

以下步骤面向首次参与本项目的同学，帮助快速搭建可运行的前后端开发环境。

### 1) 安装 Node.js（建议 LTS）

- 方式 A（推荐）：到 Node.js 官网下载安装包（选择 LTS 版本）。
  - 官网： [Node.js 官方下载](https://nodejs.org/)
- 方式 B（可选）：使用 nvm 进行多版本管理。
  - Windows： [nvm-windows](https://github.com/coreybutler/nvm-windows)
  - macOS/Linux： [nvm](https://github.com/nvm-sh/nvm)

安装完成后，打开终端验证：

```bash
node -v
npm -v
```

如需将 npm 默认源切换到更快的镜像（可选）：

```bash
npm config set registry https://registry.npmmirror.com
```

### 2) 安装 Git（用于克隆代码）

- 下载地址： [Git 官方下载](https://git-scm.com/downloads)
- 验证安装：

```bash
git --version
```

### 3) 安装 MySQL（本地开发数据库）

- 建议安装 MySQL 8.x，并记住账号与密码，稍后用于配置 `backend/.env`。
- Windows 可使用 MySQL Installer；macOS 可使用 Homebrew：

```bash
# macOS 示例
brew install mysql
brew services start mysql
```

安装后，确认 MySQL 服务已启动，并能通过客户端连接（如 `mysql` 命令行或图形工具）。

### 4) Tailwind CSS（本项目已预配置）

本仓库的前端（`frontend/`）已集成 Tailwind CSS 与 PostCSS，通常不需要额外安装。你只需：

1. 在 `frontend/` 执行依赖安装：

   ```bash
   cd frontend
   npm install
   ```

2. 启动开发服务器（见“安装与启动（开发）”章节）。如页面样式能正确应用 Tailwind 类（如 `bg-gray-100`, `text-primary` 等），即表示生效。

若你需要自行验证配置，可查看：

- `frontend/tailwind.config.js` 是否存在并包含 `content` 指向 `src/**/*.{js,jsx}` 等。
- `frontend/postcss.config.js` 是否包含 `tailwindcss` 与 `autoprefixer`。
- `frontend/src/index.css` 是否包含 `@tailwind base; @tailwind components; @tailwind utilities;`。

如需在别的项目中从零添加 Tailwind，可参考官方指引： [Tailwind CSS with Vite](https://tailwindcss.com/docs/guides/vite)

### 5) 常见安装问题（简要）

- npm 安装缓慢：切换镜像或使用 `pnpm`/`yarn`。
- Windows 构建本机模块失败（`node-gyp` 相关）：安装 [Windows 构建工具](https://github.com/nodejs/node-gyp#on-windows) 或使用更高版本的依赖；通常本项目不需要本机扩展，但若遇到请按指引安装。
- 端口占用：修改 `.env` 中 `PORT`，或关闭占用端口的进程。

## 数据库初始化

请在 MySQL 中创建数据库与表。以下是一个最小可用示例（可按需扩展字段）：

```sql
CREATE DATABASE IF NOT EXISTS yuyuan_yizhan DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE yuyuan_yizhan;

-- 用户表（用户名唯一）
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 帖子/商品表
CREATE TABLE IF NOT EXISTS listings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  category VARCHAR(100),
  type ENUM('sell','buy') NOT NULL, -- sell: 出售；buy: 求购
  status ENUM('available','in_progress','completed') DEFAULT 'available',
  user_id INT NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  listing_id INT NOT NULL,
  buyer_id INT NOT NULL,
  seller_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  status ENUM('to_pay','to_ship','to_receive','completed','cancelled') NOT NULL DEFAULT 'to_pay',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (buyer_id) REFERENCES users(id),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

-- 回复表
CREATE TABLE IF NOT EXISTS replies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  listing_id INT NOT NULL,
  user_id INT NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 环境变量

在 `backend/` 目录下创建 `.env` 文件：

```env
PORT=3000
DB_HOST=127.0.0.1
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=yuyuan_yizhan
JWT_SECRET=replace_with_a_strong_secret
```

说明：

- 后端会在 `PORT` 端口启动，并暴露静态目录 `backend/uploads/` 用于访问上传图片。
- 前端默认把 API 指向 `http://localhost:3000`（见 `frontend/src/api/index.js`）。如需修改，直接改该文件或引入前端环境变量机制（见“可选：前端环境变量”）。

## 安装与启动（开发）

在仓库根目录打开终端，分别安装前后端依赖并启动：

```bash
# 1) 后端
cd backend
npm install
npm run dev  # 或 npm start

# 2) 前端（新开一个终端）
cd ../frontend
npm install
npm run dev
```

默认：

- 后端运行于 `http://localhost:3000`
- 前端开发服务器运行于 `http://localhost:5173`

首次运行前，确保：

- MySQL 服务已启动，数据库与表已创建
- `backend/.env` 已正确填写

## 上传与静态资源

- 图片上传通过 Multer 存储在 `backend/uploads/`，服务以 `/uploads` 路径静态暴露（示例：`http://localhost:3000/uploads/xxx.jpg`）。
- 更新帖子时，如上传新图，会尝试删除旧图（见 `server.js` 中的更新逻辑）。

## 主要 API（节选）

基础 URL：`http://localhost:3000`

- 认证
  - POST `/api/auth/register`：注册（`username`, `password`）
  - POST `/api/auth/login`：登录，返回 `accessToken`

- 帖子
  - GET `/api/listings`：查询（支持 `type`, `userId`, `status`, `searchTerm`, `category`）
  - POST `/api/listings`：创建（需 JWT，支持 `multipart/form-data` 图片）
  - PUT `/api/listings/:id`：更新（需 JWT，支持图片替换）
  - DELETE `/api/listings/:id`：删除（需 JWT）

- 订单（需 JWT）
  - POST `/api/orders`：创建订单
  - GET `/api/orders?role=buyer|seller&status=...`：我的订单
  - PUT `/api/orders/:id/status`：变更状态（买家/卖家在特定阶段可操作）

- 回复
  - GET `/api/listings/:id/replies`：获取回复
  - POST `/api/listings/:id/replies`：新增回复（需 JWT）

## 账号与认证

- 登录成功后，后端返回 `accessToken`。前端 `axios` 拦截器会自动从 `localStorage.accessToken` 读取并附加到 `Authorization: Bearer <token>`。
- `JWT_SECRET` 请使用高强度随机字符串，并定期轮换。

## 可选：前端环境变量与跨域

- 若需在不同环境指向不同后端，可将 `frontend/src/api/index.js` 改为读取 Vite 环境变量：

```js
// frontend/src/api/index.js（示例）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
```

并在 `frontend/` 下创建 `.env.development` / `.env.production`：

```env
VITE_API_BASE_URL=http://localhost:3000
```

- 跨域：后端已启用 `cors()`，如需限制来源，可在生产环境按需配置白名单。

## 构建与部署

### 后端部署

1. 准备运行环境（Node.js 18+，MySQL 8+）。
2. 设置 `.env`（同开发环境）。
3. 安装依赖并启动进程：

```bash
cd backend
npm ci
node server.js  # 建议使用 PM2 等进程守护
```

4. 配置反向代理（Nginx/Apache）将 `/api` 与 `/uploads` 转发到后端服务。
5. 将 `backend/uploads/` 设定合理的持久化存储与备份策略。

### 前端部署

```bash
cd frontend
npm ci
npm run build
```

构建产物位于 `frontend/dist/`，可直接部署到任意静态资源服务器（Nginx、Vercel、Netlify 等）。如需与后端同域部署，可将前端静态资源由 Nginx 提供，API 走反向代理到后端。

## 进一步开发指引

- 代码位置
  - 页面：`frontend/src/pages/*`
  - 组件：`frontend/src/components/*`
  - 上下文/状态：`frontend/src/context/*`
  - API：`frontend/src/api/index.js`
  - 后端路由：`backend/server.js`

- 建议规范
  - 严格区分“买家/卖家”视角下可操作的订单动作，后端已有权限校验
  - 上传文件大小/类型限制已在 Multer 配置，可按需扩展
  - 数据库字段建议增加更多索引（如 `listings(type,status,category,created_at)`）
  - 在生产环境使用更严格的 CORS 与安全头部（Helmet 等）
  - 为关键路径增加单元/集成测试

## 常见问题（FAQ）

- 登录 401/403：确认数据库中用户存在、密码正确，`JWT_SECRET` 与前端 token 存取一致。
- 图片无法访问：检查后端是否挂载静态目录 `/uploads`，或图片路径是否以 `/uploads/` 开头。
- 跨域问题：在生产环境需将前端域加入后端 CORS 白名单，或经由同域反向代理。

---

欢迎贡献代码与反馈问题！


