import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../../services/localApi';
import React, { useState, useEffect } from 'react';


import { Receipt, CheckCircle, XCircle, Clock, Bot, ShieldCheck } from 'lucide-react';

interface PWAPayment {
  id: string;
  type: 'cliente' | 'productor';
  entityId: string;
  entityName: string;
  amount: number;
  currency: 'USD' | 'VES';
  reference: string;
  method: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  timestamp?: any;
}

export default function CollectionsView({
  onAddNotification
}: {
  onAddNotification?: (msg: string, type?: 'success'|'info'|'warning') => void;
}) {
  const [payments, setPayments] = useState<PWAPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'pwa_payments'));
    const unsub = onSnapshot(q, snapshot => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PWAPayment));
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
    return unsub;
  }, []);

  const handleApprovePayment = async (payment: PWAPayment) => {
    try {
      await updateDoc(doc(db, 'pwa_payments', payment.id), {
        status: 'approved',
        approvedAt: new Date().toISOString()
      });

      if (payment.type === 'cliente') {
        await updateDoc(doc(db, 'clients', payment.entityId), {
          outstandingDebt: increment(-payment.amount)
        });
      } else if (payment.type === 'productor') {
        await updateDoc(doc(db, 'suppliers', payment.entityId), {
          storeDebt: increment(-payment.amount)
        });
      }

      const newTx = {
        id: `TX-${Date.now()}`,
        entity: payment.entityName,
        category: 'ingresos_cobranza',
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        timestamp: new Date().toISOString(),
        invoiceNumber: `PWA-${payment.reference}`,
        amount: payment.amount,
        isIncome: true,
        status: 'Completado',
        paymentMethod: payment.method,
        notes: `Cobranza PWA aprobada. Ref: ${payment.reference}`
      };
      await addDoc(collection(db, 'transactions'), newTx);

      onAddNotification?.('Pago aprobado y conciliado exitosamente', 'success');
    } catch (e) {
      console.error(e);
      onAddNotification?.('Error al aprobar pago', 'warning');
    }
  };

  const handleRejectPayment = async (payment: PWAPayment) => {
    try {
      await updateDoc(doc(db, 'pwa_payments', payment.id), {
        status: 'rejected',
        rejectedAt: new Date().toISOString()
      });
      onAddNotification?.('Pago rechazado', 'info');
    } catch (e) {
      console.error(e);
      onAddNotification?.('Error al rechazar', 'warning');
    }
  };

  const pending = payments.filter(p => p.status === 'pending');
  const approved = payments.filter(p => p.status === 'approved');

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-100 font-sans">
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
        <div className="flex gap-4">
          <div className="bg-neutral-900 border border-neutral-800 p-3 rounded text-center min-w-[120px]">
            <span className="block text-[10px] font-mono text-neutral-500 uppercase">Por Validar</span>
            <span className="block text-2xl font-bold text-amber-500">{pending.length}</span>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-3 rounded text-center min-w-[120px]">
            <span className="block text-[10px] font-mono text-neutral-500 uppercase">Aprobado Hoy</span>
            <span className="block text-2xl font-bold text-emerald-500">{approved.length}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Pagos Reportados (PWA)
        </h2>
        {isLoading ? (
          <div className="text-center py-10 text-neutral-500">Cargando pagos...</div>
        ) : payments.length === 0 ? (
          <div className="text-center py-10 text-neutral-500">No hay pagos reportados.</div>
        ) : (
          <div className="grid gap-4">
            {payments.map(p => (
              <div key={p.id} className="bg-neutral-800 border border-neutral-700 rounded-lg p-5 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-mono uppercase bg-neutral-700 px-2 py-1 rounded text-neutral-300">
                      {p.type}
                    </span>
                    <span className="font-bold text-lg">{p.entityName}</span>
                    {p.status === 'pending' && <span className="text-[10px] font-mono bg-amber-500/20 text-amber-500 px-2 py-1 rounded">PENDIENTE</span>}
                    {p.status === 'approved' && <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded">APROBADO</span>}
                    {p.status === 'rejected' && <span className="text-[10px] font-mono bg-rose-500/20 text-rose-500 px-2 py-1 rounded">RECHAZADO</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm text-neutral-400 font-mono">
                    <div>
                      <span className="block text-[10px] uppercase text-neutral-500">Monto</span>
                      <span className="text-neutral-200">${p.amount.toFixed(2)} {p.currency}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-neutral-500">Referencia</span>
                      <span className="text-neutral-200">{p.reference}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-neutral-500">Método</span>
                      <span className="text-neutral-200">{p.method}</span>
                    </div>
                  </div>
                </div>
                {p.status === 'pending' && (
                  <div className="flex items-center gap-3 border-l border-neutral-700 pl-6 ml-6">
                    <button onClick={() => handleRejectPayment(p)} className="p-3 bg-neutral-700 hover:bg-rose-500/20 hover:text-rose-400 text-neutral-400 rounded-lg transition-colors" title="Rechazar">
                      <XCircle className="w-6 h-6" />
                    </button>
                    <button onClick={() => handleApprovePayment(p)} className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-2 font-bold shadow-lg shadow-emerald-900/20">
                      <CheckCircle className="w-5 h-5" />
                      Aprobar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
