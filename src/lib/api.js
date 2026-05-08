import { PUBLIC_API_BASE_URL } from '$env/static/public';

/** @type {string} */
//const API_BASE = ${PUBLIC_API_BASE_URL};
const API_BASE = PUBLIC_API_BASE_URL.replace(/\/$/, '');

/**
 * @param {string} situation
 * @returns {Promise<import('./types').AnalyzeResult>}
 */
export async function analyze(situation) {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ situation }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `API 錯誤 ${res.status}`);
  }

  return res.json();
}

/**
 * Stream an analysis request via SSE.
 * @param {string} situation
 * @param {(stage: string) => void} onStage  called each time progress stage changes
 * @param {(result: object) => void} onDone  called with the final parsed result
 * @param {(msg: string) => void} onError   called on error
 * @param {boolean} [expand]  if true, request full output (strategy_table, reactions, etc.)
 */
export async function analyzeStream(situation, onStage, onDone, onError, expand = false) {
  let res;
  try {
    res = await fetch(`${API_BASE}/analyze/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ situation, expand }),
    });
  } catch (e) {
    onError(e.message || '網路連線失敗');
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    onError(err.detail || `API 錯誤 ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete last line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (event.error) { onError(event.error); return; }
      if (event.stage) { onStage(event.stage); }
      if (event.done)  { onDone(event.result); return; }
    }
  }
}
