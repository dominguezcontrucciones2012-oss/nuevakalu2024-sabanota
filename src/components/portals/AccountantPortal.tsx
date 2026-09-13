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
  ChevronRight,
  Scale
} from 'lucide-react';
import { MobilePortalsViewProps } from '../MobilePortalsView';
import CentralVaultView from '../contador/CentralVaultView';
import InvoiceUploadView from '../contador/InvoiceUploadView';
import VoiceNotesView from '../contador/VoiceNotesView';
import CheeseTripsView from '../CheeseTripsView';
import AdminAccountLedgerView from '../contador/AdminAccountLedgerView';

type TabType = 'ficha' | 'boveda' | 'facturas' | 'voz' | 'giras';

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
  onUpdateSupplier,
  onAddNotification = () => {}
}: MobilePortalsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ficha');
  const [activeTripId, setActiveTripId] = useState<string | undefined>(undefined);

  // Helper para volver al inicio del CRM si se desea
  const handleExit = () => {
    window.location.href = '/';
  };

  const handleNavigateToModule = (moduleId: string | null, params?: any) => {
    if (moduleId === 'invoice-upload') {
      setActiveTripId(params?.tripId);
      setActiveTab('facturas');
    } else if (moduleId === 'cheese-trips' || moduleId === 'giras') {
      setActiveTab('giras');
    } else if (moduleId === 'voice-notes' || moduleId === 'voz') {
      setActiveTab('voz');
    } else if (moduleId === 'boveda') {
      setActiveTab('boveda');
    } else {
      setActiveTab('ficha');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-neutral-950 text-white font-sans selection:bg-amber-500 selection:text-neutral-900 pb-20">
      
      {/* Top Mobile Bar */}
      <header className="sticky top-0 z-40 bg-neutral-900/90 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif font-bold text-sm leading-none text-neutral-100 flex items-center gap-1.5">
              Portal Contable <span className="text-[10px] font-mono font-normal bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">ADMIN</span>
            </h1>
            <span className="text-[10px] font-mono text-neutral-400">
              Mundo Kalu • Daisy Corro
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <span className="text-[9px] font-mono uppercase text-neutral-500 block">Tasa BCV</span>
            <span className="text-xs font-mono font-bold text-amber-400">
              {exchangeRate.toFixed(2)} Bs/$
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-2xl mx-auto flex flex-col relative overflow-x-hidden">
        {activeTab === 'ficha' && (
          <div className="flex-1 w-full animate-fadeIn">
            <AdminAccountLedgerView
              onBack={() => setActiveTab('ficha')}
              exchangeRate={exchangeRate}
              vaultBalance={vaultBalance}
              cheeseTrips={cheeseTrips}
              suppliers={suppliers}
              onUpdateSupplier={onUpdateSupplier}
              onAddNotification={onAddNotification}
            />
          </div>
        )}

        {activeTab === 'boveda' && (
          <div className="flex-1 w-full animate-fadeIn">
            <CentralVaultView
              onBack={() => setActiveTab('ficha')}
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
              onBack={() => {
                setActiveTripId(undefined);
                setActiveTab('giras');
              }}
              settlingTripId={activeTripId}
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
              onNavigateToModule={handleNavigateToModule}
              onAddTransaction={onAddTransaction}
            />
          </div>
        )}
      </main>

      {/* Tactile Bottom Navigation Bar (Dock) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-800 shadow-2xl safe-area-bottom">
        <div className="max-w-2xl mx-auto flex items-center justify-around px-2 py-2">
          
          {/* Tab 0: Ficha Administradora */}
          <button
            onClick={() => setActiveTab('ficha')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'ficha'
                ? 'text-amber-400 font-bold bg-amber-400/10'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Scale className={`w-5 h-5 mb-0.5 transition-transform ${activeTab === 'ficha' ? 'scale-110' : ''}`} />
            <span className="text-[9px] tracking-tight">Ficha</span>
          </button>

          {/* Tab 1: Bóveda Central */}
          <button
            onClick={() => setActiveTab('boveda')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'boveda'
                ? 'text-cyan-400 font-bold bg-cyan-400/10'
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
