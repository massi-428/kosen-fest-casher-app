import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

const { createPoller, startBrowserPolling } = createLoader()('src/lib/polling.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
function timers(t) {
  const pending = new Map(); let id = 0;
  t.mock.method(globalThis, 'setTimeout', (fn, delay) => { pending.set(++id, { fn, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', key => pending.delete(key));
  return pending;
}

test('slow reads and repeated clicks share one request; mutation queues one fresh read', async t => {
  const pending = timers(t); const finish = []; let calls = 0;
  const poller = createPoller(() => { calls++; return new Promise(resolve => finish.push(resolve)); }, { random: () => 0 });
  const first = poller.refresh();
  await flush();
  assert.equal(pending.size, 0, 'no interval while a request is pending');
  for (let i = 0; i < 20; i++) assert.equal(poller.refresh(), first);
  poller.refresh(true); poller.refresh(true);
  finish.shift()(true); await flush();
  assert.equal(calls, 2);
  finish.shift()(true); await first;
  assert.equal(pending.size, 1);
  assert.equal([...pending.values()][0].delay, 5000);
  poller.stop(); assert.equal(pending.size, 0);
});

test('failure backoff is bounded and success restores normal polling', async t => {
  const pending = timers(t); let success = false;
  const poller = createPoller(async () => success, { random: () => 0 });
  for (const delay of [10000, 20000, 30000, 30000]) {
    await poller.refresh(); assert.equal([...pending.values()][0].delay, delay);
  }
  success = true; await poller.refresh();
  assert.equal([...pending.values()][0].delay, 5000);
  poller.stop();
});

test('stop before startup issues no request; pause aborts and resume refreshes', async t => {
  timers(t); let calls = 0; const signals = []; let finish;
  const task = signal => { calls++; signals.push(signal); return new Promise(resolve => { finish = resolve; }); };
  const stopped = createPoller(task);
  const skipped = stopped.refresh(); stopped.stop(); await skipped;
  assert.equal(calls, 0);
  const poller = createPoller(task);
  const request = poller.refresh(); await flush(); poller.pause();
  assert.equal(signals[0].aborted, true);
  poller.resume(); finish(false); await flush();
  assert.equal(calls, 2); assert.equal(signals[1].aborted, false);
  finish(true); await request; poller.stop();
});

test('hidden and offline tabs stop polling and recover on visibility/online events', async t => {
  const pending = timers(t);
  const doc = new EventTarget(); doc.visibilityState = 'hidden';
  const win = new EventTarget();
  for (const [key, value] of Object.entries({ document: doc, window: win, navigator: { onLine: true } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
  }
  let calls = 0;
  const poller = startBrowserPolling(async () => { calls++; return true; });
  await flush(); assert.equal(calls, 0);
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
  await flush(); assert.equal(calls, 1);
  navigator.onLine = false; win.dispatchEvent(new Event('offline')); assert.equal(pending.size, 0);
  navigator.onLine = true; win.dispatchEvent(new Event('online')); await flush(); assert.equal(calls, 2);
  poller.stop(); win.dispatchEvent(new Event('online')); await flush(); assert.equal(calls, 2);
});
