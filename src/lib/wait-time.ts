export const MAX_VALID_COMPLETION_MINUTES = 180;
export const DEFAULT_THROUGHPUT_PER_MINUTE = 1.5;
export const DEFAULT_RECENT_WINDOW_MINUTES = 30;
export const DEFAULT_MINIMUM_COMPLETED_ITEM_COUNT = 10;

export type TimedOrder = {
  items?: Array<{ quantity?: number }>;
  createdAt?: Date | string;
  orderDate?: Date | string;
  completedAt?: Date | string | null;
};

export type ThroughputSource =
  | 'recent_30_minutes'
  | 'recent_completed_orders'
  | 'default_setting'
  | 'unavailable';

export const calculateOrderItemCount = (order: Pick<TimedOrder, 'items'>) =>
  (Array.isArray(order.items) ? order.items : []).reduce((sum, item) => {
    const quantity = Number(item?.quantity);
    return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
  }, 0);

export const calculateDurationMinutes = (order: TimedOrder) => {
  const orderedAt = new Date(order.createdAt ?? order.orderDate ?? '').getTime();
  const completedAt = new Date(order.completedAt ?? '').getTime();
  if (!Number.isFinite(orderedAt) || !Number.isFinite(completedAt)) return null;
  const minutes = (completedAt - orderedAt) / 60_000;
  return minutes > 0 && minutes <= MAX_VALID_COMPLETION_MINUTES ? minutes : null;
};

export const calculateMedian = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const calculateThroughput = (completedOrders: TimedOrder[], windowMinutes: number) => {
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) return null;
  const itemCount = completedOrders.reduce((sum, order) => sum + calculateOrderItemCount(order), 0);
  return itemCount > 0 ? itemCount / windowMinutes : null;
};

export const calculateEstimatedWaitMinutes = (pendingItemCount: number, throughputPerMinute: number) => {
  if (!Number.isFinite(pendingItemCount) || pendingItemCount < 0 || !Number.isFinite(throughputPerMinute) || throughputPerMinute <= 0) return null;
  return pendingItemCount / throughputPerMinute;
};

export const roundEstimatedWait = (minutes: number | null, step = 5, maximum = 60) => {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  return Math.min(maximum, Math.max(0, Math.ceil(minutes / step) * step));
};

export const formatWaitLabel = (minutes: number | null, maximum = 60) => {
  if (minutes === null) return '算出できません';
  if (minutes >= maximum) return `${maximum}分以上`;
  return `約${minutes}分`;
};
