# 使用 QQ 邮箱配置后端 SMTP 发送验证码

本文介绍如何使用 QQ 邮箱作为发件人，配置后端通过 nodemailer 发送邮箱验证码。

## 1. 开启 QQ 邮箱的 SMTP 服务并申请授权码

1) 登录 QQ 邮箱网页版
2) 进入 设置 → 账户 → 开启「POP3/IMAP/SMTP 服务」
3) 开启后会弹出「授权码」，复制保存（这将作为 `SMTP_PASS`，不要使用 QQ 密码）

> 说明：QQ 邮箱必须使用授权码作为 SMTP 认证凭据，且强烈建议绑定手机与二次验证；授权码可在安全设置中重置。

## 2. 在后端配置 .env 环境变量

在 `backend/.env` 中加入如下配置（465 端口为 SSL，推荐）：

```
# 基础
PORT=3000
JWT_SECRET=your-strong-secret
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...

# CORS（按需）
CORS_ORIGINS=http://localhost:5173

# SMTP (QQ 邮箱)
SMTP_ENABLED=true
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的QQ邮箱地址@qq.com
SMTP_PASS=上一步申请的授权码
SMTP_FROM=你的QQ邮箱地址@qq.com
```

如果你想使用 587 端口（STARTTLS），可改为：

```
SMTP_PORT=587
SMTP_SECURE=false
```

## 3. 验证是否生效

- 在前端「注册」页按“邮箱验证码注册”流程输入学号（如 `U202312345`），点击「发送验证码」
- 若 SMTP 配置正确，会收到来自 `SMTP_FROM` 的验证码邮件
- 10 分钟有效；60 秒内单学号限频

## 4. 常见问题排查

- 未收到邮件
  - 检查 QQ 邮箱是否成功开启 SMTP 服务，授权码是否正确
  - 检查是否被投递到垃圾箱
  - 确认服务器出网与 465/587 端口未被防火墙屏蔽
  - 查看后端控制台是否有 `sendMail` 错误日志
- 账号/密码错误
  - QQ 邮箱需使用「授权码」，不是登录密码
- 本地开发未配置 SMTP
  - 后端会自动进入“开发模式”：验证码打印在后端日志中，便于调试

## 5. 安全建议

- 不要将授权码提交到 Git 仓库；在部署环境通过安全的秘密管理（环境变量/Key Vault）注入
- 配置应用专用发件地址，避免个人邮箱被封
- 加入限流、防刷与黑名单策略，避免被滥用
