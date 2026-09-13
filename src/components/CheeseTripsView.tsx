import React, { useState, useRef } from 'react';
import { CheeseTrip, CheeseProduct, ClientProfile, Transaction } from '../types';
import { 
  Truck, Plus, Search, Banknote, CreditCard, Mic, Sparkles, Loader2, Bot, CheckSquare
} from 'lucide-react';
import { formatCurrency } from '../utils';
import { parseTripDepartureWithAI } from '../services/ocrService';

interface CheeseTripsViewProps {
  cheeseTrips: CheeseTrip[];
  cheeseProducts: CheeseProduct[];
  clients: ClientProfile[];
  exchangeRate: number;
  onCreateTrip: (trip: Omit<CheeseTrip, 'id'>) => Promise<void>;
  onUpdateTrip: (id: string, updates: Partial<CheeseTrip>) => Promise<void>;
  onSettleTrip: (id: string, settlementData: Partial<CheeseTrip>) => Promise<void>;
  onAddNotification: (msg: string, type: 'success'|'info'|'warning') => void;
  onNavigateToModule?: (moduleId: string, params?: any) => void;
  onAddTransaction?: (tx: Partial<Transaction>) => void;
}

export default function CheeseTripsView({
  cheeseTrips,
  cheeseProducts,
  clients,
  exchangeRate,
  onCreateTrip,
  onUpdateTrip,
  onSettleTrip,
  onAddNotification,
  onNavigateToModule,
  onAddTransaction
}: CheeseTripsViewProps) {
  const [activeTab, setActiveTab] = useState<'en_ruta' | 'liquidados'>('en_ruta');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Trip Form State
  const [clientId, setClientId] = useState(''); // Will store the selected fixed responsible
  const [driver, setDriver] = useState('Daisy Corro'); // Default responsible
  const [cheeseSearch, setCheeseSearch] = useState('');
  const [cheeseId, setCheeseId] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);
  const [dispatchedKg, setDispatchedKg] = useState<string>('');
  const [costPerKg, setCostPerKg] = useState<string>('');
  
  const [cashTakenUsd, setCashTakenUsd] = useState<string>('');
  const [cashTakenBs, setCashTakenBs] = useState<string>('');
  const [bankTaken, setBankTaken] = useState<string>('');
  const [bankCurrency, setBankCurrency] = useState<'USD' | 'BS'>('BS');

  // Voice AI States
  const [isListening, setIsListening] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [voiceTranscription, setVoiceTranscription] = useState('');
  const recognitionRef = useRef<any>(null);
  const isManuallyListeningRef = useRef<boolean>(false);
  const accumulatedTranscriptRef = useRef<string>('');

  const toggleVoiceDictation = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onAddNotification('El reconocimiento de voz no está soportado en este navegador.', 'warning');
      return;
    }

    // Si ya está grabando y el usuario vuelve a presionar el botón: APAGAR Y PROCESAR
    if (isManuallyListeningRef.current) {
      isManuallyListeningRef.current = false;
      setIsListening(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error(e);
        }
      }
      
      const fullText = accumulatedTranscriptRef.current.trim();
      if (fullText) {
        await processVoiceWithAI(fullText);
      } else {
        onAddNotification('No se detectó ninguna instrucción de voz.', 'warning');
      }
      return;
    }

    // Si está apagado: ENCENDER EN MODO CONTINUO HASTA QUE SE APAGUE MANUALMENTE
    try {
      accumulatedTranscriptRef.current = '';
      setVoiceTranscription('');
      isManuallyListeningRef.current = true;
      setIsListening(true);

      const recognition = new SpeechRecognition();
      recognition.lang = 'es-VE';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalChunk += event.results[i][0].transcript + ' ';
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }
        if (finalChunk) {
          accumulatedTranscriptRef.current += finalChunk;
        }
        setVoiceTranscription((accumulatedTranscriptRef.current + ' ' + currentInterim).trim());
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition warning/error:', event.error);
        if (event.error === 'not-allowed') {
          isManuallyListeningRef.current = false;
          setIsListening(false);
          onAddNotification('Permiso de micrófono denegado.', 'warning');
        }
      };

      recognition.onend = () => {
        // Si el usuario no lo apagó explícitamente y el navegador cortó por silencio, reiniciar automáticamente
        if (isManuallyListeningRef.current) {
          try {
            recognition.start();
          } catch (err) {
            console.log('Restarting recognition...', err);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error(e);
      isManuallyListeningRef.current = false;
      setIsListening(false);
      onAddNotification('No se pudo inicializar el micrófono.', 'warning');
    }
  };

  const processVoiceWithAI = async (spokenText: string) => {
    if (!spokenText.trim()) return;
    setIsAiProcessing(true);
    try {
      const availableCheeseNames = cheeseProducts.filter(p => p.stockKg > 0).map(p => p.name);
      const parsed = await parseTripDepartureWithAI(spokenText, exchangeRate, availableCheeseNames);

      if (parsed.driver) {
        setDriver(parsed.driver);
      }

      if (parsed.cheeseProductName) {
        const matchedProd = cheeseProducts.find(p => 
          p.name.toLowerCase().includes((parsed.cheeseProductName || '').toLowerCase()) ||
          (parsed.cheeseProductName || '').toLowerCase().includes(p.name.toLowerCase())
        );
        if (matchedProd) {
          setCheeseId(matchedProd.id);
          setCheeseSearch(matchedProd.name);
          setCostPerKg(String(parsed.costPerKg || matchedProd.purchasePrice || ''));
        }
      }

      if (parsed.dispatchedKg !== undefined && parsed.dispatchedKg > 0) {
        setDispatchedKg(String(parsed.dispatchedKg));
      }

      if (parsed.costPerKg !== undefined && parsed.costPerKg > 0) {
        setCostPerKg(String(parsed.costPerKg));
      }

      if (parsed.cashTakenUsd !== undefined && parsed.cashTakenUsd > 0) {
        setCashTakenUsd(String(parsed.cashTakenUsd));
      }

      if (parsed.cashTakenBs !== undefined && parsed.cashTakenBs > 0) {
        setCashTakenBs(String(parsed.cashTakenBs));
      }

      if (parsed.bankTakenBs !== undefined && parsed.bankTakenBs > 0) {
        setBankTaken(String(parsed.bankTakenBs));
        setBankCurrency('BS');
      } else if (parsed.bankTakenUsd !== undefined && parsed.bankTakenUsd > 0) {
        setBankTaken(String(parsed.bankTakenUsd));
        setBankCurrency('USD');
      }

      onAddNotification('✨ Datos de salida completados por Gemini 3.7.', 'success');
    } catch (err: any) {
      console.error('Error procesando dictado de viaje:', err);
      onAddNotification('Error al procesar la orden con la IA.', 'warning');
    } finally {
      setIsAiProcessing(false);
    }
  };

  const filteredTrips = cheeseTrips.filter(t => 
    activeTab === 'en_ruta' ? t.status === 'en_ruta' : t.status === 'liquidado'
  );

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = cheeseProducts.find(p => p.id === cheeseId);
    
    const numDispatchedKg = Number(dispatchedKg) || 0;
    const numCostPerKg = Number(costPerKg) || 0;
    const numCashTakenUsd = Number(cashTakenUsd) || 0;
    const numCashTakenBs = Number(cashTakenBs) || 0;
    const numBankTaken = Number(bankTaken) || 0;
    
    const numBankTakenBs = bankCurrency === 'BS' ? numBankTaken : 0;
    const numBankTakenUsd = bankCurrency === 'USD' ? numBankTaken : 0;

    // Validación de Bolsa Combinada: Al menos Queso > 0 o Fondos (Efectivo/Banco) > 0
    if ((!prod || numDispatchedKg <= 0) && numCashTakenUsd <= 0 && numCashTakenBs <= 0 && numBankTaken <= 0) {
      onAddNotification('Debe despachar queso o registrar retiro de fondos (efectivo o banco) para iniciar el viaje.', 'warning');
      return;
    }

    let client = clients.find(c => c.name.toLowerCase() === driver.toLowerCase());
    
    const dispatchedCostValue = (prod && numDispatchedKg > 0) ? (numDispatchedKg * numCostPerKg) : 0;
    const cashUsdEquivalent = numCashTakenUsd + (numCashTakenBs / exchangeRate);
    const bankUsdEquivalent = numBankTakenUsd + (numBankTakenBs / exchangeRate);
    const totalBagValueUsd = dispatchedCostValue + cashUsdEquivalent + bankUsdEquivalent;

    // Registrar Transacciones de Egreso de Fondos en Bóveda si aplica
    if (onAddTransaction) {
      if (numCashTakenUsd > 0) {
        onAddTransaction({
          category: 'gastos',
          amount: numCashTakenUsd,
          isIncome: false,
          notes: `Adelanto / Fondeo Gira San Juan (Efectivo USD) - Responsable: ${driver}`,
          paymentMethod: 'Efectivo USD',
          entity: driver
        });
      }
      if (numCashTakenBs > 0) {
        onAddTransaction({
          category: 'gastos',
          amount: numCashTakenBs / exchangeRate, // Monto base USD para el registro normalizado
          isIncome: false,
          notes: `Adelanto / Fondeo Gira San Juan (Efectivo Bs. ${numCashTakenBs.toLocaleString('es-VE')}) - Responsable: ${driver}`,
          paymentMethod: 'Efectivo BS',
          entity: driver
        });
      }
      if (numBankTakenBs > 0) {
        onAddTransaction({
          category: 'gastos',
          amount: numBankTakenBs / exchangeRate,
          isIncome: false,
          notes: `Adelanto / Fondeo Gira San Juan (Banco / Pago Móvil Bs. ${numBankTakenBs.toLocaleString('es-VE')}) - Responsable: ${driver}`,
          paymentMethod: 'Banco / Pago Móvil',
          entity: driver
        });
      }
      if (numBankTakenUsd > 0) {
        onAddTransaction({
          category: 'gastos',
          amount: numBankTakenUsd,
          isIncome: false,
          notes: `Adelanto / Fondeo Gira San Juan (Banco Digital USD $${numBankTakenUsd.toFixed(2)}) - Responsable: ${driver}`,
          paymentMethod: 'Banco USD / Zelle',
          entity: driver
        });
      }
    }

    await onCreateTrip({
      tripNumber: cheeseTrips.length + 1,
      date: new Date().toISOString(),
      destination: 'San Juan',
      clientId: client?.id || driver,
      clientName: driver,
      driverOrResponsible: driver,
      status: 'en_ruta',
      cheeseProductId: prod ? prod.id : '',
      cheeseProductName: prod ? prod.name : 'Viaje Solo Fondos',
      dispatchedKg: numDispatchedKg,
      costPerKgUsd: numCostPerKg,
      dispatchedCostValue,
      cashTakenUsd: numCashTakenUsd,
      cashTakenBs: numCashTakenBs,
      bankTakenUsd: numBankTakenUsd,
      bankTakenBs: numBankTakenBs,
      totalBagValueUsd,
      invoices: [],
      totalInvoicesValueUsd: 0,
      cashReturnedUsd: 0,
      cashReturnedBs: 0,
      bankReturnedBs: 0,
      bankReturnedUsd: 0,
      bcvRateAtSettlement: exchangeRate,
      totalSettlementValueUsd: 0,
      netProfitUsd: 0,
      createdAt: new Date().toISOString()
    });
    
    // Reset Form
    setCheeseId('');
    setCheeseSearch('');
    setDispatchedKg('');
    setCostPerKg('');
    setCashTakenUsd('');
    setCashTakenBs('');
    setBankTaken('');
    setBankCurrency('BS');
    setShowCreateModal(false);
  };

  const searchedProducts = cheeseProducts.filter(p => 
    p.stockKg > 0 && p.name.toLowerCase().includes(cheeseSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-editorial-text-primary tracking-tight">
            Giras &amp; Viajes San Juan
          </h1>
          <p className="text-xs text-editorial-text-muted mt-1 font-mono uppercase tracking-wider">
            Control de despacho, gastos y liquidación
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Registrar Salida
        </button>
      </div>

      <div className="flex gap-4 border-b border-editorial-border/60">
        <button
          onClick={() => setActiveTab('en_ruta')}
          className={`pb-3 px-2 text-sm font-semibold tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'en_ruta' ? 'border-amber-500 text-amber-500' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          EN RUTA ({cheeseTrips.filter(t => t.status === 'en_ruta').length})
        </button>
        <button
          onClick={() => setActiveTab('liquidados')}
          className={`pb-3 px-2 text-sm font-semibold tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'liquidados' ? 'border-emerald-500 text-emerald-500' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          LIQUIDADOS ({cheeseTrips.filter(t => t.status === 'liquidado').length})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTrips.map((trip) => (
          <div key={trip.id} className="bg-editorial-card border border-editorial-border rounded p-5 space-y-4 hover:border-editorial-text-muted transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <span className={`text-[9px] px-2 py-0.5 rounded font-mono uppercase font-bold tracking-widest ${
                  trip.status === 'en_ruta' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
                }`}>
                  {trip.status === 'en_ruta' ? 'En Ruta' : 'Liquidado'}
                </span>
                <h3 className="font-serif text-lg font-bold text-editorial-text-primary mt-2">
                  Viaje #{trip.tripNumber}
                </h3>
              </div>
              <Truck className={`w-6 h-6 ${trip.status === 'en_ruta' ? 'text-amber-500' : 'text-emerald-500'}`} />
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between mb-2">
                <span className="text-editorial-text-muted">Responsable:</span>
                <span className="text-editorial-text-primary font-bold">{trip.clientName}</span>
              </div>
              
              {(trip.dispatchedKg > 0 || trip.dispatchedCostValue > 0) && (
                <div className="flex justify-between border-t border-editorial-border/30 pt-1">
                  <span className="text-editorial-text-muted">Queso ({trip.dispatchedKg} Kg):</span>
                  <span className="text-editorial-text-primary font-bold">{formatCurrency(trip.dispatchedCostValue)}</span>
                </div>
              )}
              
              {(trip.cashTakenUsd || 0) > 0 && (
                <div className="flex justify-between border-t border-editorial-border/30 pt-1">
                  <span className="text-editorial-text-muted">Efectivo USD (Divisa):</span>
                  <span className="text-emerald-400 font-bold">{formatCurrency(trip.cashTakenUsd || 0)}</span>
                </div>
              )}

              {(trip.cashTakenBs || 0) > 0 && (
                <div className="flex justify-between border-t border-editorial-border/30 pt-1">
                  <span className="text-editorial-text-muted">Efectivo Bs:</span>
                  <div className="text-right">
                    <span className="text-emerald-400 font-bold">Bs. {(trip.cashTakenBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[10px] text-editorial-text-muted block">({formatCurrency((trip.cashTakenBs || 0) / exchangeRate)})</span>
                  </div>
                </div>
              )}

              {((trip.bankTakenBs || 0) > 0 || (trip.bankTakenUsd || 0) > 0) && (
                <div className="flex justify-between border-t border-editorial-border/30 pt-1">
                  <span className="text-editorial-text-muted">Banco / Electrónico:</span>
                  <div className="text-right">
                    {(trip.bankTakenUsd || 0) > 0 && (
                      <span className="text-cyan-400 font-bold block">{formatCurrency(trip.bankTakenUsd || 0)}</span>
                    )}
                    {(trip.bankTakenBs || 0) > 0 && (
                      <>
                        <span className="text-cyan-400 font-bold block">Bs. {(trip.bankTakenBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="text-[10px] text-editorial-text-muted block">({formatCurrency((trip.bankTakenBs || 0) / exchangeRate)})</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {(() => {
                const cheeseVal = trip.dispatchedCostValue || 0;
                const usdVal = trip.cashTakenUsd || 0;
                const bsValInUsd = (trip.cashTakenBs || 0) / exchangeRate;
                const bankUsdVal = (trip.bankTakenUsd || 0) + ((trip.bankTakenBs || 0) / exchangeRate);
                const computedTotalBag = cheeseVal + usdVal + bsValInUsd + bankUsdVal;

                return (
                  <div className="flex justify-between border-t border-editorial-border pt-2 mt-2">
                    <span className="text-editorial-text-muted font-bold">Bolsa Total:</span>
                    <span className="text-amber-500 font-bold text-sm">{formatCurrency(computedTotalBag)}</span>
                  </div>
                );
              })()}
            </div>

            {trip.status === 'en_ruta' ? (
              <div className="mt-4 pt-4 border-t border-editorial-border space-y-2">
                <button
                  onClick={() => {
                    if (onNavigateToModule) {
                      onNavigateToModule('invoice-upload', { tripId: trip.id });
                    }
                  }}
                  className="w-full mt-2 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded text-xs font-bold uppercase transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckSquare className="w-4 h-4" />
                  Cargar Mercancía &amp; Gastos
                </button>
              </div>
            ) : (
              <div className="mt-4 pt-4 border-t border-editorial-border space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-editorial-text-muted">Retorno Neto:</span>
                  <span className="text-emerald-500 font-bold">{formatCurrency(trip.totalSettlementValueUsd)}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-editorial-text-muted">Balance:</span>
                  <span className={`font-bold ${trip.netProfitUsd >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {formatCurrency(trip.netProfitUsd)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
        {filteredTrips.length === 0 && (
          <div className="col-span-full py-12 text-center border border-dashed border-editorial-border rounded">
            <p className="text-editorial-text-muted font-mono text-sm uppercase">No hay viajes en esta sección.</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-editorial-card border border-editorial-border p-6 rounded shadow-xl w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-editorial-text-primary">Nueva Salida de Viaje</h2>
                <p className="text-xs text-editorial-text-muted mt-0.5 font-mono">Gira San Juan • Fondeo y Carga</p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded">
                <Bot className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-mono font-bold text-amber-500 uppercase">Gemini 3.7</span>
              </div>
            </div>

            {/* Smart Voice Dictation Assistant Box */}
            <div className="bg-editorial-bg border border-editorial-border rounded p-3 mb-4 flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px] font-bold text-editorial-text-primary font-mono uppercase tracking-wider">Dictado por Voz IA</span>
                </div>
                <p className="text-[11px] text-editorial-text-muted leading-tight">
                  {isListening ? (
                    <span className="text-rose-400 font-bold animate-pulse">Escuchando... Di: "Me llevo 200 kg de queso, 100 dólares y 20000 bolívares"</span>
                  ) : isAiProcessing ? (
                    <span className="text-amber-500 font-bold flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Procesando con Gemini 3.7...
                    </span>
                  ) : voiceTranscription ? (
                    <span className="text-editorial-text-primary italic">"{voiceTranscription}"</span>
                  ) : (
                    "Presiona el micrófono y dicta la salida en lenguaje natural."
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={toggleVoiceDictation}
                disabled={isAiProcessing}
                className={`p-3 rounded-full transition-all shadow-md flex items-center justify-center cursor-pointer ${
                  isListening 
                    ? 'bg-rose-500 text-white animate-pulse shadow-rose-500/50 ring-4 ring-rose-500/30' 
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                }`}
                title={isListening ? "Detener y procesar dictado (Clic para apagar)" : "Iniciar dictado continuo por voz"}
              >
                <Mic className={`w-4 h-4 ${isListening ? 'animate-bounce' : ''}`} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Responsable Fijo</label>
                <select required value={driver} onChange={e => setDriver(e.target.value)} className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-editorial-text-primary">
                  <option value="Daisy Corro">Daisy Corro</option>
                  <option value="Juan Carlos Domínguez">Juan Carlos Domínguez</option>
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Producto a Despachar (Opcional)</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-editorial-text-muted" />
                    <input 
                      type="text" 
                      placeholder="Escriba para buscar..."
                      value={cheeseSearch} 
                      onChange={e => {
                        setCheeseSearch(e.target.value);
                        setShowProductResults(true);
                        setCheeseId('');
                      }} 
                      onFocus={() => setShowProductResults(true)}
                      className="w-full pl-9 pr-3 py-2 bg-editorial-bg border border-editorial-border rounded text-sm text-editorial-text-primary" 
                    />
                  </div>
                  {showProductResults && cheeseSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-editorial-card border border-editorial-border rounded shadow-lg max-h-48 overflow-y-auto">
                      {searchedProducts.map(p => (
                        <div 
                          key={p.id}
                          onClick={() => {
                            setCheeseId(p.id);
                            setCheeseSearch(p.name);
                            setShowProductResults(false);
                          }}
                          className="p-2 text-sm hover:bg-editorial-bg cursor-pointer flex justify-between items-center"
                        >
                          <span className="font-medium text-white">{p.name}</span>
                          <span className="text-xs text-amber-500 font-mono">Disp: {p.stockKg}Kg</span>
                        </div>
                      ))}
                      {searchedProducts.length === 0 && (
                        <div className="p-3 text-xs text-editorial-text-muted text-center">No se encontraron productos con stock</div>
                      )}
                    </div>
                  )}
                  {cheeseId && (
                    <div className="mt-2 text-xs text-emerald-500 font-mono flex items-center gap-1">
                      ✓ Producto seleccionado correctamente
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Kg Despachados</label>
                  <input 
                    type="number" 
                    step="any"
                    placeholder="0"
                    value={dispatchedKg} 
                    onFocus={e => e.target.select()}
                    onChange={e => setDispatchedKg(e.target.value)} 
                    className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-editorial-text-primary font-mono focus:border-amber-500 outline-none" 
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Costo Acordado ($/Kg)</label>
                <input 
                  type="number" 
                  step="any"
                  placeholder="0.00"
                  value={costPerKg} 
                  onFocus={e => e.target.select()}
                  onChange={e => setCostPerKg(e.target.value)} 
                  className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-editorial-text-primary font-mono focus:border-amber-500 outline-none" 
                />
              </div>

              <div className="border-t border-editorial-border/50 pt-4 mt-2">
                <h3 className="text-sm font-bold font-serif text-editorial-text-primary mb-3 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-500" /> Adelanto en Efectivo (Bóveda Central)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Entregar USD ($)</label>
                    <input 
                      type="number" 
                      step="any" 
                      min="0" 
                      placeholder="0.00"
                      value={cashTakenUsd} 
                      onFocus={e => e.target.select()}
                      onChange={e => setCashTakenUsd(e.target.value)} 
                      className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-emerald-400 font-bold font-mono focus:border-emerald-500 outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Entregar Bs</label>
                    <input 
                      type="number" 
                      step="any" 
                      min="0" 
                      placeholder="0.00"
                      value={cashTakenBs} 
                      onFocus={e => e.target.select()}
                      onChange={e => setCashTakenBs(e.target.value)} 
                      className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-emerald-400 font-bold font-mono focus:border-emerald-500 outline-none" 
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-editorial-border/50 pt-4 mt-2">
                <h3 className="text-sm font-bold font-serif text-editorial-text-primary mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-400" /> Adelanto Banco / Electrónico (Bóveda Digital)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Monto a Transferir / Pago Móvil</label>
                    <input 
                      type="number" 
                      step="any" 
                      min="0" 
                      placeholder="0.00"
                      value={bankTaken} 
                      onFocus={e => e.target.select()}
                      onChange={e => setBankTaken(e.target.value)} 
                      className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-cyan-400 font-bold font-mono focus:border-cyan-500 outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Moneda</label>
                    <select
                      value={bankCurrency}
                      onChange={e => setBankCurrency(e.target.value as 'USD' | 'BS')}
                      className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-cyan-400 font-bold font-mono focus:border-cyan-500 outline-none"
                    >
                      <option value="BS">Bs (PM / Transf)</option>
                      <option value="USD">USD ($ Digital)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-editorial-border">
                <button 
                  type="button" 
                  onClick={() => {
                    if (isManuallyListeningRef.current) {
                      isManuallyListeningRef.current = false;
                      setIsListening(false);
                      try { recognitionRef.current?.stop(); } catch (e) {}
                    }
                    setShowCreateModal(false);
                  }} 
                  className="px-4 py-2 text-xs font-bold font-mono uppercase text-editorial-text-muted hover:text-editorial-text-primary transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Registrar Salida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
