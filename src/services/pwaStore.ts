export type PWAPortalType = 'admin' | 'cliente' | 'productor' | 'contador' | 'general';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type PWAInstallListener = () => void;

class PWAInstallStore {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isStandalone: boolean = false;
  private isIOS: boolean = false;
  private isInstalled: boolean = false;
  private listeners: Set<PWAInstallListener> = new Set();
  private initialized: boolean = false;

  constructor() {
    this.init();
  }

  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // 1. Detectar si ya corre en modo standalone (instalado)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      this.isStandalone = Boolean(isStandaloneMode);
      if (isStandaloneMode) {
        this.isInstalled = true;
      }
    };

    checkStandalone();

    const mediaMatcher = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      this.isStandalone = e.matches;
      if (e.matches) {
        this.isInstalled = true;
      }
      this.notify();
    };

    try {
      mediaMatcher.addEventListener('change', handleMediaChange);
    } catch {
      mediaMatcher.addListener(handleMediaChange);
    }

    // 2. Detectar iOS real (Safari / WebKit en iPhone, iPad, iPod)
    const userAgent = window.navigator.userAgent.toLowerCase();
    this.isIOS = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;

    // 3. Captura global y temprana de beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.notify();
    });

    // 4. Captura global de appinstalled
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.isInstalled = true;
      this.isStandalone = true;
      this.notify();
    });
  }

  public subscribe(listener: PWAInstallListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('Error in PWA listener', err);
      }
    }
  }

  public getState() {
    return {
      deferredPrompt: this.deferredPrompt,
      isStandalone: this.isStandalone,
      isIOS: this.isIOS,
      isInstalled: this.isInstalled,
      hasPrompt: Boolean(this.deferredPrompt)
    };
  }

  public async triggerInstall(): Promise<'prompt_shown' | 'ios_flow' | 'no_prompt'> {
    if (this.deferredPrompt) {
      try {
        const promptEvent = this.deferredPrompt;
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
          this.isInstalled = true;
        }
        // El evento beforeinstallprompt solo puede ser llamado una vez
        this.deferredPrompt = null;
        this.notify();
        return 'prompt_shown';
      } catch (err) {
        console.error('Error invoking deferredPrompt:', err);
        this.deferredPrompt = null;
        this.notify();
        return 'no_prompt';
      }
    }

    if (this.isIOS) {
      return 'ios_flow';
    }

    return 'no_prompt';
  }
}

export const pwaInstallStore = new PWAInstallStore();
