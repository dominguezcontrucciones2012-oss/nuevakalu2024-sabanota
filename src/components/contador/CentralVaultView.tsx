import React, { useState, useMemo } from 'react';
import { Building2, ArrowLeft, Plus, History, Banknote, CreditCard, Send, CheckCircle2, Bot, BarChart3, TrendingUp, X, Users, Store, ArrowUpRight, ArrowDownRight, Wallet, UserCheck, Filter, ChevronDown, ChevronUp, Clock, Calendar } from 'lucide-react';
import { CentralVaultBalance, Transaction, CheeseProduct, CheeseTrip, ClientProfile, SupplierProfile } from '../../types';

interface CentralVaultViewProps {
  onBack: () => void;
  vaultBalance: CentralVaultBalance;
  onAddTransaction: (tx: Partial<Transaction>) => void;
  exchangeRate: number;
  transactions?: Transaction[];
  cheeseProducts?: CheeseProduct[];
  cheeseTrips?: CheeseTrip[];
  clients?: ClientProfile[];
  suppliers?: SupplierProfile[];
}

export default function CentralVaultView({ 
  onBack, 
  vaultBalance, 
  onAddTransaction, 
  exchangeRate, 
  transactions = [], 
  cheeseProducts = [], 
  cheeseTrips = [],
  clients = [],
  suppliers = []
}: CentralVaultViewProps) {
  const [activeTab, setActiveTab] = useState<'balance' | 'manual' | 'desglose'>('manual');
  const [showExecutiveModal, setShowExecutiveModal] = useState(false);
  
  // Filtrar exclusivamente la lista de empleados (isEmployee: true)
  const employeeSuppliers = useMemo(() => {
    return suppliers.filter(s => s.isEmployee);
  }, [suppliers]);

  // Lista de IDs o nombres de productores de queso para excluirlos con rigor de la tesorería de la bóveda
  const cheeseProducerSuppliers = useMemo(() => {
    return suppliers.filter(s => s.isCheeseProducer || !s.isEmployee);
  }, [suppliers]);

  const [category, setCategory] = useState<'Nómina' | 'Proveedores' | 'Fletes' | 'Gastos Fijos' | 'Facturas San Juan' | 'Otros'>('Nómina');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(() => {
    return employeeSuppliers.length > 0 ? employeeSuppliers[0].id : 'otro';
  });
  const [customWorkerName, setCustomWorkerName] = useState('');
  const [note, setNote] = useState('Pago Sueldo Semanal');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD');
  const [source, setSource] = useState<'Efectivo' | 'Banco'>('Banco');

  // Estados de Acordeón y Filtros de Período
  const [isAccordionOpen, setIsAccordionOpen] = useState(true);
  const [historyPeriod, setHistoryPeriod] = useState<'semana' | 'mes' | 'ano' | 'todos'>('semana');
  
  const parseSafeAmount = (val: string): number => {
    if (!val) return 0;
    const clean = val.replace(',', '.').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const parseTxTimestamp = (tx: any): number => {
    if (!tx) return 0;
    if (typeof tx.createdAt === 'number' && tx.createdAt > 0) return tx.createdAt;
    if (tx.timestamp) {
      if (typeof tx.timestamp.toMillis === 'function') return tx.timestamp.toMillis();
      if (typeof tx.timestamp === 'number') return tx.timestamp;
    }
    if (tx.id && typeof tx.id === 'string') {
      const parts = tx.id.split('-');
      for (const part of parts) {
        if (part.length >= 12 && !isNaN(Number(part))) return parseInt(part, 10);
      }
    }
    if (tx.date) {
      const d = new Date(tx.date);
      if (!isNaN(d.getTime())) return d.getTime();
      const p = String(tx.date).split(/[\s/-]+/);
      if (p.length >= 3) {
        const d2 = new Date(`${p[1]} ${p[0]}, ${p[2]}`);
        if (!isNaN(d2.getTime())) return d2.getTime();
      }
    }
    return 0;
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmountUsd = parseSafeAmount(amount);
    if (numAmountUsd <= 0) return;
    
    const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 807.3862;
    const usdAmount = numAmountUsd;
    const bsAmount = numAmountUsd * rate;

    let beneficiaryName = '';
    let targetSupplierId: string | undefined = undefined;

    if (category === 'Nómina') {
      if (selectedWorkerId !== 'otro') {
        const emp = employeeSuppliers.find(e => e.id === selectedWorkerId);
        if (emp) {
          beneficiaryName = emp.name;
          targetSupplierId = emp.id;
        }
      }
      if (!beneficiaryName) {
        beneficiaryName = customWorkerName.trim() || 'Obrero / Personal';
      }
    } else {
      beneficiaryName = note.trim() || category;
    }

    const detailText = category === 'Nómina' 
      ? `[NÓMINA] ${beneficiaryName} | ${note || 'Pago Sueldo Semanal'} | $${usdAmount.toFixed(2)} USD (≈ Bs. ${bsAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
      : `Registro Manual (Bóveda): ${category} - ${note} | $${usdAmount.toFixed(2)} USD (≈ Bs. ${bsAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    
    const nowMs = Date.now();
    onAddTransaction({
      id: `TX-BOV-${nowMs}`,
      category: 'gastos',
      amount: usdAmount,
      isIncome: false,
      entity: beneficiaryName,
      supplierId: targetSupplierId,
      notes: detailText,
      paymentMethod: source === 'Efectivo' ? (currency === 'BS' ? 'Efectivo BS' : 'Efectivo USD') : 'Pago Móvil / Transferencia',
      createdAt: nowMs
    });
    
    // Si es un trabajador con ID identificado, actualizar su cuenta por pagar (sueldo acumulado / devengado a su favor)
    if (category === 'Nómina' && targetSupplierId) {
      const emp = employeeSuppliers.find(e => e.id === targetSupplierId);
      if (emp) {
        const currentBalanceOwed = Number(emp.balanceOwed) || 0;
        // La nómina registrada representa una cuenta por pagar de la empresa a favor del trabajador
        const newBalanceOwed = currentBalanceOwed + usdAmount;
        
        import('../../services/localApi').then(({ updateLocalDoc }) => {
          updateLocalDoc('suppliers', emp.id, {
            balanceOwed: newBalanceOwed
          }).catch(err => console.error('Error actualizando balance de obrero:', err));
        }).catch(err => console.error('Error importando localApi:', err));
      }
    }
    
    setAmount('');
    if (category === 'Nómina') {
      setNote('Pago Sueldo Semanal');
    } else {
      setNote('');
    }
    setCustomWorkerName('');
    alert(`✅ Pago de $${usdAmount.toFixed(2)} USD (${currency === 'BS' ? `Bs. ${bsAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} por Banco/PM` : `Efectivo $`}) registrado exitosamente para ${beneficiaryName}.`);
  };

  // Cuentas por cobrar y pagar consolidadas
  const totalReceivable = clients.reduce((sum, c) => sum + Number(c.outstandingDebt || 0), 0);
  const totalPayable = suppliers.reduce((sum, s) => sum + Number(s.balanceOwed || 0), 0);
  const totalStoreDebt = suppliers.reduce((sum, s) => sum + Number(s.storeDebt || 0), 0);

  const effectiveRate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 807.3862;

  const totalVaultUsd = (Number(vaultBalance.usd) || 0) + 
                        ((Number(vaultBalance.bs) || 0) / effectiveRate) + 
                        (Number(vaultBalance.bankUsd) || 0) + 
                        ((Number(vaultBalance.bankBs) || 0) / effectiveRate);

  // Filtrar ÚNICAMENTE egresos reales de tesorería (Gastos, Nóminas de obreros, Servicios)
  // EXCLUSIÓN TOTAL: Productores de queso (Alfonzo, queseros), consumos de tienda fiados en mostrador y recepciones de inventario
  const vaultEgressTransactions = useMemo(() => {
    // Definir rangos de tiempo
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Lunes
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    startOfYear.setHours(0, 0, 0, 0);

    const rawFiltered = transactions.filter(t => {
      // 1. Excluir consumos fiados de tienda (fiados POS)
      if (t.paymentMethod === 'Consumo de Tienda' || t.category === 'credito') return false;
      
      // 2. Excluir arrimes y recepciones de queso (inventario de productor)
      if (t.paymentMethod === 'A la Libreta' || (t.notes && t.notes.toLowerCase().includes('recibido') && t.notes.toLowerCase().includes('kg'))) return false;

      // 3. Excluir liquidaciones directas a productores de queso (ej: Alfonzo, queseros)
      const isProducerEntity = cheeseProducerSuppliers.some(p => 
        (t.supplierId && String(t.supplierId) === String(p.id)) ||
        (t.entity && t.entity.toLowerCase().includes(p.name.toLowerCase()))
      );
      if (isProducerEntity && t.category === 'compras') return false;

      // 4. Solo salidas o egresos reales de dinero
      if (t.isIncome) return false;
      return t.category === 'gastos' || t.category === 'compras' || (t.notes && t.notes.toLowerCase().includes('nómina'));
    });

    // Filtrar por período seleccionado
    const periodFiltered = rawFiltered.filter(t => {
      const tMs = parseTxTimestamp(t);
      if (tMs === 0) return true;
      if (historyPeriod === 'semana') return tMs >= startOfWeek.getTime();
      if (historyPeriod === 'mes') return tMs >= startOfMonth.getTime();
      if (historyPeriod === 'ano') return tMs >= startOfYear.getTime();
      return true;
    });

    // Ordenamiento estricto por timestamp descendente (el más reciente siempre primero arriba)
    return periodFiltered.sort((a, b) => parseTxTimestamp(b) - parseTxTimestamp(a));
  }, [transactions, historyPeriod, cheeseProducerSuppliers]);

  const totalPeriodEgressUsd = vaultEgressTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  return (
    <div className="flex flex-col h-full bg-editorial-bg overflow-y-auto relative">
      {/* Header Info */}
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-editorial-border/50 shrink-0 bg-editorial-card">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-neutral-800 rounded-full transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5 text-editorial-text-muted hover:text-white" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-black text-amber-500 flex items-center gap-2.5">
              <Building2 className="w-6 h-6" />
              BÓVEDA BANCO CENTRAL
            </h2>
            <p className="text-[11px] text-editorial-text-muted font-sans mt-0.5">Control Financiero Mayor & Desglose en Tiempo Real</p>
          </div>
        </div>

        <button 
          onClick={() => setShowExecutiveModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-400 rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer"
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">Ficha de Rendimiento</span>
        </button>
      </div>

      <div className="p-4 sm:p-6">
        {/* Balance Cards Principales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
          
          {/* Card 1: Efectivo USD */}
          <div className={`p-5 sm:p-6 rounded-xl border transition-all ${vaultBalance.usd < 0 ? 'bg-rose-950/20 border-rose-900/50' : 'bg-neutral-900/50 border-neutral-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <Banknote className={`w-5 h-5 ${vaultBalance.usd < 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
                <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Efectivo Físico ($)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">USD</span>
            </div>
            <div className={`text-2xl sm:text-3xl font-mono font-bold ${vaultBalance.usd < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
              {vaultBalance.usd < 0 ? '-' : ''}$ {Math.abs(vaultBalance.usd || 0).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <div className="text-[10px] text-neutral-500 mt-1 font-mono">Billetes en caja fuerte</div>
          </div>
          
          {/* Card 2: Efectivo Bs */}
          <div className={`p-5 sm:p-6 rounded-xl border transition-all ${vaultBalance.bs < 0 ? 'bg-rose-950/20 border-rose-900/50' : 'bg-neutral-900/50 border-neutral-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <CreditCard className={`w-5 h-5 ${vaultBalance.bs < 0 ? 'text-rose-500' : 'text-amber-500'}`} />
                <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Efectivo Físico (Bs)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">VES</span>
            </div>
            <div className={`text-2xl sm:text-3xl font-mono font-bold ${vaultBalance.bs < 0 ? 'text-rose-500' : 'text-amber-400'}`}>
              {vaultBalance.bs < 0 ? '-' : ''}Bs. {Math.abs(vaultBalance.bs || 0).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <div className="text-[11px] font-mono text-neutral-400 mt-1">
              ≈ $ {Math.abs((vaultBalance.bs || 0) / (exchangeRate || 42.5)).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD
            </div>
          </div>

          {/* Card 3: Bancos & Pago Móvil */}
          <div className={`p-5 sm:p-6 rounded-xl border transition-all ${(vaultBalance.bankBs < 0 || vaultBalance.bankUsd < 0) ? 'bg-rose-950/20 border-rose-900/50' : 'bg-neutral-900/50 border-neutral-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <Send className={`w-5 h-5 ${(vaultBalance.bankBs < 0 || vaultBalance.bankUsd < 0) ? 'text-rose-500' : 'text-blue-500'}`} />
                <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Bancos & Electrónico</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">PUNTOS / PM</span>
            </div>
            <div className={`text-2xl sm:text-3xl font-mono font-bold ${(vaultBalance.bankBs < 0 || vaultBalance.bankUsd < 0) ? 'text-rose-500' : 'text-blue-400'}`}>
              Bs. {Math.abs(vaultBalance.bankBs || 0).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <div className="text-[11px] font-mono text-neutral-300 mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <span>+ $ {Math.abs(vaultBalance.bankUsd || 0).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD</span>
              <span className="text-neutral-400">Total: ≈ $ {((Number(vaultBalance.bankUsd) || 0) + ((Number(vaultBalance.bankBs) || 0) / (exchangeRate || 42.5))).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD</span>
            </div>
          </div>

        </div>

        {/* Resumen de Cuentas por Cobrar / Pagar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-neutral-900/40 border border-neutral-800/80 p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">Cuentas por Cobrar (Clientes + Libreta)</span>
                <span className="text-base font-mono font-bold text-emerald-400">${(totalReceivable + totalStoreDebt).toFixed(2)} USD</span>
                <span className="text-[9px] font-mono text-neutral-500 block">Clientes: ${totalReceivable.toFixed(2)} | Libreta: ${totalStoreDebt.toFixed(2)}</span>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="bg-neutral-900/40 border border-neutral-800/80 p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">Cuentas por Pagar (Queseros)</span>
                <span className="text-base font-mono font-bold text-rose-400">${totalPayable.toFixed(2)} USD</span>
              </div>
            </div>
            <ArrowDownRight className="w-4 h-4 text-rose-400" />
          </div>

          <div className="bg-neutral-900/40 border border-neutral-800/80 p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">Total Liquidez en Bóveda</span>
                <span className="text-base font-mono font-bold text-amber-400">${totalVaultUsd.toFixed(2)} USD</span>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6 border-b border-neutral-800">
          <button 
            onClick={() => setActiveTab('balance')}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer ${activeTab === 'balance' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-neutral-500 hover:text-white'}`}
          >
            Modo Asistido IA
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer ${activeTab === 'manual' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-neutral-500 hover:text-white'}`}
          >
            Registro Manual de Egreso
          </button>
        </div>

        {activeTab === 'balance' && (
          <div className="flex flex-col items-center justify-center p-8 sm:p-12 bg-neutral-900/30 rounded-xl border border-neutral-800 border-dashed">
            <Bot className="w-14 h-14 text-amber-500/50 mb-3" />
            <h4 className="text-sm font-bold text-neutral-200 mb-1">Monitoreo Financiero Activo</h4>
            <p className="text-xs text-neutral-400 font-sans text-center max-w-md leading-relaxed">
              Las ventas del POS, los abonos y los cierres de caja actualizan automáticamente los saldos de la Bóveda en tiempo real. Usa los submódulos de Facturas OCR y Notas de Voz para registrar costos en campo.
            </p>
          </div>
        )}

        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-2xl animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
              
              {/* Categoría */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase flex items-center gap-1.5">
                  <Filter className="w-3 h-3 text-amber-400" /> Categoría de Egreso
                </label>
                <select 
                  value={category} 
                  onChange={e => {
                    const newCat = e.target.value as any;
                    setCategory(newCat);
                    if (newCat === 'Nómina') {
                      setNote('Pago Sueldo Semanal');
                    } else {
                      setNote('');
                    }
                  }} 
                  className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none cursor-pointer"
                >
                  <option value="Nómina">👷‍♂️ Nómina / Obreros</option>
                  <option value="Proveedores">🏭 Proveedores</option>
                  <option value="Fletes">🚚 Fletes</option>
                  <option value="Gastos Fijos">💡 Gastos Fijos</option>
                  <option value="Facturas San Juan">🧀 Facturas San Juan</option>
                  <option value="Otros">📦 Otros</option>
                </select>
              </div>

              {/* Beneficiario / Trabajador Dinámico */}
              {category === 'Nómina' ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase flex items-center gap-1.5">
                    <UserCheck className="w-3 h-3 text-amber-400" /> Seleccione Trabajador / Obrero
                  </label>
                  <select 
                    value={selectedWorkerId} 
                    onChange={e => setSelectedWorkerId(e.target.value)} 
                    className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none cursor-pointer"
                  >
                    {employeeSuppliers.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        👷‍♂️ {emp.name}
                      </option>
                    ))}
                    <option value="otro">➕ Otro Colaborador / Eventual</option>
                  </select>
                  {selectedWorkerId === 'otro' && (
                    <input 
                      type="text" 
                      required 
                      value={customWorkerName} 
                      onChange={e => setCustomWorkerName(e.target.value)} 
                      placeholder="Nombre del trabajador..." 
                      className="w-full h-10 mt-2 px-3 bg-neutral-950 border border-amber-500/50 rounded text-xs text-white focus:border-amber-500 outline-none" 
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase">Concepto / Referencia</label>
                  <input required type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none" placeholder="Ej. Pago de servicio / flete" />
                </div>
              )}

              {/* Si es Nómina, mostrar campo adicional de detalle del pago */}
              {category === 'Nómina' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase">Detalle / Concepto</label>
                  <input required type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none" placeholder="Ej. Pago Sueldo Semanal / Adelanto" />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Monto a Pagar ($ USD)</label>
                <input 
                  required 
                  type="text" 
                  inputMode="decimal" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  onFocus={(e) => e.target.select()}
                  className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white font-mono font-bold focus:border-amber-500 outline-none" 
                  placeholder="Ej. 50.00" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Moneda de Pago</label>
                <select value={currency} onChange={e => setCurrency(e.target.value as any)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none cursor-pointer">
                  <option value="USD">Dólares ($ USD Físico)</option>
                  <option value="BS">Bolívares (Bs VES x Tasa BCV)</option>
                </select>
              </div>

              {/* Vista previa de conversión en tiempo real */}
              {parseSafeAmount(amount) > 0 && (
                <div className="sm:col-span-2 bg-neutral-950/80 border border-neutral-800 rounded-lg p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs font-mono">
                  <span className="text-neutral-400">
                    Cálculo a Tasa BCV ({effectiveRate}):
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-amber-400 block text-sm">
                      {currency === 'BS' 
                        ? `Pagar: Bs. ${(parseSafeAmount(amount) * effectiveRate).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                        : `Pagar: $ ${parseSafeAmount(amount).toFixed(2)} USD`}
                    </span>
                    <span className="text-[10px] text-neutral-500 block">
                      {currency === 'BS' 
                        ? `(Equivalente exacto a $${parseSafeAmount(amount).toFixed(2)} USD acreditados)` 
                        : `(Equivalente en Bs: ${(parseSafeAmount(amount) * effectiveRate).toLocaleString('es-MX', { minimumFractionDigits: 2 })} VES)`}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Origen de los Fondos a Debitar</label>
                <select value={source} onChange={e => setSource(e.target.value as any)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none cursor-pointer">
                  <option value="Banco">Cuentas Bancarias / Pago Móvil</option>
                  <option value="Efectivo">Caja Fuerte Efectivo Físico</option>
                </select>
              </div>
            </div>
            <button type="submit" className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl transition-all flex justify-center items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.99] cursor-pointer">
              <Plus className="w-4 h-4" /> Registrar y Debitar de Bóveda
            </button>
          </form>
        )}

        {/* ACORDEÓN / Historial de Pagos y Egresos de Tesorería */}
        <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          
          {/* Header Acordeón Clickable */}
          <button
            type="button"
            onClick={() => setIsAccordionOpen(!isAccordionOpen)}
            className="w-full p-4 sm:p-5 flex items-center justify-between bg-neutral-900 hover:bg-neutral-800/60 transition-colors cursor-pointer text-left select-none border-b border-neutral-800/60"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                    Historial de Pagos y Egresos de Tesorería
                  </h3>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {vaultEgressTransactions.length} Movimientos
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Registro cronológico de nóminas de obreros, gastos y salidas de dinero
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <span className="text-[10px] font-mono text-neutral-500 block uppercase">Total Período</span>
                <span className="text-sm font-mono font-bold text-rose-400">
                  -${totalPeriodEgressUsd.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
              <div className="p-2 rounded-lg bg-neutral-800 text-neutral-300">
                {isAccordionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>
          </button>

          {/* Contenido Desplegable del Acordeón */}
          {isAccordionOpen && (
            <div className="p-4 sm:p-6 space-y-4 animate-fade-in">
              
              {/* Selector de Períodos */}
              <div className="flex items-center justify-between bg-neutral-950/70 p-2.5 rounded-xl border border-neutral-800 flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-neutral-500 ml-1 mr-1" />
                  <span className="text-[10px] font-mono text-neutral-400 uppercase">Filtrar por:</span>
                  <button
                    type="button"
                    onClick={() => setHistoryPeriod('semana')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      historyPeriod === 'semana' ? 'bg-amber-500 text-neutral-950 font-black shadow-md' : 'bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Esta Semana
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryPeriod('mes')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      historyPeriod === 'mes' ? 'bg-amber-500 text-neutral-950 font-black shadow-md' : 'bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Este Mes
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryPeriod('ano')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      historyPeriod === 'ano' ? 'bg-amber-500 text-neutral-950 font-black shadow-md' : 'bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Este Año
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryPeriod('todos')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      historyPeriod === 'todos' ? 'bg-amber-500 text-neutral-950 font-black shadow-md' : 'bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Todo
                  </button>
                </div>

                <div className="text-[11px] font-mono text-neutral-400 mr-2">
                  Total: <strong className="text-rose-400">-${totalPeriodEgressUsd.toFixed(2)} USD</strong> (≈ Bs. {(totalPeriodEgressUsd * effectiveRate).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </div>
              </div>

              {/* Tabla de Registros */}
              <div className="overflow-x-auto rounded-xl border border-neutral-800 max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px] border-b border-neutral-800 sticky top-0 z-10">
                    <tr>
                      <th className="p-3">Fecha / Hora</th>
                      <th className="p-3">Beneficiario</th>
                      <th className="p-3">Concepto & Detalle</th>
                      <th className="p-3">Origen Fondos</th>
                      <th className="p-3 text-right">Monto USD</th>
                      <th className="p-3 text-right">Monto Bs (BCV)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 bg-neutral-900/40">
                    {vaultEgressTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-neutral-500">
                          <History className="w-8 h-8 text-neutral-700 mx-auto mb-2 opacity-50" />
                          No hay egresos registrados en este período.
                        </td>
                      </tr>
                    ) : (
                      vaultEgressTransactions.map((tx, idx) => {
                        const isEmp = employeeSuppliers.some(e => e.id === tx.supplierId || (tx.entity && tx.entity.toLowerCase().includes(e.name.toLowerCase())));
                        return (
                          <tr key={tx.id || `tx-${idx}`} className="hover:bg-neutral-800/40 transition-colors">
                            <td className="p-3 text-neutral-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-neutral-500" />
                                <span>{tx.date}</span>
                              </div>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${isEmp ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-neutral-800 text-neutral-300 border-neutral-700'}`}>
                                {isEmp ? '👷‍♂️ ' : '👤 '}{tx.entity || 'Bóveda'}
                              </span>
                            </td>
                            <td className="p-3 max-w-xs truncate text-neutral-300" title={tx.notes || 'Egreso'}>
                              {tx.notes || 'Egreso'}
                            </td>
                            <td className="p-3 text-neutral-400 whitespace-nowrap">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800">
                                {tx.paymentMethod || 'Efectivo'}
                              </span>
                            </td>
                            <td className="p-3 text-right font-bold text-rose-400 whitespace-nowrap">
                              -${(Number(tx.amount) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                            </td>
                            <td className="p-3 text-right text-neutral-400 whitespace-nowrap">
                              ≈ Bs. {((Number(tx.amount) || 0) * effectiveRate).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* Ficha Ejecutiva Daisy Corro */}
      {showExecutiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-editorial-card border border-editorial-border p-6 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-serif font-black text-amber-500 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6" /> Ficha de Rendimiento Ejecutivo
                </h2>
                <p className="text-xs text-editorial-text-muted mt-1 uppercase tracking-widest font-mono">Panel de Control: Daisy Corro</p>
              </div>
              <button onClick={() => setShowExecutiveModal(false)} className="p-2 text-editorial-text-muted hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Calculations */}
            {(() => {
              const vaultTotalUsd = (vaultBalance.usd || 0) + ((vaultBalance.bs || 0) / (exchangeRate || 42.5)) + (vaultBalance.bankUsd || 0) + ((vaultBalance.bankBs || 0) / (exchangeRate || 42.5));
              const inventoryTotalUsd = cheeseProducts.reduce((sum, p) => sum + (p.stockKg * (p.purchasePrice || 0)), 0);
              const totalBusinessValue = vaultTotalUsd + inventoryTotalUsd;

              const now = new Date();
              const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              const weeklyTxs = transactions.filter(t => {
                let tDate = new Date(t.date);
                if (isNaN(tDate.getTime())) {
                  const parts = t.date.split(' ');
                  if (parts.length === 3) tDate = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
                }
                return tDate >= sevenDaysAgo;
              });

              const weeklyIncome = weeklyTxs.filter(t => t.isIncome && !t.isVoided).reduce((sum, t) => sum + (t.amount || 0), 0);
              const weeklyExpense = weeklyTxs.filter(t => !t.isIncome && !t.isVoided).reduce((sum, t) => sum + (t.amount || 0), 0);
              const weeklyNet = weeklyIncome - weeklyExpense;

              const sjCost = cheeseTrips.filter(t => !t.status || t.status === 'liquidado').reduce((sum, t) => sum + (t.totalBagValueUsd || t.dispatchedCostValue || 0), 0);
              const sjReturned = cheeseTrips.filter(t => !t.status || t.status === 'liquidado').reduce((sum, t) => sum + (t.totalSettlementValueUsd || 0), 0);
              const sjProfit = sjReturned - sjCost;

              let healthText = "Capital Estable ⚖️";
              let healthColor = "text-amber-400 bg-amber-500/10 border-amber-500/30";
              if (weeklyNet > 0 && sjProfit > 0) {
                healthText = "Negocio en Expansión 🚀";
                healthColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
              } else if (weeklyNet < 0 || sjProfit < 0) {
                healthText = "Revisar Costos ⚠️";
                healthColor = "text-rose-400 bg-rose-500/10 border-rose-500/30";
              }

              return (
                <div className="space-y-6">
                  <div className={`p-4 rounded-xl border flex items-center justify-center ${healthColor}`}>
                    <span className="font-bold text-base">{healthText}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-black/30 border border-neutral-800 p-5 rounded-xl">
                      <div className="text-[10px] text-neutral-400 uppercase font-mono mb-1">Valor Total del Negocio</div>
                      <div className="text-2xl font-black text-white">${totalBusinessValue.toFixed(2)}</div>
                      <div className="text-xs text-neutral-500 mt-2 space-y-1">
                        <div className="flex justify-between">
                          <span>Liquidez Bóveda:</span>
                          <span className="text-emerald-400">${vaultTotalUsd.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Capital Inventario:</span>
                          <span className="text-amber-400">${inventoryTotalUsd.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-black/30 border border-neutral-800 p-5 rounded-xl">
                      <div className="text-[10px] text-neutral-400 uppercase font-mono mb-1">Rendimiento Semanal (7 Días)</div>
                      <div className={`text-2xl font-black ${weeklyNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {weeklyNet >= 0 ? '+' : '-'}${Math.abs(weeklyNet).toFixed(2)}
                      </div>
                      <div className="text-xs text-neutral-500 mt-2 space-y-1">
                        <div className="flex justify-between">
                          <span>Entradas:</span>
                          <span className="text-emerald-400">${weeklyIncome.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Egresos:</span>
                          <span className="text-rose-400">${weeklyExpense.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-black/30 border border-neutral-800 p-5 rounded-xl sm:col-span-2">
                      <div className="text-[10px] text-neutral-400 uppercase font-mono mb-1">Balance Consolidado Giras San Juan</div>
                      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-3">
                        <div className="text-center w-full sm:w-1/3">
                          <div className="text-xs text-neutral-500 mb-1">Carga Despachada</div>
                          <div className="text-lg font-bold text-amber-500">${sjCost.toFixed(2)}</div>
                        </div>
                        <div className="text-center w-full sm:w-1/3 border-t sm:border-t-0 sm:border-l border-neutral-800 pt-3 sm:pt-0">
                          <div className="text-xs text-neutral-500 mb-1">Retorno Liquidado</div>
                          <div className="text-lg font-bold text-emerald-500">${sjReturned.toFixed(2)}</div>
                        </div>
                        <div className="text-center w-full sm:w-1/3 border-t sm:border-t-0 sm:border-l border-neutral-800 pt-3 sm:pt-0">
                          <div className="text-xs text-neutral-500 mb-1">Excedente Neto</div>
                          <div className={`text-lg font-bold ${sjProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {sjProfit >= 0 ? '+' : ''}${sjProfit.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
