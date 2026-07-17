import { tokenizeQuery } from './tokenizer.js';
import { getGuide } from './store.js';

export function retrieveGuides(bm25Index, queryText, { topK = 3, maxSnippetLength = 500 } = {}) {
  if (!queryText || bm25Index.docCount === 0) return [];

  const tokens = tokenizeQuery(queryText);
  if (tokens.length === 0) return [];

  const results = bm25Index.search(tokens, { topK: topK * 2 });
  if (!results.length) return [];

  const formatted = [];
  for (const result of results) {
    const guide = getGuide(result.docId);
    if (!guide || guide.deleted) continue;

    formatted.push({
      id: result.docId,
      score: result.score,
      city: guide.city,
      guideType: guide.guide_type,
      snippet: guide.source_text.substring(0, maxSnippetLength)
    });
    if (formatted.length >= topK) break;
  }

  return formatted;
}

export function formatRetrievedContext(results) {
  if (!results.length) return '';

  const sections = results.map((r, i) => {
    const city = r.city || '未知';
    const type = r.guideType || '未知';
    return `【参考攻略${i + 1}】城市:${city} 类型:${type}\n${r.snippet}`;
  });

  const header =
    '## 参考攻略（系统检索）\n' +
    '以下内容来自系统检索到的相似攻略，仅供辅助提取参考，请勿直接复制其中的地点到结果中：\n\n';

  return header + sections.join('\n---\n') + '\n';
}
