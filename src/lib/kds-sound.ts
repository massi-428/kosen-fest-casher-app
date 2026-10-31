export const KDS_SOUNDS = ['/audio/maou_se_system46.wav', '/audio/nc245960.wav', '/audio/screen-recording.m4a'] as const;

export function selectKitchenSound(random = Math.random()) {
  return random < 0.98 ? KDS_SOUNDS[0] : random < 0.99 ? KDS_SOUNDS[1] : KDS_SOUNDS[2];
}

// The first successful snapshot is a baseline, not a batch of new orders.
export function createKitchenOrderTracker() {
  const seen = new Set<string>();
  let startedAt: number | null = null;
  return (orders: { _id: string; createdAt: string }[], now = Date.now()) => {
    const fresh = startedAt === null ? [] : orders.filter(order => !seen.has(order._id) && new Date(order.createdAt).getTime() >= startedAt!);
    for (const order of orders) seen.add(order._id);
    if (startedAt === null) startedAt = now;
    return fresh;
  };
}

export function createKitchenSoundPlayer() {
  let context: AudioContext | null = null;
  let enabled = false;
  let nextTime = 0;
  const buffers = new Map<string, AudioBuffer>();
  const sources = new Set<AudioBufferSourceNode>();
  return {
    async enable() {
      context ??= new AudioContext();
      const current = context;
      // Resume immediately within the button gesture, before fetching files.
      await current.resume();
      await Promise.all(KDS_SOUNDS.map(async path => {
        if (buffers.has(path)) return;
        const response = await fetch(path);
        if (!response.ok) throw new Error('音源を読み込めません。');
        buffers.set(path, await current.decodeAudioData(await response.arrayBuffer()));
      }));
      if (current.state !== 'running') throw new Error('音声を有効にできません。もう一度押してください。');
      enabled = true;
    },
    play() {
      if (!enabled || !context) return;
      if (context.state !== 'running') throw new Error('通知音が停止しています。再度有効にしてください。');
      const buffer = buffers.get(selectKitchenSound());
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      sources.add(source);
      source.onended = () => { sources.delete(source); source.disconnect(); };
      const start = Math.max(context.currentTime, nextTime);
      source.start(start);
      nextTime = start + buffer.duration;
    },
    disable() {
      enabled = false;
      for (const source of sources) source.stop();
      sources.clear();
      nextTime = 0;
    },
    dispose() {
      enabled = false;
      void context?.close().catch(() => {});
      context = null;
      sources.clear();
    },
  };
}
