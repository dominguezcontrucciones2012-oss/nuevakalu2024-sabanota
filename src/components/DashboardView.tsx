import React from 'react';
import { Transaction, CheeseProduct, ClientProfile, SupplierProfile } from '../types';
import {
  TrendingUp,
  CircleDollarSign,
  Package,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Truck,
  MessageSquare
} from 'lucide-react';

interface DashboardViewProps {
  transactions: Transaction[];
  balance: number;
  cheeseProducts: CheeseProduct[];
  clients: ClientProfile[];
  suppliers: SupplierProfile[];
  onNavigate: (view: any) => void;
  onAddNotification: (message: string) => void;
  isSidebarOpen?: boolean;
  settings: import('../types').BusinessSettings;
  expenses: import('../types').OperatingExpense[];
  sales: any[];
}

export default function DashboardView({
  transactions,
  balance,
  cheeseProducts,
  clients,
  suppliers,
  onNavigate,
  onAddNotification,
  isSidebarOpen = true,
  settings,
  expenses,
  sales
}: DashboardViewProps) {
  
  // Calculate specific metrics
  const lowStockCount = cheeseProducts.filter(p => p.stockKg > 0 && p.stockKg <= p.alertThreshold).length;
  const isMartinNiñoSoldOut = cheeseProducts.some(p => p.id === 'prod-1' && p.stockKg <= 0);

  const totalOutstandingReceivable = clients.reduce((sum, c) => sum + c.outstandingDebt, 0);
  const totalOutstandingPayable = suppliers.reduce((sum, s) => sum + s.balanceOwed, 0);

  const centralVault = settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
  const exchangeRate = settings.exchangeRate || 45;

  const currentDrawerUsd = centralVault.usd;
  const currentDrawerBs = centralVault.bs;
  const currentBankBs = centralVault.bankBs;
  const currentBankUsd = centralVault.bankUsd;
  
  const totalPatrimony = currentDrawerUsd + (currentDrawerBs / exchangeRate) + (currentBankBs / exchangeRate) + currentBankUsd;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Editorial Title banner */}
      <div className="border-b border-editorial-border pb-6">
        <span className="text-[10px] font-mono tracking-[0.3em] text-amber-500 uppercase font-bold">MONITOR DEL SISTEMA CENTRAL</span>
        <h1 className="font-serif text-4xl sm:text-5xl font-extrabold tracking-tight text-editorial-text-primary leading-tight mt-1">
          KALU Control Panel
        </h1>
        <p className="text-xs text-editorial-text-muted mt-2 max-w-2xl leading-relaxed">
          Bienvenido al portal institucional de contabilidad, logística de maduración y control de caja de Quesería KALU. Sincronizado con proveedores locales.
        </p>
      </div>

      {/* Critical Martín Niño Warning Alert */}
      {isMartinNiñoSoldOut && (
        <div className="bg-rose-500/5 border border-rose-500/30 rounded p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex gap-4 items-start">
            <div className="w-10 h-10 rounded bg-rose-950/20 text-rose-400 border border-rose-800/40 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-serif text-md font-bold text-editorial-text-primary">Queso de Martín Niño AGOTADO</h4>
              <p className="text-xs text-editorial-text-muted leading-relaxed mt-1">
                El queso fresco artesanal preferido de nuestros clientes se ha agotado por completo esta semana. 
                El productor Martín Niño está preparando el nuevo lote.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('inventory')}
            className="px-4 py-2 bg-amber-500 text-white font-serif font-bold text-xs uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
          >
            Reabastecer con IA o Compra
          </button>
        </div>
      )}

      {/* Balance General de Tesorería Widget */}
      <div className="bg-editorial-card border border-editorial-border rounded p-6">
        <h3 className="font-serif text-xl font-bold text-editorial-text-primary tracking-tight mb-6">Balance General de Tesorería (Sabanota)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-1 border-l-2 border-emerald-500 pl-4">
            <span className="text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">Efectivo Físico ($ USD)</span>
            <div className="font-serif text-2xl font-bold text-emerald-400">$ {(currentDrawerUsd || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="space-y-1 border-l-2 border-emerald-500 pl-4">
            <span className="text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">Efectivo Físico (Bs)</span>
            <div className="font-serif text-2xl font-bold text-emerald-400">Bs. {(currentDrawerBs || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-[9px] text-editorial-text-muted">$ {(currentDrawerBs / exchangeRate).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</p>
          </div>
          <div className="space-y-1 border-l-2 border-indigo-500 pl-4">
            <span className="text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">Saldo en Bancos (Bs / USD)</span>
            <div className="font-serif text-2xl font-bold text-indigo-400">Bs. {(currentBankBs || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="font-serif text-sm font-bold text-indigo-400/80">$ {(currentBankUsd + (currentBankBs / exchangeRate)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</div>
          </div>
          <div className="space-y-1 border-l-2 border-amber-500 pl-4">
            <span className="text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">Capital / Patrimonio Actual</span>
            <div className="font-serif text-2xl font-bold text-amber-500">$ {(totalPatrimony || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      {/* Grid of ERP metrics */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isSidebarOpen ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-6`}>


        {/* Cuentas por Cobrar */}
        <div className="bg-editorial-card border border-editorial-border rounded p-6 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[9px] font-mono tracking-widest text-editorial-text-muted uppercase">Cartera por Cobrar (Clientes)</span>
            <div className="font-serif text-3xl font-extrabold text-amber-500">
              ${(totalOutstandingReceivable || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <button
            onClick={() => onNavigate('clients')}
            className="text-[9px] font-mono text-editorial-text-muted hover:text-amber-500 mt-4 flex items-center gap-1 text-left cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            Gestionar Créditos Otorgados
          </button>
        </div>

        {/* Cuentas por Pagar */}
        <div className="bg-editorial-card border border-editorial-border rounded p-6 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[9px] font-mono tracking-widest text-editorial-text-muted uppercase">Pasivos por Pagar (Proveedores)</span>
            <div className="font-serif text-3xl font-extrabold text-rose-400">
              ${(totalOutstandingPayable || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <button
            onClick={() => onNavigate('suppliers')}
            className="text-[9px] font-mono text-editorial-text-muted hover:text-rose-400 mt-4 flex items-center gap-1 text-left cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5" />
            Saldar Cuentas Proveedores
          </button>
        </div>

        {/* Alertas Stock */}
        <div className="bg-editorial-card border border-editorial-border rounded p-6 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[9px] font-mono tracking-widest text-editorial-text-muted uppercase">Alertas de Reordenar Stock</span>
            <div className={`font-serif text-3xl font-extrabold ${lowStockCount > 0 ? 'text-amber-500 animate-pulse' : 'text-emerald-400'}`}>
              {lowStockCount.toString().padStart(2, '0')} SKU
            </div>
          </div>
          <button
            onClick={() => onNavigate('inventory')}
            className="text-[9px] font-mono text-editorial-text-muted hover:text-amber-500 mt-4 flex items-center gap-1 text-left cursor-pointer"
          >
            <Package className="w-3.5 h-3.5" />
            Ver Catálogo de Pesos
          </button>
        </div>
      </div>

      {/* Main bottom block with recent operations & quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left 8 cols: Recent transactions ledger */}
        <div className="lg:col-span-8 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-serif text-xl font-bold text-editorial-text-primary tracking-tight">Bitácora de Movimientos Financieros</h3>
            <span className="text-[10px] font-mono uppercase bg-editorial-bg border border-editorial-border px-3 py-1 rounded">Últimos 5 registros</span>
          </div>

          <div className="flex flex-col gap-3">
            {transactions.length === 0 ? (
              <div className="p-10 text-center text-xs bg-editorial-bg border border-editorial-border border-dashed rounded text-editorial-text-muted">
                Aún no hay transacciones ni movimientos registrados en la caja.
              </div>
            ) : (
              transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-4 bg-editorial-bg border border-editorial-border rounded text-xs transition-all duration-300 hover:border-amber-500/30">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded border flex items-center justify-center shrink-0 ${
                      tx.isIncome
                        ? 'bg-emerald-950/25 border-emerald-800/40 text-emerald-400'
                        : 'bg-rose-950/25 border-rose-800/40 text-rose-400'
                    }`}>
                      {tx.isIncome ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-sans font-semibold text-editorial-text-primary truncate">{tx.entity}</p>
                      <p className="text-[10px] font-mono text-editorial-text-muted mt-0.5">{tx.date} • Folio: {tx.invoiceNumber || tx.id}</p>
                    </div>
                  </div>

                  <div className="text-right font-mono shrink-0 pl-2">
                    <span className={`font-bold ${tx.isIncome ? 'text-emerald-400' : 'text-editorial-text-primary'}`}>
                      {tx.isIncome ? '+' : '-'}${(tx.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="block text-[9px] font-semibold text-editorial-text-muted/60 mt-1 uppercase">{tx.category}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 4 cols: Access or Quick shortcuts */}
        <div className="lg:col-span-4 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
          <h3 className="font-serif text-xl font-bold text-editorial-text-primary tracking-tight">Accesos Directos</h3>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={() => onNavigate('pos-terminal')}
              className="w-full p-4 border border-editorial-border hover:border-amber-500/40 rounded text-left group transition-all duration-300 bg-editorial-bg cursor-pointer"
            >
              <h4 className="font-serif text-sm font-bold text-editorial-text-primary group-hover:text-amber-500">Terminal POS de Venta</h4>
              <p className="text-[10px] text-editorial-text-muted mt-1 leading-normal">Facture Oaxaca, Cotija y quesos de rancho al instante.</p>
            </button>




          </div>
        </div>
      </div>
    </div>
  );
}
