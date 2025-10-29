# api 目录说明

封装前端与后端 API 的调用逻辑，统一处理基址、鉴权、资源地址解析等。当前仅一个文件：`index.js`。

## index.js

- Axios 实例创建：`baseURL` 由 `VITE_API_BASE_URL` 或当前窗口地址推断（开发态可用 `VITE_DEV_API_PORT`）。
- 请求拦截器：自动从 `localStorage` 读取 `accessToken` 并设置 `Authorization: Bearer <token>`。
- 工具导出：
  - `API_BASE_URL`：最终使用的基址字符串。
  - `resolveAssetUrl(path)`：把后端返回的相对资源路径（如 `/uploads/...`）转换为可访问的绝对 URL（考虑反向代理与不同环境）。
  - `api`（默认导出）：配置好的 Axios 实例。

## 与后端交互

- 鉴权：所有需要认证的接口都会自动带上 `Authorization` 头，后端用 JWT 校验。
- 常见接口族：
  - 认证：`/api/auth/login`、`/api/auth/register`、`/api/auth/request-email-code`、`/api/auth/verify-email-code`
  - 列表：`/api/listings`（GET/POST/PUT/DELETE）、`/api/listings/:id/detail`、收藏相关接口
  - 跑腿：`/api/errands/:id/accept`、`/api/errands/:id/proof`、`/api/errands/:id/confirm`
  - 订单：`/api/orders`（GET/POST）与 `/api/orders/:id/status`（PUT）
  - 消息：`/api/messages/conversations`、`/api/messages/conversations/:otherUserId/messages`、`/api/messages/conversations/:otherUserId/read`
  - 用户：`/api/users/me`、`/api/users/:id/profile`、关注/取关与头像上传等

> 建议所有页面/组件通过该实例发起请求，避免重复拼接 URL 与漏加 Token。
