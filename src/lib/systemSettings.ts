import SystemSetting from '@/models/SystemSetting';
import Setting from '@/models/Setting';

const SYSTEM_SETTINGS_KEY = 'system_config';
const DEFAULT_MAX_STORES = 10;
const DEFAULT_CANCEL_PASSWORD = '0000';

export const getSystemSettings = async () => {
  let settings = await SystemSetting.findOne({ key: SYSTEM_SETTINGS_KEY });

  if (!settings) {
    const legacyAdminSetting = await Setting.collection.findOne<{ maxStores?: unknown; cancelPassword?: unknown }>({ ownerId: 'admin', key: 'app_config' });
    const legacyMaxStores = Number(legacyAdminSetting?.maxStores);
    const legacyCancelPassword = typeof legacyAdminSetting?.cancelPassword === 'string' && legacyAdminSetting.cancelPassword.trim()
      ? legacyAdminSetting.cancelPassword.trim()
      : DEFAULT_CANCEL_PASSWORD;
    settings = await SystemSetting.create({
      key: SYSTEM_SETTINGS_KEY,
      maxStores: Number.isInteger(legacyMaxStores) && legacyMaxStores > 0 ? legacyMaxStores : DEFAULT_MAX_STORES,
      cancelPassword: legacyCancelPassword,
    });
  }

  return settings;
};

export const getStoreLimit = async () => {
  const settings = await getSystemSettings();
  const maxStores = Number(settings.maxStores ?? DEFAULT_MAX_STORES);
  return Number.isInteger(maxStores) && maxStores > 0 ? maxStores : DEFAULT_MAX_STORES;
};

export const getCancelPassword = async () => {
  const settings = await getSystemSettings();
  const cancelPassword = String(settings.cancelPassword || '').trim();
  return cancelPassword || DEFAULT_CANCEL_PASSWORD;
};
