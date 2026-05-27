# SubsTracker — 订阅管理与提醒系统

基于 Cloudflare Workers 的轻量级订阅管理系统。跟踪所有订阅服务的到期时间，通过 Telegram、Bark、Webhook 等 9 种渠道发送可靠的多档位提醒，并提供完整的发送日志用于自助排查。

---

## ✨ 功能特色

### 🎯 订阅管理

- **CRUD**：添加、编辑、删除、启用/停用各类订阅服务
- **多档位提醒**：每订阅独立设置 N 条规则，支持"到期前 7/3/1 天 + 当天 + 到期后每 X 小时重复直到续费"
- **自动续订**：到期后自动推进到期日并写入支付记录
- **手动续订**：自定义金额、日期、周期数、备注
- **支付历史**：完整记录、可编辑/删除（删除时自动回退订阅周期）
- **农历支持**：1900-2100 年农历转换，可按农历周期续订

### 📱 多渠道通知（9 种）

| 渠道 | 状态 | 配置项 |
|------|------|--------|
| Telegram | ✅ MarkdownV2 + 失败降级纯文本 | Bot Token + Chat ID |
| NotifyX | ✅ | API Key |
| Webhook | ✅ 支持自定义 Header 与消息模板 | URL + 模板（含 `{{title}} {{content}} {{daysRemaining}}` 等） |
| 企业微信机器人 | ✅ text/markdown + @ 提醒 | Webhook URL |
| Resend 邮件 | ✅ HTML 模板 | API Key + 收发邮箱 |
| Bark（iOS） | ✅ 支持自建服务器 | Server + Device Key |
| Gotify | ✅ 自托管 | Server URL + App Token |
| Server酱 | ✅ Server酱 3 | SendKey |
| PushPlus | ✅ Topic + Channel | Token |

### 📊 可观测性

- **通知历史页** `/admin/notify-logs`：每条发送（成功 / 失败）都有记录，可按订阅、渠道、状态、时间筛选
- **调度执行日志**：每次 Cron 触发的链路日志（命中/去重/发送/续订计数 + 失败原因），可在通知历史页折叠预览
- **`/debug` 时区诊断**：登录后访问，显示 UTC 时间、用户 TZ 时间、当前是否在通知窗口

### 💰 财务管理

- 多币种（CNY / USD / HKD / TWD / JPY / EUR / GBP / KRW / TRY）+ 动态汇率换算
- 仪表盘：月度/年度支出 + 环比 + 即将到期 + 未来 7 天续费 + 按类型/分类排行

### 🔐 时区与通知时段

- 配置项 `TIMEZONE` 默认 `Asia/Shanghai`，是所有时间判断与展示的真相源
- `NOTIFICATION_HOURS` 是按 `TIMEZONE` 解释的"小时数组"，例如 `["08", "20"]`
- 留空 = 全天可发（仍受 Cron 每小时触发限制）
- `*` 或 `ALL` 等同于留空

---

## 🚀 部署

### 方式一：命令行部署

```bash
git clone https://github.com/wangwangit/SubsTracker.git
cd SubsTracker
npm install

# 设置 Token
# Linux/macOS:
export CLOUDFLARE_API_TOKEN=你的token
# Windows PowerShell:
$env:CLOUDFLARE_API_TOKEN="你的token"

npm run deploy:safe
```

`deploy:safe` 自动执行：
1. `npm run setup` — 检测/创建 `SUBSCRIPTIONS_KV` + `SUBSCRIPTIONS_KV_PREVIEW`，自动写入 `wrangler.toml`
2. `npm run deploy` — `wrangler deploy`

### 方式二：GitHub Actions 自动部署

Fork 本仓库后，在仓库 **Settings → Secrets and variables → Actions** 中添加：

| Secret 名称 | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需要 Workers 编辑 + KV 编辑权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID（可选，Token 已锁定账户时可省略） |

配置完成后，每次 push 到 `master` 分支会自动运行测试并部署。也可在 GitHub Actions 页面手动触发 Deploy workflow。

### 默认凭据

部署后首次登录：
- 用户名：`admin`
- 密码：`password`

**首次登录后请立即在系统配置中修改密码。**

### 忘记密码

到 Cloudflare Dashboard → Workers → KV → `SUBSCRIPTIONS_KV` → 编辑 `config` 这条记录的 JSON 中 `ADMIN_PASSWORD` 字段。

---

## 🔄 升级

```bash
git pull
npm install
npm run deploy:safe
```

首次访问时 KV 数据会**自动迁移**到新结构（多 Key 拆分、提醒规则、可观测性日志）。旧数据自动备份保留 7 天。

> ⚠️ **如果你之前按 UTC 配置过 `NOTIFICATION_HOURS`**：升级后该字段改按你设置的 `TIMEZONE` 解释。请到配置页根据底部"实时预览"重新调整。

---

## 🛠 开发

```bash
npm install
npm test              # 跑 170+ 条单元测试
npm run lint          # tsc 类型检查（用 JSDoc + // @ts-check）
npm run test:watch    # watch 模式

# 本地启动 dev 环境（独立的 miniflare KV，不影响生产数据）
npx wrangler dev --config wrangler.dev.toml --local
# 浏览器打开 http://127.0.0.1:8787，admin/password
```

源码结构：

```
src/
├── index.js              # Worker 入口（fetch + scheduled）
├── app.js                # Hono 应用装配
├── core/                 # 时间 / 农历 / 货币 / 认证
├── data/                 # KV 仓库 + 自动迁移
├── services/             # 调度器 + 通知（9 渠道适配器）
├── api/                  # 路由 + handler + 中间件
└── views/                # HTML 页面（text-import）

public/                   # Workers Assets 静态资源
└── js/lib/               # 共享前端库

tests/                    # Vitest + workers-pool
```

---

## 🔧 第三方 API 通知

```bash
curl -X POST https://your-domain.workers.dev/api/notify/YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -d '{"title":"自定义标题","content":"消息正文","tags":["可选","标签"]}'
```

也可用 `Authorization: Bearer YOUR_TOKEN` 或 `?token=YOUR_TOKEN`。

---

## 🛠 常见问题

### "为什么没收到通知？"

1. 登录后访问 `/admin/notify-logs`，按订阅 / 状态 / 时间筛选——若有"failed"行，展开看具体错误
2. 访问 `/debug`，看"时区诊断"区块——确认当前是否在通知窗口
3. 如果"在窗口内但 sched_log status=ok 且 sentCount=0"，说明本次没命中任何提醒规则——检查订阅的"提醒规则"配置

### Authentication error [code: 10000]

通常是 Wrangler 缓存或 Token 权限问题。重新设置 Token 后重试，仍报错则清理 `.wrangler/` 目录后再来。

---

## 🤝 贡献 / 协议

PR 欢迎，issue 也欢迎。代码风格：JSDoc 中文注释 + Vitest 单测。
MIT License。

---

## 关注作者

![image](https://github.com/user-attachments/assets/96bae085-4299-4377-9958-9a3a11294efc)

CDN 加速由 Tencent EdgeOne 赞助。
