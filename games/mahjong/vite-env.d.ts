/// <reference types="vite/client" />
declare const __MAHJONG_VERSION__: string;

// 老 iOS Safari 只有带前缀的音频上下文
interface Window {
  webkitAudioContext?: typeof AudioContext;
}
