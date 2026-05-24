# v2 → v3 迁移指南

本文档面向 SubsTracker v2 的现有用户，说明升级到 v3 的全流程、数据兼容性、回滚方法。

---

## 一句话版本

```bash
git pull
npm install
npm run deploy:safe
```

部署后第一次访问任意页面，KV 数据会自动从 v2 结构迁移到 v3。**老数据不会丢**，旧 `subscriptions` Key 改名为 `subscriptions_v2_backup` 保留 7 天可回滚。

---

## 自动迁移做了什么

迁移由 `src/data/migrate.js` 控制，分 3 个 step，每个 step 幂等：

| Step ID | 描述 | 目标 KV Key |
|---------|------|-------------|
| `subscriptions_v3` | 把单 Key `subscriptions` 数组拆成 `sub:{id}` + `sub_index` | 新 Key 全部生成；旧 Key 改名 `subscriptions_v2_backup` (TTL 7 天) |
| `reminder_rules_v3` | 把订阅自带的 `reminderUnit/reminderValue` 转成 1 条等价 `before_expiry` 规则 | `reminder_rules:{subId}` |
| `scheduler_logs_v3` | 把旧 `scheduler_status_history` 合并到新结构化日志 | `sched_log:{iso}` (TTL 30 天) |

完成后写入 `schema_version = "v3"` 标志位。已迁移的 Worker 实例命中内存缓存，后续请求几乎零开销。

---

## 升级前后行为差异

### 1. `NOTIFICATION_HOURS` 语义变了 ⚠️

| 版本 | 含义 |
|------|------|
| v2 | 按 **UTC 小时**解释。例：北京时间 08:00 = UTC 00:00，需填 `00` |
| v3 | 按 **配置的 TIMEZONE 解释**。例：`TIMEZONE=Asia/Shanghai` 时，想北京 08:00 直接填 `08` |

**升级后请到配置页根据实时预览重新调整**——配置页底部会显示"当前你所在时区是 17:30 ✓ 在通知时段内"。

### 2. 新建订阅默认 4 条提醒规则

新建订阅时不传 `reminderRules` 字段会自动应用：

- 到期前 7 天
- 到期前 3 天
- 到期前 1 天
- 到期当天

不想要某些可在编辑界面去勾选。**老订阅不受影响**（迁移仅生成 1 条等价规则）。

### 3. 旧 `reminderUnit/reminderValue` 字段保留兼容

调用方仍可发 v2 单点提醒字段（POST /api/subscriptions），后端在写入时会同时建一条等价规则；列表查询返回的对象仍包含这两个字段。

### 4. 调度状态读取位置变了

| 数据 | v2 KV Key | v3 KV Key |
|------|-----------|-----------|
| 上次调度状态 | `scheduler_status` | (废弃) |
| 调度历史 | `scheduler_status_history`（数组，最多 20 条） | `sched_log:{iso}`（按 ISO 排序，30 天 TTL） |
| 通知发送日志 | （无） | `notify_log:{...}`（30 天 TTL） |

仪表盘前端继续读旧字段名，后端 handler 自动转换。

---

## 回滚方法

### 方案 A：版本回滚（如果 v3 部署有问题）

```bash
git checkout master
npm install
npm run deploy:safe
```

注意：v3 已经写入了新 KV Key 结构，`master` 的 v2 代码会读取旧 `subscriptions` Key。在 7 天 TTL 内 v2 仍能读到原数据（因为旧 Key 改名为 `subscriptions_v2_backup`，回滚需要手动改回）：

```bash
# 在 Cloudflare Dashboard 的 KV 控制台执行
# 1. 复制 subscriptions_v2_backup 的值
# 2. 写入 subscriptions（删除新创建的 sub_index、sub:* 等）
```

### 方案 B：手动恢复一条订阅

如果只是某条订阅数据异常，可在 KV 控制台读 `sub:{id}` 修正后写回。`sub_index` 是 ID 列表 JSON 数组，加/删 ID 后整体写回。

### 方案 C：完全重置

```bash
# 在 Cloudflare Dashboard KV 中删除：
# - schema_version
# - migrate:subscriptions_v3 / reminder_rules_v3 / scheduler_logs_v3
# - sub_index, sub:*
# - reminder_rules:*
# 保留 config（管理员凭据 + 通知渠道配置）和 subscriptions_v2_backup
# 然后访问页面 → 重新触发迁移
```

---

## 升级检查清单

升级到 v3 后建议跑一遍：

- [ ] 登录后台，确认订阅列表完整（数量与 v2 一致）
- [ ] 访问 `/debug`，看"时区诊断"区块——`TIMEZONE` 显示的是不是你期望的时区？
- [ ] 访问配置页，调整 `NOTIFICATION_HOURS`（v2 的 UTC 小时已无效）
- [ ] 编辑一条订阅，看到 4 条预设规则（迁移生成 1 条 + 用户可加新的）
- [ ] 测试一个通知渠道（配置页"测试发送"按钮）
- [ ] 等下一个 cron tick，去 `/admin/notify-logs` 看是否有日志写入

---

## FAQ

**Q：升级后老用户还能继续工作吗？**
A：能。所有 v2 API 路径、响应结构、配置字段都保留；只是新增了能力。

**Q：如果迁移过程中 Worker 崩了？**
A：迁移本身是幂等的，下次请求会自动重试（`schema_version` 没标记前不会跳过）。`migration_lock` Key TTL 60s，避免并发触发双跑。

**Q：KV 写入次数会暴涨吗？**
A：通知日志 30 天 TTL 自动清理；调度日志同 30 天。通常每天最多 ~24 条 sched_log + N 条 notify_log。CF 免费版 1000/d 写次数足够单用户使用。

**Q：能不迁移吗？**
A：不能。v3 代码假设新 KV 结构。如果坚持用 v2，请保留 master 分支不要 `git pull`。
