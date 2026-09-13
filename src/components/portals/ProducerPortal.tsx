import React, { useState, useEffect } from 'react';
import { 
  Store, Home, Package, Truck, Wallet, LogOut, Search, Shield, ChevronRight, LogIn, User,
  ShoppingCart, X, Trash2, Copy, Image as ImageIcon, Banknote, Check,
  Key, ArrowLeft, Gift, MapPin, Mail, MessageCircle, Info, Star
} from 'lucide-react';
import { MobilePortalsViewProps } from '../MobilePortalsView';
import { SupplierProfile, Transaction, CheeseProduct, MobileOrder } from '../../types';
import { addLocalDoc, onCollectionSnapshot } from '../../services/localApi';
import KaluLoader from '../KaluLoader';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';

export default function ProducerPortal({ 
  products, suppliers, onAddNotification, isolatedType, isolatedId,
  cheeseTrips = [], transactions = [], mobileOrders = []
}: MobilePortalsViewProps) {
  
  const [loggedSupplier, setLoggedSupplier] = useState<SupplierProfile | null>(() => {
    try {
      const cached = localStorage.getItem('kaluMobileSupplierData');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Si ya tenemos sesión, simplemente quitamos el splash tras un breve retardo visual
    if (loggedSupplier) {
      const t = setTimeout(() => setIsInitializing(false), 800);
      return () => clearTimeout(t);
    }

    if (suppliers.length === 0) {
      setIsInitializing(true);
      const fallbackT = setTimeout(() => setIsInitializing(false), 2500);
      return () => clearTimeout(fallbackT);
    }

    // 1. Prioridad: Si nos pasan un ID específico por URL
    let foundSupplier = null;
    if ((isolatedType === 'productor' || isolatedType === 'proveedor') && isolatedId) {
      foundSupplier = suppliers.find(s => String(s.id) === String(isolatedId));
    }
    
    // 2. Si no hay ID en la URL, buscamos en el localStorage (Legacy fallback)
    if (!foundSupplier) {
      const savedSupplierId = localStorage.getItem('kaluMobileSupplierId');
      if (savedSupplierId) {
        foundSupplier = suppliers.find(s => String(s.id) === String(savedSupplierId));
      }
    }

    // 3. Si encontramos al proveedor por URL o por ID guardado, lo restauramos
    if (foundSupplier) {
      setLoggedSupplier(foundSupplier);
      localStorage.setItem('kaluMobileSupplierData', JSON.stringify(foundSupplier));
    }
    
    const t = setTimeout(() => setIsInitializing(false), 800);
    return () => clearTimeout(t);
  }, [isolatedId, isolatedType, suppliers, loggedSupplier]);

  // Mantiene los datos del productor actualizados en tiempo real si hay cambios en Firebase/Backend
  useEffect(() => {
    if (loggedSupplier && suppliers.length > 0) {
      const fresh = suppliers.find(s => String(s.id) === String(loggedSupplier.id));
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(loggedSupplier)) {
        setLoggedSupplier(fresh);
        localStorage.setItem('kaluMobileSupplierData', JSON.stringify(fresh));
      }
    }
  }, [suppliers]);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      alert("ERROR EN PANTALLA: " + e.message + " en " + e.filename + ":" + e.lineno);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);
  
  const [supplierPhoneInput, setSupplierPhoneInput] = useState('');
  const [supplierPinInput, setSupplierPinInput] = useState('');

  // Lockout States
  const [loginAttempts, setLoginAttempts] = useState(() => parseInt(localStorage.getItem('kaluProducerLoginAttempts') || '0'));
  const [lockoutUntil, setLockoutUntil] = useState(() => parseInt(localStorage.getItem('kaluProducerLockoutUntil') || '0'));
  const [loginError, setLoginError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Recovery States
  const [sendingRecoveryEmail, setSendingRecoveryEmail] = useState(false);
  const [sendingRecoveryWhatsapp, setSendingRecoveryWhatsapp] = useState(false);
  const [recoverySentVia, setRecoverySentVia] = useState<'email' | 'whatsapp'>('email');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [recoveryErrorMsg, setRecoveryErrorMsg] = useState('');

  useEffect(() => {
    localStorage.setItem('kaluProducerLoginAttempts', loginAttempts.toString());
    localStorage.setItem('kaluProducerLockoutUntil', lockoutUntil.toString());
  }, [loginAttempts, lockoutUntil]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (lockoutUntil > now && lockoutUntil !== Infinity) {
        setCountdown(Math.ceil((lockoutUntil - now) / 1000));
      } else if (lockoutUntil <= now && lockoutUntil !== 0) {
        setCountdown(0);
        setLockoutUntil(0);
        setLoginAttempts(0);
        setLoginError(null);
      } else {
        setCountdown(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  const handleFailedLogin = () => {
    const attempts = loginAttempts + 1;
    let lockout = lockoutUntil;
    let errorMsg = '';
    
    if (attempts === 1) {
      errorMsg = 'PIN o Usuario incorrecto. Quedan 2 intentos.';
    } else if (attempts === 2) {
      errorMsg = 'PIN incorrecto. Queda 1 intento.';
    } else if (attempts === 3) {
      errorMsg = 'Último intento antes del bloqueo de seguridad.';
    } else if (attempts === 4) {
      lockout = Date.now() + 300000; // 5 minutos
      errorMsg = 'Demasiados intentos. Bloqueo temporal de 5 minutos.';
    } else if (attempts > 4) {
      lockout = Infinity;
      errorMsg = 'Acceso bloqueado permanentemente por seguridad.';
    }

    setLoginAttempts(attempts);
    setLockoutUntil(lockout);
    setLoginError(errorMsg);
  };
  
  const STORE_BANNERS = [
    { id: 'b1', title: 'Nueva Línea de Repuestos Bera', image: 'bg-emerald-900', desc: 'Amortiguadores, tripas y cauchos con crédito Kalu a 4 cuotas.' },
    { id: 'b2', title: 'Víveres y Alimentos a Crédito Kalu', image: 'bg-slate-900', desc: 'Llena tu despensa hoy y paga en cómodas cuotas con tu nivel Kalu.' },
  ];

  const [bannerIdx, setBannerIdx] = useState(0);
  const [liveBanners, setLiveBanners] = useState<any[]>([]);
  const activeBanners = liveBanners.length > 0 ? liveBanners : STORE_BANNERS;

  useEffect(() => {
    const unsub = onCollectionSnapshot('banners', snap => {
      const arr = snap.filter((d: any) => d.active === true);
      setLiveBanners(arr);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % activeBanners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeBanners.length]);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.targetTouches[0].clientX);
  const handleTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > 50) {
      setBannerIdx((prev) => (prev + 1) % activeBanners.length);
    } else if (distance < -50) {
      setBannerIdx((prev) => (prev === 0 ? activeBanners.length - 1 : prev - 1));
    }
    setTouchStart(null);
    setTouchEnd(null);
  };
  
  const [producerActiveTab, setProducerActiveTab] = useState<'inicio' | 'tienda' | 'pagar' | 'perfil'>('inicio');
  const [profileSubView, setProfileSubView] = useState<'main' | 'mis-datos' | 'info-personal' | 'mis-direcciones' | 'seguridad' | 'recuperar-identidad' | 'recuperar-canales'>('main');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Swipe Navigation for Mobile Tabs (Inicio <-> Tienda <-> Pagar <-> Perfil)
  const producerSwipeHandlers = useSwipeNavigation({
    tabs: ['inicio', 'tienda', 'pagar', 'perfil'],
    activeTab: producerActiveTab,
    onTabChange: (newTab) => setProducerActiveTab(newTab),
    disabled: !loggedSupplier || isHistoryModalOpen || profileSubView !== 'main'
  });

  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierCategory, setSupplierCategory] = useState<'Todos' | 'Víveres' | 'Insumos/Repuestos'>('Todos');
  const [supplierCart, setSupplierCart] = useState<{ productId: string; quantity: number }[]>([]);
  const [inputQuantities, setInputQuantities] = useState<Record<string, string | number>>({});
  const [supplierPayment, setSupplierPayment] = useState<'contado' | 'fiado'>('contado');
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [paymentBank, setPaymentBank] = useState<'0102' | '0134'>('0102');
  const [paymentAmountBs, setPaymentAmountBs] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentImagePreview, setPaymentImagePreview] = useState<string | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, fieldId: string) => {
    const triggerSuccess = () => {
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    };

    const fallbackCopy = () => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.setSelectionRange(0, 99999);
      try {
        document.execCommand('copy');
        triggerSuccess();
      } catch (err) {
        console.error('Error al copiar', err);
      }
      textArea.remove();
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(triggerSuccess).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSupplierLogin = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (lockoutUntil > Date.now()) return;
    
    const cleanInput = supplierPhoneInput.replace(/\D/g, '');
    if (!cleanInput) {
      setLoginError('Por favor ingrese su cédula o teléfono.');
      return;
    }
    
    const supplier = suppliers.find(s => {
      const phoneDigits = (s.phone || '').toString().replace(/\D/g, '');
      const rfcDigits = (s.rfc || s.cedula || s.idNumber || '').toString().replace(/\D/g, '');
      return (phoneDigits && phoneDigits.includes(cleanInput)) || (rfcDigits && rfcDigits.includes(cleanInput));
    });

    if (!supplier) {
      handleFailedLogin();
      return;
    }

    const base = supplier.pin || supplier.cedula || supplier.rfc || supplier.phone || '000000';
    const expectedPin = String(base).replace(/\D/g, '').slice(-4).padEnd(6, '0');

    if (supplierPinInput === expectedPin) {
      setLoggedSupplier(supplier);
      localStorage.setItem('kaluMobileSupplierData', JSON.stringify(supplier));
      localStorage.setItem('kaluMobileSupplierId', supplier.id);
      setSupplierPhoneInput('');
      setSupplierPinInput('');
      setLoginAttempts(0);
      setLockoutUntil(0);
      setLoginError(null);
      onAddNotification(`¡Bienvenido, ${supplier.name}!`, 'success');
    } else {
      handleFailedLogin();
    }
  };

  const handleSupplierCartAdd = (productId: string) => {
    setSupplierCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) return prev.map(item => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { productId, quantity: 1 }];
    });
  };

  const handleSupplierCartRemove = (productId: string) => {
    setSupplierCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing && existing.quantity > 1) return prev.map(item => item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item);
      return prev.filter(item => item.productId !== productId);
    });
  };

  const handleSupplierCartSet = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleSupplierCartDelete(productId);
      return;
    }
    setSupplierCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) return prev.map(item => item.productId === productId ? { ...item, quantity } : item);
      return [...prev, { productId, quantity }];
    });
  };

  const handleSupplierCartDelete = (productId: string) => {
    setSupplierCart(prev => prev.filter(item => item.productId !== productId));
  };

  const submitSupplierOrder = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    try {
      if (!loggedSupplier || !loggedSupplier.id || !loggedSupplier.name) {
        return;
      }
      if (supplierCart.length === 0) {
        return;
      }
      
      let orderTotalUsd = 0;
      const items = supplierCart.map(item => {
        const product = (products || []).find(p => p.id === item.productId);
        const itemTotal = (product?.sellingPrice || 0) * item.quantity;
        orderTotalUsd += itemTotal;
        return {
          productId: item.productId,
          productName: product?.name || 'Insumo',
          quantity: item.quantity,
          unitPrice: product?.sellingPrice || 0,
          subtotal: itemTotal
        };
      });

      const newOrder: MobileOrder = {
        id: `ord_${Date.now()}`,
        type: 'supplier',
        entityId: loggedSupplier.id,
        entityName: loggedSupplier.name,
        date: new Date().toISOString(),
        items: items.map(i => ({
          productId: i.productId,
          name: i.productName,
          quantity: i.quantity,
          price: i.unitPrice,
          subtotal: i.subtotal,
          unit: 'Und'
        })),
        total: orderTotalUsd,
        paymentMethod: 'fiado',
        status: 'Pendiente'
      };

      await addLocalDoc('mobileOrders', newOrder);
      onAddNotification('Pedido enviado a caja exitosamente', 'success');
      setSupplierCart([]);
      setInputQuantities({});
      setIsCartModalOpen(false);
      setProducerActiveTab('perfil');
    } catch (err) {
      console.error("ERROR CRÍTICO AL ENVIAR PEDIDO:", err);
      alert("Error real en el código: " + (err as Error).message);
    }
  };

  const baseProducts = (products && products.length > 0) ? products : [
    { id: 'm1', name: 'Harina PAN Blanca 1kg', category: 'Víveres', sellingPrice: 1.10, imageUrl: '' },
    { id: 'm2', name: 'Arroz Mary 1kg', category: 'Víveres', sellingPrice: 1.20, imageUrl: '' },
    { id: 'm3', name: 'Aceite Mazeite 1L', category: 'Víveres', sellingPrice: 3.50, imageUrl: '' },
    { id: 'm4', name: 'Tripa de Moto Rin 18', category: 'Insumos/Repuestos', sellingPrice: 5.00, imageUrl: '' },
    { id: 'm5', name: 'Aceite de Motor 4T', category: 'Insumos/Repuestos', sellingPrice: 6.50, imageUrl: '' },
    { id: 'm6', name: 'Queso Duro Llanero', category: 'Víveres', sellingPrice: 4.50, imageUrl: '' }
  ] as CheeseProduct[];

  const filteredSupplierProducts = baseProducts.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes((supplierSearch || '').toLowerCase());
    
    // Normalizar la categoría real a nuestras opciones locales
    let normalizedCategory = 'Otros';
    const c = (p.category || '').toLowerCase();
    if (c.includes('vivere') || c.includes('comida') || p.name === 'Queso Duro Llanero') normalizedCategory = 'Víveres';
    if (c.includes('repuesto') || c.includes('insumo') || c.includes('moto')) normalizedCategory = 'Insumos/Repuestos';
    
    const matchesCategory = supplierCategory === 'Todos' || normalizedCategory === supplierCategory;
    
    // El productor solo ve víveres, insumos y el Queso Duro Llanero (prohibidos otros quesos)
    const isStoreItem = normalizedCategory === 'Víveres' || normalizedCategory === 'Insumos/Repuestos';
    const isNotFakeCheese = !c.includes('queso') || p.name === 'Queso Duro Llanero';
    
    return matchesSearch && matchesCategory && isStoreItem && isNotFakeCheese;
  });

  const producerTxs = (transactions || []).filter(t => t.clientId === loggedSupplier?.id || t.entity === loggedSupplier?.name);
  const producerArrimes = (producerTxs || []).filter(t => t.category === 'compras');
  const producerMobileOrders = (mobileOrders || []).filter(o => String(o.entityId) === String(loggedSupplier?.id));

  return (
    <div className={!isolatedType ? "flex flex-col items-center bg-slate-500/5 border border-slate-500/20 rounded-xl p-6 shadow-sm" : "w-full min-h-screen bg-black text-white flex flex-col"}>
      {!isolatedType && (
        <div className="text-center mb-4">
          <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-slate-500 mb-1">
            Portal Productor
          </h3>
          <p className="text-[10px] text-editorial-text-muted">Simulador Móvil - Libreta de Queso</p>
        </div>
      )}

      <div className={!isolatedType ? "w-[335px] h-[610px] bg-slate-950 border-[8px] border-slate-800 rounded-[38px] overflow-hidden shadow-2xl relative flex flex-col font-sans" : "flex-1 w-full bg-slate-950 flex flex-col font-sans"}>
        {!isolatedType && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4.5 bg-slate-800 rounded-b-xl z-20 flex justify-center items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900 mr-2" />
            <div className="w-10 h-1 rounded-full bg-slate-900" />
          </div>
        )}

        <div className={`flex-1 overflow-hidden bg-slate-950 text-slate-100 flex flex-col text-xs relative ${!isolatedType ? 'pt-7' : ''}`}>
          {isInitializing ? (
            <KaluLoader message="Mundo Kalu" subMessage="CARGANDO SESIÓN..." />
          ) : !loggedSupplier ? (
            <div className="flex-1 flex flex-col justify-center px-8 relative z-10 animate-fade-in">
              <div className="mb-8 text-center space-y-2">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <Package className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Portal de <br/><span className="text-emerald-400">Productores</span></h2>
                <p className="text-[11px] text-slate-400 font-mono tracking-wider">GESTIÓN DE ARRIME Y LIBRETA</p>
              </div>

              <form className="bg-slate-900/50 backdrop-blur-md p-5 rounded-3xl border border-slate-800/50 shadow-xl relative overflow-hidden">
                <div className="space-y-4 relative z-10">
                  {loginError && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl text-xs text-center animate-pulse font-bold">
                      {loginError}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 ml-1">Cédula o Teléfono</label>
                    <input disabled={lockoutUntil > Date.now()} type="tel" placeholder="04141234567" value={supplierPhoneInput} onChange={e => setSupplierPhoneInput(e.target.value)} className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 ml-1">PIN de Seguridad (6 DÍGITOS)</label>
                    <input disabled={lockoutUntil > Date.now()} type="password" placeholder="••••••" value={supplierPinInput} onChange={e => setSupplierPinInput(e.target.value.replace(/\D/g, ''))} maxLength={6} className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white text-center tracking-[0.5em] focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" />
                  </div>
                  <button disabled={lockoutUntil > Date.now()} type="button" onClick={(e) => { e.preventDefault(); handleSupplierLogin(e); }} className={`w-full mt-2 py-3.5 font-black uppercase rounded-2xl text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${lockoutUntil > Date.now() ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'}`}>
                    <LogIn className="w-4 h-4" /> {lockoutUntil === Infinity ? 'BLOQUEADO' : lockoutUntil > Date.now() ? `BLOQUEADO (${Math.floor(countdown / 60).toString().padStart(2, '0')}:${(countdown % 60).toString().padStart(2, '0')})` : 'Entrar al Portal'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div 
              {...producerSwipeHandlers}
              className="flex-1 flex flex-col min-h-0 relative pb-16 touch-pan-y"
            >
              {producerActiveTab !== 'tienda' && (
                <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3 px-4 mt-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <div>
                    <p className="font-bold text-slate-100 leading-none">{loggedSupplier.name}</p>
                    <p className="text-[8px] text-slate-400 mt-0.5">Libreta de Queso Activa</p>
                  </div>
                </div>
                <button onClick={() => { 
                  setLoggedSupplier(null); 
                  setSupplierCart([]); 
                  localStorage.removeItem('kaluMobileSupplierData');
                  localStorage.removeItem('kaluMobileSupplierId');
                }} className="p-1 text-slate-500 hover:text-slate-300 rounded">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
              )}

              {producerActiveTab === 'inicio' && (
                <div className="px-4 flex-1 flex flex-col min-h-0 space-y-3 pb-2 pt-1">
                  {/* Tarjeta de Balance Principal (Más Compacta) */}
                  <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-4 relative overflow-hidden shadow-sm shrink-0">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full -mr-8 -mt-8 blur-xl" />
                    
                    <div className="flex justify-between items-start mb-2 relative z-10">
                      <div>
                        <span className="text-[9px] uppercase font-bold tracking-widest text-emerald-400">Mi Libreta Digital</span>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{loggedSupplier.name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                          {Number(loggedSupplier.balanceOwed || 0) - Number(loggedSupplier.storeDebt || 0) >= 0 ? 'AL DÍA' : 'FIADO / DEUDA'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="relative z-10">
                      {(() => {
                        const balance = Number(loggedSupplier?.balanceOwed || 0);
                        const debt = Number(loggedSupplier?.storeDebt || 0);
                        const net = balance - debt;
                        return (
                          <>
                            <div className="flex items-baseline gap-1">
                              <span className={`text-2xl font-black font-mono tracking-tighter ${net >= 0 ? 'text-white' : 'text-rose-400'}`}>
                                {net >= 0 ? `$${net.toFixed(2)}` : `-$${Math.abs(net).toFixed(2)}`}
                              </span>
                              <span className="text-xs font-bold text-slate-500 font-mono">USD</span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">~ Bs. {(Math.abs(net) * 45.0).toFixed(2)} (Tasa: 45.0)</p>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Grilla 2x2 */}
                  <div className="grid grid-cols-2 gap-3 shrink-0">
                    {/* Ranking Puntos */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                      <div className="flex justify-between items-center mb-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span className="text-[8px] font-bold text-slate-500 uppercase">Fidelidad</span>
                      </div>
                      <div>
                        <p className="text-lg font-black font-mono text-slate-200">{Number((loggedSupplier as any).puntos || 0)}</p>
                        <p className="text-[8px] text-slate-400 uppercase">Puntos Kalu</p>
                      </div>
                    </div>

                    {/* Queso Semana */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                      <div className="flex justify-between items-center mb-2">
                        <Truck className="w-4 h-4 text-emerald-400" />
                        <span className="text-[8px] font-bold text-slate-500 uppercase">Semana</span>
                      </div>
                      <div>
                        <p className="text-lg font-black font-mono text-slate-200">
                          {producerArrimes.reduce((acc, a) => acc + (Number((a as any).kg) || 0), 0)}<span className="text-xs text-slate-500 font-normal">kg</span>
                        </p>
                        <p className="text-[8px] text-slate-400 uppercase">Arrime Actual</p>
                      </div>
                    </div>

                    {/* Queso Historico */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                      <div className="flex justify-between items-center mb-2">
                        <Package className="w-4 h-4 text-emerald-400" />
                        <span className="text-[8px] font-bold text-slate-500 uppercase">Histórico</span>
                      </div>
                      <div>
                        <p className="text-lg font-black font-mono text-slate-200">
                          {/* Fake historical data for demonstration */}
                          {(producerArrimes.reduce((acc, a) => acc + (Number((a as any).kg) || 0), 0) * 1.5).toFixed(0)}<span className="text-xs text-slate-500 font-normal">kg</span>
                        </p>
                        <p className="text-[8px] text-slate-400 uppercase">Total Año</p>
                      </div>
                    </div>

                    {/* Mi Libreta / Movimientos */}
                    <button 
                      onClick={() => setIsHistoryModalOpen(true)}
                      className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex flex-col justify-between hover:bg-emerald-500/20 transition-all text-left group"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <Wallet className="w-4 h-4 text-emerald-400" />
                        <ChevronRight className="w-3 h-3 text-emerald-500 group-hover:translate-x-1 transition-transform" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-emerald-400 uppercase leading-tight">Movimientos<br/>y Deudas</p>
                        <p className="text-[8px] text-emerald-500/70 uppercase mt-0.5">Ver Historial</p>
                      </div>
                    </button>
                  </div>

                  {/* Carrusel */}
                  <div data-no-swipe="true" className="flex-1 min-h-0 relative rounded-2xl overflow-hidden shadow-2xl mb-1 mt-1">
                    <div 
                      className="w-full h-full relative"
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                    >
                      <div
                        className="flex h-full transition-transform duration-500 ease-in-out"
                        style={{ transform: `translateX(-${bannerIdx * 100}%)` }}
                      >
                        {activeBanners.map(b => {
                          const isVid = b.type && b.type.includes('video');
                          const isMock = !b.url;

                          return (
                            <div
                              key={b.id}
                              className={`w-full h-full flex-shrink-0 ${isMock ? b.image : 'bg-slate-900'} p-0 flex flex-col justify-end relative overflow-hidden`}
                            >
                              {!isMock && (
                                <div className="absolute inset-0 w-full h-full">
                                  {isVid ? (
                                    <video src={b.url} autoPlay loop muted playsInline className="w-full h-full object-cover pointer-events-none" />
                                  ) : (
                                    <img src={b.url} alt={b.title} className="w-full h-full object-cover" />
                                  )}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent pointer-events-none" />
                              <div className="relative z-10 p-4 pointer-events-none">
                                <span className="inline-block px-2 py-0.5 bg-emerald-500 text-slate-950 text-[8px] font-black uppercase tracking-widest rounded mb-1">
                                  Destacado
                                </span>
                                <h3 className="font-extrabold text-sm text-white leading-tight">{b.title}</h3>
                                {b.desc && <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">{b.desc}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Indicadores flotantes sobre el carrusel */}
                      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-20">
                        {activeBanners.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setBannerIdx(i)}
                            className={`h-1 rounded-full transition-all ${bannerIdx === i ? 'w-4 bg-emerald-500' : 'w-1.5 bg-slate-400/50'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {producerActiveTab === 'tienda' && (
                <div className="px-4 space-y-3 flex-1 flex flex-col min-h-0 pt-3">
                  <div className="space-y-2 shrink-0">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input type="text" placeholder="Buscar productos o víveres..." value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2 pl-9 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[9px] font-mono">
                      {(['Todos', 'Víveres', 'Insumos/Repuestos'] as const).map(cat => (
                        <button key={cat} onClick={() => setSupplierCategory(cat)} className={`px-3 py-1.5 rounded-full border transition-all shrink-0 ${supplierCategory === cat ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-bold' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>{cat}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pb-20 pr-1">
                    {filteredSupplierProducts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-2 mt-10">
                        <Package className="w-10 h-10 text-slate-500" />
                        <p className="text-xs font-mono uppercase text-slate-400">Catálogo Vacío</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {filteredSupplierProducts.map(p => {
                          const cartItem = supplierCart.find(item => item.productId === p.id);
                          return (
                            <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col relative group">
                              <div className="aspect-[4/3] bg-slate-800 w-full relative">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950/50">
                                    <Package className="w-6 h-6 text-slate-700 mb-1" />
                                    <span className="text-[8px] font-mono uppercase text-slate-600 font-bold">Sin Imagen</span>
                                  </div>
                                )}
                                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase bg-slate-950/80 backdrop-blur-sm text-slate-300 border border-slate-800">
                                  {p.category}
                                </div>
                              </div>
                              
                              <div className="p-2.5 flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="font-bold text-slate-200 text-[10px] leading-tight line-clamp-2">{p.name}</p>
                                </div>
                                <div className="mt-2 space-y-1.5">
                                  <div className="flex flex-col">
                                    <p className="text-xs text-emerald-400 font-mono font-black">${Number(p.sellingPrice || 0).toFixed(2)}</p>
                                    <p className="text-[9px] text-slate-500 font-mono">~ Bs. {(Number(p.sellingPrice || 0) * 45.0).toFixed(2)}</p>
                                  </div>
                                  
                                  <div className="pt-1 flex gap-2">
                                    <input 
                                      type="number" 
                                      inputMode="numeric"
                                      min="1"
                                      value={inputQuantities[p.id] !== undefined ? inputQuantities[p.id] : 1}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setInputQuantities(prev => ({...prev, [p.id]: val === '' ? '' : parseInt(val) || 0}));
                                      }}
                                      className="w-12 bg-slate-950 border border-slate-800 rounded-lg text-center text-[11px] text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                    <button 
                                      onClick={() => {
                                        const val = inputQuantities[p.id];
                                        const qty = typeof val === 'number' ? val : (parseInt(String(val)) || 1);
                                        handleSupplierCartSet(p.id, qty);
                                      }} 
                                      className={`flex-1 py-1.5 font-bold uppercase rounded-lg text-[9px] tracking-wider transition-colors border ${cartItem ? 'bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-500'}`}
                                    >
                                      {cartItem ? 'Añadido' : 'Agregar'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  
                  {/* Botón Flotante de Carrito (Estilo Pill) */}
                  {supplierCart.length > 0 && !isCartModalOpen && (
                    <button 
                      onClick={() => setIsCartModalOpen(true)}
                      className="fixed bottom-20 right-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-full py-3 px-5 shadow-[0_8px_30px_rgb(16,185,129,0.3)] flex items-center gap-3 animate-fade-in transition-all z-50"
                    >
                      <ShoppingCart className="w-5 h-5" />
                      <div className="flex items-center gap-2 font-bold font-mono">
                        <span>${supplierCart.reduce((sum, item) => sum + (products.find(p => p.id === item.productId)?.sellingPrice || 0) * item.quantity, 0).toFixed(2)}</span>
                        <span className="bg-slate-950 text-emerald-400 px-2 py-0.5 rounded-full text-[10px]">
                          {supplierCart.reduce((sum, item) => sum + item.quantity, 0)}
                        </span>
                      </div>
                    </button>
                  )}

                  {/* Modal / Desplegable de Resumen del Carrito */}
                  {isCartModalOpen && (
                    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col justify-end animate-fade-in">
                      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 flex flex-col max-h-[85vh] relative z-50 animate-slide-up shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <ShoppingCart className="w-5 h-5 text-emerald-400" /> Mi Pedido
                          </h3>
                          <button onClick={() => setIsCartModalOpen(false)} className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-4">
                          {supplierCart.map(item => {
                            const p = products.find(prod => prod.id === item.productId) || baseProducts.find(prod => prod.id === item.productId);
                            if (!p) return null;
                            return (
                              <div key={item.productId} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                                <div className="flex-1 pr-2">
                                  <p className="text-xs font-bold text-slate-200 line-clamp-1">{p.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-[10px] text-emerald-400 font-mono">${Number(p.sellingPrice || 0).toFixed(2)}</p>
                                    <span className="text-[9px] text-slate-500 font-mono">x {item.quantity}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="text-[11px] font-bold text-white font-mono mr-2">${(Number(p.sellingPrice || 0) * item.quantity).toFixed(2)}</p>
                                  <button onClick={() => handleSupplierCartDelete(p.id)} className="w-8 h-8 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg flex items-center justify-center transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t border-slate-800/50 shrink-0">
                          <div className="flex justify-between items-end mb-2">
                            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Total a Pagar</span>
                            <div className="text-right">
                              <span className="font-mono font-black text-2xl text-emerald-400 block leading-none">
                                ${supplierCart.reduce((sum, item) => {
                                  const p = products.find(prod => prod.id === item.productId) || baseProducts.find(prod => prod.id === item.productId);
                                  return sum + (p ? (p.sellingPrice || 0) * item.quantity : 0);
                                }, 0).toFixed(2)}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500">
                                ~ Bs. {(supplierCart.reduce((sum, item) => {
                                  const p = products.find(prod => prod.id === item.productId) || baseProducts.find(prod => prod.id === item.productId);
                                  return sum + (p ? (p.sellingPrice || 0) * item.quantity : 0);
                                }, 0) * 45.0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          
                          <button 
                            type="button" 
                            onClick={submitSupplierOrder} 
                            className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-all uppercase tracking-wider shadow-[0_4px_14px_rgb(16,185,129,0.2)]"
                          >
                            Confirmar Pedido
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {producerActiveTab === 'pagar' && (
                <div className="px-4 flex-1 overflow-y-auto pb-4 pt-4">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Banknote className="w-5 h-5 text-emerald-400" /> Reportar Pago Móvil
                    </h3>
                    <button onClick={() => setProducerActiveTab('inicio')} className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-6 pb-20">
                    {/* 1. BANCO DESTINO */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pl-1">1. Banco Destino</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => setPaymentBank('0102')}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-colors ${paymentBank === '0102' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                        >
                          <span className="font-bold text-sm">Venezuela</span>
                          <span className="text-[10px] font-mono mt-1 opacity-70">0102</span>
                        </button>
                        <button 
                          onClick={() => setPaymentBank('0134')}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-colors ${paymentBank === '0134' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                        >
                          <span className="font-bold text-sm">Banesco</span>
                          <span className="text-[10px] font-mono mt-1 opacity-70">0134</span>
                        </button>
                      </div>
                    </div>

                    {/* 2. DATOS A TRANSFERIR */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pl-1">2. Datos a Transferir</p>
                      <div className="space-y-3">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Teléfono</p>
                            <p className="font-mono text-slate-200 font-bold tracking-wider mt-0.5">04243068286</p>
                          </div>
                          <button onClick={() => handleCopy('04243068286', 'phone')} className="p-2 text-slate-500 hover:text-emerald-400 transition-colors">
                            {copiedField === 'phone' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Cédula de Identidad</p>
                            <p className="font-mono text-slate-200 font-bold tracking-wider mt-0.5">V-11120033</p>
                          </div>
                          <button onClick={() => handleCopy('V11120033', 'id')} className="p-2 text-slate-500 hover:text-emerald-400 transition-colors">
                            {copiedField === 'id' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 3. MONTO DEL PAGO */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pl-1">3. Monto del Pago</p>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-emerald-500/50 font-bold">Bs.</span>
                          <input 
                            type="number"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={paymentAmountBs}
                            onChange={(e) => setPaymentAmountBs(e.target.value)}
                            className="bg-transparent text-white font-mono font-bold text-xl w-full focus:outline-none placeholder-slate-700"
                          />
                        </div>
                        <button onClick={() => setPaymentAmountBs('')} className="p-2 text-slate-500 hover:text-rose-400 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 4. DATOS DEL PAGO */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pl-1">4. Datos del Pago</p>
                      <div className="space-y-3">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                          <input 
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="Últimos 6 dígitos de la referencia"
                            value={paymentRef}
                            onChange={(e) => setPaymentRef(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="bg-transparent text-slate-200 font-mono w-full focus:outline-none placeholder-slate-600 text-center tracking-widest"
                          />
                        </div>
                        
                        <label htmlFor="pago-capture-file" className="border-2 border-dashed border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-slate-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors bg-slate-900/50 relative overflow-hidden">
                          {paymentImagePreview ? (
                            <>
                              <img src={paymentImagePreview} alt="Captura de pantalla de pago" className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" />
                              <div className="relative z-10 bg-slate-950/80 px-4 py-2 rounded-xl text-emerald-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border border-emerald-500/30 pointer-events-none">
                                <ImageIcon className="w-4 h-4" /> Cambiar Captura
                              </div>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-8 h-8 mb-2 opacity-50 pointer-events-none" />
                              <p className="text-xs font-bold pointer-events-none">Adjuntar Captura de Pantalla</p>
                              <p className="text-[9px] font-mono mt-1 opacity-70 pointer-events-none">JPG, PNG</p>
                            </>
                          )}
                          <input type="file" id="pago-capture-file" accept="image/*" className="absolute inset-0 opacity-0 w-full h-full z-20 cursor-pointer" onChange={handleImageChange} />
                        </label>
                        
                        <button className="w-full py-4 mt-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-slate-950 font-bold uppercase tracking-widest text-[11px] rounded-xl transition-colors border border-emerald-500/20 flex items-center justify-center gap-2">
                          Enviar Comprobante a Caja <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {producerActiveTab === 'perfil' && (
                <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
                  {/* MAIN PROFILE VIEW */}
                  {profileSubView === 'main' && (
                    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5 animate-fade-in">
                      {/* Cabecera Nivel Kalu */}
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 relative overflow-hidden flex items-center justify-between">
                        <div className="relative z-10">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Mundo Kalu • Nivel K1</span>
                          <h2 className="text-xl font-bold text-white mb-1">Clase Estándar</h2>
                          <div className="flex items-center gap-1.5 text-amber-400">
                            <span className="text-xs font-semibold">{loggedSupplier?.points || 0} pts</span>
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                          </div>
                        </div>
                        <div className="relative z-10 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Productor Activo</span>
                        </div>
                      </div>

                      {/* Información (Menú) */}
                      <div>
                        <h3 className="text-sm font-bold text-white mb-3">Información</h3>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                          <button onClick={() => {}} className="w-full flex items-center justify-between p-4 border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3 text-emerald-400">
                              <Gift className="w-5 h-5" />
                              <span className="text-sm font-semibold text-slate-100">Tus recompensas</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </button>
                          
                          <button onClick={() => setProfileSubView('seguridad')} className="w-full flex items-center justify-between p-4 border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3 text-emerald-400">
                              <Shield className="w-5 h-5" />
                              <span className="text-sm font-semibold text-slate-100">Seguridad de tu cuenta</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </button>

                          <button onClick={() => setProfileSubView('mis-datos')} className="w-full flex items-center justify-between p-4 border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3 text-emerald-400">
                              <User className="w-5 h-5" />
                              <span className="text-sm font-semibold text-slate-100">Mis datos</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </button>

                          <button onClick={() => {}} className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3 text-emerald-400">
                              <Info className="w-5 h-5" />
                              <span className="text-sm font-semibold text-slate-100">Sobre Mundo Kalu</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </button>
                        </div>
                      </div>

                      {/* Invita y suma puntos */}
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white mb-1">Invita y suma puntos</h3>
                          <div className="flex items-center gap-1.5 text-amber-400">
                            <span className="text-[10px] font-bold uppercase tracking-widest">Gana hasta 200</span>
                            <Star className="w-3 h-3 fill-amber-400" />
                            <ChevronRight className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <Gift className="w-5 h-5" />
                        </div>
                      </div>

                      {/* Cerrar Sesión */}
                      <button 
                        onClick={() => { setLoggedSupplier(null); setSupplierCart([]); setProfileSubView('main'); setProducerActiveTab('inicio'); }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between hover:bg-rose-500/10 hover:border-rose-500/30 group transition-colors"
                      >
                        <span className="text-sm font-semibold text-slate-100 group-hover:text-rose-400">Cerrar sesión</span>
                        <LogOut className="w-5 h-5 text-slate-500 group-hover:text-rose-400" />
                      </button>
                      
                      <div className="text-center pt-4">
                        <span className="text-[8px] font-mono tracking-[0.3em] uppercase text-slate-600">Versión 3.2.0</span>
                      </div>
                    </div>
                  )}

                  {/* MIS DATOS */}
                  {profileSubView === 'mis-datos' && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col z-10 animate-slide-in-right">
                      <div className="flex items-center gap-4 px-4 py-5 border-b border-slate-900 shrink-0">
                        <button onClick={() => setProfileSubView('main')} className="p-1 rounded-full bg-slate-800 text-slate-300 hover:text-white">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold text-white">Mis datos</h2>
                      </div>
                      
                      <div className="p-4 space-y-4">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                          <button onClick={() => setProfileSubView('info-personal')} className="w-full flex items-center justify-between p-4 border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3 text-emerald-400">
                              <User className="w-5 h-5" />
                              <span className="text-sm font-semibold text-slate-100">Información personal</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </button>
                          <button onClick={() => setProfileSubView('mis-direcciones')} className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3 text-emerald-400">
                              <MapPin className="w-5 h-5" />
                              <span className="text-sm font-semibold text-slate-100">Mis direcciones</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* INFORMACIÓN PERSONAL */}
                  {profileSubView === 'info-personal' && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col z-20 animate-slide-in-right">
                      <div className="flex items-center gap-4 px-4 py-5 border-b border-slate-900 shrink-0">
                        <button onClick={() => setProfileSubView('mis-datos')} className="p-1 rounded-full bg-slate-800 text-slate-300 hover:text-white">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold text-white">Información personal</h2>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Nombre y Apellido</p>
                          <p className="text-sm font-semibold text-slate-100">{loggedSupplier.name}</p>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Cédula o Documento</p>
                          <p className="text-sm font-semibold text-slate-100">{loggedSupplier.cedula || loggedSupplier.rfc || loggedSupplier.idNumber || 'No registrado'}</p>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Número de celular</p>
                            <p className="text-sm font-semibold text-slate-100">{loggedSupplier.phone || 'Sin número registrado'}</p>
                          </div>
                          <button className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full">Actualizar</button>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Correo electrónico</p>
                            <p className="text-sm font-semibold text-slate-100">{(loggedSupplier as any)?.email || 'Sin correo registrado'}</p>
                          </div>
                          <button className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full">Actualizar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MIS DIRECCIONES (PLACEHOLDER) */}
                  {profileSubView === 'mis-direcciones' && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col z-20 animate-slide-in-right">
                      <div className="flex items-center gap-4 px-4 py-5 border-b border-slate-900 shrink-0">
                        <button onClick={() => setProfileSubView('mis-datos')} className="p-1 rounded-full bg-slate-800 text-slate-300 hover:text-white">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold text-white">Mis direcciones</h2>
                      </div>
                      
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
                        <MapPin className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-sm font-semibold mb-2 text-slate-300">Aún no tienes direcciones</p>
                        <p className="text-xs">Podrás agregar direcciones de entrega o fincas próximamente.</p>
                      </div>
                    </div>
                  )}

                  {/* SEGURIDAD */}
                  {profileSubView === 'seguridad' && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col z-10 animate-slide-in-right">
                      <div className="flex items-center gap-4 px-4 py-5 border-b border-slate-900 shrink-0">
                        <button onClick={() => setProfileSubView('main')} className="p-1 rounded-full bg-slate-800 text-slate-300 hover:text-white">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold text-white">Seguridad</h2>
                      </div>
                      
                      <div className="p-4">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                          <button onClick={() => setProfileSubView('recuperar-identidad')} className="w-full flex items-center justify-between p-4 border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3 text-emerald-400">
                              <Key className="w-5 h-5" />
                              <span className="text-sm font-semibold text-slate-100">Cambiar clave de seguridad</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </button>
                          
                          <div className="w-full flex items-center justify-between p-4">
                            <div className="flex items-start gap-3">
                              <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
                              <div className="text-left">
                                <p className="text-sm font-semibold text-slate-100">Usar datos biométricos</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">Aumenta la seguridad de la aplicación.</p>
                              </div>
                            </div>
                            {/* Toggle Switch UI */}
                            <div className="w-10 h-6 bg-slate-700 rounded-full flex items-center px-1 cursor-pointer ml-3 shrink-0">
                              <div className="w-4 h-4 bg-white rounded-full"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* RECUPERAR IDENTIDAD (MODAL FLOTANTE ESTILO) */}
                  {profileSubView === 'recuperar-identidad' && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col z-30 animate-fade-in">
                      {/* Fondo oscurecido para simular modal, aunque ocupa toda la pantalla en este diseño */}
                      <div className="absolute inset-0 bg-slate-950/80"></div>
                      
                      <div className="relative z-10 bg-slate-900 rounded-t-3xl border-t border-slate-800 mt-auto px-6 py-8 pb-10 flex flex-col items-center animate-slide-up text-center">
                        <div className="w-12 h-1 bg-slate-700 rounded-full mb-8"></div>
                        
                        <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-6">
                          <Key className="w-8 h-8 text-emerald-400" />
                        </div>
                        
                        <h2 className="text-xl font-bold text-white mb-2">Validemos tu identidad</h2>
                        <p className="text-xs text-slate-400 mb-8 max-w-[250px] mx-auto">
                          Necesitamos verificar que seas tú. Este paso no te llevará mucho tiempo.
                        </p>
                        
                        <button 
                          onClick={() => setProfileSubView('recuperar-canales')}
                          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase tracking-wider text-sm rounded-xl py-4 mb-4 transition-colors"
                        >
                          Comenzar
                        </button>
                        
                        <button 
                          onClick={() => setProfileSubView('seguridad')}
                          className="text-sm font-bold text-slate-400 hover:text-white transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SELECCIÓN DE CANALES DE RECUPERACIÓN */}
                  {profileSubView === 'recuperar-canales' && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col z-40 animate-slide-in-right">
                      <div className="flex items-center gap-4 px-4 py-5 shrink-0">
                        <button onClick={() => setProfileSubView('recuperar-identidad')} className="p-1 rounded-full bg-slate-800 text-slate-300 hover:text-white">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold text-white">Seguridad</h2>
                      </div>
                      
                      <div className="p-6">
                        <h2 className="text-2xl font-bold text-white leading-tight mb-2">Te enviaremos un código de<br/>recuperación</h2>
                        <p className="text-xs text-slate-400 mb-8">Elige dónde quieres recibirlo.</p>
                        
                        <div className="space-y-4">
                          <button 
                            disabled={sendingRecoveryWhatsapp || sendingRecoveryEmail}
                            onClick={async () => {
                              setSendingRecoveryWhatsapp(true);
                              const code = Math.floor(100000 + Math.random() * 900000).toString();
                              setRecoveryCode(code);
                              const targetPhone = loggedSupplier.phone || loggedSupplier.telefono || '04140000000';
                              const hostname = window.location.hostname || 'localhost';

                              try {
                                const res = await fetch(`http://${hostname}:3001/api/send-recovery`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ 
                                    channel: 'whatsapp', 
                                    phone: targetPhone, 
                                    code, 
                                    name: loggedSupplier.name 
                                  })
                                });
                                if (res.ok) {
                                  setRecoverySentVia('whatsapp');
                                  setProfileSubView('ingresar-codigo');
                                  setRecoveryCodeInput('');
                                  setRecoveryErrorMsg('');
                                } else {
                                  const errData = await res.json().catch(() => ({}));
                                  alert(`Error en WhatsApp: ${errData.details || errData.error || 'No se pudo enviar'}`);
                                }
                              } catch (e: any) {
                                console.error(e);
                                alert(`Error de conexión al enviar WhatsApp (${e.message})`);
                              } finally {
                                setSendingRecoveryWhatsapp(false);
                              }
                            }}
                            className={`w-full flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:bg-slate-800/80 transition-colors text-left group ${sendingRecoveryWhatsapp ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-slate-950 flex items-center justify-center">
                                {sendingRecoveryWhatsapp ? <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div> : <MessageCircle className="w-5 h-5 text-emerald-400" />}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-100">{sendingRecoveryWhatsapp ? 'Enviando WhatsApp...' : 'WhatsApp'}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Enviar a +58***{String(loggedSupplier.phone || '0000').slice(-4)}</p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                          </button>
                          
                          <button 
                            disabled={sendingRecoveryEmail || sendingRecoveryWhatsapp}
                            onClick={async () => {
                              setSendingRecoveryEmail(true);
                              const code = Math.floor(100000 + Math.random() * 900000).toString();
                              setRecoveryCode(code);
                              const targetEmail = loggedSupplier.email || loggedSupplier.correo || 'cherokejd566@gmail.com';
                              const hostname = window.location.hostname || 'localhost';
                              
                              try {
                                const res = await fetch(`http://${hostname}:3001/api/send-recovery`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ 
                                    channel: 'email', 
                                    email: targetEmail, 
                                    code, 
                                    name: loggedSupplier.name 
                                  })
                                });
                                if (res.ok) {
                                  setRecoverySentVia('email');
                                  setProfileSubView('ingresar-codigo');
                                  setRecoveryCodeInput('');
                                  setRecoveryErrorMsg('');
                                } else {
                                  const errData = await res.json().catch(() => ({}));
                                  alert(`Error en Correo: ${errData.details || errData.error || 'No se pudo enviar'}`);
                                }
                              } catch (e: any) {
                                console.error(e);
                                alert(`Error de conexión al enviar correo (${e.message})`);
                              } finally {
                                setSendingRecoveryEmail(false);
                              }
                            }}
                            className={`w-full flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:bg-slate-800/80 transition-colors text-left group ${sendingRecoveryEmail ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-slate-950 flex items-center justify-center">
                                {sendingRecoveryEmail ? <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-100 rounded-full animate-spin"></div> : <Mail className="w-5 h-5 text-slate-300" />}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-100">{sendingRecoveryEmail ? 'Enviando Correo...' : 'Correo'}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Enviar a {loggedSupplier.email || 'cherokejd566@gmail.com'}</p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* INGRESAR CÓDIGO DE RECUPERACIÓN */}
                  {profileSubView === 'ingresar-codigo' && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col z-40 animate-slide-in-right">
                      <div className="flex items-center gap-4 px-4 py-5 shrink-0">
                        <button onClick={() => setProfileSubView('recuperar-canales')} className="p-1 rounded-full bg-slate-800 text-slate-300 hover:text-white">
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold text-white">Verificación</h2>
                      </div>
                      
                      <div className="p-6">
                        <h2 className="text-2xl font-bold text-white leading-tight mb-2">Ingresa el código</h2>
                        <p className="text-xs text-slate-400 mb-8">
                          {recoverySentVia === 'whatsapp' 
                            ? 'Escribe el código de 6 dígitos que enviamos a tu WhatsApp.' 
                            : 'Escribe el código de 6 dígitos que enviamos a tu correo.'}
                        </p>
                        
                        <div className="space-y-4">
                          {recoveryErrorMsg && (
                            <div className="bg-rose-500/20 border border-rose-500/50 rounded-lg p-3">
                              <p className="text-rose-500 text-xs font-bold text-center">{recoveryErrorMsg}</p>
                            </div>
                          )}
                          <input 
                            type="text" 
                            placeholder="      " 
                            value={recoveryCodeInput} 
                            onChange={e => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                              setRecoveryCodeInput(val);
                            }} 
                            maxLength={6} 
                            className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-4 text-xl text-white text-center tracking-[0.75em] focus:outline-none focus:border-emerald-500 transition-colors" 
                          />
                          <button 
                            onClick={() => {
                              if (recoveryCodeInput === recoveryCode) {
                                // Aquí puedes mandar a otra vista para crear PIN.
                                alert('¡Código Correcto! Aquí irá el formulario para cambiar tu PIN.');
                                setProfileSubView('main');
                              } else {
                                setRecoveryErrorMsg('El código es incorrecto.');
                              }
                            }}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase tracking-wider text-sm rounded-xl py-4 transition-colors"
                          >
                            Verificar Código
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isHistoryModalOpen && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col justify-end animate-fade-in">
                  <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 flex flex-col max-h-[85vh] relative z-50 animate-slide-up shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-emerald-400" /> Movimientos y Deudas
                      </h3>
                      <button onClick={() => setIsHistoryModalOpen(false)} className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pr-1 pb-4">
                      <p className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-widest border-b border-slate-800 pb-1">Pedidos Activos</p>
                      {producerMobileOrders.length === 0 ? (
                        <p className="text-slate-500 text-[10px] text-center mt-4">No tienes pedidos activos</p>
                      ) : (
                        producerMobileOrders.map(order => (
                          <div key={order.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-2 mb-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-slate-200 text-[10px]">Pedido {order.id.slice(-6)}</p>
                                <span className="text-[8px] text-slate-400">{new Date(order.date).toLocaleDateString()}</span>
                              </div>
                              <div className="text-right flex flex-col items-end">
                                <span className="font-mono font-bold text-[11px] text-amber-400">${Number(order.total).toFixed(2)}</span>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded mt-1 font-bold uppercase ${order.status === 'Entregado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>{order.status}</span>
                              </div>
                            </div>
                            {order.status === 'Entregado' && (
                              <button 
                                onClick={() => { setIsHistoryModalOpen(false); setProducerActiveTab('pagar'); }}
                                className="w-full mt-1 bg-emerald-500 hover:bg-emerald-600 text-black font-bold uppercase tracking-widest text-[9px] rounded py-1.5 transition-colors"
                              >
                                Pagar Pedido
                              </button>
                            )}
                          </div>
                        ))
                      )}

                      <p className="text-[10px] text-slate-400 mb-2 mt-6 font-bold uppercase tracking-widest border-b border-slate-800 pb-1">Movimientos Recientes</p>
                      {(producerTxs || []).length === 0 ? <p className="text-slate-500 text-[10px] text-center mt-4">No hay movimientos</p> : (producerTxs || []).map(tx => (
                        <div key={tx.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex justify-between items-center mb-2">
                          <div>
                            <p className="font-bold text-slate-200 text-[10px]">{tx.notes || tx.entity}</p>
                            <span className="text-[8px] text-slate-400">{new Date(tx.date).toLocaleDateString()}</span>
                          </div>
                          <span className={`font-mono font-bold text-[11px] ${tx.isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {tx.isIncome ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                      
                      <p className="text-[10px] text-slate-400 mb-2 mt-6 font-bold uppercase tracking-widest border-b border-slate-800 pb-1">Arrimes Anteriores</p>
                      {(producerArrimes || []).length === 0 ? <p className="text-slate-500 text-[10px] text-center mt-4">No hay registros de arrime</p> : (producerArrimes || []).map(arrime => (
                        <div key={arrime.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] text-slate-400">{new Date(arrime.date).toLocaleDateString()}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded ${arrime.status === 'Completado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>{arrime.status}</span>
                          </div>
                          <p className="font-bold text-slate-200 text-[11px]">{arrime.notes || 'Recepción de Queso'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 h-16 bg-slate-950 border-t border-slate-800 flex justify-around items-center px-2 z-40 rounded-b-[30px] md:rounded-b-none">
                <button onClick={() => setProducerActiveTab('inicio')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${producerActiveTab === 'inicio' ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'}`}>
                  <Home className="w-5 h-5 mb-1" />
                  <span className="text-[8px] font-bold">Inicio</span>
                </button>
                <button onClick={() => setProducerActiveTab('tienda')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${producerActiveTab === 'tienda' ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'}`}>
                  <Store className="w-5 h-5 mb-1" />
                  <span className="text-[8px] font-bold">Tienda</span>
                </button>
                <button onClick={() => setProducerActiveTab('pagar')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${producerActiveTab === 'pagar' ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'}`}>
                  <Wallet className="w-5 h-5 mb-1" />
                  <span className="text-[8px] font-bold">Pagar</span>
                </button>
                <button onClick={() => setProducerActiveTab('perfil')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${producerActiveTab === 'perfil' ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'}`}>
                  <Shield className="w-5 h-5 mb-1" />
                  <span className="text-[8px] font-bold">Perfil</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
