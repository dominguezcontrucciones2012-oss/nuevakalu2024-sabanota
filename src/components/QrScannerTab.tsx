import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, AlertCircle, ShieldCheck, Lock, RefreshCw, X } from 'lucide-react';
import { fetchPortalClientTransactionsApi, approvePortalClientTransactionApi } from '../services/localApi';
import { getVipTheme } from '../config/vipTheme';

interface QrScannerTabProps {
  loggedClient: any;
  onNavigateTab: (tab: string) => void;
  getClientLevelInfo: (points: number) => { level: number; code?: string; name?: string; nextGoal?: number; nextPrize?: string; progress?: number; discount?: number; };
  onAddNotification: (msg: string, type: 'success'|'info'|'warning') => void;
  vipCode?: string;
}

export function QrScannerTab({ loggedClient, onNavigateTab, getClientLevelInfo, onAddNotification, vipCode }: QrScannerTabProps) {
  const currentCode = vipCode || (loggedClient ? getClientLevelInfo(loggedClient.loyaltyPoints)?.code : undefined);
  const theme = getVipTheme(currentCode);
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
      const transactions = await fetchPortalClientTransactionsApi();
      const clientList = Array.isArray(transactions) ? transactions : [];
      
      console.log(`[QR DIAGNOSTIC] Total de transacciones descargadas del servidor: ${clientList.length}`);

      const pending = clientList.filter((tx: any) => tx.status === 'pending_approval');
      
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
    <div className="flex-1 bg-neutral-950 flex flex-col relative animate-fade-in pb-16 h-full">
      <div className={`absolute inset-0 ${theme.glowBg} opacity-30`}></div>
      
      <div className="relative z-10 flex flex-col h-full p-6 pt-8">
        <div className="text-center mb-6">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${theme.accentBg} border ${theme.borderSubtle} ${theme.textAccent} text-xs font-semibold mb-3`}>
            <Camera className="w-3.5 h-3.5" /> Escaneo Requerido
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Escanear QR de Mostrador</h2>
          <p className="text-xs text-zinc-400 max-w-[280px] mx-auto leading-relaxed">
            Apunta la cámara de tu teléfono al código QR físico ubicado en la vitrina o caja de la tienda.
          </p>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center pb-12">
          {/* Scanner Container */}
          <div className={`relative w-full max-w-[300px] aspect-square rounded-3xl overflow-hidden bg-black border-2 ${theme.borderSubtle} ${theme.glow}`}>
            <div id="reader" className="w-full h-full object-cover"></div>
            
            {/* Visual Guide Overlay (only when scanning) */}
            {scannerActive && (
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className={`absolute top-1/2 left-0 w-full h-0.5 ${theme.bottomLine} ${theme.glow} animate-pulse`}></div>
                <div className={`absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 ${theme.border} rounded-tl-3xl m-4`}></div>
                <div className={`absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 ${theme.border} rounded-tr-3xl m-4`}></div>
                <div className={`absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 ${theme.border} rounded-bl-3xl m-4`}></div>
                <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 ${theme.border} rounded-br-3xl m-4`}></div>
              </div>
            )}

            {/* Permission or Initial State */}
            {!scannerActive && (
              <div className="absolute inset-0 bg-neutral-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                {hasPermission === false ? (
                  <>
                    <AlertCircle className="w-12 h-12 text-rose-500 mb-3 opacity-80" />
                    <p className="text-xs text-white font-bold mb-1">Cámara no detectada o bloqueada</p>
                    <p className="text-[11px] text-zinc-400 mb-4">Por favor permite el acceso a la cámara para escanear el QR de la tienda.</p>
                    <button onClick={requestCamera} className={`${theme.btnPrimary} text-xs font-black px-5 py-2.5 rounded-full uppercase tracking-wider shadow-md`}>
                      Reintentar Permisos
                    </button>
                  </>
                ) : (
                  <>
                    <div className={`w-16 h-16 rounded-2xl ${theme.accentBg} border ${theme.borderSubtle} flex items-center justify-center mb-4`}>
                      <Camera className={`w-8 h-8 ${theme.textAccent}`} />
                    </div>
                    <p className="text-xs text-zinc-300 mb-4 font-medium">Activa tu cámara para vincular tu compra activa en caja</p>
                    <button 
                      onClick={requestCamera}
                      className={`${theme.btnPrimary} font-black uppercase rounded-xl text-xs px-6 py-3.5 tracking-wider shadow-lg transition-all active:scale-95`}
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
          <div className={`bg-neutral-950 border-t ${theme.cardModalBorder} rounded-t-[2.5rem] p-6 w-full max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 pb-20`}>
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-neutral-800/80">
              <div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${theme.badgeBg} animate-ping`}></div>
                  <h3 className="text-lg font-black text-white">Autorización de Compra</h3>
                </div>
                <p className={`text-[11px] ${theme.textAccent} font-bold uppercase tracking-wider mt-0.5`}>{scannedStore}</p>
              </div>
              <button 
                onClick={() => { setShowQrPaymentModal(false); setFetchedTx(null); }} 
                className="w-8 h-8 flex items-center justify-center bg-neutral-900 text-zinc-400 hover:text-white rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* DYNAMIC CONTENT BASED ON FETCH */}
            {isFetching ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <RefreshCw className={`w-8 h-8 ${theme.textAccent} animate-spin`} />
                <p className="text-xs text-zinc-400 font-medium">Buscando tu orden activa en caja...</p>
              </div>
            ) : fetchedTx ? (
              <div className="space-y-4">
                {/* Total Card */}
                <div className={`bg-gradient-to-br from-neutral-900 to-neutral-900/50 border ${theme.cardModalBorder} rounded-2xl p-5 text-center relative overflow-hidden`}>
                  <div className={`text-[11px] ${theme.textAccent} uppercase tracking-wider font-bold mb-1`}>Monto Total de la Venta</div>
                  <div className="text-4xl font-black text-white tracking-tight">
                    ${Number(fetchedTx.amount || fetchedTx.totalUSD || 0).toFixed(2)}
                  </div>
                  <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${theme.accentBg} ${theme.textAccentLight} text-[10px] font-mono border ${theme.borderSubtle}`}>
                    <ShieldCheck className={`w-3 h-3 ${theme.textAccent}`} /> Factura: {fetchedTx.invoiceNumber || 'N/A'}
                  </div>
                </div>

                {/* Plan Breakdown */}
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Inicial a Pagar en Caja ({fetchedTx.downPayment !== undefined && fetchedTx.amount ? Math.round((Number(fetchedTx.downPayment) / Number(fetchedTx.amount)) * 100) : 75}%):</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ${Number(fetchedTx.downPayment || fetchedTx.kaluCreditData?.inicial || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Saldo Financiado Kalú ({fetchedTx.financedAmount !== undefined && fetchedTx.amount ? Math.round((Number(fetchedTx.financedAmount) / Number(fetchedTx.amount)) * 100) : 25}%):</span>
                    <span className="text-white font-bold text-sm">
                      ${Number(fetchedTx.financedAmount || fetchedTx.kaluCreditData?.aFinanciar || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-start border-t border-zinc-800/80 pt-2.5 text-zinc-400">
                    <span>{fetchedTx.kaluCreditData?.modalidad === 'fiado_total' ? 'Modalidad:' : 'Plan de Cuotas:'}</span>
                    <div className="text-right">
                      {fetchedTx.kaluCreditData?.modalidad === 'fiado_total' ? (
                        <span className={`${theme.textAccent} font-bold uppercase`}>Deuda Abierta ($0 inicial, saldo total)</span>
                      ) : Array.isArray(fetchedTx.kaluCreditData?.cuotas) && fetchedTx.kaluCreditData.cuotas.length > 0 ? (
                        <div className="space-y-1">
                          {fetchedTx.kaluCreditData.cuotas.map((amt: number, idx: number) => (
                            <div key={idx} className={`${theme.textAccent} font-bold`}>
                              Cuota #{idx + 1} (+{(idx + 1) * 15}d): ${Number(amt).toFixed(2)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className={`${theme.textAccent} font-bold`}>
                          {fetchedTx.installmentsCount || 2} cuota{(fetchedTx.installmentsCount || 2) > 1 ? 's' : ''} de ${Number((fetchedTx.financedAmount / (fetchedTx.installmentsCount || 2)) || 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {fetchedTx.authNonce && (
                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-emerald-500" /> Token POS:</span>
                      <span className="bg-zinc-950 px-2 py-0.5 rounded text-zinc-400">{fetchedTx.authNonce.slice(0, 16)}...</span>
                    </div>
                  )}
                </div>

                <div className={`p-3 ${theme.accentBg} border ${theme.borderSubtle} rounded-xl ${theme.textAccentLight} text-[11px] leading-relaxed`}>
                  <strong>Nota:</strong> Al firmar digitalmente, autorizas financiar ${Number(fetchedTx.financedAmount || fetchedTx.kaluCreditData?.aFinanciar || 0).toFixed(2)} USD. {Number(fetchedTx.downPayment || 0) > 0 ? `El cajero procederá a cobrar la inicial de $${Number(fetchedTx.downPayment).toFixed(2)} USD en caja para entregarte tus productos.` : 'Venta autorizada sin inicial requerida.'}
                </div>
                
                <button 
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      const nonce = fetchedTx.authNonce;
                      if (!nonce) {
                        onAddNotification('Error de seguridad: La transacción no contiene un nonce válido del servidor.', 'warning');
                        setIsSubmitting(false);
                        return;
                      }

                      console.log('[QR DIAGNOSTIC] 🚀 Enviando autorización al servidor (approvePortalClientTransactionApi):', {
                        txId: fetchedTx.id,
                        authNonce: nonce
                      });

                      await approvePortalClientTransactionApi(fetchedTx.id, {
                        authNonce: nonce
                      });
                      
                      onAddNotification('¡Compra Autorizada y Aprobada con Éxito!', 'success');
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
                  className={`w-full py-4 ${theme.btnPrimary} font-black uppercase rounded-2xl text-sm tracking-widest transition-all shadow-lg active:scale-95 cursor-pointer`}
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
