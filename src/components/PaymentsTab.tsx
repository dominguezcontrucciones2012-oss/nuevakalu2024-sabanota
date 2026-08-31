import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../services/localApi';
import React, { useState, useEffect } from 'react';
import { CreditCard, Check, Copy, ArrowRight, Banknote, X, CheckCircle, Clock, XCircle, Image as ImageIcon } from 'lucide-react';
import { ClientProfile, DebtInstallment, Transaction } from '../types';

interface PaymentsTabProps {
  bcvRate: number;
  clientData: ClientProfile;
  onNavigateTab?: (tab: any) => void;
  onAddNotification?: (msg: string, type: 'success'|'info'|'warning') => void;
}

export default function PaymentsTab({
  bcvRate,
  clientData,
  onNavigateTab,
  onAddNotification
}: PaymentsTabProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtInstallment | null>(null);
  const [selectedBank, setSelectedBank] = useState<'0102' | '0134'>('0102');
  const [paymentType, setPaymentType] = useState<'cuota' | 'venta_completa' | 'parcial'>('cuota');
  
  // Real-time Data
  const [debtList, setDebtList] = useState<DebtInstallment[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!clientData?.id) return;
    // 1. Escuchar Cuotas Pendientes
    const unsubDebts = onCollectionSnapshot('installments', (data) => {
      const debts = data.filter((d: any) => d.clientId === clientData.id && d.status === 'pending') as DebtInstallment[];
      // Sort by due date
      debts.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      setDebtList(debts);
    });

    // 2. Escuchar Historial de Pagos
    const unsubPayments = onCollectionSnapshot('transactions', (data) => {
      const payments = data.filter((d: any) => d.clientId === clientData.id && d.category === 'ingresos_cobranza') as Transaction[];
      // Sort desc
      payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPaymentHistory(payments);
    });

    return () => {
      unsubDebts();
      unsubPayments();
    };
  }, [clientData?.id]);

  // Modal forms
  const [paymentAmountBs, setPaymentAmountBs] = useState<string>('');
  const [reference, setReference] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  
  // Feedback
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  const phoneStr = '04243068286';
  const idStr = 'V-11120033';

  const handleCopy = (text: string, setCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openPaymentModal = (debt: DebtInstallment) => {
    setSelectedDebt(debt);
    const safeSingleUSD = Number((debt as any).amountUSD) || Number(debt.amount) || 0;
    const amountBs = (safeSingleUSD * bcvRate).toFixed(2);
    setPaymentAmountBs(amountBs);
    setPaymentType('cuota');
    setReference('');
    setImageFile(null);
    setImagePreview('');
    setShowPaymentModal(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitPayment = async () => {
    if (!selectedDebt || !clientData?.id) return;

    const saleInstallments = debtList.filter(i => (i.saleId === selectedDebt.saleId || (i as any).transactionId === (selectedDebt as any).transactionId) && i.status !== 'paid');
    const isFullSalePayment = paymentType === 'venta_completa';
    
    const installmentIds = isFullSalePayment ? saleInstallments.map(i => i.id) : [selectedDebt.id];
    const notesText = isFullSalePayment 
      ? `Liquidación de Venta Completa - Ref: ${reference}`
      : `Abono a Cuota ${selectedDebt.id} - Ref: ${reference}`;
    
    const pwaPayload = {
      id: `PWA-PAGO-${Date.now()}`,
      type: 'cliente',
      entityId: clientData.id,
      entityName: clientData.name,
      amount: Number(paymentAmountBs || 0) / bcvRate,
      currency: 'USD',
      amountBs: Number(paymentAmountBs || 0),
      reference: reference,
      method: 'Pago Móvil',
      status: 'pending',
      date: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      installmentIds,
      notes: notesText
    };
    
    try {
       await addLocalDoc('pwa_payments', pwaPayload);
       
       // Update installment status
       const updatePromises = installmentIds.map(id => 
          updateLocalDoc('installments', id, { status: 'in_review' })
       );
       await Promise.all(updatePromises);

       if (onAddNotification) onAddNotification('Pago reportado y en revisión por el cajero.', 'success');
       setShowPaymentModal(false);
    } catch (e) {
       console.error(e);
       if (onAddNotification) onAddNotification('Error al reportar pago', 'warning');
    }
  };

  const currentDebt = debtList
    .filter((item: any) => item.status !== 'paid')
    .reduce((acc: number, curr: any) => acc + (Number(curr.amountUSD) || Number(curr.amount) || 0), 0);
  const debtTotalBs = Number(currentDebt * bcvRate).toFixed(2);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-zinc-950 pb-20 animate-fade-in text-white overflow-y-auto">
      
      {/* Header Overview */}
      <div className="p-5 bg-gradient-to-b from-emerald-900/40 to-zinc-950 border-b border-zinc-900">
        <h2 className="text-xl font-black mb-1">Pagos y Deudas</h2>
        <p className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase mb-6">Tasa BCV: {bcvRate.toFixed(2)} Bs/USD</p>
        
        <div className="bg-zinc-900/80 border border-emerald-500/30 rounded-3xl p-6 shadow-[0_0_30px_rgba(16,185,129,0.1)] relative overflow-hidden text-center">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full"></div>
          <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2">Total Pendiente</p>
          <h3 className="text-4xl font-black text-white">${Number(currentDebt || 0).toFixed(2)}</h3>
          <p className="text-sm text-zinc-400 mt-1 font-mono">≈ Bs. {debtTotalBs}</p>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Active Debts List */}
        <div>
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-500" />
            Cuotas Activas
          </h3>
          
          <div className="space-y-3">
            {debtList.length === 0 ? (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
                <p className="text-xs text-zinc-400">No tienes deudas pendientes</p>
              </div>
            ) : (
              debtList.map(debt => (
                <div key={debt.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-3 relative overflow-hidden">
                  <div className="flex justify-between items-start z-10">
                    <div>
                      <h4 className="font-bold text-sm text-zinc-100">Abono a Crédito</h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Vence: {new Date(debt.dueDate).toLocaleDateString('es-ES')}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-white text-lg">${Number(debt.amount || 0).toFixed(2)}</p>
                      <p className="text-[9px] text-zinc-500 font-mono">Bs. {Number(debt.amount * bcvRate).toFixed(2)}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => openPaymentModal(debt)}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold uppercase tracking-widest text-[10px] py-2.5 rounded-xl transition-all z-10"
                  >
                    Pagar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Payment History */}
        <div>
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-500" />
            Historial de Pagos
          </h3>
          
          <div className="space-y-2">
            {paymentHistory.length === 0 ? (
              <p className="text-center text-[10px] text-zinc-500 py-4 font-mono">Sin historial</p>
            ) : (
              paymentHistory.map(hist => (
                <div key={hist.id} className="flex justify-between items-center bg-zinc-900/50 border border-zinc-800 p-3 rounded-xl">
                  <div className="flex items-center gap-3">
                    {(hist.status === 'approved' || hist.status === 'Completado') && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                    {(hist.status === 'pending_approval' || hist.status === 'Pendiente') && <Clock className="w-6 h-6 text-amber-500" />}
                    {hist.status === 'rejected' && <XCircle className="w-6 h-6 text-red-500" />}
                    
                    <div>
                      <p className="text-xs font-bold text-zinc-200">{new Date(hist.date).toLocaleDateString('es-ES')}</p>
                      <p className={`text-[9px] uppercase tracking-wider font-bold ${
                        (hist.status === 'approved' || hist.status === 'Completado') ? 'text-emerald-500' :
                        (hist.status === 'pending_approval' || hist.status === 'Pendiente') ? 'text-amber-500' : 'text-red-500'
                      }`}>
                        {hist.status === 'approved' || hist.status === 'Completado' ? 'Aprobado' :
                         hist.status === 'pending_approval' || hist.status === 'Pendiente' ? 'En Revisión' : 'Rechazado'}
                      </p>
                    </div>
                  </div>
                  <p className="font-black text-sm text-white">${Number(hist.amount || 0).toFixed(2)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Immersive Payment Modal */}
      {showPaymentModal && selectedDebt && (() => {
        const saleInstallments = debtList.filter(i => (i.saleId === selectedDebt.saleId || (i as any).transactionId === (selectedDebt as any).transactionId) && i.status !== 'paid');
        const saleTotalUSD = saleInstallments.reduce((acc, curr) => acc + (Number((curr as any).amountUSD) || Number(curr.amount) || 0), 0);
        const safeSingleUSD = Number((selectedDebt as any).amountUSD) || Number(selectedDebt.amount) || 0;
        
        return (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in slide-in-from-bottom duration-300 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Banknote className="w-5 h-5 text-emerald-500" />
              Reportar Pago Móvil
            </h2>
            <button onClick={() => setShowPaymentModal(false)} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-5 space-y-6 pb-32">
            {/* Step 1: Select Bank */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">1. Banco Destino</label>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setSelectedBank('0102')}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                    selectedBank === '0102' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <span className="font-black text-sm">Venezuela</span>
                  <span className="text-[9px] text-slate-400 font-mono">0102</span>
                </button>
                <button 
                  onClick={() => setSelectedBank('0134')}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                    selectedBank === '0134' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <span className="font-black text-sm">Banesco</span>
                  <span className="text-[9px] text-slate-400 font-mono">0134</span>
                </button>
              </div>
            </div>

            {/* Step 2: Account Info */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">2. Datos a transferir</label>
              
              <div 
                onClick={() => handleCopy(phoneStr, setCopiedPhone)}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center active:scale-[0.98] transition-transform cursor-pointer"
              >
                <div>
                  <p className="text-[9px] text-slate-500 uppercase font-bold">Teléfono</p>
                  <p className="text-sm font-mono text-white">{phoneStr}</p>
                </div>
                {copiedPhone ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
              </div>

              <div 
                onClick={() => handleCopy(idStr, setCopiedId)}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center active:scale-[0.98] transition-transform cursor-pointer"
              >
                <div>
                  <p className="text-[9px] text-slate-500 uppercase font-bold">Cédula de Identidad</p>
                  <p className="text-sm font-mono text-white">{idStr}</p>
                </div>
                {copiedId ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
              </div>
            </div>

            {/* Step 3: Amount Type */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">3. Monto del Pago</label>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    setPaymentType('cuota');
                    const safeRate = Number(bcvRate) || 36.50;
                    const amountBs = (safeSingleUSD * safeRate).toFixed(2);
                    setPaymentAmountBs(amountBs);
                    handleCopy(amountBs, setCopiedAmount);
                  }}
                  className={`py-3 px-3 rounded-xl text-xs font-bold transition-all flex justify-between items-center ${
                    paymentType === 'cuota' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>PAGAR CUOTA</span>
                  <span className="font-black">Bs. {(safeSingleUSD * (Number(bcvRate) || 36.50)).toFixed(2)}</span>
                </button>
                <button 
                  onClick={() => {
                    setPaymentType('venta_completa');
                    const safeRate = Number(bcvRate) || 36.50;
                    const amountBs = (saleTotalUSD * safeRate).toFixed(2);
                    setPaymentAmountBs(amountBs);
                    handleCopy(amountBs, setCopiedAmount);
                  }}
                  className={`py-3 px-3 rounded-xl text-xs font-bold transition-all flex justify-between items-center ${
                    paymentType === 'venta_completa' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>PAGAR VENTA COMPLETA</span>
                  <span className="font-black">Bs. {(saleTotalUSD * (Number(bcvRate) || 36.50)).toFixed(2)}</span>
                </button>
              </div>

              <div className="relative mt-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-emerald-500">Bs.</span>
                <input
                  type="number"
                  placeholder="0.00"
                  disabled={paymentType === 'cuota' || paymentType === 'venta_completa'}
                  value={paymentAmountBs}
                  onChange={(e) => setPaymentAmountBs(e.target.value)}
                  className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-4 pl-12 pr-12 text-2xl font-black text-white focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-80"
                />
                <button 
                  onClick={() => handleCopy(paymentAmountBs, setCopiedAmount)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1"
                >
                  {copiedAmount ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Step 4: Reference & Image */}
            <div className="space-y-4 pt-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">4. Datos del Pago</label>
              
              <input
                type="text"
                placeholder="Últimos 6 dígitos de la referencia"
                maxLength={6}
                value={reference}
                onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-900 border-2 border-slate-800 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600"
              />

              <div className="relative">
                {imagePreview ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-slate-800 group">
                    <img src={imagePreview} alt="Capture" className="w-full h-32 object-cover opacity-80" />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setImageFile(null); setImagePreview(''); }}
                        className="bg-red-500 text-white px-4 py-2 rounded-full text-xs font-bold uppercase shadow-lg"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 hover:bg-slate-900/50 transition-colors">
                    <ImageIcon className="w-8 h-8 text-slate-500 mb-2" />
                    <span className="text-xs font-bold text-slate-300">Adjuntar Captura de Pantalla</span>
                    <span className="text-[9px] text-slate-500 mt-1">JPG, PNG</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                )}
              </div>
            </div>

          </div>

          {/* Fixed Bottom Action */}
          <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent">
            <button 
              disabled={!paymentAmountBs || !reference || Number(paymentAmountBs) <= 0 || reference.length < 4}
              onClick={submitPayment}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black uppercase rounded-2xl text-sm tracking-widest transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:shadow-none flex items-center justify-center gap-2"
            >
              Enviar Comprobante a Caja <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
