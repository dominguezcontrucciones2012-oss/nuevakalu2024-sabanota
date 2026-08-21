import React, { useState } from 'react';
import { SupplierProfile, AccountBill, Transaction, CheeseProduct } from '../types';
import { Truck, Store, Phone, Plus, BadgeAlert, FileCheck, CheckCircle, ExternalLink, Calendar, Eye, Wallet, CreditCard, Inbox, X, Search, Trash2 } from 'lucide-react';
import { parseSafeDecimal } from '../utils';

interface SuppliersDebtsViewProps {
  suppliers: SupplierProfile[];
  transactions: Transaction[];
  cheeseProducts: CheeseProduct[];
  businessBalance: number;
  exchangeRate: number;
  onAddSupplier: (sup: Omit<SupplierProfile, 'id' | 'balanceOwed'>) => void;
  onUpdateSupplier?: (id: string, updates: Partial<SupplierProfile>) => void;
  onPaySupplierBill: (billId: string, supplierId: string, amount: number) => void;
  onRecordSupplierStorePayment?: (supplierId: string, amount: number, method: string, note: string, movementType: 'cargo' | 'abono') => void;
  onNetSupplierBalances?: (supplierId: string) => void;
  onPaySupplierRemainingBalance?: (supplierId: string, amount: number, paymentSource: string, note?: string) => void;
  onLoadPurchase?: (purchase: {
    supplierId: string;
    items: { productId: string; quantityKg: number; purchasePrice: number; sellingPrice: number; marginPercent: number; name: string; createNewItem?: boolean; }[];
    isCredit: boolean;
  }) => Promise<void>;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
  isSidebarOpen?: boolean;
}

export default function SuppliersDebtsView({
  suppliers,
  transactions,
  cheeseProducts,
  businessBalance,
  exchangeRate,
  onAddSupplier,
  onUpdateSupplier,
  onPaySupplierBill,
  onRecordSupplierStorePayment,
  onNetSupplierBalances,
  onPaySupplierRemainingBalance,
  onLoadPurchase,
  onAddNotification,
  isSidebarOpen = true
}: SuppliersDebtsViewProps) {
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Supplier States
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [rfc, setRfc] = useState('');
  const [isCheeseProducer, setIsCheeseProducer] = useState(true);
  const [isEmployee, setIsEmployee] = useState(false);
  const [birthday, setBirthday] = useState('');
  const [pin, setPin] = useState('');

  // Edit states
  const [editingSupplier, setEditingSupplier] = useState<SupplierProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editCedula, setEditCedula] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editIsCheeseProducer, setEditIsCheeseProducer] = useState(false);
  const [editIsEmployee, setEditIsEmployee] = useState(false);

  // New Modal System States
  // New Modal System States
  const [activeTab, setActiveTab] = useState<'proveedores' | 'libreta'>('proveedores');
  const [activeModal, setActiveModal] = useState<'historial' | 'recibir' | 'pagar' | 'abonar' | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Date filters for historial
  const [historialStartDate, setHistorialStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 15);
    return d.toISOString().split('T')[0];
  });
  const [historialEndDate, setHistorialEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [showAllTime, setShowAllTime] = useState(false);

  // Forms State for Modals
  // Recibir Queso
  const [receiveProductId, setReceiveProductId] = useState('');
  const [customProductName, setCustomProductName] = useState('');
  const [receiveKg, setReceiveKg] = useState('');
  const [receivePrice, setReceivePrice] = useState('');
  const [receivePayment, setReceivePayment] = useState('A la Libreta');
  const [createNewProduct, setCreateNewProduct] = useState(false);

  // Pago a Él (Pay Supplier)
  const [payToThemAmount, setPayToThemAmount] = useState('');
  const [payToThemCurrency, setPayToThemCurrency] = useState<'USD' | 'VES'>('USD');
  const [payToThemSource, setPayToThemSource] = useState('Efectivo / Caja Chica');

  // Abono de Él (Supplier Pays Us / Takes Credit)
  const [payToUsAmount, setPayToUsAmount] = useState('');
  const [payToUsCurrency, setPayToUsCurrency] = useState<'USD' | 'VES'>('USD');
  const [payToUsMethod, setPayToUsMethod] = useState('Efectivo / Caja Chica');
  const [payToUsNote, setPayToUsNote] = useState('');
  const [payToUsMovementType, setPayToUsMovementType] = useState<'cargo' | 'abono'>('abono');

  const openModal = (modal: 'historial' | 'recibir' | 'pagar' | 'abonar', supplierId: string) => {
    setSelectedSupplierId(supplierId);
    setActiveModal(modal);
    // Reset forms
    if (modal === 'recibir') {
      const defaultCheese = cheeseProducts.find(p => 
        p.category?.toLowerCase().includes('queso') || 
        p.category?.toLowerCase().includes('lacteo') ||
        p.name?.toLowerCase().includes('queso')
      );
      setReceiveProductId(defaultCheese ? defaultCheese.id : '');
      setCustomProductName('');
      setReceiveKg('');
      setReceivePrice('');
      setReceivePayment('A la Libreta');
      setCreateNewProduct(false);
    } else if (modal === 'pagar') {
      const s = suppliers.find(sup => sup.id === supplierId);
      setPayToThemAmount(s ? s.balanceOwed.toString() : '');
      setPayToThemCurrency('USD');
      setPayToThemSource('Efectivo / Caja Chica');

    } else if (modal === 'abonar') {
      const s = suppliers.find(sup => sup.id === supplierId);
      setPayToUsAmount('');
      setPayToThemAmount('');
      setPayToThemCurrency('USD');
      setPayToThemSource('Efectivo / Caja Chica');
      setPayToUsNote('');
      setPayToUsMovementType('abono');
    }
  };

  const openEditModal = (s: SupplierProfile) => {
    setEditingSupplier(s);
    setEditName(s.name || '');
    setEditCedula(s.cedula || s.rfc || '');
    setEditPhone(s.phone || '');
    setEditContactName(s.contactName || '');
    setEditAddress(s.address || '');
    setEditBirthday(s.birthday || '');
    setEditPin(s.pin || '');
    setEditIsCheeseProducer(s.isCheeseProducer || false);
    setEditIsEmployee(s.isEmployee || false);
  };

  const handleUpdateSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !onUpdateSupplier) return;
    
    const ced4 = editCedula.length >= 4 ? editCedula.slice(-4) : '';
    const ph = editingSupplier.phone ? editingSupplier.phone.replace(/\D/g, '') : '';
    const ph4 = ph.length >= 4 ? ph.slice(-4) : '0000';
    
    onUpdateSupplier(editingSupplier.id, {
      name: editName,
      cedula: editCedula,
      rfc: editCedula,
      phone: editPhone,
      contactName: editContactName,
      address: editAddress,
      birthday: editBirthday,
      pin: editPin || (editCedula ? ced4 : ph4),
      isCheeseProducer: editIsCheeseProducer,
      isEmployee: editIsEmployee
    });
    setEditingSupplier(null);
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    
    const ced4 = rfc.length >= 4 ? rfc.slice(-4) : '';
    const ph = phone ? phone.replace(/\D/g, '') : '';
    const ph4 = ph.length >= 4 ? ph.slice(-4) : '0000';
    
    onAddSupplier({
      name,
      contact: contactName || 'Sin contacto',
      contactName,
      phone,
      email: '',
      address,
      rfc,
      cedula: rfc,
      isCheeseProducer,
      isEmployee,
      birthday,
      pin: pin || (rfc ? ced4 : ph4)
    });
    onAddNotification(`Proveedor ${name} registrado con éxito.`, 'success');
    setName('');
    setContactName('');
    setPhone('');
    setAddress('');
    setRfc('');
    setIsCheeseProducer(true);
    setIsEmployee(false);
    setBirthday('');
    setPin('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-editorial-border/60 pb-4">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('proveedores')}
            className={`text-lg font-serif font-bold flex items-center gap-2 cursor-pointer transition-colors ${activeTab === 'proveedores' ? 'text-editorial-text-primary border-b-2 border-editorial-text-primary pb-1' : 'text-editorial-text-muted hover:text-editorial-text-primary'}`}
          >
            <Store className="w-5 h-5" /> Directorio de Proveedores
          </button>
          <button
            onClick={() => setActiveTab('libreta')}
            className={`text-lg font-serif font-bold flex items-center gap-2 cursor-pointer transition-colors ${activeTab === 'libreta' ? 'text-amber-500 border-b-2 border-amber-500 pb-1' : 'text-editorial-text-muted hover:text-amber-500'}`}
          >
            <Truck className="w-5 h-5" /> LIBRETA QUESO
          </button>
        </div>
        <div className="flex-1 max-w-md mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-editorial-text-muted" />
            <input
              type="text"
              placeholder="Buscar por nombre, contacto, RIF o ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-editorial-bg border border-editorial-border rounded text-sm text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans"
            />
          </div>
        </div>
        
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-editorial-text-primary text-editorial-bg font-mono text-xs uppercase font-bold hover:bg-editorial-text-primary/90 transition-colors cursor-pointer whitespace-nowrap"
        >
          {showAddForm ? <span>Cancelar</span> : <><Plus className="w-4 h-4" /> <span>Nuevo Proveedor</span></>}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateSupplier} className="bg-editorial-card border border-editorial-border rounded p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3 pb-2 border-b border-editorial-border/40 flex justify-between items-center">
            <span className="font-serif text-md font-bold text-editorial-text-primary">Registrar Cuenta Proveedor</span>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Nombre Empresa / Razón Social</label>
            <input
              type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Distribuidora San Juan"
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">RIF / Cédula</label>
            <input
              type="text" value={rfc} onChange={e => setRfc(e.target.value)} placeholder="Ej: J-12345678-9"
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Vendedor / Contacto</label>
            <input
              type="text" required value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Ej: Juan Pérez"
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Teléfono de Enlace</label>
            <input
              type="text" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ej: 331-290-4100"
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-3">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Dirección</label>
            <input
              type="text" required value={address} onChange={e => setAddress(e.target.value)} placeholder="Ej: Av. Principal, Local 4"
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
            />
          </div>

          <div className="space-y-2 pt-1 flex flex-col justify-center">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-editorial-text-primary">
              <input type="checkbox" checked={isCheeseProducer} onChange={e => setIsCheeseProducer(e.target.checked)} className="accent-amber-500 w-4 h-4 cursor-pointer" />
              <span>Es Productor de Queso</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-editorial-text-primary">
              <input type="checkbox" checked={isEmployee} onChange={e => setIsEmployee(e.target.checked)} className="accent-amber-500 w-4 h-4 cursor-pointer" />
              <span>Es Personal / Obrero</span>
            </label>
          </div>

                    <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Cumpleaños</label>
            <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">PIN Acceso (4 dígitos)</label>
            <input type="text" maxLength={4} value={pin} onChange={e => setPin(e.target.value)} placeholder="Autogenerado" className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono tracking-widest focus:outline-none" />
          </div>
          <div className="md:col-span-3 pt-4 border-t border-editorial-border/40 flex justify-end">
            <button
              type="submit"
              className="px-6 h-10 bg-editorial-text-primary text-editorial-bg font-serif font-bold text-xs tracking-wider uppercase hover:bg-editorial-text-primary/90 transition-all cursor-pointer"
            >
              Guardar Registro
            </button>
          </div>
        </form>
      )}

      <div className={`grid grid-cols-1 md:grid-cols-2 ${isSidebarOpen ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-6`}>
        {suppliers
          .filter(s => activeTab === 'libreta' ? s.isCheeseProducer : !s.isCheeseProducer)
          .filter(s => {
            if (!searchQuery.trim()) return true;
            const term = searchQuery.toLowerCase();
            return (
              s.name.toLowerCase().includes(term) ||
              (s.contactName && s.contactName.toLowerCase().includes(term)) ||
              (s.rfc && s.rfc.toLowerCase().includes(term)) ||
              (s.address && s.address.toLowerCase().includes(term)) ||
              s.id.toLowerCase().includes(term)
            );
          })
          .map((s) => (
          <div key={s.id} className="bg-editorial-card border border-editorial-border rounded p-4 flex flex-col justify-between hover:border-editorial-text-primary/40 transition-all duration-300">
            <div className="space-y-2">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded bg-editorial-text-primary/10 text-editorial-text-primary flex items-center justify-center font-serif text-lg font-bold border border-editorial-text-primary/30">
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="font-mono text-[9px] text-editorial-text-muted/60">ID PROV: {s.id}</span>
                <button onClick={() => openEditModal(s)} className="text-[10px] text-amber-500 hover:text-amber-400">✏️ Editar</button>
              </div>

              <div className="space-y-1">
                <h4 className="font-serif text-xl font-bold text-editorial-text-primary tracking-tight leading-tight">{s.name}</h4>
                <p className="text-xs text-editorial-text-muted font-sans mt-1">
                  <span className="text-[10px] font-mono uppercase text-editorial-text-muted/60 block mt-1.5">Vendedor:</span>
                  {s.contactName}
                </p>
                <p className="text-xs text-editorial-text-muted leading-tight font-sans">
                  <span className="text-[10px] font-mono uppercase text-editorial-text-muted/60 block mt-1.5">Ubicación:</span>
                  {s.address}
                </p>
              </div>

              {s.rfc && (
                <div className="pt-2">
                  <span className="text-[9px] font-mono uppercase text-editorial-text-muted/60">RIF / Cédula:</span>
                  <p className="text-xs font-mono text-editorial-text-primary mt-0.5">{s.rfc}</p>
                </div>
              )}
              {(s.phone || s.birthday) && (
                <div className="pt-2 border-t border-editorial-border/30 mt-2 grid grid-cols-2 gap-2">
                  {s.phone && (
                    <div>
                      <span className="text-[9px] font-mono uppercase text-editorial-text-muted/60">Teléfono:</span>
                      <p className="text-[11px] font-mono mt-0.5"><a href={`tel:${s.phone}`} className="text-amber-500 hover:text-amber-400">{s.phone}</a></p>
                    </div>
                  )}
                  {s.birthday && (
                    <div>
                      <span className="text-[9px] font-mono uppercase text-editorial-text-muted/60">Cumpleaños:</span>
                      <p className="text-[11px] font-mono mt-0.5 text-editorial-text-primary">{s.birthday}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-editorial-border/60 space-y-2">
              <div className="flex justify-between items-center bg-editorial-bg border border-editorial-border/60 rounded p-2">
                <div>
                  <span className="text-[9px] font-mono uppercase text-editorial-text-muted block leading-none mb-1">Cuentas por Pagar</span>
                  <span className={`font-mono font-bold text-xs ${s.balanceOwed > 0 ? 'text-amber-500' : 'text-editorial-text-muted/60'}`}>
                    $ {(s.balanceOwed || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                  <span className="block text-[9px] font-mono text-editorial-text-muted/80 mt-0.5">
                    Bs {(s.balanceOwed * exchangeRate).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-mono uppercase text-editorial-text-muted block leading-none mb-1">A cobrar</span>
                  <span className={`font-mono font-bold text-xs ${(s.storeDebt || 0) > 0 ? 'text-rose-400 font-extrabold' : 'text-editorial-text-muted/60'}`}>
                    $ {(s.storeDebt || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                  <span className="block text-[9px] font-mono text-editorial-text-muted/80 mt-0.5">
                    Bs {((s.storeDebt || 0) * exchangeRate).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-editorial-border/30">
                <button
                  type="button"
                  onClick={() => openModal('historial', s.id)}
                  className="py-1.5 px-2 bg-editorial-bg hover:bg-editorial-card border border-editorial-border text-[9px] font-mono font-bold uppercase rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all text-editorial-text-primary"
                >
                  <Eye className="w-3.5 h-3.5" /> Historial
                </button>
                {s.isCheeseProducer && (
                  <button
                    type="button"
                    onClick={() => openModal('recibir', s.id)}
                    className="py-1.5 px-2 bg-editorial-text-primary/10 hover:bg-editorial-text-primary/20 border border-editorial-text-primary/30 text-[9px] font-mono font-bold uppercase rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all text-editorial-text-primary"
                  >
                    <Plus className="w-3.5 h-3.5" /> Recibir Queso
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openModal('pagar', s.id)}
                  className="py-1.5 px-2 bg-editorial-bg hover:bg-editorial-card border border-editorial-border text-[9px] font-mono font-bold uppercase rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all text-editorial-text-primary"
                >
                  <Wallet className="w-3.5 h-3.5" /> Pagar a Él
                </button>
                <button
                  type="button"
                  onClick={() => openModal('abonar', s.id)}
                  className="py-1.5 px-2 bg-editorial-bg hover:bg-editorial-card border border-editorial-border text-[9px] font-mono font-bold uppercase rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all text-editorial-text-primary"
                >
                  <CreditCard className="w-3.5 h-3.5" /> Movimiento
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-editorial-border/40 flex items-center justify-between text-[10px] text-editorial-text-muted font-mono">
              <span className="uppercase text-[9px]">Enlace:</span>
              <div className="flex gap-1.5 items-center leading-none">
                <Phone className="w-3.5 h-3.5 text-amber-500/80" />
                <span>{s.phone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Panel Lateral (Drawer) de Libreta */}
      {activeModal && selectedSupplierId && (
        <>
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity cursor-pointer"
            onClick={() => setActiveModal(null)}
          />
          
          {/* Dynamic Modal/Drawer Container */}
          <div className={
            activeModal === 'historial'
              ? "fixed inset-0 m-auto h-fit max-h-[90vh] overflow-hidden w-full max-w-3xl bg-neutral-900 border border-neutral-700 shadow-2xl z-50 rounded-lg flex flex-col"
              : "fixed right-0 top-0 h-screen overflow-hidden w-full sm:w-[450px] max-w-full bg-neutral-900 border-l border-neutral-700 shadow-2xl z-50 animate-slide-left flex flex-col"
          }>
            {(() => {
              const s = suppliers.find(sup => sup.id === selectedSupplierId);
              if (!s) return null;

              if (activeModal === 'historial') {
                const supTxRaw = transactions.filter(t => t.entity.includes(s.name));
                
                // Parse dates and sort chronologically for balance calculation (oldest first)
                const sortedAllTx = supTxRaw.map(tx => {
                  const parts = tx.date.split(',')[0].split('/'); // assuming DD/MM/YYYY
                  const time = tx.date.split(',')[1]?.trim() || "00:00:00";
                  let d = new Date();
                  if (parts.length === 3) {
                    d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${time}`);
                    if (isNaN(d.getTime())) d = new Date();
                  }
                  return { ...tx, parsedDate: d };
                }).sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

                // Calculate running balance
                let currentBalance = 0;
                const txWithBalance = sortedAllTx.map(tx => {
                  let sum = 0;
                  let rest = 0;
                  
                  if (tx.isIncome) {
                    sum = tx.amount;
                    currentBalance += sum;
                  } else {
                    rest = tx.amount;
                    currentBalance -= rest;
                  }
                  
                  return {
                    ...tx,
                    sum,
                    rest,
                    runningBalance: currentBalance
                  };
                });

                // Reverse for display (newest first, or keep chronological if preferred)
                // Kardex format is usually newest last, so we can keep chronological
                
                // Apply filters
                const filteredTx = showAllTime ? txWithBalance : txWithBalance.filter(tx => {
                  const txDate = tx.parsedDate.toISOString().split('T')[0];
                  return txDate >= historialStartDate && txDate <= historialEndDate;
                });

                return (
                  <div className="flex flex-col h-full overflow-hidden w-full max-w-full">
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-neutral-700 p-5 shrink-0 bg-neutral-900">
                      <div>
                        <h3 className="font-serif text-lg font-bold text-amber-500 flex items-center gap-2"><Eye className="w-5 h-5 text-amber-500"/> Estado de Cuenta: {s.name}</h3>
                        <p className="text-[10px] font-mono text-neutral-400 mt-1 uppercase">Historial de Movimientos y Saldo Progresivo</p>
                      </div>
                      <button onClick={() => setActiveModal(null)} className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer">
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Date Filters */}
                    <div className="bg-neutral-900 p-4 border-b border-neutral-800 flex flex-wrap gap-4 items-end shrink-0">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-500 uppercase">Desde</label>
                        <input type="date" value={historialStartDate} disabled={showAllTime} onChange={e => {setHistorialStartDate(e.target.value); setShowAllTime(false);}} className="h-9 px-3 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-100 focus:border-amber-500 outline-none disabled:opacity-50" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-500 uppercase">Hasta</label>
                        <input type="date" value={historialEndDate} disabled={showAllTime} onChange={e => {setHistorialEndDate(e.target.value); setShowAllTime(false);}} className="h-9 px-3 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-100 focus:border-amber-500 outline-none disabled:opacity-50" />
                      </div>
                      <button
                        onClick={() => setShowAllTime(!showAllTime)}
                        className={`h-9 px-4 text-xs font-mono font-bold uppercase rounded border transition-colors ${showAllTime ? 'bg-amber-500 text-neutral-900 border-amber-500' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-amber-500 hover:border-amber-500'}`}
                      >
                        {showAllTime ? 'Viendo Historial Completo' : 'Ver Todo el Historial'}
                      </button>
                    </div>

                    {/* Content Table */}
                    <div className="p-0 font-sans flex-1 bg-neutral-950 overflow-x-auto max-h-[60vh] overflow-y-auto">
                      <table className="w-full min-w-[700px] text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-neutral-900 shadow-sm z-10">
                          <tr className="border-b border-neutral-800 text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                            <th className="py-3 px-4 font-normal whitespace-nowrap">Fecha</th>
                            <th className="py-3 px-4 font-normal whitespace-nowrap">Tipo</th>
                            <th className="py-3 px-4 font-normal whitespace-nowrap">Descripción</th>
                            <th className="py-3 px-4 text-right font-normal whitespace-nowrap">Suma (+)</th>
                            <th className="py-3 px-4 text-right font-normal whitespace-nowrap">Resta (-)</th>
                            <th className="py-3 px-4 text-right font-normal whitespace-nowrap">Saldo</th>
                            <th className="py-3 px-4 text-center font-normal whitespace-nowrap">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/50">
                          {filteredTx.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 text-center text-neutral-500">No hay movimientos en este periodo.</td>
                            </tr>
                          ) : (
                            filteredTx.map((tx) => {
                               let catLabel: string = tx.category;
                               if (tx.category === 'credito') catLabel = 'Consumo POS';
                               else if (tx.category === 'compras') catLabel = 'Recepción Queso';
                               
                               return (
                                 <tr key={tx.id} className="hover:bg-neutral-800/30 transition-colors">
                                   <td className="py-3 px-4 whitespace-nowrap text-neutral-300 font-mono text-[10px]">{tx.date.split(',')[0]}</td>
                                   <td className="py-3 px-4 whitespace-nowrap">
                                     <span className="inline-block px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-[10px] font-mono uppercase text-neutral-300">
                                       {catLabel}
                                     </span>
                                   </td>
                                   <td className="py-3 px-4 text-neutral-400 whitespace-nowrap">
                                     <div className="max-w-[250px] truncate" title={tx.notes || tx.paymentMethod || `Ref: ${tx.invoiceNumber}`}>
                                       {tx.notes || tx.paymentMethod || `Ref: ${tx.invoiceNumber}`}
                                     </div>
                                   </td>
                                   <td className="py-3 px-4 text-right font-mono font-bold text-amber-500 whitespace-nowrap">
                                     {tx.sum > 0 ? `+${tx.sum.toLocaleString('es-MX', {minimumFractionDigits: 2})}` : '-'}
                                   </td>
                                   <td className="py-3 px-4 text-right font-mono font-bold text-rose-500 whitespace-nowrap">
                                     {tx.rest > 0 ? `-${tx.rest.toLocaleString('es-MX', {minimumFractionDigits: 2})}` : '-'}
                                   </td>
                                   <td className="py-3 px-4 text-right font-mono font-bold text-neutral-200 whitespace-nowrap">
                                     ${tx.runningBalance.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                                   </td>
                                   <td className="py-3 px-4 text-center whitespace-nowrap">
                                      <button title="Eliminar registro (Temporalmente Deshabilitado)" className="p-1.5 text-neutral-600 hover:text-rose-500 transition-colors rounded">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                   </td>
                                 </tr>
                               );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }

              if (activeModal === 'recibir') {
                const cleanNumber = (val: string) => {
                  if (!val) return 0;
                  const cleaned = val.toString().replace(/[^0-9.,]/g, '').replace(',', '.');
                  return Number(cleaned) || 0;
                };
                const currentKg = cleanNumber(receiveKg);
                const currentPrice = cleanNumber(receivePrice);
                const calculatedSubtotal = currentKg * currentPrice;
                const calculatedSubtotalBs = calculatedSubtotal * exchangeRate;

                return (
                  <div className="flex flex-col h-full overflow-hidden">
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-neutral-700 p-5 shrink-0 bg-neutral-900">
                      <h3 className="font-serif text-lg font-bold text-amber-500 flex items-center gap-2"><Plus className="w-5 h-5"/> Compra a {s.name}</h3>
                      <button onClick={() => setActiveModal(null)} className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {/* Content */}
                    <div className="p-5 space-y-5 flex-1 overflow-y-auto">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block">Concepto / Rubro</label>
                        <select value={receiveProductId} onChange={e => {
                          setReceiveProductId(e.target.value);
                          if (e.target.value !== 'Otro') {
                            setCustomProductName('');
                            setCreateNewProduct(false);
                          }
                        }} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer">
                          <option value="">Seleccione Producto a Arrimar</option>
                          {cheeseProducts
                            .filter(p => 
                              p.category?.toLowerCase().includes('queso') || 
                              p.category?.toLowerCase().includes('lacteo') ||
                              p.name?.toLowerCase().includes('queso')
                            )
                            .map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          <option value="Otro">Otro rubro / Animal</option>
                        </select>
                        {receiveProductId === 'Otro' && (
                          <div className="space-y-2 mt-2">
                            <input type="text" value={customProductName} onChange={e => setCustomProductName(e.target.value)} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all" placeholder="Ej. Cochino, Ganado, Suero..." />
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300 hover:text-amber-500 transition-colors">
                              <input 
                                type="checkbox" 
                                checked={createNewProduct} 
                                onChange={(e) => setCreateNewProduct(e.target.checked)} 
                                className="w-4 h-4 rounded border-neutral-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-neutral-900 bg-neutral-800"
                              />
                              Registrar como nuevo ítem en el inventario
                            </label>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-4">
                        <div className="space-y-1.5 flex-1">
                          <label className="text-[10px] font-mono text-neutral-400 uppercase block">Cantidad (Kg/Unid)</label>
                          <input 
                            type="text" 
                            inputMode="decimal" 
                            value={receiveKg} 
                            onChange={(e) => setReceiveKg(e.target.value)} 
                            className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all" 
                            placeholder="0.00" 
                          />
                        </div>
                        <div className="space-y-1.5 flex-1">
                          <label className="text-[10px] font-mono text-neutral-400 uppercase block">Precio Unitario ($)</label>
                          <input 
                            type="text" 
                            inputMode="decimal" 
                            value={receivePrice} 
                            onChange={(e) => setReceivePrice(e.target.value)} 
                            className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all" 
                            placeholder="0.00" 
                          />
                        </div>
                      </div>

                      {/* Real-time Subtotal */}
                      <div className="bg-neutral-800/50 border border-neutral-700 rounded p-4 text-center">
                        <span className="text-[10px] font-mono text-neutral-400 uppercase block">Subtotal Calculado</span>
                        <span className="font-mono text-2xl font-bold text-amber-500 block mt-1">
                          $ {calculatedSubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500 mt-1 block">
                          Bs {calculatedSubtotalBs.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block">Forma de Pago</label>
                        <select value={receivePayment} onChange={e => setReceivePayment(e.target.value)} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer">
                          <option value="A la Libreta">A la Libreta (Sumar a Deuda / Cobrar Fiado)</option>
                          <option value="Efectivo / Caja Chica">Pagado en Efectivo / Caja Chica</option>
                          <option value="Pago Móvil / Banco">Pagado por Banco</option>
                        </select>
                      </div>

                      {s.storeDebt > 0 && receivePayment === 'A la Libreta' && (
                        <div className="bg-rose-950/20 border border-rose-900/50 rounded p-4 text-xs text-rose-300 font-mono leading-relaxed">
                          ⚠️ El productor debe <strong>${(s.storeDebt || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> por fiados en el POS.<br/>
                          Esta deuda será cobrada automáticamente del subtotal.
                        </div>
                      )}

                      <div className="pt-4">
                        <button
                          disabled={isSubmitting}
                          onClick={async () => {
                            if (!receiveProductId || calculatedSubtotal <= 0 || (receiveProductId === 'Otro' && !customProductName.trim())) return onAddNotification('Campos incompletos o inválidos', 'warning');
                            
                            const selectedCheese = cheeseProducts.find(p => p.id === receiveProductId);
                            const finalProductName = receiveProductId === 'Otro' ? customProductName.trim() : (selectedCheese?.name || 'Queso');
                            const payloadProductId = receiveProductId === 'Otro' ? `custom-${Date.now()}` : receiveProductId;

                            try {
                              setIsSubmitting(true);
                              if (onLoadPurchase) {
                                await onLoadPurchase({
                                  supplierId: s.id,
                                  items: [{ 
                                    productId: payloadProductId, 
                                    quantityKg: currentKg, 
                                    purchasePrice: currentPrice, 
                                    sellingPrice: 0, 
                                    marginPercent: 0, 
                                    name: finalProductName,
                                    createNewItem: createNewProduct 
                                  }],
                                  isCredit: receivePayment === 'A la Libreta'
                                });
                              }
                              onAddNotification(`Recepción de ${finalProductName} registrada correctamente.`, 'success');
                              setActiveModal(null);
                            } catch (error) {
                              onAddNotification('Error al registrar recepción', 'warning');
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-neutral-900 text-xs font-serif font-bold uppercase tracking-wider rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isSubmitting ? 'Procesando...' : 'Confirmar Recepción'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (activeModal === 'pagar') {
                const inputAmt = parseSafeDecimal(payToThemAmount) || 0;
                const usdAmount = payToThemCurrency === 'VES' ? inputAmt / exchangeRate : inputAmt;
                const isOverpaid = usdAmount > s.balanceOwed;
                const isValidAmount = inputAmt > 0 && !isOverpaid;

                return (
                  <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-neutral-700 p-5 shrink-0 bg-neutral-900">
                      <h3 className="font-serif text-lg font-bold text-amber-500 flex items-center gap-2"><Wallet className="w-5 h-5"/> Pagar a {s.name}</h3>
                      <button onClick={() => setActiveModal(null)} className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {/* Content */}
                    <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded p-4 text-center">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 block tracking-wider">Deuda Pendiente con el Productor</span>
                        <span 
                          onClick={() => {
                            setPayToThemAmount((s.balanceOwed || 0).toFixed(2));
                            setPayToThemCurrency('USD');
                          }}
                          className="font-mono text-3xl font-extrabold text-amber-500 block mt-1 cursor-pointer hover:underline hover:text-amber-400 transition-colors"
                        >
                          $ {(s.balanceOwed || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} USD
                        </span>
                        <span 
                          onClick={() => {
                            setPayToThemAmount(((s.balanceOwed || 0) * exchangeRate).toFixed(2));
                            setPayToThemCurrency('VES');
                          }}
                          className="text-xs font-mono text-amber-500/70 block mt-1 cursor-pointer hover:underline hover:text-amber-400 transition-colors"
                        >
                          Bs {((s.balanceOwed || 0) * exchangeRate).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      
                      {s.balanceOwed > 0 && (s.storeDebt || 0) > 0 && (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded p-4 flex justify-between items-center">
                           <div className="text-xs font-sans text-rose-200">
                             Él nos debe: <strong className="font-mono">${s.storeDebt?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                           </div>
                           <button onClick={() => {
                              onNetSupplierBalances?.(s.id);
                              onAddNotification('Saldos cruzados internamente.', 'info');
                              setActiveModal(null);
                           }} className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-mono text-[9px] uppercase font-bold rounded cursor-pointer transition-all">
                              Compensar Saldos
                           </button>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setPayToThemCurrency('USD');
                            setPayToThemAmount(String(s.balanceOwed));
                          }}
                          className="px-3 py-1.5 bg-neutral-800 border border-amber-500/50 hover:bg-amber-500/20 text-amber-500 text-[10px] font-mono font-bold uppercase rounded transition-colors cursor-pointer"
                        >
                          Liquidar Saldo Total
                        </button>
                      </div>

                      <div className="flex gap-4">
                        <div className="space-y-1.5 flex-[2]">
                          <label className="text-[10px] font-mono text-neutral-400 uppercase block">Monto a Pagar</label>
                          <input type="text" inputMode="decimal" value={payToThemAmount} onChange={e => setPayToThemAmount(e.target.value)} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all" placeholder="0.00" />
                        </div>
                        <div className="space-y-1.5 flex-[1]">
                          <label className="text-[10px] font-mono text-neutral-400 uppercase block">Moneda</label>
                          <select value={payToThemCurrency} onChange={e => setPayToThemCurrency(e.target.value as 'USD' | 'VES')} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer">
                            <option value="USD">Dólares ($)</option>
                            <option value="VES">Bolívares (Bs)</option>
                          </select>
                        </div>
                      </div>

                      {payToThemCurrency === 'VES' && inputAmt > 0 && (
                        <div className="text-right text-[10px] font-mono text-neutral-400">
                          Equivalente: <strong className="text-amber-500">${usdAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong> (Tasa: {exchangeRate})
                        </div>
                      )}

                      {isOverpaid && (
                        <div className="bg-rose-950/40 border border-rose-900 rounded p-3 text-xs text-rose-400 font-mono flex items-start gap-2">
                          <BadgeAlert className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>El monto ingresado no puede superar el saldo pendiente de <strong>${s.balanceOwed.toLocaleString('es-MX', { minimumFractionDigits: 2 })} USD</strong>.</span>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block">Fuente de Pago</label>
                        <select value={payToThemSource} onChange={e => setPayToThemSource(e.target.value)} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer">
                          <option value="Efectivo / Caja Chica">Efectivo / Caja Chica</option>
                          <option value="Pago Móvil / Banco">Pago Móvil / Banco</option>
                        </select>
                      </div>
                      <div className="pt-2">
                        <button
                          disabled={!isValidAmount}
                          onClick={() => {
                            if (!isValidAmount) return;
                            const note = `Liquidación de deuda a productor. Pago de ${payToThemCurrency === 'USD' ? '$' : 'Bs '}${inputAmt} ${payToThemCurrency} (Tasa: ${exchangeRate}). Fuente: ${payToThemSource}`;
                            
                            onPaySupplierRemainingBalance?.(s.id, usdAmount, payToThemSource, note);
                            onAddNotification(`Pago de $${usdAmount.toFixed(2)} USD a ${s.name} registrado exitosamente.`, 'success');
                            setActiveModal(null);
                          }}
                          className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-neutral-900 text-xs font-serif font-bold uppercase tracking-wider rounded transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Efectuar Pago
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (activeModal === 'abonar') {
                return (
                  <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-neutral-700 p-5 shrink-0 bg-neutral-900">
                      <h3 className="font-serif text-lg font-bold text-amber-500 flex items-center gap-2"><CreditCard className="w-5 h-5"/> Movimiento Libreta</h3>
                      <button onClick={() => setActiveModal(null)} className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {/* Content */}
                    <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                      <div className="bg-neutral-800 border border-neutral-700 rounded p-4 text-center">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 block tracking-wider">Él Nos Debe Actualmente</span>
                        <span 
                          onClick={() => {
                            setPayToUsAmount((s.storeDebt || 0).toFixed(2));
                            setPayToUsCurrency('USD');
                          }}
                          className="font-mono text-3xl font-extrabold text-amber-500 block mt-1 cursor-pointer hover:underline hover:text-amber-400 transition-colors"
                        >
                          $ {(s.storeDebt || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} USD
                        </span>
                        <span 
                          onClick={() => {
                            setPayToUsAmount(((s.storeDebt || 0) * exchangeRate).toFixed(2));
                            setPayToUsCurrency('VES');
                          }}
                          className="text-xs font-mono text-neutral-500 block mt-1 cursor-pointer hover:underline hover:text-amber-400 transition-colors"
                        >
                          Bs {((s.storeDebt || 0) * exchangeRate).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block">Tipo de Movimiento</label>
                        <select value={payToUsMovementType} onChange={e => setPayToUsMovementType(e.target.value as 'cargo' | 'abono')} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer">
                          <option value="cargo">Crédito / Consumo Fiado (Él saca víveres, AUMENTA la deuda)</option>
                          <option value="abono">Abono / Pago (Él paga su cuenta, DISMINUYE la deuda)</option>
                        </select>
                      </div>

                      <div className="flex gap-4">
                        <div className="space-y-1.5 flex-[2]">
                          <label className="text-[10px] font-mono text-neutral-400 uppercase block">Monto</label>
                          <input type="text" inputMode="decimal" value={payToUsAmount} onChange={e => setPayToUsAmount(e.target.value)} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all" placeholder="0.00" />
                        </div>
                        <div className="space-y-1.5 flex-[1]">
                          <label className="text-[10px] font-mono text-neutral-400 uppercase block">Moneda</label>
                          <select value={payToUsCurrency} onChange={e => setPayToUsCurrency(e.target.value as 'USD' | 'VES')} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer">
                            <option value="USD">Dólares ($)</option>
                            <option value="VES">Bolívares (Bs)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block">Método</label>
                        <select value={payToUsMethod} onChange={e => setPayToUsMethod(e.target.value)} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer">
                          <option value="Libreta de Queso">Descontar de Libreta de Queso</option>
                          <option value="Efectivo / Caja Chica">Efectivo / Caja Chica</option>
                          <option value="Pago Móvil / Banco">Pago Móvil / Banco</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block">Concepto / Referencia / Nota</label>
                        <input type="text" value={payToUsNote} onChange={e => setPayToUsNote(e.target.value)} className="w-full h-11 px-3 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all" placeholder="Ej. Víveres del día / Abono semanal" />
                      </div>
                      
                      <div className="pt-2">
                        <button
                          onClick={() => {
                            const inputAmt = parseSafeDecimal(payToUsAmount);
                            if (isNaN(inputAmt) || inputAmt <= 0) return onAddNotification('Monto inválido', 'warning');
                            const usdAmount = payToUsCurrency === 'VES' ? inputAmt / exchangeRate : inputAmt;
                            
                            onRecordSupplierStorePayment?.(s.id, usdAmount, payToUsMethod, payToUsNote, payToUsMovementType);
                            onAddNotification(`${payToUsMovementType === 'cargo' ? 'Crédito' : 'Abono'} de $${usdAmount.toFixed(2)} USD registrado correctamente.`, 'success');
                            setActiveModal(null);
                          }}
                          className={`w-full py-3 text-neutral-900 text-xs font-serif font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                            payToUsMovementType === 'cargo' 
                              ? 'bg-rose-500 hover:bg-rose-400' 
                              : 'bg-emerald-500 hover:bg-emerald-400'
                          }`}
                        >
                          Confirmar {payToUsMovementType === 'cargo' ? 'Crédito' : 'Abono'} a Libreta
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })()}
          </div>
        </>
      )}
      {/* EDIT MODAL */}
      {editingSupplier && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-editorial-card border border-editorial-border rounded-lg max-w-2xl w-full p-6 relative shadow-2xl overflow-y-auto max-h-[90vh]">
            <button onClick={() => setEditingSupplier(null)} className="absolute top-4 right-4 text-editorial-text-muted hover:text-rose-500">
              <X className="w-6 h-6" />
            </button>
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary mb-6">Editar Proveedor</h3>
            <form onSubmit={handleUpdateSupplierSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Nombre Empresa</label>
                <input type="text" required value={editName} onChange={e => setEditName(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Cédula / RIF</label>
                <input type="text" value={editCedula} onChange={e => setEditCedula(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Teléfono</label>
                <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Vendedor / Contacto</label>
                <input type="text" value={editContactName} onChange={e => setEditContactName(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Cumpleaños</label>
                <input type="date" value={editBirthday} onChange={e => setEditBirthday(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Dirección</label>
                <input type="text" value={editAddress} onChange={e => setEditAddress(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">PIN Acceso</label>
                <input type="text" maxLength={4} value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="4 dígitos" className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none font-mono tracking-widest" />
              </div>
              <div className="space-y-2 pt-1 flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-editorial-text-primary">
                  <input type="checkbox" checked={editIsCheeseProducer} onChange={e => setEditIsCheeseProducer(e.target.checked)} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                  <span>Es Productor de Queso</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-editorial-text-primary">
                  <input type="checkbox" checked={editIsEmployee} onChange={e => setEditIsEmployee(e.target.checked)} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                  <span>Es Personal / Obrero</span>
                </label>
              </div>
              <div className="md:col-span-2 pt-4 flex justify-end">
                <button type="submit" className="px-6 h-10 bg-amber-500 hover:bg-amber-400 text-editorial-bg font-serif font-bold text-xs tracking-wider uppercase rounded transition-all">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
