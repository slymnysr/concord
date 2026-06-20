// Push bildirimi — MOBİL İSTEMCİ tarafı (izin + token + bildirim işleyici).
// NOT: gönderim tarafı backend'de FCM + Firebase projesi ister (kullanıcı kurulumu).
// Token alımı EAS projectId gerektirir (`eas init`) → o yapılmadan sessizce atlanır.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

export async function registerForPush() {
  try {
    if (!Device.isDevice) return;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Sidcord',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    const tokenResp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    // Backend'e kaydet (best-effort). Gönderim için backend'in FCM/Expo-push yolu olmalı.
    await api.push.subscribe({ endpoint: tokenResp.data, p256dh: '', auth: '' }).catch(() => {});
  } catch {
    // Expo Go / EAS init yapılmamış / izin yok → sessiz geç.
  }
}
