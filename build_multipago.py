import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. State Injection
state_str = """  const [isPaymentHubOpen, setIsPaymentHubOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(true);"""

new_state = """  const [isPaymentHubOpen, setIsPaymentHubOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(true);

  // Multipago States
  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    const saved = localStorage.getItem('kalu_tasa_cambio');
    return saved ? parseFloat(saved) : 45.00;
  });
  const [payCashUsd, setPayCashUsd] = useState<string>('');
  const [payCashBs, setPayCashBs] = useState<string>('');
  const [payPagoMovil, setPayPagoMovil] = useState<string>('');
  const [refPagoMovil, setRefPagoMovil] = useState<string>('');
  const [payPos, setPayPos] = useState<string>('');
  const [refPos, setRefPos] = useState<string>('');
  const [payBiopago, setPayBiopago] = useState<string>('');
  const [refBiopago, setRefBiopago] = useState<string>('');
  const [acceptDebt, setAcceptDebt] = useState<boolean>(false);
  
  // Real-time calculations
  const totalPaidUsd = (parseFloat(payCashUsd) || 0) + 
    ((parseFloat(payCashBs) || 0) + (parseFloat(payPagoMovil) || 0) + (parseFloat(payPos) || 0) + (parseFloat(payBiopago) || 0)) / (exchangeRate || 1);
  const remainingUsd = total - totalPaidUsd;
  
  const isMultipagoValid = () => {
    if (cart.length === 0) return false;
    if (parseFloat(payPagoMovil) > 0 && !refPagoMovil.trim()) return false;
    if (parseFloat(payPos) > 0 && !refPos.trim()) return false;
    if (parseFloat(payBiopago) > 0 && !refBiopago.trim()) return false;
    if (remainingUsd > 0.01 && !acceptDebt) return false; // Needs debt acceptance if short
    return true;
  };
"""
content = content.replace(state_str, new_state)

# 2. Modify handleProcessSaleSubmit to accept the new multi-payment fields
handle_submit = """  const handleProcessSaleSubmit = (e: React.FormEvent) => {
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

    const debtAmount = isCreditPayment ? Math.max(0, total - paidAmount) : 0;"""

new_handle_submit = """  const handleProcessSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMultipagoValid()) return;

    const client = customerType === 'client' ? (clients.find(c => c.id === selectedClientId) || null) : null;
    const supplier = customerType === 'supplier' ? (suppliers.find(s => s.id === selectedSupplierId) || null) : null;

    if (customerType === 'client' && !selectedClientId) {
      onAddNotification('Por favor, seleccione un cliente.', 'warning');
      return;
    }
    if (customerType === 'supplier' && !selectedSupplierId) {
      onAddNotification('Por favor, seleccione un productor.', 'warning');
      return;
    }

    // Determine primary method for history
    let primaryMethod = 'Múltiple';
    const cashBs = parseFloat(payCashBs) || 0;
    const pm = parseFloat(payPagoMovil) || 0;
    const ptv = parseFloat(payPos) || 0;
    const bio = parseFloat(payBiopago) || 0;
    const cashUsd = parseFloat(payCashUsd) || 0;
    
    if (pm > 0 && ptv === 0 && bio === 0 && cashBs === 0 && cashUsd === 0) primaryMethod = 'Transferencia';
    else if (ptv > 0 && pm === 0 && bio === 0 && cashBs === 0 && cashUsd === 0) primaryMethod = 'Tarjeta';
    else if ((cashBs > 0 || cashUsd > 0) && pm === 0 && ptv === 0 && bio === 0) primaryMethod = 'Efectivo';
    
    let debtAmount = remainingUsd > 0.01 ? remainingUsd : 0;
    let actualPaidAmount = total - debtAmount;

    // References details
    const refDetails = [
      pm > 0 ? `PM:${refPagoMovil}` : '',
      ptv > 0 ? `PUNTO:${refPos}` : '',
      bio > 0 ? `BIO:${refBiopago}` : ''
    ].filter(Boolean).join(' | ');

    const finalPaymentMethod = debtAmount > 0.01 ? (customerType === 'supplier' ? 'Libreta de Queso' : 'credit') : primaryMethod;"""
content = content.replace(handle_submit, new_handle_submit)

# Also update the Receipt generation payment method assignment inside the handleProcessSaleSubmit
content = content.replace("paymentMethod: paymentMethod === 'credit' ? 'Crédito Cuenta' : paymentMethod,", "paymentMethod: finalPaymentMethod,\n      notes: refDetails,")
content = content.replace("paymentMethod: paymentMethod === 'credit' ? 'credit' : paymentMethod,", "paymentMethod: finalPaymentMethod, notes: refDetails,")


# 3. Replace the Drawer with the Modal.
drawer_regex = re.compile(r'\{\/\* SMART PAYMENT HUB DRAWER \*\/\}.*?\}\)', re.DOTALL)
new_modal = """{/* MULTIPAGO MODAL */}
      {isPaymentHubOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-bg/90 backdrop-blur-md">
          <div className="relative w-full max-w-5xl bg-editorial-card border border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.15)] flex flex-col rounded-none animate-scale-up">
            
            {/* Header */}
            <div className="flex justify-between items-center p-5 bg-editorial-bg border-b border-amber-500/30">
              <div>
                <h2 className="font-serif text-3xl font-black text-amber-500 uppercase tracking-tight leading-none">Smart Payment Hub</h2>
                <p className="font-mono text-xs text-editorial-text-muted mt-1 uppercase">Módulo de Multipagos y Fiados</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-editorial-text-muted uppercase">Tasa (Bs/$):</span>
                  <input 
                    type="number" 
                    value={exchangeRate}
                    step="0.01"
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 1;
                      setExchangeRate(val);
                      localStorage.setItem('kalu_tasa_cambio', val.toString());
                    }}
                    className="w-24 h-9 px-2 bg-editorial-bg border border-editorial-border text-editorial-text-primary text-center font-mono font-bold focus:outline-none focus:border-amber-500 rounded-none"
                  />
                </div>
                <button onClick={() => setIsPaymentHubOpen(false)} className="text-editorial-text-muted hover:text-amber-500 transition-colors cursor-pointer rounded-none">
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>

            {/* Balances */}
            <div className="grid grid-cols-3 divide-x divide-editorial-border/40 border-b border-editorial-border/40 bg-editorial-bg/50">
              <div className="p-4 text-center">
                <span className="block font-mono text-[10px] text-editorial-text-muted uppercase tracking-widest mb-1">Total Venta</span>
                <span className="block font-serif text-3xl font-bold text-editorial-text-primary">${total.toFixed(2)}</span>
                <span className="block font-mono text-xs text-editorial-text-muted">Bs. {(total * exchangeRate).toFixed(2)}</span>
              </div>
              <div className="p-4 text-center">
                <span className="block font-mono text-[10px] text-editorial-text-muted uppercase tracking-widest mb-1">Total Abonado</span>
                <span className="block font-serif text-3xl font-bold text-emerald-500">${totalPaidUsd.toFixed(2)}</span>
                <span className="block font-mono text-xs text-emerald-500/70">Bs. {(totalPaidUsd * exchangeRate).toFixed(2)}</span>
              </div>
              <div className="p-4 text-center">
                <span className="block font-mono text-[10px] text-editorial-text-muted uppercase tracking-widest mb-1">
                  {remainingUsd > 0.01 ? 'Falta por Pagar' : remainingUsd < -0.01 ? 'Vuelto a Entregar' : 'Balance Exacto'}
                </span>
                <span className={`block font-serif text-3xl font-bold ${remainingUsd > 0.01 ? 'text-rose-500' : remainingUsd < -0.01 ? 'text-amber-500' : 'text-editorial-text-primary'}`}>
                  ${Math.abs(remainingUsd).toFixed(2)}
                </span>
                <span className={`block font-mono text-xs ${remainingUsd > 0.01 ? 'text-rose-500/70' : remainingUsd < -0.01 ? 'text-amber-500/70' : 'text-editorial-text-muted'}`}>
                  Bs. {(Math.abs(remainingUsd) * exchangeRate).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-6">
              {/* Payment Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                
                {/* Efectivo USD */}
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase text-editorial-text-muted">Efectivo ($ USD)</label>
                  <input type="number" step="0.01" min="0" placeholder="Monto en $" value={payCashUsd} onChange={e => setPayCashUsd(e.target.value)} className="w-full h-12 px-3 bg-editorial-bg border border-editorial-border text-editorial-text-primary font-mono text-lg focus:outline-none focus:border-amber-500 rounded-none" />
                </div>
                
                {/* Efectivo BS */}
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase text-editorial-text-muted">Efectivo (Bs)</label>
                  <input type="number" step="0.01" min="0" placeholder="Monto en Bs" value={payCashBs} onChange={e => setPayCashBs(e.target.value)} className="w-full h-12 px-3 bg-editorial-bg border border-editorial-border text-editorial-text-primary font-mono text-lg focus:outline-none focus:border-amber-500 rounded-none" />
                </div>

                {/* Pago Móvil */}
                <div className="space-y-2 col-span-2 lg:col-span-1">
                  <label className="font-mono text-[10px] uppercase text-editorial-text-muted">Pago Móvil (Bs)</label>
                  <input type="number" step="0.01" min="0" placeholder="Monto en Bs" value={payPagoMovil} onChange={e => setPayPagoMovil(e.target.value)} className={`w-full h-12 px-3 bg-editorial-bg border text-editorial-text-primary font-mono text-lg focus:outline-none rounded-none mb-1 ${parseFloat(payPagoMovil) > 0 && !refPagoMovil ? 'border-rose-500 focus:border-rose-500' : 'border-editorial-border focus:border-amber-500'}`} />
                  <input type="text" placeholder="Referencia Obligatoria" value={refPagoMovil} onChange={e => setRefPagoMovil(e.target.value)} disabled={!(parseFloat(payPagoMovil)>0)} className="w-full h-8 px-2 bg-editorial-bg/50 border border-editorial-border/50 text-editorial-text-primary font-mono text-xs focus:outline-none focus:border-amber-500 rounded-none disabled:opacity-30" />
                </div>

                {/* Punto */}
                <div className="space-y-2 col-span-2 lg:col-span-1">
                  <label className="font-mono text-[10px] uppercase text-editorial-text-muted">Punto de Venta (Bs)</label>
                  <input type="number" step="0.01" min="0" placeholder="Monto en Bs" value={payPos} onChange={e => setPayPos(e.target.value)} className={`w-full h-12 px-3 bg-editorial-bg border text-editorial-text-primary font-mono text-lg focus:outline-none rounded-none mb-1 ${parseFloat(payPos) > 0 && !refPos ? 'border-rose-500 focus:border-rose-500' : 'border-editorial-border focus:border-amber-500'}`} />
                  <input type="text" placeholder="Aprobación Obligatoria" value={refPos} onChange={e => setRefPos(e.target.value)} disabled={!(parseFloat(payPos)>0)} className="w-full h-8 px-2 bg-editorial-bg/50 border border-editorial-border/50 text-editorial-text-primary font-mono text-xs focus:outline-none focus:border-amber-500 rounded-none disabled:opacity-30" />
                </div>
                
                {/* Biopago */}
                <div className="space-y-2 col-span-2 lg:col-span-1">
                  <label className="font-mono text-[10px] uppercase text-editorial-text-muted">Biopago (Bs)</label>
                  <input type="number" step="0.01" min="0" placeholder="Monto en Bs" value={payBiopago} onChange={e => setPayBiopago(e.target.value)} className={`w-full h-12 px-3 bg-editorial-bg border text-editorial-text-primary font-mono text-lg focus:outline-none rounded-none mb-1 ${parseFloat(payBiopago) > 0 && !refBiopago ? 'border-rose-500 focus:border-rose-500' : 'border-editorial-border focus:border-amber-500'}`} />
                  <input type="text" placeholder="Ref. Biopago Obligatoria" value={refBiopago} onChange={e => setRefBiopago(e.target.value)} disabled={!(parseFloat(payBiopago)>0)} className="w-full h-8 px-2 bg-editorial-bg/50 border border-editorial-border/50 text-editorial-text-primary font-mono text-xs focus:outline-none focus:border-amber-500 rounded-none disabled:opacity-30" />
                </div>
              </div>

              {/* Debt Loading Section */}
              {remainingUsd > 0.01 && (customerType === 'client' || customerType === 'supplier') && (
                <div className="mb-6 p-4 border border-amber-500/30 bg-amber-500/5 animate-fade-in flex items-center justify-between rounded-none">
                  <div>
                    <h4 className="font-serif text-lg font-bold text-amber-500 uppercase tracking-tight">Falta Dinero para Completar la Venta</h4>
                    <p className="font-mono text-[10px] text-editorial-text-muted mt-1">El monto abonado es menor al total de la venta. Si facturas, la diferencia se sumará automáticamente a la deuda del {customerType === 'client' ? 'Cliente' : 'Productor'}.</p>
                  </div>
                  <button 
                    onClick={() => setAcceptDebt(!acceptDebt)}
                    className={`px-4 py-2 font-mono font-bold text-xs uppercase transition-all rounded-none border ${acceptDebt ? 'bg-amber-500 text-editorial-bg border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-editorial-bg border-editorial-border text-editorial-text-primary hover:border-amber-500/50'}`}
                  >
                    {acceptDebt ? '✓ DEUDA APROBADA' : '💾 CARGAR A DEUDA ($' + remainingUsd.toFixed(2) + ')'}
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between border-t border-editorial-border/40 pt-6 mt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={printReceipt} onChange={(e) => setPrintReceipt(e.target.checked)} className="w-5 h-5 accent-amber-500 rounded-none cursor-pointer" />
                  <span className="font-mono text-xs uppercase text-editorial-text-primary tracking-wider">Imprimir Ticket</span>
                </label>
                
                <button
                  onClick={(e) => {
                    handleProcessSaleSubmit(e as any);
                    setIsPaymentHubOpen(false);
                    // Reset inputs
                    setPayCashUsd(''); setPayCashBs(''); setPayPagoMovil(''); setRefPagoMovil('');
                    setPayPos(''); setRefPos(''); setPayBiopago(''); setRefBiopago(''); setAcceptDebt(false);
                    if (printReceipt) setTimeout(() => window.print(), 300);
                  }}
                  disabled={!isMultipagoValid()}
                  className="px-10 h-14 bg-amber-500 text-editorial-bg font-serif font-black text-xl tracking-widest uppercase hover:bg-amber-400 active:scale-95 transition-all cursor-pointer rounded-none border border-amber-600 disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                >
                  PROCESAR VENTA
                </button>
              </div>

            </div>
          </div>
        </div>
      )}"""
content = drawer_regex.sub(new_modal, content)

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Multipago modal built!')
