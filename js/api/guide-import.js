export async function getGuideImportStatus() {
  const resp = await fetch('/_ai/status', { headers: { accept: 'application/json' } });
  if (!resp.ok) return { available: false, reason: 'STATUS_FAILED' };
  return resp.json();
}

export async function extractGuideText({ text, cityHint, signal }) {
  const resp = await fetch('/_ai/extract-guide', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ text, cityHint }),
    signal
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message = data?.message || 'AI 暂时不可用，请稍后重试。';
    throw new Error(message);
  }
  return data;
}
