# src 目录说明

本文件说明 frontend/src 下各子目录/文件的职责，以及前端架构设计与数据流约定，方便快速上手与维护。

## 架构一览

- 运行时框架：React + Vite + Tailwind CSS
- 视图组织：不使用 React Router，采用本地状态在 `App.jsx` 中切换视图（头部导航 + 底部 Tab）
- 状态管理：
  - `AuthContext` 提供登录/注册/登出、令牌与用户信息（localStorage 持久化）
  - `ConfirmContext`、`ToastContext` 提供全局确认弹窗与轻提示能力
- API 访问：`api/index.js` 封装 Axios，动态 API 基址、自动附加 JWT、资源 URL 解析
- 实时通信：消息模块采用 WebSocket（后端路径 `/ws`），在消息页建立连接、收发与会话更新
- 样式：Tailwind 原子类 + `@tailwindcss/line-clamp`，`index.css` 作为全局入口

## 目录结构与职责

```
src/
├─ api/
│  └─ index.js            # Axios 实例与工具：API 基址、拦截器、resolveAssetUrl()
│
├─ assets/                # 前端静态资源（例如图标、占位图）
│
├─ components/            # 可复用 UI 组件（与页面解耦）
│  ├─ ConfirmDialog.jsx   # 通用确认弹窗（配合 ConfirmContext 使用）
│  ├─ ListingCard.jsx     # 列表卡片（首页/搜索结果）
│  ├─ MyListingCard.jsx   # 我的发布项卡片（编辑/查看/确认等操作）
│  ├─ OrderCard.jsx       # 订单卡片（买家/卖家/跑腿视图）
│  ├─ PostModal.jsx       # 发布/编辑弹窗（支持图片上传、不同模块主题）
│  └─ ToastContainer.jsx  # 全局轻提示挂载容器（配合 ToastContext 使用）
│
├─ constants/             # 常量与主题配置
│  ├─ defaultImages.js    # 按类别提供默认图片与兜底占位（FALLBACK）
│  └─ moduleThemes.js     # 发布/编辑界面主题配置（出售/收购/帮帮忙/失物/跑腿）
│
├─ context/               # 全局上下文（状态/操作）
│  ├─ AuthContext.jsx     # 认证：登录/注册/邮箱验证码注册、JWT、用户信息
│  ├─ ConfirmContext.jsx  # 确认弹窗：展示/关闭、回调处理
│  └─ ToastContext.jsx    # 轻提示：成功/警告/错误等全局消息
│
├─ pages/                 # 页面组件（聚合业务逻辑与视图，调用 components）
│  ├─ HomePage.jsx        # 首页信息流与搜索入口
│  ├─ LoginPage.jsx       # 登录页
│  ├─ RegisterPage.jsx    # 注册页：对接邮箱验证码流程
│  ├─ MyListingsPage.jsx  # 我的发布：发布/编辑/详情/确认完成（跑腿）
│  ├─ MyOrdersPage.jsx    # 我的订单：买家/卖家/跑腿视图
│  ├─ MyMessagesPage.jsx  # 私信消息：建立 WebSocket、收发与会话摘要
│  └─ UserCenterPage.jsx  # 个人中心：资料、统计与入口聚合
│
├─ App.css                # 局部样式（可按需使用）
├─ App.jsx                # 应用根组件：导航与视图切换、全局 Provider（Auth/Toast/Confirm）
├─ index.css              # Tailwind 样式入口（@tailwind base/components/utilities）
└─ main.jsx               # 入口文件：挂载 React、启用 StrictMode
```

## 关键模块设计

### 1) API 层（`api/index.js`）
- 基址策略：优先 `VITE_API_BASE_URL`，开发态回退到 `window.location` + `VITE_DEV_API_PORT`
- 请求拦截：自动附加 `Authorization: Bearer <token>`（从 localStorage 读取）
- `resolveAssetUrl(path)`：把后端返回的相对路径（如 `/uploads/...`）转换为可访问的绝对地址

### 2) 认证与会话（`context/AuthContext.jsx`）
- 对外暴露：`login`、`register`、`logout`、`requestEmailCode`、`verifyEmailRegister`
- 成功登录/注册后写入 `localStorage(accessToken, user)` 并更新 `user`
- 应用启动时从本地恢复用户信息

### 3) 导航与视图（`App.jsx`）
- 顶部导航（桌面） + 底部 Tab（移动），使用本地 `activeNav` 切换 `home/myOrders/myListings/messages/userCenter`
- 在根部挂载 `AuthProvider`、`ToastProvider`、`ConfirmProvider` 作为全局能力
- 通过 `PostModal` 实现发布/编辑的弹窗流程

### 4) 主题与默认图（`constants/`）
- `moduleThemes.js`：定义“出售/收购/帮帮忙/失物招领/跑腿”模块主题
- `defaultImages.js`：提供默认图片与兜底占位，用于列表/详情缺图时的体验保证

## 开发/构建

- 开发：`npm ci && npm run dev`（由 Vite 本地服务；代理 `/api` 到后端，见根目录 `vite.config.js`）
- 构建：`npm run build`（产物输出 `dist/`，可由 Nginx 等静态服务器托管）
- 预览：`npm run preview`

## 代码与样式约定

- 使用 ESLint 与 React Hooks 规则；尽量将可复用 UI 拆分至 `components/`
- 页面负责业务与数据拉取，组件负责展示与交互；上下文只放与全局相关的状态与操作
- Tailwind 原子类优先；复用样式可抽离为组件或使用 `@apply`（谨慎）
- 资源访问统一通过 `resolveAssetUrl()`，避免相对路径在不同部署环境下失效

## 扩展建议

- 若路由与参数变复杂，可引入 React Router；或以 Zustand/Redux 管理跨页面业务状态
- 将 WebSocket 封装为自定义 Hook（自动重连、心跳、前后台切换）
- 为核心组件补充 Storybook 与单元测试，完善可视化与回归
