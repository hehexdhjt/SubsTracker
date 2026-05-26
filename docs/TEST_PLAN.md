# SubsTracker 测试文档

> 版本: 3.0.0 | 更新时间: 2026-05-27
> 本文档记录功能测试用例，供后续新增功能后回归验证。

---

## 测试环境

- **本地开发服务器**: `wrangler dev --port 8787`
- **默认账号**: admin / password
- **时区配置**: Asia/Shanghai (UTC+8)
- **测试工具**: curl + vitest

---

## 一、单元测试 (vitest)

```bash
npx vitest run
```

**当前状态**: 177 个测试全部通过（11 个测试文件）

| 测试文件 | 测试数 | 覆盖范围 |
|---------|--------|---------|
| tests/core/time.test.js | 24 | 时区转换、日期计算、格式化 |
| tests/services/notify/reminder-engine.test.js | 18 | 提醒规则触发判断 |
| tests/services/scheduler.test.js | 12 | 定时调度器 |
| tests/data/migrate.test.js | 17 | 数据迁移 |
| tests/services/notify/channels.test.js | 35 | 通知渠道 (含 Bark Auth) |
| tests/api/extras-routes.test.js | 14 | 版本/分类/下次提醒 API |
| 其他 | 57 | 数据层、兼容性等 |

---

## 二、API 功能测试

### 2.1 登录认证

```bash
# 登录
curl -s -X POST http://localhost:8787/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'

# 期望: {"success": true} + Set-Cookie: token=xxx
```

### 2.2 配置管理

```bash
# 获取配置
curl -s http://localhost:8787/api/config \
  -H "Cookie: token=$TOKEN"

# 期望: 返回完整配置对象，TIMEZONE = "Asia/Shanghai"
```

### 2.3 版本号 (Issue #168)

```bash
curl -s http://localhost:8787/api/version \
  -H "Cookie: token=$TOKEN"

# 期望: {"success": true, "version": "3.0.0"}
```

### 2.4 分类管理 (Issue #171)

```bash
# 获取分类列表
curl -s http://localhost:8787/api/categories \
  -H "Cookie: token=$TOKEN"
# 期望: {"success": true, "categories": []}

# 添加分类
curl -s -X POST http://localhost:8787/api/categories \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$TOKEN" \
  -d '{"name":"流媒体"}'
# 期望: {"success": true}

# 验证分类已保存
curl -s http://localhost:8787/api/categories \
  -H "Cookie: token=$TOKEN"
# 期望: {"success": true, "categories": ["流媒体"]}
```

### 2.5 订阅 CRUD

```bash
# 创建订阅
curl -s -X POST http://localhost:8787/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$TOKEN" \
  -d '{
    "name": "Netflix",
    "expiryDate": "2026-12-31T00:00:00Z",
    "category": "流媒体",
    "periodValue": 1,
    "periodUnit": "month"
  }'
# 期望: 创建成功，category 自动保存到分类列表

# 获取订阅列表
curl -s http://localhost:8787/api/subscriptions \
  -H "Cookie: token=$TOKEN"
# 期望: 返回订阅数组

# 更新订阅
curl -s -X PUT http://localhost:8787/api/subscriptions/$SUB_ID \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$TOKEN" \
  -d '{"name":"Netflix Premium","expiryDate":"2026-12-31T00:00:00Z","category":"流媒体"}'
# 期望: 更新成功

# 删除订阅
curl -s -X DELETE http://localhost:8787/api/subscriptions/$SUB_ID \
  -H "Cookie: token=$TOKEN"
# 期望: {"success": true}
```

### 2.6 下次提醒时间 (Issue #170)

```bash
curl -s http://localhost:8787/api/subscriptions/$SUB_ID/next-reminder \
  -H "Cookie: token=$TOKEN"
# 期望: 
# {
#   "success": true,
#   "nextReminder": {
#     "ruleId": "xxx",
#     "type": "before_expiry",
#     "value": 7,
#     "unit": "days",
#     "nextFireTime": "2026-12-24T00:00:00.000Z"
#   },
#   "allUpcoming": [...]
# }
```

### 2.7 Bark 自定义认证 (Issue #169)

```bash
# 配置带认证的 Bark 服务器
curl -s -X POST http://localhost:8787/api/config \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$TOKEN" \
  -d '{"BARK_SERVER":"https://admin:password@my-bark.example/MYKEY"}'

# 测试 Bark 通知
curl -s -X POST http://localhost:8787/api/test-notification \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$TOKEN" \
  -d '{"channel":"bark"}'
# 期望: 发送成功，Authorization header 包含 Basic 认证
```

---

## 三、时区功能验证 (Issue #166)

### 3.1 凌晨创建订阅

**场景**: 北京时间 2026-05-27 01:00 (UTC 2026-05-26 17:00) 创建订阅

```bash
# 模拟：创建一个到期日为"今天"的订阅
curl -s -X POST http://localhost:8787/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$TOKEN" \
  -d '{"name":"时区测试","expiryDate":"2026-05-27T00:00:00Z","category":"测试"}'
```

**期望行为**:
- 到期日在北京时间显示为 2026-05-27 08:00
- 剩余天数显示为 0（不是 -1）

### 3.2 跨日判断

**验证方法**: 检查 scheduler.js 中 `getDaysBetween` 的行为

```javascript
// UTC 2026-05-26 17:00 = 北京 2026-05-27 01:00
// 到期日 UTC 2026-05-27 00:00 = 北京 2026-05-27 08:00
// getDaysBetween 应返回 0（同一天在北京时区下）
```

---

## 四、前端手动测试清单

打开浏览器访问 `http://localhost:8787`

### 4.1 登录页面
- [ ] 页面正常加载，无 JS 错误
- [ ] 输入 admin/password 可以登录
- [ ] 错误密码显示错误提示
- [ ] 登录成功跳转到 /admin

### 4.2 订阅列表页
- [ ] 订阅列表正常显示
- [ ] 到期日显示为用户时区（北京时间）
- [ ] 剩余天数计算正确
- [ ] 分类标签显示正确

### 4.3 创建订阅
- [ ] 表单正常加载
- [ ] 分类输入框有自动补全（基于已保存的分类）
- [ ] 创建带分类的订阅后，分类自动保存
- [ ] 到期日在北京时间下计算正确

### 4.4 配置页
- [ ] 时区配置正常显示
- [ ] 版本号显示在页面底部

### 4.5 通知历史页
- [ ] 页面正常加载
- [ ] 日志列表正常显示

---

## 五、已知问题 & 注意事项

1. **Bark 认证 URL**: 密码中如果包含 `@` 字符，需要 URL 编码为 `%40`
2. **时区**: 所有日期存储为 UTC，显示时转换为用户配置的时区
3. **分类自动补全**: 后端 API 已就绪，前端需要配合实现下拉框

---

## 六、回归测试检查项

新增功能后，必须验证以下核心功能不受影响：

| # | 检查项 | 测试方法 |
|---|--------|---------|
| 1 | 登录/登出 | curl 测试 |
| 2 | 订阅 CRUD | curl 测试 |
| 3 | 时区转换 | 创建订阅 + 检查显示 |
| 4 | 提醒规则 | vitest run |
| 5 | 通知渠道 | vitest run |
| 6 | 数据迁移 | vitest run |
| 7 | 新 API | curl 测试 |

---

## 七、测试数据清理

测试完成后清理 KV 中的测试数据：

```bash
# 删除测试订阅
curl -s -X DELETE http://localhost:8787/api/subscriptions/$SUB_ID \
  -H "Cookie: token=$TOKEN"

# 或者重启 wrangler dev（本地开发会自动清空 KV）
```
