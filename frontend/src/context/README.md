# context 目录说明

封装全局共享状态与操作：认证、确认弹框、轻提示等。通过 React Context 向应用树提供能力。

## AuthContext.jsx

- 职责：
  - 管理用户登录状态（`user`）与加载态（`isLoading`），从 `localStorage` 恢复。
  - 暴露操作：`login`、`register`、`logout`、`requestEmailCode`、`verifyEmailRegister`。
  - 持久化：登录/注册成功后写入 `accessToken` 与 `user` 至 `localStorage`。
- 后端交互：
  - `POST /api/auth/login` 登录。
  - `POST /api/auth/register` 传统注册（若使用）。
  - `POST /api/auth/request-email-code` 申请邮箱验证码（基于学号 → @hust.edu.cn）。
  - `POST /api/auth/verify-email-code` 校验验证码并注册，成功后返回 JWT 与用户信息。

## ConfirmContext.jsx

- 职责：
  - 提供一个 `confirm(message, options)` Promise 化接口用于二次确认。
  - 与 `ConfirmDialog.jsx` 配合显示/隐藏对话框。
- 后端交互：无（仅 UI 与用户交互）。

## ToastContext.jsx

- 职责：
  - 提供 `toast.success/warn/error/info` 等方法统一展示全局轻提示。
  - 由 `ToastContainer.jsx` 承载具体 UI。
- 后端交互：无（仅 UI 与用户交互）。

## 挂载位置

- 在 `App.jsx` 根部使用：
  - `<AuthProvider>` 提供登录态与鉴权。
  - `<ToastProvider>` 与 `<ConfirmProvider>` 提供全局提示与确认能力。
