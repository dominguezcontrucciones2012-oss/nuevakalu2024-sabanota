import React, { useState } from 'react';
import { Building2, ArrowLeft, Plus, History, Banknote, CreditCard, Send, CheckCircle2, Bot, BarChart3, TrendingUp, X } from 'lucide-react';
import { CentralVaultBalance, Transaction, CheeseProduct, CheeseTrip } from '../../types';

interface CentralVaultViewProps {
  onBack: () => void;
  vaultBalance: CentralVaultBalance;
  onAddTransaction: (tx: Partial<Transaction>) => void;
  exchangeRate: number;
  transactions?: Transaction[];
  cheeseProducts?: CheeseProduct[];
  cheeseTrips?: CheeseTrip[];
}

export default function CentralVaultView({ onBack, vaultBalance, onAddTransaction, exchangeRate, transactions = [], cheeseProducts = [], cheeseTrips = [] }: CentralVaultViewProps) {
  const [activeTab, setActiveTab] = useState<'balance' | 'manual'>('balance');
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
      paymentMethod: source === 'Efectivo' ? 'Efectivo' : 'Transferencia'
    });
    
    setAmount('');
    setNote('');
    alert('Operación registrada exitosamente.');
  };

  return (
    <div className="flex flex-col h-full bg-editorial-bg overflow-y-auto relative">
      {/* Header Info */}
      <div className="flex items-center justify-between p-6 border-b border-editorial-border/50 shrink-0 bg-editorial-card">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-editorial-text-muted hover:text-white" />
          </button>
          <div>
            <h2 className="text-2xl font-serif font-black text-amber-500 flex items-center gap-3">
              <Building2 className="w-6 h-6" />
              BÓVEDA BANCO CENTRAL
            </h2>
            <p className="text-xs text-editorial-text-muted font-sans mt-1">Gestión Financiera Mayor (IA + Manual)</p>
          </div>
        </div>

        <button 
          onClick={() => setShowExecutiveModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-400 rounded-lg text-xs font-bold uppercase transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          Ficha de Rendimiento | Daisy Corro
        </button>
      </div>

      <div className="p-6">
        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className={`p-6 rounded-xl border ${vaultBalance.usd < 0 ? 'bg-rose-950/20 border-rose-900/50' : 'bg-neutral-900/50 border-neutral-800'}`}>
            <div className="flex items-center gap-3 mb-2">
              <Banknote className={`w-5 h-5 ${vaultBalance.usd < 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
              <span className="text-sm font-mono text-neutral-400 uppercase">Efectivo Físico ($)</span>
            </div>
            <div className={`text-3xl font-mono font-bold ${vaultBalance.usd < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
              {vaultBalance.usd < 0 ? '-' : ''}$ {Math.abs(vaultBalance.usd).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
          </div>
          
          <div className={`p-6 rounded-xl border ${vaultBalance.bs < 0 ? 'bg-rose-950/20 border-rose-900/50' : 'bg-neutral-900/50 border-neutral-800'}`}>
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className={`w-5 h-5 ${vaultBalance.bs < 0 ? 'text-rose-500' : 'text-amber-500'}`} />
              <span className="text-sm font-mono text-neutral-400 uppercase">Efectivo Físico (Bs)</span>
            </div>
            <div className={`text-3xl font-mono font-bold ${vaultBalance.bs < 0 ? 'text-rose-500' : 'text-amber-400'}`}>
              {vaultBalance.bs < 0 ? '-' : ''}Bs. {Math.abs(vaultBalance.bs).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <div className="text-[11px] font-mono text-neutral-500 mt-1">
              {vaultBalance.bs < 0 ? '-' : ''}$ {Math.abs(vaultBalance.bs / exchangeRate).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD
            </div>
          </div>

          <div className={`p-6 rounded-xl border ${(vaultBalance.bankBs < 0 || vaultBalance.bankUsd < 0) ? 'bg-rose-950/20 border-rose-900/50' : 'bg-neutral-900/50 border-neutral-800'}`}>
            <div className="flex items-center gap-3 mb-2">
              <Send className={`w-5 h-5 ${(vaultBalance.bankBs < 0 || vaultBalance.bankUsd < 0) ? 'text-rose-500' : 'text-blue-500'}`} />
              <span className="text-sm font-mono text-neutral-400 uppercase">Bancos & Electrónico</span>
            </div>
            <div className={`text-3xl font-mono font-bold ${(vaultBalance.bankBs < 0 || vaultBalance.bankUsd < 0) ? 'text-rose-500' : 'text-blue-400'}`}>
              Bs. {Math.abs(vaultBalance.bankBs + (vaultBalance.bankUsd * exchangeRate)).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <div className="text-[11px] font-mono text-neutral-500 mt-1">
              $ {Math.abs(vaultBalance.bankUsd + (vaultBalance.bankBs / exchangeRate)).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD (Tasa BCV: Bs. {exchangeRate.toFixed(2)})
            </div>
          </div>
        </div>

        <div className="flex gap-4 mb-6 border-b border-neutral-800">
          <button 
            onClick={() => setActiveTab('balance')}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider font-bold transition-colors ${activeTab === 'balance' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-neutral-500 hover:text-white'}`}
          >
            Modo Asistido IA
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider font-bold transition-colors ${activeTab === 'manual' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-neutral-500 hover:text-white'}`}
          >
            Registro Manual
          </button>
        </div>

        {activeTab === 'balance' && (
          <div className="flex flex-col items-center justify-center p-12 bg-neutral-900/30 rounded-xl border border-neutral-800 border-dashed">
            <Bot className="w-16 h-16 text-amber-500/50 mb-4" />
            <p className="text-neutral-400 font-sans text-center max-w-md">
              La Inteligencia Artificial está monitoreando los egresos mediante Notas de Voz y Carga de Facturas. Usa los otros submódulos para registrar automáticamente usando OCR.
            </p>
          </div>
        )}

        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-2xl">
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="space-y-2">
                <label className="text-xs font-mono text-neutral-400 uppercase">Concepto / Referencia</label>
                <input required type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-sm focus:border-amber-500 outline-none" placeholder="Ej. Pago Nómina Semana 3" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-neutral-400 uppercase">Categoría</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-sm focus:border-amber-500 outline-none">
                  <option>Nómina</option>
                  <option>Proveedores</option>
                  <option>Fletes</option>
                  <option>Gastos Fijos</option>
                  <option>Facturas San Juan</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-neutral-400 uppercase">Monto</label>
                <input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-sm focus:border-amber-500 outline-none" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-neutral-400 uppercase">Moneda</label>
                <select value={currency} onChange={e => setCurrency(e.target.value as any)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-sm focus:border-amber-500 outline-none">
                  <option value="USD">Dólares ($)</option>
                  <option value="BS">Bolívares (Bs)</option>
                </select>
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-xs font-mono text-neutral-400 uppercase">Origen de los Fondos (Bóveda)</label>
                <select value={source} onChange={e => setSource(e.target.value as any)} className="w-full h-11 px-3 bg-neutral-950 border border-neutral-800 rounded text-sm focus:border-amber-500 outline-none">
                  <option value="Efectivo">Caja Fuerte Efectivo (USD/Bs)</option>
                  <option value="Banco">Cuentas Bancarias / Pago Móvil</option>
                </select>
              </div>
            </div>
            <button type="submit" className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-neutral-900 font-bold uppercase tracking-wider rounded transition-colors flex justify-center items-center gap-2">
              <Plus className="w-5 h-5" /> Registrar Egreso Manual
            </button>
          </form>
        )}
      </div>

      {/* Ficha Ejecutiva Daisy Corro */}
      {showExecutiveModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-editorial-card border border-editorial-border p-6 rounded-2xl shadow-2xl w-full max-w-2xl max-h-full overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-serif font-black text-amber-500 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6" /> Ficha de Rendimiento Ejecutivo
                </h2>
                <p className="text-xs text-editorial-text-muted mt-1 uppercase tracking-widest font-mono">Panel de Control: Daisy Corro</p>
              </div>
              <button onClick={() => setShowExecutiveModal(false)} className="p-2 text-editorial-text-muted hover:text-white hover:bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Calculations */}
            {(() => {
              // 1. Total Business Value
              const vaultTotalUsd = vaultBalance.usd + (vaultBalance.bs / exchangeRate) + vaultBalance.bankUsd + (vaultBalance.bankBs / exchangeRate);
              const inventoryTotalUsd = cheeseProducts.reduce((sum, p) => sum + (p.stockKg * (p.purchasePrice || 0)), 0);
              const totalBusinessValue = vaultTotalUsd + inventoryTotalUsd;

              // 2. Weekly Performance (Last 7 Days)
              const now = new Date();
              const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              const weeklyTxs = transactions.filter(t => {
                // Parse date assuming DD/MM/YYYY or ISO depending on format used, but 'date' is DD/MMM/YYYY or ISO.
                // Let's parse securely.
                let tDate = new Date(t.date);
                if (isNaN(tDate.getTime())) {
                  // try manual parse if it's "15 sept 2026"
                  const parts = t.date.split(' ');
                  if (parts.length === 3) tDate = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
                }
                return tDate >= sevenDaysAgo;
              });

              const weeklyIncome = weeklyTxs.filter(t => t.isIncome && !t.isVoided).reduce((sum, t) => sum + (t.amount || 0), 0);
              const weeklyExpense = weeklyTxs.filter(t => !t.isIncome && !t.isVoided).reduce((sum, t) => sum + (t.amount || 0), 0);
              const weeklyNet = weeklyIncome - weeklyExpense;
              const weeklyGrowthPct = weeklyExpense === 0 ? 100 : ((weeklyNet) / weeklyExpense) * 100;

              // 3. Consolidated San Juan Trips
              const sjCost = cheeseTrips.filter(t => !t.status || t.status === 'liquidado').reduce((sum, t) => sum + (t.totalBagValueUsd || t.dispatchedCostValue), 0);
              const sjReturned = cheeseTrips.filter(t => !t.status || t.status === 'liquidado').reduce((sum, t) => sum + (t.totalSettlementValueUsd || 0), 0);
              const sjProfit = sjReturned - sjCost;

              // Health Indicator
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
                  {/* Health Bar */}
                  <div className={`p-4 rounded-xl border flex items-center justify-center ${healthColor}`}>
                    <span className="font-bold text-lg">{healthText}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Patrimonio Global */}
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

                    {/* Rendimiento Semanal */}
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

                    {/* Consolidado San Juan */}
                    <div className="bg-black/30 border border-neutral-800 p-5 rounded-xl sm:col-span-2">
                      <div className="text-[10px] text-neutral-400 uppercase font-mono mb-1">Balance Consolidado Giras San Juan (Histórico)</div>
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
