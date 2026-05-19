async function sendBarkNotification(title, content, config) {
  try {
    if (!config.BARK_DEVICE_KEY && !config.BARK_SERVER) {
      console.error('[Bark] 通知未配置，缺少设备Key或服务器地址');
      return false;
    }

    const serverUrl = (config.BARK_SERVER || 'https://api.day.app').replace(/\/+$/, '');

    // 判断是否为自定义完整 URL（路径中包含设备Key，如 bark-worker 格式）
    let url;
    let payload;
    const parsedPath = new URL(serverUrl).pathname;
    const isCustomUrl = parsedPath && parsedPath !== '/';

    if (isCustomUrl) {
      // 自定义服务器：直接 POST 到完整 URL
      url = serverUrl;
      payload = { title, body: content };
      console.log('[Bark] 使用自定义服务器URL发送通知');
    } else {
      // 标准 Bark API
      if (!config.BARK_DEVICE_KEY) {
        console.error('[Bark] 通知未配置，缺少设备Key');
        return false;
      }
      url = serverUrl + '/push';
      payload = { title, body: content, device_key: config.BARK_DEVICE_KEY };
      console.log('[Bark] 开始发送通知到设备: ' + config.BARK_DEVICE_KEY);
    }

    if (config.BARK_IS_ARCHIVE === 'true') {
      payload.isArchive = 1;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('[Bark] 发送结果:', result);

    return result.code === 200;
  } catch (error) {
    console.error('[Bark] 发送通知失败:', error);
    return false;
  }
}

export { sendBarkNotification };
