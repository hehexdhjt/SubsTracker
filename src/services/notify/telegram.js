// @ts-check
/**
 * Telegram 通知渠道
 *
 * 接口：MarkdownV2 + 失败时降级纯文本兜底。
 * 关键修复（#81）：订阅名含 `_*` 等特殊字符时不再炸。
 */
import { escapeMarkdownV2, ok, fail, errorMessage } from './channel.js';

/** @type {import('./channel.js').Channel} */
export const telegramChannel = {
  name: 'telegram',

  validateConfig(config) {
    if (!config.TG_BOT_TOKEN) return { ok: false, error: '缺少 TG_BOT_TOKEN' };
    if (!config.TG_CHAT_ID) return { ok: false, error: '缺少 TG_CHAT_ID' };
    return { ok: true };
  },

  async send(payload, config) {
    const v = telegramChannel.validateConfig(config);
    if (!v.ok) return fail('telegram', v.error || '配置无效');

    const url = `https://api.telegram.org/bot${config.TG_BOT_TOKEN}/sendMessage`;
    const fullText = payload.title
      ? `*${payload.title}*\n\n${payload.content}`
      : String(payload.content || '');
    const escaped = escapeMarkdownV2(fullText);

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.TG_CHAT_ID,
          text: escaped,
          parse_mode: 'MarkdownV2'
        })
      });
      const result = await r.json();

      if (result.ok) return ok('telegram', result);

      // 兜底：MarkdownV2 仍解析失败时降级纯文本
      if (result.description && /parse entities/i.test(result.description)) {
        const r2 = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: config.TG_CHAT_ID, text: fullText })
        });
        const result2 = await r2.json();
        return result2.ok
          ? ok('telegram', result2)
          : fail('telegram', `Telegram 拒绝: ${result2.description || '未知'}`, result2);
      }

      return fail('telegram', `Telegram 拒绝: ${result.description || '未知'}`, result);
    } catch (err) {
      return fail('telegram', errorMessage(err));
    }
  },

  async test(config) {
    return telegramChannel.send(
      {
        title: '订阅管理 - 测试通知',
        content: '这是一条来自订阅管理系统的测试消息。如果你收到此消息，说明 Telegram 配置正常。'
      },
      config
    );
  }
};

/**
 * 旧的导出函数：调用方传 `*title*\n\n...` 拼好的 message。
 *
 * @deprecated 新代码请用 telegramChannel.send
 * @param {string} message
 * @param {any} config
 * @returns {Promise<boolean>}
 */
export async function sendTelegramNotification(message, config) {
  // 旧调用方传入的 message 已经是组合好的 `*title*\n\ncontent`
  // 这里把它整体作为 content，title 留空避免重复加包装
  const r = await telegramChannel.send({ title: '', content: message }, config);
  if (!r.success) console.error('[Telegram]', r.error);
  return r.success;
}

export { escapeMarkdownV2 };
