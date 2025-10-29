# assets 目录说明

存放前端静态资源（图标、占位图、插图等）。Vite 会将本目录内容按需打包或原样拷贝（取决于引用方式）。

## 使用建议

- 通过相对路径在组件/页面中引用，如 `import logo from '@/assets/logo.svg'`（若配置了别名）。
- 对于后端返回的图片（如 `/uploads/...`），请使用 `api/index.js` 提供的 `resolveAssetUrl()` 生成完整 URL，而不是直接拼接相对路径。
- 如果需要默认图片（如某些类型的缺省图），优先在 `constants/defaultImages.js` 维护映射，便于统一管理。
