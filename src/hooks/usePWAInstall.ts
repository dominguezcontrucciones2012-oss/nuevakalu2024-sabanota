import { useState, useEffect, useCallback } from 'react';
import { pwaInstallStore, PWAPortalType } from '../services/pwaStore';

export type { PWAPortalType };

export function usePWAInstall(portalType: PWAPortalType = 'general') {
  const [state, setState] = useState(() => pwaInstallStore.getState());
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);

  useEffect(() => {
    // Suscribirse a cambios del store global de PWA
    const unsubscribe = pwaInstallStore.subscribe(() => {
      setState(pwaInstallStore.getState());
    });

    // Sincronizar estado actual
    setState(pwaInstallStore.getState());

    return () => {
      unsubscribe();
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    const result = await pwaInstallStore.triggerInstall();
    if (result === 'ios_flow') {
      setShowIOSModal(true);
    } else if (result === 'no_prompt') {
      // En Windows / Chromium si no hay prompt disponible, NO abrimos el modal de iOS
      setShowIOSModal(false);
    }
  }, []);

  const closeIOSModal = useCallback(() => {
    setShowIOSModal(false);
  }, []);

  // Regla de Experiencia:
  // En iOS: se muestra si no está en modo standalone.
  // En Windows / Android / Chromium: solo se muestra si existe el prompt nativo real (hasPrompt === true) y no está instalada.
  const canInstall = !state.isStandalone && !state.isInstalled && (state.hasPrompt || state.isIOS);

  return {
    canInstall,
    isStandalone: state.isStandalone,
    isIOS: state.isIOS,
    hasPrompt: state.hasPrompt,
    isInstalled: state.isInstalled,
    showIOSModal,
    triggerInstall,
    closeIOSModal
  };
}
