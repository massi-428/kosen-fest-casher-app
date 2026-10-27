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

test('cancellation requires password and a reserved settlement operation', () => {
  const source = read('src/app/api/settlements/route.ts');
  assert.match(source, /getCancelPassword/);
  assert.match(source, /status: 403/);
  assert.match(source, /settlementLock/);
  assert.match(source, /phase: 'prepared'/);
  assert.match(read('src/app/api/tickets/route.ts'), /全取消は先に精算対象を確定/);
  assert.match(read('src/app/history/page.tsx'), /返金対象を確定/);
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
  assert.match(orderPage, /orderSucceeded/);
});

test('order creation is idempotent and prices are calculated on the server', () => {
  const ordersRoute = read('src/app/api/orders/route.ts');
  const orderModel = read('src/models/Order.ts');
  const orderPage = read('src/app/order/page.tsx');

  assert.match(orderModel, /requestId/);
  assert.match(orderModel, /\{ storeId: 1, requestId: 1 \}/);
  assert.match(orderModel, /partialFilterExpression: \{ requestId: \{ \$type: 'string' \} \}/);
  assert.match(ordersRoute, /Order\.findOne\(\{ storeId, requestId \}\)/);
  assert.match(read('src/app/api/order-quotes/route.ts'), /Product\.find/);
  assert.match(ordersRoute, /totalAmount = quote\.totalAmount/);
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
  assert.match(read('src/app/order/page.tsx'), /warning\?\.message/);
  assert.doesNotMatch(read('src/app/order/page.tsx'), /data\.warning \? 'error' : 'success'/);
});

test('sold-out products cannot be ordered and can be toggled from product management', () => {
  const productModel = read('src/models/Product.ts');
  const productsRoute = read('src/app/api/products/route.ts');
  const orderPage = read('src/app/order/page.tsx');

  assert.match(productModel, /isAvailable:\s*\{\s*type:\s*Boolean,\s*default:\s*true/);
  assert.match(productsRoute, /typeof isAvailable !== 'boolean'/);
  assert.match(productsRoute, /updateData\.isAvailable = isAvailable/);
  assert.match(read('src/lib/order-accounting.ts'), /product\.isAvailable === false/);
  assert.match(read('src/app/api/order-quotes/route.ts'), /priceEditedItems/);
  assert.match(orderPage, /handleToggleAvailability/);
  assert.match(orderPage, /売り切れ商品をカートから削除してください/);
  assert.match(orderPage, /disabled=\{!isEditMode && !isAvailable\}/);
});

test('cash calculation can be enabled per payment method and change is calculated on the server', () => {
  const settingModel = read('src/models/Setting.ts');
  const settingsRoute = read('src/app/api/settings/route.ts');
  const settingsPage = read('src/app/settings/page.tsx');
  const orderModel = read('src/models/Order.ts');
  const ordersRoute = read('src/app/api/orders/route.ts');
  const paymentModal = read('src/components/order/OrderModals.tsx');

  assert.match(settingModel, /cashCalculationEnabled/);
  assert.match(settingModel, /cashPaymentMethod/);
  assert.match(settingsRoute, /typeof body\.cashCalculationEnabled !== 'boolean'/);
  assert.match(settingsPage, /現金のお預かり・お釣り計算/);
  assert.match(orderModel, /receivedAmount/);
  assert.match(orderModel, /changeAmount/);
  assert.match(ordersRoute, /receivedAmount - totalAmount/);
  assert.match(ordersRoute, /receivedAmount, changeAmount/);
  assert.match(paymentModal, /お預かり金額/);
  assert.match(paymentModal, /お釣り/);
});

test('open order edits use reservation before handoff and preserve original cash', () => {
  const route = read('src/app/api/settlements/route.ts');
  assert.match(route, /priceEditedItems/);
  assert.match(route, /revisionFilter/);
  assert.match(route, /settlementOperations: operations/);
  assert.match(route, /settlements:/);
  assert.match(route, /受け渡し開始後は中止できません/);
  assert.match(read('src/components/order/EditOrderModal.tsx'), /精算対象を確定/);
  assert.match(read('src/components/order/SettlementModal.tsx'), /結果確認/);
});

test('daily sales report can be exported as a UTF-8 CSV', () => {
  const reportRoute = read('src/app/api/report/route.ts');
  const reportPage = read('src/app/report/page.tsx');

  assert.match(reportRoute, /searchParams\.get\('scope'\) === 'all'/);
  assert.match(reportRoute, /\['active', 'pending', 'completed', 'cancelled'\]/);
  assert.match(reportPage, /const exportCsv = async \(\) =>/);
  assert.match(reportPage, /scope=all/);
  assert.match(reportPage, /\\uFEFF/);
  assert.match(reportPage, /text\/csv;charset=utf-8/);
  assert.match(reportPage, /rootine-sales-\$\{date\}\.csv/);
  assert.match(reportPage, /売上扱い/);
  assert.match(reportPage, /全注文CSV/);
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

test('source files do not contain common mojibake fragments', () => {
  const mojibakePattern = /繧|縺|繝|譁|蜊|隱|螟|豕|蝠|謨|邂|蟾|蜿|髱|霑|荳|遒|鬆|菫|螳|逡|謇|蜑|逅|驥|蛻|譖|蠎/;
  const offenders = sourceFiles('src')
    .filter((file) => mojibakePattern.test(read(file)));

  assert.deepEqual(offenders, []);
});
