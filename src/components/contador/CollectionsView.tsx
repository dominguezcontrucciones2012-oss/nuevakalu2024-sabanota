import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../../services/localApi';
import React, { useState, useEffect } from 'react';
import KaluLoader from '../KaluLoader';
import { Receipt, CheckCircle, XCircle, Clock, Bot, ShieldCheck, Image as ImageIcon, Eye, X, AlertTriangle, ZoomIn } from 'lucide-react';

interface PWAPayment {
  id: string;
  type?: 'cliente' | 'productor' | 'credito_cashea';
  clientId?: string;
  entityId: string;
  entityName: string;
  amount: number;
  amountBs?: number;
  currency?: 'USD' | 'VES' | string;
  reference: string;
  method?: string;
  paymentMethod?: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  timestamp?: any;
  installmentId?: string;
  installmentIds?: string[];
  receiptImageUrl?: string;
  receiptImage?: string;
  notes?: string;
  casheaData?: {
    inicial: number;
    aFinanciar: number;
    cuotas: number;
    tienda: string;
  };
}

export default function CollectionsView({
  onAddNotification
}: {
  onAddNotification?: (msg: string, type?: 'success'|'info'|'warning') => void;
}) {
  const [payments, setPayments] = useState<PWAPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<{
    imageUrl: string;
    entityName: string;
    amount: number;
    reference: string;
    date: string;
  } | null>(null);

  useEffect(() => {
    const unsub = onCollectionSnapshot('pwa_payments', (data) => {
      const p = data.map(doc => ({ ...doc } as PWAPayment));
      p.sort((a, b) => {
        const getMs = (tx: any) => {
          if (tx.timestamp && typeof tx.timestamp.toMillis === 'function') return tx.timestamp.toMillis();
          if (tx.timestamp && typeof tx.timestamp === 'number') return tx.timestamp;
          return new Date(tx.date).getTime() || 0;
        };
        return getMs(b) - getMs(a);
      });
      setPayments(p);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const handleApprovePayment = async (payment: PWAPayment) => {
    if (payment.status !== 'pending') {
      onAddNotification?.('El comprobante ya fue procesado anteriormente.', 'warning');
      return;
    }

    try {
      if (payment.type === 'credito_cashea') {
        await updateLocalDoc('pwa_payments', payment.id, {
          status: 'approved',
          approvedAt: new Date().toISOString()
        });

        const clientsRes = await fetchCollection('clients');
        const clients = Array.isArray(clientsRes) ? clientsRes : (clientsRes.json ? await clientsRes.json() : []);
        const targetId = payment.clientId || payment.entityId;
        const c = clients.find((x: any) => String(x.id) === String(targetId));
        if (c) {
          await updateLocalDoc('clients', targetId, {
            outstandingDebt: (c.outstandingDebt || 0) + payment.amount
          });
        }
        
        // Create Sale transaction (Debt generation)
        const saleId = `CASHEA-${Date.now()}`;
        const newTx = {
          id: saleId,
          clientId: targetId,
          entity: payment.entityName,
          category: 'ventas',
          date: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          invoiceNumber: `PWA-${payment.reference}`,
          amount: payment.amount,
          isIncome: true,
          status: 'Completado',
          paymentMethod: 'Cashea',
          notes: `Crédito QR Aprobado. Inicial recibida: $${payment.casheaData?.inicial.toFixed(2)}`
        };
        await addLocalDoc('transactions', newTx);
        
        // Create Installments
        for(let i = 1; i <= 4; i++) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (i * 15)); // Quincenal
          
          await addLocalDoc('installments', {
             id: `INST-${saleId}-${i}`,
             saleId: saleId,
             clientId: targetId,
             amountUSD: payment.casheaData?.cuotas || 0,
             dueDate: dueDate.toISOString(),
             status: 'pending'
          });
        }
        
        onAddNotification?.('Crédito QR Aprobado Exitosamente', 'success');

      } else {
        const isSupplier = payment.type === 'productor';
        const targetId = payment.clientId || payment.entityId;

        if (isSupplier) {
          const suppliersRes = await fetchCollection('suppliers');
          const suppliers = Array.isArray(suppliersRes) ? suppliersRes : (suppliersRes.json ? await suppliersRes.json() : []);
          const s = suppliers.find((x: any) => String(x.id) === String(targetId));
          if (s) {
            await updateLocalDoc('suppliers', targetId, {
              storeDebt: Math.max(0, (s.storeDebt || 0) - payment.amount)
            });
          }
        } else {
          // Normal Payment (Abono de Cliente)
          const clientsRes = await fetchCollection('clients');
          const clients = Array.isArray(clientsRes) ? clientsRes : (clientsRes.json ? await clientsRes.json() : []);
          const c = clients.find((x: any) => String(x.id) === String(targetId));

          if (c) {
            const currentDebt = Number(c.outstandingDebt || 0);
            if (payment.amount > currentDebt + 0.05 && currentDebt > 0) {
              onAddNotification?.(`Aviso: El abono ($${payment.amount.toFixed(2)}) supera la deuda actual ($${currentDebt.toFixed(2)}). Se ajusta al saldo pendiente.`, 'info');
            }

            const newDebt = Math.max(0, Math.round((currentDebt - payment.amount) * 100) / 100);
            const currentPoints = Number(c.loyaltyPoints || 0);
            const pointsToAdd = Math.round(payment.amount);

            await updateLocalDoc('clients', targetId, {
              outstandingDebt: newDebt,
              loyaltyPoints: currentPoints + pointsToAdd
            });
          }

          // Mark installments as paid if provided
          const instIds = payment.installmentIds || (payment.installmentId ? [payment.installmentId] : []);
          if (instIds.length > 0) {
            await Promise.all(instIds.map(id =>
              updateLocalDoc('installments', id, { status: 'paid', paidAt: new Date().toISOString() })
            ));
          }
        }

        const newTx = {
          id: `TX-${Date.now()}`,
          clientId: !isSupplier ? targetId : undefined,
          supplierId: isSupplier ? targetId : undefined,
          entity: payment.entityName,
          category: 'ingresos_cobranza',
          date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          timestamp: new Date().toISOString(),
          invoiceNumber: `PWA-${payment.reference}`,
          amount: payment.amount,
          isIncome: true,
          status: 'Completado',
          paymentMethod: payment.method || payment.paymentMethod || 'Pago Móvil',
          notes: `Cobranza PWA aprobada. Ref: ${payment.reference}`
        };
        await addLocalDoc('transactions', newTx);

        await updateLocalDoc('pwa_payments', payment.id, {
          status: 'approved',
          approvedAt: new Date().toISOString()
        });

        onAddNotification?.('Pago aprobado y conciliado exitosamente', 'success');
      }
    } catch (e) {
      console.error(e);
      onAddNotification?.('Error al aprobar el pago', 'warning');
    }
  };

  const handleRejectPayment = async (payment: PWAPayment) => {
    if (payment.status !== 'pending') {
      onAddNotification?.('El comprobante ya fue procesado.', 'warning');
      return;
    }

    try {
      await updateLocalDoc('pwa_payments', payment.id, {
        status: 'rejected',
        rejectedAt: new Date().toISOString()
      });

      // If it's a normal payment, reset the installments back to 'pending' from 'in_review'
      const instIds = payment.installmentIds || (payment.installmentId ? [payment.installmentId] : []);
      if (instIds.length > 0) {
        await Promise.all(instIds.map(id =>
           updateLocalDoc('installments', id, { status: 'pending' })
        ));
      }
      
      onAddNotification?.('Solicitud rechazada. La deuda permanece intacta.', 'info');
    } catch (e) {
      console.error(e);
      onAddNotification?.('Error al rechazar', 'warning');
    }
  };

  const pending = payments.filter(p => p.status === 'pending');
  const approved = payments.filter(p => p.status === 'approved');
  const hasPending = pending.length > 0;

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-100 font-sans">
      {/* HEADER WITH FLASHING ALARM WHEN PENDING > 0 */}
      <div className="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-950">
        <div>
          <h1 className="text-2xl font-serif font-bold text-emerald-400 flex items-center gap-3">
            <Bot className="w-8 h-8 text-emerald-500" />
            Centro de Cobranzas
          </h1>
          <p className="text-xs font-mono text-emerald-500/70 mt-1 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Robot de Conciliación Activo
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Indicador Parpadeante / Alarma de Pagos por Validar */}
          <div className={`p-3 rounded-xl border text-center min-w-[130px] transition-all duration-300 relative overflow-hidden ${
            hasPending 
              ? 'bg-amber-950/40 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)] animate-pulse' 
              : 'bg-neutral-900 border-neutral-800'
          }`}>
            {hasPending && (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            )}
            <span className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${
              hasPending ? 'text-amber-400' : 'text-neutral-500'
            }`}>
              Por Validar
            </span>
            <span className={`block text-2xl font-black ${
              hasPending ? 'text-amber-400 font-mono tracking-tight' : 'text-neutral-400'
            }`}>
              {pending.length}
            </span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl text-center min-w-[120px]">
            <span className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider font-bold">Aprobado Hoy</span>
            <span className="block text-2xl font-bold text-emerald-500 font-mono">{approved.length}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" /> Pagos Reportados (PWA)
          </h2>
          {hasPending && (
            <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 animate-bounce">
              <AlertTriangle className="w-3.5 h-3.5" /> {pending.length} pago{pending.length > 1 ? 's' : ''} esperando verificación
            </span>
          )}
        </div>

        {isLoading ? (
          <KaluLoader message="Mundo Kalu" subMessage="CARGANDO PAGOS..." size="sm" />
        ) : payments.length === 0 ? (
          <div className="text-center py-16 text-neutral-500 bg-neutral-950/50 border border-neutral-800/80 rounded-2xl">
            <Receipt className="w-12 h-12 mx-auto text-neutral-600 mb-3 opacity-50" />
            <p className="font-mono text-sm">No hay pagos reportados en la bandeja.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {payments.map(p => {
              const receiptSrc = p.receiptImageUrl || p.receiptImage;
              return (
                <div key={p.id} className={`rounded-xl p-5 flex items-center justify-between border transition-all ${
                  p.status === 'pending' 
                    ? 'bg-neutral-800/90 border-amber-500/40 shadow-lg hover:border-amber-500/70' 
                    : 'bg-neutral-800/50 border-neutral-700/60'
                }`}>
                  <div className="flex-1 flex items-center gap-5">
                    {/* MINIATURA DEL COMPROBANTE / CAPTURE */}
                    <div className="relative group">
                      {receiptSrc ? (
                        <div 
                          onClick={() => setSelectedReceipt({
                            imageUrl: receiptSrc,
                            entityName: p.entityName,
                            amount: p.amount,
                            reference: p.reference,
                            date: p.date
                          })}
                          className="w-16 h-16 rounded-lg overflow-hidden border border-amber-500/40 bg-neutral-900 cursor-pointer relative shadow-md group-hover:scale-105 group-hover:border-amber-400 transition-all flex items-center justify-center"
                          title="Clic para ampliar capture"
                        >
                          <img src={receiptSrc} alt="Capture" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-amber-300">
                            <ZoomIn className="w-5 h-5" />
                            <span className="text-[8px] font-bold uppercase mt-0.5">Ver</span>
                          </div>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-lg border border-dashed border-neutral-700 bg-neutral-900/60 flex flex-col items-center justify-center text-neutral-600">
                          <ImageIcon className="w-5 h-5 mb-0.5" />
                          <span className="text-[8px] font-mono">Sin Capture</span>
                        </div>
                      )}
                    </div>

                    {/* DATOS DEL PAGO */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className={`text-xs font-mono uppercase px-2.5 py-0.5 rounded font-bold ${
                          p.type === 'credito_cashea' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 
                          p.type === 'cliente' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-neutral-700 text-neutral-300'
                        }`}>
                          {p.type === 'credito_cashea' ? 'CRÉDITO QR' : p.type === 'cliente' ? 'PAGO CUOTA' : 'PROVEEDOR'}
                        </span>
                        <span className="font-bold text-lg text-white">{p.entityName}</span>
                        {p.status === 'pending' && <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded animate-pulse">PENDIENTE VALIDACIÓN</span>}
                        {p.status === 'approved' && <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded">APROBADO</span>}
                        {p.status === 'rejected' && <span className="text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 px-2 py-0.5 rounded">RECHAZADO</span>}
                      </div>

                      <div className="grid grid-cols-4 gap-4 text-sm text-neutral-400 font-mono">
                        <div>
                          <span className="block text-[10px] uppercase text-neutral-500 font-bold">Monto Financiado / Pago</span>
                          <span className="text-emerald-400 font-bold text-base">${p.amount.toFixed(2)} {p.currency}</span>
                          {p.amountBs && <span className="block text-[10px] text-neutral-400">({Number(p.amountBs).toLocaleString('es-VE')} Bs)</span>}
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-neutral-500 font-bold">N° Referencia</span>
                          <span className="text-neutral-100 font-bold bg-neutral-900/80 px-2 py-0.5 rounded border border-neutral-700 inline-block mt-0.5">{p.reference}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-neutral-500 font-bold">Método de Pago</span>
                          <span className="text-neutral-200">{p.method}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-neutral-500 font-bold">Fecha / Hora</span>
                          <span className="text-neutral-300 text-xs">{p.date ? new Date(p.date).toLocaleString('es-ES') : 'Reciente'}</span>
                        </div>
                      </div>

                      {p.notes && (
                        <p className="text-xs text-neutral-400 mt-2 font-mono italic bg-neutral-900/40 px-2 py-1 rounded border border-neutral-800">
                          {p.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ACCIONES DEL CAJERO */}
                  {p.status === 'pending' && (
                    <div className="flex items-center gap-3 border-l border-neutral-700/80 pl-6 ml-6">
                      <button 
                        onClick={() => handleRejectPayment(p)} 
                        className="p-3 bg-neutral-700/60 hover:bg-rose-500/20 hover:text-rose-400 text-neutral-400 rounded-xl transition-all border border-neutral-600/50 hover:border-rose-500/50" 
                        title="Rechazar Comprobante"
                      >
                        <XCircle className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={() => handleApprovePayment(p)} 
                        className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all flex items-center gap-2 font-bold shadow-lg shadow-emerald-900/30 hover:scale-105 active:scale-95"
                      >
                        <CheckCircle className="w-5 h-5" />
                        Validar y Asentar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE AMPLIACIÓN DE COMPROBANTE / CAPTURE */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  Comprobante de Pago - {selectedReceipt.entityName}
                </h3>
                <p className="text-xs font-mono text-neutral-400">
                  Ref: <strong className="text-amber-400">{selectedReceipt.reference}</strong> | Monto: <strong className="text-emerald-400">${selectedReceipt.amount.toFixed(2)}</strong>
                </p>
              </div>
              <button 
                onClick={() => setSelectedReceipt(null)}
                className="p-2 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Image Body */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/40 min-h-[300px]">
              <img 
                src={selectedReceipt.imageUrl} 
                alt="Comprobante Completo" 
                className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-lg border border-neutral-800"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex justify-between items-center text-xs font-mono text-neutral-500">
              <span>Fecha: {selectedReceipt.date ? new Date(selectedReceipt.date).toLocaleString('es-ES') : 'N/A'}</span>
              <button 
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-bold transition-colors"
              >
                Cerrar Visor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
