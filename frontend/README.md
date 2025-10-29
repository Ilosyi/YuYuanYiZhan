# 前端说明（frontend）

本目录为喻园易站的前端应用，基于 React + Vite + Tailwind CSS 开发，实现登录/注册（含邮箱验证码流程）、首页信息流、我的发布、我的订单、我的消息（WebSocket 私信）等功能。

## 架构设计概览

- 构建与开发
	- 使用 Vite 作为构建与本地开发服务器，开发时代理 `/api` 到后端（见 `vite.config.js`）。
	- 使用 Tailwind CSS 进行样式开发，`@tailwindcss/line-clamp` 用于多行省略（见 `tailwind.config.js`）。
- 组件与页面
	- 页面（`src/pages`）与通用组件（`src/components`）分层，页面聚合业务，组件关注复用 UI。
	- 导航采用“头部导航 + 底部 Tab”的方式，不引入 React Router，而是用本地状态切换视图（`App.jsx`）。
- 状态管理
	- `AuthContext` 负责登录状态与令牌管理（本地存储 `accessToken`、`user`）。
	- 业务操作的确认与提示分别由 `ConfirmContext` 与 `ToastContext`（在 `App.jsx` 中挂载提供）。
- API 接入
	- `src/api/index.js` 封装 Axios：
		- 动态基址（`VITE_API_BASE_URL` 或从当前窗口推断，开发态可用 `VITE_DEV_API_PORT`）。
		- 请求拦截器自动附加 `Authorization: Bearer <token>`。
		- `resolveAssetUrl()` 用于把后端返回的相对路径转换为可访问的绝对地址（图片等）。
- 实时通信
	- 私信使用 WebSocket（后端路径 `/ws`），前端在消息页内建立连接并收发消息；代理/反代需正确透传 Upgrade 头。

## 目录与关键文件

```
frontend/
├─ public/                    # 静态资源（原样拷贝）
├─ src/
│  ├─ api/
│  │  └─ index.js            # Axios 实例与工具（API 基址、拦截器、资源 URL 解析）
│  ├─ assets/                # 前端静态资源（如 react.svg）
│  ├─ components/
│  │  ├─ ListingCard.jsx     # 列表卡片（首页/列表中的展示单元）
│  │  ├─ MyListingCard.jsx   # 我的发布项卡片（带操作）
│  │  ├─ OrderCard.jsx       # 订单卡片（买家/卖家/跑腿视图）
│  │  └─ PostModal.jsx       # 发布/编辑弹窗（上传图片、表单）
│  ├─ context/
│  │  └─ AuthContext.jsx     # 登录/注册/登出、邮箱注册流程、令牌与用户信息
│  ├─ pages/
│  │  ├─ HomePage.jsx        # 首页信息流与搜索/筛选入口
│  │  ├─ LoginPage.jsx       # 登录页
│  │  ├─ RegisterPage.jsx    # 注册页（对接邮箱验证码流程）
│  │  ├─ MyListingsPage.jsx  # 我的发布：发布、编辑、查看详情、确认完成（跑腿）
│  │  ├─ MyOrdersPage.jsx    # 我的订单：买家/卖家/跑腿三类视图
│  │  └─ MyMessagesPage.jsx  # 我的消息：会话与消息收发（WebSocket）
│  ├─ App.css
│  ├─ App.jsx                 # 应用根组件：顶部导航/底部 Tab、视图切换、全局 Provider 挂载
│  ├─ index.css               # Tailwind 入口与全局样式
│  └─ main.jsx                # 入口文件，挂载 React 应用
├─ eslint.config.js
├─ package.json
├─ postcss.config.js
├─ tailwind.config.js
├─ vite.config.js
└─ README.md                  # 本文件
```

> 注：`App.jsx` 内使用 `AuthProvider`，并在外层挂载 `ToastProvider`、`ConfirmProvider`，通过状态切换 `home/myOrders/myListings/messages/userCenter` 等视图，实现移动端友好的底部 Tab 导航与桌面端头部导航。

## 主要页面职责

- HomePage：展示帖子/任务信息流，进入详情或操作入口。
- MyListingsPage：管理当前用户的发布（含跑腿任务的接单状态与确认完成）。
- MyOrdersPage：按角色（买家/卖家/跑腿）查看订单。
- MyMessagesPage：与其他用户会话，实时收发消息，展示会话摘要。
- LoginPage / RegisterPage：登录与注册；注册支持“学号→校邮”验证码流程。

## 运行与构建

- 开发

```bash
npm ci
npm run dev
```

- 构建

```bash
npm run build
# 产物在 dist/，可由 Nginx 等静态服务器托管
```

- 预览（本地静态服务）

```bash
npm run preview
```

## 前端环境变量

在 `frontend/.env` 或 `.env.production`（生产）中可设置：

```env
# 后端 API 基址（优先）。如果不设置，将根据当前窗口地址推断。
VITE_API_BASE_URL=http://localhost:3000

# 开发态使用的后端端口（仅当未设置 VITE_API_BASE_URL 且处于 dev 时生效）
VITE_DEV_API_PORT=3000
```

## 代码风格与 UI 约定

- 使用 ESLint（`eslint.config.js`）与 React Hooks 相关规则。
- UI 采用 Tailwind 原子类，复杂布局可抽出复用组件。
- 图片/文件上传通过后端 `/uploads` 提供静态访问，前端以 `resolveAssetUrl()` 生成可访问地址。

## 扩展建议

- 如页面状态进一步复杂，可引入 React Router 管理路由与参数；或使用 Zustand/Redux 做更细粒度状态管理。
- 将消息 WebSocket 封装为自定义 Hook（自动重连、心跳、前台/后台切换策略）。
- 增加组件 Storybook 与单元测试，提升可维护性与回归效率。
