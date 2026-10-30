export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export async function requestJson(url: string, options: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(url, { ...options, cache: 'no-store', signal: options.signal || AbortSignal.timeout(15000) }); }
  catch (error) { throw new ApiError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? '通信がタイムアウトしました。再読み込みしてください。' : 'ネットワークに接続できません。接続を確認して再読み込みしてください。'); }
  let data;
  try { data = await response.json(); } catch { throw new ApiError('サーバーから不正な応答がありました。再読み込みしてください。', response.ok ? 0 : response.status); }
  if (!response.ok) throw new ApiError(data?.message || `取得に失敗しました（HTTP ${response.status}）。`, response.status);
  return data;
}
export const postJson = (url: string, body: unknown) => requestJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
