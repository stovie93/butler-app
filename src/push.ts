import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from './api';
import { Settings } from './settings';

// The channel a closed-app approval push lands on. Created before requesting
// permission / fetching the token so the high-importance heads-up display works
// on the very first push. Must match the gateway's android.notification.channel_id.
const APPROVALS_CHANNEL = 'approvals';
// The channel a fired-reminder push lands on. Must match the gateway's
// butler-reminders android.notification.channel_id.
const REMINDERS_CHANNEL = 'reminders';

/**
 * Register this device for push so a pending approval reaches the phone even
 * when the Butler app is fully closed. Best-effort: bails quietly on a simulator,
 * if permission is denied, or if anything fails — push is an enhancement, the
 * in-app SSE + PC toast still work without it.
 */
export async function registerForPush(settings: Settings): Promise<void> {
  try {
    if (!Device.isDevice) return; // no push on emulators/simulators
    if (!settings.baseUrl || !settings.token) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(APPROVALS_CHANNEL, {
        name: 'Approvals',
        importance: Notifications.AndroidImportance.MAX,
        lightColor: '#4f8cff',
      });
      await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL, {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#4f8cff',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return;

    // On Android this is the raw FCM token the gateway sends to.
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token === 'string' && token) {
      await registerPushToken(settings, token);
    }
  } catch {
    // swallow — never let push setup break app startup
  }
}
