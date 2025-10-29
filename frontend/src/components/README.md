# components 目录说明

存放可复用的 UI 组件，尽量保持与页面的业务逻辑解耦。组件通过 props 与页面交互；涉及后端请求通常由页面层调用 `api`，组件仅负责触发回调。

## 组件一览

- `ConfirmDialog.jsx`
  - 用途：全局确认弹窗的 UI 容器（与 `ConfirmContext` 配合）。
  - 交互：不直接请求后端；由页面/业务在确认后再调用 API。

- `ListingCard.jsx`
  - 用途：帖子/任务在列表中的展示卡片（标题、描述、价格/酬劳、图片等）。
  - 交互：常由页面传入点击/收藏等操作的回调；图片地址建议通过 `resolveAssetUrl()` 处理。

- `MyListingCard.jsx`
  - 用途：我的发布列表中的卡片，包含“编辑、查看、确认完成（跑腿）”等操作入口。
  - 交互：通常通过 props 回调触发上层对 `/api/listings` 或 `/api/errands/...` 的请求。

- `OrderCard.jsx`
  - 用途：展示订单信息（买家/卖家/跑腿视图），可包含状态更新按钮。
  - 交互：调用方页面负责请求 `/api/orders/:id/status` 更新状态，组件仅发出事件。

- `PostModal.jsx`
  - 用途：发布/编辑弹窗表单，支持图片上传与不同模块主题（出售/收购/帮帮忙/失物/跑腿）。
  - 交互：
    - 新建：`POST /api/listings`（Multer 上传多图）
    - 编辑：`PUT /api/listings/:id`（可附带新增图片）
    - 图片字段：使用表单上传，后端返回的图片 URL 通过 `resolveAssetUrl()` 渲染。

- `ToastContainer.jsx`
  - 用途：全局轻提示容器（与 `ToastContext` 配合）。
  - 交互：不直接请求后端。

## 使用建议

- 组件不直接关心后端 URL，只暴露清晰的 props/事件；具体 API 调用在页面层完成。
- 图片/附件地址统一走 `resolveAssetUrl()`，避免环境切换导致的相对路径问题。
