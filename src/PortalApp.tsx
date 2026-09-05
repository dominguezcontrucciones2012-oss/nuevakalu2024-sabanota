import React, { useState, useEffect } from 'react';
import MobilePortalsView from './components/MobilePortalsView';
import { useSharedData } from './hooks/useSharedData';
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
    addMobileOrder,
    deliverMobileOrder,
    cancelMobileOrder
  } = useSharedData();

  useEffect(() => {
    // Detectar qué portal debe mostrarse según la URL (ej: portal.html?type=productor)
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    if (type === 'productor' || type === 'contador' || type === 'proveedor') {
      setPortalType(type);
    }
  }, []);

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
        onAddMobileOrder={addMobileOrder}
        onDeliverMobileOrder={deliverMobileOrder}
        onCancelMobileOrder={cancelMobileOrder}
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

