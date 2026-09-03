process.env.RAG_ENABLED = 'false';

const { app } = await import('../server/index.js');
const statusResponse = await app.request('/_ai/status');
const status = await statusResponse.json();
if (!status.available) throw new Error(`DeepSeek live smoke unavailable: ${status.reason}`);

const response = await app.request('/_ai/extract-guide', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    cityHint: '杭州',
    text: '杭州两日游攻略：第一天上午游览西湖断桥和白堤，中午在湖滨用餐，下午前往灵隐寺，晚上逛河坊街。第二天上午参观中国茶叶博物馆，下午到西溪湿地散步。'
  })
});
const result = await response.json();
if (!response.ok || !result.city || !Array.isArray(result.events) || !result.events.length) {
  throw new Error(
    `DeepSeek live smoke failed: HTTP ${response.status} ${result.error || ''}`.trim()
  );
}
console.log(`DeepSeek live smoke passed: city=${result.city}; events=${result.events.length}.`);
