import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

const sourceFiles = (dir) => {
  const entries = readdirSync(join(root, dir));
  return entries.flatMap((entry) => {
    const fullPath = join(root, dir, entry);
    const relPath = relative(root, fullPath).replaceAll('\\', '/');
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return sourceFiles(relPath);
    return /\.(ts|tsx)$/.test(entry) ? [relPath] : [];
  });
};

test('auth sessions are cookie-based and signed', () => {
  const auth = read('src/lib/auth.ts');

  assert.match(auth, /httpOnly:\s*true/);
  assert.match(auth, /sameSite:\s*'lax'/);
  assert.match(auth, /createHmac\('sha256'/);
  assert.match(auth, /timingSafeEqual/);
});

test('/api/me exposes cookie session state without localStorage', () => {
  const me = read('src/app/api/me/route.ts');

  assert.match(me, /getSessionUser\(request\)/);
  assert.match(me, /authenticated:\s*true/);
  assert.match(me, /role:\s*user\.role/);
  assert.match(me, /isAdmin:\s*user\.role === 'admin'/);
});


test('users have role-based authorization fields', () => {
  const userModel = read('src/models/User.ts');
  const authorization = read('src/lib/authorization.ts');
  const adminDatabase = read('src/app/api/admin/database/route.ts');

  assert.match(userModel, /role:/);
  assert.match(userModel, /enum:\s*\['admin', 'store'\]/);
  assert.match(authorization, /normalizeUserRole/);
  assert.match(authorization, /if \(userId === 'admin'\) return 'admin'/);
  assert.match(authorization, /isAdminRequest/);
  assert.doesNotMatch(adminDatabase, /userId\s*!==\s*'admin'/);
});
test('logout clears the auth cookie and is reachable from the main menu', () => {
  const logoutRoute = read('src/app/api/logout/route.ts');
  const hamburgerMenu = read('src/components/common/HamburgerMenu.tsx');
  const orderPage = read('src/app/order/page.tsx');

  assert.match(logoutRoute, /clearAuthCookie\(response\)/);
  assert.match(hamburgerMenu, /onLogout\?: \(\) => void/);
  assert.match(hamburgerMenu, /ログアウト/);
  assert.match(orderPage, /\/api\/logout/);
});

test('hamburger menu icon assets exist under public', () => {
  const hamburgerMenu = read('src/components/common/HamburgerMenu.tsx');
  const iconPaths = [...hamburgerMenu.matchAll(/icon: '([^']+)'/g)].map((match) => match[1]);

  assert.ok(iconPaths.length > 0, 'menu should declare icon paths');
  assert.match(hamburgerMenu, /bg-gray-900/, 'white menu icons need a visible dark menu background');
  for (const iconPath of iconPaths) {
    const publicPath = iconPath.replace(/^\//, 'public/');
    assert.ok(existsSync(join(root, publicPath)), `${iconPath} should exist`);
  }
});

test('client auth checks do not trust localStorage currentUserId', () => {
  const appFiles = sourceFiles('src/app');
  const offenders = appFiles.filter((file) => read(file).includes('localStorage'));

  assert.deepEqual(offenders, []);
});

test('cancelled tickets require the admin cancel password', () => {
  const ticketsRoute = read('src/app/api/tickets/route.ts');
  const historyPage = read('src/app/history/page.tsx');
  const systemModel = read('src/models/SystemSetting.ts');
  const systemRoute = read('src/app/api/admin/system-settings/route.ts');

  assert.match(systemModel, /cancelPassword/);
  assert.match(systemRoute, /cancelPassword/);
  assert.match(ticketsRoute, /getCancelPassword\(\)/);
  assert.match(ticketsRoute, /newStatus === 'cancelled'/);
  assert.match(ticketsRoute, /status: 403/);
  assert.match(ticketsRoute, /if \(!updatedOrder\)/);
  assert.match(ticketsRoute, /対象の注文が見つかりません/);
  assert.doesNotMatch(historyPage, /window\.prompt/);
  assert.match(historyPage, /cancelPassword/);
  assert.match(historyPage, /キャンセル完了/);
  assert.match(historyPage, /submitCancelOrder/);
  assert.match(historyPage, /キャンセル用パスワードを入力してください/);
});

test('store data is scoped by storeId in core APIs', () => {
  const files = [
    'src/app/api/products/route.ts',
    'src/app/api/orders/route.ts',
    'src/app/api/tickets/route.ts',
    'src/app/api/report/route.ts',
    'src/app/api/settings/route.ts',
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(source, /getActiveStoreContext\(request\)/, `${file} must use store context`);
    assert.match(source, /storeId:\s*context\.storeId/, `${file} must query or write by storeId`);
  }
});

test('orders are issued ticket numbers on the server', () => {
  const ordersRoute = read('src/app/api/orders/route.ts');
  const orderModel = read('src/models/Order.ts');
  const ticketCounterModel = read('src/models/TicketCounter.ts');
  const orderPage = read('src/app/order/page.tsx');

  assert.match(ticketCounterModel, /'ticket_counters'/);
  assert.match(orderModel, /partialFilterExpression:\s*\{\s*status:\s*\{\s*\$in:\s*\['active',\s*'pending'\]\s*\}/);
  assert.match(ordersRoute, /TicketCounter\.findOneAndUpdate/);
  assert.match(ordersRoute, /issueTicketCandidate/);
  assert.match(ordersRoute, /DUPLICATE_KEY_ERROR_CODE/);
  assert.match(ordersRoute, /Setting\.findOneAndUpdate/);
  assert.match(ordersRoute, /OPEN_STATUSES = \['active', 'pending'\]/);
  assert.match(ordersRoute, /利用可能な整理券番号がありません/);
  assert.match(ordersRoute, /ticketNumber:\s*candidate/);
  assert.doesNotMatch(orderPage, /ticketNumber:\s*currentTicket/);
  assert.match(orderPage, /data\.ticketNumber \|\| data\.order\?\.ticketNumber/);
});

test('order creation is idempotent and prices are calculated on the server', () => {
  const ordersRoute = read('src/app/api/orders/route.ts');
  const orderModel = read('src/models/Order.ts');
  const orderPage = read('src/app/order/page.tsx');

  assert.match(orderModel, /requestId/);
  assert.match(orderModel, /\{ storeId: 1, requestId: 1 \}/);
  assert.match(orderModel, /partialFilterExpression: \{ requestId: \{ \$type: 'string' \} \}/);
  assert.match(ordersRoute, /Order\.findOne\(\{ storeId, requestId \}\)/);
  assert.match(ordersRoute, /Product\.find\(\{ storeId/);
  assert.match(ordersRoute, /totalAmount = safeItems\.reduce/);
  assert.doesNotMatch(ordersRoute, /toValidPrice\(body\.totalAmount\)/);
  assert.match(orderPage, /crypto\.randomUUID\(\)/);
  assert.match(orderPage, /requestId: requestIdRef\.current/);
  assert.match(orderPage, /productId: item\.productId/);
  assert.match(orderPage, /setIsSubmitting\(true\)/);
  assert.match(orderPage, /requestIdRef\.current = newRequestId\(\)/);
});

test('orders track pending item warning thresholds', () => {
  const ordersRoute = read('src/app/api/orders/route.ts');
  const settingModel = read('src/models/Setting.ts');
  const settingsPage = read('src/app/settings/page.tsx');

  assert.match(settingModel, /maxPendingItemCount/);
  assert.match(settingModel, /maxItemsPerOrder/);
  assert.doesNotMatch(settingModel, /acceptingOrders/);
  assert.doesNotMatch(settingModel, /orderStopReason/);
  assert.match(ordersRoute, /status: \{ \$in: OPEN_STATUSES \}/);
  assert.match(ordersRoute, /Setting\.findOneAndUpdate/);
  assert.match(ordersRoute, /projectedPendingItemCount/);
  assert.match(ordersRoute, /capacityWarning/);
  assert.match(ordersRoute, /未提供数が警告基準を超えています/);
  assert.doesNotMatch(ordersRoute, /acceptingOrders/);
  assert.doesNotMatch(settingsPage, /受注を停止/);
  assert.match(settingsPage, /未提供数の警告基準/);
  assert.match(read('src/app/order/page.tsx'), /handleOpenPayment/);
  assert.match(read('src/app/order/page.tsx'), /提供まで時間がかかる可能性があります/);
  assert.match(read('src/app/order/page.tsx'), /それでも注文を追加しますか/);
  assert.match(read('src/app/order/page.tsx'), /今回の注文は想定数/);
  assert.doesNotMatch(read('src/app/order/page.tsx'), /currentOrderItemCount > maxItemsPerOrder\}/);
  assert.match(read('src/app/order/page.tsx'), /警告: \$\{data\.warning\.message\}/);
  assert.doesNotMatch(read('src/app/order/page.tsx'), /data\.warning \? 'error' : 'success'/);
});

test('admin login does not assign store context', () => {
  const loginRoute = read('src/app/api/login/route.ts');
  const loginPage = read('src/app/login/page.tsx');

  assert.match(loginRoute, /if \(role === 'admin'\)/);
  assert.match(loginRoute, /user\.storeIds = \[\]/);
  assert.match(loginRoute, /setAuthCookie\(response, id, activeStoreId\)/);
  assert.match(loginPage, /data\.role === 'admin'/);
});

test('store creation is limited and one store per user', () => {
  const storesRoute = read('src/app/api/stores/route.ts');
  const signupRoute = read('src/app/api/signup/route.ts');
  const storeLib = read('src/lib/store.ts');

  assert.match(storesRoute, /Store\.findOne\(\{\s*ownerUserId:\s*session\.userId\s*\}\)/);
  assert.match(storesRoute, /1ユーザーにつき作成できる店舗は1件までです/);
  assert.match(storesRoute, /canCreateStore\(\)/);
  assert.match(signupRoute, /canCreateStore\(\)/);
  assert.match(storeLib, /Store\.countDocuments\(\)/);
});

test('system-wide maxStores is stored outside store settings', () => {
  const systemModel = read('src/models/SystemSetting.ts');
  const systemRoute = read('src/app/api/admin/system-settings/route.ts');
  const settingRoute = read('src/app/api/settings/route.ts');

  assert.match(systemModel, /'system_settings'/);
  assert.match(systemRoute, /maxStores/);
  assert.doesNotMatch(settingRoute, /maxStores/);
});

test('admin store management hides admin and removes cleanup button', () => {
  const adminStores = read('src/app/api/admin/stores/route.ts');
  const adminPage = read('src/app/admin/page.tsx');

  assert.match(adminStores, /User\.find\(\{\s*userId:\s*\{\s*\$ne:\s*'admin'\s*\}/);
  assert.match(adminStores, /Store\.find\(\{\s*ownerUserId:\s*\{\s*\$ne:\s*'admin'\s*\}/);
  assert.doesNotMatch(adminPage, /cleanupStores/);
});

test('admin cleanup consolidates duplicate stores into one owner store', () => {
  const adminStores = read('src/app/api/admin/stores/route.ts');

  assert.match(adminStores, /User\.find\(\{\s*userId:\s*\{\s*\$ne:\s*'admin'\s*\}\s*\}\)/);
  assert.match(adminStores, /ownerUserId:\s*'admin'/);
  assert.match(adminStores, /storeIds:\s*\[\]/);
  assert.match(adminStores, /Store\.find\(\{\s*ownerUserId:\s*user\.userId\s*\}\)/);
  assert.match(adminStores, /duplicateStores = stores\.slice\(1\)/);
  assert.match(adminStores, /Product\.updateMany\(\{\s*storeId:\s*duplicateStoreId\s*\}/);
  assert.match(adminStores, /Order\.updateMany\(\{\s*storeId:\s*duplicateStoreId\s*\}/);
  assert.match(adminStores, /Setting\.updateMany\(\{\s*storeId:\s*duplicateStoreId\s*\}/);
  assert.match(adminStores, /Store\.deleteMany/);
});

test('source files do not contain common mojibake fragments', () => {
  const mojibakePattern = /繧|縺|繝|譁|蜊|隱|螟|豕|蝠|謨|邂|蟾|蜿|髱|霑|荳|遒|鬆|菫|螳|逡|謇|蜑|逅|驥|蛻|譖|蠎/;
  const offenders = sourceFiles('src')
    .filter((file) => mojibakePattern.test(read(file)));

  assert.deepEqual(offenders, []);
});
