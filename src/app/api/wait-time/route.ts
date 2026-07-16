import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import {
  DEFAULT_MINIMUM_COMPLETED_ITEM_COUNT, DEFAULT_RECENT_WINDOW_MINUTES, DEFAULT_THROUGHPUT_PER_MINUTE,
  calculateDurationMinutes, calculateEstimatedWaitMinutes, calculateMedian, calculateOrderItemCount,
  calculateThroughput, formatWaitLabel, roundEstimatedWait, type ThroughputSource, type TimedOrder,
} from '@/lib/wait-time';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const setting = await Setting.findOne({ storeId: context.storeId, key: 'app_config' }).lean() as unknown as Record<string, unknown> | null;
    const windowMinutes = Number(setting?.waitTimeRecentWindowMinutes) || DEFAULT_RECENT_WINDOW_MINUTES;
    const minimumItems = Number(setting?.waitTimeMinimumCompletedItemCount) || DEFAULT_MINIMUM_COMPLETED_ITEM_COUNT;
    const defaultThroughput = Number(setting?.defaultThroughputPerMinute) || DEFAULT_THROUGHPUT_PER_MINUTE;
    const since = new Date(Date.now() - windowMinutes * 60_000);

    const [openResult, recentResult, fallbackResult] = await Promise.all([
      Order.find({ storeId: context.storeId, status: { $in: ['active', 'pending'] } }).select('items.quantity').lean(),
      Order.find({ storeId: context.storeId, status: 'completed', completedAt: { $gte: since } }).select('items.quantity createdAt orderDate completedAt').sort({ completedAt: -1 }).limit(200).lean(),
      Order.find({ storeId: context.storeId, status: 'completed', completedAt: { $ne: null } }).select('items.quantity createdAt orderDate completedAt').sort({ completedAt: -1 }).limit(30).lean(),
    ]);
    const openOrders = openResult as unknown as TimedOrder[];
    const recentOrders = recentResult as unknown as TimedOrder[];
    const fallbackOrders = fallbackResult as unknown as TimedOrder[];
    const itemTotal = (orders: typeof recentOrders) => orders.reduce((sum, order) => sum + calculateOrderItemCount(order), 0);
    const currentPendingItemCount = openOrders.reduce((sum, order) => sum + calculateOrderItemCount(order), 0);
    const recentItemCount = itemTotal(recentOrders);
    let sampleOrders = recentOrders;
    let throughputPerMinute: number | null = null;
    let throughputSource: ThroughputSource = 'unavailable';

    if (recentItemCount >= minimumItems) {
      throughputPerMinute = calculateThroughput(recentOrders, windowMinutes);
      throughputSource = 'recent_30_minutes';
    } else if (itemTotal(fallbackOrders) >= minimumItems) {
      sampleOrders = fallbackOrders;
      const totalMinutes = fallbackOrders.reduce((sum, order) => sum + (calculateDurationMinutes(order) ?? 0), 0);
      throughputPerMinute = totalMinutes > 0 ? itemTotal(fallbackOrders) / totalMinutes : null;
      throughputSource = throughputPerMinute ? 'recent_completed_orders' : 'unavailable';
    }
    if (!throughputPerMinute && defaultThroughput > 0) {
      throughputPerMinute = defaultThroughput;
      throughputSource = 'default_setting';
    }
    const durations = sampleOrders.map(calculateDurationMinutes).filter((value): value is number => value !== null);
    const estimate = roundEstimatedWait(calculateEstimatedWaitMinutes(currentPendingItemCount, throughputPerMinute ?? 0));
    return NextResponse.json({
      currentPendingItemCount,
      maxPendingItemCount: Number(setting?.maxPendingItemCount) || 30,
      throughputPerMinute,
      throughputSource,
      estimatedWaitMinutes: estimate,
      estimatedWaitLabel: formatWaitLabel(estimate),
      recentAverageCompletionMinutes: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
      recentMedianCompletionMinutes: calculateMedian(durations),
      recentCompletedOrderCount: sampleOrders.length,
      recentCompletedItemCount: itemTotal(sampleOrders),
      isEstimateReliable: throughputSource !== 'default_setting' && recentItemCount >= minimumItems,
    });
  } catch (error) {
    console.error('待ち時間取得エラー:', error);
    return NextResponse.json({ message: '待ち時間の取得に失敗しました。' }, { status: 500 });
  }
}
