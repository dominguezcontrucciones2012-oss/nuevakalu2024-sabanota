import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, TerminalSquare, AlertCircle } from 'lucide-react';

interface QrScannerTabProps {
  loggedClient: any;
  onNavigateTab: (tab: string) => void;
  getClientLevelInfo: (points: number) => { level: number; name?: string; nextGoal?: number; nextPrize?: string; progress?: number; discount?: number; };
}

export function QrScannerTab({ loggedClient, onNavigateTab, getClientLevelInfo }: QrScannerTabProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [showQrPaymentModal, setShowQrPaymentModal] = useState(false);
  const [qrPaymentAmount, setQrPaymentAmount] = useState('');
  const [scannedStore, setScannedStore] = useState('Mundo Kalu - Tienda Principal');
  
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Initialize Scanner safely
  const startScanner = async () => {
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("reader");
      }
      
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      await scannerRef.current.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          // On successful scan
          if (scannerRef.current?.isScanning) {
            scannerRef.current.stop().catch(console.error);
            setScannerActive(false);
          }
          handleSuccessfulScan(decodedText);
        },
        (errorMessage) => {
          // Parse errors are expected on every frame without a QR, safely ignore
        }
      );
      
      setHasPermission(true);
      setScannerActive(true);
    } catch (err) {
      console.error("Error starting camera: ", err);
      setHasPermission(false);
      setScannerActive(false);
    }
  };

  const handleSuccessfulScan = (text: string) => {
    // If the text is JSON or has a structure, we would parse it here.
    // For now, we simulate finding the store.
    setScannedStore("Mundo Kalu - Tienda Principal");
    setShowQrPaymentModal(true);
  };

  const requestCamera = () => {
    startScanner();
  };
  
  const handleManualEntry = () => {
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(console.error);
      setScannerActive(false);
    }
    setScannedStore("Mundo Kalu - Tienda Principal");
    setShowQrPaymentModal(true);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  return (
    <div className="flex-1 bg-zinc-950 flex flex-col relative animate-fade-in pb-16 h-full">
      <div className="absolute inset-0 bg-emerald-900/10 opacity-30"></div>
      
      <div className="relative z-10 flex flex-col h-full p-6 pt-10">
        <div className="text-center mb-6">
          <h2 className="text-xl font-black text-white mb-2">Escanear QR de Pago</h2>
          <p className="text-zinc-500 text-[10px] mt-4 max-w-[200px] mx-auto text-center">
            Mundo Kalu App v2.4.1 • La cámara local está desactivada.
          </p>
          
          {/* DEV FALLBACK FOR TESTING PWA -> POS */}
          <div className="mt-8 w-full max-w-[300px] border border-amber-500/30 rounded-xl p-4 bg-amber-500/5">
             <h3 className="text-amber-500 font-black text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>⚡</span> Modo Dev (Simular Escaneo)
             </h3>
             <div className="space-y-3">
                <button
                   onClick={() => handleManualEntry()}
                   className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 py-2.5 rounded-lg text-xs font-bold transition-colors"
                >
                   Simular Escaneo de Tienda
                </button>
             </div>
          </div>
          <p className="text-[10px] text-zinc-400 max-w-[250px] mx-auto mt-6">
            Apunta al código QR ubicado en la vitrina o mostrador de la tienda
          </p>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center pb-20">
          
          {/* Scanner Container */}
          <div className="relative w-full max-w-[300px] aspect-square rounded-3xl overflow-hidden bg-black border-2 border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.15)]">
            <div id="reader" className="w-full h-full object-cover"></div>
            
            {/* Visual Guide Overlay (only when scanning) */}
            {scannerActive && (
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-emerald-400 shadow-[0_0_15px_#34d399] animate-pulse"></div>
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-3xl m-4"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-3xl m-4"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-3xl m-4"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-3xl m-4"></div>
              </div>
            )}

            {/* Permission or Initial State */}
            {!scannerActive && (
              <div className="absolute inset-0 bg-zinc-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                {hasPermission === false ? (
                  <>
                    <AlertCircle className="w-12 h-12 text-red-500 mb-3 opacity-80" />
                    <p className="text-xs text-white font-bold mb-1">Cámara no detectada</p>
                    <p className="text-[10px] text-zinc-400 mb-4">Revisa los permisos de tu navegador o dispositivo.</p>
                    <button onClick={requestCamera} className="bg-emerald-500 text-black text-[10px] font-bold px-4 py-2 rounded-full uppercase tracking-wider">
                      Reintentar
                    </button>
                  </>
                ) : (
                  <>
                    <Camera className="w-12 h-12 text-emerald-500 mb-3 opacity-80" />
                    <button 
                      onClick={requestCamera}
                      className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold uppercase rounded-xl text-xs px-5 py-3 tracking-wider shadow-lg transition-all"
                    >
                      Activar Cámara para Escanear
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
        
        {/* Bottom Actions */}
        <div className="absolute bottom-24 left-0 right-0 flex justify-center px-6 z-30">
          <button 
            onClick={handleManualEntry}
            className="w-full max-w-[300px] bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center gap-2 py-3.5 text-[11px] font-bold text-zinc-300 hover:text-white transition-colors shadow-xl"
          >
            <TerminalSquare className="w-4 h-4" />
            Ingresar monto manualmente
          </button>
        </div>
      </div>

      {/* Payment Confirmation Modal */}
      {showQrPaymentModal && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
          <div className="bg-zinc-950 border-t border-zinc-800 rounded-t-[2.5rem] p-6 w-full max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 pb-20">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-black text-white">Pago en Mostrador</h3>
                <p className="text-[10px] text-emerald-400 uppercase tracking-widest">{scannedStore}</p>
              </div>
              <button 
                onClick={() => { setShowQrPaymentModal(false); setQrPaymentAmount(''); }} 
                className="w-8 h-8 flex items-center justify-center bg-zinc-900 text-zinc-400 hover:text-white rounded-full"
              >✕</button>
            </div>
            
            <div className="mb-6">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Total de tu compra (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-emerald-500">$</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={qrPaymentAmount}
                  onChange={(e) => setQrPaymentAmount(e.target.value)}
                  className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-2xl py-4 pl-10 pr-4 text-3xl font-black text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
            
            {Number(qrPaymentAmount || 0) > 0 && (() => {
              const amount = Number(qrPaymentAmount || 0);
              const level = getClientLevelInfo((loggedClient as any)?.loyaltyPoints || 0).level;
              const inicialPct = level >= 5 ? 0.10 : level >= 3 ? 0.15 : 0.20;
              const inicial = amount * inicialPct;
              const aFinanciar = amount - inicial;
              const cuotas = aFinanciar / 4; // 4 quincenas
              
              return (
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 mb-6 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Inicial Requerida ({Math.round(inicialPct * 100)}%)</span>
                    <span className="text-sm font-black text-emerald-400">${Number(inicial || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Saldo a Financiar</span>
                    <span className="text-sm font-black text-white">${Number(aFinanciar || 0).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-zinc-800 pt-3 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-zinc-300 uppercase">Esquema Sugerido</span>
                    <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded uppercase">4 Cuotas de ${cuotas.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
            
            <button 
              disabled={Number(qrPaymentAmount || 0) <= 0}
              onClick={async () => {
                const amount = Number(qrPaymentAmount || 0);
                const level = getClientLevelInfo((loggedClient as any)?.loyaltyPoints || 0).level;
                const inicialPct = level >= 5 ? 0.10 : level >= 3 ? 0.15 : 0.20;
                const inicial = amount * inicialPct;
                const aFinanciar = amount - inicial;
                const cuotas = aFinanciar / 4;
                
                const payload = {
                  id: `PWA-CASHEA-${Date.now()}`,
                  type: 'credito_cashea',
                  entityId: loggedClient.id,
                  entityName: loggedClient.name,
                  amount: amount,
                  currency: 'USD',
                  reference: 'QR-COMPRA',
                  method: 'Cashea',
                  status: 'pending',
                  date: new Date().toISOString(),
                  timestamp: new Date().toISOString(),
                  casheaData: {
                    inicial,
                    aFinanciar,
                    cuotas,
                    tienda: scannedStore
                  }
                };

                try {
                  const { addLocalDoc } = await import('../services/localApi');
                  await addLocalDoc('pwa_payments', payload);
                  alert('Solicitud de Crédito QR enviada al Centro de Cobranzas para aprobación.');
                  setShowQrPaymentModal(false);
                  setQrPaymentAmount('');
                  onNavigateTab('inicio');
                } catch (e) {
                  console.error(e);
                  alert('Error al procesar la compra a crédito.');
                }
              }}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-black uppercase rounded-2xl text-sm tracking-widest transition-all"
            >
              PROCESAR COMPRA A CRÉDITO
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
