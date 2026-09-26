import React from 'react';
import { Download, Share2, PlusSquare, X, Smartphone, Sparkles, ArrowDownToLine, ShieldCheck } from 'lucide-react';
import { usePWAInstall, PWAPortalType } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  portalType: PWAPortalType;
  appName?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'minimal';
}

export default function PWAInstallButton({
  portalType,
  appName,
  className = '',
  variant = 'primary'
}: PWAInstallButtonProps) {
  const { canInstall, isStandalone, isIOS, hasPrompt, showIOSModal, triggerInstall, closeIOSModal } = usePWAInstall(portalType);

  if (!canInstall || isStandalone) {
    return null;
  }

  const defaultTitles: Record<PWAPortalType, string> = {
    admin: 'Kalu Administración',
    cliente: 'Mundo Kalu - Cliente',
    productor: 'Mundo Kalu - Productor',
    contador: 'Kalu Contador',
    general: 'Kalu App'
  };

  const displayName = appName || defaultTitles[portalType];

  // Renderizado con diseño visual curado según la identidad de cada portal
  const renderStyledButton = () => {
    switch (portalType) {
      case 'admin':
        return (
          <button
            type="button"
            onClick={triggerInstall}
            className={`group w-full relative flex items-center justify-center gap-2.5 py-3 px-4 rounded border border-editorial-border bg-editorial-bg hover:bg-editorial-border/30 hover:border-brand-accent/60 text-editorial-text-primary transition-all duration-200 cursor-pointer shadow-sm ${className}`}
            title="Instalar Kalu Administración en su dispositivo"
          >
            <div className="w-6 h-6 rounded bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent group-hover:scale-105 transition-transform">
              <Download className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[11px] font-serif font-bold tracking-tight uppercase leading-tight">
                Instalar Kalu Admin
              </span>
              <span className="text-[9px] font-mono text-editorial-text-muted tracking-wider uppercase">
                Aplicación nativa de escritorio
              </span>
            </div>
          </button>
        );

      case 'cliente':
        return (
          <button
            type="button"
            onClick={triggerInstall}
            className={`group w-full relative flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 transition-all duration-200 cursor-pointer shadow-lg shadow-amber-500/5 ${className}`}
            title="Instalar Mundo Kalu en tu teléfono"
          >
            <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold tracking-wide uppercase text-amber-200 leading-tight">
                Instalar App Mundo Kalu
              </span>
              <span className="text-[9px] text-amber-400/70 font-mono tracking-wider">
                Acceso directo rápido y seguro
              </span>
            </div>
          </button>
        );

      case 'productor':
        return (
          <button
            type="button"
            onClick={triggerInstall}
            className={`group w-full relative flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-300 transition-all duration-200 cursor-pointer shadow-lg shadow-emerald-500/5 ${className}`}
            title="Instalar Libreta Productor en tu teléfono"
          >
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold tracking-wide uppercase text-emerald-200 leading-tight">
                Instalar App Productor
              </span>
              <span className="text-[9px] text-emerald-400/70 font-mono tracking-wider">
                Libreta digital en tu pantalla
              </span>
            </div>
          </button>
        );

      default:
        return (
          <button
            type="button"
            onClick={triggerInstall}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-all cursor-pointer ${className}`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Instalar Aplicación</span>
          </button>
        );
    }
  };

  return (
    <>
      {renderStyledButton()}

      {/* Modal de instrucciones para iOS Safari / WebKit */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-sm w-full p-6 text-white shadow-2xl relative">
            <button
              onClick={closeIOSModal}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Instalar {displayName}</h3>
                <p className="text-[11px] text-zinc-400">Acceso directo como aplicación nativa</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p className="leading-relaxed">
                Para instalar esta aplicación en tu dispositivo:
              </p>

              <div className="bg-zinc-800/60 rounded-xl p-3.5 space-y-2.5 border border-zinc-700/50">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center shrink-0 text-[10px] font-bold">
                    1
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Presiona el botón</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-700 text-white font-medium">
                      <Share2 className="w-3 h-3 text-blue-400" /> Compartir
                    </span>
                    <span>en la barra de Safari.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center shrink-0 text-[10px] font-bold">
                    2
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Selecciona</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-700 text-white font-medium">
                      <PlusSquare className="w-3 h-3 text-emerald-400" /> Agregar a pantalla de inicio
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center shrink-0 text-[10px] font-bold">
                    3
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>Pulsa <strong>Agregar</strong> en la esquina superior derecha.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={closeIOSModal}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
