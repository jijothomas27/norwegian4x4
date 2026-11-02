/**
 * Workout reminders (expo-notifications) use the same monochrome icon as the
 * workout notification, which lives in the local tempo-workout module
 * (res/drawable/tempo_workout_notification.xml). The expo-notifications
 * config plugin only accepts a PNG, so this points its meta-data at the
 * existing vector drawable instead.
 */
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const ICON_KEY = 'expo.modules.notifications.default_notification_icon';

module.exports = function withReminderIcon(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, ICON_KEY, '@drawable/tempo_workout_notification', 'resource');
    return cfg;
  });
};
