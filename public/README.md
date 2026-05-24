# public/

Workers Assets 静态资源目录。v3 新增的客户端 JS / CSS / 独立 HTML 页面放在这里，
由 wrangler 自动打包并通过 ASSETS binding 服务到根路径下：

- `public/js/lib/*.js`  → 浏览器访问 `/js/lib/<name>.js`
- `public/js/pages/*.js` → 浏览器访问 `/js/pages/<name>.js`
- `public/css/*.css`    → 浏览器访问 `/css/<name>.css`

注意：
- 已存在的 v2 页面（`adminPage.html` / `configPage.html` 等）仍由 `src/views/` 中的
  text-import 提供，前端继续兼容。新功能（多提醒规则 UI、通知历史页等）的客户端
  JS 可以放到这里以避免污染原 HTML。
- 不要把敏感信息放进 `public/`（公网可读）。
