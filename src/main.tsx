import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import CRMApp from './CRMApp.tsx';
import PortalApp from './PortalApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Check if current URL is requesting a public mobile portal (e.g. ?portal=cliente, ?portal=productor, ?type=productor, etc.)
const searchParams = new URLSearchParams(window.location.search);
const isPortalRequest = searchParams.has('portal') || searchParams.has('type');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isPortalRequest ? <PortalApp /> : <CRMApp />}
    </ErrorBoundary>
  </StrictMode>,
);
