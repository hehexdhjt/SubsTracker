// @ts-check
/**
 * Worker 入口（v3）
 *
 * - fetch handler：处理 HTTP 请求；首先确保 KV 数据已迁移到 v3 schema
 * - scheduled handler：每小时触发一次到期检查（cron 0 * * * * UTC）
 *
 * v3 起 schema 迁移由 src/data/migrate.js 自动完成（首次访问透明触发，幂等可重跑）。
 *
 * 后续 Task 7 会把 fetch handler 整体迁到 Hono 应用，本文件届时大幅简化。
 *
 * 维护人：v3 重构 (2026-05)
 */

import { handleApiRequest } from './api/router.js';
import { handleAdminRequest, handleLoginPage } from './api/admin.js';
import { handleDebug } from './api/debug.js';
import { checkExpiringSubscriptions } from './services/scheduler.js';
import { getUserFromRequest } from './api/handlers/auth.js';
import { ensureMigrations } from './data/migrate.js';

export default {
  async fetch(request, env, ctx) {
    // 透明迁移：v3 schema 不到位时先迁移再处理请求
    try {
      await ensureMigrations(env);
    } catch (err) {
      console.error('[index] 迁移失败，回退继续处理请求（用户会看到旧数据）:', err);
    }

    const url = new URL(request.url);

    if (url.pathname === '/') {
      const { user } = await getUserFromRequest(request, env);
      if (user) {
        return new Response('', {
          status: 302,
          headers: { Location: '/admin' }
        });
      }
      return handleLoginPage();
    } else if (url.pathname === '/debug') {
      // 调试页必须登录后才能访问，避免泄露系统信息
      const { user } = await getUserFromRequest(request, env);
      if (!user) {
        return new Response('未授权访问', {
          status: 401,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
      return handleDebug(request, env);
    } else if (url.pathname.startsWith('/api')) {
      return handleApiRequest(request, env);
    } else if (url.pathname.startsWith('/admin')) {
      return handleAdminRequest(request, env);
    } else {
      return handleLoginPage();
    }
  },

  async scheduled(event, env, ctx) {
    // Cron 触发也要确保迁移完成（首次部署后用户可能还没访问过页面）
    try {
      await ensureMigrations(env);
    } catch (err) {
      console.error('[index] scheduled 迁移失败:', err);
    }

    console.log(
      '[Workers] 定时任务触发',
      'cron:',
      event?.cron || '(unknown)',
      'UTC:',
      new Date().toISOString()
    );
    await checkExpiringSubscriptions(env);
  }
};
