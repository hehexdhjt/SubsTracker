# SubsTracker - 订阅管理与提醒系统

基于Cloudflare Workers的轻量级订阅管理系统，帮助您轻松跟踪各类订阅服务的到期时间，并通过Telegram,企业微信等发送及时提醒。

![image](https://github.com/user-attachments/assets/22ff1592-7836-4f73-aa13-24e9d43d7064)

## ✨ 功能特色

### 🎯 核心功能
- **订阅管理**：添加、编辑、删除各类订阅服务
- **智能提醒**：自定义提前提醒天数，自动续订计算
- **农历显示**：支持农历日期显示，可控制开关
- **状态管理**：订阅启用/停用，过期状态自动识别

### 📱 多渠道通知
- **Telegram**：支持 Telegram Bot 通知
- **NotifyX**：集成 NotifyX 推送服务
- **企业微信应用通知**：支持企业微信应用推送
- **企业微信机器人**：支持企业微信群机器人通知
- **邮件通知**：基于 Resend 的专业邮件服务
- **自定义 Webhook**：支持自定义请求格式和模板

### 🌙 农历功能
- **农历转换**：支持 1900-2100 年农历转换
- **智能显示**：列表和编辑页面可控制农历显示
- **通知集成**：通知消息中可包含农历信息

### 🎨 用户体验
- **响应式设计**：完美适配桌面端和移动端
- **备注优化**：长备注自动截断，悬停显示完整内容
- **实时预览**：日期选择时实时显示对应农历
- **用户偏好**：记住用户的显示偏好设置

## 🚀 一键部署

### 点击按钮，一键部署到 CloudFlare Workers,

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wangwangit/SubsTracker)


> 适用于新部署的,以前部署过的直接替换js中的内容即可!

## 📋 三步开始使用

### 1️⃣ 一键部署
Fork仓库,然后点击自己仓库里的部署按钮，等待部署完成,**注意,KV名称修改为 `SUBSCRIPTIONS_KV`**
![image.png](https://img.wangwangit.com/file/1751942578108_image.png)

### 2️⃣ 首次登录
- 访问部署后的域名
- 默认用户名：`admin`
- 默认密码：`password`

### 3️⃣ 开始使用
1. **修改默认密码**（进入系统配置）
2. **配置通知渠道**（选择一个或多个）
3. **添加订阅**，设置提醒
4. **享受智能提醒**！

## 🔧 通知渠道配置

### Telegram
- **Bot Token**: 从 [@BotFather](https://t.me/BotFather) 获取
- **Chat ID**: 从 [@userinfobot](https://t.me/userinfobot) 获取

### NotifyX
- **API Key**: 从 [NotifyX官网](https://www.notifyx.cn/) 获取

### 邮件通知 (Resend)
- **API Key**: 从 [Resend官方教程](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/) 获取
- **发件人邮箱**: 必须是已在Resend验证的域名邮箱
- **收件人邮箱**: 接收通知的邮箱地址
- 支持HTML格式的美观邮件模板

### 企业微信应用通知
- **推送 URL**: 从 [企业微信应用通知平台](https://push.996007.icu) 获取
- 支持自定义请求头和消息模板

### 企业微信机器人
- **推送 URL**: 参考[官方文档](https://developer.work.weixin.qq.com/document/path/91770)获取


> 💡 **提示**: 系统默认每天早上8点自动检查即将到期的订阅


**欢迎大家关注我的公众号**

![39d8d5a902fa1eee6cbbbc8a0dcff4b](https://github.com/user-attachments/assets/96bae085-4299-4377-9958-9a3a11294efc)



## 🚀 手动部署指南

### 前提条件

- Cloudflare账户
- Telegram Bot (用于发送通知)
- 可以直接将代码丢给AI,帮助查漏补缺

### 部署步骤

1.登陆cloudflare,创建worker,粘贴本项目中的js代码,点击部署

![image](https://github.com/user-attachments/assets/ff4ac794-01e1-4916-b226-1f4f604dcbd3)


2.创建KV键值 **SUBSCRIPTIONS_KV**

![image](https://github.com/user-attachments/assets/c9ebaf3e-6015-4400-bb0a-1a55fd5e14d2)


3.给worker绑定上键值对,以及设置定时执行时间!

![image](https://github.com/user-attachments/assets/25b663b3-8e8e-4386-a499-9b6bf12ead76)


4.打开worker提供的域名地址,输入默认账号密码: admin  password (或者admin admin123),可以在代码中查看默认账号密码!

![image](https://github.com/user-attachments/assets/5dac1ce0-43a3-4642-925c-d9cf21076454)


5.前往系统配置,修改账号密码,以及配置tg通知的信息

![image](https://github.com/user-attachments/assets/f6db2089-28a1-439d-9de0-412ee4b2807f)


6.配置完成可以点击测试通知,查看是否能够正常通知,然后就可以正常添加订阅使用了!

![image](https://github.com/user-attachments/assets/af530379-332c-4482-9e6e-229a9e24775e)

## 🤝 贡献

欢迎贡献代码、报告问题或提出新功能建议!

## 📜 许可证

MIT License

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=wangwangit/SubsTracker&type=Date)](https://www.star-history.com/#wangwangit/SubsTracker&Date)

