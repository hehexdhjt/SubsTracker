// @ts-check
/**
 * Vitest 配置文件
 *
 * 用 @cloudflare/vitest-pool-workers 把单测跑在真实的 workerd 运行时里，
 * 这样 KV / fetch / crypto.subtle 等 Cloudflare 平台 API 不需要 mock 即可工作。
 *
 * 用法：
 *   npm test          # 跑一次（CI）
 *   npm run test:watch # watch 模式
 */
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['tests/**/*.test.js'],
    poolOptions: {
      workers: {
        // 测试环境最小 worker 配置：仅声明 KV 绑定供 repo 单测用
        miniflare: {
          compatibilityDate: '2024-09-23',
          compatibilityFlags: ['nodejs_compat'],
          kvNamespaces: ['SUBSCRIPTIONS_KV']
        }
      }
    }
  }
});
