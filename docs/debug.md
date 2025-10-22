# 调试记录 — Git / 部署 / 图片无法显示
# 调试记录 — 系统问题汇总


---

## 一  图片与 Git 部署问题（2025-09-29）

### 1 问题简述
- 在服务器上执行 `git push gitee main` 返回失败（终端显示 Exit Code: 1）。
- 部署后发现图片可成功上传到 `uploads` 目录，但前端无法显示图片（浏览器请求返回 404/无法加载）。

### 2 关键日志（来自工作区上下文）
- 终端最后命令: `git push gitee main`
- 终端返回: Exit Code: 1

### 3 排查与已采取的修复
1. 前端/后端代码检查
   - 修正并统一了前端对图片资源的解析逻辑，新增 `frontend/src/api/index.js` 中的 `resolveAssetUrl`，并把各组件改为使用该方法（保证返回以 `/uploads/...` 或完整 http(s) URL）。
   - 后端增强了上传路径删除时的安全校验，添加 `resolveUploadAbsolutePath` 来避免路径逃逸及删除失败。

2. Nginx 配置问题（图片无法显示的根因）
   - 原因：Nginx 的正则 location 可能会优先匹配带后缀的请求，导致 `/uploads/` 的 `alias` 未被命中，返回 404。
   - 解决：把 `/uploads/` 的 location 放到正则之前或使用 `location ^~ /uploads/ { ... }` 强制优先匹配。示例配置已修改并验证可用。

3. 其他检查点
   - 确认文件确实存在于服务器物理目录，例如：`/www/wwwroot/hustse/backend/uploads/<file>`。
   - 确认 Nginx 运行用户对 uploads 目录可读（调整 `chown` / `chmod`）。
   - 重载 Nginx 并用 `curl -I http://<host>/uploads/<file>` 验证直接访问是否返回 200。

### 4 如何重现该问题（快速步骤）
1. 在前端上传图片（通过项目的上传功能）
2. 在服务器上确认文件存在于 `backend/uploads/`
3. 访问 `http://<域名或IP>/uploads/<文件名>`，若返回 404 则说明 Nginx 未正确匹配 alias

### 5 常用调试命令
```bash
# 查看 uploads 目录
ls -l /www/wwwroot/hustse/backend/uploads

# 测试 nginx 对静态文件的响应
curl -I http://47.122.126.189/uploads/<文件名>.jpg

# 查看 nginx 错误日志
sudo tail -n 100 /var/log/nginx/error.log

# 校验并重载 nginx 配置
sudo nginx -t && sudo systemctl reload nginx
```

### 6 关于 `git push` 失败（Exit Code: 1）
- 当前记录中只看到命令与退出码（1），但未包含更详细的 git 错误信息。常见原因包括：认证失败、远端拒绝、钩子报错或网络问题。
- 建议：在服务器执行 `git push gitee main` 时把完整输出复制到日志里，或先运行 `git remote -v` / `git fetch` / `git pull` 查看远端状态，再尝试推送以获取完整错误。

### 7 下一步建议
1. 若图片问题已解决，继续观察一段时间并在日志中留下成功访问记录。
2. 在服务器上重试 `git push gitee main` 并将完整错误信息粘贴到此文档以便后续分析。
3. 若需要，我可提供诊断脚本，自动检测 uploads 文件存在性、Nginx 配置优先级和图片可访问性。

记录人: losyi

---

## 二  用户中心白屏（2025-10-21）

### 1 问题简述
- 打开“用户中心”页面时出现白屏。

### 2 关键日志 / 表现
- 浏览器控制台报错：`ReferenceError: Cannot access 'detailGalleryImages' before initialization`。
- 发生时段：2025-10-21 开发环境。

### 3 排查与已采取的修复
1. 定位到 `frontend/src/pages/UserCenterPage.jsx` 新增的详情弹窗逻辑，`useEffect` 钩子在文件上部引用了尚未初始化的 `detailGalleryImages`。
2. 将该 `useEffect` 移动到 `detailGalleryImages` 对应的 `useMemo` 定义之后，再次构建后白屏问题消失。

### 4 如何重现该问题（快速步骤）
1. 在存在问题的提交中访问前端“用户中心”页面。
2. 浏览器控制台会立即抛出上述 `ReferenceError`，页面渲染中断并显示空白。

### 5 验证方式
- 本地重新构建并访问“用户中心”，确保页面正常加载并可打开详情弹窗。
- 控制台不再出现 `ReferenceError`。

### 6 变更代码
- `frontend/src/pages/UserCenterPage.jsx`

记录人: losyi

---

## 三  资料保存导致头像被重置（2025-10-22）

### 1 问题简述
- 在“用户中心”点击“保存修改”后，先前上传的头像被重置为默认头像。

### 2 关键日志 / 表现
- 前端保存资料未上传新头像时，刷新页面发现头像显示为默认图。
- 调用接口：`PUT /api/users/me` 成功返回，但随后的 `GET /api/users/me` 中 `profile.avatarUrl` 变为默认值。

### 3 排查与已采取的修复
1. 后端 `user_profiles` 表的 upsert 语句无条件使用 `VALUES(avatar_url)` 覆盖旧值；当前端未提交 `avatarUrl`（或经服务端规范化为 NULL）时，导致数据库中的头像字段被置空。
2. 修改 upsert 逻辑，仅当客户端明确提交了非 NULL 的 `avatarUrl` 时才更新；否则保留原值：
   - 将 `avatar_url = VALUES(avatar_url)` 改为 `avatar_url = IFNULL(VALUES(avatar_url), avatar_url)`。

### 4 如何重现该问题（快速步骤）
1. 先通过“上传头像”接口成功上传头像（页面显示正确）。
2. 进入“用户中心”，只修改昵称/简介等资料，不上传新头像，点击“保存修改”。
3. 回到页面或重新进入“用户中心”，头像变为默认图（旧版本）。

### 5 验证方式
- 应用修复后，重复上述步骤，头像应保持不变；仅在上传新头像或明确提交 `avatarUrl` 时才会更新。
- 通过 `GET /api/users/me` 验证 `profile.avatarUrl` 未被置空。

### 6 变更代码
- `backend/server.js`（`PUT /api/users/me` 路由 upsert 语句）：
  - 由 `avatar_url = VALUES(avatar_url)` 调整为 `avatar_url = IFNULL(VALUES(avatar_url), avatar_url)`。

记录人: losyi

---

## 四  我的订单相关问题（2025-10-21）

### 1 问题简述
- “我的订单”页面的商品默认图片无法显示，而首页同一商品的默认图正常。

### 2 关键日志 / 表现
- 浏览器网络面板显示 `listing_image_url` 为相对路径，但最终渲染成空白或 404。
- 仅在订单列表中复现，首页列表正常。

### 3 排查与已采取的修复
1. 检查 `frontend/src/pages/MyOrdersPage.jsx`，发现订单卡片仍直接拼接原始字段，未统一使用 `resolveAssetUrl` 与默认占位逻辑。
2. 更新 `handleContact` / `OrderCard` 渲染逻辑，统一通过 `resolveAssetUrl` 和 `getDefaultListingImage` 生成图片地址，回退到 `FALLBACK_IMAGE`。

### 4 如何重现该问题（快速步骤）
1. 登录并进入“我的订单”页面。
2. 查看列表中无上传图片的订单，可见图片区域为空白。

### 5 验证方式
- 同一订单在“我的订单”页面与首页均显示默认图；网络面板返回 200。

### 6 变更代码
- `frontend/src/pages/MyOrdersPage.jsx`
- `frontend/src/components/OrderCard.jsx`

记录人: losyi

---

## 五  我的订单联系跳转问题（2025-10-21）

### 1 问题简述
- “我的订单”页面点击“联系对方”按钮未跳转到消息页。

### 2 关键日志 / 表现
- 点击按钮无响应，控制台无报错；`yy_pending_chat` 未写入。

### 3 排查与已采取的修复
1. 核对 `OrderCard` → `MyOrdersPage` 的回调，发现之前缺少 `onNavigate` 调用与聊天上下文写入。
2. 在 `handleContact` 中补充本地缓存 `yy_pending_chat`，调用 `onNavigate('messages')` 实现跳转。

### 4 如何重现该问题（快速步骤）
1. 打开“我的订单”页面，找到任一订单并点击“联系对方”。
2. 旧版本停留在原页，新版本会跳转至消息中心并带入上下文。

### 5 验证方式
- 执行上述步骤，确认跳转成功且消息输入框预填关联商品信息。

### 6 变更代码
- `frontend/src/pages/MyOrdersPage.jsx`
- `frontend/src/components/OrderCard.jsx`

记录人: losyi
