import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import History from '../../src/app/history/page';
import Kds from '../../src/app/kds/page';
import Report from '../../src/app/report/page';
import OrderPage from '../../src/app/order/page';

const params = new URLSearchParams(window.location.search);
let readMode = params.get('read') || 'normal';
let writeMode = 'normal';
let account = params.get('account') || 'a';
const transport = window.fetch.bind(window);
// Real handlers use an isolated MongoDB. Only transport failures are simulated here.
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('External connections are disabled in this fixture');
  const write = init.method === 'PUT' || init.method === 'POST';
  const failure = !write && url.pathname !== '/api/me' && url.pathname !== '/api/settlements' ? readMode : write ? writeMode : 'normal';
  if (failure === '503') return Response.json({ message: 'テスト用HTTP 503' }, { status: 503 });
  if (failure === 'disconnect') throw new TypeError('Failed to fetch');
  if (failure === 'timeout') throw new DOMException('timeout', 'TimeoutError');
  if (failure === 'malformed') return new Response('{broken');
  const headers = new Headers(init.headers); headers.set('x-fixture-account', account);
  const response = await transport(url, { ...init, headers });
  if (failure === 'lost') throw new TypeError('Response lost after commit');
  if (failure === 'slow') await new Promise(resolve => setTimeout(resolve, 4000));
  return response;
};
function Fixture() {
  const [view, setView] = useState(params.get('view') || ({ '/history': '履歴', '/order': '注文', '/report': '日報', '/kds': 'KDS' }[window.location.pathname] || '履歴'));
  const [readFailure, setReadFailure] = useState(readMode);
  const [writeFailure, setWriteFailure] = useState(writeMode);
  const [revision, setRevision] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState(account);
  return <><nav className="relative z-[200] flex flex-wrap gap-3 bg-blue-900 p-3 text-sm text-white"><b>専用テストDB・本番接続なし</b>{['履歴', 'KDS', '日報', '注文'].map(name => <button key={name} onClick={() => setView(name)}>{name}</button>)}
    <label>取得モード<select className="bg-blue-900" value={readFailure} onChange={e => { readMode = e.target.value; setReadFailure(readMode); }}><option value="normal">正常</option><option value="503">503</option><option value="disconnect">切断</option><option value="timeout">タイムアウト</option><option value="malformed">不正応答</option><option value="slow">遅延4秒</option></select></label>
    <label>更新モード<select className="bg-blue-900" value={writeFailure} onChange={e => { writeMode = e.target.value; setWriteFailure(writeMode); }}><option value="normal">正常</option><option value="503">503</option><option value="lost">更新後の応答消失</option></select></label>
    <label>アカウント<select className="bg-blue-900" value={selectedAccount} onChange={e => { account = e.target.value; setSelectedAccount(account); setRevision(n => n + 1); }}><option value="a">A</option><option value="b">B</option></select></label>
    <button onClick={() => void transport('/fixture/price', { method: 'POST' })}>テスト価格＋100円</button>
  </nav><main key={revision}>{view === '履歴' ? <History /> : view === 'KDS' ? <Kds /> : view === '日報' ? <Report /> : <OrderPage />}</main></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
