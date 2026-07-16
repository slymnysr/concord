// Dokunsal geri bildirim — güvenli sarmalayıcı (desteklemeyen cihazda sessiz).
import * as Haptics from 'expo-haptics';

export function tap() {
  try {
    Haptics.selectionAsync();
  } catch {}
}
export function impact() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}
export function success() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}
