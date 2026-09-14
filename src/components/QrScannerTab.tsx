import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, AlertCircle, ShieldCheck, Lock, RefreshCw, X } from 'lucide-react';
import { signTransactionApproval } from '../utils/crypto';
import { fetchCollection, updateLocalDoc } from '../services/localApi';

interface QrScannerTabProps {
  loggedClient: any;
  onNavigateTab: (tab: string) => void;
  getClientLevelInfo: (points: number) => { level: number; name?: string; nextGoal?: number; nextPrize?: string; progress?: number; discount?: number; };
  onAddNotification: (msg: string, type: 'success'|'info'|'warning') => void;
}

export function QrScannerTab({ loggedClient, onNavigateTab, getClientLevelInfo, onAddNotification }: QrScannerTabProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [showQrPaymentModal, setShowQrPaymentModal] = useState(false);
  const [fetchedTx, setFetchedTx] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [scannedStore, setScannedStore] = useState('Mundo Kalu - Tienda Principal (Caja)');
  
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const doFetchAndShowModal = async (storeName: string) => {
    console.log('[QR DIAGNOSTIC] Consultando orden activa para tienda:', storeName);
    console.log('[QR DIAGNOSTIC] Datos del cliente autenticado en PWA:', {
      id: loggedClient?.id,
      name: loggedClient?.name,
      cedula: loggedClient?.cedula,
      ciRif: loggedClient?.ciRif,
      phone: loggedClient?.phone
    });

    setScannedStore(storeName);
    setShowQrPaymentModal(true);
    setIsFetching(true);
    setFetchError('');
    setFetchedTx(null);

    try {
      const transactions = await fetchCollection('transactions');
      const clientList = Array.isArray(transactions) ? transactions : [];
      
      console.log(`[QR DIAGNOSTIC] Total de transacciones descargadas del servidor: ${clientList.length}`);

      const pending = clientList.filter((tx: any) => 
        (tx.status === 'pending_approval') &&
        (
          String(tx.clientId) === String(loggedClient?.id) ||
          (tx.clientCi && (tx.clientCi === loggedClient?.cedula || tx.clientCi === loggedClient?.ciRif || tx.clientCi === loggedClient?.ci)) ||
          (tx.clientCiRif && (tx.clientCiRif === loggedClient?.cedula || tx.clientCiRif === loggedClient?.ciRif)) ||
          (tx.clientPhone && tx.clientPhone === loggedClient?.phone)
        )
      );
      
      console.log(`[QR DIAGNOSTIC] Órdenes pendientes que coinciden con este cliente:`, pending);

      if (pending.length > 0) {
        // Ordenar para tomar la orden más reciente
        pending.sort((a: any, b: any) => new Date(b.timestamp || b.date).getTime() - new Date(a.timestamp || a.date).getTime());
        const selectedTx = pending[0];
        console.log('[QR DIAGNOSTIC] -> Orden seleccionada para aprobación:', selectedTx);
        setFetchedTx(selectedTx);
      } else {
        setFetchedTx(null);
        setFetchError('No se encontró ninguna orden pendiente en caja para tu usuario. Asegúrate de que el cajero haya seleccionado Crédito Kalú en el POS.');
      }
    } catch (e) {
      console.error('[QR DIAGNOSTIC] Error al consultar transacciones pendientes:', e);
      setFetchedTx(null);
      setFetchError('Error de conexión al consultar la orden activa en el servidor.');
    } finally {
      setIsFetching(false);
    }
  };

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
          if (scannerRef.current?.isScanning) {
            scannerRef.current.stop().catch(console.error);
            setScannerActive(false);
          }
          handleSuccessfulScan(decodedText);
        },
        () => {
          // Frame errors are normal when no QR is in view
        }
      );
      
      setHasPermission(true);
      setScannerActive(true);
    } catch (err) {
      console.error("[QR DIAGNOSTIC] Error iniciando cámara: ", err);
      setHasPermission(false);
      setScannerActive(false);
    }
  };

  const handleSuccessfulScan = (text: string) => {
    const cleanText = text.trim();
    console.log('[QR DIAGNOSTIC] 📷 ¡QR FÍSICO ESCANEADO Y DECODIFICADO POR CÁMARA!');
    console.log('[QR DIAGNOSTIC] Cadena de texto / URL cruda obtenida:', cleanText);

    // Validar concordancia con el QR Maestro Institucional del Menú (AccessControlView)
    const isOfficialInstitutionalQr = cleanText.includes('sistemakalu.com') || 
                                     cleanText.includes('portal=cliente') || 
                                     cleanText.includes('#qr') ||
                                     cleanText.includes('kalu');

    const storeTitle = isOfficialInstitutionalQr 
      ? "Mundo Kalu - Tienda Principal (Caja)"
      : "Punto de Venta Autorizado Kalu";

    console.log('[QR DIAGNOSTIC] Validación institucional:', {
      isOfficial: isOfficialInstitutionalQr,
      assignedStore: storeTitle
    });

    doFetchAndShowModal(storeTitle);
  };

  const requestCamera = () => {
    startScanner();
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
      
      <div className="relative z-10 flex flex-col h-full p-6 pt-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
            <Camera className="w-3.5 h-3.5" /> Escaneo Requerido
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Escanear QR de Mostrador</h2>
          <p className="text-xs text-zinc-400 max-w-[280px] mx-auto leading-relaxed">
            Apunta la cámara de tu teléfono al código QR físico ubicado en la vitrina o caja de la tienda.
          </p>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center pb-12">
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
              <div className="absolute inset-0 bg-zinc-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                {hasPermission === false ? (
                  <>
                    <AlertCircle className="w-12 h-12 text-rose-500 mb-3 opacity-80" />
                    <p className="text-xs text-white font-bold mb-1">Cámara no detectada o bloqueada</p>
                    <p className="text-[11px] text-zinc-400 mb-4">Por favor permite el acceso a la cámara para escanear el QR de la tienda.</p>
                    <button onClick={requestCamera} className="bg-emerald-500 text-black text-xs font-bold px-5 py-2.5 rounded-full uppercase tracking-wider shadow-md">
                      Reintentar Permisos
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
                      <Camera className="w-8 h-8 text-emerald-400" />
                    </div>
                    <p className="text-xs text-zinc-300 mb-4 font-medium">Activa tu cámara para vincular tu compra activa en caja</p>
                    <button 
                      onClick={requestCamera}
                      className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black uppercase rounded-xl text-xs px-6 py-3.5 tracking-wider shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                    >
                      Activar Cámara
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">
              Flujo Seguro • Firma Criptográfica Verificada
            </span>
          </div>
        </div>
      </div>

      {/* Payment Confirmation Modal - ONLY SHOWN AFTER SCANNING */}
      {showQrPaymentModal && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
          <div className="bg-zinc-950 border-t border-zinc-800 rounded-t-[2.5rem] p-6 w-full max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 pb-20">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-zinc-800/80">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                  <h3 className="text-lg font-black text-white">Autorización de Compra</h3>
                </div>
                <p className="text-[11px] text-emerald-400 font-medium uppercase tracking-wider mt-0.5">{scannedStore}</p>
              </div>
              <button 
                onClick={() => { setShowQrPaymentModal(false); setFetchedTx(null); }} 
                className="w-8 h-8 flex items-center justify-center bg-zinc-900 text-zinc-400 hover:text-white rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* DYNAMIC CONTENT BASED ON FETCH */}
            {isFetching ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-xs text-zinc-400 font-medium">Buscando tu orden activa en caja...</p>
              </div>
            ) : fetchedTx ? (
              <div className="space-y-4">
                {/* Total Card */}
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-5 text-center relative overflow-hidden">
                  <div className="text-[11px] text-emerald-300 uppercase tracking-wider font-bold mb-1">Monto Total de la Venta</div>
                  <div className="text-4xl font-black text-white tracking-tight">
                    ${Number(fetchedTx.amount || fetchedTx.totalUSD || 0).toFixed(2)}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" /> Factura: {fetchedTx.invoiceNumber || 'N/A'}
                  </div>
                </div>

                {/* Plan Breakdown */}
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Inicial a Pagar en Caja (75%):</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ${Number(fetchedTx.downPayment || fetchedTx.kaluCreditData?.inicial || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Saldo Financiado Kalú (25%):</span>
                    <span className="text-white font-bold text-sm">
                      ${Number(fetchedTx.financedAmount || fetchedTx.kaluCreditData?.aFinanciar || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-zinc-800/80 pt-2.5 text-zinc-400">
                    <span>Plan de Cuotas:</span>
                    <span className="text-amber-400 font-bold">
                      {fetchedTx.installmentsCount || 2} cuota{(fetchedTx.installmentsCount || 2) > 1 ? 's' : ''} de ${Number(fetchedTx.kaluCreditData?.cuotas || (fetchedTx.financedAmount / (fetchedTx.installmentsCount || 2)) || 0).toFixed(2)}
                    </span>
                  </div>

                  {fetchedTx.authNonce && (
                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-emerald-500" /> Token POS:</span>
                      <span className="bg-zinc-950 px-2 py-0.5 rounded text-zinc-400">{fetchedTx.authNonce.slice(0, 16)}...</span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-[11px] leading-relaxed">
                  <strong>Nota:</strong> Al firmar digitalmente, autorizas financiar el 25% restante. El cajero procederá a cobrar la inicial del 75% en caja para entregarte tus productos.
                </div>
                
                <button 
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      const clientCi = loggedClient?.ciRif || loggedClient?.cedula || loggedClient?.ci || '';
                      const txAmount = Number(fetchedTx.amount || fetchedTx.totalUSD || 0);
                      const nonce = fetchedTx.authNonce || `NONCE-${Date.now()}`;
                      console.log('[QR DIAGNOSTIC] 🔐 Firmando digitalmente transacción:', {
                        txId: fetchedTx.id,
                        invoiceNumber: fetchedTx.invoiceNumber,
                        clientId: loggedClient?.id,
                        clientCi,
                        amount: txAmount,
                        nonce
                      });

                      // Firma Criptográfica con Token Único
                      const { signature, timestamp } = await signTransactionApproval({
                        txId: fetchedTx.id,
                        clientId: String(loggedClient?.id || ''),
                        clientCi: String(clientCi),
                        amount: txAmount,
                        nonce: nonce
                      });

                      console.log('[QR DIAGNOSTIC] ✍️ Firma generada:', {
                        signature,
                        timestamp
                      });

                      const payload = { 
                        status: 'approved',
                        authNonce: nonce,
                        authSignature: signature,
                        approvedByClientAt: timestamp
                      };

                      console.log('[QR DIAGNOSTIC] 🚀 Enviando actualización al servidor (updateLocalDoc):', payload);

                      await updateLocalDoc('transactions', fetchedTx.id, payload);
                      
                      onAddNotification('¡Compra Firmada Digitalmente y Aprobada!', 'success');
                      setShowQrPaymentModal(false);
                      setFetchedTx(null);
                      onNavigateTab('inicio');
                    } catch (e) {
                      console.error('Error al firmar transacción:', e);
                      onAddNotification('Error al firmar y aprobar la compra a crédito.', 'warning');
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-black uppercase rounded-2xl text-sm tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  {isSubmitting ? "FIRMANDO TRANSACCIÓN..." : "FIRMAR DIGITALMENTE Y APROBAR"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-5 text-left">
                  <div className="flex items-center gap-2 text-rose-400 font-bold uppercase text-xs mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>Sin Orden Activa en Mostrador</span>
                  </div>
                  <p className="text-xs text-rose-200 leading-relaxed">
                    {fetchError || "No hay cobros pendientes para tu cédula en el servidor en este momento."}
                  </p>
                  <div className="mt-3 pt-3 border-t border-rose-500/20 text-[10px] text-zinc-400 font-mono">
                    Cliente Activo: {loggedClient ? `${loggedClient.name} (CI: ${loggedClient.cedula || loggedClient.ciRif || loggedClient.id})` : 'No autenticado'}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => doFetchAndShowModal(scannedStore)}
                    className="flex-1 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-white font-bold rounded-xl text-xs uppercase flex items-center justify-center gap-2 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reintentar Consulta
                  </button>
                  <button
                    onClick={() => { setShowQrPaymentModal(false); setFetchedTx(null); }}
                    className="flex-1 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white font-bold rounded-xl text-xs uppercase transition-all"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
