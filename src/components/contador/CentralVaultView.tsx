import React, { useState } from 'react';
import { Building2, ArrowLeft, Plus, History, Banknote, CreditCard, Send, CheckCircle2, Bot, BarChart3, TrendingUp, X, Users, Store, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'balance' | 'manual' | 'desglose'>('balance');
  const [showExecutiveModal, setShowExecutiveModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD');
  const [category, setCategory] = useState('Proveedores');
  const [note, setNote] = useState('');
  const [source, setSource] = useState<'Efectivo' | 'Banco'>('Efectivo');
  
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) return;
    
    let usdAmount = currency === 'BS' ? Number(amount) / exchangeRate : Number(amount);
    
    onAddTransaction({
      category: 'gastos',
      amount: usdAmount,
      isIncome: false,
      notes: `Registro Manual (Bóveda): ${category} - ${note}`,
      paymentMethod: source === 'Efectivo' ? (currency === 'BS' ? 'Efectivo BS' : 'Efectivo USD') : 'Transferencia'
    });
    
    setAmount('');
    setNote('');
    alert('Operación registrada y debitada de la bóveda exitosamente.');
  };

  // Cuentas por cobrar y pagar consolidadas
  const totalReceivable = clients.reduce((sum, c) => sum + Number(c.outstandingDebt || 0), 0);
  const totalPayable = suppliers.reduce((sum, s) => sum + Number(s.balanceOwed || 0), 0);
  const totalStoreDebt = suppliers.reduce((sum, s) => sum + Number(s.storeDebt || 0), 0);

  const totalVaultUsd = (Number(vaultBalance.usd) || 0) + 
                        ((Number(vaultBalance.bs) || 0) / (exchangeRate || 42.5)) + 
                        (Number(vaultBalance.bankUsd) || 0) + 
                        ((Number(vaultBalance.bankBs) || 0) / (exchangeRate || 42.5));

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
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Concepto / Referencia</label>
                <input required type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none" placeholder="Ej. Pago Nómina Semana 3" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Categoría</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none">
                  <option>Nómina</option>
                  <option>Proveedores</option>
                  <option>Fletes</option>
                  <option>Gastos Fijos</option>
                  <option>Facturas San Juan</option>
                  <option>Otros</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Monto</label>
                <input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none" placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Moneda</label>
                <select value={currency} onChange={e => setCurrency(e.target.value as any)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none">
                  <option value="USD">Dólares ($)</option>
                  <option value="BS">Bolívares (Bs)</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-mono text-neutral-400 uppercase">Origen de los Fondos a Debitar</label>
                <select value={source} onChange={e => setSource(e.target.value as any)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:border-amber-500 outline-none">
                  <option value="Efectivo">Caja Fuerte Efectivo Físico</option>
                  <option value="Banco">Cuentas Bancarias / Pago Móvil</option>
                </select>
              </div>
            </div>
            <button type="submit" className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-neutral-900 font-bold uppercase tracking-wider rounded transition-colors flex justify-center items-center gap-2 cursor-pointer">
              <Plus className="w-4 h-4" /> Registrar y Debitar de Bóveda
            </button>
          </form>
        )}
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
