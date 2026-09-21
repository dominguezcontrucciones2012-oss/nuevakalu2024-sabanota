import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Check,
  Copy,
  ArrowRight,
  Banknote,
  X,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  AlertCircle,
  ShoppingBag,
  ChevronDown,
  Image as ImageIcon,
  Utensils,
  Wrench
} from 'lucide-react';
import { ClientProfile, DebtInstallment, Transaction } from '../types';
import { submitPortalClientPaymentApi } from '../services/localApi';
import {
  buildClientDebtGroups,
  formatDisplayDate,
  DebtGroup
} from '../utils/debtGrouping';
import { getVipTheme } from '../config/vipTheme';

interface PaymentsTabProps {
  bcvRate: number;
  clientData: ClientProfile;
  activeInstallments: DebtInstallment[];
  paymentHistory: Transaction[] | any[];
  allTransactions?: Transaction[];
  onNavigateTab?: (tab: any) => void;
  onAddNotification?: (msg: string, type: 'success' | 'info' | 'warning') => void;
  onPaymentReported?: () => void;
  vipCode?: string;
}

export default function PaymentsTab({
  bcvRate,
  clientData,
  activeInstallments,
  paymentHistory,
  allTransactions = [],
  onNavigateTab,
  onAddNotification,
  onPaymentReported,
  vipCode
}: PaymentsTabProps) {
  const theme = getVipTheme(vipCode);
  // Modal de reporte de pago
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtInstallment | null>(null);
  const [selectedBank, setSelectedBank] = useState<'0102' | '0134'>('0102');
  const [paymentAmountBs, setPaymentAmountBs] = useState('');
  const [reference, setReference] = useState('');
  const [notesText, setNotesText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de acordeón expandido (por groupKey interna)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedOpenDebt, setExpandedOpenDebt] = useState(false);

  // Estados de copiado
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  const phoneStr = '04243068286';
  const idStr = 'V-11120033';

  // 1. Agrupación Canónica: UNA COMPRA = UN ACORDEÓN
  // Manejo autoritativo de cliente legacy: outstandingDebt > 0 -> outstanding; sino legacy
  const outstanding = Number((clientData as any)?.outstandingDebt ?? 0);
  const legacy = Number((clientData as any)?.currentDebtUsd ?? 0);
  const clientEffectiveDebt = outstanding > 0 ? outstanding : legacy;

  const debtOverview = useMemo(() => {
    return buildClientDebtGroups({
      installments: activeInstallments,
      transactions: allTransactions,
      payments: paymentHistory,
      clientDebt: clientEffectiveDebt
    });
  }, [activeInstallments, allTransactions, paymentHistory, clientEffectiveDebt]);

  const { activeGroups, totalEffectiveDebt, openDebtAmount, hasOpenDebt, openDebtPayments } = debtOverview;

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const handleCopy = (text: string, setCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Abrir modal para una cuota específica
  const openPaymentModalForInstallment = (debt: DebtInstallment) => {
    setSelectedDebt(debt);
    const instTotal = Number((debt as any).amountUSD ?? debt.amount ?? 0);
    const instPaid = Number(debt.paidAmount ?? 0);
    const remainingUsd = Math.max(0, Math.round((instTotal - instPaid) * 100) / 100);

    const safeRate = Number(bcvRate) || 36.50;
    const amountBs = (remainingUsd * safeRate).toFixed(2);
    setPaymentAmountBs(amountBs);
    setReference('');
    setNotesText('');
    setImageFile(null);
    setImagePreview(null);
    setShowPaymentModal(true);
  };

  // Abrir modal para deuda abierta / fiado sin cuotas
  const openPaymentModalForOpenDebt = () => {
    setSelectedDebt(null);
    const safeRate = Number(bcvRate) || 36.50;
    const amountBs = (openDebtAmount * safeRate).toFixed(2);
    setPaymentAmountBs(amountBs);
    setReference('');
    setNotesText('');
    setImageFile(null);
    setImagePreview(null);
    setShowPaymentModal(true);
  };

  const MAX_CAPTURE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      if (onAddNotification) onAddNotification('Formato de comprobante no válido. Use JPG, PNG o WEBP.', 'warning');
      return;
    }

    if (file.size > MAX_CAPTURE_SIZE_BYTES) {
      if (onAddNotification) onAddNotification('El comprobante supera el tamaño máximo permitido de 4MB.', 'warning');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference || !paymentAmountBs || Number(paymentAmountBs) <= 0) {
      if (onAddNotification) onAddNotification('Por favor ingrese el monto y los últimos 6 dígitos de la referencia', 'warning');
      return;
    }

    if (!imagePreview) {
      if (onAddNotification) onAddNotification('Debes adjuntar el comprobante de pago para poder enviar la solicitud.', 'warning');
      return;
    }

    const safeRate = Number(bcvRate) || 36.50;
    const amountUsd = Math.round((Number(paymentAmountBs) / safeRate) * 100) / 100;

    // Validación de límites en cliente antes de enviar
    if (selectedDebt) {
      const instTotal = Number((selectedDebt as any).amountUSD ?? selectedDebt.amount ?? 0);
      const instPaid = Number(selectedDebt.paidAmount ?? 0);
      const remainingUsd = Math.max(0, Math.round((instTotal - instPaid) * 100) / 100);
      if (amountUsd > remainingUsd + 0.01) {
        if (onAddNotification) onAddNotification(`El monto ingresado ($${amountUsd.toFixed(2)}) supera el saldo de la cuota ($${remainingUsd.toFixed(2)})`, 'warning');
        return;
      }
    } else {
      if (amountUsd > openDebtAmount + 0.01) {
        if (onAddNotification) onAddNotification(`El monto ingresado ($${amountUsd.toFixed(2)}) supera la deuda abierta ($${openDebtAmount.toFixed(2)})`, 'warning');
        return;
      }
    }

    const pwaPayload = {
      amount: amountUsd,
      currency: 'USD',
      amountBs: Number(paymentAmountBs || 0),
      reference: reference.trim(),
      method: 'Pago Móvil',
      bank: selectedBank === '0102' ? 'Banco de Venezuela (0102)' : 'Banesco (0134)',
      status: 'pending',
      date: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      installmentId: selectedDebt ? selectedDebt.id : null,
      notes: notesText.trim() || undefined,
      receiptImageUrl: imagePreview,
      receiptImage: imagePreview
    };

    setIsSubmitting(true);
    try {
      await submitPortalClientPaymentApi(pwaPayload);

      if (onAddNotification) onAddNotification('Comprobante enviado exitosamente a Caja para verificación.', 'success');
      setShowPaymentModal(false);
      if (onPaymentReported) {
        onPaymentReported();
      }
    } catch (err: any) {
      console.error('[PaymentsTab Submit Error]:', err);
      const msg = err.message || 'Error al reportar pago';
      if (onAddNotification) onAddNotification(msg, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const debtTotalBs = Number(totalEffectiveDebt * (Number(bcvRate) || 36.50)).toFixed(2);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-neutral-950 pb-24 animate-fade-in text-white overflow-y-auto w-full max-w-full">

      {/* 1. Header Resumen de Deuda */}
      <div className="p-4 sm:p-5 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-950 border-b border-neutral-900">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-lg sm:text-xl font-black tracking-tight">Pagos y Deudas</h2>
          <span className="text-[10px] text-zinc-400 font-mono bg-neutral-900 px-2 py-1 rounded-full border border-neutral-800">
            BCV: {Number(bcvRate || 0).toFixed(2)} Bs/$
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 mb-4">Gestiona tus compras financiadas y abonos a cuotas</p>

        {/* Tarjeta de Total Pendiente */}
        <div className={`bg-neutral-900/90 border ${theme.border} rounded-3xl p-5 shadow-[0_0_30px_rgba(0,0,0,0.2)] relative overflow-hidden text-center`}>
          <div className={`absolute -top-10 -right-10 w-32 h-32 ${theme.glowBg} blur-3xl rounded-full`}></div>
          <p className={`text-[11px] font-bold ${theme.textAccent} uppercase tracking-widest mb-1.5 flex items-center justify-center gap-1.5`}>
            <CreditCard className="w-3.5 h-3.5" /> Deuda Total Pendiente
          </p>
          <h3 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            ${totalEffectiveDebt.toFixed(2)}
          </h3>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            ≈ Bs. {debtTotalBs}
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">

        {/* 2. Estado Limpio (Sin Deudas) */}
        {totalEffectiveDebt <= 0.001 && activeGroups.length === 0 && !hasOpenDebt && (
          <div className="bg-zinc-900/50 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-base text-white">¡Estás al día!</h4>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              No tienes cuotas pendientes ni saldo por pagar en este momento.
            </p>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('tienda')}
                className="mt-2 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs px-4 py-2.5 rounded-xl uppercase tracking-wider transition-colors cursor-pointer min-h-[44px]"
              >
                <ShoppingBag className="w-4 h-4" /> Ir a la Tienda
              </button>
            )}
          </div>
        )}

        {/* 3. Acordeones: UNA COMPRA = UN ACORDEÓN */}
        {activeGroups.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2 px-1">
              <ShoppingBag className="w-4 h-4 text-emerald-500" />
              Compras con Saldo Pendiente ({activeGroups.length})
            </h3>

            {activeGroups.map((group) => {
              const isExpanded = Boolean(expandedGroups[group.groupKey]);
              const invoiceOrId = group.purchase?.invoiceNumber
                ? `Factura ${group.purchase.invoiceNumber}`
                : group.transactionId
                ? `Compra #${group.transactionId.replace('TX-', '').slice(-6)}`
                : 'Cuota anterior';
              const purchaseDateStr = group.purchase?.date || (group.nextDueDate ? formatDisplayDate(group.nextDueDate) : 'Pendiente');

              // Badge de estado de compra
              const statusBadge = (() => {
                if (group.status === 'overdue') {
                  return (
                    <span className="inline-flex items-center gap-1 bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      <AlertTriangle className="w-3 h-3" /> Vencida
                    </span>
                  );
                }
                if (group.status === 'in_review') {
                  return (
                    <span className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      <Clock className="w-3 h-3" /> En Revisión
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    <Clock className="w-3 h-3" /> Pendiente
                  </span>
                );
              })();

              return (
                <div
                  key={group.groupKey}
                  className={`bg-neutral-900 border ${theme.border} ${theme.borderHover} rounded-2xl overflow-hidden shadow-sm transition-all`}
                >
                  {/* Header Compacto del Acordeón (Cerrado) */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.groupKey)}
                    aria-expanded={isExpanded}
                    aria-controls={`accordion-body-${group.groupKey}`}
                    id={`accordion-btn-${group.groupKey}`}
                    className={`w-full p-4 flex justify-between items-center text-left cursor-pointer hover:bg-neutral-800/40 transition-colors min-h-[56px] focus:outline-none focus:ring-1 focus:${theme.border}`}
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-zinc-400 font-bold uppercase">
                          {purchaseDateStr} · {invoiceOrId}
                        </span>
                        {statusBadge}
                      </div>
                      <p className="text-xs text-zinc-400 font-medium">
                        Financiado: ${group.originalFinancedAmount.toFixed(2)} · {group.installments.length} Cuota{group.installments.length > 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Por pagar</p>
                        <p className="text-base sm:text-lg font-black text-white font-mono">
                          ${group.remainingAmount.toFixed(2)}
                        </p>
                      </div>
                      <div className={`w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-white bg-zinc-700' : ''}`}>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </button>

                  {/* Cuerpo Detallado del Acordeón (Abierto) */}
                  {isExpanded && (
                    <div
                      id={`accordion-body-${group.groupKey}`}
                      role="region"
                      aria-labelledby={`accordion-btn-${group.groupKey}`}
                      className="bg-zinc-950/70 border-t border-zinc-800 p-4 space-y-4 animate-in fade-in duration-200"
                    >
                      {/* Resumen de la compra */}
                      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 text-xs space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-zinc-300">
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase block font-bold">Monto Total Compra</span>
                            <span className="font-bold text-white font-mono">
                              ${group.purchase?.amount ? Number(group.purchase.amount).toFixed(2) : group.originalFinancedAmount.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase block font-bold">Total Financiado</span>
                            <span className="font-bold text-emerald-400 font-mono">
                              ${group.originalFinancedAmount.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase block font-bold">Total Abonado</span>
                            <span className="font-bold text-zinc-200 font-mono">
                              ${group.paidAmount.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase block font-bold">Próximo Vencimiento</span>
                            <span className="font-bold text-amber-400 font-mono">
                              {group.nextDueDate ? formatDisplayDate(group.nextDueDate) : 'Al día'}
                            </span>
                          </div>
                        </div>

                        {/* Detalle de productos comprados si existen en transaction.items */}
                        {Array.isArray(group.purchase?.items) && group.purchase.items.length > 0 && (
                          <div className="pt-2 border-t border-zinc-800/80">
                            <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Artículos incluidos:</span>
                            <div className="space-y-0.5">
                              {group.purchase.items.map((it: any, idx: number) => (
                                <p key={idx} className="text-[11px] text-zinc-300 flex justify-between">
                                  <span>• {it.productName || it.name || 'Producto'} (x{it.quantityKg || it.quantity || 1})</span>
                                  <span className="text-zinc-400 font-mono">${Number(it.subtotal || it.priceUSD || 0).toFixed(2)}</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Desglose de Cuotas por Tipo (Víveres vs Repuestos) */}

                      {/* 1. Víveres y Alimentos (1 cuota) */}
                      {group.foodInstallments.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-[11px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Utensils className="w-3.5 h-3.5" /> Víveres y Alimentos
                          </h5>
                          <div className="space-y-2">
                            {group.foodInstallments.map((inst, index) => renderInstallmentCard(inst, index + 1, group.foodInstallments.length))}
                          </div>
                        </div>
                      )}

                      {/* 2. Repuestos y Otros (3 cuotas) */}
                      {group.otherInstallments.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5" /> Repuestos y Artículos Generales
                          </h5>
                          <div className="space-y-2">
                            {group.otherInstallments.map((inst, index) => renderInstallmentCard(inst, index + 1, group.otherInstallments.length))}
                          </div>
                        </div>
                      )}

                      {/* Historial de Abonos exclusivo de ESTA Compra */}
                      <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                        <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-zinc-500" /> Abonos y Pagos de esta Compra ({group.payments.length})
                        </h5>

                        {group.payments.length === 0 ? (
                          <p className="text-[11px] text-zinc-500 italic py-1">
                            No hay abonos registrados para esta compra aún.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {group.payments.map((p) => (
                              <div
                                key={p.id}
                                className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl text-xs"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-white font-mono">
                                      ${Number(p.amount || 0).toFixed(2)}
                                    </span>
                                    <span className="text-[10px] text-zinc-400">
                                      ({p.paymentMethod || p.method || 'Pago Móvil'})
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-zinc-400 font-mono">
                                    {formatDisplayDate(p.date || p.timestamp || p.createdAt)}
                                    {p.reference ? ` · Ref: ${p.reference}` : ''}
                                  </p>
                                </div>

                                <div>
                                  {p.status === 'approved' || p.status === 'Completado' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                      <CheckCircle className="w-3 h-3" /> Aprobado
                                    </span>
                                  ) : p.status === 'rejected' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                      <XCircle className="w-3 h-3" /> Rechazado
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                      <Clock className="w-3 h-3" /> En Revisión
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 4. Acordeón de Deuda Abierta / Saldo Legacy sin Cuotas (Si aplica) */}
        {hasOpenDebt && (
          <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setExpandedOpenDebt(!expandedOpenDebt)}
              aria-expanded={expandedOpenDebt}
              aria-controls="accordion-body-open-debt"
              className="w-full p-4 flex justify-between items-center text-left cursor-pointer hover:bg-zinc-800/40 transition-colors min-h-[56px] focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            >
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-amber-400 uppercase tracking-tight">
                    Saldo anterior / Deuda abierta
                  </h4>
                  <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase">
                    Saldo Abierto
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">Saldo pendiente de cuenta sin cuotas fijas</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Por pagar</p>
                  <p className="text-base sm:text-lg font-black text-amber-400 font-mono">
                    ${openDebtAmount.toFixed(2)}
                  </p>
                </div>
                <div className={`w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 transition-transform duration-200 ${expandedOpenDebt ? 'rotate-180 text-white bg-zinc-700' : ''}`}>
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </button>

            {expandedOpenDebt && (
              <div id="accordion-body-open-debt" className="bg-zinc-950/70 border-t border-zinc-800 p-4 space-y-4 animate-in fade-in duration-200">
                <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-amber-400 uppercase font-bold block">Saldo por Cancelar</span>
                    <span className="text-lg font-black text-white font-mono">${openDebtAmount.toFixed(2)}</span>
                    <span className="text-xs text-zinc-400 font-mono block">≈ Bs. {(openDebtAmount * (Number(bcvRate) || 36.50)).toFixed(2)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={openPaymentModalForOpenDebt}
                    className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold uppercase tracking-wider text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer min-h-[44px] shadow-sm flex items-center gap-1.5"
                  >
                    <Banknote className="w-4 h-4" /> Reportar Abono
                  </button>
                </div>

                {/* Pagos huérfanos / deuda abierta */}
                {openDebtPayments.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                    <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                      Abonos a Deuda Abierta ({openDebtPayments.length})
                    </h5>
                    {openDebtPayments.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl text-xs"
                      >
                        <div>
                          <p className="font-bold text-white font-mono">${Number(p.amount || 0).toFixed(2)}</p>
                          <p className="text-[10px] text-zinc-400 font-mono">
                            {formatDisplayDate(p.date || p.timestamp || p.createdAt)}
                            {p.reference ? ` · Ref: ${p.reference}` : ''}
                          </p>
                        </div>
                        <div>
                          {p.status === 'approved' || p.status === 'Completado' ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              Aprobado
                            </span>
                          ) : p.status === 'rejected' ? (
                            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                              Rechazado
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                              En Revisión
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Modal Inmersivo y Reutilizable de Reporte de Pago Móvil */}
      {showPaymentModal && (() => {
        const isInstallment = Boolean(selectedDebt);
        const singleTotalUSD = isInstallment
          ? Number((selectedDebt as any).amountUSD ?? selectedDebt?.amount ?? 0)
          : openDebtAmount;
        const singlePaidUSD = isInstallment ? Number(selectedDebt?.paidAmount ?? 0) : 0;
        const singleRemainingUSD = Math.max(0, Math.round((singleTotalUSD - singlePaidUSD) * 100) / 100);

        return (
          <div className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col animate-in slide-in-from-bottom duration-300 overflow-y-auto w-full">
            {/* Header Modal */}
            <div className="sticky top-0 z-50 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800 p-4 flex justify-between items-center">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Banknote className="w-5 h-5 text-amber-400" />
                {isInstallment ? 'Reportar Pago de Cuota' : 'Reportar Abono a Deuda Abierta'}
              </h2>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-5 pb-36 max-w-lg mx-auto w-full">

              {/* Información de la cuota / deuda a abonar */}
              <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 space-y-1 text-xs">
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">Destino del Pago</span>
                <p className="font-bold text-white text-sm">
                  {isInstallment
                    ? `Cuota ${(selectedDebt as any).installmentNumber || 1} de ${(selectedDebt as any).totalInstallments || 1}${selectedDebt?.transactionId ? ` · Compra #${selectedDebt.transactionId.replace('TX-', '').slice(-6)}` : ''}`
                    : 'Saldo Anterior / Deuda Abierta'}
                </p>
                <div className="flex justify-between items-center pt-2 border-t border-neutral-800 text-zinc-300">
                  <span>Saldo pendiente:</span>
                  <span className="font-mono font-bold text-amber-400">
                    ${singleRemainingUSD.toFixed(2)} (≈ Bs. {(singleRemainingUSD * (Number(bcvRate) || 36.50)).toFixed(2)})
                  </span>
                </div>
              </div>

              {/* Paso 1: Seleccionar Banco Destino */}
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  1. Banco Destino de Mundo Kalu
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedBank('0102')}
                    className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1 min-h-[56px] cursor-pointer ${
                      selectedBank === '0102' ? 'border-amber-400 bg-amber-500/10 text-white' : 'border-neutral-800 bg-neutral-900 text-zinc-400'
                    }`}
                  >
                    <span className="font-black text-sm">Venezuela</span>
                    <span className="text-[9px] font-mono">0102</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBank('0134')}
                    className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1 min-h-[56px] cursor-pointer ${
                      selectedBank === '0134' ? 'border-amber-400 bg-amber-500/10 text-white' : 'border-neutral-800 bg-neutral-900 text-zinc-400'
                    }`}
                  >
                    <span className="font-black text-sm">Banesco</span>
                    <span className="text-[9px] font-mono">0134</span>
                  </button>
                </div>
              </div>

              {/* Paso 2: Datos de Pago Móvil para Transferir */}
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  2. Datos para realizar el Pago Móvil
                </label>

                <div
                  onClick={() => handleCopy(phoneStr, setCopiedPhone)}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex justify-between items-center active:scale-[0.99] transition-transform cursor-pointer min-h-[48px]"
                >
                  <div>
                    <p className="text-[9px] text-zinc-500 uppercase font-bold">Teléfono Receptor</p>
                    <p className="text-sm font-mono text-white font-bold">{phoneStr}</p>
                  </div>
                  {copiedPhone ? <Check className="w-5 h-5 text-amber-400" /> : <Copy className="w-4 h-4 text-zinc-500" />}
                </div>

                <div
                  onClick={() => handleCopy(idStr, setCopiedId)}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex justify-between items-center active:scale-[0.99] transition-transform cursor-pointer min-h-[48px]"
                >
                  <div>
                    <p className="text-[9px] text-zinc-500 uppercase font-bold">Cédula de Identidad</p>
                    <p className="text-sm font-mono text-white font-bold">{idStr}</p>
                  </div>
                  {copiedId ? <Check className="w-5 h-5 text-amber-400" /> : <Copy className="w-4 h-4 text-zinc-500" />}
                </div>
              </div>

              {/* Paso 3: Monto en Bolívares */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    3. Monto a Pagar en Bolívares
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const amountBs = (singleRemainingUSD * (Number(bcvRate) || 36.50)).toFixed(2);
                      setPaymentAmountBs(amountBs);
                      handleCopy(amountBs, setCopiedAmount);
                    }}
                    className={`text-[10px] font-bold ${theme.textAccent} hover:underline uppercase`}
                  >
                    Copiar Monto Total
                  </button>
                </div>

                <div className="relative">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black ${theme.textAccent} font-mono`}>
                    Bs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={paymentAmountBs}
                    onChange={(e) => setPaymentAmountBs(e.target.value)}
                    className={`w-full bg-neutral-900 border-2 border-neutral-800 rounded-2xl py-3.5 pl-12 pr-12 text-2xl font-black text-white font-mono focus:outline-none focus:${theme.border} transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(paymentAmountBs, setCopiedAmount)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-2 min-h-[44px]"
                  >
                    {copiedAmount ? <Check className={`w-5 h-5 ${theme.textAccent}`} /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                {paymentAmountBs && (
                  <p className="text-[11px] text-zinc-400 text-right font-mono">
                    Equivalente: ${(Number(paymentAmountBs) / (Number(bcvRate) || 36.50)).toFixed(2)} USD
                  </p>
                )}
              </div>

              {/* Paso 4: Referencia y Comprobante */}
              <div className="space-y-3 pt-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  4. Comprobante Bancario <span className={theme.textAccent}>*</span>
                </label>

                <input
                  type="text"
                  placeholder="Últimos 6 dígitos de la referencia"
                  maxLength={6}
                  value={reference}
                  onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))}
                  className={`w-full bg-neutral-900 border-2 border-neutral-800 rounded-xl py-3 px-4 text-base font-mono text-white focus:outline-none focus:${theme.border} transition-colors placeholder:text-zinc-600 min-h-[48px]`}
                />

                <div className="relative">
                  {imagePreview ? (
                    <div className="relative rounded-2xl overflow-hidden border-2 border-neutral-800 group">
                      <img src={imagePreview} alt="Comprobante" className="w-full h-32 object-cover opacity-80" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => { setImageFile(null); setImagePreview(null); }}
                          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full text-xs font-bold uppercase shadow-lg min-h-[44px]"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className={`border-2 border-dashed ${theme.borderSubtle} rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer ${theme.borderHover} hover:bg-neutral-900/50 transition-colors min-h-[100px]`}>
                      <ImageIcon className={`w-7 h-7 ${theme.textAccent} mb-1.5`} />
                      <span className="text-xs font-bold text-zinc-200">Adjuntar Comprobante de Pago (Obligatorio)</span>
                      <span className="text-[9px] text-zinc-400 mt-0.5">JPG, PNG o WEBP (Máx. 4MB)</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Botón Flotante Inferior de Envío */}
            <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-5 bg-gradient-to-t from-neutral-950 via-neutral-950 to-transparent border-t border-neutral-900/80 max-w-lg mx-auto w-full">
              <button
                type="button"
                disabled={isSubmitting || !paymentAmountBs || !reference || Number(paymentAmountBs) <= 0 || reference.length < 4 || !imagePreview}
                onClick={handleSubmitPayment}
                className={`w-full py-3.5 sm:py-4 ${theme.btnPrimary} font-black uppercase rounded-2xl text-sm tracking-widest transition-all ${theme.glow} disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer min-h-[48px]`}
              >
                {isSubmitting ? 'Enviando...' : (
                  <>
                    Enviar Comprobante a Caja <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );

  // Helper de renderizado de tarjeta de cuota
  function renderInstallmentCard(inst: DebtInstallment, num: number, total: number) {
    const instTotal = Number((inst as any).amountUSD ?? inst.amount ?? 0);
    const instPaid = Number(inst.paidAmount ?? 0);
    const remaining = Math.max(0, Math.round((instTotal - instPaid) * 100) / 100);

    const isInReview = inst.status === 'in_review';
    const isPaid = inst.status === 'paid' || remaining <= 0.001;
    const isOverdue = inst.status === 'overdue' && !isPaid;

    const instNum = (inst as any).installmentNumber;
    const totalInst = (inst as any).totalInstallments;
    const titleLabel = (instNum != null && totalInst != null)
      ? `Cuota ${instNum} de ${totalInst}`
      : (instNum != null ? `Cuota ${instNum}` : 'Cuota');

    return (
      <div
        key={inst.id}
        className={`bg-zinc-900 border rounded-xl p-3 text-xs space-y-2.5 transition-colors ${
          isOverdue
            ? 'border-red-500/40 bg-red-950/10'
            : isInReview
            ? 'border-amber-500/40 bg-amber-950/10'
            : isPaid
            ? 'border-emerald-500/20 bg-zinc-900/40'
            : 'border-zinc-800'
        }`}
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-zinc-100 uppercase tracking-tight text-xs flex items-center gap-1.5">
              {titleLabel}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
              Vence: {formatDisplayDate(inst.dueDate)}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">Saldo Cuota</span>
            <span className="text-sm font-black font-mono text-white">
              ${remaining.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400 border-t border-zinc-800/80 pt-2 font-mono">
          <div>
            <span className="text-zinc-500">Monto total:</span> ${instTotal.toFixed(2)}
          </div>
          <div>
            <span className="text-zinc-500">Abonado:</span> ${instPaid.toFixed(2)}
          </div>
        </div>

        {/* Acciones según estatus */}
        <div className="pt-1">
          {isInReview ? (
            <div className="w-full py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg text-center font-bold uppercase tracking-wider text-[10px] flex items-center justify-center gap-1.5 min-h-[38px]">
              <Clock className="w-3.5 h-3.5" /> Pago en Revisión por Cajero
            </div>
          ) : isPaid ? (
            <div className="w-full py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-center font-bold uppercase tracking-wider text-[10px] flex items-center justify-center gap-1.5 min-h-[38px]">
              <Check className="w-3.5 h-3.5" /> Cuota Pagada
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openPaymentModalForInstallment(inst)}
              className={`w-full font-bold uppercase tracking-widest text-[11px] py-2.5 rounded-lg transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-1.5 shadow-sm ${
                isOverdue
                  ? 'bg-red-500 hover:bg-red-400 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
              }`}
            >
              {isOverdue ? <AlertCircle className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
              Reportar Abono a esta Cuota
            </button>
          )}
        </div>
      </div>
    );
  }
}
