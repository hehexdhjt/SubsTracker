# SubsTracker v3 — 订阅管理与提醒系统

[![Deploy with Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wangwangit/SubsTracker)

基于 Cloudflare Workers 的轻量级订阅管理系统，帮你跟踪所有订阅服务到期时间，通过 Telegram、Bark、Webhook 等 9 种渠道发送可靠的多档位提醒。

> 🎉 **v3 重构里程碑**（2026-05）：从根上修复了 v2 通知/时区一直被吐槽的可靠性问题，引入了产品级可观测性。详见下方[v3 关键改进](#-v3-关键改进2026-05)。
> - `master`：v2 稳定分支（已不主动维护）
> - `refactor/v3-product-grade`：v3 当前分支
> - `legacy-v1`：最早的版本，可作回滚备份

---

## ✨ 功能特色

### 🎯 核心功能

- **订阅管理**：添加、编辑、删除、停用各类订阅服务
- **多档位提醒**（v3 新）：每订阅独立设置 N 条规则，支持"到期前 7/3/1 天 + 当天 + 到期后每 X 小时重复直到续费"
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
| Resend 邮件 | ✅ | API Key + 收发邮箱 |
| Bark（iOS） | ✅ 支持自建服务器 | Server + Device Key |
| Gotify | ✅ 自托管 | Server URL + App Token |
| Server酱 | ✅ Server酱 3 | SendKey |
| PushPlus | ✅ Topic + Channel | Token |

### 📊 可观测性（v3 新）

- **通知历史页** `/admin/notify-logs`：每条发送（成功 / 失败）都有记录，可按订阅、渠道、状态、时间筛选
- **调度执行日志**：每次 Cron 触发的链路日志（命中/去重/发送/续订计数 + 失败原因），可在通知历史页折叠预览
- **`/debug` 时区诊断**：登录后访问，显示 UTC 时间、用户 TZ 时间、当前是否在通知窗口

### 💰 财务管理

- 多币种（CNY / USD / HKD / TWD / JPY / EUR / GBP / KRW / TRY）+ 动态汇率换算
- 仪表盘：月度/年度支出 + 环比 + 即将到期 + 未来 7 天续费 + 按类型/分类排行

---

## 🆕 v3 关键改进（2026-05）

### 1. 时区从根上理清

v2 的 `getCurrentTimeInTimezone()` 只 `return new Date()`，被调度器当成"用户本地时间"对比 `NOTIFICATION_HOURS`，造成 **#91 / #52 / #166** 反复出现。

v3 重写：
- 时间核心模块改为单一真相源，所有"用户本地时间"判断走 `getNowInTimezone(config.TIMEZONE)`
- **`NOTIFICATION_HOURS` 从 v2 的"UTC 小时"改为"按你设置的 TIMEZONE 解释"**——如果你想北京时间 8 点收到通知，TIMEZONE=`Asia/Shanghai` 时直接填 `08`
- 配置页加了实时预览："当前 Asia/Shanghai 时间约 08:30 ✓ 在通知时段内"

### 2. 通知"为什么没收到"自助排查

v2 用户问"为什么这条订阅没响"时只能猜。v3：
- 每次通知发送（成功 / 失败）落到 `notify_log:*`，30 天 TTL，可在 `/admin/notify-logs` 查
- 每次 Cron 调度落到 `sched_log:*`，可看链路（命中规则数 / 去重数 / 各渠道结果）
- 失败行直接展开 raw 响应，不必登 Workers Logs

### 3. 多档位提醒规则

v2 只支持单个 `reminderValue + reminderUnit`（"提前 X 天/小时"）。v3：
- 每订阅可设 N 条规则；新订阅自动应用 4 条智能预设（**到期前 7/3/1 天 + 当天**）
- 三种类型：`before_expiry` / `on_expiry` / `after_expiry`
- `after_expiry` 支持"每 N 小时重复直到续费/手动确认"

### 4. 工程化与可维护性

- 引入 **Hono** 路由（~14KB），中间件管线 + 统一错误兜底
- KV 拆分到 `sub:{id}` 多 Key + `sub_index`，单条 CRUD 不再锁全表
- **170+ 条单元测试**，调度器 / 时区 / 渠道适配器都有回归保护
- JSDoc + `// @ts-check` 渐进式类型守护
- Telegram 含 `_` 等特殊字符的订阅名（**#81**）不再发送失败

### 5. 部署体验不变

老用户**操作命令完全没变**：

```bash
git pull
npm install              # 多了一步（v2 没依赖，v3 加了 hono / vitest）
$env:CLOUDFLARE_API_TOKEN="你的token"   # PowerShell
npm run deploy:safe       # 与 v2 完全相同
```

首次访问任意页面会自动从 v2 KV 结构迁移到 v3，**老数据不会丢**（旧 `subscriptions` Key 保留 7 天作回滚）。

---

## 🚀 部署

### 一键按钮

点击页面顶部 **Deploy with Cloudflare** 按钮，Cloudflare 会自动 fork 仓库并跑 `wrangler deploy`。需要在 Dashboard 的 Worker Settings 里关联 KV 命名空间。

### 命令行部署（推荐）

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

### 默认凭据

部署后首次登录：
- 用户名：`admin`
- 密码：`password`

**首次登录后请立即在系统配置中修改密码**。

### 忘记密码

到 Cloudflare Dashboard → Workers → KV → `SUBSCRIPTIONS_KV` → 编辑 `config` 这条记录的 JSON 中 `ADMIN_PASSWORD` 字段。

---

## 🔄 v2 → v3 升级

详见 [`docs/MIGRATION.md`](docs/MIGRATION.md)。要点：

1. **数据自动迁移**：第一次访问时透明完成，不丢数据；旧数据保留 7 天可回滚
2. **`NOTIFICATION_HOURS` 语义变了**：v2 是 UTC 小时，v3 是用户 TIMEZONE 小时。如果你之前填的是 UTC 数字，请到配置页根据实时预览重新调整
3. **新建订阅默认 4 条提醒规则**：如果你不想要其中某些，进入编辑界面取消勾选即可
4. 部署命令完全不变

---

## 🛠 开发

```bash
npm install
npm test              # 跑 170+ 条单元测试
npm run lint          # tsc 类型检查（用 JSDoc + // @ts-check）
npm run test:watch    # watch 模式
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
├── js/lib/               # 共享前端库
└── README.md

tests/                    # Vitest + workers-pool
docs/                     # 文档（MIGRATION / ARCHITECTURE）
```

详细架构请见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

---

## 🔧 通知渠道配置

参见 [v2 README](https://github.com/wangwangit/SubsTracker/blob/master/README.md#-通知渠道配置)（详细文档暂未重写，配置项与 v2 完全兼容）。

### 🔐 时区与通知时段（重要）

- 配置项 `TIMEZONE` 是**所有时间判断与展示的真相源**
- `NOTIFICATION_HOURS` 是按 `TIMEZONE` 解释的"小时数组"，例如 `["08", "20"]`
- 留空 = 全天可发（仍受 Cron 每小时触发限制）
- `*` 或 `ALL` 等同于留空

### 🔔 第三方 API 通知

```bash
curl -X POST https://your-domain.workers.dev/api/notify/YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -d '{"title":"自定义标题","content":"消息正文","tags":["可选","标签"]}'
```

也可用 `Authorization: Bearer YOUR_TOKEN` 或 `?token=YOUR_TOKEN`。

---

## 🛠 常见问题

### "为什么没收到通知？"

1. 登录后访问 `/admin/notify-logs`，按订阅 ID / 状态 / 时间筛选——若有"failed"行，展开看具体错误
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
