# constants 目录说明

存放与 UI/业务相关的常量配置，避免散落在各处的硬编码，便于主题与默认资源的集中管理。

## defaultImages.js

- 作用：按帖子/任务类别提供默认展示图片映射，并提供 `FALLBACK_IMAGE` 兜底占位。
- 导出：
  - `getDefaultListingImage(type)` / `getDefaultDetailImage(type)`：根据类别返回默认图。
  - `DEFAULT_LISTING_IMAGES`、`FALLBACK_IMAGE`：原始映射与兜底地址。
- 使用建议：在列表卡片或详情页缺图时调用，保证视觉一致性。

## moduleThemes.js

- 作用：定义“发布/编辑”表单的多模块主题（出售、收购、帮帮忙、失物招领、跑腿）。
- 内容：每个主题提供 header 背景、强调色、输入聚焦、按钮颜色、占位提示等 UI 配置。
- 导出：
  - `MODULE_THEMES`：主题对象集合。
  - `getModuleTheme(type)`：按类型获取主题（默认回落到 `sale`）。
- 使用位置：`components/PostModal.jsx` 中按帖/任务类型切换表单视觉风格。
