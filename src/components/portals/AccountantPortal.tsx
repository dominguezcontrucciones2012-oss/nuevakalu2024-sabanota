import React, { useState } from 'react';
import { QrCode, Scan } from 'lucide-react';
import InvoiceUploadView from '../contador/InvoiceUploadView';
import { MobilePortalsViewProps } from '../MobilePortalsView';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';

export default function AccountantPortal({ isolatedType }: MobilePortalsViewProps) {
  const [daisyScanned, setDaisyScanned] = useState(false);

  const accountantSwipeHandlers = useSwipeNavigation({
    tabs: ['scanner', 'upload'],
    activeTab: daisyScanned ? 'upload' : 'scanner',
    onTabChange: (newTab) => setDaisyScanned(newTab === 'upload')
  });

  return (
    <div className={!isolatedType ? "flex flex-col items-center bg-brand-accent/5 border border-brand-accent/20 rounded-xl p-6 shadow-sm" : "w-full min-h-screen bg-black text-white flex flex-col"}>
      {!isolatedType && (
        <div className="text-center mb-4">
          <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-brand-accent mb-1">
            Dispositivo: Empleado (Daisy)
          </h3>
          <p className="text-[10px] text-editorial-text-muted">Carga Rápida mediante QR</p>
        </div>
      )}

      {/* Smartphone Shell Mockup */}
      <div className={!isolatedType ? "w-[335px] h-[610px] bg-zinc-950 border-[8px] border-zinc-800 rounded-[38px] overflow-hidden shadow-2xl relative flex flex-col font-sans select-none" : "flex-1 w-full bg-zinc-950 flex flex-col font-sans select-none"}>
        {/* Speaker & Camera Notch */}
        {!isolatedType && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4.5 bg-zinc-800 rounded-b-xl z-20 flex justify-center items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 mr-2" />
            <div className="w-10 h-1 rounded-full bg-zinc-900" />
          </div>
        )}

        {/* Screen Content */}
        <div 
          {...accountantSwipeHandlers}
          className={`flex-1 overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col text-xs relative touch-pan-y ${!isolatedType ? 'pt-7' : ''}`}
        >
          {!daisyScanned ? (
            <div className="flex-1 flex flex-col justify-center items-center p-6 text-center">
              <div className="w-16 h-16 bg-brand-accent/20 rounded-full flex items-center justify-center mb-4 animate-pulse">
                <QrCode className="w-8 h-8 text-brand-accent" />
              </div>
              <h4 className="text-lg font-bold text-zinc-100 mb-2">Escanear QR de Área</h4>
              <p className="text-xs text-zinc-400 mb-8">Punto de Carga de Facturas y Control de Costos</p>
              
              <button 
                onClick={() => setDaisyScanned(true)}
                className="w-full py-3 bg-brand-accent hover:bg-amber-400 text-zinc-950 font-bold uppercase rounded-xl text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-accent/20"
              >
                <Scan className="w-4 h-4" />
                Acceder al Módulo
              </button>
            </div>
          ) : (
            <div className="absolute inset-0 pt-7">
              <InvoiceUploadView onBack={() => setDaisyScanned(false)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
