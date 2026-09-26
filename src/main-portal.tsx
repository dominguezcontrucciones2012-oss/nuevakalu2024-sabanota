import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import PortalApp from './PortalApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { pwaInstallStore } from './services/pwaStore';

pwaInstallStore.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PortalApp />
    </ErrorBoundary>
  </StrictMode>,
);
