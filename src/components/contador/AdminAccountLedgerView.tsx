import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, Bot, Sparkles, Mic, CheckCircle2, AlertCircle, Plus, 
  DollarSign, Filter, RefreshCw, Calendar, Eye, Trash2, Check, X,
  ShieldCheck, FileText, ArrowDownRight, ArrowUpRight, Scale, Loader2,
  Receipt, Wallet, ChevronDown, ChevronUp, Layers, CheckSquare, Clock
} from 'lucide-react';
import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../../services/localApi';
import { structureVoiceNoteWithAI, StructuredVoiceNote } from '../../services/ocrService';
import { AdminAccountEntry, LedgerEntryType, CheeseTrip, CentralVaultBalance, SupplierProfile, Transaction } from '../../types';

interface AdminAccountLedgerViewProps {
  onBack: () => void;
  exchangeRate: number;
  adminName?: string;
  vaultBalance?: CentralVaultBalance;
  cheeseTrips?: CheeseTrip[];
  suppliers?: SupplierProfile[];
  onAddNotification?: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

interface PendingVoiceValidation {
  id: string;
  rawText: string;
  structured: StructuredVoiceNote;
  date: string;
  createdAt: string;
  applied: boolean;
}

export default function AdminAccountLedgerView({
  onBack,
  exchangeRate = 45.0,
  adminName = 'Daisy Corro',
  vaultBalance,
  cheeseTrips = [],
  suppliers: initialSuppliers,
  onAddNotification
}: AdminAccountLedgerViewProps) {
  // Pestañas Principales en Móvil
  const [currentTab, setCurrentTab] = useState<'MOVIMIENTOS' | 'VOZ' | 'AUDITORIA'>('MOVIMIENTOS');

  // Estado de asientos contables
  const [entries, setEntries] = useState<AdminAccountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'GIRA' | 'GASTO' | 'PROVEEDOR' | 'BOVEDA'>('ALL');

  // Estado de proveedores y productores en tiempo real
  const [localSuppliers, setLocalSuppliers] = useState<SupplierProfile[]>(initialSuppliers || []);

  // Modales
  const [showNewEntryModal, setShowNewEntryModal] = useState(false);
  const [selectedEntryDetail, setSelectedEntryDetail] = useState<AdminAccountEntry | null>(null);

  // Estados del Validador de Notas de Voz IA
  const [isListening, setIsListening] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [currentVoiceTranscript, setCurrentVoiceTranscript] = useState('');
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<PendingVoiceValidation[]>([]);
  
  const recognitionRef = useRef<any>(null);
  const isManuallyListeningRef = useRef<boolean>(false);
  const accumulatedTranscriptRef = useRef<string>('');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const restartTimeoutRef = useRef<any>(null);

  // Limpieza al desmontar el componente
  useEffect(() => {
    return () => {
      isManuallyListeningRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Formulario Manual de Asiento y Pagos
  const [newType, setNewType] = useState<LedgerEntryType>('GASTO_MULTICANAL');
  const [newConcept, setNewConcept] = useState('');
  const [newCategory, setNewCategory] = useState<'Gira San Juan' | 'Caja Chica' | 'Proveedores' | 'Bóveda' | 'Operativo'>('Caja Chica');
  const [newAmountUsd, setNewAmountUsd] = useState('');
  const [newAmountBs, setNewAmountBs] = useState('');
  const [newIsDebit, setNewIsDebit] = useState(false);
  
  // Direccionamiento de pagos (Productores vs Proveedores vs Gasto)
  const [paymentTarget, setPaymentTarget] = useState<'GASTO_GENERAL' | 'PRODUCTOR' | 'PROVEEDOR'>('GASTO_GENERAL');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [paymentMethodType, setPaymentMethodType] = useState<'Pago Móvil' | 'Transferencia' | 'Efectivo USD' | 'Efectivo Bs'>('Pago Móvil');
  const [paymentReference, setPaymentReference] = useState('');

  // 1. Cargar Asientos, Proveedores y Bandeja de Validación en Tiempo Real
  useEffect(() => {
    const unsubLedger = onCollectionSnapshot('adminLedger', (data) => {
      const list = (data || []) as AdminAccountEntry[];
      list.sort((a, b) => (b.timestamp || new Date(b.date).getTime()) - (a.timestamp || new Date(a.date).getTime()));
      setEntries(list);
      setLoading(false);
    });

    const unsubVoicePending = onCollectionSnapshot('admin_voice_pending', (data) => {
      const list = (data || []) as PendingVoiceValidation[];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPendingVoiceNotes(list);
    });

    const unsubSuppliers = onCollectionSnapshot('suppliers', (data) => {
      if (data && Array.isArray(data)) {
        setLocalSuppliers(data as SupplierProfile[]);
      }
    });

    return () => {
      unsubLedger();
      unsubVoicePending();
      unsubSuppliers();
    };
  }, []);

  // Listas clasificadas de Productores de Queso y Proveedores de Insumos/Servicios
  const producersList = useMemo(() => {
    return localSuppliers.filter(s => s.isCheeseProducer !== false);
  }, [localSuppliers]);

  const regularSuppliersList = useMemo(() => {
    return localSuppliers.filter(s => s.isCheeseProducer === false);
  }, [localSuppliers]);

  // 2. Cálculos Financieros del Balance de la Administradora
  const totalDebitUsd = entries.reduce((acc, curr) => acc + (Number(curr.debitUsd) || 0), 0);
  const totalCreditUsd = entries.reduce((acc, curr) => acc + (Number(curr.creditUsd) || 0), 0);
  const currentNetBalanceUsd = totalDebitUsd - totalCreditUsd; // Saldo por rendir

  const formatUsd = (amt: number) => `$${(amt || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatBs = (amt: number) => `Bs. ${(amt || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // 3. Control Seguro del Micrófono (Modo Interruptor con Prevención de Bloqueos)
  const toggleVoiceRecording = async () => {
    // A. SI YA ESTÁ GRABANDO: DETENER DE FORMA LIMPIA Y ENVIAR A PROCESAR
    if (isManuallyListeningRef.current) {
      isManuallyListeningRef.current = false;
      setIsListening(false);
      
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }

      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.warn('Deteniendo recognition:', e);
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }

      const fullText = accumulatedTranscriptRef.current.trim() || currentVoiceTranscript.trim();
      if (fullText) {
        await processVoiceNoteWithGemini(fullText);
      } else {
        onAddNotification?.('No se detectó audio audible. Intenta hablar más cerca del micrófono.', 'warning');
      }
      return;
    }

    // B. SI ESTÁ APAGADO: VERIFICAR DISPOSITIVO E INICIAR
    accumulatedTranscriptRef.current = '';
    setCurrentVoiceTranscript('');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // 1. Solicitar acceso de micrófono de forma explícita y segura
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
      } catch (micErr: any) {
        console.warn('Permiso o acceso al micrófono falló:', micErr);
        isManuallyListeningRef.current = false;
        setIsListening(false);
        onAddNotification?.('Permiso de micrófono no otorgado o restringido por el navegador.', 'warning');
        return;
      }
    }

    if (!SpeechRecognition) {
      isManuallyListeningRef.current = false;
      setIsListening(false);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      onAddNotification?.('El reconocimiento de voz no está soportado en este navegador.', 'warning');
      return;
    }

    try {
      isManuallyListeningRef.current = true;
      setIsListening(true);

      const recognition = new SpeechRecognition();
      recognition.lang = 'es-VE';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

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
        const fullLive = (accumulatedTranscriptRef.current + ' ' + currentInterim).trim();
        setCurrentVoiceTranscript(fullLive);
      };

      recognition.onerror = (event: any) => {
        console.warn('Aviso del motor de voz:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
          isManuallyListeningRef.current = false;
          setIsListening(false);
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
            mediaStreamRef.current = null;
          }
          onAddNotification?.('Acceso al micrófono denegado o no disponible en este entorno.', 'warning');
        }
      };

      recognition.onend = () => {
        // Reinicio protegido con delay para evitar loop de excepción InvalidStateError
        if (isManuallyListeningRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isManuallyListeningRef.current) {
              try {
                recognition.start();
              } catch (err) {
                console.warn('Reinicio de reconocimiento omitido:', err);
              }
            }
          }, 300);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Error inicializando reconocimiento:', err);
      isManuallyListeningRef.current = false;
      setIsListening(false);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      onAddNotification?.('No se pudo inicializar la captura de voz.', 'warning');
    }
  };

  // 4. Procesamiento con Gemini 3.7 a la Bandeja de Validación Previa
  const processVoiceNoteWithGemini = async (rawText: string) => {
    setIsProcessingAI(true);
    try {
      const structured = await structureVoiceNoteWithAI(rawText, exchangeRate);
      
      const newPendingItem: PendingVoiceValidation = {
        id: `VOICE-${Date.now()}`,
        rawText,
        structured,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        applied: false
      };

      await addLocalDoc('admin_voice_pending', newPendingItem);
      onAddNotification?.('✨ Dictado analizado con Gemini 3.7 y guardado en tu Bandeja de Validación.', 'success');
      setCurrentTab('VOZ');
      setCurrentVoiceTranscript('');
    } catch (err: any) {
      console.error('Error estructurando nota de voz:', err);
      onAddNotification?.('No se pudo procesar el dictado con la IA.', 'warning');
    } finally {
      setIsProcessingAI(false);
    }
  };

  // 5. Inyección Aprobada desde la Bandeja de Validación a la Ficha Global
  const handleApproveVoiceNote = async (item: PendingVoiceValidation) => {
    try {
      const amountUsd = item.structured.amountUsd || 0;
      const amountBs = item.structured.amountBs || 0;
      
      // La gran mayoría de notas de voz de la administradora son gastos/rendiciones (HABER)
      const creditUsd = amountUsd > 0 ? amountUsd : (amountBs / exchangeRate);
      const debitUsd = 0;

      const newEntry: AdminAccountEntry = {
        id: `LEDGER-${Date.now()}`,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        adminName,
        type: 'GASTO_MULTICANAL',
        concept: item.structured.title || item.structured.summary || item.rawText,
        category: (item.structured.category as any) || 'Caja Chica',
        amountUsd,
        amountBs,
        exchangeRateAtDate: exchangeRate,
        debitUsd,
        creditUsd,
        balanceAfterUsd: currentNetBalanceUsd - creditUsd,
        referenceId: item.id,
        status: 'conciliado',
        createdAt: new Date().toISOString()
      };

      await addLocalDoc('adminLedger', newEntry);
      await deleteLocalDoc('admin_voice_pending', item.id);
      onAddNotification?.('✅ Nota aprobada e inyectada exitosamente a la Ficha de la Administradora.', 'success');
    } catch (err) {
      console.error('Error inyectando nota:', err);
      onAddNotification?.('Error al inyectar asiento contable.', 'warning');
    }
  };

  const handleDeletePendingVoice = async (id: string) => {
    try {
      await deleteLocalDoc('admin_voice_pending', id);
      onAddNotification?.('Borrador eliminado de la bandeja.', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // 6. Registro Manual de Asiento Contable y Pagos a Terceros
  const handleManualEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numUsd = Number(newAmountUsd) || 0;
    const numBs = Number(newAmountBs) || 0;
    const totalEquivUsd = numUsd + (numBs / exchangeRate);

    if (totalEquivUsd <= 0) {
      onAddNotification?.('Por favor ingresa un monto válido mayor a 0.', 'warning');
      return;
    }

    const debitUsd = newIsDebit ? totalEquivUsd : 0;
    const creditUsd = !newIsDebit ? totalEquivUsd : 0;

    let finalType: LedgerEntryType = newType;
    let finalCategory = newCategory;
    let finalConcept = newConcept.trim();
    let targetSupplier: SupplierProfile | undefined = undefined;

    if (!newIsDebit) {
      if (paymentTarget === 'PRODUCTOR') {
        finalType = 'PAGO_PRODUCTOR';
        finalCategory = 'Proveedores';
        targetSupplier = localSuppliers.find(s => s.id === selectedSupplierId);
        if (!targetSupplier) {
          onAddNotification?.('Por favor selecciona el productor de queso a pagar.', 'warning');
          return;
        }
        if (!finalConcept) {
          finalConcept = `Pago a Productor: ${targetSupplier.name} (${paymentMethodType}${paymentReference ? ' Ref: ' + paymentReference.trim() : ''})`;
        }
      } else if (paymentTarget === 'PROVEEDOR') {
        finalType = 'PAGO_PROVEEDOR';
        finalCategory = 'Proveedores';
        targetSupplier = localSuppliers.find(s => s.id === selectedSupplierId);
        if (!targetSupplier) {
          onAddNotification?.('Por favor selecciona el proveedor a pagar.', 'warning');
          return;
        }
        if (!finalConcept) {
          finalConcept = `Pago a Proveedor: ${targetSupplier.name} (${paymentMethodType}${paymentReference ? ' Ref: ' + paymentReference.trim() : ''})`;
        }
      } else {
        finalType = 'GASTO_MULTICANAL';
        if (!finalConcept) {
          onAddNotification?.('Por favor ingresa el concepto o descripción del gasto.', 'warning');
          return;
        }
      }
    } else {
      if (!finalConcept) {
        finalConcept = 'Fondeo / Recibo de Fondos en Custodia';
      }
    }

    const entryId = `LEDGER-${Date.now()}`;
    const entry: AdminAccountEntry = {
      id: entryId,
      date: new Date().toISOString(),
      timestamp: Date.now(),
      adminName,
      type: finalType,
      concept: finalConcept,
      category: finalCategory,
      amountUsd: numUsd,
      amountBs: numBs,
      exchangeRateAtDate: exchangeRate,
      debitUsd,
      creditUsd,
      balanceAfterUsd: currentNetBalanceUsd + debitUsd - creditUsd,
      supplierId: targetSupplier?.id,
      supplierName: targetSupplier?.name,
      targetType: !newIsDebit ? paymentTarget : undefined,
      paymentMethod: !newIsDebit ? paymentMethodType : undefined,
      status: 'conciliado',
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Guardar asiento en adminLedger (Deducción directa de la Ficha Administradora, SIN tocar la Bóveda Central)
      await addLocalDoc('adminLedger', entry);

      // 2. Si es pago a Productor o Proveedor, impactar su libreta y registrar transacción oficial
      if (!newIsDebit && targetSupplier) {
        const currentBalanceOwed = Number(targetSupplier.balanceOwed) || 0;
        const newBalanceOwed = Math.max(0, currentBalanceOwed - totalEquivUsd);

        // Actualizar balance de cuentas por pagar en la colección 'suppliers'
        await updateLocalDoc('suppliers', targetSupplier.id, {
          balanceOwed: newBalanceOwed
        });

        // Actualizar el estado local reactivo
        setLocalSuppliers(prev => prev.map(s => s.id === targetSupplier!.id ? { ...s, balanceOwed: newBalanceOwed } : s));

        // Registrar transacción de salida en 'transactions'
        const nowMs = Date.now();
        const supTx: Transaction = {
          id: `TX-ADM-${nowMs}`,
          entity: targetSupplier.name,
          supplierId: targetSupplier.id,
          category: 'compras',
          date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          invoiceNumber: `ADM-${Math.floor(Math.random() * 9000 + 1000)}`,
          amount: totalEquivUsd,
          isIncome: false, // Resta en la libreta del productor/proveedor
          status: 'Completado',
          paymentMethod: `Ficha Administradora (${paymentMethodType})`,
          notes: `${finalConcept} [Ref: ${paymentReference || 'S/N'}] - Saldo restante en libreta: $${newBalanceOwed.toFixed(2)} USD`,
          createdAt: nowMs
        };
        await addLocalDoc('transactions', supTx);

        onAddNotification?.(`✅ Pago de $${totalEquivUsd.toFixed(2)} registrado. Libreta de ${targetSupplier.name} actualizada (Resta $${totalEquivUsd.toFixed(2)}).`, 'success');
      } else {
        onAddNotification?.('Asiento registrado exitosamente en la Ficha Administradora.', 'success');
      }

      // Limpiar formulario y cerrar modal
      setNewConcept('');
      setNewAmountUsd('');
      setNewAmountBs('');
      setSelectedSupplierId('');
      setPaymentReference('');
      setPaymentTarget('GASTO_GENERAL');
      setShowNewEntryModal(false);
    } catch (err) {
      console.error(err);
      onAddNotification?.('Error guardando asiento contable.', 'warning');
    }
  };

  // Filtrado de Asientos
  const filteredEntries = entries.filter((e) => {
    if (activeFilter === 'GIRA') return e.type === 'FONDEO_GIRA' || e.type === 'LIQUIDACION_GIRA';
    if (activeFilter === 'GASTO') return e.type === 'GASTO_MULTICANAL';
    if (activeFilter === 'PROVEEDOR') return e.type === 'PAGO_PROVEEDOR' || e.type === 'PAGO_PRODUCTOR';
    if (activeFilter === 'BOVEDA') return e.type === 'EXTRACCION_BOVEDA';
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen bg-editorial-bg text-editorial-text-primary p-3 sm:p-6 select-none animate-fade-in pb-16">
      {/* 1. Header Compacto */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-editorial-border/60">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="p-2 bg-editorial-card border border-editorial-border hover:border-amber-500 rounded-lg text-editorial-text-muted hover:text-white transition-colors cursor-pointer"
            title="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-lg sm:text-xl font-black text-white flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-amber-500" />
                Ficha Administradora
              </h1>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                {adminName}
              </span>
            </div>
            <p className="text-[11px] text-editorial-text-muted font-mono">
              Tasa BCV: {formatBs(exchangeRate)}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNewEntryModal(true)}
          className="flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold uppercase transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo Asiento / Pago</span>
          <span className="sm:hidden">Asiento / Pago</span>
        </button>
      </div>

      {/* 2. Tarjetas de Resumen Financiero (Debe / Haber / Saldo) */}
      <div className="grid grid-cols-3 gap-2 my-3">
        <div className="bg-editorial-card border border-editorial-border rounded-xl p-2.5 sm:p-4">
          <span className="text-[9px] sm:text-[10px] font-mono uppercase text-editorial-text-muted tracking-wider block">
            Debe (+)
          </span>
          <span className="text-xs sm:text-lg font-bold font-mono text-cyan-400 mt-0.5 block truncate">
            {formatUsd(totalDebitUsd)}
          </span>
          <span className="text-[8px] sm:text-[9px] text-editorial-text-muted block truncate">
            Fondos recibidos
          </span>
        </div>

        <div className="bg-editorial-card border border-editorial-border rounded-xl p-2.5 sm:p-4">
          <span className="text-[9px] sm:text-[10px] font-mono uppercase text-editorial-text-muted tracking-wider block">
            Haber (-)
          </span>
          <span className="text-xs sm:text-lg font-bold font-mono text-emerald-400 mt-0.5 block truncate">
            {formatUsd(totalCreditUsd)}
          </span>
          <span className="text-[8px] sm:text-[9px] text-editorial-text-muted block truncate">
            Pagos / Rendidos
          </span>
        </div>

        <div className={`border rounded-xl p-2.5 sm:p-4 ${
          currentNetBalanceUsd > 0.01 
            ? 'bg-amber-500/10 border-amber-500/30' 
            : currentNetBalanceUsd < -0.01 
              ? 'bg-indigo-500/10 border-indigo-500/30' 
              : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <span className="text-[9px] sm:text-[10px] font-mono uppercase text-editorial-text-muted tracking-wider block">
            Saldo Neto
          </span>
          <span className={`text-xs sm:text-lg font-bold font-mono mt-0.5 block truncate ${
            currentNetBalanceUsd > 0.01 ? 'text-amber-400' : currentNetBalanceUsd < -0.01 ? 'text-indigo-400' : 'text-emerald-400'
          }`}>
            {formatUsd(currentNetBalanceUsd)}
          </span>
          <span className="text-[8px] sm:text-[9px] font-mono text-editorial-text-muted block truncate">
            {currentNetBalanceUsd > 0.01 ? 'Por Rendir' : currentNetBalanceUsd < -0.01 ? 'A Favor' : 'Cuadrado'}
          </span>
        </div>
      </div>

      {/* 3. PESTAÑAS TÁCTILES MÓVILES (AISLADAS) */}
      <div className="flex rounded-xl bg-editorial-card border border-editorial-border p-1 mb-3 gap-1">
        <button
          onClick={() => setCurrentTab('MOVIMIENTOS')}
          className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            currentTab === 'MOVIMIENTOS'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-editorial-text-muted hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Movimientos</span>
        </button>

        <button
          onClick={() => setCurrentTab('VOZ')}
          className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer relative ${
            currentTab === 'VOZ'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-editorial-text-muted hover:text-white'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Voz IA</span>
          {pendingVoiceNotes.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-bold ml-0.5">
              {pendingVoiceNotes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setCurrentTab('AUDITORIA')}
          className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            currentTab === 'AUDITORIA'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-editorial-text-muted hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Auditoría</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* SECCIÓN 1: MOVIMIENTOS & HISTORIAL CONTABLE              */}
      {/* ========================================================= */}
      {currentTab === 'MOVIMIENTOS' && (
        <div className="space-y-3 animate-fade-in">
          {/* Filtros */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { id: 'ALL', label: 'Todo' },
              { id: 'GIRA', label: 'Giras San Juan' },
              { id: 'GASTO', label: 'Gastos / Voz' },
              { id: 'PROVEEDOR', label: 'Proveedores / Productores' },
              { id: 'BOVEDA', label: 'Bóveda' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-editorial-card border border-editorial-border text-editorial-text-muted hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-editorial-card border border-editorial-border rounded-xl overflow-hidden shadow-lg divide-y divide-editorial-border/40">
            {filteredEntries.map((entry) => {
              const isDebit = (entry.debitUsd || 0) > 0;
              const dateStr = new Date(entry.date || entry.createdAt).toLocaleDateString('es-VE', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
              });

              return (
                <div 
                  key={entry.id} 
                  onClick={() => setSelectedEntryDetail(entry)}
                  className="p-3 hover:bg-zinc-900/60 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      isDebit ? 'bg-cyan-500/10 text-cyan-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {isDebit ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                          {entry.concept}
                        </span>
                        {entry.type === 'PAGO_PRODUCTOR' && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 py-0.2 rounded font-mono shrink-0">
                            Productor
                          </span>
                        )}
                        {entry.type === 'PAGO_PROVEEDOR' && (
                          <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1 py-0.2 rounded font-mono shrink-0">
                            Proveedor
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-editorial-text-muted font-mono flex items-center gap-1.5 mt-0.5 truncate">
                        <span>{dateStr}</span>
                        <span>•</span>
                        <span className="text-zinc-400">{entry.category}</span>
                        {entry.supplierName && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400/90 truncate">{entry.supplierName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`text-xs sm:text-sm font-mono font-bold block ${
                      isDebit ? 'text-cyan-400' : 'text-emerald-400'
                    }`}>
                      {isDebit ? `+ ${formatUsd(entry.debitUsd)}` : `- ${formatUsd(entry.creditUsd)}`}
                    </span>
                    <span className="text-[9px] text-editorial-text-muted font-mono block">
                      {isDebit ? 'DEBE' : 'HABER'}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredEntries.length === 0 && !loading && (
              <div className="p-8 text-center">
                <Scale className="w-8 h-8 text-editorial-text-muted mx-auto mb-2 opacity-50" />
                <p className="text-xs font-mono text-editorial-text-muted uppercase">
                  No hay movimientos registrados.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECCIÓN 2: BANDEJA DE VALIDACIÓN Y DICTADO POR VOZ IA     */}
      {/* ========================================================= */}
      {currentTab === 'VOZ' && (
        <div className="space-y-3 animate-fade-in">
          {/* Tarjeta de Grabación Continua */}
          <div className="bg-editorial-card border border-editorial-border rounded-xl p-4 shadow-md text-center">
            <span className="text-[11px] font-mono font-bold text-indigo-400 uppercase tracking-wider block mb-2">
              Dictado Continuo Gemini 3.7
            </span>

            <button
              type="button"
              onClick={toggleVoiceRecording}
              disabled={isProcessingAI}
              className={`w-16 h-16 mx-auto rounded-full transition-all flex items-center justify-center cursor-pointer shadow-xl mb-3 ${
                isListening 
                  ? 'bg-rose-500 text-white animate-pulse ring-8 ring-rose-500/30' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
              }`}
            >
              <Mic className={`w-7 h-7 ${isListening ? 'animate-bounce' : ''}`} />
            </button>

            <p className="text-xs text-editorial-text-muted max-w-sm mx-auto">
              {isListening ? (
                <span className="text-rose-400 font-bold animate-pulse">
                  🔴 Escuchando continuo... Vuelve a tocar el botón para apagarlo y enviar a la bandeja.
                </span>
              ) : isProcessingAI ? (
                <span className="text-amber-400 font-bold flex items-center justify-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" /> Procesando audio con Gemini 3.7...
                </span>
              ) : currentVoiceTranscript ? (
                <span className="text-white italic">"{currentVoiceTranscript}"</span>
              ) : (
                'Toca el micrófono, dicta tus compras o gastos libremente y vuelve a tocarlo para detener.'
              )}
            </p>
          </div>

          {/* Bandeja de Validación Previa */}
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-mono font-bold uppercase text-editorial-text-muted">
                Bandeja de Validación ({pendingVoiceNotes.length})
              </span>
              <span className="text-[10px] text-editorial-text-muted font-mono">Revisión previa requerida</span>
            </div>

            {pendingVoiceNotes.map((note) => {
              const totalUsd = note.structured.amountUsd || (note.structured.amountBs ? note.structured.amountBs / exchangeRate : 0);
              return (
                <div key={note.id} className="bg-editorial-card border border-editorial-border p-3.5 rounded-xl space-y-2 shadow-sm">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold font-mono text-indigo-300">
                      {note.structured.category || 'Gasto Operativo'}
                    </span>
                    <span className="text-xs font-bold font-mono text-emerald-400">
                      {formatUsd(totalUsd)}
                    </span>
                  </div>

                  <p className="text-xs text-white bg-editorial-bg p-2.5 rounded font-mono">
                    "{note.rawText}"
                  </p>

                  <div className="flex justify-end gap-2 pt-1 border-t border-editorial-border/30">
                    <button
                      type="button"
                      onClick={() => handleDeletePendingVoice(note.id)}
                      className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded text-xs font-mono font-bold hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveVoiceNote(note)}
                      className="px-3.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-bold font-mono uppercase transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Aprobar e Inyectar</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {pendingVoiceNotes.length === 0 && (
              <div className="p-8 text-center border border-dashed border-editorial-border rounded-xl">
                <Bot className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs font-mono text-editorial-text-muted uppercase">
                  No hay notas pendientes por validar.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECCIÓN 3: AUDITORÍA Y CIERRE                             */}
      {/* ========================================================= */}
      {currentTab === 'AUDITORIA' && (
        <div className="space-y-3 animate-fade-in">
          <div className="bg-editorial-card border border-editorial-border rounded-xl p-4 space-y-3 shadow-md text-xs font-mono">
            <div className="flex items-center gap-2 pb-2 border-b border-editorial-border/60">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="font-serif text-base font-bold text-white">Estado de Auditoría & Cierre</h3>
            </div>

            <div className="bg-editorial-bg border border-editorial-border p-3 rounded-xl space-y-2">
              <div className="flex justify-between border-b border-editorial-border/30 pb-1">
                <span className="text-editorial-text-muted">Total Fondos Recibidos (Debe):</span>
                <span className="text-cyan-400 font-bold">{formatUsd(totalDebitUsd)}</span>
              </div>
              <div className="flex justify-between border-b border-editorial-border/30 pb-1">
                <span className="text-editorial-text-muted">Total Comprobantes (Haber):</span>
                <span className="text-emerald-400 font-bold">{formatUsd(totalCreditUsd)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-white font-bold">Balance Pendiente:</span>
                <span className={`font-bold ${currentNetBalanceUsd > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {formatUsd(currentNetBalanceUsd)}
                </span>
              </div>
            </div>

            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
              <span className="font-bold text-white uppercase text-[11px] block mb-1">Diagnóstico Contable:</span>
              <p className="text-editorial-text-muted leading-relaxed">
                {currentNetBalanceUsd === 0 
                  ? '✓ La cuenta está 100% cuadrada y lista para el cierre.' 
                  : currentNetBalanceUsd > 0 
                    ? `⚠️ Quedan ${formatUsd(currentNetBalanceUsd)} bajo custodia que deben ser justificados con facturas/pagos o reintegrados a la Bóveda.`
                    : `⭐ Saldo a favor de la administradora por ${formatUsd(Math.abs(currentNetBalanceUsd))}.`}
              </p>
            </div>

            <div className="bg-editorial-bg border border-editorial-border p-3 rounded-xl space-y-1.5">
              <span className="font-bold text-white uppercase text-[11px] block mb-1">Viajes Activos En Ruta:</span>
              {cheeseTrips.filter(t => t.status === 'en_ruta').map(t => (
                <div key={t.id} className="flex justify-between text-[11px] border-b border-editorial-border/20 pb-1">
                  <span>Viaje #{t.tripNumber} ({t.clientName})</span>
                  <span className="text-amber-400 font-bold">{formatUsd(t.totalBagValueUsd || 0)}</span>
                </div>
              ))}
              {cheeseTrips.filter(t => t.status === 'en_ruta').length === 0 && (
                <p className="text-editorial-text-muted">No hay viajes en ruta pendientes.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: NUEVO ASIENTO CONTABLE / PAGO A TERCEROS            */}
      {/* ========================================================= */}
      {showNewEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-editorial-card border border-editorial-border rounded-xl p-5 w-full max-w-lg shadow-2xl my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-editorial-border/60">
              <h3 className="font-serif text-lg font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-500" />
                Registrar Asiento / Pago
              </h3>
              <button 
                onClick={() => setShowNewEntryModal(false)}
                className="text-editorial-text-muted hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualEntrySubmit} className="space-y-4 py-4 text-xs font-mono">
              {/* 1. Selección de Sentido Contable */}
              <div>
                <label className="block text-editorial-text-muted uppercase mb-1">Sentido Contable</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewIsDebit(true);
                      setPaymentTarget('GASTO_GENERAL');
                    }}
                    className={`py-2.5 px-3 rounded-lg border font-bold uppercase text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      newIsDebit 
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 ring-1 ring-cyan-500/50' 
                        : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-white'
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4 text-cyan-400" />
                    + DEBE (Recibo Fondos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewIsDebit(false)}
                    className={`py-2.5 px-3 rounded-lg border font-bold uppercase text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      !newIsDebit 
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50' 
                        : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-white'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    - HABER (Pago / Rendición)
                  </button>
                </div>
              </div>

              {/* 2. Si es HABER (Salida de dinero de la administradora): Clasificar Destino */}
              {!newIsDebit && (
                <div className="bg-editorial-bg/80 border border-editorial-border p-3 rounded-xl space-y-3">
                  <label className="block text-amber-400 uppercase font-bold text-[11px]">
                    Destino del Pago / Salida de Dinero:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentTarget('PRODUCTOR');
                        setNewCategory('Proveedores');
                        setSelectedSupplierId('');
                      }}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                        paymentTarget === 'PRODUCTOR'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-editorial-card border-editorial-border text-editorial-text-muted hover:text-white'
                      }`}
                    >
                      <span className="block text-base mb-0.5">🧀</span>
                      <span className="block text-[10px] leading-tight">Productor (Arrime)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentTarget('PROVEEDOR');
                        setNewCategory('Proveedores');
                        setSelectedSupplierId('');
                      }}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                        paymentTarget === 'PROVEEDOR'
                          ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold'
                          : 'bg-editorial-card border-editorial-border text-editorial-text-muted hover:text-white'
                      }`}
                    >
                      <span className="block text-base mb-0.5">📦</span>
                      <span className="block text-[10px] leading-tight">Proveedor (Insumos)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentTarget('GASTO_GENERAL');
                        setSelectedSupplierId('');
                      }}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                        paymentTarget === 'GASTO_GENERAL'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                          : 'bg-editorial-card border-editorial-border text-editorial-text-muted hover:text-white'
                      }`}
                    >
                      <span className="block text-base mb-0.5">🧾</span>
                      <span className="block text-[10px] leading-tight">Gasto Operativo</span>
                    </button>
                  </div>

                  {/* Selector de Productor */}
                  {paymentTarget === 'PRODUCTOR' && (
                    <div className="space-y-1.5 pt-1 animate-fade-in">
                      <label className="block text-editorial-text-muted text-[11px] uppercase">
                        Seleccionar Productor de Queso:
                      </label>
                      <select
                        required
                        value={selectedSupplierId}
                        onChange={(e) => {
                          setSelectedSupplierId(e.target.value);
                          const p = producersList.find(item => item.id === e.target.value);
                          if (p) {
                            setNewConcept(`Pago de arrime de queso a ${p.name}`);
                          }
                        }}
                        className="w-full bg-editorial-card border border-editorial-border rounded-lg p-2.5 text-white font-mono outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="">-- Seleccionar Productor --</option>
                        {producersList.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.name} (Por pagar: ${Number(prod.balanceOwed || 0).toFixed(2)})
                          </option>
                        ))}
                      </select>
                      {selectedSupplierId && (
                        <p className="text-[10px] text-amber-400">
                          ℹ️ Este pago descontará automáticamente el saldo de cuentas por pagar en la libreta del quesero.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Selector de Proveedor */}
                  {paymentTarget === 'PROVEEDOR' && (
                    <div className="space-y-1.5 pt-1 animate-fade-in">
                      <label className="block text-editorial-text-muted text-[11px] uppercase">
                        Seleccionar Proveedor (Insumos/Servicios):
                      </label>
                      <select
                        required
                        value={selectedSupplierId}
                        onChange={(e) => {
                          setSelectedSupplierId(e.target.value);
                          const s = regularSuppliersList.find(item => item.id === e.target.value);
                          if (s) {
                            setNewConcept(`Pago de insumos/servicios a ${s.name}`);
                          }
                        }}
                        className="w-full bg-editorial-card border border-editorial-border rounded-lg p-2.5 text-white font-mono outline-none focus:border-blue-500 cursor-pointer"
                      >
                        <option value="">-- Seleccionar Proveedor --</option>
                        {regularSuppliersList.map((sup) => (
                          <option key={sup.id} value={sup.id}>
                            {sup.name} (Por pagar: ${Number(sup.balanceOwed || 0).toFixed(2)})
                          </option>
                        ))}
                        {regularSuppliersList.length === 0 && (
                          <option disabled value="">No hay proveedores generales registrados</option>
                        )}
                      </select>
                    </div>
                  )}

                  {/* Método de Pago Empleado por la Administradora */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-editorial-text-muted text-[10px] uppercase mb-1">
                        Método de Pago:
                      </label>
                      <select
                        value={paymentMethodType}
                        onChange={(e) => setPaymentMethodType(e.target.value as any)}
                        className="w-full bg-editorial-card border border-editorial-border rounded-lg p-2 text-white font-mono outline-none focus:border-amber-500 cursor-pointer text-xs"
                      >
                        <option value="Pago Móvil">Pago Móvil</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="Efectivo USD">Efectivo USD</option>
                        <option value="Efectivo Bs">Efectivo Bs</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-editorial-text-muted text-[10px] uppercase mb-1">
                        Ref / Comprobante (Opcional):
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. #4928"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full bg-editorial-card border border-editorial-border rounded-lg p-2 text-white font-mono outline-none focus:border-amber-500 text-xs"
                      >
                      </input>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Concepto o Descripción */}
              <div>
                <label className="block text-editorial-text-muted uppercase mb-1">Concepto / Descripción</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Flete de hielo, viáticos, compra insumos, pago arrime..."
                  value={newConcept}
                  onChange={(e) => setNewConcept(e.target.value)}
                  className="w-full bg-editorial-bg border border-editorial-border rounded-lg p-2.5 text-white font-mono outline-none focus:border-amber-500"
                />
              </div>

              {/* 4. Categoría si es Gasto Operativo o Fondeo */}
              {(newIsDebit || paymentTarget === 'GASTO_GENERAL') && (
                <div>
                  <label className="block text-editorial-text-muted uppercase mb-1">Categoría</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-editorial-bg border border-editorial-border rounded-lg p-2.5 text-white font-mono outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="Caja Chica">Caja Chica</option>
                    <option value="Operativo">Operativo General</option>
                    <option value="Gira San Juan">Gira San Juan</option>
                    <option value="Bóveda">Bóveda</option>
                  </select>
                </div>
              )}

              {/* 5. Montos en USD y Bs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-editorial-text-muted uppercase mb-1">Monto USD ($)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newAmountUsd}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewAmountUsd(e.target.value)}
                    className="w-full bg-editorial-bg border border-editorial-border rounded-lg p-2.5 text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-editorial-text-muted uppercase mb-1">Monto Bs</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newAmountBs}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewAmountBs(e.target.value)}
                    className="w-full bg-editorial-bg border border-editorial-border rounded-lg p-2.5 text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-editorial-border/60">
                <button
                  type="button"
                  onClick={() => setShowNewEntryModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Asiento / Pago</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DETALLE DE ASIENTO CONTABLE                        */}
      {/* ========================================================= */}
      {selectedEntryDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-editorial-card border border-editorial-border rounded-xl p-5 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-editorial-border/60">
              <h3 className="font-serif text-lg font-bold text-white">Detalle de Asiento</h3>
              <button 
                onClick={() => setSelectedEntryDetail(null)}
                className="text-editorial-text-muted hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 py-4 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-editorial-text-muted">Concepto:</span>
                <span className="text-white font-bold text-right max-w-[200px]">{selectedEntryDetail.concept}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-editorial-text-muted">Tipo Asiento:</span>
                <span className="text-amber-400 font-bold">{selectedEntryDetail.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-editorial-text-muted">Categoría:</span>
                <span className="text-zinc-300 font-bold">{selectedEntryDetail.category}</span>
              </div>
              {selectedEntryDetail.supplierName && (
                <div className="flex justify-between bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  <span className="text-editorial-text-muted">Tercero Vinculado:</span>
                  <span className="text-amber-300 font-bold">{selectedEntryDetail.supplierName}</span>
                </div>
              )}
              {selectedEntryDetail.paymentMethod && (
                <div className="flex justify-between">
                  <span className="text-editorial-text-muted">Método de Pago:</span>
                  <span className="text-emerald-400 font-bold">{selectedEntryDetail.paymentMethod}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-editorial-border/30 pt-2">
                <span className="text-editorial-text-muted">Cargo (Debe):</span>
                <span className="text-cyan-400 font-bold">{formatUsd(selectedEntryDetail.debitUsd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-editorial-text-muted">Abono (Haber):</span>
                <span className="text-emerald-400 font-bold">{formatUsd(selectedEntryDetail.creditUsd)}</span>
              </div>
              <div className="flex justify-between border-t border-editorial-border/30 pt-2">
                <span className="text-editorial-text-muted">Fecha:</span>
                <span className="text-zinc-400">{new Date(selectedEntryDetail.date).toLocaleString('es-VE')}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-editorial-border/60 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEntryDetail(null)}
                className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
