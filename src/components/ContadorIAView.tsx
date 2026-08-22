import React, { useState } from 'react';
import { Lock, Mic, Calculator, BrainCircuit, Image as ImageIcon, Receipt, Calendar, ArrowRight, Truck } from 'lucide-react';
import InvoiceUploadView from './contador/InvoiceUploadView';
import AIAssistantWidget from './contador/AIAssistantWidget';
import VoiceNotesView from './contador/VoiceNotesView';
import PhotoAlbumView from './contador/PhotoAlbumView';
import CentralVaultView from './contador/CentralVaultView';
import CheeseTripsView from './CheeseTripsView';
import { CentralVaultBalance, Transaction, CheeseTrip, CheeseProduct, ClientProfile } from '../types';

interface ContadorIAViewProps {
  isAdmin: boolean;
  vaultBalance: CentralVaultBalance;
  onAddTransaction: (tx: Partial<Transaction>) => void;
  exchangeRate: number;
  cheeseTrips?: CheeseTrip[];
  cheeseProducts?: CheeseProduct[];
  clients?: ClientProfile[];
  transactions?: Transaction[];
  onCreateTrip?: (trip: Omit<CheeseTrip, 'id'>) => Promise<void>;
  onUpdateTrip?: (id: string, updates: Partial<CheeseTrip>) => Promise<void>;
  onSettleTrip?: (id: string, settlementData: Partial<CheeseTrip>) => Promise<void>;
  onAddNotification?: (msg: string, type: 'success'|'info'|'warning') => void;
}

export default function ContadorIAView({ 
  isAdmin, vaultBalance, onAddTransaction, exchangeRate,
  cheeseTrips, cheeseProducts, clients, transactions,
  onCreateTrip, onUpdateTrip, onSettleTrip, onAddNotification
}: ContadorIAViewProps) {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [modulePayload, setModulePayload] = useState<any>(null);

  const handleNavigateToModule = (moduleId: string | null, payload?: any) => {
    setActiveModule(moduleId);
    setModulePayload(payload);
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-editorial-bg select-none">
        <Lock className="w-16 h-16 text-rose-500 mb-6 opacity-80" />
        <h2 className="text-3xl font-serif font-black text-white uppercase tracking-wider mb-3">Acceso Restringido</h2>
        <p className="text-editorial-text-muted font-sans text-sm max-w-md">
          El módulo de <strong className="text-amber-500 font-mono">Contador IA</strong> con dictado por voz y balances contables avanzados está reservado exclusivamente para los Administradores Totales del sistema.
        </p>
      </div>
    );
  }

  const modules = [
    {
      id: 'central-vault',
      title: 'Bóveda Banco Central',
      desc: 'Gestión financiera mayor, cuentas bancarias y caja fuerte principal.',
      icon: Calculator,
      color: 'amber'
    },
    {
      id: 'voice-notes',
      title: 'Bloc de Notas por Voz',
      desc: 'Dicta tus balances, gastos diarios e ideas. La IA estructurará la información por ti.',
      icon: Mic,
      color: 'indigo'
    },
    {
      id: 'photo-album',
      title: 'Álbum de Fotos por Fecha',
      desc: 'Registro visual de operaciones, cheques y recibos organizados cronológicamente.',
      icon: Calendar,
      color: 'emerald'
    },
    {
      id: 'budget-control',
      title: 'Control Presupuestario',
      desc: 'Análisis financiero automatizado y detección de desviaciones en tiempo real.',
      icon: BrainCircuit,
      color: 'blue'
    },
    {
      id: 'invoice-upload',
      title: 'Carga de Facturas',
      desc: 'Escaneo y lectura OCR mediante Gemini IA para registro instantáneo de gastos.',
      icon: Receipt,
      color: 'rose'
    },
    {
      id: 'cheese-trips',
      title: 'Control de Giras San Juan',
      desc: 'Salidas de queso y retorno de mercancía Daisy/Víveres.',
      icon: Truck,
      color: 'amber'
    }
  ];

  if (activeModule === 'invoice-upload' || activeModule === 'budget-control') {
    return (
      <div className="relative h-full">
        <InvoiceUploadView 
          onBack={() => handleNavigateToModule(null)} 
          settlingTripId={modulePayload?.tripId}
          cheeseTrips={cheeseTrips}
          onSettleTrip={onSettleTrip}
          vaultBalance={vaultBalance}
          onAddTransaction={onAddTransaction}
        />
        <AIAssistantWidget />
      </div>
    );
  }

  if (activeModule === 'central-vault') {
    return (
      <div className="relative h-full">
        <CentralVaultView 
          onBack={() => setActiveModule(null)} 
          vaultBalance={vaultBalance} 
          onAddTransaction={onAddTransaction} 
          exchangeRate={exchangeRate}
          transactions={transactions}
          cheeseProducts={cheeseProducts}
          cheeseTrips={cheeseTrips}
        />
        <AIAssistantWidget />
      </div>
    );
  }

  if (activeModule === 'voice-notes') {
    return (
      <div className="relative h-full">
        <VoiceNotesView onBack={() => setActiveModule(null)} />
        <AIAssistantWidget />
      </div>
    );
  }

  if (activeModule === 'photo-album') {
    return (
      <div className="relative h-full">
        <PhotoAlbumView onBack={() => setActiveModule(null)} />
        <AIAssistantWidget />
      </div>
    );
  }

  if (activeModule === 'cheese-trips') {
    return (
      <div className="relative h-full p-6">
        <div className="mb-4">
          <button onClick={() => setActiveModule(null)} className="flex items-center text-xs font-bold uppercase tracking-widest text-editorial-text-muted hover:text-white transition-colors cursor-pointer">
            &larr; Volver al Portal
          </button>
        </div>
        {cheeseTrips && cheeseProducts && clients && onCreateTrip && onUpdateTrip && onSettleTrip && onAddNotification && (
          <CheeseTripsView
            cheeseTrips={cheeseTrips}
            cheeseProducts={cheeseProducts}
            clients={clients}
            exchangeRate={exchangeRate}
            onCreateTrip={onCreateTrip}
            onUpdateTrip={onUpdateTrip}
            onSettleTrip={onSettleTrip}
            onAddNotification={onAddNotification}
            onNavigateToModule={handleNavigateToModule}
            onAddTransaction={onAddTransaction}
          />
        )}
        <AIAssistantWidget />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-editorial-bg overflow-y-auto">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 border-b border-editorial-border/50 shrink-0 bg-editorial-card">
        <div>
          <h2 className="text-2xl font-serif font-black text-white flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-brand-accent" />
            EL CONTADOR <span className="text-brand-accent italic font-normal">IA</span>
          </h2>
          <p className="text-xs text-editorial-text-muted font-sans mt-1">Dictado por voz, conciliación bancaria y contabilidad automatizada.</p>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          <div className="px-3 py-1 bg-brand-accent/10 border border-brand-accent/20 rounded flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-accent animate-pulse"></span>
            <span className="text-[10px] font-mono text-brand-accent uppercase tracking-widest">IA Activa</span>
          </div>
        </div>
      </div>

      {/* Main Content (Native Dashboard) */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {modules.map((mod) => (
            <button 
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              className={`bg-editorial-card/50 border border-editorial-border hover:border-${mod.color}-500/50 p-6 rounded-xl flex flex-col text-left transition-all duration-300 hover:shadow-lg hover:shadow-${mod.color}-500/10 group cursor-pointer`}
            >
              <div className={`w-14 h-14 rounded-2xl bg-${mod.color}-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <mod.icon className={`w-7 h-7 text-${mod.color}-500`} />
              </div>
              <h3 className="text-xl font-serif font-bold text-white mb-2">{mod.title}</h3>
              <p className="text-sm text-editorial-text-muted mb-6 flex-1">{mod.desc}</p>
              
              <div className="flex items-center text-xs font-mono uppercase tracking-widest text-editorial-text-muted group-hover:text-white transition-colors">
                <span className="mr-2">Ingresar al módulo</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Widget Flotante del Asistente */}
      <AIAssistantWidget />
    </div>
  );
}
