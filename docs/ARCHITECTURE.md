# SubsTracker v3 架构文档

本文档描述 v3 重构后的代码结构、关键模块与数据流。供贡献者上手与作者后续维护参考。

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (单体部署)                 │
├─────────────────────────────────────────────────────────────┤
│  fetch handler  →  Hono App  →  middlewares  →  routes      │
│                                  (migrate, errorBoundary)    │
│                                                              │
│  scheduled handler → ensureMigrations → checkExpiringSubs    │
├─────────────────────────────────────────────────────────────┤
│           services/  (subscription, scheduler, notify)        │
│           |                                                   │
│           ↓                                                   │
│    data/repos/  (使用 KV 的多 Key 结构)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构

```
src/
├── index.js                       # Worker 入口（fetch + scheduled）
├── app.js                         # Hono 应用装配（中间件 + 路由）
│
├── core/                          # 与平台无关的纯逻辑
│   ├── time.js                    # 时区单一真相源 ★
│   ├── lunar.js                   # 农历转换（1900-2100）
│   ├── currency.js                # 汇率系统 + 财务计算
│   ├── currency-format.js         # 货币显示统一工具 ★
│   └── auth.js                    # JWT (Web Crypto HS256)
│
├── data/                          # KV 存储抽象
│   ├── kv.js                      # JSON 读写封装
│   ├── config.js                  # 系统配置读写 + 默认值
│   ├── subscriptions.repo.js      # sub:{id} + sub_index ★
│   ├── reminders.repo.js          # reminder_rules:{subId} ★
│   ├── notification-logs.repo.js  # notify_log:{...} (TTL 30天) ★
│   ├── scheduler-logs.repo.js     # sched_log:{iso} (TTL 30天) ★
│   ├── subscriptions.js           # 业务层（原 v2 文件 thin-wrap repo）
│   └── migrate.js                 # 自动迁移编排 ★
│
├── services/
│   ├── scheduler.js               # 定时任务（v3 重写）★
│   └── notify/
│       ├── channel.js             # 通知渠道适配器接口 ★
│       ├── dispatch.js            # 多渠道并发调度 + 写日志 ★
│       ├── reminder-engine.js     # 规则触发引擎（纯函数） ★
│       ├── reminder.js            # 通知正文格式化 + legacy 转换
│       └── {telegram,bark,webhook,email,wechat,gotify,
│             serverchan,pushplus,notifyx}.js
│
├── api/
│   ├── router.js                  # /api/* 总分发
│   ├── admin.js                   # /admin/* 页面渲染
│   ├── debug.js                   # /debug 页（含时区诊断）
│   ├── utils.js                   # Cookie / 随机串等工具
│   └── handlers/
│       ├── auth.js                # 登录 / 登出 / JWT 校验
│       ├── config.js              # GET/POST /api/config
│       ├── dashboard.js           # GET /api/dashboard/stats
│       ├── notify.js              # POST /api/notify/:token (第三方)
│       ├── subscriptions.js       # 订阅 CRUD + 续订 + 支付
│       ├── test-notification.js   # 配置页"测试发送"
│       └── v3-routes.js           # 提醒规则 / 通知日志 / 调度日志 ★
│
└── views/
    ├── pages.js                   # SSR 页面拼接（注入主题资源）
    ├── theme-resources.html/js    # 暗色模式 + 按钮样式
    ├── loginPage.html
    ├── adminPage.html             # 订阅列表 + 表单 + 多规则编辑器 ★
    ├── configPage.html            # 系统配置 + TZ 感知预览 ★
    ├── dashboardPage.html         # 仪表盘
    └── notifyLogsPage.html        # /admin/notify-logs ★

public/                            # Workers Assets 静态资源（v3 新）
├── README.md
└── js/lib/api-client.js           # 浏览器侧 fetch 封装

tests/
├── smoke.test.js
├── core/time.test.js              # 40 测试
├── data/migrate.test.js           # 16 测试
├── data/reminders.test.js         # 13 测试
├── data/notification-logs.test.js # 8 测试
├── data/scheduler-logs.test.js    # 4 测试
├── services/scheduler.test.js     # 7 集成测试
├── services/notify/channels.test.js     # 34 测试
├── services/notify/reminder-engine.test.js # 24 测试
├── api/routes-compat.test.js      # 8 测试
└── api/v3-routes.test.js          # 12 测试
```

★ 标记的是 v3 新增 / 重写的关键模块。

---

## 3. KV Key 布局

```
schema_version           = "v3"
config                   = { ...所有配置 }

# 订阅
sub_index                = ["1747...","1747...",...]
sub:{id}                 = { 单订阅完整数据 }

# 提醒规则
reminder_rules:{subId}   = [{id,type,value,unit,repeatInterval,repeatUntil,isEnabled}, ...]

# 通知日志（细粒度）
notify_log:{ymdh}:{subId}:{ruleId}:{channel}:{rand}   TTL 30天

# 调度日志（聚合）
sched_log:{isoUtc}                                     TTL 30天

# 去重标记
notify_dedupe:{subId}:{ruleId}:{ymdh-local}            TTL 48小时

# 迁移内部
migrate:subscriptions_v3 / reminder_rules_v3 / scheduler_logs_v3 = "done"
migration_lock                                          TTL 60秒

# 杂项
SYSTEM_EXCHANGE_RATES                                  TTL 24小时
login_attempts:{ip}                                    TTL 5分钟
subscriptions_v2_backup（v2 老 Key 迁移备份）           TTL 7天
```

---

## 4. 时区统一模型

```
真相源：config.TIMEZONE（如 "Asia/Shanghai"）

  ┌──────────────────────────────────────────────────────────┐
  │  数据存储层： 所有日期一律 ISO 8601 UTC 字符串              │
  └──────────────────────────────────────────────────────────┘
                            ↓↑   只在边界转换
  ┌──────────────────────────────────────────────────────────┐
  │  业务逻辑层：判断"通知时段"前先把 UTC now 转成用户 TZ 小时   │
  │           判断"剩余天数"时用用户 TZ 的"今天 0 点"作基准     │
  └──────────────────────────────────────────────────────────┘
                            ↓↑
  ┌──────────────────────────────────────────────────────────┐
  │  展示层：前端用 Intl.DateTimeFormat 按用户 TZ 显示          │
  └──────────────────────────────────────────────────────────┘
```

核心 API（src/core/time.js）：

| 函数 | 用途 |
|------|------|
| `getNowInTimezone(tz, now?)` | 返回 `{ utc, parts, hourString, isoLocal, timezone }` |
| `getTimezoneHourString(date, tz)` | "00"–"23" 字符串，调度器对比通知时段 |
| `getDaysBetween(from, to, tz)` | 跨用户 TZ 零点的整天数差（修复 #166） |
| `getTimezoneMidnightTimestamp(date, tz)` | 用户 TZ 当天零点的 UTC ms |
| `formatLocalDate(time, tz, fmt)` | 按 TZ 展示（'date' / 'datetime' / 'isoLocal'） |
| `formatTimezoneDisplay(tz)` | "中国标准时间 (UTC+8)" 风格文本 |

---

## 5. 调度器流程

```
Cron tick (每小时 UTC :00)
  ↓
ensureMigrations(env)         # 首次或新版本时迁移
  ↓
checkExpiringSubscriptions:
  1. config = getConfig(env)
  2. now = getNowInTimezone(config.TIMEZONE)
  3. inWindow = now.hourString ∈ NOTIFICATION_HOURS?
  4. for sub of activeSubs:
       - daysDiff = getDaysBetween(now, sub.expiry, tz)
       - if autoRenew && daysDiff < 0:
            sub = autoRenew(sub) → push 到 saveMany 队列
            重算 daysDiff
       - rules = remindersRepo.listForSubscription(env, sub.id)
       - if rules 为空: rules = [legacyFieldToRule(sub)]
       - for rule of rules:
            decision = shouldFire(rule, { daysDiff, hoursDiff, nowIso })
            if decision.fire: push 到 candidates
  5. saveMany(updatedSubs)    # 自动续订一并提交
  6. if !inWindow: 写 sched_log status='skipped' 返回
  7. for c of candidates:
       dedupeKey = "notify_dedupe:{sub}:{rule}:{ymdh-local}"
       if KV.has(dedupeKey): dedupedCount++; continue
       KV.put(dedupeKey, '1', TTL 48h)
       ready.push(c)
  8. content = formatNotificationContent(ready, config)
  9. dispatch.send({ title, content }, config, { env, subId, ruleId, ... })
       → 9 渠道并发 send → 写每条 notify_log
  10. 写 sched_log status='ok'/'error'
```

---

## 6. 提醒规则模型

```javascript
// reminder_rules:{subId}
[
  {
    id: "uuid",
    type: "before_expiry" | "on_expiry" | "after_expiry",
    value: 7,                    // 数值
    unit: "days" | "hours",
    repeatInterval: null | <hours>, // 仅 after_expiry 用
    repeatUntil: "renewed" | "acknowledged" | "never",
    isEnabled: true,
    createdAt: "..."
  },
  ...
]
```

智能预设（新订阅默认 4 条）：到期前 7/3/1 天 + 当天。

`reminder-engine.shouldFire(rule, ctx)` 是纯函数，无 KV / 网络副作用，便于测试。

---

## 7. 通知渠道适配器

`services/notify/channel.js` 定义 typedef，所有 9 个渠道实现：

```javascript
{
  name: 'telegram',                               // 唯一标识
  validateConfig(config) { ok | { error } },     // 校验配置
  async send(payload, config) { ChannelResult }, // 发送
  async test(config) { ChannelResult }           // 测试发送
}
```

`dispatch.dispatch(payload, config, options)` 把上述渠道按 `ENABLED_NOTIFIERS` 数组并发调度，`Promise.allSettled` 兜底失败，每条结果通过 `notification-logs.repo.writeLog` 落库。

---

## 8. 关键测试

| 测试文件 | 关键场景 |
|----------|----------|
| `core/time.test.js` | UTC/北京/纽约 DST、跨日界、#166 边界、非法 TZ 兜底 |
| `data/migrate.test.js` | 迁移幂等、并发触发、损坏 JSON 兜底、3 个 step 全跑 |
| `services/notify/channels.test.js` | Telegram MarkdownV2 转义（修 #81）+ 9 渠道成功/失败、dispatch 部分失败 |
| `services/notify/reminder-engine.test.js` | 24 表驱动用例：days/hours value 边界 + after_expiry 重复间隔 |
| `services/scheduler.test.js` | UTC 0点 + 北京 8点 应发 / 配[00] 不发 / 4规则精确命中 / 同小时去重 |
| `api/routes-compat.test.js` | Hono 路由与 v2 输出严格 1:1 |
| `api/v3-routes.test.js` | 提醒规则 CRUD / preset / 通知日志查询 / 创建订阅自动应用规则 |

---

## 9. 部署链路

```
用户 push origin main
  ↓
.github/workflows/test.yml  → npm install + lint + test （PR 必过）
  ↓ (合并到 main)
.github/workflows/deploy.yml → wrangler deploy
  ↓
Cloudflare Edge
  - fetch handler 处理 HTTP
  - scheduled handler 每小时跑（Cron Trigger UTC）
  - KV 全球 replicate
  - Workers Assets 服务 public/
```

---

## 10. 常见维护场景

### 加一个新通知渠道

1. 在 `src/services/notify/foo.js` 实现 `Channel` 接口（参考 telegram.js）
2. 在 `dispatch.js` 的 `ALL_CHANNELS` 注册
3. 在 `data/config.js` 的 `DEFAULT_CONFIG` 加默认字段
4. 在 `configPage.html` 加 UI
5. 写测试 `tests/services/notify/channels.test.js`

### 加一个新提醒规则类型

1. 在 `reminder-engine.js` 的 `shouldFire` switch 加分支
2. 在 `reminders.repo.normalizeRule` 的允许列表加新值
3. 前端 `adminPage.html` 的规则编辑器 UI 增加选项
4. 表驱动测试 `tests/services/notify/reminder-engine.test.js` 加用例

### 改 KV 数据结构

1. 在 `migrate.js` 的 `MIGRATION_STEPS` 数组追加 step（id 唯一、run 幂等）
2. 不动 `SCHEMA_VERSION` 字符串（继续是 'v3'）— 老用户 step 标记没写就会跑
3. 测试 `tests/data/migrate.test.js` 加用例
