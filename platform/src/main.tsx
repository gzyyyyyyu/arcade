import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { SessionProvider } from './session.tsx';
import { installTapSound } from './lib/sound.ts';
import { watchViewport } from 'arcade-kit/viewport';
import { WalletProvider } from './features/wallet/Wallet.tsx';
import './styles.css';

installTapSound();
// 一屏高（docs/ui.md 第 11 节）：按看得见的区域写 --app-h（iOS 的 100vh 是工具栏收起时的高）。平台页里有输入框，键盘顶上来时不强行滚回顶
watchViewport({ onChange: () => {}, scrollTop: false, zoomEpsilon: 0.01 });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </SessionProvider>
  </StrictMode>,
);
