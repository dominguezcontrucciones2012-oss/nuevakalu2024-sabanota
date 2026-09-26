import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import CRMApp from './CRMApp.tsx';
import PortalApp from './PortalApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { pwaInstallStore } from './services/pwaStore';

// Determinación determinista de la puerta de entrada y configuración de manifest PWA
const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '');
const searchParams = new URLSearchParams(window.location.search);
const portalParam = searchParams.get('portal') || searchParams.get('type');

type AppTarget = 'admin' | 'cliente' | 'productor' | 'contador';

function resolveAppTarget(): AppTarget {
  // 1. Rutas Canónicas por pathname
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return 'admin';
  }
  if (pathname === '/cliente' || pathname.startsWith('/cliente/')) {
    return 'cliente';
  }
  if (pathname === '/productor' || pathname.startsWith('/productor/')) {
    return 'productor';
  }
  if (pathname === '/contador' || pathname.startsWith('/contador/')) {
    return 'contador';
  }

  // 2. Parámetros legacy de búsqueda (?portal=... o ?type=...)
  if (portalParam === 'cliente') return 'cliente';
  if (portalParam === 'productor' || portalParam === 'proveedor') return 'productor';
  if (portalParam === 'contador') return 'contador';

  // 3. Hash legacy (#/cliente, #/productor, #/contador)
  const hash = window.location.hash.toLowerCase().replace('#/', '').replace('#', '');
  if (hash === 'cliente') return 'cliente';
  if (hash === 'productor' || hash === 'proveedor') return 'productor';
  if (hash === 'contador') return 'contador';

  // 4. Fallback por defecto: Administración
  return 'admin';
}

const appTarget = resolveAppTarget();

// Actualizar dinámicamente el manifest y título de la página según la puerta activa
function setupPWAIdentity(target: AppTarget) {
  let manifestHref = '/manifest-admin.json';
  let pageTitle = 'Kalu - Administración';
  let themeColor = '#f59e0b';

  if (target === 'cliente') {
    manifestHref = '/manifest-client.json';
    pageTitle = 'Mundo Kalu - Cliente';
    themeColor = '#f59e0b';
  } else if (target === 'productor') {
    manifestHref = '/manifest-producer.json';
    pageTitle = 'Mundo Kalu - Productor';
    themeColor = '#10b981';
  } else if (target === 'contador') {
    manifestHref = '/manifest-admin.json';
    pageTitle = 'Kalu - Portal Contador';
    themeColor = '#f59e0b';
  }

  document.title = pageTitle;

  // Actualizar o crear <link rel="manifest">
  let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    document.head.appendChild(manifestLink);
  }
  manifestLink.setAttribute('href', manifestHref);

  // Actualizar <meta name="theme-color">
  let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (themeMeta) {
    themeMeta.setAttribute('content', themeColor);
  }
}

setupPWAIdentity(appTarget);

// Iniciar store global de captura PWA inmediatamente tras fijar el manifest canónico
pwaInstallStore.init();

function renderApp() {
  if (appTarget === 'admin') {
    return <CRMApp />;
  }
  if (appTarget === 'cliente') {
    return <PortalApp initialPortalType="cliente" />;
  }
  if (appTarget === 'productor') {
    return <PortalApp initialPortalType="productor" />;
  }
  if (appTarget === 'contador') {
    return <PortalApp initialPortalType="contador" />;
  }
  return <CRMApp />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {renderApp()}
    </ErrorBoundary>
  </StrictMode>,
);

