import React, { useState, useRef } from 'react';
import { CheeseProduct, ClientProfile, SupplierProfile, CheeseSaleItem, MobileOrder, Transaction } from '../types';
import { ShoppingCart, Calendar, Printer, FileText, CheckCircle, RefreshCw, AlertCircle, Trash2, Plus, Minus, User, Smartphone, Zap } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'pos' | 'history' | 'closing'>('pos');
  // POS Register States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState<string>('0');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CheeseSaleItem[]>([]);
  const [customerType, setCustomerType] = useState<'general' | 'client' | 'supplier'>('general');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);

  // Cierre de caja States
  const [startingCash, setStartingCash] = useState<number>(1500);
  const [actualCash, setActualCash] = useState<number>(1500);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [closingReport, setClosingReport] = useState<any | null>(null);

  // Calculate Cart Totals
  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const tax = subtotal * 0.16; // 16% IVA
  const total = subtotal + tax;

  const handleAddToCart = (product: CheeseProduct, qty: number = 1.0) => {
    if (product.stockKg <= 0) {
      onAddNotification(`El producto ${product.name} está agotado temporalmente.`, 'warning');
      return;
    }

    const availableStock = product.stockKg;
    const existing = cart.find(item => item.productId === product.id);
    const currentQty = existing ? existing.quantityKg : 0;
    const newQty = parseFloat((currentQty + qty).toFixed(2));

    if (newQty > availableStock) {
      onAddNotification(`Stock insuficiente. Solo quedan ${availableStock} kg de ${product.name}.`, 'warning');
      return;
    }

    if (existing) {
      setCart(prev => prev.map(item => 
        item.productId === product.id 
          ? { ...item, quantityKg: newQty, subtotal: parseFloat((newQty * product.sellingPrice).toFixed(2)) }
          : item
      ));
    } else {
      setCart(prev => [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          quantityKg: qty,
          pricePerKg: product.sellingPrice,
          subtotal: parseFloat((qty * product.sellingPrice).toFixed(2))
        }
      ]);
    }
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existing = cart.find(item => item.productId === productId);
    if (!existing) return;

    const newQty = parseFloat((existing.quantityKg + delta).toFixed(2));
    if (newQty <= 0) {
      setCart(prev => prev.filter(item => item.productId !== productId));
      return;
    }

    if (newQty > product.stockKg) {
      onAddNotification(`Stock insuficiente de ${product.name}.`, 'warning');
      return;
    }

    setCart(prev => prev.map(item =>
      item.productId === productId
        ? { ...item, quantityKg: newQty, subtotal: parseFloat((newQty * item.pricePerKg).toFixed(2)) }
        : item
    ));
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const handleProcessSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      onAddNotification('El carrito de compras está vacío.', 'warning');
      return;
    }

    const client = customerType === 'client' ? (clients.find(c => c.id === selectedClientId) || null) : null;
    const supplier = customerType === 'supplier' ? (suppliers.find(s => s.id === selectedSupplierId) || null) : null;

    if (customerType === 'client' && !selectedClientId) {
      onAddNotification('Por favor, seleccione un cliente para registrar la venta.', 'warning');
      return;
    }

    if (customerType === 'supplier' && !selectedSupplierId) {
      onAddNotification('Por favor, seleccione un productor para registrar la venta en su libreta.', 'warning');
      return;
    }

    const isCreditPayment = paymentMethod === 'credit' || paymentMethod === 'Libreta de Queso';
    const parsedPaidInput = parseFloat(paidAmountInput);
    const paidAmount = isCreditPayment
      ? (isNaN(parsedPaidInput) ? 0 : parsedPaidInput)
      : total;

    const debtAmount = isCreditPayment ? Math.max(0, total - paidAmount) : 0;

    // Process sale through parent state
    onProcessSale({
      client,
      supplier,
      items: cart,
      paymentMethod: paymentMethod === 'credit' ? 'credit' : paymentMethod,
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
      paymentMethod: paymentMethod === 'credit' ? 'Crédito Cuenta' : paymentMethod,
      paidAmount,
      debtAmount
    };

    setLastReceipt(receipt);
    setCart([]);
    setSelectedClientId('');
    setSelectedSupplierId('');
    setPaymentMethod('Efectivo');
    setPaidAmountInput('');
  };

  // Calculate closing calculations
  // Ventas puras (Categoría 'ventas')
  const cashSales = salesHistory.filter(s => s.paymentMethod === 'Efectivo').reduce((sum, s) => sum + s.total, 0);
  const cardSales = salesHistory.filter(s => s.paymentMethod === 'Tarjeta').reduce((sum, s) => sum + s.total, 0);
  const transferSales = salesHistory.filter(s => s.paymentMethod === 'Transferencia').reduce((sum, s) => sum + s.total, 0);

  // Cobros de deudas a clientes (Categoría 'credito' y es ingreso)
  const todayCreditIncome = allTransactions.filter(t => t.category === 'credito' && t.isIncome);
  const creditIncomeCash = todayCreditIncome.filter(t => t.paymentMethod === 'Efectivo').reduce((sum, t) => sum + t.amount, 0);
  const creditIncomeCard = todayCreditIncome.filter(t => t.paymentMethod === 'Tarjeta').reduce((sum, t) => sum + t.amount, 0);
  const creditIncomeTransfer = todayCreditIncome.filter(t => t.paymentMethod === 'Transferencia').reduce((sum, t) => sum + t.amount, 0);

  // Gastos (Categoría 'gastos' y no es ingreso)
  const todayExpenses = allTransactions.filter(t => t.category === 'gastos' && !t.isIncome);
  const expensesCash = todayExpenses.filter(t => t.paymentMethod === 'Efectivo' || !t.paymentMethod).reduce((sum, t) => sum + t.amount, 0);

  // Efectivo total calculado en caja = Fondo Inicial + Ventas Efectivo + Abonos Efectivo - Gastos Efectivo
  const totalCalculated = startingCash + cashSales + creditIncomeCash - expensesCash;
  const difference = actualCash - totalCalculated;

  const handlePerformClosing = () => {
    setIsClosed(true);
    setClosingReport({
      id: `CLO-${Date.now().toString().slice(-4)}`,
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      startingCash,
      cashSales,
      cardSales,
      transferSales,
      totalRevenue: cashSales + cardSales + transferSales,
      actualCash,
      difference,
      status: difference === 0 ? 'Balance Perfecto' : difference > 0 ? 'Sobrante' : 'Faltante'
    });
    onAddNotification('Cierre de caja registrado y bloqueado con éxito.', 'success');
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
      </div>

      {/* Early Warning System for Mobile Orders */}
      {mobileOrders.filter(o => o.status === 'Pendiente' && o.type === 'client').map(order => (
        <div key={order.id} className="bg-rose-500/10 border-l-4 border-rose-500 p-4 rounded shadow-xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-rose-500" />
            <div>
              <p className="text-sm font-bold text-rose-400">¡NUEVO PEDIDO MÓVIL ENTRANTE!</p>
              <p className="text-xs text-editorial-text-muted">El cliente {order.entityName} ha solicitado {order.items.length} producto(s) por un total de ${order.total.toLocaleString()} USD.</p>
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
                subtotal: item.subtotal
              }));
              setCart(newCart);
              setCustomerType('client');
              setSelectedClientId(order.entityId);
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
                  .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.category.toLowerCase().includes(searchQuery.toLowerCase()))
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
                              {p.category} • {p.origin.split(' ')[0]}
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
                            ${p.sellingPrice.toFixed(2)} <span className="text-[10px] text-editorial-text-muted font-normal font-sans">/ kg</span>
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
                              <span className="text-xs text-editorial-text-muted">kg/un</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const qty = parseFloat(qtyInput);
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
                              Stock: <span className="font-sans font-bold text-editorial-text-primary">{p.stockKg.toFixed(1)} kg</span>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Spacer to push cart to bottom */}
            <div className="flex-1"></div>

            {/* Cart Items at the Bottom of Left Column */}
            {cart.length > 0 && (
              <div className="mt-8 border-t border-editorial-border/60 pt-4 space-y-1">
                {cart.map((item, idx) => (
                  <div key={item.productId} className="flex justify-between items-center text-xs text-editorial-text-primary py-1 border-b border-editorial-border/30 last:border-0 hover:bg-editorial-bg/30 px-2 rounded">
                    <span className="font-mono text-[10px] text-editorial-text-muted mr-3">Línea {idx + 1}</span>
                    <span className="flex-1 truncate font-semibold">{item.name}</span>
                    <div className="flex items-center gap-4 ml-4">
                      <span className="font-mono text-editorial-text-muted">{item.quantityKg} kg/un x ${item.pricePerKg.toFixed(2)}</span>
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

              <form onSubmit={handleProcessSaleSubmit} className="space-y-4">
                {/* Tipo de Destinatario Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                    Tipo de Destinatario
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { type: 'general', label: 'General' },
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
                          setPaymentMethod('Efectivo');
                          setPaidAmountInput('');
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

                {/* Conditional customer selects */}
                {customerType === 'client' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                      Seleccionar Cliente de Tienda
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-editorial-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <select
                        value={selectedClientId}
                        onChange={(e) => setSelectedClientId(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans cursor-pointer"
                      >
                        <option value="">-- Seleccionar --</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Adeudo: ${c.outstandingDebt.toFixed(0)} M.N.)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {customerType === 'supplier' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                      Productor / Proveedor (Libreta de Queso)
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-editorial-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <select
                        value={selectedSupplierId}
                        onChange={(e) => setSelectedSupplierId(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans cursor-pointer"
                      >
                        <option value="">-- Seleccionar --</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} (Le debemos: ${s.balanceOwed.toFixed(0)} | Nos debe: ${(s.storeDebt || 0).toFixed(0)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Payment Method Select */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                    Método de Cobro
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(() => {
                      const methods = ['Efectivo', 'Tarjeta', 'Transferencia'];
                      if (customerType === 'client') {
                        methods.push('credit');
                      } else if (customerType === 'supplier') {
                        methods.push('Libreta de Queso');
                      }
                      return methods.map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setPaymentMethod(m);
                            setPaidAmountInput('');
                          }}
                          className={`py-2 text-[10px] font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                            paymentMethod === m
                              ? 'bg-amber-500 border-amber-600 text-white'
                              : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary'
                          }`}
                        >
                          {m === 'credit' ? 'Crédito Cuenta' : m}
                        </button>
                      ));
                    })()}
                  </div>
                </div>

                {/* Split Credit / Libreta input */}
                {(paymentMethod === 'credit' || paymentMethod === 'Libreta de Queso') && (
                  <div className="bg-amber-500/5 border border-amber-500/30 rounded p-4 space-y-3 font-mono text-xs">
                    <p className="text-[10px] text-amber-500 uppercase leading-none font-bold tracking-wider">
                      Intercambio / Cargar a Cuenta
                    </p>
                    <div className="space-y-1.5">
                      <label className="text-[9px] text-editorial-text-muted uppercase block">
                        ¿Cuánto abona en Efectivo hoy? (0 para todo a crédito)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={total}
                        step="0.01"
                        value={paidAmountInput}
                        placeholder={`Total: $${total.toFixed(2)}`}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setPaidAmountInput(e.target.value);
                        }}
                        className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                    <div className="text-[10px] text-editorial-text-muted space-y-1 pt-2 border-t border-editorial-border/30">
                      <div className="flex justify-between">
                        <span>Total de la venta:</span>
                        <span className="text-editorial-text-primary">${total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Pago Recibido Hoy:</span>
                        <span className="text-emerald-400">${(parseFloat(paidAmountInput) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-editorial-text-primary pt-0.5 border-t border-dashed border-editorial-border/20">
                        <span>Cargado a Deuda:</span>
                        <span className="text-amber-500">
                          ${Math.max(0, total - (parseFloat(paidAmountInput) || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="h-px bg-editorial-border/60" />

                {/* Calculations summary */}
                <div className="space-y-1.5 font-mono text-[11px] text-editorial-text-muted">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="text-editorial-text-primary">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA (16%):</span>
                    <span className="text-editorial-text-primary">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-serif text-lg font-bold text-editorial-text-primary pt-1.5 border-t border-editorial-border/40">
                    <span className="font-sans text-xs text-editorial-text-muted uppercase font-normal tracking-wider">Total a cobrar:</span>
                    <span className="text-amber-500">${total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={cart.length === 0}
                  className="w-full h-12 bg-amber-500 text-white font-serif font-bold text-md tracking-tight flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Registrar y Procesar Venta</span>
                </button>
              </form>
            </div>

            {/* Last Generated Ticket / Receipt Box */}
            {lastReceipt && (
              <div className="bg-editorial-card border border-editorial-border rounded p-6 font-mono text-xs text-editorial-text-primary space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-emerald-500/10 text-emerald-400 border-b border-l border-emerald-500/30 px-3 py-1 text-[9px] font-bold uppercase tracking-wider">
                  ÉXITO
                </div>
                <div className="text-center space-y-1">
                  <h4 className="font-serif text-md font-extrabold text-editorial-text-primary uppercase tracking-tight">QUESERÍA KALU</h4>
                  <p className="text-[10px] text-editorial-text-muted">AV. CONSTITUCIÓN #1420</p>
                  <p className="text-[9px] text-editorial-text-muted/60">{lastReceipt.date} • {lastReceipt.id}</p>
                </div>
                
                <div className="border-t border-dashed border-editorial-border/60 my-2" />
                
                <div className="space-y-1">
                  <span className="text-[9px] text-editorial-text-muted uppercase">Cliente:</span>
                  <p className="font-semibold text-[11px]">{lastReceipt.clientName || lastReceipt.entity || 'Cliente General'}</p>
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="space-y-1.5">
                  {lastReceipt.items ? lastReceipt.items.map((it: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span className="truncate max-w-[180px]">{it.name}</span>
                      <span>${it.subtotal.toFixed(2)}</span>
                    </div>
                  )) : (
                    <div className="flex justify-between text-[11px]">
                      <span className="truncate max-w-[180px]">{lastReceipt.notes || 'Varios Artículos'}</span>
                      <span>${(lastReceipt.total || lastReceipt.amount || 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="space-y-1 text-[11px] text-right">
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Subtotal:</span>
                    <span>${(lastReceipt.subtotal !== undefined ? lastReceipt.subtotal : (lastReceipt.total || lastReceipt.amount || 0) / 1.16).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">IVA (16.0%):</span>
                    <span>${(lastReceipt.tax !== undefined ? lastReceipt.tax : (lastReceipt.total || lastReceipt.amount || 0) - (lastReceipt.total || lastReceipt.amount || 0) / 1.16).toFixed(2)}</span>
                  </div>
                  {lastReceipt.debtAmount > 0 ? (
                    <>
                      <div className="flex justify-between font-bold text-editorial-text-primary pt-1 border-t border-editorial-border/40">
                        <span>Total de la Venta:</span>
                        <span>${(lastReceipt.total || lastReceipt.amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-400">
                        <span>Pagado en Efectivo:</span>
                        <span>${(lastReceipt.paidAmount !== undefined ? lastReceipt.paidAmount : (lastReceipt.total || lastReceipt.amount || 0)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-amber-500">
                        <span>Cargado a Deuda/Libreta:</span>
                        <span>${(lastReceipt.debtAmount || 0).toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between font-bold text-sm text-amber-500 pt-1 border-t border-editorial-border/40">
                      <span>Total Pagado:</span>
                      <span>${(lastReceipt.total || lastReceipt.amount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="text-[9px] text-editorial-text-muted pt-1">
                    Método: {lastReceipt.paymentMethod}
                  </div>
                </div>

                <div className="text-center text-[9px] text-editorial-text-muted/60 pt-3 border-t border-dashed border-editorial-border/60">
                  ¡Gracias por apoyar el comercio de Martín Niño!
                </div>

                <button
                  onClick={() => window.print()}
                  className="w-full py-2 bg-editorial-bg hover:bg-editorial-card border border-editorial-border text-[10px] font-bold uppercase tracking-widest text-editorial-text-primary flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Comprobante
                </button>
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
                    <span>Fondo Inicial de Caja:</span>
                    <span className="text-editorial-text-primary">${startingCash.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-editorial-text-muted">
                    <span>(+) Ventas Registradas en Efectivo:</span>
                    <span className="text-emerald-400">+${cashSales.toFixed(2)}</span>
                  </div>
                  {creditIncomeCash > 0 && (
                    <div className="flex justify-between text-editorial-text-muted">
                      <span>(+) Ingresos por Cobranza (Efectivo):</span>
                      <span className="text-emerald-400">+${creditIncomeCash.toFixed(2)}</span>
                    </div>
                  )}
                  {expensesCash > 0 && (
                    <div className="flex justify-between text-editorial-text-muted">
                      <span>(-) Salidas por Gastos (Efectivo):</span>
                      <span className="text-rose-400">-${expensesCash.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-editorial-border/40 pt-2 text-editorial-text-primary">
                    <span>(=) Efectivo Esperado en Caja:</span>
                    <span>${totalCalculated.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-editorial-text-muted mt-2">
                    <span>(-) Efectivo Físico Declarado:</span>
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
              <h4 className="font-serif text-lg font-bold text-editorial-text-primary tracking-tight">Resumen No-Efectivo de Hoy</h4>
              <div className="font-mono text-xs space-y-3">
                <div className="flex justify-between p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-editorial-text-muted">Ventas y Cobros por Tarjeta:</span>
                  <span className="font-bold text-editorial-text-primary">${(cardSales + creditIncomeCard).toFixed(2)}</span>
                </div>
                <div className="flex justify-between p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-editorial-text-muted">Ventas y Cobros Transferencia:</span>
                  <span className="font-bold text-editorial-text-primary">${(transferSales + creditIncomeTransfer).toFixed(2)}</span>
                </div>
                <div className="flex justify-between p-3 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded">
                  <span>Facturado Total Hoy:</span>
                  <span className="font-bold">${(cashSales + cardSales + transferSales).toFixed(2)}</span>
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
                    <span className="text-editorial-text-muted">Fondo Apertura:</span>
                    <span>${closingReport.startingCash.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Venta Efectivo:</span>
                    <span>${closingReport.cashSales.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-editorial-text-primary pt-1 border-t border-editorial-border/30">
                    <span>Total Teórico:</span>
                    <span>${(closingReport.startingCash + closingReport.cashSales).toFixed(2)}</span>
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
          </div>
        </div>
      )}
    </div>
  );
}
