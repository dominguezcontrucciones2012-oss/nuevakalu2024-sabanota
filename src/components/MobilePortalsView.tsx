import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../services/localApi';
import React, { useState } from 'react';


import {
  Smartphone,
  ShoppingBag,
  User,
  Package,
  CheckCircle,
  Truck,
  CreditCard,
  Plus,
  Minus,
  Trash2,
  Clock,
  ArrowRight,
  Shield,
  FileText,
  TrendingDown,
  Search,
  ChevronRight,
  LogOut,
  UserCheck,
  Phone,
  MapPin,
  Heart,
  QrCode,
  Scan,
  Store,
  Home,
  ArrowLeft,
  HelpCircle
} from 'lucide-react';
import { CheeseProduct, ClientProfile, SupplierProfile, MobileOrder } from '../types';
import InvoiceUploadView from './contador/InvoiceUploadView';
import PaymentsTab from './PaymentsTab';
import ProfileTab from './ProfileTab';
import StoreTab from './StoreTab';
import { QrScannerTab } from './QrScannerTab';
interface MobilePortalsViewProps {
  products: CheeseProduct[];
  clients: ClientProfile[];
  suppliers: SupplierProfile[];
  mobileOrders: MobileOrder[];
  onAddMobileOrder: (order: MobileOrder) => void;
  onDeliverMobileOrder: (orderId: string) => void;
  onCancelMobileOrder: (orderId: string) => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
  isolatedType?: 'cliente' | 'productor' | 'proveedor' | 'contador';
  isolatedId?: string;
}

// Removed products, using products from Firebase real-time

export default function MobilePortalsView({
  products,
  clients,
  suppliers,
  mobileOrders,
  onAddMobileOrder,
  onDeliverMobileOrder,
  onCancelMobileOrder,
  onAddNotification,
  isolatedType,
  isolatedId
}: MobilePortalsViewProps) {
  // Authentication & Session States for Each Phone Simulator (Zero visual overlap or exposure between users)
  const [loggedClient, setLoggedClient] = useState<ClientProfile | null>(null);
  const [loggedSupplier, setLoggedSupplier] = useState<SupplierProfile | null>(null);

  // Login inputs
  const [clientPhoneInput, setClientPhoneInput] = useState<string>('');
  const [supplierPhoneInput, setSupplierPhoneInput] = useState<string>('');
  const [clientPinInput, setClientPinInput] = useState<string>('');
  const [supplierPinInput, setSupplierPinInput] = useState<string>('');

  // Auto-login logic for isolated mode
  React.useEffect(() => {
    if (isolatedId) {
      if (isolatedType === 'cliente') {
        const client = clients.find(c => c.id === isolatedId);
        if (client) setLoggedClient(client);
      } else if (isolatedType === 'productor' || isolatedType === 'proveedor') {
        const supplier = suppliers.find(s => s.id === isolatedId);
        if (supplier) setLoggedSupplier(supplier);
      }
    } else {
      // Local persistence for non-isolated mode
      const savedClientId = localStorage.getItem('kaluMobileClientId');
      if (savedClientId && clients.length > 0) {
        const client = clients.find(c => c.id === savedClientId);
        if (client) setLoggedClient(client);
      }
      const savedSupplierId = localStorage.getItem('kaluMobileSupplierId');
      if (savedSupplierId && suppliers.length > 0) {
        const supplier = suppliers.find(s => s.id === savedSupplierId);
        if (supplier) setLoggedSupplier(supplier);
      }
    }
  }, [isolatedId, isolatedType, clients, suppliers]);

  React.useEffect(() => {
    if (loggedClient) localStorage.setItem('kaluMobileClientId', loggedClient.id);
    else localStorage.removeItem('kaluMobileClientId');
  }, [loggedClient]);

  React.useEffect(() => {
    if (loggedSupplier) localStorage.setItem('kaluMobileSupplierId', loggedSupplier.id);
    else localStorage.removeItem('kaluMobileSupplierId');
  }, [loggedSupplier]);



  // Shopping Catalog Local States (Separate for each portal)
  const [clientSearch, setClientSearch] = useState('');
  const [clientCategory, setClientCategory] = useState<'Todos' | 'Quesos' | 'Repuestos' | 'Comidas'>('Todos');
  const [clientCart, setClientCart] = useState<{ productId: string; quantity: number }[]>([]);
  const [clientPayment, setClientPayment] = useState<'contado' | 'fiado'>('contado');
  const [localQuantities, setLocalQuantities] = useState<Record<string, number>>({});
  const [addFeedback, setAddFeedback] = useState<Record<string, boolean>>({});
  const [clientActiveTab, setClientActiveTab] = useState<'inicio' | 'tienda' | 'nivel' | 'qr' | 'pagos' | 'perfil'>('inicio');
  const [showClientCartModal, setShowClientCartModal] = useState(false);
  const [showQrPaymentModal, setShowQrPaymentModal] = useState(false);
  const [qrPaymentAmount, setQrPaymentAmount] = useState<string>('');
  
  // Real-Time Sync: Aprobación de Crédito (Cashea Style)
  const [pendingCreditRequest, setPendingCreditRequest] = useState<any>(null);

  const [activeInstallments, setActiveInstallments] = useState<any[]>([]);

  React.useEffect(() => {
    if (!loggedClient) {
       setPendingCreditRequest(null);
       setActiveInstallments([]);
       return;
    }
    
    // Listener de peticiones pendientes
    const unsubscribe = onCollectionSnapshot('transactions', (data) => {
        const txs = data.filter((d: any) => 
            d.status === 'pending_approval' && 
            (d.clientId === loggedClient.id || 
             (d.clientCiRif && d.clientCiRif === loggedClient.ciRif) || 
             (d.clientPhone && d.clientPhone === loggedClient.phone) ||
             (d.clientCiRif && d.clientCiRif === loggedClient.cedula))
          );
        if (txs.length > 0) {
           setPendingCreditRequest(txs[0]);
        } else {
           setPendingCreditRequest(null);
        }
    });

    // Listener de cuotas (deuda real)
    const unsubInst = onCollectionSnapshot('installments', (data) => {
        const inst = data.filter((d: any) => d.clientId === loggedClient.id && d.status === 'pending');
        setActiveInstallments(inst);
    });

    return () => {
       unsubscribe();
       unsubInst();
    };
  }, [loggedClient]);

  React.useEffect(() => {
    const savedTab = localStorage.getItem('kaluMobileClientTab') as any;
    if (savedTab) setClientActiveTab(savedTab);
  }, []);

  React.useEffect(() => {
    localStorage.setItem('kaluMobileClientTab', clientActiveTab);
  }, [clientActiveTab]);

  const getClientLevelInfo = (points: number) => {
    const p = Number(points || 0);
    if (p < 200) return { level: 1, name: 'Kalu Vecino', nextGoal: 200, nextPrize: 'Premio de $5 + tickets', progress: (p / 200) * 100 };
    if (p < 500) return { level: 2, name: 'Kalu Club Vecino', nextGoal: 500, nextPrize: 'Cupones dobles', progress: ((p - 200) / 300) * 100 };
    if (p < 1200) return { level: 3, name: 'Kalu Bronce Plus', nextGoal: 1200, nextPrize: 'Sorteo Moto', progress: ((p - 500) / 700) * 100 };
    if (p < 2500) return { level: 4, name: 'Kalu Plata', nextGoal: 2500, nextPrize: 'Micro-crédito', progress: ((p - 1200) / 1300) * 100 };
    if (p < 5000) return { level: 5, name: 'Kalu Oro', nextGoal: 5000, nextPrize: 'Línea VIP', progress: ((p - 2500) / 2500) * 100 };
    return { level: 6, name: 'Kalu Black VIP', nextGoal: 5000, nextPrize: 'Nivel Máximo', progress: 100 };
  };


  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierCategory, setSupplierCategory] = useState<'Todos' | 'Repuestos' | 'Comidas' | 'Quesos'>('Todos');
  const [supplierCart, setSupplierCart] = useState<{ productId: string; quantity: number }[]>([]);
  const [supplierPayment, setSupplierPayment] = useState<'contado' | 'fiado'>('fiado'); // default to 'fiado' (Libreta)

  // Employee Portal (Daisy)
  const [daisyScanned, setDaisyScanned] = useState(false);

  // Handlers for Client Portal Login
  const handleClientLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phoneClean = clientPhoneInput.trim();
    if (!phoneClean) {
      onAddNotification('Por favor ingrese su usuario o teléfono.', 'warning');
      return;
    }
    
    const found = clients.find(c => 
      (c.phone && c.phone.replace(/\D/g, '').includes(phoneClean.replace(/\D/g, ''))) || 
      (c.name && c.name.toLowerCase().includes(phoneClean.toLowerCase())) ||
      (c.cedula && c.cedula.includes(phoneClean)) ||
      (c.rfc && c.rfc.includes(phoneClean)) ||
      (c.ci && c.ci.includes(phoneClean)) ||
      (c.ciRif && c.ciRif.includes(phoneClean)) ||
      (c.idNumber && c.idNumber.includes(phoneClean))
    );

    if (found) {
      // PIN Check
      let expectedPin = '0000';
      if (found.pin) expectedPin = found.pin;
      else if (found.cedula && found.cedula.length >= 4) expectedPin = found.cedula.slice(-4);
      else if (found.rfc && found.rfc.length >= 4) expectedPin = found.rfc.slice(-4);
      else if (found.ci && found.ci.length >= 4) expectedPin = found.ci.slice(-4);
      else if (found.ciRif && found.ciRif.length >= 4) expectedPin = found.ciRif.slice(-4);
      else if (found.idNumber && found.idNumber.length >= 4) expectedPin = found.idNumber.slice(-4);
      else if (found.phone) {
         const ph = found.phone.replace(/\D/g, '');
         if (ph.length >= 4) expectedPin = ph.slice(-4);
      }
      
      if (clientPinInput === expectedPin) {
        alert('¡Login correcto! Entrando al portal...');
        setLoggedClient(found);
        setClientCart([]);
        onAddNotification(`¡Sesión iniciada como Cliente: ${found.name}!`, 'success');
      } else {
         alert('El PIN ingresado es incorrecto. Esperado: ' + expectedPin + ' / Ingresado: ' + clientPinInput);
         onAddNotification('El PIN ingresado es incorrecto.', 'warning');
      }
    } else {
      alert('No se encontró ningún cliente registrado con la cédula/celular: ' + phoneClean);
      onAddNotification('No se encontró ningún cliente registrado con esos datos.', 'warning');
    }
  };

  // Handlers for Supplier Portal Login (Libreta de Queso)
  const handleSupplierLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phoneClean = supplierPhoneInput.trim();
    if (!phoneClean) {
      onAddNotification('Por favor ingrese su usuario o teléfono.', 'warning');
      return;
    }
    const found = suppliers.find(
      s => (s.phone && s.phone.replace(/\D/g, '').includes(phoneClean.replace(/\D/g, ''))) || 
           (s.name && s.name.toLowerCase().includes(phoneClean.toLowerCase())) ||
           (s.cedula && s.cedula.includes(phoneClean)) ||
           (s.rfc && s.rfc.includes(phoneClean))
    );

    if (found) {
      // PIN Check
      let expectedPin = '0000';
      if (found.pin) expectedPin = found.pin;
      else if (found.cedula && found.cedula.length >= 4) expectedPin = found.cedula.slice(-4);
      else if (found.rfc && found.rfc.length >= 4) expectedPin = found.rfc.slice(-4);
      else if (found.phone) {
         const ph = found.phone.replace(/\D/g, '');
         if (ph.length >= 4) expectedPin = ph.slice(-4);
      }

      if (supplierPinInput === expectedPin) {
        setLoggedSupplier(found);
        setSupplierCart([]);
        onAddNotification(`¡Sesión iniciada como Productor: ${found.name}!`, 'success');
      } else {
        onAddNotification('El PIN ingresado es incorrecto.', 'warning');
      }
    } else {
      onAddNotification('No se encontró ningún productor con esos datos.', 'warning');
    }
  };

  // Client Cart updates
  const handleClientCartAdd = (pId: string) => {
    const prod = products.find(p => p.id === pId);
    if (!prod) return;
    setClientCart((prev) => {
      const existing = prev.find(item => item.productId === pId);
      const inc = (prod.category as string) === 'Quesos' ? 0.5 : 1;
      if (existing) {
        if (existing.quantity + inc > Number(prod.stockKg || (prod as any).stock || 0)) {
          onAddNotification('Límite de stock disponible en bodega superado.', 'warning');
          return prev;
        }
        return prev.map(item => item.productId === pId ? { ...item, quantity: item.quantity + inc } : item);
      }
      return [...prev, { productId: pId, quantity: inc }];
    });
  };

  const handleClientCartRemove = (pId: string) => {
    setClientCart((prev) => {
      const existing = prev.find(item => item.productId === pId);
      if (existing) {
        const dec = (products.find(p => p.id === pId)?.category as string) === 'Quesos' ? 0.5 : 1;
        if (existing.quantity <= dec) {
          return prev.filter(item => item.productId !== pId);
        }
        return prev.map(item => item.productId === pId ? { ...item, quantity: existing.quantity - dec } : item);
      }
      return prev;
    });
  };

  // Supplier Cart updates
  const handleSupplierCartAdd = (pId: string) => {
    const prod = products.find(p => p.id === pId);
    if (!prod) return;
    setSupplierCart((prev) => {
      const existing = prev.find(item => item.productId === pId);
      const inc = (prod.category as string) === 'Quesos' ? 0.5 : 1;
      if (existing) {
        if (existing.quantity + inc > Number(prod.stockKg || (prod as any).stock || 0)) {
          onAddNotification('Límite de stock disponible superado.', 'warning');
          return prev;
        }
        return prev.map(item => item.productId === pId ? { ...item, quantity: item.quantity + inc } : item);
      }
      return [...prev, { productId: pId, quantity: inc }];
    });
  };

  const handleSupplierCartRemove = (pId: string) => {
    setSupplierCart((prev) => {
      const existing = prev.find(item => item.productId === pId);
      if (existing) {
        const dec = (products.find(p => p.id === pId)?.category as string) === 'Quesos' ? 0.5 : 1;
        if (existing.quantity <= dec) {
          return prev.filter(item => item.productId !== pId);
        }
        return prev.map(item => item.productId === pId ? { ...item, quantity: existing.quantity - dec } : item);
      }
      return prev;
    });
  };

  // Submit Client Order
  const submitClientOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!loggedClient) return;
    if (clientCart.length === 0) {
      onAddNotification('El carrito está vacío.', 'warning');
      return;
    }

    const orderItems = clientCart.map(cartItem => {
      const prod = products.find(p => p.id === cartItem.productId)!;
      return {
        productId: prod.id,
        name: prod.name,
        quantity: cartItem.quantity,
        price: prod.sellingPrice || (prod as any).price || 0,
        subtotal: (prod.sellingPrice || (prod as any).price || 0) * cartItem.quantity
      };
    });

    const totalAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

    const newOrder = {
      clientId: loggedClient.id,
      clientName: loggedClient.name,
      clientPhone: loggedClient.phone || '',
      items: orderItems,
      totalAmount,
      paymentMethod: clientPayment,
      status: 'pendiente',
      createdAt: new Date().toISOString()
    };

    try {
      await addLocalDoc('pwa_remote_orders', newOrder);
      setClientCart([]);
      setShowClientCartModal(false);
      onAddNotification('Pedido enviado al cajero con éxito', 'success');
    } catch (err) {
      console.error('Error enviando pedido:', err);
      onAddNotification('Hubo un error al enviar el pedido', 'warning');
    }
  };

  // Submit Supplier Order
  const submitSupplierOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedSupplier) return;
    if (supplierCart.length === 0) {
      onAddNotification('El carrito está vacío.', 'warning');
      return;
    }

    const orderItems = supplierCart.map(cartItem => {
      const prod = products.find(p => p.id === cartItem.productId)!;
      return {
        productId: prod.id,
        name: prod.name,
        quantity: cartItem.quantity,
        price: prod.sellingPrice || (prod as any).price || 0,
        subtotal: (prod.sellingPrice || (prod as any).price || 0) * cartItem.quantity
      };
    });

    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

    const newOrder: MobileOrder = {
      id: `PED-PROV-${Date.now()}`,
      type: 'supplier',
      entityId: loggedSupplier.id,
      entityName: loggedSupplier.name,
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        timestamp: new Date().toISOString(),
      items: orderItems,
      total,
      paymentMethod: supplierPayment,
      status: 'Pendiente'
    };

    onAddMobileOrder(newOrder);
    setSupplierCart([]);
    onAddNotification(`¡Pedido de Insumos/Víveres ${newOrder.id} mandado a Libreta!`, 'success');
  };

  // Filtering Products for Client Portal
  const filteredClientProducts = products.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(clientSearch.toLowerCase());
    const matchesCat = clientCategory === 'Todos' || p.category === clientCategory;
    return matchesSearch && matchesCat;
  });

  // Filtering Products for Supplier Portal
  const filteredSupplierProducts = products.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(supplierSearch.toLowerCase());
    const matchesCat = supplierCategory === 'Todos' || p.category === supplierCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className={`animate-fade-in ${isolatedType ? 'w-full min-h-screen flex flex-col bg-black' : 'space-y-8 max-w-7xl mx-auto pb-16'}`}>
      {/* Header and Explanation */}
      {!isolatedType && (
        <div className="border-b border-editorial-border pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-editorial-text-muted">
              PORTALES INDIVIDUALES PRIVADOS Y EXCLUSIVOS
            </span>
          </div>
          <h2 className="font-serif text-3xl font-bold tracking-tight text-editorial-text-primary">
            Portal de Productores: Libreta de Queso &amp; Cliente Normal
          </h2>
          <p className="text-xs text-editorial-text-muted/80 max-w-3xl mt-2 leading-relaxed">
            Cada usuario inicia sesión en su propio teléfono de forma aislada y segura. <strong>No pueden ver la información de otros clientes o productores.</strong> 
            Desde aquí consultan en tiempo real cuánto deben, revisan el catálogo completo (más de 1,000 productos simulados como repuestos de moto, comidas y quesos) 
            y realizan sus pedidos directo al CRM.
          </p>
        </div>
      )}

      {/* Grid of Devices */}
      <div className={`flex-1 flex flex-col ${!isolatedType ? 'grid grid-cols-1 lg:grid-cols-3 gap-8 items-start' : 'w-full'}`}>
        
        {/* PHONE 1: PORTAL CLIENTE NORMAL */}
        {(!isolatedType || isolatedType === 'cliente') && (
        <div className={!isolatedType ? "flex flex-col items-center bg-editorial-card/30 border border-editorial-border rounded-xl p-6 shadow-sm" : "w-full min-h-screen bg-black text-white flex flex-col"}>
          {!isolatedType && (
          <div className="text-center mb-4">
            <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-editorial-text-primary mb-1">
              Dispositivo: Teléfono del Cliente
            </h3>
            <p className="text-[10px] text-editorial-text-muted">Acceso individual seguro</p>
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
            <div className={`flex-1 overflow-y-auto bg-zinc-900 text-zinc-100 flex flex-col text-xs ${!isolatedType ? 'p-4 pt-7' : 'px-4 py-6'}`}>
              
              {!loggedClient ? (
                /* CLIENT PORTAL: LOCK / LOGIN SCREEN */
                <div className="flex-1 flex flex-col justify-between py-6">
                  <div className="text-center mt-6 space-y-2">
                    <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-3">
                      <ShoppingBag className="w-10 h-10 text-amber-500" />
                    </div>
                    <h4 className="font-serif text-2xl font-bold text-zinc-100">Mundo Kalu</h4>
                    <p className="text-xs tracking-widest text-slate-400 font-semibold uppercase">TIENDA ONLINE DE CRÉDITO</p>
                  </div>

                  <form onSubmit={handleClientLoginSubmit} className="space-y-5 bg-slate-900/40 p-6 rounded-3xl border border-slate-800">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-mono uppercase text-slate-400 block ml-1">CÉDULA, CELULAR O NOMBRE</label>
                      <input
                        type="text"
                        placeholder="Ingresa tu cédula, celular o nombre"
                        value={clientPhoneInput}
                        onChange={(e) => setClientPhoneInput(e.target.value)}
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-2xl px-4 py-3.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-mono uppercase text-slate-400 block ml-1">PIN DE ACCESO (6 DÍGITOS)</label>
                      <input
                        type="password"
                        maxLength={6}
                        placeholder="······"
                        value={clientPinInput}
                        onChange={(e) => setClientPinInput(e.target.value)}
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-2xl px-4 py-3.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 font-mono tracking-[0.5em] text-center"
                      />
                    </div>
                    
                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-2xl uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <User className="w-4 h-4" />
                        INGRESAR A MI CUENTA
                      </button>
                    </div>
                  </form>

                  <div className="text-center text-[8px] text-zinc-500 space-y-3 mt-4">
                    <div>
                      <p>🔒 Conexión Protegida y Encriptada</p>
                      <p>Kalu CRM S.A. de C.V.</p>
                    </div>
                    <a href="/?admin=true" className="inline-block text-zinc-600 hover:text-amber-500 transition-colors uppercase font-bold tracking-widest border border-zinc-800 rounded px-3 py-1.5 bg-zinc-900/50">
                      Acceso Administrativo / Cajero
                    </a>
                  </div>
                </div>
              ) : (
                /* CLIENT PORTAL: LOGGED IN STORE & ACCOUNT */
                <div className="flex-1 flex flex-col min-h-0 relative pb-16">
                  {clientActiveTab === 'inicio' && (
                    <div className="p-4 space-y-6 flex-1 overflow-y-auto animate-fade-in pb-24">
                      {/* Top Bar / Customer Level Pill */}
                      <div className="flex justify-start mb-2">
                        <button 
                          onClick={() => setClientActiveTab('nivel')}
                          className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-full pl-1.5 pr-5 py-1.5 transition-colors hover:bg-neutral-800 cursor-pointer shadow-md"
                        >
                          <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center">
                            <span className="text-neutral-900 font-black text-lg leading-none">K</span>
                          </div>
                          <span className="text-white text-base font-bold uppercase tracking-wider">
                            Nivel K{getClientLevelInfo(loggedClient.loyaltyPoints).level}
                          </span>
                        </button>
                      </div>

                      {/* Primer Bloque: Estado e Historial */}
                      <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-lg">
                        <div className="text-center">
                          <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-1.5">Tu Deuda / Fiar en Tienda</p>
                          <h2 className="text-4xl font-black text-white">
                            ${(() => {
                              const totalPending = activeInstallments.reduce((sum, item) => sum + (Number(item.amountUSD) || Number(item.amount) || 0), 0);
                              return totalPending.toFixed(2);
                            })()}
                          </h2>
                        </div>
                        <div className="border-t border-neutral-800 my-5"></div>
                        <div>
                          <p className="text-[10px] font-bold text-zinc-300 uppercase mb-3">Últimos Movimientos</p>
                          <div className="space-y-4">
                            {/* Dummy history items */}
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
                                  <ShoppingBag className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-zinc-200">Compra en Tienda</p>
                                  <p className="text-[9px] text-zinc-500">Ayer, 14:30</p>
                                </div>
                              </div>
                              <span className="text-xs font-black text-white">$45.00</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
                                  <CreditCard className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-zinc-200">Abono a Cuenta</p>
                                  <p className="text-[9px] text-zinc-500">Hace 3 días</p>
                                </div>
                              </div>
                              <span className="text-xs font-black text-emerald-400">-$20.00</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Segundo Bloque: Tus líneas */}
                      <div>
                        <h3 className="text-sm font-bold text-white mb-3 px-1">Tus líneas</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden shadow-md">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Línea Principal</p>
                            <p className="text-lg font-black text-white">
                              ${(() => {
                                const totalPending = activeInstallments.reduce((sum, item) => sum + (Number(item.amountUSD) || Number(item.amount) || 0), 0);
                                const limit = Number((loggedClient as any)?.creditLimit || 50);
                                return Math.max(0, limit - totalPending).toFixed(2);
                              })()}
                            </p>
                            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-emerald-500"></div>
                          </div>
                          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl relative overflow-hidden shadow-md">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Línea Comida</p>
                            <p className="text-lg font-black text-white">
                              ${(() => {
                                // Food line is usually a specific limit, using foodCreditLimit or default fallback
                                const foodLimit = Number((loggedClient as any)?.foodCreditLimit || 20); 
                                return foodLimit.toFixed(2);
                              })()}
                            </p>
                            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-amber-500"></div>
                          </div>
                        </div>
                      </div>

                      {/* Tercer Bloque: Accesos Rápidos */}
                      <div className="grid grid-cols-2 gap-3">
                        <button className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-emerald-500/50 transition-colors shadow-sm">
                          <Smartphone className="w-6 h-6 text-emerald-400" />
                          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wide">Pagar celular</span>
                        </button>
                        <button className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-emerald-500/50 transition-colors shadow-sm">
                          <FileText className="w-6 h-6 text-emerald-400" />
                          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wide">Pagar servicios</span>
                        </button>
                        <button className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-amber-500/50 transition-colors shadow-sm">
                          <div className="flex text-2xl leading-none">🎫</div>
                          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wide">Canjear cupones</span>
                        </button>
                        <button className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-amber-500/50 transition-colors shadow-sm">
                          <div className="flex text-2xl leading-none">🎁</div>
                          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wide">Invitar y ganar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {clientActiveTab === 'nivel' && (() => {
                    const levelInfo = getClientLevelInfo(loggedClient.loyaltyPoints);
                    return (
                      <div className="flex-1 flex flex-col bg-zinc-950 animate-fade-in text-white pb-24 overflow-y-auto">
                        {/* Cabecera Superior */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-900">
                          <button onClick={() => setClientActiveTab('inicio')} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-300 hover:text-white transition-colors shadow-sm">
                            <ArrowLeft className="w-5 h-5" />
                          </button>
                          <h1 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">Club Kalu Más</h1>
                          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-300 hover:text-white transition-colors shadow-sm">
                            <HelpCircle className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="p-4 space-y-5">
                          {/* Tarjeta Principal de Nivel */}
                          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden shadow-lg">
                            <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl"></div>
                            
                            <div className="flex justify-between items-start mb-6 relative z-10">
                              <div>
                                <h2 className="text-3xl font-black text-white tracking-tight mb-1">Nivel K{levelInfo.level}</h2>
                                <p className="text-sm font-medium text-emerald-400 mb-2">{levelInfo.name}</p>
                                <button className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition-colors">
                                  Conocer beneficios <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                                <span className="text-zinc-900 font-black text-2xl leading-none">K</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-5 border-t border-zinc-800/80 relative z-10">
                              <div>
                                <p className="text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Línea Principal</p>
                                <p className="text-[8px] text-zinc-500 mb-1">Hasta 12 cuotas</p>
                                <p className="text-sm font-black text-white">${Number((loggedClient as any)?.creditLimit || 5000).toFixed(0)}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Línea Mercado</p>
                                <p className="text-[8px] text-zinc-500 mb-1">1 cuota / Corto plazo</p>
                                <p className="text-sm font-black text-white">${Number(loggedClient?.outstandingDebt || 0).toFixed(0)}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Inicial</p>
                                <p className="text-[8px] text-zinc-500 mb-1">Desde</p>
                                <p className="text-sm font-black text-emerald-400">20%</p>
                              </div>
                            </div>
                          </div>

                          {/* Bloque de Puntos Kalu y Acciones Rápidas */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3">
                              <p className="text-sm font-bold text-zinc-200">
                                <span className="text-amber-500 mr-1.5">⭐</span>
                                {Number(loggedClient?.loyaltyPoints || 0)} puntos
                              </p>
                              <button className="bg-zinc-800 hover:bg-zinc-700 text-xs font-bold px-4 py-1.5 rounded-full transition-colors text-white">
                                Usar puntos
                              </button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <button className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1 items-start hover:border-emerald-500/50 transition-colors group">
                                <span className="text-lg">💸</span>
                                <span className="text-xs font-bold text-zinc-300 group-hover:text-emerald-400 flex items-center gap-1">Subir línea <ChevronRight className="w-3 h-3" /></span>
                              </button>
                              <button className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1 items-start hover:border-emerald-500/50 transition-colors group">
                                <span className="text-lg">⏳</span>
                                <span className="text-xs font-bold text-zinc-300 group-hover:text-emerald-400 flex items-center gap-1">Ver progreso <ChevronRight className="w-3 h-3" /></span>
                              </button>
                            </div>
                          </div>

                          {/* Sección Inferior: Tu progreso */}
                          <div className="pt-2">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-sm font-bold text-white">Tu progreso</h3>
                              <button className="text-xs font-bold text-amber-500 hover:text-amber-400 px-3 py-1 bg-amber-500/10 rounded-full transition-colors">
                                Conocer más
                              </button>
                            </div>

                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-6 shadow-md">
                              <div>
                                <div className="flex justify-between items-end mb-2">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Cantidad pagada con tu línea</span>
                                  <span className="text-sm font-black text-white">${Number((loggedClient as any)?.totalPaid || 0).toFixed(0)}</span>
                                </div>
                                <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden shadow-inner">
                                  <div className="bg-cyan-400 h-2 rounded-full" style={{ width: '65%' }}></div>
                                </div>
                              </div>
                              
                              <div>
                                <div className="flex justify-between items-end mb-2">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Cuotas pagadas a tiempo</span>
                                  <span className="text-sm font-black text-white">12 <span className="text-[10px] font-normal text-zinc-500">/ 15</span></span>
                                </div>
                                <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden shadow-inner">
                                  <div className="bg-cyan-400 h-2 rounded-full" style={{ width: '80%' }}></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {clientActiveTab === 'tienda' && (
                    <StoreTab products={products} onNavigateTab={setClientActiveTab} />
                  )}

                  {clientActiveTab === 'qr' && (
                    <QrScannerTab 
                      loggedClient={loggedClient}
                      onNavigateTab={setClientActiveTab}
                      getClientLevelInfo={getClientLevelInfo}
                    />
                  )}

                  {clientActiveTab === 'pagos' && (
                    <PaymentsTab
                      bcvRate={36.5}
                      clientData={loggedClient}
                      onNavigateTab={setClientActiveTab}
                      onAddNotification={onAddNotification}
                    />
                  )}

                  {clientActiveTab === 'perfil' && (
                    <ProfileTab
                      clientData={loggedClient}
                      clubLevel={Number((loggedClient as any)?.level || 1)}
                      kaluPoints={Number((loggedClient as any)?.loyaltyPoints || 0)}
                      onLogout={() => {
                        setLoggedClient(null);
                        setClientActiveTab('inicio');
                      }}
                      onNavigateSubView={(view) => {
                        console.log('Navigating to', view);
                      }}
                      onNavigateTab={(tab) => setClientActiveTab(tab)}
                    />
                  )}

                  {clientActiveTab !== 'inicio' && clientActiveTab !== 'tienda' && clientActiveTab !== 'qr' && clientActiveTab !== 'pagos' && clientActiveTab !== 'nivel' && clientActiveTab !== 'perfil' && (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-zinc-500 text-xs">Sección en construcción</p>
                    </div>
                  )}

                  {/* BOTTOM NAVIGATION BAR */}
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800 flex justify-around items-center px-2 z-40 rounded-b-[30px] md:rounded-b-none">
                    <button onClick={() => setClientActiveTab('inicio')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${clientActiveTab === 'inicio' ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-400'}`}>
                      <Home className="w-5 h-5 mb-1" />
                      <span className="text-[7px] uppercase font-bold tracking-wider">Inicio</span>
                    </button>
                    <button onClick={() => setClientActiveTab('tienda')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${clientActiveTab === 'tienda' ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-400'}`}>
                      <Store className="w-5 h-5 mb-1" />
                      <span className="text-[7px] uppercase font-bold tracking-wider">Tienda</span>
                    </button>
                    
                    {/* Botón Central QR */}
                    <button onClick={() => setClientActiveTab('qr')} className="relative -top-5 flex flex-col items-center justify-center w-14 h-14 rounded-full bg-emerald-500 text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:scale-105 transition-transform border-4 border-zinc-950">
                      <Scan className="w-6 h-6" />
                    </button>
                    
                    <button onClick={() => setClientActiveTab('pagos')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${clientActiveTab === 'pagos' ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-400'}`}>
                      <CreditCard className="w-5 h-5 mb-1" />
                      <span className="text-[7px] uppercase font-bold tracking-wider">Pagos</span>
                    </button>
                    <button onClick={() => setClientActiveTab('perfil')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${clientActiveTab === 'perfil' ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-400'}`}>
                      <User className="w-5 h-5 mb-1" />
                      <span className="text-[7px] uppercase font-bold tracking-wider">Perfil</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* PHONE 2: PORTAL DE PRODUCTORES: LIBRETA DE QUESO */}
        {(!isolatedType || isolatedType === 'productor' || isolatedType === 'proveedor') && (
        <div className={!isolatedType ? "flex flex-col items-center bg-editorial-card/30 border border-editorial-border rounded-xl p-6 shadow-sm" : "w-full min-h-screen bg-black text-white flex flex-col"}>
          {!isolatedType && (
          <div className="text-center mb-4">
            <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-editorial-text-primary mb-1">
              Dispositivo: Teléfono del Productor
            </h3>
            <p className="text-[10px] text-editorial-text-muted">Acceso individual seguro (Libreta de Queso)</p>
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
            <div className={`flex-1 overflow-y-auto bg-slate-900 text-slate-100 flex flex-col text-xs ${!isolatedType ? 'p-4 pt-7' : 'px-4 py-6'}`}>
              
              {!loggedSupplier ? (
                /* PRODUCER PORTAL: LOCK / LOGIN SCREEN */
                <div className="flex-1 flex flex-col justify-between py-6">
                  <div className="text-center mt-6 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                      <Smartphone className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h4 className="font-serif text-lg font-bold text-slate-100">Portal de Productores</h4>
                    <p className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest">Libreta de Queso</p>
                  </div>

                  <form onSubmit={handleSupplierLoginSubmit} className="space-y-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-slate-400 block">Cédula, Celular o Nombre:</label>
                      <input
                        type="text"
                        placeholder="Ej. 15082352, o Martín Niño"
                        value={supplierPhoneInput}
                        onChange={(e) => setSupplierPhoneInput(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-editorial-text-muted/70 block">PIN de Acceso (4 dígitos):</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        value={supplierPinInput}
                        onChange={(e) => setSupplierPinInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono tracking-[0.5em] text-center"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase rounded text-[10px] tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Ingresar a mi Libreta
                    </button>

                    <div className="pt-2 border-t border-slate-800 text-center">
                      <span className="text-[8px] text-slate-500 block">Productores demo disponibles:</span>
                      <div className="flex flex-wrap gap-1 justify-center mt-1">
                        {suppliers.slice(0, 3).map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSupplierPhoneInput(s?.name || '')}
                            className="bg-slate-800 hover:bg-slate-700 text-[8px] text-slate-300 px-1.5 py-0.5 rounded transition-all"
                          >
                            {(s?.name || 'Productor').split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>

                  <div className="text-center text-[8px] text-slate-500 space-y-1">
                    <p>🔒 Sistema de Cuenta Corriente Cerrado</p>
                    <p>Kalu CRM S.A. de C.V.</p>
                  </div>
                </div>
              ) : (
                /* PRODUCER PORTAL: LOGGED IN */
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Internal Bar */}
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <div>
                        <p className="font-bold text-slate-100 leading-none">{loggedSupplier.name}</p>
                        <p className="text-[8px] text-slate-400 mt-0.5">Libreta de Queso Activa</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setLoggedSupplier(null);
                        setSupplierCart([]);
                      }}
                      className="p-1 text-slate-500 hover:text-slate-300 rounded"
                      title="Cerrar sesión"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>

                  {/* PRODUCER LEDGER (LIBRETA DE QUESO REAL-TIME) */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-3.5 space-y-2">
                    <span className="text-[8px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Resumen de Cuenta Corriente:</span>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2 text-center">
                        <span className="text-[7px] text-slate-400 uppercase block">Nos Deben</span>
                        <span className="font-mono text-emerald-400 font-bold text-xs">
                          ${Number(loggedSupplier.balanceOwed || 0).toFixed(2)}
                        </span>
                        <span className="text-[6.5px] text-slate-500 block leading-none mt-0.5">(Quesos Entregados)</span>
                      </div>

                      <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2 text-center">
                        <span className="text-[7px] text-slate-400 uppercase block">Debo en Tienda</span>
                        <span className="font-mono text-rose-400 font-bold text-xs">
                          ${Number(loggedSupplier.storeDebt || 0).toFixed(2)}
                        </span>
                        <span className="text-[6.5px] text-slate-500 block leading-none mt-0.5">(Consumos / Moto)</span>
                      </div>
                    </div>

                    <div className="bg-slate-900/60 p-1.5 rounded text-[8.5px] font-mono text-slate-300 flex justify-between items-center">
                      <span>Saldo Neto a Cobrar:</span>
                      {(() => {
                        const net = loggedSupplier.balanceOwed - (loggedSupplier.storeDebt || 0);
                        return (
                          <span className={net >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {net >= 0 ? `$${Number(net || 0).toFixed(2)} M.N.` : `$${Number(Math.abs(net) || 0).toFixed(2)} M.N. (Deuda)`}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* VIRTUAL STORE SEARCH & CATEGORIES */}
                  <div className="space-y-2 mb-3">
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Pedir repuestos de moto, comida, víveres..."
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 pl-7 text-[10px] text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* Category tabs */}
                    <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar text-[9px] font-mono">
                      {(['Todos', 'Repuestos', 'Comidas', 'Quesos'] as const).map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSupplierCategory(cat)}
                          className={`px-2 py-1 rounded-full border transition-all shrink-0 ${
                            supplierCategory === cat
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Catalog display for Supplier */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                    {filteredSupplierProducts.length === 0 ? (
                      <p className="text-center text-[10px] text-slate-500 py-4 font-mono">No se encontraron productos</p>
                    ) : (
                      filteredSupplierProducts.map(p => {
                        const cartItem = supplierCart.find(item => item.productId === p.id);
                        return (
                          <div key={p.id} className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-2 flex justify-between items-center transition-all">
                            <div>
                              <div className="flex items-center gap-2">
                                {p.imageUrl && (
                                  <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded object-cover border border-slate-700/50" />
                                )}
                                <div>
                                  <div className="flex items-center gap-1">
                                    <span className={`px-1 py-0.2 rounded text-[7px] font-mono uppercase ${
                                      (p.category as string) === 'Repuestos' ? 'bg-sky-500/20 text-sky-400 font-bold' :
                                      (p.category as string) === 'Comidas' ? 'bg-amber-500/20 text-amber-400 font-bold' : 'bg-emerald-500/20 text-emerald-400 font-bold'
                                    }`}>
                                      {p.category}
                                    </span>
                                    <p className="font-bold text-slate-200 text-[10.5px] max-w-[150px] truncate leading-tight">{p.name}</p>
                                  </div>
                                  <p className="text-[10px] text-emerald-400 font-mono mt-0.5">
                                    ${Number(p.sellingPrice || 0).toFixed(2)} <span className="text-slate-500 text-[8px]">/{p.unit}</span>
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {cartItem && (
                                <>
                                  <button
                                    onClick={() => handleSupplierCartRemove(p.id)}
                                    className="w-4.5 h-4.5 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center font-bold text-slate-300 cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="w-5 text-center font-mono font-bold text-slate-200 text-[10px]">
                                    {cartItem.quantity}
                                  </span>
                                </>
                              )}
                              <button
                                onClick={() => handleSupplierCartAdd(p.id)}
                                className="w-4.5 h-4.5 bg-emerald-500 text-slate-950 font-bold rounded flex items-center justify-center hover:bg-emerald-400 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Cart checkout */}
                  {supplierCart.length > 0 && (
                    <form onSubmit={submitSupplierOrder} className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-2 bg-slate-950/80 p-2.5 rounded-lg shrink-0">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[8px] uppercase font-mono tracking-wider text-slate-400">Total Insumos:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          ${Number(supplierCart.reduce((sum, item) => sum + (products.find(p => p.id === item.productId)?.sellingPrice || 0) * item.quantity, 0)).toFixed(2)} M.N.
                        </span>
                      </div>

                      {/* Payment */}
                      <div className="grid grid-cols-2 gap-1.5 text-[8px]">
                        <button
                          type="button"
                          onClick={() => setSupplierPayment('fiado')}
                          className={`py-1 rounded font-mono uppercase transition-all border ${
                            supplierPayment === 'fiado'
                              ? 'bg-emerald-500 border-emerald-600 text-slate-950 font-bold'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          Cargar a Libreta
                        </button>
                        <button
                          type="button"
                          onClick={() => setSupplierPayment('contado')}
                          className={`py-1 rounded font-mono uppercase transition-all border ${
                            supplierPayment === 'contado'
                              ? 'bg-emerald-500 border-emerald-600 text-slate-950 font-bold'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          Efectivo hoy
                        </button>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase rounded text-[9px] tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Truck className="w-3 h-3" />
                        Mandar a Libreta de Queso
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* PHONE 3: PORTAL EMPLEADO (DAISY) - CARGA DE FACTURAS */}
        {(!isolatedType || isolatedType === 'contador') && (
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
            <div className={`flex-1 overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col text-xs relative ${!isolatedType ? 'pt-7' : ''}`}>
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
        )}

      </div>

      {/* CASHIER MOBILE ORDER DESK RECEIVER */}
      {!isolatedType && (
      <div className="bg-editorial-card border border-editorial-border rounded-lg p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-editorial-border/60 pb-4">
          <div className="flex items-center gap-2.5">
            <Clock className="text-amber-500 w-5 h-5" />
            <div>
              <h3 className="font-serif text-lg font-bold text-editorial-text-primary">
                Mesa de Recepción de Pedidos Móviles (Cajero en CRM)
              </h3>
              <p className="text-[10px] font-mono uppercase tracking-wider text-editorial-text-muted mt-0.5">
                Cola en tiempo real de pedidos enviados desde celulares
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded text-[10px] font-mono font-bold uppercase">
            {mobileOrders.filter(o => o.status === 'Pendiente').length} Pedidos Pendientes
          </span>
        </div>

        {mobileOrders.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-editorial-border/50 rounded-lg">
            <Smartphone className="w-8 h-8 text-editorial-text-muted/40 mx-auto mb-2" />
            <p className="text-xs text-editorial-text-muted font-mono uppercase">No hay pedidos entrantes en este momento</p>
            <p className="text-[10px] text-editorial-text-muted/60 mt-1">Utiliza los teléfonos de arriba para iniciar sesión en una cuenta, buscar repuestos o comidas y mandar un pedido.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {mobileOrders.map((order) => (
              <div
                key={order.id}
                className={`border rounded-lg p-4 transition-all ${
                  order.status === 'Pendiente'
                    ? 'border-amber-500/30 bg-amber-500/[0.01]'
                    : order.status === 'Entregado'
                    ? 'border-editorial-border/60 bg-editorial-bg opacity-75'
                    : 'border-editorial-border/30 bg-editorial-bg/30 opacity-50 line-through'
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-editorial-text-primary">
                        {order.id}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold rounded ${
                        order.type === 'client'
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {order.type === 'client' ? 'Cliente Normal (Quesos/Repuestos/Comida)' : 'Productor (Insumos/Libreta)'}
                      </span>
                      <span className="text-[10px] text-editorial-text-muted font-mono">
                        {order.date}
                      </span>
                    </div>

                    <div className="font-sans text-xs font-semibold text-editorial-text-primary">
                      Destinatario: <span className="underline">{order.entityName}</span>
                    </div>

                    <div className="text-[10px] text-editorial-text-muted font-mono">
                      Forma de Pago solicitada: <span className="uppercase text-editorial-text-primary font-semibold">{order.paymentMethod === 'fiado' ? 'Fiado / Cargo a Libreta' : 'Contado (Efectivo)'}</span>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="text-xs font-mono text-editorial-text-muted">Total:</div>
                    <div className="text-sm font-mono font-bold text-editorial-text-primary">
                      ${(order.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} M.N.
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase font-bold inline-block ${
                        order.status === 'Pendiente'
                          ? 'bg-amber-500 text-white animate-pulse'
                          : order.status === 'Entregado'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items listing */}
                <div className="mt-3 pt-3 border-t border-editorial-border/40 text-xs">
                  <span className="text-[9px] font-mono uppercase text-editorial-text-muted block mb-1">Detalle del Pedido:</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between border-b border-editorial-border/20 pb-0.5 text-editorial-text-primary/90">
                        <span>• {item.name} (x{item.quantity})</span>
                        <span>${Number(item.subtotal || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dispatch actions for cashier */}
                {order.status === 'Pendiente' && (
                  <div className="mt-4 pt-3 border-t border-editorial-border/30 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Deseas cancelar y rechazar el pedido ${order.id}?`)) {
                          onCancelMobileOrder(order.id);
                        }
                      }}
                      className="px-3 py-1.5 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[10px] font-mono uppercase font-bold rounded cursor-pointer transition-all"
                    >
                      Rechazar Pedido
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeliverMobileOrder(order.id);
                      }}
                      className="px-4 py-1.5 bg-emerald-500 hover:brightness-110 text-white border border-emerald-600 text-[10px] font-mono uppercase font-bold rounded cursor-pointer transition-all flex items-center gap-1 shadow-md"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Entregar, Despachar &amp; Registrar Libreta
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}
      {/* Real-Time Sync: Cashea-style Approval Lock */}
      {pendingCreditRequest && (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-950 text-slate-100 overflow-hidden animate-in slide-in-from-bottom-full duration-300">
          <div className="flex-1 flex flex-col p-6 items-center justify-center text-center relative">
            <div className="absolute inset-0 bg-emerald-900/20 animate-pulse pointer-events-none" />
            <div className="w-24 h-24 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6 relative z-10 mx-auto">
              <Store className="w-12 h-12 text-amber-500" />
            </div>
            <h2 className="text-3xl font-black mb-2 relative z-10 uppercase tracking-widest text-emerald-400">Aprobar Compra</h2>
            <p className="text-slate-400 mb-8 relative z-10">La tienda física solicita tu aprobación para finalizar esta compra a crédito.</p>

            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 relative z-10 mx-auto">
              <div className="text-4xl font-black text-white mb-6">
                ${(pendingCreditRequest.totalUSD || pendingCreditRequest.amount || 0).toFixed(2)}
              </div>
              
              <div className="space-y-3 text-sm font-mono text-left">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">Inicial Requerida (20%)</span>
                  <span className="text-white">${(pendingCreditRequest.downPayment || pendingCreditRequest.kaluCreditData?.inicial || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">Monto a Financiar</span>
                  <span className="text-white">${(pendingCreditRequest.financedAmount || pendingCreditRequest.kaluCreditData?.aFinanciar || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">Plan de Cuotas</span>
                  <span className="text-amber-400 font-bold">{pendingCreditRequest.installmentsCount || 4} x ${(pendingCreditRequest.financedAmount ? (pendingCreditRequest.financedAmount/(pendingCreditRequest.installmentsCount || 4)) : pendingCreditRequest.kaluCreditData?.cuotas || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-slate-500">Factura #</span>
                  <span className="text-slate-300">{pendingCreditRequest.invoiceNumber}</span>
                </div>
              </div>
            </div>

            <div className="w-full max-w-sm space-y-3 relative z-10 mx-auto">
              <button
                                onClick={async () => {
                  try {
                    // Validar identidad del cliente contra la orden
                    if (!loggedClient || (
                        pendingCreditRequest.clientId && 
                        pendingCreditRequest.clientId !== loggedClient.id && 
                        pendingCreditRequest.clientCiRif !== loggedClient.ciRif && 
                        pendingCreditRequest.clientPhone !== loggedClient.phone &&
                        pendingCreditRequest.clientCiRif !== loggedClient.cedula
                      )) {
                      onAddNotification('Esta orden no te pertenece o no has iniciado sesión correctamente.', 'warning');
                      return;
                    }

                    // 3. Marcar la transacción como completada en la BD (trigger para el POS)
                    await updateLocalDoc('transactions', pendingCreditRequest.id, { status: 'approved' });
                    setPendingCreditRequest(null);
                    onAddNotification('¡Compra aprobada con éxito!', 'success');
                  } catch (e) {
                    console.error(e);
                    onAddNotification('Error al procesar la aprobación del crédito', 'warning');
                  }
                }}
                className="w-full py-4 bg-emerald-500 text-slate-950 font-black text-lg uppercase tracking-wider rounded-xl hover:bg-emerald-400 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
              >
                Aprobar y Comprar
              </button>
              <button
                onClick={async () => {
                  try {
                    await updateLocalDoc('transactions', pendingCreditRequest.id, { status: 'rejected' });
                    setPendingCreditRequest(null);
                    onAddNotification('Has rechazado la solicitud de crédito.', 'info');
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="w-full py-4 bg-slate-900 border border-slate-800 text-rose-500 font-black text-lg uppercase tracking-wider rounded-xl hover:bg-rose-500/10 active:scale-95 transition-all"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
