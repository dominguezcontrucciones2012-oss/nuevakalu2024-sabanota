import React, { useState, useEffect } from 'react';
import MobilePortalsView from './components/MobilePortalsView';
import { useSharedData } from './hooks/useSharedData';
import { addLocalDoc, updateLocalDoc } from './services/localApi';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning';
}

export default function PortalApp() {
  const [portalType, setPortalType] = useState<'cliente' | 'productor' | 'contador' | 'proveedor'>('cliente');
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Hook centralizado con datos reales locales (reactivo por WebSockets / REST API / LocalStorage)
  const {
    products,
    clients,
    suppliers,
    mobileOrders,
    cheeseTrips,
    transactions,
    settings,
    setTransactions,
    setSettings,
    setCheeseTrips,
    addMobileOrder,
    deliverMobileOrder,
    cancelMobileOrder
  } = useSharedData();

  useEffect(() => {
    // Detectar qué portal debe mostrarse según la URL (ej: ?portal=productor, ?type=contador o portal.html#/contador)
    const params = new URLSearchParams(window.location.search);
    const portal = params.get('portal') || params.get('type');
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    
    if (portal === 'productor' || portal === 'contador' || portal === 'proveedor' || portal === 'cliente') {
      setPortalType(portal as any);
    } else if (hash === 'productor' || hash === 'contador' || hash === 'proveedor' || hash === 'cliente') {
      setPortalType(hash as any);
    }
  }, []);

  const handleAddTransaction = (tx: Partial<any>) => {
    const newTx = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: 'Bóveda Banco Central',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `BOV-${Math.floor(Math.random() * 9000 + 1000)}`,
      status: 'Completado',
      ...tx
    };
    setTransactions((prev) => [newTx as any, ...prev]);
    try {
      addLocalDoc('transactions', newTx);
    } catch (e) {
      console.error(e);
    }

    const currentVault = settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
    const updatedVault = { ...currentVault };
    const pm = (tx.paymentMethod || '').toLowerCase();
    const rate = settings.exchangeRate || 42.5;
    
    if (tx.isIncome) {
      if (pm === 'efectivo' || pm === 'efectivo usd') {
        updatedVault.usd += (tx.amount || 0);
      } else if (pm === 'efectivo bs') {
        updatedVault.bs += ((tx.amount || 0) * rate);
      } else if (pm.includes('movil') || pm.includes('móvil') || pm.includes('transfer') || pm.includes('punto') || pm.includes('banco bs') || pm.includes('bio')) {
        updatedVault.bankBs += ((tx.amount || 0) * rate);
      } else {
        updatedVault.bankUsd += (tx.amount || 0);
      }
    } else {
      if (pm === 'efectivo' || pm === 'efectivo usd') {
        updatedVault.usd -= (tx.amount || 0);
      } else if (pm === 'efectivo bs') {
        updatedVault.bs -= ((tx.amount || 0) * rate);
      } else if (pm.includes('movil') || pm.includes('móvil') || pm.includes('transfer') || pm.includes('punto') || pm.includes('banco bs') || pm.includes('bio')) {
        updatedVault.bankBs -= ((tx.amount || 0) * rate);
      } else {
        updatedVault.bankUsd -= (tx.amount || 0);
      }
    }
    
    const newSettings = { ...settings, centralVaultBalance: updatedVault };
    setSettings(newSettings);
    try {
      updateLocalDoc('settings', 'general', { centralVaultBalance: updatedVault });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateVault = async (updates: any) => {
    const newVault = {
      ...(settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 }),
      ...updates
    };
    setSettings(prev => ({ ...prev, centralVaultBalance: newVault }));
    try {
      await updateLocalDoc('settings', 'general', { centralVaultBalance: newVault });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateTrip = async (trip: any) => {
    try {
      const newTrip = { ...trip, id: crypto.randomUUID() };
      setCheeseTrips(prev => [newTrip, ...prev]);
      await addLocalDoc('cheeseTrips', newTrip);
      addNotification('Viaje registrado con éxito', 'success');
    } catch (err) {
      console.error(err);
      addNotification('Error al registrar viaje', 'warning');
    }
  };

  const handleUpdateTrip = async (tripId: string, updates: any) => {
    try {
      setCheeseTrips(prev => prev.map(t => t.id === tripId ? { ...t, ...updates } : t));
      await updateLocalDoc('cheeseTrips', tripId, updates);
      addNotification('Viaje actualizado', 'success');
    } catch (err) {
      console.error(err);
      addNotification('Error al actualizar viaje', 'warning');
    }
  };

  const handleSettleTrip = async (tripId: string, settlementData: any) => {
    try {
      setCheeseTrips(prev => prev.map(t => t.id === tripId ? { ...t, ...settlementData, status: 'liquidado', settledAt: new Date().toISOString() } : t));
      await updateLocalDoc('cheeseTrips', tripId, {
        ...settlementData,
        status: 'liquidado',
        settledAt: new Date().toISOString()
      });
      addNotification('Viaje liquidado con éxito', 'success');
    } catch (err) {
      console.error(err);
      addNotification('Error al liquidar el viaje', 'warning');
    }
  };

  const addNotification = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="min-h-screen bg-black text-white relative">
      <MobilePortalsView 
        isolatedType={portalType}
        products={products}
        clients={clients}
        suppliers={suppliers}
        mobileOrders={mobileOrders}
        cheeseTrips={cheeseTrips}
        transactions={transactions}
        settings={settings}
        vaultBalance={settings?.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 }}
        exchangeRate={settings?.exchangeRate || 42.5}
        onAddMobileOrder={addMobileOrder}
        onDeliverMobileOrder={deliverMobileOrder}
        onCancelMobileOrder={cancelMobileOrder}
        onAddTransaction={handleAddTransaction}
        onUpdateVault={handleUpdateVault}
        onCreateTrip={handleCreateTrip}
        onUpdateTrip={handleUpdateTrip}
        onSettleTrip={handleSettleTrip}
        onAddNotification={addNotification}
      />

      {/* Toast Notifications Stack para Portales Móviles */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-2xl flex items-start gap-3.5 transform translate-y-0 transition-transform duration-300 select-none text-white"
          >
            {toast.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            {toast.type === 'info' && (
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            )}
            {toast.type === 'warning' && (
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            )}

            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
                {toast.type === 'success' ? 'ÉXITO' : toast.type === 'info' ? 'INFORMACIÓN' : 'ALERTA'}
              </span>
              <p className="text-xs text-zinc-200 mt-1 leading-snug">
                {toast.message}
              </p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer shrink-0 mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

