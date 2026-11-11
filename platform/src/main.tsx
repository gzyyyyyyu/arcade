import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { SessionProvider } from './session.tsx';
import { clearRetiredKeys } from './lib/retired-keys.ts';
import { installTapSound } from './lib/sound.ts';
import { installViewportHeight } from './lib/viewport.ts';
import { WalletProvider } from './features/wallet/Wallet.tsx';
import './styles.css';

installTapSound();
installViewportHeight();

try {
  clearRetiredKeys(localStorage, sessionStorage);
} catch {
  // 隐私模式等用不了存储：那也就没存过
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </SessionProvider>
  </StrictMode>,
);
