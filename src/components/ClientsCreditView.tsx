import React, { useState } from 'react';
import { ClientProfile } from '../types';
import { Users, Search, Plus, CreditCard, Award, BadgeAlert, Coins, Phone, Mail, FileCheck, Eye, Clock, X } from 'lucide-react';

interface ClientsCreditViewProps {
  clients: ClientProfile[];
  exchangeRate?: number;
  salesHistory?: any[];
  onAddClient: (client: Omit<ClientProfile, 'id' | 'loyaltyPoints' | 'outstandingDebt'>) => void;
  onUpdateClient?: (id: string, updates: Partial<ClientProfile>) => void;
  onRecordDebtPayment: (clientId: string, amount: number, method: string, notes?: string, paymentBreakdown?: any) => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
}

export default function ClientsCreditView({
  clients,
  exchangeRate = 42.50,
  salesHistory = [],
  onAddClient,
  onUpdateClient,
  onRecordDebtPayment,
  onAddNotification
}: ClientsCreditViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'receivables'>('directory');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Client States
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState<'Bronce' | 'Plata' | 'Oro' | 'VIP'>('Bronce');
  const [cedula, setCedula] = useState('');
  const [address, setAddress] = useState('');
  const [birthday, setBirthday] = useState('');
  const [pin, setPin] = useState('');

  // Edit states
  const [editingClient, setEditingClient] = useState<ClientProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editCedula, setEditCedula] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editTier, setEditTier] = useState<'Bronce' | 'Plata' | 'Oro' | 'VIP'>('Bronce');

  // Pay Debt States
  const [payingClientId, setPayingClientId] = useState<string | null>(null);
  
  // Multipago States
  const [payCashUsd, setPayCashUsd] = useState<string>('');
  const [payCashBs, setPayCashBs] = useState<string>('');
  const [payPagoMovil, setPayPagoMovil] = useState<string>('');
  const [refPagoMovil, setRefPagoMovil] = useState<string>('');
  const [payPos, setPayPos] = useState<string>('');
  const [refPos, setRefPos] = useState<string>('');
  const [payBiopago, setPayBiopago] = useState<string>('');
  const [refBiopago, setRefBiopago] = useState<string>('');

  // History Modal States
  const [selectedHistoryClientId, setSelectedHistoryClientId] = useState<string | null>(null);

  const calculatedAmount = parseFloat(
    (
      (parseFloat(payCashUsd) || 0) +
      ((parseFloat(payCashBs) || 0) +
        (parseFloat(payPagoMovil) || 0) +
        (parseFloat(payPos) || 0) +
        (parseFloat(payBiopago) || 0)) /
        exchangeRate
    ).toFixed(2)
  );

  const openEditModal = (c: ClientProfile) => {
    setEditingClient(c);
    setEditName(c.name || '');
    setEditCedula(c.cedula || c.rfc || '');
    setEditPhone(c.phone || '');
    setEditEmail(c.email || '');
    setEditAddress(c.address || '');
    setEditBirthday(c.birthday || '');
    setEditPin(c.pin || '');
    setEditTier(c.tier || 'Bronce');
  };

  const handleUpdateClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !onUpdateClient) return;
    
    const ced4 = editCedula.length >= 4 ? editCedula.slice(-4) : '';
    const ph = editingClient.phone ? editingClient.phone.replace(/\D/g, '') : '';
    const ph4 = ph.length >= 4 ? ph.slice(-4) : '0000';
    
    onUpdateClient(editingClient.id, {
      name: editName,
      cedula: editCedula,
      rfc: editCedula,
      phone: editPhone,
      email: editEmail,
      address: editAddress,
      birthday: editBirthday,
      pin: editPin || (editCedula ? ced4 : ph4),
      tier: editTier
    });
    setEditingClient(null);
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    
    const ced4 = cedula.length >= 4 ? cedula.slice(-4) : '';
    const ph = phone ? phone.replace(/\D/g, '') : '';
    const ph4 = ph.length >= 4 ? ph.slice(-4) : '0000';
    
    onAddClient({
      name,
      email,
      phone,
      tier,
      cedula,
      rfc: cedula,
      address,
      birthday,
      pin: pin || (cedula ? ced4 : ph4)
    });
    onAddNotification(`Perfil de cliente ${name} registrado con éxito.`, 'success');
    setName('');
    setEmail('');
    setPhone('');
    setTier('Bronce');
    setCedula('');
    setAddress('');
    setBirthday('');
    setPin('');
    setShowAddForm(false);
  };

  const handlePayDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingClientId) return;
    
    const client = clients.find(c => c.id === payingClientId);
    if (!client) return;

    if (calculatedAmount <= 0) {
      onAddNotification('El monto del abono debe ser mayor a cero.', 'warning');
      return;
    }

    if (calculatedAmount > client.outstandingDebt + 0.5) { // allow small margin due to rate
      onAddNotification('El monto excede el adeudo del cliente.', 'warning');
      return;
    }

    const cashBs = parseFloat(payCashBs) || 0;
    const pm = parseFloat(payPagoMovil) || 0;
    const ptv = parseFloat(payPos) || 0;
    const bio = parseFloat(payBiopago) || 0;
    const cashUsd = parseFloat(payCashUsd) || 0;

    let primaryMethod = 'Efectivo';
    if (pm > 0 && ptv === 0 && bio === 0 && cashBs === 0 && cashUsd === 0) primaryMethod = 'Transferencia';
    else if (ptv > 0 && pm === 0 && bio === 0 && cashBs === 0 && cashUsd === 0) primaryMethod = 'Tarjeta';
    else if ((cashBs > 0 || cashUsd > 0) && pm === 0 && ptv === 0 && bio === 0) primaryMethod = 'Efectivo';
    else primaryMethod = 'Múltiple';

    const refDetails = [
      pm > 0 ? `PM:${refPagoMovil}` : '',
      ptv > 0 ? `PUNTO:${refPos}` : '',
      bio > 0 ? `BIO:${refBiopago}` : ''
    ].filter(Boolean).join(' | ');

    const breakdown = {
      cashUsd,
      cashBs,
      pagoMovilBs: pm,
      puntoBs: ptv,
      biopagoBs: bio,
      changeUsd: 0,
      changeBs: 0,
      debtUsd: 0
    };

    onRecordDebtPayment(payingClientId, calculatedAmount, primaryMethod, refDetails, breakdown);
    onAddNotification('Abono registrado con éxito en el Arqueo de Caja.', 'success');
    
    setPayingClientId(null);
    setPayCashUsd('');
    setPayCashBs('');
    setPayPagoMovil('');
    setRefPagoMovil('');
    setPayPos('');
    setRefPos('');
    setPayBiopago('');
    setRefBiopago('');
  };

  // Filter clients
  const filteredClients = clients.filter(c => {
    try {
      return (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
             (c.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
             (c.phone || '').includes(searchQuery);
    } catch (e) {
      return false;
    }
  });

  const clientsWithDebt = clients.filter(c => (c.outstandingDebt || 0) > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* View Header with Toggle tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-editorial-border/60 pb-4">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveSubTab('directory')}
            className={`pb-2.5 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
              activeSubTab === 'directory' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
            }`}
          >
            Directorio de Clientes
          </button>
          <button
            onClick={() => setActiveSubTab('receivables')}
            className={`pb-2.5 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
              activeSubTab === 'receivables' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
            }`}
          >
            Cuentas por Cobrar
          </button>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase flex items-center gap-1.5 hover:brightness-110 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Registrar Cliente
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateClient} className="bg-editorial-card border border-editorial-border rounded p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-4 pb-2 border-b border-editorial-border/40 flex justify-between items-center">
            <span className="font-serif text-md font-bold text-editorial-text-primary">Registrar Cliente de Cartera</span>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-xs font-mono text-rose-400 uppercase hover:underline">Cerrar</button>
          </div>

          <div className="space-y-1.5 col-span-1 md:col-span-2">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Nombre Completo / Razón Social</label>
            <input
              type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Antonio Pérez Delgado"
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Teléfono de Contacto</label>
            <input
              type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ej: 555-019-2831"
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Clasificación / Nivel</label>
            <select
              value={tier} onChange={e => setTier(e.target.value as any)}
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="Bronce">Bronce (General)</option>
              <option value="Plata">Plata (Frecuente)</option>
              <option value="Oro">Oro (Mayorista)</option>
              <option value="VIP">VIP (Corporativo)</option>
            </select>
          </div>

          <div className="space-y-1.5 col-span-1 md:col-span-2">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Correo Electrónico</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Ej: antonio.perez@dominio.com"
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="md:col-span-4 pt-4 border-t border-editorial-border/40 flex justify-end">
            <button
              type="submit"
              className="px-6 h-10 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase hover:brightness-110 transition-all cursor-pointer"
            >
              Dar de Alta en Cartera
            </button>
          </div>
        </form>
      )}

      {activeSubTab === 'directory' && (
        <div className="space-y-4">
          {/* Search Box */}
          <div className="relative bg-editorial-card border border-editorial-border rounded p-4 flex items-center gap-3">
            <Search className="w-4 h-4 text-editorial-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, correo o teléfono..."
              className="flex-1 bg-transparent text-xs text-editorial-text-primary focus:outline-none font-sans"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((c) => {
              const hasDebt = (c.outstandingDebt || 0) > 0;
              return (
                <div key={c.id} className="bg-editorial-card border border-editorial-border rounded p-5 flex flex-col justify-between hover:border-amber-500/40 transition-all duration-300">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className={`text-[8px] font-mono font-extrabold uppercase px-2 py-0.5 rounded border ${
                        c.tier === 'VIP'
                          ? 'bg-purple-950/20 text-purple-400 border-purple-800/40'
                          : c.tier === 'Oro'
                          ? 'bg-amber-950/20 text-amber-400 border-amber-800/40'
                          : 'bg-editorial-bg text-editorial-text-muted border-editorial-border'
                      }`}>
                        {c.tier}
                      </span>
                      <span className="text-[10px] font-mono text-editorial-text-muted">ID: {c.id}</span>
                      <button onClick={() => openEditModal(c)} className="ml-2 text-[10px] text-amber-500 hover:text-amber-400">✏️ Editar</button>
                    </div>

                    <div>
                      <h4 className="font-serif text-lg font-bold text-editorial-text-primary leading-tight">{c.name}</h4>
                      <div className="flex flex-col gap-1 mt-2 text-[11px] text-editorial-text-muted">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <a href={`tel:${c.phone}`} className="hover:text-amber-500 transition-colors">{c.phone || 'Sin número'}</a>
                        </div>
                        {(c.cedula || c.rfc) && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-bold text-editorial-text-muted/60 mt-0.5">C.I / RIF:</span>
                            <span className="truncate">{c.cedula || c.rfc}</span>
                          </div>
                        )}
                        {c.address && (
                          <div className="flex items-start gap-1.5 mt-1">
                            <span className="text-[10px] font-bold text-editorial-text-muted/60 mt-0.5">Ubic:</span>
                            <span className="truncate">{c.address}</span>
                          </div>
                        )}
                        {c.birthday && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-bold text-editorial-text-muted/60">Cump:</span>
                            <span>{c.birthday}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{c.email || 'Sin correo'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-editorial-border/60 grid grid-cols-2 gap-2 text-center font-mono">
                    <div className="border-r border-editorial-border/60">
                      <span className="text-[9px] text-editorial-text-muted uppercase block">Puntos Acum.</span>
                      <div className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-0.5 mt-0.5">
                        <Award className="w-3 h-3" />
                        <span>{c.loyaltyPoints} pts</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] text-editorial-text-muted uppercase block">Saldo Deudor</span>
                      <div className={`text-xs font-bold mt-0.5 ${hasDebt ? 'text-rose-400' : 'text-editorial-text-muted/60'}`}>
                        ${(c.outstandingDebt || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSubTab === 'receivables' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main List of Debts */}
          <div className="lg:col-span-8 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <h3 className="font-serif text-xl font-bold text-editorial-text-primary">Expedientes de Créditos Activos</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase tracking-wider">
                    <th className="py-3 px-3">Cliente</th>
                    <th className="py-3 px-3 text-center">Clasificación</th>
                    <th className="py-3 px-3 text-right">Línea Utilizada</th>
                    <th className="py-3 px-3 text-center">Estado de Crédito</th>
                    <th className="py-3 px-3 text-center">Abonar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-editorial-border/60">
                  {clientsWithDebt.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-editorial-text-muted">
                        No hay saldos insolutos en cartera de clientes.
                      </td>
                    </tr>
                  ) : (
                    clientsWithDebt.map((c) => (
                      <tr key={c.id} className="hover:bg-editorial-bg/30 transition-all">
                        <td className="py-3 px-3 font-serif font-extrabold text-editorial-text-primary text-sm">{c.name}</td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 bg-editorial-bg rounded text-[10px] font-mono border border-editorial-border">
                            {c.tier}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-400">${(c.outstandingDebt || 0).toFixed(2)}</td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[8px] font-mono font-extrabold bg-rose-950/20 text-rose-400 border border-rose-800/40 uppercase">
                            Vencido / Excedido
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setSelectedHistoryClientId(c.id)}
                              className="px-2 py-1 text-[10px] text-editorial-text-muted hover:text-amber-500 border border-editorial-border hover:border-amber-500 rounded bg-editorial-card cursor-pointer transition-all"
                              title="Ver Historial"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setPayingClientId(c.id);
                                setPayCashUsd('');
                                setPayCashBs('');
                                setPayPagoMovil('');
                                setRefPagoMovil('');
                                setPayPos('');
                                setRefPos('');
                                setPayBiopago('');
                                setRefBiopago('');
                              }}
                              className="px-2.5 py-1 text-[9px] font-mono border border-editorial-border hover:border-amber-500 hover:text-amber-500 rounded bg-editorial-card cursor-pointer transition-all"
                            >
                              Recibir Pago
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pay debt modal form container */}
          <div className="lg:col-span-4 bg-editorial-card border border-editorial-border rounded p-6 space-y-4">
            <h4 className="font-serif text-lg font-bold text-editorial-text-primary">Registrar Abono a Cuenta</h4>

            {payingClientId ? (
              <form onSubmit={handlePayDebtSubmit} className="space-y-4">
                <div className="p-3.5 bg-editorial-bg border border-editorial-border rounded font-mono text-[11px] text-editorial-text-primary space-y-1">
                  <span className="text-[9px] text-editorial-text-muted uppercase">Cliente Acreedor:</span>
                  <p className="font-bold text-xs">{clients.find(c => c.id === payingClientId)?.name}</p>
                  <p className="text-rose-400 mt-1 font-bold">Adeudo Pendiente: ${(clients.find(c => c.id === payingClientId)?.outstandingDebt || 0).toFixed(2)}</p>
                </div>

                <div className="space-y-4">
                  {/* Tasa y Resumen */}
                  <div className="flex justify-between items-center text-[10px] font-mono border-b border-editorial-border/40 pb-2">
                    <span className="text-editorial-text-muted">Tasa del Día: Bs {exchangeRate}</span>
                    <span className="text-amber-500 font-bold">Total a Abonar: ${calculatedAmount.toFixed(2)}</span>
                  </div>

                  {/* Multipago Grid */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-mono text-emerald-400 uppercase">Efectivo USD</label>
                        <input type="number" value={payCashUsd} onChange={e => setPayCashUsd(e.target.value)} className="w-full h-8 px-2 bg-black/40 border border-editorial-border rounded text-xs text-editorial-text-primary focus:border-emerald-500 outline-none" placeholder="$0.00" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-mono text-emerald-400 uppercase">Efectivo Bs</label>
                        <input type="number" value={payCashBs} onChange={e => setPayCashBs(e.target.value)} className="w-full h-8 px-2 bg-black/40 border border-editorial-border rounded text-xs text-editorial-text-primary focus:border-emerald-500 outline-none" placeholder="Bs 0.00" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 p-3 bg-black/20 border border-editorial-border rounded">
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <label className="text-[9px] font-mono text-editorial-text-muted uppercase">Pago Móvil (Bs)</label>
                        <input type="number" value={payPagoMovil} onChange={e => setPayPagoMovil(e.target.value)} className="w-full h-8 px-2 bg-black/40 border border-editorial-border rounded text-xs text-editorial-text-primary focus:border-amber-500 outline-none" placeholder="Bs" />
                      </div>
                      {(parseFloat(payPagoMovil) > 0) && (
                        <input type="text" value={refPagoMovil} onChange={e => setRefPagoMovil(e.target.value)} placeholder="Referencia Pago Móvil..." className="w-full h-8 px-2 bg-black/40 border border-editorial-border rounded text-[10px] text-editorial-text-primary focus:border-amber-500 outline-none" />
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 p-3 bg-black/20 border border-editorial-border rounded">
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <label className="text-[9px] font-mono text-editorial-text-muted uppercase">Punto de Venta (Bs)</label>
                        <input type="number" value={payPos} onChange={e => setPayPos(e.target.value)} className="w-full h-8 px-2 bg-black/40 border border-editorial-border rounded text-xs text-editorial-text-primary focus:border-amber-500 outline-none" placeholder="Bs" />
                      </div>
                      {(parseFloat(payPos) > 0) && (
                        <input type="text" value={refPos} onChange={e => setRefPos(e.target.value)} placeholder="Referencia Punto..." className="w-full h-8 px-2 bg-black/40 border border-editorial-border rounded text-[10px] text-editorial-text-primary focus:border-amber-500 outline-none" />
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 p-3 bg-black/20 border border-editorial-border rounded">
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <label className="text-[9px] font-mono text-editorial-text-muted uppercase">Biopago (Bs)</label>
                        <input type="number" value={payBiopago} onChange={e => setPayBiopago(e.target.value)} className="w-full h-8 px-2 bg-black/40 border border-editorial-border rounded text-xs text-editorial-text-primary focus:border-amber-500 outline-none" placeholder="Bs" />
                      </div>
                      {(parseFloat(payBiopago) > 0) && (
                        <input type="text" value={refBiopago} onChange={e => setRefBiopago(e.target.value)} placeholder="Referencia Biopago..." className="w-full h-8 px-2 bg-black/40 border border-editorial-border rounded text-[10px] text-editorial-text-primary focus:border-amber-500 outline-none" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPayingClientId(null);
                    }}
                    className="flex-1 py-2 border border-editorial-border text-[10px] font-mono font-bold uppercase hover:bg-editorial-bg cursor-pointer text-editorial-text-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-serif font-bold uppercase cursor-pointer"
                  >
                    Confirmar Abono
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-8 text-center border border-dashed border-editorial-border rounded flex flex-col items-center justify-center p-4">
                <FileCheck className="w-8 h-8 text-editorial-text-muted/40 mb-2" />
                <p className="text-xs text-editorial-text-muted">Ningún cliente seleccionado.</p>
                <p className="text-[10px] text-editorial-text-muted/60 mt-0.5">Haga clic en "Recibir Pago" en la tabla de adeudos.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Modal */}
      {selectedHistoryClientId && (() => {
        const hClient = clients.find(c => c.id === selectedHistoryClientId);
        // Extract both sales with debt (Cargos) and abonos (Abonos)
        const cSales = salesHistory
          .filter(s => s.clientId === selectedHistoryClientId && (s.debtAmount > 0 || s.isAbono))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        
        let rollingBalance = 0;
        const timeline = cSales.map(s => {
          let movementType = 'Desconocido';
          let amount = 0;
          let method = s.paymentMethod;
          let notes = s.notes;

          if (s.isAbono) {
            movementType = 'Abono';
            amount = s.paidAmount;
            rollingBalance -= amount;
          } else if (s.debtAmount > 0) {
            movementType = 'Cargo';
            amount = s.debtAmount;
            rollingBalance += amount;
          }

          return {
            id: s.id,
            date: s.date,
            invoice: s.id,
            type: movementType,
            method: method,
            notes: notes,
            amount: amount,
            balance: rollingBalance
          };
        });

        timeline.reverse();

        return (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-editorial-card border border-amber-500/50 rounded-none w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl relative">
              <button
                onClick={() => setSelectedHistoryClientId(null)}
                className="absolute top-4 right-4 text-editorial-text-muted hover:text-amber-500 transition-colors cursor-pointer z-10"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-6 border-b border-editorial-border/60 bg-editorial-bg/50">
                <h3 className="font-serif text-xl font-bold text-editorial-text-primary flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  Línea de Tiempo de Créditos y Pagos
                </h3>
                <div className="mt-4 flex gap-8 text-sm font-mono">
                  <div>
                    <span className="text-editorial-text-muted block text-[10px] uppercase">Cliente:</span>
                    <span className="font-bold text-editorial-text-primary">{hClient?.name}</span>
                  </div>
                  <div>
                    <span className="text-editorial-text-muted block text-[10px] uppercase">Adeudo Actual Confirmado:</span>
                    <span className="font-bold text-rose-400">${(hClient?.outstandingDebt || 0).toFixed(2)} USD</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-0">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-editorial-bg sticky top-0 z-10 shadow-md">
                    <tr className="border-b border-editorial-border text-[9px] uppercase text-editorial-text-muted tracking-wider">
                      <th className="py-4 px-4">Fecha y Hora</th>
                      <th className="py-4 px-4">Recibo</th>
                      <th className="py-4 px-4">Movimiento</th>
                      <th className="py-4 px-4 text-right">Monto ($)</th>
                      <th className="py-4 px-4 text-right bg-editorial-card border-l border-editorial-border">Saldo Fiado ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-editorial-border/40">
                    {timeline.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-editorial-text-muted italic">
                          No se han encontrado compras a crédito ni abonos para este cliente.
                        </td>
                      </tr>
                    ) : (
                      timeline.map(t => {
                        const isAbono = t.type === 'Abono';
                        return (
                          <tr key={t.id} className="hover:bg-white/5 transition-colors group">
                            <td className="py-4 px-4 text-editorial-text-muted text-[10px]">{t.date}</td>
                            <td className="py-4 px-4 text-editorial-text-muted text-[10px] truncate max-w-[100px]">{t.invoice}</td>
                            <td className="py-4 px-4">
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] uppercase border font-extrabold ${isAbono ? 'bg-emerald-950/30 border-emerald-800 text-emerald-400' : 'bg-rose-950/30 border-rose-800 text-rose-400'}`}>
                                {t.type}
                              </span>
                              <div className="text-[9px] text-editorial-text-muted mt-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                Vía {t.method} {t.notes && `• ${t.notes}`}
                              </div>
                            </td>
                            <td className={`py-4 px-4 text-right font-bold text-sm ${isAbono ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isAbono ? '-' : '+'}${t.amount.toFixed(2)}
                            </td>
                            <td className="py-4 px-4 text-right font-extrabold text-amber-500 bg-editorial-card/50 border-l border-editorial-border text-sm">
                              ${Math.max(0, t.balance).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
      {/* EDIT MODAL */}
      {editingClient && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-editorial-card border border-editorial-border rounded-lg max-w-2xl w-full p-6 relative shadow-2xl">
            <button onClick={() => setEditingClient(null)} className="absolute top-4 right-4 text-editorial-text-muted hover:text-rose-500">
              <X className="w-6 h-6" />
            </button>
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary mb-6">Editar Cliente</h3>
            <form onSubmit={handleUpdateClientSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Nombre</label>
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
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Correo Electrónico</label>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Dirección</label>
                <input type="text" value={editAddress} onChange={e => setEditAddress(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Cumpleaños</label>
                <input type="date" value={editBirthday} onChange={e => setEditBirthday(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">PIN Acceso</label>
                <input type="text" maxLength={4} value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="4 dígitos" className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none font-mono tracking-widest" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Nivel (Tier)</label>
                <select value={editTier} onChange={(e: any) => setEditTier(e.target.value)} className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none">
                  <option value="Bronce">Bronce</option>
                  <option value="Plata">Plata</option>
                  <option value="Oro">Oro</option>
                  <option value="VIP">VIP</option>
                </select>
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
