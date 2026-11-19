import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// 开发和预览服务监听所有网卡，同一局域网里的手机、平板能直接打开测试（端口登记见仓库根 AGENTS.md 第 3 节）。
export default defineConfig({
  // 相对路径：游戏挂在 /games/yexun/ 下，也能放在任意目录直接打开
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '0.0.0.0',
    port: 5170,
    strictPort: true,
    // 本地开发时 /api 转给平台的本地接口（平台目录 npm run dev:api，wrangler dev 在 5181）；Host 和写请求的 Origin 都要对上平台本地的 SITE_ORIGIN
    proxy: { '/api': { target: 'http://localhost:5181', changeOrigin: true, headers: { origin: 'http://localhost:5181' } } },
  },
  preview: { host: '0.0.0.0', port: 4170, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Phaser 单独成块：发新版本时浏览器缓存里的 Phaser 仍可复用
        manualChunks: (id: string) => (id.includes('/node_modules/phaser/') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // 测试代码交给 Node 原生加载（去类型），不走 Vite 的模块执行器：执行器把每次跨模块调用都变成取属性，
    // 守岛指纹锁这类整局重放慢 3 倍多（同 40 局 23 秒 / 7 秒）。测试不用 vi.mock、import.meta.vitest，
    // 源码开着 erasableSyntaxOnly、相对 import 都写 .ts 扩展名，所以 Node 能直接跑；要用 vi.mock 时把这行去掉
    experimental: { viteModuleRunner: false },
  },
});
