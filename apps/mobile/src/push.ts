// Push bildirimi — MOBİL İSTEMCİ tarafı (izin + token + bildirim işleyici).
// NOT: gönderim tarafı backend'de FCM + Firebase projesi ister (kullanıcı kurulumu).
// Token alımı EAS projectId gerektirir (`eas init`) → o yapılmadan sessizce atlanır.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

// Bildirim aç/kapa tercihi (uygulama-içi toast + yerel bildirim)
let _notifOn = true;
export function notifOn() { return _notifOn; }
export async function loadNotifPref() { try { _notifOn = (await AsyncStorage.getItem('concord_notif_on')) !== '0'; } catch {} }
export async function setNotifOn(v: boolean) { _notifOn = v; try { await AsyncStorage.setItem('concord_notif_on', v ? '1' : '0'); } catch {} }

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

// Yerel bildirim — Firebase GEREKTİRMEZ. Uygulama açıkken/arka plandayken anlık bildirim gösterir.
export async function notifyLocal(title: string, body?: string) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body: body ?? '' }, trigger: null });
  } catch {}
}

export async function registerForPush() {
  try {
    if (!Device.isDevice) return;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Concord',
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
