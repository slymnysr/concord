import { registerRootComponent } from 'expo';

import App from './App';

// Sesli sohbet için WebRTC global'lerini (RTCPeerConnection, mediaDevices…) kur.
// Expo Go'da native modül yok → sessizce atlanır; ses yalnız EAS dev client / native build'de çalışır.
try {
  require('react-native-webrtc').registerGlobals();
} catch {}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
