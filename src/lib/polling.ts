type PollingOptions = {
  intervalMs?: number;
  maxDelayMs?: number;
  random?: () => number;
};

// One request at a time, including manual refreshes. Mutations can request a
// trailing refresh so a response started before the mutation is not the last one.
export function createPoller(task: (signal: AbortSignal) => Promise<boolean>, options: PollingOptions = {}) {
  const interval = options.intervalMs ?? 5000;
  const maximum = options.maxDelayMs ?? 30000;
  const random = options.random ?? Math.random;
  let stopped = false;
  let paused = false;
  let failures = 0;
  let trailing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let running: Promise<void> | undefined;
  const clear = () => { clearTimeout(timer); timer = undefined; };

  const refresh = (afterCurrent = false): Promise<void> => {
    if (stopped || paused) return Promise.resolve();
    clear();
    if (running) {
      if (afterCurrent) trailing = true;
      return running;
    }
    // Defer execution until running has been assigned, including synchronous tasks.
    running = Promise.resolve().then(async () => {
      do {
        if (stopped || paused) return;
        trailing = false;
        controller = new AbortController();
        let ok = false;
        try { ok = await task(controller.signal); } catch { /* Retry reads only. */ }
        if (!controller.signal.aborted) failures = ok ? 0 : Math.min(failures + 1, 6);
      } while (trailing && !stopped && !paused);
    }).finally(() => {
      running = undefined;
      if (!stopped && !paused) {
        const delay = Math.min(maximum, interval * 2 ** failures);
        timer = setTimeout(() => { void refresh(); }, delay + Math.floor(random() * 1000));
      }
    });
    return running;
  };

  return {
    refresh,
    pause() { paused = true; trailing = false; clear(); controller?.abort(); },
    resume() { paused = false; return refresh(true); },
    stop() { stopped = true; trailing = false; clear(); controller?.abort(); },
  };
}

export function startBrowserPolling(task: (signal: AbortSignal) => Promise<boolean>, options: PollingOptions = {}) {
  const poller = createPoller(task, options);
  const sync = () => {
    if (document.visibilityState === 'hidden' || !navigator.onLine) poller.pause();
    else void poller.resume();
  };
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
  return {
    refresh: poller.refresh,
    stop() {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      poller.stop();
    },
  };
}
