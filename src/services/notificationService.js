const db = require('../config/db');
let admin;
let firebaseApp;
let tokenTableReady;

const resolveServiceAccountPath = () => {
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const fs = require('fs');
  const path = require('path');
  
  const check = (targetPath) => {
    if (!targetPath) return null;
    try {
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) return targetPath;
      if (!targetPath.endsWith('.json') && fs.existsSync(targetPath + '.json') && fs.statSync(targetPath + '.json').isFile()) {
        return targetPath + '.json';
      }
      if (fs.existsSync(targetPath + '.json.json') && fs.statSync(targetPath + '.json.json').isFile()) {
        return targetPath + '.json.json';
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  if (file) {
    const candidates = [
      path.resolve(file),
      path.resolve(__dirname, file),
      path.resolve(__dirname, '..', file),
      path.resolve(__dirname, '../..', file),
      path.resolve(process.cwd(), file),
    ];
    for (const cand of candidates) {
      const found = check(cand);
      if (found) return found;
    }
  }

  const defaults = [
    path.resolve(__dirname, '../../firebase-service-account.json'),
    path.resolve(__dirname, '../firebase-service-account.json'),
    path.resolve(__dirname, './firebase-service-account.json'),
    path.resolve(process.cwd(), 'firebase-service-account.json'),
    path.resolve(process.cwd(), '../firebase-service-account.json'),
  ];
  for (const cand of defaults) {
    const found = check(cand);
    if (found) return found;
  }

  return null;
};

const ensureTokenTable = async () => {
  if (!tokenTableReady) {
    tokenTableReady = db.query(`CREATE TABLE IF NOT EXISTS user_fcm_tokens (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      token VARCHAR(512) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_fcm_token (token), KEY idx_fcm_user_id (user_id)
    )`).catch((error) => { tokenTableReady = null; throw error; });
  }
  return tokenTableReady;
};

const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  try {
    admin ||= require('firebase-admin');
    let serviceAccount;
    if (json) {
      serviceAccount = JSON.parse(json);
    } else {
      const actualPath = resolveServiceAccountPath();
      if (!actualPath || !require('fs').existsSync(actualPath)) {
        console.warn('[FCM] Firebase service account file not found. Push notifications will be disabled.');
        return null;
      }
      serviceAccount = require(actualPath);
    }
    firebaseApp = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return firebaseApp;
  } catch (error) {
    console.error('[FCM] Firebase Admin initialization failed:', error.message);
    return null;
  }
};

exports.getStatus = () => {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const actualPath = resolveServiceAccountPath();
  let firebaseAdminInstalled = true;
  try { require.resolve('firebase-admin'); } catch { firebaseAdminInstalled = false; }
  return {
    firebaseAdminInstalled,
    serviceAccountPathConfigured: Boolean(serviceAccountPath),
    serviceAccountFileExists: Boolean(actualPath && require('fs').existsSync(actualPath)),
    firebaseInitialized: Boolean(getFirebaseApp()),
  };
};

const stringData = (data = {}) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]));

const sendToTokens = async (tokens, notification, data = {}) => {
  const app = getFirebaseApp();
  if (!app || !tokens.length) return { sent: 0, configured: Boolean(app) };
  const response = await admin.messaging(app).sendEachForMulticast({
    tokens,
    notification,
    data: stringData(data),
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        priority: 'high',
        clickAction: data.link || '/',
      },
    },
    webpush: {
      headers: {
        Urgency: 'high',
      },
      notification: {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        requireInteraction: true,
        data: { link: data.link || '/' }
      },
      fcmOptions: { link: data.link || '/' }
    },
  });
  const invalidTokens = response.responses.map((result, index) => ({ result, token: tokens[index] }))
    .filter(({ result }) => !result.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(result.error?.code))
    .map(({ token }) => token);
  if (invalidTokens.length) await db.query('DELETE FROM user_fcm_tokens WHERE token IN (?)', [invalidTokens]);
  return { sent: response.successCount, configured: true };
};

exports.saveToken = async (userId, token) => { await ensureTokenTable(); await db.query(`INSERT INTO user_fcm_tokens (user_id, token) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = CURRENT_TIMESTAMP`, [userId, token]); };
exports.removeToken = async (userId, token) => { await ensureTokenTable(); await db.query('DELETE FROM user_fcm_tokens WHERE user_id = ? AND token = ?', [userId, token]); };
exports.sendToUsers = async (userIds, notification, data = {}) => {
  if (!userIds?.length) return { sent: 0, configured: Boolean(getFirebaseApp()) };
  await ensureTokenTable(); const [rows] = await db.query('SELECT token FROM user_fcm_tokens WHERE user_id IN (?)', [userIds]);
  return sendToTokens(rows.map((row) => row.token), notification, data);
};
exports.sendToRole = async (role, notification, data = {}) => {
  await ensureTokenTable(); const [rows] = await db.query('SELECT t.token FROM user_fcm_tokens t JOIN users u ON u.id = t.user_id WHERE u.role = ?', [role]);
  return sendToTokens(rows.map((row) => row.token), notification, data);
};
exports.notifyNewProduct = (product) => exports.sendToRole('user', { title: 'New product available', body: `${product.name} is now available in ElectronicShop.` }, { type: 'new_product', productId: product.id, link: `/products/${product.id}` });
exports.notifyLowStock = (product) => exports.sendToRole('admin', { title: 'Low stock alert', body: `${product.name} has only ${product.stock} item(s) remaining.` }, { type: 'low_stock', productId: product.id, link: '/admin/edit-products' });
exports.notifyLowStockCartUsers = (product, userIds) => exports.sendToUsers(userIds, { title: 'Product stock is running low', body: `${product.name} has only ${product.stock} item(s) left. Complete your order soon.` }, { type: 'low_stock', productId: product.id, link: `/products/${product.id}` });
exports.notifyWishlistBackInStock = (product, userIds) => exports.sendToUsers(userIds, { title: 'Wishlist item back in stock', body: `${product.name} is available again.` }, { type: 'wishlist_back_in_stock', productId: product.id, link: `/products/${product.id}` });
exports.notifyCouponAvailable = (coupon, userIds) => exports.sendToUsers(userIds, { title: 'New coupon available', body: `Use ${coupon.code} to save ₹${coupon.discountAmount}.` }, { type: 'coupon_available', couponCode: coupon.code, link: '/' });
exports.notifyOrderPlaced = async (orderId, userId) => Promise.allSettled([
  exports.sendToUsers([userId], { title: 'Order placed', body: `Your order #${orderId} has been placed successfully.` }, { type: 'order_placed', orderId, link: '/my-orders' }),
  exports.sendToRole('admin', { title: 'New order placed', body: `Order #${orderId} needs processing.` }, { type: 'order_placed', orderId, link: '/admin/orders' }),
]);
exports.notifyOrderShipped = (orderId, userId) => exports.sendToUsers([userId], { title: 'Order shipped', body: `Your order #${orderId} is on its way.` }, { type: 'order_shipped', orderId, link: '/my-orders' });
exports.notifyOrderDelivered = (orderId, userId) => exports.sendToUsers([userId], { title: 'Order delivered', body: `Your order #${orderId} has been delivered.` }, { type: 'order_delivered', orderId, link: '/my-orders' });
exports.notifyOrderCancelled = (orderId, userId) =>
  exports.sendToUsers([userId], { title: 'Order cancelled', body: `Your order #${orderId} has been cancelled.` }, { type: 'order_cancelled', orderId, link: '/my-orders' });
