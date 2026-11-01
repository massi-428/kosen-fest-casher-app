type SummaryOrder = { status: string; items: { productId?: string; productName: string; quantity: number }[] };

export function splitKitchenOrder(order: { items: { productName: string; quantity: number; selectedOptions?: { name: string }[]; detail?: string }[]; note?: string }, columns: number, rows: number) {
  const entries = order.items.flatMap(item => [
    { text: item.productName + (item.quantity === 1 ? '' : ` ×${item.quantity}`), kind: 'product' },
    ...(item.selectedOptions?.length ? [{ text: item.selectedOptions.map(option => option.name).join(' / '), kind: 'option' }] : []),
    ...(item.detail ? [{ text: `メモ: ${item.detail}`, kind: 'note' }] : []),
  ]);
  if (order.note) entries.push({ text: `注文メモ: ${order.note}`, kind: 'note' });
  const lines = entries.flatMap(entry => wrapKitchenText(entry.text, columns).map(text => ({ text, kind: entry.kind })));
  const chunks: typeof lines[] = [];
  const capacity = Math.max(1, Math.floor(rows));
  for (let index = 0; index < lines.length; index += capacity) chunks.push(lines.slice(index, index + capacity));
  return chunks.length ? chunks : [[]];
}

export function summarizeKitchenOrders(orders: SummaryOrder[]) {
  const totals = new Map<string, { key: string; name: string; active: number; pending: number }>();
  for (const order of orders) {
    if (order.status !== 'active' && order.status !== 'pending') continue;
    for (const item of order.items) {
      const key = item.productId || item.productName;
      const row = totals.get(key) || { key, name: item.productName, active: 0, pending: 0 };
      row[order.status] += item.quantity;
      totals.set(key, row);
    }
  }
  return [...totals.values()];
}

// Preserve all text, including long notes: overflow is paged instead of clipped.
export function wrapKitchenText(text: string, columns: number): string[] {
  return text.split('\n').flatMap(line => {
    const chars = Array.from(line);
    const lines: string[] = [];
    for (let i = 0; i < chars.length; i += Math.max(1, columns)) lines.push(chars.slice(i, i + Math.max(1, columns)).join(''));
    return lines.length ? lines : [''];
  });
}
