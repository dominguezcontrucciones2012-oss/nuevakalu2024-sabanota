import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ArrowLeft, Wallet, Truck, Plus, Save, Banknote, Landmark, CircleDollarSign, Loader2, Calendar } from 'lucide-react';
import { CentralVaultBalance, Transaction } from '../../types';

interface BudgetControlViewProps {
  onBack: () => void;
  vaultBalance: CentralVaultBalance;
  exchangeRate: number;
  onAddTransaction: (tx: Partial<Transaction>) => void;
  onUpdateVault?: (updates: Partial<CentralVaultBalance>) => Promise<void>;
}

export default function BudgetControlView({
  onBack,
  vaultBalance,
  exchangeRate,
  onAddTransaction,
  onUpdateVault
}: BudgetControlViewProps) {
  const [activeTab, setActiveTab] = useState<'debts' | 'trips'>('debts');

  // Debts State
  const [debts, setDebts] = useState<any[]>([]);
  const [loadingDebts, setLoadingDebts] = useState(true);
  
  // Trips State
  const [trips, setTrips] = useState<any[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);

  // Load Debts
  useEffect(() => {
    const q = query(collection(db, 'business_debts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDebts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingDebts(false);
    });
    return () => unsubscribe();
  }, []);

  // Load Trips
  useEffect(() => {
    const q = query(collection(db, 'vehicle_trips'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingTrips(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="h-full flex flex-col bg-editorial-bg text-editorial-text-primary p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="p-2 hover:bg-editorial-card rounded-full transition-colors text-editorial-text-muted hover:text-amber-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-serif font-black uppercase tracking-wider text-amber-500">
            Control Presupuestario
          </h2>
          <p className="text-xs text-editorial-text-muted font-sans mt-1">
            Gestión de pasivos del negocio y bitácora logística
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-editorial-border">
        <button
          onClick={() => setActiveTab('debts')}
          className={`pb-3 px-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'debts'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Compromisos y Deudas
        </button>
        <button
          onClick={() => setActiveTab('trips')}
          className={`pb-3 px-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'trips'
              ? 'border-emerald-500 text-emerald-500'
              : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          <Truck className="w-4 h-4" />
          Logística y Viajes
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'debts' ? (
          <DebtsTab 
            debts={debts} 
            loading={loadingDebts}
            vaultBalance={vaultBalance}
            exchangeRate={exchangeRate}
            onAddTransaction={onAddTransaction}
            onUpdateVault={onUpdateVault}
          />
        ) : (
          <TripsTab 
            trips={trips} 
            loading={loadingTrips}
            vaultBalance={vaultBalance}
            exchangeRate={exchangeRate}
            onAddTransaction={onAddTransaction}
            onUpdateVault={onUpdateVault}
          />
        )}
      </div>
    </div>
  );
}

function DebtsTab({ debts, loading, vaultBalance, exchangeRate, onAddTransaction, onUpdateVault }: any) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState<string | null>(null);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-serif font-bold text-editorial-text-primary">Pasivos Activos</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-amber-500 text-black px-4 py-2 rounded font-bold text-xs uppercase tracking-wider hover:bg-amber-400 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nueva Deuda
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {debts.map(debt => (
          <div key={debt.id} className="bg-editorial-card border border-editorial-border rounded p-4 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-bold text-editorial-text-primary">{debt.concept}</h4>
                <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded uppercase tracking-wider">{debt.category}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-[10px] text-editorial-text-muted uppercase tracking-wider mb-1">Total Deuda</div>
                <div className="font-mono text-sm">${debt.totalAmount?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-editorial-text-muted uppercase tracking-wider mb-1">Saldo Pendiente</div>
                <div className="font-mono text-lg font-bold text-rose-500">${debt.pendingBalance?.toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-auto">
              <button
                onClick={() => setShowPayModal(debt.id)}
                disabled={debt.pendingBalance <= 0}
                className="w-full bg-editorial-bg border border-editorial-border hover:border-emerald-500/50 hover:bg-emerald-500/10 text-emerald-500 py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                {debt.pendingBalance <= 0 ? 'Saldada' : 'Abonar a Deuda'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <AddDebtModal onClose={() => setShowAddModal(false)} />
      )}
      
      {showPayModal && (
        <PayDebtModal 
          debt={debts.find(d => d.id === showPayModal)} 
          onClose={() => setShowPayModal(null)}
          vaultBalance={vaultBalance}
          exchangeRate={exchangeRate}
          onAddTransaction={onAddTransaction}
          onUpdateVault={onUpdateVault}
        />
      )}
    </div>
  );
}

function AddDebtModal({ onClose }: { onClose: () => void }) {
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState('Cashea');
  const [totalAmount, setTotalAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!concept || !totalAmount) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'business_debts'), {
        concept,
        category,
        totalAmount: Number(totalAmount),
        pendingBalance: Number(totalAmount),
        payments: [],
        status: 'active',
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert('Error al guardar la deuda');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-editorial-bg border border-editorial-border rounded w-full max-w-md p-6">
        <h3 className="text-xl font-serif font-bold text-amber-500 mb-6">Registrar Pasivo</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-editorial-text-muted mb-2">Concepto / Nombre</label>
            <input 
              type="text" 
              value={concept}
              onChange={e => setConcept(e.target.value)}
              className="w-full bg-editorial-card border border-editorial-border rounded p-2 text-editorial-text-primary"
              placeholder="Ej. Freezer Cashea"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-editorial-text-muted mb-2">Categoría</label>
            <select 
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-editorial-card border border-editorial-border rounded p-2 text-editorial-text-primary"
            >
              <option value="Cashea">Cashea / Crédito a Plazos</option>
              <option value="Servicios">Servicios (Luz, Internet)</option>
              <option value="Alquiler">Alquiler</option>
              <option value="Nomina">Nómina / Personal</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-editorial-text-muted mb-2">Monto Total (USD)</label>
            <input 
              type="number" 
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
              className="w-full bg-editorial-card border border-editorial-border rounded p-2 text-editorial-text-primary font-mono text-lg"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <button onClick={onClose} className="flex-1 py-2 text-editorial-text-muted hover:bg-editorial-card rounded text-xs font-bold uppercase tracking-wider">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-amber-500 text-black py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function PayDebtModal({ debt, onClose, vaultBalance, exchangeRate, onAddTransaction, onUpdateVault }: any) {
  const [amount, setAmount] = useState(debt.pendingBalance.toString());
  const [currency, setCurrency] = useState<'USD'|'VES'>('USD');
  const [method, setMethod] = useState<'usd'|'bs'|'bankUsd'|'bankBs'>('usd');
  const [saving, setSaving] = useState(false);

  const handlePay = async () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) return;
    setSaving(true);
    
    try {
      const usdAmount = currency === 'USD' ? numAmount : numAmount / exchangeRate;
      
      // Update Debt Document
      const newPending = Math.max(0, debt.pendingBalance - usdAmount);
      await updateDoc(doc(db, 'business_debts', debt.id), {
        pendingBalance: newPending,
        status: newPending <= 0 ? 'settled' : 'active',
        payments: [...(debt.payments || []), {
          amount: numAmount,
          currency,
          usdEquivalent: usdAmount,
          date: new Date().toISOString(),
          method
        }]
      });

      // Deduct from Vault
      if (onUpdateVault && vaultBalance) {
        const vaultUpdates: Partial<CentralVaultBalance> = {};
        if (method === 'usd') vaultUpdates.usd = (vaultBalance.usd || 0) - numAmount;
        if (method === 'bs') vaultUpdates.bs = (vaultBalance.bs || 0) - numAmount;
        if (method === 'bankUsd') vaultUpdates.bankUsd = (vaultBalance.bankUsd || 0) - numAmount;
        if (method === 'bankBs') vaultUpdates.bankBs = (vaultBalance.bankBs || 0) - numAmount;
        await onUpdateVault(vaultUpdates);
      }

      // Record Transaction
      onAddTransaction({
        type: 'cargo',
        isIncome: false,
        amount: numAmount,
        currency,
        method: method.includes('bank') ? 'transferencia' : 'efectivo',
        category: 'egresos_operativos',
        description: `Pago de Pasivo: ${debt.concept}`,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        destination: 'Bóveda Central'
      });

      onClose();
    } catch (e) {
      console.error(e);
      alert('Error al procesar pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-editorial-bg border border-editorial-border rounded w-full max-w-md p-6">
        <h3 className="text-xl font-serif font-bold text-emerald-500 mb-2">Abonar a Deuda</h3>
        <p className="text-sm text-editorial-text-muted mb-6">{debt.concept}</p>
        
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs uppercase tracking-wider text-editorial-text-muted mb-2">Monto</label>
              <input 
                type="number" 
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-editorial-card border border-editorial-border rounded p-2 text-editorial-text-primary font-mono text-lg"
              />
            </div>
            <div className="w-1/3">
              <label className="block text-xs uppercase tracking-wider text-editorial-text-muted mb-2">Moneda</label>
              <select 
                value={currency}
                onChange={e => setCurrency(e.target.value as any)}
                className="w-full bg-editorial-card border border-editorial-border rounded p-2 text-editorial-text-primary font-bold h-[46px]"
              >
                <option value="USD">USD</option>
                <option value="VES">VES</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-xs uppercase tracking-wider text-editorial-text-muted mb-2">Bolsillo Bóveda a Descontar</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setMethod('usd'); setCurrency('USD'); }} className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${method === 'usd' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-editorial-border text-editorial-text-muted hover:border-editorial-text-muted'}`}>
                <Banknote className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Efectivo USD</span>
              </button>
              <button onClick={() => { setMethod('bs'); setCurrency('VES'); }} className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${method === 'bs' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-editorial-border text-editorial-text-muted hover:border-editorial-text-muted'}`}>
                <CircleDollarSign className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Efectivo BS</span>
              </button>
              <button onClick={() => { setMethod('bankUsd'); setCurrency('USD'); }} className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${method === 'bankUsd' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-editorial-border text-editorial-text-muted hover:border-editorial-text-muted'}`}>
                <Landmark className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Banco USD</span>
              </button>
              <button onClick={() => { setMethod('bankBs'); setCurrency('VES'); }} className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${method === 'bankBs' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-editorial-border text-editorial-text-muted hover:border-editorial-text-muted'}`}>
                <Landmark className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Banco BS</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <button onClick={onClose} className="flex-1 py-2 text-editorial-text-muted hover:bg-editorial-card rounded text-xs font-bold uppercase tracking-wider">Cancelar</button>
          <button onClick={handlePay} disabled={saving} className="flex-1 bg-emerald-500 text-black py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Confirmar Pago
          </button>
        </div>
      </div>
    </div>
  );
}

function TripsTab({ trips, loading, vaultBalance, exchangeRate, onAddTransaction, onUpdateVault }: any) {
  const [showAddModal, setShowAddModal] = useState(false);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-serif font-bold text-editorial-text-primary">Bitácoras Semanales</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-emerald-500 text-black px-4 py-2 rounded font-bold text-xs uppercase tracking-wider hover:bg-emerald-400 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nueva Semana
        </button>
      </div>

      <div className="grid gap-4">
        {trips.map(trip => (
          <div key={trip.id} className="bg-editorial-card border border-editorial-border rounded p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-emerald-500" />
                <h4 className="font-bold text-editorial-text-primary text-lg">{trip.title}</h4>
              </div>
              <span className="text-xs font-mono bg-editorial-bg px-2 py-1 rounded text-editorial-text-muted">{trip.entries?.length || 0} Viajes</span>
            </div>
            
            {/* Minimal display for now */}
            <div className="text-sm text-editorial-text-muted">
              Total Gastos Acumulados: <span className="font-mono text-emerald-500">${(trip.totalExpenses || 0).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <AddTripWeekModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

function AddTripWeekModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'vehicle_trips'), {
        title,
        entries: [],
        totalExpenses: 0,
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-editorial-bg border border-editorial-border rounded w-full max-w-md p-6">
        <h3 className="text-xl font-serif font-bold text-emerald-500 mb-6">Nueva Semana de Logística</h3>
        
        <div>
          <label className="block text-xs uppercase tracking-wider text-editorial-text-muted mb-2">Título / Semana</label>
          <input 
            type="text" 
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-editorial-card border border-editorial-border rounded p-2 text-editorial-text-primary"
            placeholder="Ej. Semana 23/08/2026 - 30/08/2026"
          />
        </div>

        <div className="flex gap-4 mt-8">
          <button onClick={onClose} className="flex-1 py-2 text-editorial-text-muted hover:bg-editorial-card rounded text-xs font-bold uppercase tracking-wider">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-emerald-500 text-black py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
