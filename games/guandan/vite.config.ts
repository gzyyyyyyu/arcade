import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

// 云存档接口：本地开发时代理到平台接口的本地服务（平台目录里 `npm run dev:api`，即 wrangler dev，SITE_ORIGIN 是 http://localhost:5181）。
// 平台按 Origin 校验写请求，所以把 Host 和 Origin 都改成 5181；在浏览器里先到 5181 登录拿 cookie 才能同步。
const API = 'http://localhost:5181';

// Phaser 源码里的功能开关：渲染器两种都留，关调试（Spector）和 Phaser 自带的声音（游戏用自己的 audio.ts）
const PHASER_FLAGS = {
  'typeof CANVAS_RENDERER': JSON.stringify(true),
  'typeof WEBGL_RENDERER': JSON.stringify(true),
  'typeof WEBGL_DEBUG': JSON.stringify(false),
  'typeof FEATURE_SOUND': JSON.stringify(false),
};

// 监听所有网卡：局域网里的手机、平板也能直接打开开发服务器试玩。
export default defineConfig({
  // 相对路径：游戏挂在 /games/guandan/ 下，不假设自己在域名根
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    ...PHASER_FLAGS,
  },
  // 开发服务器把 phaser 源码预打包（它们是 CommonJS），开关要在预打包时同样替换，开发和线上才是同一套代码
  optimizeDeps: { rolldownOptions: { transform: { define: PHASER_FLAGS } } },
  resolve: {
    alias: [
      // 精简版 Phaser：见 src/phaser-lite.js
      { find: /^phaser$/, replacement: fileURLToPath(new URL('./src/phaser-lite.js', import.meta.url)) },
      { find: /^phaser-src\//, replacement: fileURLToPath(new URL('./node_modules/phaser/src/', import.meta.url)) },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: true, headers: { origin: API } } },
  },
  preview: { host: '0.0.0.0', port: 4174, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  // 默认 5 秒超时在机器满载时会掐掉正常的长测试（求解器对拍、整局状态体积）；判快慢的测试自己断言，超时只防卡死
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
