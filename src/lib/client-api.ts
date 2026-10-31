export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export async function requestJson(url: string, options: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError('通信がタイムアウトしました。登録済みの可能性があるため、結果を確認してください。'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([readResponse(url, { ...options, signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer!);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function readResponse(url: string, options: RequestInit) {
  let response: Response;
  try { response = await fetch(url, { ...options, cache: 'no-store' }); }
  catch (error) { throw new ApiError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? '通信がタイムアウトしました。再読み込みしてください。' : 'ネットワークに接続できません。接続を確認して再読み込みしてください。'); }
  let data;
  try { data = await response.json(); } catch { throw new ApiError('サーバーから不正な応答がありました。再読み込みしてください。', response.ok ? 0 : response.status); }
  if (!response.ok) throw new ApiError(data?.message || `取得に失敗しました（HTTP ${response.status}）。`, response.status);
  return data;
}
export const postJson = (url: string, body: unknown) => requestJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
