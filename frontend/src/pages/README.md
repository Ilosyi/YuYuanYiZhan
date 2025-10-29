# pages 目录说明

页面组件聚合业务逻辑与 UI，调度 `components/` 与 `api/` 进行数据展示与交互。导航由 `App.jsx` 基于本地状态在多个页面间切换（未引入路由）。

## 页面一览与后端交互

- `HomePage.jsx`
  - 作用：展示帖子/任务信息流，提供搜索/筛选入口，跳转到详情或操作。
  - 主要接口：`GET /api/listings`（支持类型/分类/关键字/用户等查询）；收藏相关接口（可选）。
  - 资源：列表图片使用 `resolveAssetUrl()` 构造可访问地址。

- `LoginPage.jsx`
  - 作用：用户登录。
  - 接口：`POST /api/auth/login`，成功返回 `accessToken` 与 `user`。

- `RegisterPage.jsx`
  - 作用：注册，支持邮箱验证码流程（学号 → 邮箱）。
  - 接口：
    - `POST /api/auth/request-email-code` 申请验证码。
    - `POST /api/auth/verify-email-code` 校验验证码并注册；成功后自动登录。

- `MyListingsPage.jsx`
  - 作用：管理我的发布（含跑腿/互助任务）。支持新建、编辑、删除、查看详情、确认完成。
  - 主要接口：
    - `GET /api/listings`（按 `user=me` 查询我的发布）
    - `POST /api/listings` 新建（表单+多图）
    - `PUT /api/listings/:id` 编辑（可带图）
    - `DELETE /api/listings/:id` 删除
    - 跑腿流程：`POST /api/errands/:id/accept` 接单、`POST /api/errands/:id/proof` 上传证明、`POST /api/errands/:id/confirm` 发布者确认完成

- `MyOrdersPage.jsx`
  - 作用：我的订单（买家/卖家/跑腿三类视图）。
  - 接口：
    - `GET /api/orders?role=buyer|seller|runner` 查询订单
    - `PUT /api/orders/:id/status` 状态流转（例如 待支付 → 已完成/已取消 等）

- `MyMessagesPage.jsx`
  - 作用：私信会话与消息收发，展示会话摘要与未读数。
  - WebSocket：`ws(s)://<host>/ws?token=<JWT>` 建立连接，收发消息与会话更新；服务端广播 `message` 与 `conversation:update` 类型事件。
  - REST：
    - `GET /api/messages/conversations` 获取会话列表（含摘要与未读数）
    - `GET /api/messages/conversations/:otherUserId/messages` 拉取历史消息
    - `POST /api/messages/conversations/:otherUserId/read` 标记已读

- `UserCenterPage.jsx`
  - 作用：个人资料与统计，关注/取关入口。
  - 接口：`GET /api/users/me`、`GET /api/users/:id/profile`、`POST/DELETE /api/users/:id/follow`、`POST /api/users/me/avatar` 等。

## 使用建议

- 页面聚合业务：负责数据拉取、状态管理与错误处理；将展示交给 `components/`。
- 统一通过 `api/` 实例发起请求，确保自动带上 JWT 与正确基址。
- 图片与附件统一用 `resolveAssetUrl()` 转换路径，避免环境差异引起的访问问题。
