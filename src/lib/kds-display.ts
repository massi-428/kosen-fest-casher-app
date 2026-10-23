type SummaryOrder = { status: string; items: { productId?: string; productName: string; quantity: number }[] };

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
