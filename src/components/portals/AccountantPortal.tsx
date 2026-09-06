import React, { useState } from 'react';
import { 
  Building2, 
  Receipt, 
  Mic, 
  Truck, 
  ShieldCheck, 
  ArrowLeft,
  Sparkles,
  RefreshCw,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { MobilePortalsViewProps } from '../MobilePortalsView';
import CentralVaultView from '../contador/CentralVaultView';
import InvoiceUploadView from '../contador/InvoiceUploadView';
import VoiceNotesView from '../contador/VoiceNotesView';
import CheeseTripsView from '../CheeseTripsView';

type TabType = 'boveda' | 'facturas' | 'voz' | 'giras';

export default function AccountantPortal({
  products = [],
  clients = [],
  suppliers = [],
  cheeseTrips = [],
  transactions = [],
  vaultBalance = { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 },
  exchangeRate = 42.5,
  onCreateTrip = async () => {},
  onUpdateTrip = async () => {},
  onSettleTrip = async () => {},
  onAddTransaction = () => {},
  onAddNotification = () => {}
}: MobilePortalsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('boveda');

  // Helper para volver al inicio del CRM si se desea
  const handleExit = () => {
    window.location.href = '/';
  };

  return (
    <div className="w-full min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans select-none pb-20">
      
      {/* Top Mobile App Header */}
      <header className="sticky top-0 z-30 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExit}
            className="p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
            title="Volver al inicio"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-xs font-mono font-bold tracking-wider uppercase text-amber-400 flex items-center gap-1">
                Contador IA <Sparkles className="w-3 h-3 text-amber-400" />
              </h1>
            </div>
            <p className="text-[10px] text-neutral-400">Portal Móvil de Administración</p>
          </div>
        </div>

        {/* BCV Exchange Rate Badge */}
        <div className="flex items-center gap-2">
          <div className="bg-neutral-800/80 border border-neutral-700 px-2.5 py-1 rounded-full text-right">
            <span className="text-[9px] font-mono text-neutral-400 block leading-none">BCV</span>
            <span className="text-[11px] font-mono font-bold text-emerald-400">
              Bs. {Number(exchangeRate).toFixed(2)}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-2xl mx-auto flex flex-col relative overflow-x-hidden">
        {activeTab === 'boveda' && (
          <div className="flex-1 w-full animate-fadeIn">
            <CentralVaultView
              onBack={() => setActiveTab('boveda')}
              vaultBalance={vaultBalance}
              exchangeRate={exchangeRate}
              transactions={transactions}
              cheeseProducts={products}
              cheeseTrips={cheeseTrips}
              clients={clients}
              suppliers={suppliers}
              onAddTransaction={onAddTransaction}
            />
          </div>
        )}

        {activeTab === 'facturas' && (
          <div className="flex-1 w-full animate-fadeIn">
            <InvoiceUploadView
              onBack={() => setActiveTab('boveda')}
              products={products}
              suppliers={suppliers}
              exchangeRate={exchangeRate}
              vaultBalance={vaultBalance}
              cheeseTrips={cheeseTrips}
              onSettleTrip={onSettleTrip}
              onAddTransaction={onAddTransaction}
            />
          </div>
        )}

        {activeTab === 'voz' && (
          <div className="flex-1 w-full animate-fadeIn p-2 sm:p-4">
            <VoiceNotesView
              onBack={() => setActiveTab('boveda')}
              exchangeRate={exchangeRate}
            />
          </div>
        )}

        {activeTab === 'giras' && (
          <div className="flex-1 w-full animate-fadeIn p-2 sm:p-4">
            <CheeseTripsView
              cheeseTrips={cheeseTrips}
              cheeseProducts={products}
              clients={clients}
              exchangeRate={exchangeRate}
              onCreateTrip={onCreateTrip}
              onUpdateTrip={onUpdateTrip}
              onSettleTrip={onSettleTrip}
              onAddNotification={onAddNotification}
              onAddTransaction={onAddTransaction}
            />
          </div>
        )}
      </main>

      {/* Tactile Bottom Navigation Bar (Dock) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-800 shadow-2xl safe-area-bottom">
        <div className="max-w-2xl mx-auto flex items-center justify-around px-2 py-2">
          
          {/* Tab 1: Bóveda Central */}
          <button
            onClick={() => setActiveTab('boveda')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'boveda'
                ? 'text-amber-400 font-bold bg-amber-400/10'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Building2 className={`w-5 h-5 mb-0.5 transition-transform ${activeTab === 'boveda' ? 'scale-110' : ''}`} />
            <span className="text-[9px] tracking-tight">Bóveda</span>
          </button>

          {/* Tab 2: OCR Facturas */}
          <button
            onClick={() => setActiveTab('facturas')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'facturas'
                ? 'text-emerald-400 font-bold bg-emerald-400/10'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Receipt className={`w-5 h-5 mb-0.5 transition-transform ${activeTab === 'facturas' ? 'scale-110' : ''}`} />
            <span className="text-[9px] tracking-tight">Facturas</span>
          </button>

          {/* Tab 3: Notas de Voz */}
          <button
            onClick={() => setActiveTab('voz')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'voz'
                ? 'text-rose-400 font-bold bg-rose-400/10'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Mic className={`w-5 h-5 mb-0.5 transition-transform ${activeTab === 'voz' ? 'scale-110' : ''}`} />
            <span className="text-[9px] tracking-tight">Voz IA</span>
          </button>

          {/* Tab 4: Control de Giras */}
          <button
            onClick={() => setActiveTab('giras')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'giras'
                ? 'text-blue-400 font-bold bg-blue-400/10'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Truck className={`w-5 h-5 mb-0.5 transition-transform ${activeTab === 'giras' ? 'scale-110' : ''}`} />
            <span className="text-[9px] tracking-tight">Giras</span>
          </button>

        </div>
      </nav>
    </div>
  );
}
