/**
 * GPS for workouts.
 *
 * react-native-ble-manager's `neverForLocation` option (which keeps Bluetooth
 * scanning working without location access) declares the location
 * permissions with android:maxSdkVersion="30" — i.e. "not on Android 12+".
 * Tempo does want real location on modern Android for GPS pace and routes,
 * so this plugin makes sure both permissions are declared without that cap.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const LOCATION = ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'];

module.exports = function withWorkoutLocation(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const perms = (manifest['uses-permission'] ??= []);
    for (const name of LOCATION) {
      const existing = perms.filter((p) => p?.$?.['android:name'] === name);
      if (existing.length === 0) perms.push({ $: { 'android:name': name } });
      for (const p of existing) delete p.$['android:maxSdkVersion'];
    }
    return cfg;
  });
};
