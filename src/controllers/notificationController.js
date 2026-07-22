const notifications = require('../services/notificationService');
const userId = (req) => req.user?.id || req.user?.userId || req.user?.user_id;
exports.registerToken = async (req, res) => {
  const id = userId(req); const { token } = req.body;
  if (!id) return res.status(401).json({ success: false, message: 'Authentication is required.' });
  if (!token || typeof token !== 'string' || token.length > 512) return res.status(400).json({ success: false, message: 'A valid FCM token is required.' });
  try { await notifications.saveToken(id, token); return res.status(200).json({ success: true }); }
  catch (error) { console.error('[FCM] Token registration failed:', error.message); return res.status(500).json({ success: false, message: 'Unable to register this device.' }); }
};
exports.removeToken = async (req, res) => {
  const id = userId(req); const { token } = req.body;
  if (!id || !token) return res.status(400).json({ success: false, message: 'A token is required.' });
  try { await notifications.removeToken(id, token); return res.status(200).json({ success: true }); }
  catch { return res.status(500).json({ success: false, message: 'Unable to remove this device.' }); }
};

exports.status = async (req, res) => {
  try {
    const [rows] = await require('../config/db').query('SELECT COUNT(*) AS count FROM user_fcm_tokens');
    return res.status(200).json({ success: true, ...notifications.getStatus(), registeredDeviceCount: rows[0].count });
  } catch (error) {
    return res.status(200).json({ success: true, ...notifications.getStatus(), registeredDeviceCount: 0, databaseMessage: error.message });
  }
};

exports.sendTest = async (req, res) => {
  const id = userId(req);
  try {
    const status = notifications.getStatus();
    if (!status.serviceAccountFileExists || !status.firebaseAdminInstalled) {
      return res.status(409).json({ success: false, message: 'Firebase Admin service-account configuration is incomplete.', ...status });
    }
    const result = await notifications.sendToUsers([id], { title: 'ElectronicShop test', body: 'FCM is working on this device.' }, { type: 'fcm_test', link: '/' });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[FCM] Test notification failed:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};
