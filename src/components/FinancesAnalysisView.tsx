import React, { useState } from 'react';
import { OperatingExpense, Transaction } from '../types';
import {
  TrendingUp,
  CircleDollarSign,
  LineChart,
  Megaphone,
  Globe,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Percent,
  TrendingDown,
  Activity,
  Award
} from 'lucide-react';

interface FinancesAnalysisViewProps {
  expenses: OperatingExpense[];
  transactions: Transaction[];
  businessBalance: number;
  totalSalesRevenue: number;
  onAddExpense: (expense: Omit<OperatingExpense, 'id'>) => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
}

export default function FinancesAnalysisView({
  expenses,
  transactions,
  businessBalance,
  totalSalesRevenue,
  onAddExpense,
  onAddNotification
}: FinancesAnalysisViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'flow' | 'expenses' | 'profit' | 'market' | 'ads'>('flow');

  // New Expense States
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState<'Servicios' | 'Alquiler' | 'Publicidad' | 'Mantenimiento' | 'Logística'>('Servicios');
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Bancario'>('Efectivo');

  const handleRegisterExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept || amount <= 0) {
      onAddNotification('Complete el concepto y especifique un monto válido.', 'warning');
      return;
    }

    if (businessBalance < amount) {
      onAddNotification('Alerta: Saldo insuficiente en caja para registrar este gasto en firme.', 'warning');
      return;
    }

    onAddExpense({
      description: concept,
      category: category === 'Servicios' ? 'Luz y Agua' : category === 'Logística' ? 'Transporte' : category as any,
      amount,
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      paymentMethod: paymentMethod === 'Efectivo' ? 'Efectivo' : 'Transferencia'
    });

    onAddNotification(`Gasto registrado: ${concept} por $${amount.toFixed(2)}. Saldo disminuido.`, 'success');
    setConcept('');
    setAmount(0);
    setCategory('Servicios');
    setPaymentMethod('Efectivo');
    setShowExpenseForm(false);
  };

  // Financial Calculations
  const totalExpensesAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalSalesRevenue - totalExpensesAmount;

  // Attributed ads stats
  const adsExpenses = expenses.filter(e => e.category === 'Publicidad');
  const totalAdsCost = adsExpenses.reduce((sum, e) => sum + e.amount, 0);
  const estimatedAdSales = 0; // Sin simulaciones
  const adROI = totalAdsCost > 0 ? (estimatedAdSales / totalAdsCost).toFixed(1) : '0';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Sub-Tab navigation header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-editorial-border/60 pb-4">
        {[
          { id: 'flow', label: 'Flujo de Caja', icon: CircleDollarSign },
          { id: 'expenses', label: 'Registro de Gastos', icon: TrendingDown },
          { id: 'profit', label: 'Análisis & Rentabilidad', icon: LineChart },
          { id: 'ads', label: 'Reporte Publicitario', icon: Megaphone }
        ].map(tab => {
          const Icon = tab.icon;
          const isSelected = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center justify-center gap-2 p-3 text-[11px] font-mono font-bold uppercase tracking-wider rounded border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 border-amber-600 text-white shadow-md'
                  : 'bg-editorial-card border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary hover:border-editorial-text-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeSubTab === 'flow' && (
        <div className="space-y-6">
          {/* Main state financial block */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-editorial-card border border-editorial-border rounded p-6 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">Bancos &amp; Caja Activa</span>
                <h4 className="font-serif text-3xl font-bold text-editorial-text-primary mt-1">
                  ${businessBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h4>
              </div>
              <span className="text-[9px] font-mono text-emerald-400 mt-4 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                Reserva Líquida Asegurada
              </span>
            </div>

            <div className="bg-editorial-card border border-editorial-border rounded p-6 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">Ventas Brutas Totales</span>
                <h4 className="font-serif text-3xl font-bold text-emerald-400 mt-1">
                  ${totalSalesRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h4>
              </div>
              <span className="text-[9px] font-mono text-emerald-400 mt-4 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Rendimiento de Ventas POS
              </span>
            </div>

            <div className="bg-editorial-card border border-editorial-border rounded p-6 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">Gastos Operativos Acumulados</span>
                <h4 className="font-serif text-3xl font-bold text-rose-400 mt-1">
                  ${totalExpensesAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h4>
              </div>
              <span className="text-[9px] font-mono text-rose-400 mt-4 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Servicios, Fletes &amp; Producción
              </span>
            </div>
          </div>

          {/* Cash flow graph simulation using styled DIV blocks */}
          <div className="bg-editorial-card border border-editorial-border rounded p-6 space-y-4">
            <h3 className="font-serif text-xl font-bold text-editorial-text-primary">Evolución de Ingresos contra Egresos</h3>
            
            <div className="h-48 flex items-end justify-between gap-4 pt-6 border-b border-editorial-border/60 font-mono text-[10px] text-editorial-text-muted">
              {/* Day columns */}
              {[
                { label: 'Lun', income: 4200, expense: 1200 },
                { label: 'Mar', income: 6800, expense: 2800 },
                { label: 'Mié', income: 5500, expense: 900 },
                { label: 'Jue', income: 7200, expense: 4100 },
                { label: 'Vie', income: 8900, expense: 1500 },
                { label: 'Sáb', income: 11000, expense: 3200 },
                { label: 'Dom', income: 9400, expense: 2100 }
              ].map((day, idx) => {
                const totalAmount = day.income + day.expense;
                const incomePercent = (day.income / 15000) * 100;
                const expensePercent = (day.expense / 15000) * 100;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div className="w-full flex justify-center gap-1.5 h-full items-end">
                      {/* Income Bar */}
                      <div
                        style={{ height: `${incomePercent}%` }}
                        className="w-3.5 bg-emerald-500 rounded-t transition-all duration-500 hover:brightness-110"
                        title={`Ingresos: $${day.income}`}
                      />
                      {/* Expense Bar */}
                      <div
                        style={{ height: `${expensePercent}%` }}
                        className="w-3.5 bg-rose-500 rounded-t transition-all duration-500 hover:brightness-110"
                        title={`Egresos: $${day.expense}`}
                      />
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-wider">{day.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-6 justify-center text-xs font-mono pt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded" />
                <span className="text-editorial-text-primary">Ingresos POS</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-rose-500 rounded" />
                <span className="text-editorial-text-primary">Gastos Operativos &amp; Compras</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* List of registered expenses */}
          <div className="lg:col-span-7 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-serif text-xl font-bold text-editorial-text-primary">Egresos de Caja Efectuados</h3>
              <span className="text-[10px] font-mono bg-editorial-bg border border-editorial-border px-3 py-1 rounded">
                TOTAL: ${totalExpensesAmount.toLocaleString()} M.N.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase">
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Concepto</th>
                    <th className="py-2.5 px-3">Categoría</th>
                    <th className="py-2.5 px-3">Medio Pago</th>
                    <th className="py-2.5 px-3 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-editorial-border/60">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-editorial-bg/30">
                      <td className="py-3 px-3 font-mono text-editorial-text-muted">{e.date}</td>
                      <td className="py-3 px-3 font-medium text-editorial-text-primary">{e.description}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono border border-editorial-border bg-editorial-bg">
                          {e.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans text-editorial-text-muted">{e.paymentMethod}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-400">-${e.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Form to add expenses */}
          <div className="lg:col-span-5 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <div className="space-y-1">
              <h4 className="font-serif text-lg font-bold text-editorial-text-primary">Registrar Egreso Nuevo</h4>
              <p className="text-xs text-editorial-text-muted">Añada gastos logísticos, servicios públicos, mermas u honorarios pagados de inmediato.</p>
            </div>

            <form onSubmit={handleRegisterExpenseSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Concepto del Gasto</label>
                <input
                  type="text" required value={concept} onChange={e => setConcept(e.target.value)} placeholder="Ej: Gas Refrigerante Vitrinas"
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Categoría de Egreso</label>
                  <select
                    value={category} onChange={e => setCategory(e.target.value as any)}
                    className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none cursor-pointer"
                  >
                    <option value="Servicios">Servicios (Luz, Agua)</option>
                    <option value="Alquiler">Alquiler de Local</option>
                    <option value="Publicidad">Publicidad Local</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="Logística">Logística / Fletes</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Monto Pagado ($ M.N.)</label>
                  <input
                    type="number" required value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value) || 0)} placeholder="0.00"
                    className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Origen del Fondo</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Efectivo', 'Bancario'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 text-[10px] font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                        paymentMethod === m
                          ? 'bg-amber-500 border-amber-600 text-white'
                          : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary'
                      }`}
                    >
                      {m === 'Efectivo' ? 'Fondo Fijo (Caja)' : 'Banco Corporativo'}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-11 bg-rose-500 hover:bg-rose-600 text-white font-serif font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Autorizar y Disminuir Fondos
              </button>
            </form>
          </div>
        </div>
      )}

      {activeSubTab === 'profit' && (
        <div className="bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
          <div className="space-y-1">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Márgenes y Retornos de Inversión por Producto</h3>
            <p className="text-xs text-editorial-text-muted">Desglose analítico de utilidad neta y eficiencia por Kg comercializado.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Margin Oaxaca */}
            <div className="bg-editorial-bg border border-editorial-border rounded p-5 space-y-3">
              <span className="text-[9px] font-mono tracking-wider text-editorial-text-muted uppercase">Queso Oaxaca Hebrado</span>
              <div className="flex justify-between items-baseline">
                <h4 className="font-serif text-2xl font-bold text-editorial-text-primary">42.8%</h4>
                <span className="text-[10px] font-mono text-emerald-400">Excelente</span>
              </div>
              <div className="w-full h-2.5 bg-editorial-card border border-editorial-border rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '42.8%' }} />
              </div>
              <p className="text-[10px] text-editorial-text-muted">Costo Rancho: $110.00 • Venta POS: $192.30</p>
            </div>

            {/* Margin Cotija */}
            <div className="bg-editorial-bg border border-editorial-border rounded p-5 space-y-3">
              <span className="text-[9px] font-mono tracking-wider text-editorial-text-muted uppercase">Cotija Añejo Auténtico</span>
              <div className="flex justify-between items-baseline">
                <h4 className="font-serif text-2xl font-bold text-editorial-text-primary">48.2%</h4>
                <span className="text-[10px] font-mono text-emerald-400">Margen Máximo</span>
              </div>
              <div className="w-full h-2.5 bg-editorial-card border border-editorial-border rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '48.2%' }} />
              </div>
              <p className="text-[10px] text-editorial-text-muted">Costo Rancho: $160.00 • Venta POS: $308.90</p>
            </div>

            {/* Margin Martin Nino */}
            <div className="bg-editorial-bg border border-editorial-border rounded p-5 space-y-3">
              <span className="text-[9px] font-mono tracking-wider text-editorial-text-muted uppercase">Fresco Artesanal Martín Niño</span>
              <div className="flex justify-between items-baseline">
                <h4 className="font-serif text-2xl font-bold text-editorial-text-primary">31.2%</h4>
                <span className="text-[10px] font-mono text-amber-500">Aceptable</span>
              </div>
              <div className="w-full h-2.5 bg-editorial-card border border-editorial-border rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '31.2%' }} />
              </div>
              <p className="text-[10px] text-editorial-text-muted">Costo Rancho: $110.00 • Venta POS: $160.00</p>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'ads' && (
        <div className="space-y-6">
          {/* Advertising KPI widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-editorial-card border border-editorial-border rounded p-6">
              <span className="text-[9px] font-mono uppercase text-editorial-text-muted block">Presupuesto Ejecutado</span>
              <h4 className="font-serif text-3xl font-bold text-editorial-text-primary mt-1">${totalAdsCost.toFixed(2)}</h4>
              <p className="text-[10px] text-editorial-text-muted mt-2">Inversión en folletos, radio y redes locales</p>
            </div>

            <div className="bg-editorial-card border border-editorial-border rounded p-6">
              <span className="text-[9px] font-mono uppercase text-editorial-text-muted block">Ventas Atribuidas</span>
              <h4 className="font-serif text-3xl font-bold text-emerald-400 mt-1">${estimatedAdSales.toFixed(2)}</h4>
              <p className="text-[10px] text-editorial-text-muted mt-2">Equivale al 35% del volumen bruto total</p>
            </div>

            <div className="bg-editorial-card border border-editorial-border rounded p-6">
              <span className="text-[9px] font-mono uppercase text-editorial-text-muted block">Retorno ROI Publicitario</span>
              <h4 className="font-serif text-3xl font-bold text-amber-500 mt-1">{adROI}x</h4>
              <p className="text-[10px] text-editorial-text-muted mt-2">Retorno de pesos generados por peso invertivo</p>
            </div>
          </div>

          {/* Advertising detailed report table */}
          <div className="bg-editorial-card border border-editorial-border rounded p-6">
            <h3 className="font-serif text-xl font-bold text-editorial-text-primary mb-4">Campañas y Canales Promocionales</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase">
                    <th className="py-2 px-2">Campaña / Canal</th>
                    <th className="py-2 px-2">Tipo de Medio</th>
                    <th className="py-2 px-2 text-right">Inversión</th>
                    <th className="py-2 px-2 text-right">Clientes Atribuidos</th>
                    <th className="py-2 px-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-editorial-border/40 font-mono">
                  <tr>
                    <td className="py-3 px-2 font-sans font-semibold text-editorial-text-primary">Volantes Casa por Casa</td>
                    <td className="py-3 px-2 text-editorial-text-muted">Impreso Local</td>
                    <td className="py-3 px-2 text-right">$650.00</td>
                    <td className="py-3 px-2 text-right">45 nuevos</td>
                    <td className="py-3 px-2 text-center">
                      <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-950/20 text-emerald-400 border border-emerald-800/40">Concluido</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-sans font-semibold text-editorial-text-primary">Anuncio Radio Tecalitlán FM</td>
                    <td className="py-3 px-2 text-editorial-text-muted">Megafonía Local</td>
                    <td className="py-3 px-2 text-right">$1,200.00</td>
                    <td className="py-3 px-2 text-right">92 nuevos</td>
                    <td className="py-3 px-2 text-center">
                      <span className="px-2 py-0.5 rounded text-[9px] bg-amber-950/20 text-amber-400 border border-amber-800/40 animate-pulse">Activo</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-sans font-semibold text-editorial-text-primary">Facebook Ads Segmentados</td>
                    <td className="py-3 px-2 text-editorial-text-muted">Campaña Redes</td>
                    <td className="py-3 px-2 text-right">$450.00</td>
                    <td className="py-3 px-2 text-right">120 nuevos</td>
                    <td className="py-3 px-2 text-center">
                      <span className="px-2 py-0.5 rounded text-[9px] bg-amber-950/20 text-amber-400 border border-amber-800/40 animate-pulse">Activo</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
