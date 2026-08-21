import React, { useState, useRef, useEffect } from 'react';
import { CheeseProduct, ClientProfile, SupplierProfile, CheeseSaleItem, MobileOrder, Transaction } from '../types';
import { ShoppingCart, Calendar, Printer, FileText, CheckCircle, RefreshCw, AlertCircle, Trash2, Plus, Minus, User, Smartphone, Zap, Archive, Eye } from 'lucide-react';
import { parseSafeDecimal, formatCurrency, formatQuantity, getUnitLabel } from '../utils';
import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

interface CheesePOSViewProps {
  exchangeRate: number;
  settings: any;
  products: CheeseProduct[];
  clients: ClientProfile[];
  suppliers: SupplierProfile[];
  mobileOrders: MobileOrder[];
  allTransactions: Transaction[];
  onProcessSale: (sale: {
    client: ClientProfile | null;
    supplier: SupplierProfile | null;
    items: CheeseSaleItem[];
    paymentMethod: string;
    total: number;
    paidAmount?: number;
  }) => void;
  salesHistory: any[];
  dailySalesCount: number;
  dailyRevenue: number;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
}

export default function CheesePOSView({
  exchangeRate,
  settings,
  products,
  clients,
  suppliers,
  mobileOrders,
  allTransactions,
  onProcessSale,
  salesHistory,
  dailySalesCount,
  dailyRevenue,
  onAddNotification
}: CheesePOSViewProps) {
  // Helper para procesar números y precios de manera segura (Regla estricta 2)
  const parseNum = (val: any) => parseSafeDecimal(val);
  const [activeTab, setActiveTab] = useState<'pos' | 'history' | 'closing' | 'closing_history'>('pos');
  // POS Register States
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const f4LastTimeRef = useRef<number>(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();

        if (isProcessing) {
          console.warn('[POS] Ignorando F4: Transacción en proceso.');
          return;
        }

        const now = Date.now();
        if (now - f4LastTimeRef.current < 500) {
          console.warn('[POS] Ignorando F4: Presión rápida (Debounce).');
          return;
        }
        f4LastTimeRef.current = now;

        if (!isPaymentModalOpen) {
          setIsPaymentModalOpen(true);
        } else if (formRef.current) {
          formRef.current.requestSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, isPaymentModalOpen]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState<string>('0');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CheeseSaleItem[]>(() => {
    try {
      const saved = localStorage.getItem('pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('pos_cart', JSON.stringify(cart));
  }, [cart]);

  const [customerType, setCustomerType] = useState<'client' | 'supplier'>('client');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [clientSearchText, setClientSearchText] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [supplierSearchText, setSupplierSearchText] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo $');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [addedPayments, setAddedPayments] = useState<{ id: string; method: string; amount: number; reference: string; currency?: string; originalAmount?: number }[]>([]);
  const [isCreditSale, setIsCreditSale] = useState<boolean>(false);
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);

  // Cierre de caja States
  const [startingCash, setStartingCash] = useState<number>(() => {
    return settings?.defaultStartingCash || Number(localStorage.getItem('kalu_starting_cash')) || 0;
  });
  const [actualCash, setActualCash] = useState<number>(() => {
    return settings?.defaultStartingCash || Number(localStorage.getItem('kalu_starting_cash')) || 0;
  });

  useEffect(() => {
    localStorage.setItem('kalu_starting_cash', startingCash.toString());
  }, [startingCash]);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [closingReport, setClosingReport] = useState<any | null>(null);
  const [closingsHistory, setClosingsHistory] = useState<any[]>([]);
  const [selectedAuditClosing, setSelectedAuditClosing] = useState<any | null>(null);

  useEffect(() => {
    const fetchClosings = async () => {
      try {
        const q = query(collection(db, 'cashClosings'), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        setClosingsHistory(data);
      } catch (error) {
        console.error('Error cargando historial de cierres:', error);
      }
    };
    fetchClosings();
  }, [isClosed]);

  // Calculate Cart Totals (Regla estricta 2)
  const { subtotal, tax, total } = React.useMemo(() => {
    const sub = cart.reduce((sum, item) => sum + (parseNum(item.subtotal) || (parseNum(item.quantityKg) * parseNum(item.pricePerKg)) || 0), 0);
    const rate = settings?.taxRate !== undefined ? settings.taxRate : 5;
    const tx = sub * (rate / 100);
    return { subtotal: sub, tax: tx, total: sub + tx };
  }, [cart, settings?.taxRate]);

  const handleAddToCart = (product: CheeseProduct, qty: number = 1.0) => {
    const stock = parseNum(product.stockKg);
    if (stock <= 0) {
      onAddNotification(`El producto ${product.name} está agotado temporalmente.`, 'warning');
      return;
    }

    const availableStock = stock;
    const existing = cart.find(item => item.productId === product.id);
    const currentQty = existing ? parseNum(existing.quantityKg) : 0;
    const addQty = parseNum(qty);
    const newQty = parseNum((currentQty + addQty).toFixed(2));
    const pPrice = parseNum(product.sellingPrice);

    if (newQty > availableStock) {
      onAddNotification(`Stock insuficiente. Solo quedan ${availableStock} kg de ${product.name}.`, 'warning');
      return;
    }

    if (existing) {
      setCart(prev => prev.map(item => 
        item.productId === product.id 
          ? { ...item, quantityKg: newQty, subtotal: parseNum((newQty * pPrice).toFixed(2)) }
          : item
      ));
    } else {
      setCart(prev => [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          quantityKg: addQty,
          pricePerKg: pPrice,
          subtotal: parseNum((addQty * pPrice).toFixed(2)),
          unit: product.unit || getUnitLabel(product) as any
        }
      ]);
    }
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existing = cart.find(item => item.productId === productId);
    if (!existing) return;

    const currentQty = parseNum(existing.quantityKg);
    const deltaNum = parseNum(delta);
    const newQty = parseNum((currentQty + deltaNum).toFixed(2));
    const pPrice = parseNum(existing.pricePerKg);

    if (newQty <= 0) {
      handleRemoveFromCart(productId);
      return;
    }

    const stock = parseNum(product.stockKg);
    if (newQty > stock) {
      onAddNotification(`Stock insuficiente. Máximo ${stock} kg disponibles.`, 'warning');
      return;
    }

    setCart(prev => prev.map(item =>
      item.productId === productId
        ? { ...item, quantityKg: newQty, subtotal: parseNum((newQty * pPrice).toFixed(2)) }
        : item
    ));
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const totalAbonado = addedPayments.reduce((sum, p) => sum + p.amount, 0);

  const handleAddPayment = () => {
    const rawAmount = parseSafeDecimal(paidAmountInput);
    if (rawAmount <= 0) {
      onAddNotification('Ingrese un monto válido a abonar.', 'warning');
      return;
    }

    let amountInUsd = rawAmount;
    let currency = '$';

    if (paymentMethod !== 'Efectivo $') {
       amountInUsd = rawAmount / exchangeRate;
       currency = 'Bs';
    }

    setAddedPayments([...addedPayments, {
      id: Date.now().toString(),
      method: paymentMethod,
      amount: amountInUsd,
      originalAmount: rawAmount,
      currency,
      reference: paymentReference
    }]);
    setPaidAmountInput('');
    setPaymentReference('');
  };

  const handleRemovePayment = (id: string) => {
    setAddedPayments(addedPayments.filter(p => p.id !== id));
  };

  const handleProcessSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);
    
    if (cart.length === 0) {
      onAddNotification('El carrito de compras está vacío.', 'warning');
      setIsProcessing(false);
      return;
    }

    const client = customerType === 'client' ? (clients.find(c => c.id === selectedClientId) || null) : null;
    const supplier = customerType === 'supplier' ? (suppliers.find(s => s.id === selectedSupplierId) || null) : null;

    if (customerType === 'client' && !selectedClientId) {
      onAddNotification('Por favor, seleccione un cliente para registrar la venta.', 'warning');
      setIsProcessing(false);
      return;
    }

    if (customerType === 'supplier' && !selectedSupplierId) {
      onAddNotification('Por favor, seleccione un productor para registrar la venta en su libreta.', 'warning');
      setIsProcessing(false);
      return;
    }

    if (!isCreditSale && totalAbonado < total) {
      onAddNotification('El monto total abonado no cubre el valor de la venta.', 'warning');
      setIsProcessing(false);
      return;
    }

    const paidAmount = isCreditSale ? totalAbonado : Math.max(total, totalAbonado);
    const debtAmount = isCreditSale ? Math.max(0, total - totalAbonado) : 0;

    let mainPaymentMethod = 'Multipago';
    let mainReference = addedPayments.map(p => p.reference).filter(Boolean).join(' | ');

    if (addedPayments.length === 1) {
      mainPaymentMethod = addedPayments[0].method;
    } else if (addedPayments.length === 0) {
      mainPaymentMethod = isCreditSale ? 'Crédito' : 'Efectivo ($)';
    }

    // Process sale through parent state
    onProcessSale({
      client,
      supplier,
      items: cart,
      paymentMethod: mainPaymentMethod,
      total,
      paidAmount
    });

    const customerName = client ? client.name : supplier ? `${supplier.name} (Productor)` : 'Cliente General';

    const receipt = {
      id: `REC-${Date.now().toString().slice(-6)}`,
      date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      clientName: customerName,
      items: [...cart],
      subtotal,
      tax,
      total,
      paymentMethod: mainPaymentMethod,
      paymentReference: mainReference,
      paidAmount,
      debtAmount,
      addedPayments: [...addedPayments]
    };

    setLastReceipt(receipt);
    setCart([]);
    setSelectedClientId('');
    setSelectedSupplierId('');
    setClientSearchText('');
    setSupplierSearchText('');
    setPaymentMethod('Efectivo ($)');
    setPaymentReference('');
    setPaidAmountInput('');
    setAddedPayments([]);
    setIsCreditSale(false);
    setIsProcessing(false);
    setIsPaymentModalOpen(false);
  };

  // Calculate closing calculations
  // Helper to extract amount from sales (handling multipago)
  const getSalesTotalByMethod = (method: string) => {
    return salesHistory.reduce((sum, s) => {
      if (s.addedPayments && s.addedPayments.length > 0) {
        const amountInMethod = s.addedPayments
          .filter((p: any) => p.method === method || (method === 'Efectivo' && p.method === 'Efectivo $') || (method === 'Transferencia' && p.method === 'Pago Móvil') || (method === 'Tarjeta' && p.method === 'Tarjeta / Punto'))
          .reduce((acc: number, p: any) => acc + p.amount, 0);
        return sum + amountInMethod;
      }
      return sum + (s.paymentMethod === method || (method === 'Efectivo $' && s.paymentMethod === 'Efectivo') ? s.total : 0);
    }, 0);
  };

  const getTransactionsTotalByMethod = (method: string, category: string, isIncome: boolean) => {
    return allTransactions
      .filter(t => t.category === category && t.isIncome === isIncome && (t.paymentMethod === method || (method === 'Efectivo $' && t.paymentMethod === 'Efectivo')))
      .reduce((sum, t) => sum + t.amount, 0);
  };

  // 1. Efectivo USD ($)
  const salesCashUsd = getSalesTotalByMethod('Efectivo $');
  const incomeCashUsd = getTransactionsTotalByMethod('Efectivo $', 'credito', true);
  const totalCashUsd = salesCashUsd + incomeCashUsd;

  // 2. Efectivo Bs
  const salesCashBs = getSalesTotalByMethod('Efectivo Bs');
  const incomeCashBs = getTransactionsTotalByMethod('Efectivo Bs', 'credito', true);
  const totalCashBs = salesCashBs + incomeCashBs;

  // 3. Punto de Venta / Tarjetas
  const salesCard = getSalesTotalByMethod('Tarjeta / Punto') + getSalesTotalByMethod('Tarjeta');
  const incomeCard = getTransactionsTotalByMethod('Tarjeta / Punto', 'credito', true) + getTransactionsTotalByMethod('Tarjeta', 'credito', true);
  const totalCard = salesCard + incomeCard;

  // 4. Pago Móvil
  const salesMobile = getSalesTotalByMethod('Pago Móvil') + getSalesTotalByMethod('Transferencia');
  const incomeMobile = getTransactionsTotalByMethod('Pago Móvil', 'credito', true) + getTransactionsTotalByMethod('Transferencia', 'credito', true);
  const totalMobile = salesMobile + incomeMobile;

  // 5. Biopago
  const salesBiopago = getSalesTotalByMethod('BioPago');
  const incomeBiopago = getTransactionsTotalByMethod('BioPago', 'credito', true);
  const totalBiopago = salesBiopago + incomeBiopago;

  // 6. Ventas a Crédito (Fiado)
  const totalCreditSales = salesHistory.reduce((sum, s) => sum + (s.paymentMethod === 'Crédito' || s.debtAmount > 0 ? (s.debtAmount || s.total) : 0), 0);

  // 7. Gastos en Efectivo USD (Asumiendo que gastos son en USD principalmente para la gaveta)
  const expensesCashUsd = getTransactionsTotalByMethod('Efectivo $', 'gastos', false) + getTransactionsTotalByMethod('Efectivo', 'gastos', false);

  // Efectivo total calculado en caja (Gaveta USD) = Fondo Inicial + Ventas USD + Abonos USD - Gastos USD
  const totalCalculated = startingCash + salesCashUsd + incomeCashUsd - expensesCashUsd;
  const difference = actualCash - totalCalculated;

  const handlePerformClosing = async () => {
    try {
      const report = {
        id: `CLO-${Date.now().toString().slice(-4)}`,
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        startingCash,
        salesCashUsd,
        incomeCashUsd,
        totalCashUsd,
        salesCashBs,
        incomeCashBs,
        totalCashBs,
        totalCard,
        totalMobile,
        totalBiopago,
        totalCreditSales,
        expensesCashUsd,
        totalCalculated,
        actualCash,
        difference,
        status: difference === 0 ? 'Balance Perfecto' : difference > 0 ? 'Sobrante' : 'Faltante',
        timestamp: new Date().toISOString()
      };
      
      await addDoc(collection(db, 'cashClosings'), report);

      // Actualizar tesorería (sabanotaInitials) en Firebase
      const currentInitials = settings?.sabanotaInitials || {
        drawerUsd: 0, drawerBs: 0, bankBalanceBs: 0, bankBalanceUsd: 0, totalCapital: 0
      };

      // Sumar ingresos a bancos según los métodos (asumiendo totalCard y totalMobile van a bankBalanceBs/bankBalanceUsd según la moneda, aquí simplificamos todo Bs a bankBalanceBs)
      // Ajuste real según requerimientos:
      const updatedSabanota = {
        ...currentInitials,
        drawerUsd: currentInitials.drawerUsd + totalCashUsd - expensesCashUsd,
        drawerBs: currentInitials.drawerBs + totalCashBs,
        bankBalanceBs: currentInitials.bankBalanceBs + totalMobile + totalBiopago + totalCard,
      };
      
      // El totalCapital aumenta según las ganancias, lo sumamos crudo aquí para el patrimonio
      updatedSabanota.totalCapital = updatedSabanota.drawerUsd + (updatedSabanota.drawerBs / exchangeRate) + (updatedSabanota.bankBalanceBs / exchangeRate) + updatedSabanota.bankBalanceUsd;

      try {
        await updateDoc(doc(db, 'settings', 'general'), {
          sabanotaInitials: updatedSabanota
        });
      } catch (err) {
        console.error("Error updating tesorería", err);
      }

      setIsClosed(true);
      setClosingReport(report);
      onAddNotification('Cierre de caja registrado y Tesorería actualizada.', 'success');
    } catch (error) {
      console.error('Error al guardar cierre de caja:', error);
      onAddNotification('Error al guardar el cierre en la nube. Reintente.', 'warning');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tab Navigation */}
      <div className="flex border-b border-editorial-border gap-6">
        <button
          onClick={() => setActiveTab('pos')}
          className={`pb-3 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
            activeTab === 'pos' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          Punto de Venta
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
            activeTab === 'history' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          Historial de Ventas
        </button>
        <button
          onClick={() => setActiveTab('closing')}
          className={`pb-3 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
            activeTab === 'closing' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          Cierre de Caja Diario
        </button>
        <button
          onClick={() => setActiveTab('closing_history')}
          className={`pb-3 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
            activeTab === 'closing_history' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          Historial de Cierres
        </button>
      </div>

      {/* Early Warning System for Mobile Orders */}
      {mobileOrders.filter(o => o.status === 'Pendiente' && o.type === 'client').map(order => (
        <div key={order.id} className="bg-rose-500/10 border-l-4 border-rose-500 p-4 rounded shadow-xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-rose-500" />
            <div>
              <p className="text-sm font-bold text-rose-400">¡NUEVO PEDIDO MÓVIL ENTRANTE!</p>
              <p className="text-xs text-editorial-text-muted">El cliente {order.entityName} ha solicitado {order.items.length} producto(s) por un total de ${(order.total || 0).toLocaleString()} USD.</p>
            </div>
          </div>
          <button
            onClick={() => {
              // Load mobile order into POS cart
              const newCart: CheeseSaleItem[] = order.items.map((item) => ({
                productId: item.productId,
                name: item.name,
                pricePerKg: item.price,
                quantityKg: item.quantity,
                subtotal: item.subtotal,
                unit: item.unit
              }));
              setCart(newCart);
              setCustomerType('client');
              setSelectedClientId(order.entityId);
              const c = clients.find(cl => cl.id === order.entityId);
              setClientSearchText(c ? (c.name || '') : '');
              setActiveTab('pos');
              onAddNotification(`Pedido de ${order.entityName} cargado a caja. Listo para facturar.`, 'info');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono uppercase rounded transition-colors"
          >
            <Zap className="w-4 h-4" /> Facturar Pedido
          </button>
        </div>
      ))}

      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Left Column: Product Grid */}
          <div className="xl:col-span-7 flex flex-col h-full min-h-[500px]">
            {/* Search Input */}
            <div className="relative mb-6">
              <input
                ref={searchInputRef}
                type="text"
                autoFocus
                placeholder="Buscar producto..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedProductId(null);
                }}
                className="w-full h-12 pl-4 pr-4 bg-editorial-bg border border-editorial-border rounded text-sm text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>

            {/* Product Cards (Only show if search is not empty) */}
            {searchQuery && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {products
                  .filter(p => {
                    try {
                      return (p.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) || 
                             (p.category || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
                             (p.id || '').toLowerCase().includes((searchQuery || '').toLowerCase());
                    } catch (e) {
                      console.error('Error filtrando producto:', p, e);
                      return false;
                    }
                  })
                  .map((p) => {
                    const isSoldOut = p.stockKg <= 0;
                    const isLowStock = p.stockKg > 0 && p.stockKg <= p.alertThreshold;
                    const isSelected = selectedProductId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (!isSoldOut && !isSelected) {
                            setSelectedProductId(p.id);
                            setQtyInput('0');
                          }
                        }}
                        className={`bg-editorial-card border border-editorial-border rounded p-5 flex flex-col justify-between transition-all duration-300 relative group overflow-hidden ${
                          isSoldOut ? 'opacity-60 border-rose-500/20' : 'hover:border-amber-500/40 cursor-pointer'
                        } ${isSelected ? 'ring-2 ring-amber-500' : ''}`}
                      >
                        <div className="space-y-1">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">
                              {p.category} • {(p.origin || '').split(' ')[0]}
                            </span>
                            {isSoldOut ? (
                              <span className="text-[8px] font-mono font-extrabold bg-rose-950/20 text-rose-400 border border-rose-800/40 px-2 py-0.5 rounded uppercase">
                                Agotado
                              </span>
                            ) : isLowStock ? (
                              <span className="text-[8px] font-mono font-extrabold bg-amber-950/20 text-amber-400 border border-amber-800/40 px-2 py-0.5 rounded uppercase animate-pulse">
                                Bajo Stock
                              </span>
                            ) : null}
                          </div>
                          <h3 className="font-serif text-lg font-bold text-editorial-text-primary leading-tight pt-1">
                            {p.name}
                          </h3>
                          <p className="font-mono text-xs text-amber-500 font-bold pt-1">
                            ${p.sellingPrice.toFixed(2)} <span className="text-[10px] text-editorial-text-muted font-normal font-sans">/ {getUnitLabel(p).toLowerCase()}</span>
                          </p>
                        </div>

                        {isSelected ? (
                          <div className="mt-4 pt-3 border-t border-editorial-border/60 space-y-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                autoFocus
                                value={qtyInput}
                                onChange={(e) => setQtyInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const qty = parseFloat(qtyInput);
                                    if (qty > 0) {
                                      handleAddToCart(p, qty);
                                      setSelectedProductId(null);
                                      setSearchQuery('');
                                      searchInputRef.current?.focus();
                                    }
                                  }
                                }}
                                className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-sm text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                                placeholder="Cant."
                              />
                              <span className="text-xs text-editorial-text-muted">{getUnitLabel(p)}</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const qty = parseNum(qtyInput);
                                  if (qty > 0) {
                                    handleAddToCart(p, qty);
                                    setSelectedProductId(null);
                                    setSearchQuery('');
                                    searchInputRef.current?.focus();
                                  }
                                }}
                                className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-bold rounded cursor-pointer"
                              >
                                Sí
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductId(null);
                                }}
                                className="flex-1 py-1.5 border border-editorial-border text-editorial-text-muted text-xs font-bold rounded hover:bg-editorial-bg cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 pt-3 border-t border-editorial-border/60 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-editorial-text-muted">
                              Stock: <span className="font-sans font-bold text-editorial-text-primary">{p.stockKg.toFixed(1)} {getUnitLabel(p)}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Cart Items at the Bottom of Left Column */}
            {cart.length > 0 && (
              <div className="mt-4 border-t border-editorial-border/60 pt-4 space-y-1">
                {cart.map((item, idx) => (
                  <div key={item.productId} className="flex justify-between items-center text-xs text-editorial-text-primary py-1 border-b border-editorial-border/30 last:border-0 hover:bg-editorial-bg/30 px-2 rounded">
                    <span className="font-mono text-[10px] text-editorial-text-muted mr-3">Línea {idx + 1}</span>
                    <span className="flex-1 truncate font-semibold">{item.name}</span>
                    <div className="flex items-center gap-4 ml-4">
                      <span className="font-mono text-editorial-text-muted">{item.quantityKg} {getUnitLabel(item)} x ${item.pricePerKg.toFixed(2)}</span>
                      <span className="font-mono font-bold text-amber-500">${item.subtotal.toFixed(2)}</span>
                      <button
                        onClick={() => handleRemoveFromCart(item.productId)}
                        className="text-rose-400 hover:text-rose-500 transition-colors ml-2 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Register Checkout Terminal */}
          <div className="xl:col-span-5 space-y-6">
            <div className="bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
              <h3 className="font-serif text-xl font-bold text-editorial-text-primary tracking-tight">
                Caja Registradora
              </h3>

              <div className="space-y-4">
                {/* Tipo de Destinatario Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                    Tipo de Destinatario
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { type: 'client', label: 'Cliente' },
                      { type: 'supplier', label: 'Libreta Quesero' }
                    ].map(t => (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => {
                          setCustomerType(t.type as any);
                          setSelectedClientId('');
                          setSelectedSupplierId('');
                          setClientSearchText('');
                          setSupplierSearchText('');
                        }}
                        className={`py-1.5 text-[10px] font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                          customerType === t.type
                            ? 'bg-amber-500 border-amber-600 text-white'
                            : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional customer selects with Autocomplete */}
                {customerType === 'client' && (
                  <div className="space-y-1.5 relative">
                    <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                      Buscar Cliente de Tienda
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-editorial-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Escriba para buscar un cliente..."
                        value={clientSearchText}
                        onChange={(e) => {
                          setClientSearchText(e.target.value);
                          setIsClientDropdownOpen(true);
                          if (selectedClientId) setSelectedClientId('');
                        }}
                        onFocus={() => setIsClientDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsClientDropdownOpen(false), 200)}
                        className="w-full h-10 pl-9 pr-4 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans"
                      />
                      {isClientDropdownOpen && clientSearchText && (
                        <div className="absolute z-10 w-full mt-1 bg-editorial-card border border-editorial-border rounded shadow-lg max-h-48 overflow-y-auto">
                          {clients.filter(c => {
                              try {
                                return (c.name || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) || 
                                       (c.rfc || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) ||
                                       (c.phone || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) ||
                                       (c.id || '').toLowerCase().includes((clientSearchText || '').toLowerCase());
                              } catch (e) {
                                console.error('Error filtrando cliente:', c, e);
                                return false;
                              }
                            }
                          ).length > 0 ? (
                            clients.filter(c => {
                                try {
                                  return (c.name || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) || 
                                         (c.rfc || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) ||
                                         (c.phone || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) ||
                                         (c.id || '').toLowerCase().includes((clientSearchText || '').toLowerCase());
                                } catch (e) {
                                  return false;
                                }
                              }
                            ).map(c => (
                              <div
                                key={c.id}
                                onMouseDown={() => {
                                  setSelectedClientId(c.id);
                                  setClientSearchText(c.name || '');
                                  setIsClientDropdownOpen(false);
                                }}
                                className="px-4 py-2 hover:bg-amber-500 hover:text-white cursor-pointer text-xs transition-colors border-b border-editorial-border/30 last:border-0"
                              >
                                {c.name} 
                                { (c.outstandingDebt || 0) > 0 && (
                                  <span className="opacity-75 text-[10px] ml-2">- {c.rfc || 'S/N'} (Adeudo: ${(c.outstandingDebt || 0).toFixed(0)} USD)</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-2 text-xs text-editorial-text-muted text-center">No se encontraron coincidencias</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {customerType === 'supplier' && (
                  <div className="space-y-1.5 relative">
                    <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                      Buscar Productor / Proveedor
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-editorial-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Escriba para buscar un productor..."
                        value={supplierSearchText}
                        onChange={(e) => {
                          setSupplierSearchText(e.target.value);
                          setIsSupplierDropdownOpen(true);
                          if (selectedSupplierId) setSelectedSupplierId('');
                        }}
                        onFocus={() => setIsSupplierDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsSupplierDropdownOpen(false), 200)}
                        className="w-full h-10 pl-9 pr-4 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans"
                      />
                      {isSupplierDropdownOpen && supplierSearchText && (
                        <div className="absolute z-10 w-full mt-1 bg-editorial-card border border-editorial-border rounded shadow-lg max-h-48 overflow-y-auto">
                          {suppliers.filter(s => {
                              try {
                                return (s.name || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) || 
                                       (s.rfc || s.idNumber || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) ||
                                       (s.phone || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) ||
                                       (s.id || '').toLowerCase().includes((supplierSearchText || '').toLowerCase());
                              } catch (e) {
                                console.error('Error filtrando proveedor:', s, e);
                                return false;
                              }
                            }
                          ).length > 0 ? (
                            suppliers.filter(s => {
                                try {
                                  return (s.name || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) || 
                                         (s.rfc || s.idNumber || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) ||
                                         (s.phone || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) ||
                                         (s.id || '').toLowerCase().includes((supplierSearchText || '').toLowerCase());
                                } catch (e) {
                                  return false;
                                }
                              }
                            ).map(s => (
                              <div
                                key={s.id}
                                onMouseDown={() => {
                                  setSelectedSupplierId(s.id);
                                  setSupplierSearchText(s.name || '');
                                  setIsSupplierDropdownOpen(false);
                                }}
                                className="px-4 py-2 hover:bg-amber-500 hover:text-white cursor-pointer text-xs transition-colors border-b border-editorial-border/30 last:border-0"
                              >
                                {s.name} 
                                { (s.balanceOwed || 0) > 0 && (
                                  <span className="opacity-75 text-[10px] ml-2">- {s.rfc || s.idNumber || 'S/N'} (Deuda: ${(s.balanceOwed || 0).toFixed(0)})</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-2 text-xs text-editorial-text-muted text-center">No se encontraron coincidencias</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="h-px bg-editorial-border/60 my-4" />

                {/* Calculations summary */}
                <div key={Date.now() + Math.random()} className="space-y-1.5 font-mono text-[11px] text-editorial-text-muted">
                  <div className="flex justify-between">
                    <span>Total parcial:</span>
                    <span className="text-editorial-text-primary">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA ({settings?.taxRate ?? 5}%):</span>
                    <span className="text-editorial-text-primary">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-serif text-lg font-bold text-editorial-text-primary pt-1.5 border-t border-editorial-border/40">
                    <span className="font-sans text-xs text-editorial-text-muted uppercase font-normal tracking-wider">TOTAL A COBRAR:</span>
                    <span className="text-amber-500">${total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(true)}
                  disabled={cart.length === 0}
                  className="w-full h-12 bg-amber-500 text-white font-serif font-bold text-md tracking-tight flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Pasar a modo cobro (F4)</span>
                </button>
              </div>
            </div>

            {/* Payment Modal Overlay */}
            {isPaymentModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-editorial-card border border-editorial-border rounded p-6 w-full max-w-4xl shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                  <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="absolute top-4 right-4 text-editorial-text-muted hover:text-amber-500 transition-colors cursor-pointer">
                    <span className="text-3xl leading-none">&times;</span>
                  </button>
                  
                  <div className="mb-6 border-b border-editorial-border/60 pb-4">
                    <h3 className="font-serif text-xl font-bold text-amber-500 tracking-tight uppercase">
                      PROCESAR COBRO (MULTIPAGO)
                    </h3>
                    <p className="text-xs text-editorial-text-muted mt-1 font-mono">Registra los abonos mixtos y finaliza la venta</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                     {/* Left Panel: Breakdowns & Summary */}
                     <div className="md:col-span-5 flex flex-col gap-4">
                       <div className="bg-editorial-bg border border-editorial-border rounded p-4 space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-mono uppercase tracking-widest text-editorial-text-muted">TOTAL VENTA</span>
                            <div className="text-right">
                              <div className="font-mono text-xl font-bold text-editorial-text-primary">${total.toFixed(2)}</div>
                              <div className="font-mono text-[10px] text-editorial-text-muted">Bs {(total * exchangeRate).toFixed(2)}</div>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-mono uppercase tracking-widest text-editorial-text-muted">ABONADO</span>
                            <div className="text-right">
                              <div className="font-mono text-lg font-bold text-emerald-400">${totalAbonado.toFixed(2)}</div>
                              <div className="font-mono text-[10px] text-emerald-400/70">Bs {(totalAbonado * exchangeRate).toFixed(2)}</div>
                            </div>
                          </div>
                          
                          <div className="h-px bg-editorial-border/60 my-2" />
                          
                          {totalAbonado >= total ? (
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-mono uppercase tracking-widest text-amber-500">VUELTO / CAMBIO</span>
                              <div className="text-right">
                                <div className="font-mono text-2xl font-bold text-amber-500">${(totalAbonado - total).toFixed(2)}</div>
                                <div className="font-mono text-[10px] text-amber-500/70">Bs {((totalAbonado - total) * exchangeRate).toFixed(2)}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-mono uppercase tracking-widest text-rose-400">RESTANTE</span>
                              <div className="text-right">
                                <div className="font-mono text-2xl font-bold text-rose-400">${(total - totalAbonado).toFixed(2)}</div>
                                <div className="font-mono text-[10px] text-rose-400/70">Bs {((total - totalAbonado) * exchangeRate).toFixed(2)}</div>
                              </div>
                            </div>
                          )}
                       </div>

                       {/* List of Added Payments */}
                       <div className="flex-1 bg-editorial-bg border border-editorial-border rounded p-4 flex flex-col">
                         <span className="font-mono text-[10px] uppercase tracking-widest text-editorial-text-muted mb-3 block">Abonos Registrados</span>
                         <div className="flex-1 overflow-y-auto space-y-2 max-h-40 pr-2">
                           {addedPayments.length === 0 ? (
                             <div className="text-[10px] text-editorial-text-muted text-center py-4 font-mono">Aún no se han añadido pagos.</div>
                           ) : (
                             addedPayments.map(p => (
                               <div key={p.id} className="flex justify-between items-center bg-editorial-card border border-editorial-border p-2 rounded text-xs animate-in fade-in slide-in-from-left-2 duration-200">
                                 <div className="flex flex-col">
                                   <span className="font-bold text-editorial-text-primary uppercase text-[10px]">{p.method}</span>
                                   {p.reference && <span className="text-[9px] text-editorial-text-muted font-mono tracking-wider">REF: {p.reference}</span>}
                                 </div>
                                 <div className="flex items-center gap-3">
                                   <div className="text-right">
                                     <div className="font-mono font-bold text-amber-500">{p.currency} {(p.originalAmount || p.amount).toFixed(2)}</div>
                                     {p.currency !== '$' && <div className="font-mono text-[9px] text-editorial-text-muted">~${p.amount.toFixed(2)}</div>}
                                   </div>
                                   <button type="button" onClick={() => handleRemovePayment(p.id)} className="text-rose-400 hover:text-rose-500 cursor-pointer text-xs leading-none" title="Eliminar pago">&times;</button>
                                 </div>
                               </div>
                             ))
                           )}
                         </div>
                       </div>
                     </div>

                     {/* Right Panel: Add Payment Interface */}
                     <div className="md:col-span-7 flex flex-col gap-4">
                       <div className="bg-editorial-bg border border-editorial-border rounded p-4">
                          <label className="font-mono text-[10px] uppercase tracking-widest text-editorial-text-muted block mb-3">Agregar Nuevo Abono</label>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                            {['Efectivo $', 'Efectivo Bs', 'Tarjeta / Punto', 'Pago Móvil', 'BioPago'].map(m => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  setPaymentMethod(m);
                                  setPaymentReference('');
                                  setPaidAmountInput('');
                                }}
                                className={`py-2 px-1 text-[9px] font-mono font-bold uppercase rounded border transition-all cursor-pointer text-center ${
                                  paymentMethod === m
                                    ? 'bg-amber-500 border-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                                    : 'bg-editorial-card border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary'
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="space-y-2">
                              <label className="font-mono text-[10px] uppercase tracking-widest text-editorial-text-muted block">
                                MONTO A ABONAR ({paymentMethod === 'Efectivo $' ? '$' : 'Bs'})
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={paidAmountInput}
                                onChange={(e) => setPaidAmountInput(e.target.value)}
                                placeholder={`Ej: ${paymentMethod === 'Efectivo $' ? Math.max(0, total - totalAbonado).toFixed(2) : (Math.max(0, total - totalAbonado) * exchangeRate).toFixed(2)}`}
                                className="w-full h-10 px-3 bg-editorial-card border border-amber-500/50 rounded text-lg text-amber-500 font-mono font-bold focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            
                            {/* Reference Inputs */}
                            {(paymentMethod === 'Pago Móvil' || paymentMethod === 'BioPago' || paymentMethod === 'Tarjeta / Punto') && (
                              <div className="space-y-2 animate-in fade-in duration-200">
                                <label className="font-mono text-[10px] uppercase tracking-widest text-amber-500 block">
                                  {paymentMethod === 'Tarjeta / Punto' ? 'APROBACIÓN PUNTO' : 'REFERENCIA'}
                                </label>
                                <input
                                  type="text"
                                  value={paymentReference}
                                  onChange={(e) => setPaymentReference(e.target.value)}
                                  placeholder="N° Ref..."
                                  className="w-full h-10 px-3 bg-editorial-card border border-editorial-border rounded text-sm text-editorial-text-primary focus:outline-none focus:border-amber-500 font-mono"
                                />
                              </div>
                            )}
                          </div>
                          
                          <button
                            type="button"
                            onClick={handleAddPayment}
                            className="w-full h-10 border border-amber-500 text-amber-500 font-mono text-[11px] font-bold tracking-widest uppercase hover:bg-amber-500 hover:text-black transition-colors cursor-pointer rounded"
                          >
                            + AGREGAR ABONO A LA CUENTA
                          </button>
                       </div>

                       {/* Credit Toggle */}
                       {(customerType === 'client' || customerType === 'supplier') && (
                         <div className="mt-auto">
                            <button
                              type="button"
                              onClick={() => setIsCreditSale(!isCreditSale)}
                              className={`w-full py-3 px-4 flex items-center justify-between rounded border transition-all cursor-pointer ${
                                isCreditSale
                                  ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                                  : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary hover:border-editorial-border/80'
                              }`}
                            >
                              <span className="font-mono text-[11px] font-bold uppercase tracking-wider">
                                {customerType === 'client' ? 'VENTA A CRÉDITO / FIADO' : 'LIBRETA QUESERO'}
                              </span>
                              <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                                isCreditSale ? 'border-amber-500 bg-amber-500' : 'border-editorial-text-muted'
                              }`}>
                                {isCreditSale && <div className="w-2 h-2 bg-black rounded-sm" />}
                              </div>
                            </button>
                            {isCreditSale && (
                               <p className="text-[9px] text-editorial-text-muted mt-2 font-mono">
                                 Nota: El monto restante de ${(total - totalAbonado).toFixed(2)} (Bs {((total - totalAbonado) * exchangeRate).toFixed(2)}) se enviará a cuenta por cobrar automáticamente.
                               </p>
                            )}
                         </div>
                       )}
                     </div>
                  </div>

                  {/* Action Buttons Footer */}
                  <form onSubmit={handleProcessSaleSubmit} className="pt-6 mt-6 border-t border-editorial-border/60 flex items-center justify-end gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaymentModalOpen(false);
                        setCart([]);
                        setSelectedClientId('');
                        setSelectedSupplierId('');
                        setClientSearchText('');
                        setSupplierSearchText('');
                        setAddedPayments([]);
                        setIsCreditSale(false);
                        onAddNotification('Factura congelada y carrito limpiado exitosamente.', 'info');
                      }}
                      className="h-12 px-6 bg-editorial-bg border border-editorial-border text-editorial-text-primary font-serif font-bold text-[11px] tracking-widest uppercase hover:bg-editorial-card transition-all cursor-pointer rounded"
                    >
                      Congelar Factura
                    </button>
                    
                    <button
                      type="submit"
                      disabled={isProcessing || (!isCreditSale && totalAbonado < total)}
                      className="h-12 px-8 bg-amber-500 text-black font-serif font-bold text-[13px] tracking-widest uppercase flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{isProcessing ? 'PROCESANDO...' : 'FACTURAR / CONFIRMAR VENTA (F4)'}</span>
                    </button>
                  </form>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-editorial-card border border-editorial-border rounded p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary tracking-tight">
              Historial Crítico de Ventas
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono bg-editorial-bg border border-editorial-border px-3 py-1 rounded">
                VENTAS HOY: {dailySalesCount}
              </span>
              <span className="text-[10px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/30 px-3 py-1 rounded font-bold">
                INGRESOS HOY: ${dailyRevenue.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Referencia</th>
                  <th className="py-3 px-4">Fecha y Hora</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Artículos</th>
                  <th className="py-3 px-4">Método</th>
                  <th className="py-3 px-4 text-right">Monto Total</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-editorial-border/60 font-sans">
                {salesHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-editorial-text-muted">
                      No se han procesado ventas en esta sesión.
                    </td>
                  </tr>
                ) : (
                  salesHistory.map((s) => (
                    <tr key={s.id} className="hover:bg-editorial-bg/40 transition-all">
                      <td className="py-3.5 px-4 font-mono font-bold text-editorial-text-primary">{s.invoiceNumber || s.id}</td>
                      <td className="py-3.5 px-4 text-editorial-text-muted">{s.date}</td>
                      <td className="py-3.5 px-4 font-medium">{s.clientName || s.entity || 'Cliente General'}</td>
                      <td className="py-3.5 px-4 text-editorial-text-muted max-w-[200px] truncate">
                        {s.items ? s.items.map((it: any) => `${it.name} (${it.quantityKg || it.quantity || 1}kg)`).join(', ') : (s.notes || 'Varios Artículos')}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-editorial-border bg-editorial-bg">
                          {s.paymentMethod || 'Efectivo'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-500">${(s.total || s.amount || 0).toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setLastReceipt(s)}
                          className="px-2.5 py-1 text-[9px] font-mono border border-editorial-border hover:border-amber-500 hover:text-amber-500 rounded bg-editorial-card transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3" />
                          Ver Ticket
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'closing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form and parameters */}
          <div className="lg:col-span-7 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary tracking-tight">
              Arqueo &amp; Cuadre de Caja
            </h3>

            {isClosed ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="font-serif text-xl font-bold text-editorial-text-primary">Caja Cerrada Exitosamente</h4>
                <p className="text-xs text-editorial-text-muted max-w-sm mx-auto">
                  La caja ha sido cerrada para este turno. El informe contable fue transmitido a auditoría.
                </p>
                <button
                  onClick={() => {
                    setIsClosed(false);
                    setClosingReport(null);
                  }}
                  className="mt-4 px-4 py-2 border border-editorial-border text-[10px] font-mono font-bold uppercase tracking-wider text-editorial-text-primary hover:bg-editorial-bg cursor-pointer"
                >
                  Abrir Nueva Caja
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                      Fondo Fijo Inicial (Apertura)
                    </label>
                    <input
                      type="number"
                      value={startingCash}
                      onChange={(e) => setStartingCash(parseFloat(e.target.value) || 0)}
                      className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                      Efectivo Real Contado en Caja
                    </label>
                    <input
                      type="number"
                      value={actualCash}
                      onChange={(e) => setActualCash(parseFloat(e.target.value) || 0)}
                      className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="h-px bg-editorial-border/60 my-4" />

                {/* Audit matching calculations */}
                <div className="bg-editorial-bg border border-editorial-border rounded p-4 font-mono text-xs space-y-2.5">
                  <div className="flex justify-between text-editorial-text-muted">
                    <span>Fondo Inicial de Caja USD:</span>
                    <span className="text-editorial-text-primary">${startingCash.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-editorial-text-muted">
                    <span>(+) Ventas Efectivo USD:</span>
                    <span className="text-emerald-400">+${salesCashUsd.toFixed(2)}</span>
                  </div>
                  {incomeCashUsd > 0 && (
                    <div className="flex justify-between text-editorial-text-muted">
                      <span>(+) Abonos Efectivo USD:</span>
                      <span className="text-emerald-400">+${incomeCashUsd.toFixed(2)}</span>
                    </div>
                  )}
                  {expensesCashUsd > 0 && (
                    <div className="flex justify-between text-editorial-text-muted">
                      <span>(-) Gastos Efectivo USD:</span>
                      <span className="text-rose-400">-${expensesCashUsd.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-editorial-border/40 pt-2 text-editorial-text-primary">
                    <span>(=) Esperado en Gaveta USD:</span>
                    <span>${totalCalculated.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-editorial-text-muted mt-2">
                    <span>(-) Efectivo Físico Real USD:</span>
                    <span className="text-editorial-text-primary">${actualCash.toFixed(2)}</span>
                  </div>

                  <div className={`flex justify-between font-bold text-sm border-t border-dashed border-editorial-border/60 pt-2.5 ${
                    difference === 0 ? 'text-emerald-400' : difference > 0 ? 'text-blue-400' : 'text-rose-400'
                  }`}>
                    <span>Diferencia (Cuadre):</span>
                    <span>
                      {difference === 0 ? 'Cuadre Perfecto ($0.00)' : `${difference > 0 ? 'Sobrante' : 'Faltante'} de $${Math.abs(difference).toFixed(2)}`}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handlePerformClosing}
                  className="w-full h-12 bg-amber-500 hover:brightness-110 text-white font-serif font-bold text-md tracking-tight transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Realizar Cierre de Caja Diario
                </button>
              </div>
            )}
          </div>

          {/* Report output column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-editorial-card border border-editorial-border rounded p-6 space-y-4">
              <h4 className="font-serif text-lg font-bold text-editorial-text-primary tracking-tight">Tarjetas de Resumen</h4>
              <div className="font-mono text-xs grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-[10px] uppercase text-editorial-text-muted">💳 Punto de Venta</span>
                  <span className="font-bold text-editorial-text-primary text-lg">${totalCard.toFixed(2)}</span>
                </div>
                <div className="flex flex-col p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-[10px] uppercase text-editorial-text-muted">📲 Pago Móvil</span>
                  <span className="font-bold text-editorial-text-primary text-lg">${totalMobile.toFixed(2)}</span>
                </div>
                <div className="flex flex-col p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-[10px] uppercase text-editorial-text-muted">🧬 Biopago</span>
                  <span className="font-bold text-editorial-text-primary text-lg">${totalBiopago.toFixed(2)}</span>
                </div>
                <div className="flex flex-col p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-[10px] uppercase text-editorial-text-muted">💵 Efectivo Bs</span>
                  <span className="font-bold text-editorial-text-primary text-lg">${totalCashBs.toFixed(2)}</span>
                </div>
                <div className="col-span-1 md:col-span-2 flex flex-col p-3 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded">
                  <span className="text-[10px] uppercase">📋 Total Fiado Hoy</span>
                  <span className="font-bold text-lg">${totalCreditSales.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {closingReport && (
              <div className="bg-editorial-card border border-editorial-border rounded p-6 font-mono text-xs text-editorial-text-primary space-y-4 relative">
                <div className="text-center space-y-1">
                  <h4 className="font-serif text-md font-extrabold uppercase tracking-tight">REGISTRO DE CIERRE</h4>
                  <p className="text-[10px] text-editorial-text-muted">{closingReport.date} • {closingReport.id}</p>
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Fondo Apertura USD:</span>
                    <span>${closingReport.startingCash.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Total Ingresos USD:</span>
                    <span>${closingReport.totalCashUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Gastos USD:</span>
                    <span className="text-rose-400">-${closingReport.expensesCashUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-editorial-text-primary pt-1 border-t border-editorial-border/30">
                    <span>Total Teórico Gaveta USD:</span>
                    <span>${closingReport.totalCalculated.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Contado Real:</span>
                    <span>${closingReport.actualCash.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="flex justify-between font-bold text-xs pt-1">
                  <span className="text-editorial-text-muted">Resultado:</span>
                  <span className={closingReport.difference === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {closingReport.status} ({closingReport.difference >= 0 ? '+' : '-'}${Math.abs(closingReport.difference).toFixed(2)})
                  </span>
                </div>
              </div>
            )}

            {/* Tarjeta del Último Cierre (Si hay alguno en el historial) */}
            {closingsHistory.length > 0 && activeTab === 'closing' && (
              <div className="bg-editorial-bg border border-editorial-border rounded p-6 font-mono text-xs mt-4">
                <h4 className="font-serif text-sm font-bold text-editorial-text-primary uppercase mb-3 flex items-center gap-2"><Archive className="w-4 h-4 text-amber-500" /> Último Cierre Registrado</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Fecha y Hora:</span>
                    <span className="text-editorial-text-primary font-bold">{new Date(closingsHistory[0].timestamp).toLocaleString('es-ES')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Reporte:</span>
                    <span className="text-editorial-text-primary">{closingsHistory[0].id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Recaudado USD:</span>
                    <span className="text-emerald-400 font-bold">${(closingsHistory[0].totalCashUsd || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-editorial-border/30 pt-1.5 mt-1.5">
                    <span className="text-editorial-text-muted">Estado del Cuadre:</span>
                    <span className={`font-bold ${closingsHistory[0].difference === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {closingsHistory[0].status}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'closing_history' && (
        <div className="bg-editorial-card border border-editorial-border rounded p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary tracking-tight">
              Historial de Cierres de Caja
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Fecha / Hora</th>
                  <th className="py-3 px-4">Reporte ID</th>
                  <th className="py-3 px-4">Recaudado USD</th>
                  <th className="py-3 px-4">Efectivo Real</th>
                  <th className="py-3 px-4">Cuadre</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-editorial-border/60 font-sans">
                {closingsHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-editorial-text-muted">
                      No hay cierres de caja registrados en el sistema.
                    </td>
                  </tr>
                ) : (
                  closingsHistory.map((c) => (
                    <tr key={c.docId} className="hover:bg-editorial-bg/40 transition-all">
                      <td className="py-3.5 px-4 font-mono">{new Date(c.timestamp).toLocaleString('es-ES')}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-editorial-text-primary">{c.id}</td>
                      <td className="py-3.5 px-4 text-emerald-400 font-bold font-mono">${(c.totalCashUsd || 0).toFixed(2)}</td>
                      <td className="py-3.5 px-4 font-mono">${(c.actualCash || 0).toFixed(2)}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          c.difference === 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setSelectedAuditClosing(c)}
                          className="px-3 py-1.5 text-[10px] font-mono border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black rounded transition-all cursor-pointer inline-flex items-center gap-1.5 font-bold uppercase tracking-wider"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Auditar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ticket Preview Modal */}
      {lastReceipt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-editorial-bg border border-editorial-border rounded w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-slide-up print-ticket">
            
            {/* Modal Header (No print) */}
            <div className="flex items-center justify-between p-4 bg-editorial-card border-b border-editorial-border/60 no-print">
              <h3 className="font-serif font-bold text-editorial-text-primary text-lg">Ticket de Venta</h3>
              <button 
                onClick={() => setLastReceipt(null)}
                className="text-editorial-text-muted hover:text-rose-400 transition-colors p-1"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            {/* Ticket Printable Content */}
            <div className="p-6 bg-white text-black font-mono text-xs space-y-4 relative overflow-y-auto max-h-[60vh]" id="ticket-printable-area">
              <div className="text-center space-y-1 pb-4 border-b border-dashed border-gray-400">
                <h2 className="font-bold text-lg uppercase tracking-tight">Kalu Comercializadora</h2>
                <p className="text-[10px]">C.A. / RIF: J-00000000-0</p>
                <p className="text-[10px] mt-2 font-bold uppercase">{lastReceipt.invoiceNumber || lastReceipt.id}</p>
                <p className="text-[10px]">{lastReceipt.date}</p>
              </div>

              <div className="space-y-1">
                <p><span className="font-bold">Cliente:</span> {lastReceipt.clientName || lastReceipt.entity || 'Cliente Público'}</p>
                <p><span className="font-bold">Método:</span> {lastReceipt.paymentMethod || 'Efectivo'}</p>
              </div>

              <div className="border-t border-dashed border-gray-400 my-2" />
              
              <table className="w-full text-left text-[10px]">
                <thead>
                  <tr className="border-b border-dashed border-gray-400">
                    <th className="py-1">CANT</th>
                    <th className="py-1">PRODUCTO</th>
                    <th className="py-1 text-right">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-gray-200">
                  {lastReceipt.items && lastReceipt.items.length > 0 ? (
                    lastReceipt.items.map((it: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-1.5 align-top">{it.quantityKg || it.quantity || 1}</td>
                        <td className="py-1.5 align-top pr-2">{it.name} <br/><span className="text-[9px] text-gray-500">${parseNum(it.pricePerKg).toFixed(2)}/{it.unit ? getUnitLabel(it).toLowerCase() : 'kg'}</span></td>
                        <td className="py-1.5 align-top text-right">${parseNum(it.subtotal).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-2 text-center text-gray-500 italic">{lastReceipt.notes || 'Varios Artículos'}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="border-t border-dashed border-gray-400 my-2" />

              <div className="space-y-1 text-right">
                {(() => {
                  const activeTaxRate = settings?.taxRate !== undefined ? settings.taxRate : 5;
                  const divisor = 1 + (activeTaxRate / 100);
                  const receiptTotal = parseNum(lastReceipt.amount || lastReceipt.total);
                  const receiptSubtotal = lastReceipt.subtotal !== undefined ? parseNum(lastReceipt.subtotal) : receiptTotal / divisor;
                  const receiptTax = lastReceipt.tax !== undefined ? parseNum(lastReceipt.tax) : receiptTotal - receiptSubtotal;
                  
                  return (
                    <>
                      <p className="text-[11px]">Subtotal: ${receiptSubtotal.toFixed(2)}</p>
                      <p className="text-[11px]">IVA ({activeTaxRate}%): ${receiptTax.toFixed(2)}</p>
                      <p className="text-lg font-bold mt-1 uppercase">Total: ${receiptTotal.toFixed(2)}</p>
                      <p className="text-xs font-bold text-gray-600">Bs. {(receiptTotal * exchangeRate).toFixed(2)}</p>
                    </>
                  );
                })()}
              </div>

              <div className="text-center pt-6 text-[9px] text-gray-500 uppercase">
                <p>¡Gracias por su compra!</p>
                <p>kalu.com.ve</p>
              </div>
            </div>

            {/* Modal Footer actions (No print) */}
            <div className="p-4 bg-editorial-card border-t border-editorial-border/60 flex gap-3 no-print">
              <button
                onClick={() => setLastReceipt(null)}
                className="flex-1 px-4 py-2 border border-editorial-border text-editorial-text-primary text-xs font-bold uppercase tracking-wider rounded hover:bg-editorial-bg transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 px-4 py-2 bg-amber-500 hover:brightness-110 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Modal */}
      {selectedAuditClosing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-editorial-card border border-editorial-border rounded w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between p-4 bg-editorial-bg border-b border-editorial-border">
              <h3 className="font-serif font-bold text-amber-500 text-lg flex items-center gap-2">
                <Archive className="w-5 h-5" />
                Auditoría de Cierre: {selectedAuditClosing.id}
              </h3>
              <button 
                onClick={() => setSelectedAuditClosing(null)}
                className="text-editorial-text-muted hover:text-rose-400 transition-colors p-1"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
              
              <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                <div className="bg-editorial-bg p-3 border border-editorial-border rounded">
                  <div className="text-[10px] text-editorial-text-muted uppercase">Fecha del Cierre</div>
                  <div className="font-bold text-editorial-text-primary mt-1">{new Date(selectedAuditClosing.timestamp).toLocaleString('es-ES')}</div>
                </div>
                <div className="bg-editorial-bg p-3 border border-editorial-border rounded">
                  <div className="text-[10px] text-editorial-text-muted uppercase">Estado del Cuadre</div>
                  <div className={`font-bold mt-1 ${selectedAuditClosing.difference === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedAuditClosing.status} ({selectedAuditClosing.difference > 0 ? '+' : ''}{selectedAuditClosing.difference < 0 ? '-' : ''}${Math.abs(selectedAuditClosing.difference).toFixed(2)})
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-serif text-md font-bold text-editorial-text-primary border-b border-editorial-border pb-2 mb-3">Balance de Gaveta (Efectivo USD)</h4>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-editorial-text-muted">Fondo Inicial:</span> <span>${(selectedAuditClosing.startingCash || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-editorial-text-muted">Ingresos Ventas USD:</span> <span className="text-emerald-400">+${(selectedAuditClosing.salesCashUsd || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-editorial-text-muted">Ingresos Abonos USD:</span> <span className="text-emerald-400">+${(selectedAuditClosing.incomeCashUsd || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-editorial-text-muted">Egresos / Gastos USD:</span> <span className="text-rose-400">-${(selectedAuditClosing.expensesCashUsd || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between pt-2 border-t border-editorial-border/30 font-bold"><span className="text-editorial-text-primary">Efectivo Esperado:</span> <span>${(selectedAuditClosing.totalCalculated || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold"><span className="text-editorial-text-primary">Efectivo Físico Contado:</span> <span>${(selectedAuditClosing.actualCash || 0).toFixed(2)}</span></div>
                </div>
              </div>

              <div>
                <h4 className="font-serif text-md font-bold text-editorial-text-primary border-b border-editorial-border pb-2 mb-3">Ingresos por Otros Medios</h4>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="bg-editorial-bg p-2 rounded flex justify-between">
                    <span className="text-editorial-text-muted">Punto / Tarjeta:</span>
                    <span className="font-bold">${(selectedAuditClosing.totalCard || 0).toFixed(2)}</span>
                  </div>
                  <div className="bg-editorial-bg p-2 rounded flex justify-between">
                    <span className="text-editorial-text-muted">Pago Móvil:</span>
                    <span className="font-bold">${(selectedAuditClosing.totalMobile || 0).toFixed(2)}</span>
                  </div>
                  <div className="bg-editorial-bg p-2 rounded flex justify-between">
                    <span className="text-editorial-text-muted">Biopago:</span>
                    <span className="font-bold">${(selectedAuditClosing.totalBiopago || 0).toFixed(2)}</span>
                  </div>
                  <div className="bg-editorial-bg p-2 rounded flex justify-between">
                    <span className="text-editorial-text-muted">Efectivo Bs:</span>
                    <span className="font-bold">${(selectedAuditClosing.totalCashBs || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

            </div>
            <div className="p-4 bg-editorial-bg border-t border-editorial-border flex justify-end">
              <button
                onClick={() => setSelectedAuditClosing(null)}
                className="px-6 py-2 border border-editorial-border text-editorial-text-primary text-xs font-bold uppercase tracking-wider rounded hover:bg-editorial-card transition-colors"
              >
                Cerrar Auditoría
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
