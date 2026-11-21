import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { SessionProvider } from './session.tsx';
import { installTapSound } from './lib/sound.ts';
import { installViewportHeight } from './lib/viewport.ts';
import { WalletProvider } from './features/wallet/Wallet.tsx';
import './styles.css';

installTapSound();
installViewportHeight();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </SessionProvider>
  </StrictMode>,
);
