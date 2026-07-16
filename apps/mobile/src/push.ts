// Push bildirimi — MOBİL İSTEMCİ tarafı (izin + token + bildirim işleyici).
//
// Gönderim tarafı backend'de HAZIR (apps/api/internal/push → Expo Push Service, FCM/APNs'e
// kendisi iletir). Buradan gönderilen token `platform: 'expo'` ile kaydedilir.
//
// Token alımı EAS projectId gerektirir (`eas init`) → yoksa uyarı verilip atlanır.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

// Bildirim aç/kapa tercihi (uygulama-içi toast + yerel bildirim)
let _notifOn = true;
export function notifOn() {
  return _notifOn;
}
export async function loadNotifPref() {
  try {
    _notifOn = (await AsyncStorage.getItem('concord_notif_on')) !== '0';
  } catch {}
}
export async function setNotifOn(v: boolean) {
  _notifOn = v;
  try {
    await AsyncStorage.setItem('concord_notif_on', v ? '1' : '0');
  } catch {}
}

Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }) as any,
});

// Yerel bildirim — Firebase GEREKTİRMEZ. Uygulama açıkken/arka plandayken anlık bildirim gösterir.
export async function notifyLocal(title: string, body?: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body: body ?? '' },
      trigger: null,
    });
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
    if (!projectId) {
      // Sessizce geçmek, push'un çalıştığı yanılgısına yol açıyordu. EAS projectId yoksa
      // getExpoPushTokenAsync anlamlı bir token üretemez → sebebi görünür olsun.
      console.warn('[push] EAS projectId yok (`eas init` yapılmadı) → push kaydı atlandı');
      return;
    }
    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });

    // platform: 'expo' ŞART. Eskiden p256dh/auth boş string gönderiliyordu; backend bunları
    // (Web Push alanları) zorunlu tuttuğu için kayıt HER SEFERİNDE 400 alıyor ve aşağıdaki
    // catch onu yutuyordu → hiçbir cihaz kayıtlı değildi, kimse push almıyordu.
    await api.push.subscribe({ endpoint: tokenResp.data, platform: 'expo' });
    return tokenResp.data;
  } catch (e) {
    // Hata yutulmamalı: "push çalışıyor" sanmanın bedeli bildirimlerin sessizce hiç gitmemesi.
    console.warn('[push] kayıt başarısız:', e instanceof Error ? e.message : String(e));
  }
}
