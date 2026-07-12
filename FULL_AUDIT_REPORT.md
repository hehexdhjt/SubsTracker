# SubsTracker 全面审计报告

> 生成日期：2026-07-12  
> 范围：`src/` 后端 + 前端 + API + 测试补全 + 产品评估  
> 基线：本地 `master`（含近期 issue 修复与功能增强）  
> 测试结果：`npm test` → **20 files / 227+ tests passed**（以实际跑完为准）

---

## 目录

1. [阶段一：全面代码审计](#阶段一全面代码审计)
2. [阶段二：Bug 与风险分级清单](#阶段二bug-与风险分级清单)
3. [阶段三：测试覆盖与补全](#阶段三测试覆盖与补全)
4. [阶段四：产品视角评估](#阶段四产品视角评估)
5. [可清理文件建议](#可清理文件建议)
6. [本次已落地的修复](#本次已落地的修复)

---

## 阶段一：全面代码审计

### 1.1 架构速览

```
Cron scheduled() → ensureMigrations → checkExpiringSubscriptions
  → 加载 config + subs + reminder_rules
  → 时区窗口 → shouldFire → dedupe → dispatch(10 渠道) → notify_log / sched_log

HTTP fetch → Hono app → /api/* handlers (JWT cookie) / /admin pages / /debug
KV: config | sub_index | sub:{id} | reminder_rules:{id} | notify_log:* | sched_log:* | notify_dedupe:*
```

| 层 | 职责 | 评价 |
|----|------|------|
| `core/` | 时区、JWT、汇率、农历 | 时区较扎实；JWT/汇率需加固 |
| `data/` | KV 仓储 + 迁移 | 结构清晰；删除联动、并发有缺口 |
| `services/notify` | 渠道适配器 + 引擎 + 调度 | 扩展性好；部分语义/节流未闭环 |
| `api/` | 路由与 handler | 兼容优先；鉴权门禁曾漏第三方 API |
| `views/` | 5 页 SSR HTML + 内联 JS | 功能全但体量大、XSS/劫持风险 |

### 1.2 后端逻辑

#### `core/time.js`
- **优点**：`getTimezoneDateParts` / `getDaysBetween` / midnight 以用户 TZ 为零点，修复过 #166 类问题；有较好单测。
- **风险**：`addCalendarPeriodInTimezone` 非 `endOfMonth` 时依赖 JS `setUTCMonth` 溢出行为（1/31→3 月初），属历史兼容。
- **DST**：未对「弹簧/回落」当天小时做专门断言，但日级 diff 对订阅场景通常够用。

#### `services/scheduler.js`
- **链路完整**：config → 活跃订阅 → autoRenew → rules → shouldFire → 小时 dedupe → **聚合一条通知** → dispatch → 日志。
- **问题**：
  1. `after_expiry` 引擎支持 `lastFireAtIso`，调度器**从不传入** → 过期后主要靠「同一本地小时 dedupe」节流，`repeatInterval` 在生产路径基本失效。
  2. 多订阅/多规则命中时合并成一条消息；`notify_log` 主归属取 `ready[0]`，细粒度可查但日志语义易误解。
  3. autoRenew 公历路径仍用本地 `Date#setMonth`，与 `addCalendarPeriodInTimezone` 不完全一致（时区边界极端场景）。

#### `reminder-engine.js`
- **设计**：`before_expiry` **精确匹配** `daysDiff === value`（有测试锁定）；`on_expiry`；`after_expiry` 按间隔。
- **与旧代码**：`reminder.js` 的 `shouldTriggerReminder` 仍是窗口语义，但调度器不用它——双轨遗留。

#### 通知渠道 / dispatch
- 10 渠道注册表清晰；`Promise.allSettled` 不因单渠道失败中断。
- **无超时/AbortSignal**；Workers 有整体 CPU 限制，慢渠道可能拖长 Cron。
- 无重试（合理：避免重复推送）；错误进 `notify_log`。

#### `data/` KV
- `sub_index` 读改写非事务，注释已承认单用户场景可接受。
- **删除订阅**曾不清理 `reminder_rules:{id}`（已在本次修复）。
- 迁移 `ensureMigrations` 有锁与幂等；`migrateReminderRules` 单测偏薄。

#### `core/auth.js`
- 自研 HMAC-SHA256「JWT 风格」token；cookie `HttpOnly; Secure; SameSite=Strict`。
- **曾忽略 `exp` 校验**（生成写了 24h exp 但不验证）——已在本次修复。
- 签名比较非 constant-time；非标准 base64url。

#### `core/currency.js`
- Frankfurter API + 24h KV 缓存；失败回退 `FALLBACK_RATES`。
- 未知币种 `convertToCNY` 返回原金额（可能低估/高估仪表盘）。

### 1.3 前端 UI/UX

| 页面 | 职责 | 主要问题 |
|------|------|----------|
| login | 登录 | 默认 admin/password 无强制改密；错误区 a11y 弱 |
| admin | 订阅 CRUD/规则/克隆/筛选 | 列表 notes/category XSS（已部分修复）；`window.fetch` 劫持同步规则脆弱；空列表文案像「筛选无结果」 |
| config | 渠道与备份 | 功能全；暗色大体覆盖 |
| dashboard | 财务统计 | 依赖汇率与支付历史完整性 |
| notify-logs | 发送/调度日志 | 401 不统一跳转登录；与 admin 的 `apiFetch` 行为不一致 |

- **响应式**：导航有 mobile menu + `aria-expanded`；表格操作按钮多，小屏拥挤。
- **暗色**：theme-resources 覆盖主路径；动态拼的 badge 仍有浅色硬编码。
- **表单**：前端有基础校验；后端长度/类型边界弱。
- **核心流**：创建→规则→测试→日志 **大体通**，规则依赖 fetch 劫持是最大体验风险。

### 1.4 API 设计

| 项 | 结论 |
|----|------|
| 鉴权 | 除 login 外默认 JWT；**第三方 notify 曾被 JWT 门禁挡住**（已修：JWT 前放行 `/notify/*`） |
| REST | 资源路径清晰；部分返回裸数组（GET subscriptions） |
| 错误体 | 多数 `{success,message}`；第三方 notify 仅 `{message}`；错误密码 login 返回 200 |
| 校验 | JSON 解析多处无 try → 可能 500 |
| 备份 | 默认脱敏；replace 非原子、校验偏弱 |

### 1.5 端到端链路

```
用户操作 → API → KV → Cron → 通知 → 日志 → UI
```

| 断链/不一致 | 说明 |
|-------------|------|
| 列表展示 vs 规则 | 已通过 list 附带 `reminderRules` + legacy 同步缓解 |
| 删除 vs 规则 | 已清理 rules |
| after_expiry 间隔 | 引擎有、调度无 lastFire |
| 第三方 notify | 已修复门禁 |
| 聚合通知 vs 分条日志 | 设计取舍，文档需写清 |

---

## 阶段二：Bug 与风险分级清单

### P0 — 必须关注（安全/数据/核心不可用）

| ID | 模块 | 简述 | 问题 | 复现 | 影响 | 建议 | 状态 |
|----|------|------|------|------|------|------|------|
| P0-1 | auth | JWT 不校验 exp | 过期 token 仍可用 | 登录后改客户端时间或保存旧 cookie | 会话永不过期 | 校验 exp | **已修** |
| P0-2 | api/notify | 第三方 API 被 JWT 挡住 | 无 cookie 永远 401 | curl POST /api/notify/TOKEN | 集成不可用 | JWT 前放行 | **已修** |
| P0-3 | admin UI | notes/category XSS | innerHTML 未转义 | 备注写入 script | 管理端 XSS | escapeHtml | **已修** |
| P0-4 | backup | replace 非原子 + 弱校验 | 可清空后写入残缺 sub | 覆盖导入残缺 JSON | 数据丢失 | 校验+两阶段/先备份 | **已修（校验+空列表拒绝+配置后写）** |
| P0-5 | 部署 | 默认 admin/password | 文档即默认值 | 公网裸奔 | 账号接管 | 强制改密/启动告警 | **已缓解（登录/配置页提示）** |
| P0-6 | scheduler | 日规则 + 全天空窗 → 每小时可重复发 | dedupe 键含小时 `ymdh`；`NOTIFICATION_HOURS=[]` 时全天 in-window | 到期前 N 天当天 cron 每小时跑 | 同一天最多约 24 条 | 日规则按 `YYYYMMDD` 去重，或仅在配置时段首小时发 | **已修** |
| P0-7 | scheduler | autoRenew 用运行时本地 Date | 与用户 TIMEZONE / 手动续订路径不一致 | 跨时区或月末订阅自动续订 | 到期日漂移 | 统一 `addCalendarPeriodInTimezone` | **已修** |
| P0-8 | scheduler | 去重键在发送成功前写入 | 渠道失败后同小时不再重试 | 网络抖动导致发送失败 | 漏提醒 | 成功后再写 dedupe 或可重试状态 | **已修** |

### P1 — 强烈建议

| ID | 模块 | 简述 | 建议 | 状态 |
|----|------|------|------|------|
| P1-1 | subscriptions | 删除未清 reminder_rules | delete 时 clearForSubscription | **已修** |
| P1-2 | admin | fetch 劫持同步规则 | 表单显式带 reminderRules；服务端 update 写 rules | **已修** |
| P1-3 | scheduler | after_expiry 无 lastFireAtIso | 持久化 lastFire 或按日 dedupe | **已修** |
| P1-4 | api | 非法 JSON → 500 | 统一 readJson → 400 | **部分（subscriptions POST/PUT）** |
| P1-5 | api | 错误响应不统一 | 统一 envelope；GET 缺资源 404 | **部分（GET sub 404）** |
| P1-6 | notify | token 可走 URL path/query | 文档引导 Header；timing-safe 比较 | 待办 |
| P1-7 | notify-logs | 401 不跳转登录 | 复用 apiFetch | **已修（ApiClient 401→/）** |
| P1-8 | scheduler | autoRenew 与 time 工具不一致 | 统一 addCalendarPeriodInTimezone | **已修** |

### P2 — 建议优化

| ID | 简述 | 建议 |
|----|------|------|
| P2-1 | 空列表文案像筛选失败 | 区分「无订阅」与「无匹配」 |
| P2-2 | 暗色/动态 badge 对比度 | 补 dark class |
| P2-3 | a11y：对话框、图标按钮名 | role=dialog / aria-label |
| P2-4 | 渠道无 fetch timeout | AbortSignal.timeout |
| P2-5 | 死代码 theme-resources.js、updateConfig | 删除或接入 | **已删** |
| P2-6 | 汇率未知币种 | 显式警告或排除统计 |
| P2-7 | 备份 merge 旧 rules 残留 | 无 rules 时可选清空 |
| P2-8 | 双轨 legacy 提醒字段 | 中期只读 rules，废弃 legacy |

---

## 阶段三：测试覆盖与补全

### 3.1 补全前覆盖（摘要）

| 区域 | 状态 |
|------|------|
| time / reminder-engine / channels / backup / extras / migrate 部分 | 较好 |
| auth 深度、config 脱敏、subscriptions 全 CRUD、currency、e2e | 缺失或薄弱 |
| after_expiry 调度集成 | 仅有引擎单测 |

### 3.2 本次新增测试文件

| 文件 | 覆盖 |
|------|------|
| `tests/api/auth.test.js` | 登录/限流/登出/JWT 过期与篡改 |
| `tests/api/subscriptions-crud.test.js` | CRUD、规则摘要、删除清理 rules、toggle |
| `tests/api/config-routes.test.js` | 脱敏、空串不误清、CLEAR_SECRET |
| `tests/api/notify-third-party.test.js` | 无 JWT 的第三方 token 路径 |
| `tests/core/auth-currency.test.js` | convertToCNY、汇率失败降级、缓存 |
| `tests/core/time-endofmonth.test.js` | 月末选项与边界时区 |
| `tests/services/scheduler-after-expiry.test.js` | 引擎间隔 + 调度匹配现状 |
| `tests/e2e/subscription-lifecycle.test.js` | 创建→调度→续订→删除 |

### 3.3 仍建议后续补充

- `migrateReminderRules` 专项
- dashboard stats
- 非法 JSON 统一 400
- backup replace 残缺数据拒绝
- reminder `getNextFireTime`
- 前端无自动化（可接受：Workers 项目以 API/引擎为主）

### 3.4 验证

```bash
npm test
# 期望：全部通过（本报告撰写时 20 files / 227+ tests）
```

---

## 阶段四：产品视角评估

### 4.1 核心价值闭环

**主路径**：添加订阅 → 配置多档提醒 → Cron 到点推送 → 续订/停用 → 查日志。

| 环节 | 顺畅度 | 说明 |
|------|--------|------|
| 添加+提醒 | 高 | 预设 7/3/1/当天降低门槛 |
| 收到提醒 | 中高 | 精确日语义需理解；通知窗口/去重需知 |
| 续订 | 中 | cycle/reset 有说明后改善 |
| 排障 | 中高 | notify-logs + sched_log + /debug 是差异化优势 |

**断裂点**：第三方 webhook 集成曾不可用；规则保存依赖脆弱劫持；公网默认密码。

### 4.2 信息架构

5 页划分合理：列表 / 配置 / 仪表盘 / 日志 / 登录。  
**3 步完成核心**：登录 → 添加订阅（带预设规则）→ 配置至少一渠道并测发。可达。

### 4.3 缺失功能 / 盲区

- 批量操作（批量停用/改分类）
- 日历视图 / 导出 ICS
- 提醒「窗口每日」可选模式（当前仅精确日+多规则）
- 强制改密、2FA（单租户也有价值）
- 备份 replace 安全确认二次+服务端校验
- 汇率刷新可视化与未知币种提示

### 4.4 竞品对比（相对 Subby / 记账类订阅 App）

| 优势 | 劣势 |
|------|------|
| 自托管 CF Workers 零/低成本 | UI 非原生 App 体验 |
| 10 渠道 + 可观测日志 | 无协作/多用户 |
| 农历、多规则、备份 | 移动端操作密度高 |
| 开源可改 | 默认安全基线弱 |

可借鉴：引导式 onboarding、订阅模板市场、智能「即将到期」摘要邮件。

### 4.5 可维护性

- **上手**：`docs/ARCHITECTURE.md` 清晰；`优化文档/` 历史材料易干扰 AI/新人。
- **新渠道**：实现 Channel 契约 + 注册 ALL_CHANNELS + config 字段 + 配置页，成本低。
- **KV 规模**：`listAll` 全量拉取，百级订阅 OK；上千建议分页或索引字段。
- **前端**：单文件 adminPage 过大，后续可拆模块（非紧急）。

---

## 可清理文件建议

> **不要在未备份/确认前直接删生产必需文件。** 下列为「对运行时无用、易误导后续 AI 开发」的内容。

### 建议移除或移出仓库（高优先级）

| 路径 | 原因 |
|------|------|
| `优化文档/` 整目录 | 历史分析/竞品/dev-spec，**非运行时**；体积大且易被 AI 当现行规格 |
| `CHANGELOG-TEST.md` | 测试过程草稿 changelog，非正式发布说明 |
| `.agents/`、`.codex/` | 空或工具残留目录，与运行无关 |
| `src/views/theme-resources.js` | 死代码（实际用 `.html`） |
| `public/README.md` | 若无实质内容可并入主 README |

### 建议保留

| 路径 | 原因 |
|------|------|
| `docs/ARCHITECTURE.md` `MIGRATION.md` `TEST_PLAN.md` | 现行架构与测试计划 |
| `docs/FULL_AUDIT_REPORT.md` | 本报告 |
| `scripts/setup-kv.cjs` | 部署必需 |
| `.github/workflows/*` | CI/CD |
| `tests/**` | 回归 |

### 可选归档策略

```bash
# 示例：移出主仓库视野（请自行确认后执行）
mkdir -p _archive
mv 优化文档 CHANGELOG-TEST.md _archive/ 2>/dev/null || true
# 或加入 .gitignore 后本地保留
```

若希望 AI 只读现行事实，可在项目根增加简短 `AGENTS.md` / 更新 README「文档索引」，**仅指向 `docs/`**。

---

## 本次已落地的修复

| 修复 | 说明 |
|------|------|
| JWT `exp` 校验 | `src/core/auth.js` |
| 删除订阅清理 rules | `src/data/subscriptions.js` |
| 第三方 notify 绕过 JWT 门禁 | `src/api/router.js` |
| 列表 notes/category XSS 转义 | `src/views/adminPage.html` |
| 测试补全 | 见阶段三文件列表 |

### 未在本轮改代码的高优先级项（供你排期）

1. 备份 replace 强校验 + 更安全写入顺序  
2. 去掉 `window.fetch` 劫持，规则写入正规化  
3. `after_expiry` lastFire 持久化  
4. 默认密码强制修改  
5. 统一 API 错误 envelope + JSON 解析  

---

## 附录：模块风险热图（简）

```
auth/JWT          ████████░░  (exp 已修，默认密码仍在)
scheduler         ███████░░░  (after_expiry / 聚合日志)
backup restore    ████████░░  (replace)
admin XSS/劫持    █████░░░░░  (XSS 已修，劫持仍在)
channels          ████░░░░░░  (无 timeout)
currency          ███░░░░░░░
time              ██░░░░░░░░
```

---

*报告结束。修复与测试已提交本地 git 时请以 `git log` 为准。*
