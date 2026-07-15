// Expo varsayılan Metro config (monorepo otomatik algılanır) +
// Rust derleme çıktısını (apps/desktop/src-tauri/target) izleme dışında tutar.
// target/debug/deps altındaki geçici derleme dosyaları Metro'nun WSL fallback
// izleyicisini ENOENT ile çökertiyordu. blockList doğrudan RegExp kabul eder;
// exclusionList helper'ı bu Metro sürümünde exports-map yüzünden import edilemiyor.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const targetBlock = /[/\\]apps[/\\]desktop[/\\]src-tauri[/\\]target[/\\].*/;
config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, targetBlock)
  : targetBlock;

module.exports = config;
