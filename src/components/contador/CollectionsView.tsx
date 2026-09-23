import { fetchCollection, onCollectionSnapshot, updateLocalDoc, addLocalDoc, approvePwaPaymentApi, rejectPwaPaymentApi } from '../../services/localApi';
import React, { useState, useEffect, useMemo } from 'react';
import KaluLoader from '../KaluLoader';
import {
  Receipt,
  CheckCircle,
  XCircle,
  Clock,
  Bot,
  ShieldCheck,
  Image as ImageIcon,
  Eye,
  X,
  AlertTriangle,
  ZoomIn,
  Users,
  Search,
  ChevronDown,
  ShoppingBag,
  FileText,
  Calendar,
  Lock,
  Layers,
  Sparkles
} from 'lucide-react';
import { getVIPLevelInfo } from '../../config/vipMatrix';
import { formatDisplayDate, parseSafeDate } from '../../utils/debtGrouping';
import { buildKaluClientExpedientes, PWAPaymentReport } from '../../utils/kaluCollectionsEngine';
import { ClientProfile, DebtInstallment, Transaction } from '../../types';

type PWAPayment = PWAPaymentReport;

export default function CollectionsView({
  onAddNotification
}: {
  onAddNotification?: (msg: string, type?: 'success'|'info'|'warning') => void;
}) {
  const [payments, setPayments] = useState<PWAPayment[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [installments, setInstallments] = useState<DebtInstallment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subtabs: 'pending' (Bandeja por Validar), 'history' (Historial Conciliado), 'expedientes' (Expedientes y Cuotas)
  const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'expedientes'>('pending');
  const [selectedReceipt, setSelectedReceipt] = useState<{
    imageUrl: string;
    entityName: string;
    amount: number;
    reference: string;
    date?: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);

  // Estados de acordeón para expedientes: cliente y ventas
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [expandedSales, setExpandedSales] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // 1. Suscripción en Tiempo Real a Pagos PWA
    const unsubPayments = onCollectionSnapshot('pwa_payments', (data) => {
      setPayments(data || []);
      setIsLoading(false);
    });

    // 2. Suscripción en Tiempo Real a Clientes
    const unsubClients = onCollectionSnapshot('clients', (data) => {
      setClients(data || []);
    });

    // 3. Suscripción en Tiempo Real a Cuotas (Installments)
    const unsubInstallments = onCollectionSnapshot('installments', (data) => {
      setInstallments(data || []);
    });

    // 4. Suscripción en Tiempo Real a Transacciones
    const unsubTransactions = onCollectionSnapshot('transactions', (data) => {
      setTransactions(data || []);
    });

    return () => {
      unsubPayments();
      unsubClients();
      unsubInstallments();
      unsubTransactions();
    };
  }, []);

  const handleApprovePayment = async (payment: PWAPayment) => {
    if (processingPaymentId || !['pending', 'in_review'].includes(payment.status)) {
      onAddNotification?.('El comprobante ya fue procesado o está en curso.', 'warning');
      return;
    }

    setProcessingPaymentId(payment.id);
    try {
      if (payment.type === 'credito_cashea') {
        const targetId = payment.clientId || payment.entityId;
        const c = clients.find((x: any) => String(x.id) === String(targetId));
        if (c) {
          await updateLocalDoc('clients', targetId, {
            outstandingDebt: (c.outstandingDebt || 0) + payment.amount
          });
        }

        // Create Sale transaction (Debt generation)
        const saleId = `CASHEA-${Date.now()}`;
        const newTx = {
          id: saleId,
          clientId: targetId,
          entity: payment.entityName,
          category: 'ventas',
          date: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          invoiceNumber: `PWA-${payment.reference}`,
          amount: payment.amount,
          isIncome: true,
          status: 'Completado',
          paymentMethod: 'Cashea',
          notes: `Crédito QR Aprobado. Inicial recibida: $${payment.casheaData?.inicial.toFixed(2)}`
        };
        await addLocalDoc('transactions', newTx);

        // Create Installments
        for (let i = 1; i <= 4; i++) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (i * 15)); // Quincenal

          await addLocalDoc('installments', {
             id: `INST-${saleId}-${i}`,
             saleId: saleId,
             transactionId: saleId,
             clientId: targetId,
             amountUSD: payment.casheaData?.cuotas || 0,
             amount: payment.casheaData?.cuotas || 0,
             dueDate: dueDate.toISOString(),
             installmentNumber: i,
             totalInstallments: 4,
             status: 'pending'
          });
        }

        await updateLocalDoc('pwa_payments', payment.id, {
          status: 'approved',
          approvedAt: new Date().toISOString()
        });

        onAddNotification?.('Crédito QR Aprobado Exitosamente', 'success');
      } else {
        // Operación atómica de backend: aprobación idempotente
        await approvePwaPaymentApi(payment.id);
        onAddNotification?.('Pago aprobado y conciliado exitosamente', 'success');
      }
    } catch (e: any) {
      console.error(e);
      onAddNotification?.(e.message || 'Error al aprobar el pago', 'warning');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleRejectPayment = async (payment: PWAPayment) => {
    if (processingPaymentId || !['pending', 'in_review'].includes(payment.status)) {
      onAddNotification?.('El comprobante ya fue procesado o está en curso.', 'warning');
      return;
    }

    setProcessingPaymentId(payment.id);
    try {
      await rejectPwaPaymentApi(payment.id);
      onAddNotification?.('Solicitud rechazada. La deuda permanece intacta.', 'info');
    } catch (e: any) {
      console.error(e);
      onAddNotification?.(e.message || 'Error al rechazar', 'warning');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const pending = useMemo(() => {
    return payments.filter(p => (p.status === 'pending' || p.status === 'in_review'));
  }, [payments]);

  const historyPayments = useMemo(() => {
    return payments.filter(p => p.status === 'approved' || p.status === 'rejected');
  }, [payments]);

  const hasPending = pending.length > 0;

  // Construcción del Modelo Jerárquico Puro Mundo Kalu: Cliente -> Ventas Financiadas (Acordeón) -> Cuotas 1..N
  const clientExpedientes = useMemo(() => {
    return buildKaluClientExpedientes({
      clients,
      installments,
      transactions,
      payments
    });
  }, [clients, installments, transactions, payments]);

  // Filtrado para búsqueda
  const filteredExpedientes = useMemo(() => {
    if (!searchQuery.trim()) return clientExpedientes;
    const q = searchQuery.toLowerCase().trim();
    return clientExpedientes.filter(exp => {
      const name = (exp.client.name || '').toLowerCase();
      const cedula = (exp.client.cedula || exp.client.rfc || '').toLowerCase();
      const id = String(exp.client.id || '').toLowerCase();
      const hasInvoice = exp.sales.some(s => s.invoiceNumber.toLowerCase().includes(q));
      return name.includes(q) || cedula.includes(q) || id.includes(q) || hasInvoice;
    });
  }, [clientExpedientes, searchQuery]);

  const toggleClientAccordion = (clientId: string) => {
    setExpandedClients(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  };

  const toggleSaleAccordion = (saleKey: string) => {
    setExpandedSales(prev => ({
      ...prev,
      [saleKey]: !prev[saleKey]
    }));
  };

  const totalCarteraUSD = useMemo(() => {
    return clientExpedientes.reduce((acc, c) => acc + (c.totalRemainingDebt || 0), 0);
  }, [clientExpedientes]);

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-100 font-sans">
      {/* HEADER WITH FLASHING ALARM WHEN PENDING > 0 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-neutral-800 bg-neutral-950 gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-emerald-400 flex items-center gap-3">
            <Bot className="w-8 h-8 text-emerald-500" />
            Centro de Cobranzas Mundo Kalu
          </h1>
          <p className="text-xs font-mono text-emerald-500/70 mt-1 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Autoridad Única de Verificación y Conciliación
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Indicador Parpadeante / Alarma de Pagos por Validar */}
          <div className={`p-3 rounded-xl border text-center min-w-[130px] transition-all duration-300 relative overflow-hidden ${
            hasPending
              ? 'bg-amber-950/40 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)] animate-pulse'
              : 'bg-neutral-900 border-neutral-800'
          }`}>
            {hasPending && (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            )}
            <span className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${
              hasPending ? 'text-amber-400' : 'text-neutral-500'
            }`}>
              Por Validar
            </span>
            <span className={`block text-2xl font-black ${
              hasPending ? 'text-amber-400 font-mono tracking-tight' : 'text-neutral-400'
            }`}>
              {pending.length}
            </span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl text-center min-w-[120px]">
            <span className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider font-bold">Aprobados Hoy</span>
            <span className="block text-2xl font-bold text-emerald-500 font-mono">{historyPayments.filter(p => p.status === 'approved').length}</span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl text-center min-w-[140px]">
            <span className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider font-bold">Cartera Financiada</span>
            <span className="block text-2xl font-black text-white font-mono">${totalCarteraUSD.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-neutral-800 bg-neutral-950 px-6 gap-6">
        <button
          onClick={() => setActiveTab('pending')}
          className={`py-3.5 font-mono text-xs uppercase tracking-wider font-bold border-b-2 cursor-pointer transition-colors flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          Bandeja de Validación (PWA)
          {hasPending && (
            <span className="bg-amber-500 text-neutral-950 text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
              {pending.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('expedientes')}
          className={`py-3.5 font-mono text-xs uppercase tracking-wider font-bold border-b-2 cursor-pointer transition-colors flex items-center gap-2 ${
            activeTab === 'expedientes'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          Expedientes y Cuotas ({clientExpedientes.length} Clientes)
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`py-3.5 font-mono text-xs uppercase tracking-wider font-bold border-b-2 cursor-pointer transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-neutral-400 text-white'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Historial Conciliado ({historyPayments.length})
        </button>
      </div>

      {/* CONTENT BODY */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <KaluLoader message="Mundo Kalu" subMessage="CARGANDO CENTRO DE COBRANZAS..." size="sm" />
        ) : activeTab === 'pending' ? (
          /* TAB 1: BANDEJA DE VALIDACIÓN (PWA) */
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Pagos Reportados Pendientes ({pending.length})
              </h2>
              {hasPending && (
                <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 animate-bounce">
                  <AlertTriangle className="w-3.5 h-3.5" /> {pending.length} pago{pending.length > 1 ? 's' : ''} esperando verificación
                </span>
              )}
            </div>

            {pending.length === 0 ? (
              <div className="text-center py-16 text-neutral-500 bg-neutral-950/50 border border-neutral-800/80 rounded-2xl">
                <CheckCircle className="w-12 h-12 mx-auto text-emerald-500/50 mb-3" />
                <p className="font-mono text-sm font-bold text-neutral-300">¡Bandeja al día!</p>
                <p className="font-mono text-xs text-neutral-500 mt-1">No hay comprobantes pendientes de validación en este momento.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pending.map(p => {
                  const receiptSrc = p.receiptImageUrl || p.receiptImage;
                  return (
                    <div key={p.id} className="rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between border bg-neutral-800/90 border-amber-500/40 shadow-xl gap-4">
                      <div className="flex-1 flex items-start gap-4">
                        {/* MINIATURA DEL COMPROBANTE / CAPTURE */}
                        <div className="relative shrink-0">
                          {receiptSrc ? (
                            <div
                              onClick={() => setSelectedReceipt({
                                imageUrl: receiptSrc,
                                entityName: p.entityName,
                                amount: p.amount,
                                reference: p.reference,
                                date: p.date
                              })}
                              className="w-20 h-20 rounded-xl overflow-hidden border-2 border-amber-500/60 bg-neutral-900 cursor-pointer relative shadow-md hover:scale-105 hover:border-amber-400 transition-all flex items-center justify-center group"
                              title="Clic para ampliar comprobante"
                            >
                              <img src={receiptSrc} alt="Capture" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-amber-300">
                                <ZoomIn className="w-6 h-6" />
                                <span className="text-[8px] font-bold uppercase mt-0.5 font-mono">Ver</span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/60 flex flex-col items-center justify-center text-neutral-600">
                              <ImageIcon className="w-6 h-6 mb-0.5" />
                              <span className="text-[8px] font-mono">Sin Capture</span>
                            </div>
                          )}
                        </div>

                        {/* DATOS DEL PAGO */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              {p.installmentId ? 'PAGO CUOTA MUNDO KALU' : 'ABONO FIADO TOTAL MUNDO KALU'}
                            </span>
                            <span className="font-bold text-lg text-white">{p.entityName}</span>
                            {p.transactionId && (
                              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-700 px-2 py-0.5 rounded">
                                Venta: {p.transactionId}
                              </span>
                            )}
                            {p.installmentId && (
                              <span className="text-[10px] font-mono text-emerald-400/90 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded">
                                Cuota: {p.installmentId}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-neutral-400 font-mono pt-1">
                            <div>
                              <span className="block text-[10px] uppercase text-neutral-500 font-bold">Monto Declarado</span>
                              <span className="text-emerald-400 font-black text-base">${Number(p.amount).toFixed(2)} USD</span>
                              {p.amountBs && <span className="block text-[10px] text-neutral-400">({Number(p.amountBs).toLocaleString('es-VE')} Bs)</span>}
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase text-neutral-500 font-bold">Referencia</span>
                              <span className="text-neutral-100 font-bold bg-neutral-900/90 px-2 py-0.5 rounded border border-neutral-700 inline-block mt-0.5">{p.reference}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase text-neutral-500 font-bold">Método / Banco</span>
                              <span className="text-neutral-200">{p.method || p.paymentMethod || 'Pago Móvil'}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase text-neutral-500 font-bold">Fecha de Reporte</span>
                              <span className="text-neutral-300 text-xs">{p.date ? (p.date.includes('T') ? new Date(p.date).toLocaleString('es-ES') : p.date) : 'Reciente'}</span>
                            </div>
                          </div>

                          {p.notes && (
                            <p className="text-xs text-neutral-400 mt-1 font-mono italic bg-neutral-900/60 px-3 py-1.5 rounded-lg border border-neutral-800">
                              Nota del Cliente: {p.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* ACCIONES DEL CAJERO / AUTORIDAD */}
                      <div className="flex items-center gap-3 self-end lg:self-center border-t lg:border-t-0 lg:border-l border-neutral-700/80 pt-3 lg:pt-0 lg:pl-6 w-full lg:w-auto justify-end">
                        <button
                          onClick={() => handleRejectPayment(p)}
                          disabled={Boolean(processingPaymentId)}
                          className="p-3 bg-neutral-800 hover:bg-rose-500/20 hover:text-rose-400 text-neutral-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all border border-neutral-700 hover:border-rose-500/50 cursor-pointer"
                          title="Rechazar Comprobante"
                        >
                          <XCircle className="w-6 h-6" />
                        </button>
                        <button
                          onClick={() => handleApprovePayment(p)}
                          disabled={Boolean(processingPaymentId)}
                          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all flex items-center gap-2 font-bold shadow-lg shadow-emerald-900/30 hover:scale-105 active:scale-95 cursor-pointer font-mono text-sm"
                        >
                          <CheckCircle className="w-5 h-5" />
                          {processingPaymentId === p.id ? 'Asentando...' : 'Validar y Asentar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'expedientes' ? (
          /* TAB 2: EXPEDIENTES Y CUOTAS (MODELO JERÁRQUICO: CLIENTE -> VENTAS (ACORDEÓN) -> CUOTAS 1..N) */
          <div className="space-y-4">
            {/* Buscador de Expedientes */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex items-center gap-3">
              <Search className="w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente por nombre, cédula o factura..."
                className="flex-1 bg-transparent text-sm text-white focus:outline-none font-sans placeholder:text-neutral-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs text-neutral-400 hover:text-white font-mono">
                  Limpiar
                </button>
              )}
            </div>

            {filteredExpedientes.length === 0 ? (
              <div className="text-center py-16 text-neutral-500 bg-neutral-950/50 border border-neutral-800/80 rounded-2xl">
                <Users className="w-12 h-12 mx-auto text-neutral-600 mb-3 opacity-50" />
                <p className="font-mono text-sm">No se encontraron expedientes de crédito.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredExpedientes.map(exp => {
                  const isClientExpanded = Boolean(expandedClients[exp.client.id]);
                  const vip = getVIPLevelInfo(exp.client.loyaltyPoints || 0);
                  const hasRemaining = exp.totalRemainingDebt > 0.001;

                  return (
                    <div
                      key={exp.client.id}
                      className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg transition-all"
                    >
                      {/* HEADER DEL CLIENTE (1 CLIENTE = 1 AGRUPACIÓN) */}
                      <button
                        type="button"
                        onClick={() => toggleClientAccordion(exp.client.id)}
                        className="w-full p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between text-left cursor-pointer hover:bg-neutral-900/60 transition-colors gap-3 border-b border-neutral-800/60"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${vip.badgeColor} border flex items-center justify-center font-black text-xs shrink-0`}>
                            {vip.code}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-lg text-white font-serif">{exp.client.name}</h3>
                              <span className="text-[10px] font-mono text-zinc-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded">
                                CI: {exp.client.cedula || exp.client.rfc || exp.client.id}
                              </span>
                              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded font-bold">
                                {vip.shortName} • {exp.client.loyaltyPoints || 0} pts
                              </span>
                            </div>
                            <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                              {exp.sales.length} Venta{exp.sales.length > 1 ? 's' : ''} Financiada{exp.sales.length > 1 ? 's' : ''} · Tel: {exp.client.phone || 'Sin número'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end">
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-mono font-bold text-neutral-500 block">Saldo Deudor Total</span>
                            <span className={`text-lg font-black font-mono ${hasRemaining ? 'text-rose-400' : 'text-emerald-400'}`}>
                              ${exp.totalRemainingDebt.toFixed(2)} USD
                            </span>
                          </div>
                          <div className={`w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-400 transition-transform duration-200 ${isClientExpanded ? 'rotate-180 text-white bg-neutral-800' : ''}`}>
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                      </button>

                      {/* CUERPO DEL CLIENTE: VENTAS FINANCIADAS (UNA POR UNA) */}
                      {isClientExpanded && (
                        <div className="p-4 sm:p-5 bg-neutral-900/40 space-y-4">
                          {exp.sales.length === 0 ? (
                            <p className="text-xs text-neutral-500 italic py-2 text-center font-mono">
                              No hay ventas financiadas activas registradas para este cliente.
                            </p>
                          ) : (
                            exp.sales.map(sale => {
                              const isSaleExpanded = Boolean(expandedSales[sale.saleKey]);

                              return (
                                <div
                                  key={sale.saleKey}
                                  className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm"
                                >
                                  {/* HEADER DE LA VENTA FINANCIADA (MODO ACORDEÓN) */}
                                  <button
                                    type="button"
                                    onClick={() => toggleSaleAccordion(sale.saleKey)}
                                    className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between text-left cursor-pointer hover:bg-neutral-800/50 transition-colors gap-3"
                                  >
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <ShoppingBag className="w-4 h-4 text-emerald-400" />
                                        <span className="font-bold text-sm text-white font-mono">
                                          Factura: {sale.invoiceNumber}
                                        </span>
                                        <span className="text-[11px] text-neutral-400 font-mono">
                                          · Fecha: {sale.purchaseDate}
                                        </span>
                                        <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                                          sale.status === 'paid' ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400' :
                                          sale.status === 'in_review' ? 'bg-amber-950/40 border-amber-800 text-amber-400' :
                                          sale.status === 'overdue' ? 'bg-rose-950/40 border-rose-800 text-rose-400' :
                                          'bg-neutral-800 border-neutral-700 text-neutral-300'
                                        }`}>
                                          {sale.status === 'paid' ? 'Saldada' :
                                           sale.status === 'in_review' ? 'Pago en Revisión' :
                                           sale.status === 'overdue' ? 'Cuota Vencida' : 'Pendiente'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-neutral-400 font-mono">
                                        Total Venta: <strong className="text-neutral-200">${sale.totalAmount.toFixed(2)}</strong> · Financiado: <strong className="text-emerald-400">${sale.financedAmount.toFixed(2)}</strong> · {sale.installments.length} Cuota{sale.installments.length > 1 ? 's' : ''}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                      <div className="text-right">
                                        <span className="text-[9px] uppercase font-mono font-bold text-neutral-500 block">Saldo Pendiente</span>
                                        <span className={`text-base font-black font-mono ${sale.remainingAmount > 0.001 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                          ${sale.remainingAmount.toFixed(2)}
                                        </span>
                                      </div>
                                      <div className={`w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 transition-transform duration-200 ${isSaleExpanded ? 'rotate-180 text-white' : ''}`}>
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      </div>
                                    </div>
                                  </button>

                                  {/* CUERPO DE LA VENTA: CUOTAS 1..N DESPLEGADAS */}
                                  {isSaleExpanded && (
                                    <div className="border-t border-neutral-800 bg-neutral-950/80 p-4 space-y-4 animate-in fade-in duration-200">
                                      <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Plan de Cuotas ({sale.installments.length})
                                      </h4>

                                      <div className="grid gap-2.5">
                                        {sale.installments.map((inst, idx) => {
                                          const instTotal = Number((inst as any).amountUSD ?? inst.amount ?? 0);
                                          const instPaid = Number(inst.paidAmount ?? 0);
                                          const remaining = Math.max(0, Math.round((instTotal - instPaid) * 100) / 100);

                                          const isInReview = inst.status === 'in_review';
                                          const isPaid = inst.status === 'paid' || remaining <= 0.001;
                                          const isOverdue = inst.status === 'overdue' && !isPaid;

                                          const instNum = (inst as any).installmentNumber || (idx + 1);
                                          const totalInst = (inst as any).totalInstallments || sale.installments.length;

                                          // Buscar si tiene comprobante asociado en los pagos
                                          const matchedPay = sale.payments.find(p => String(p.installmentId) === String(inst.id));
                                          const receiptSrc = matchedPay?.receiptImageUrl || matchedPay?.receiptImage;

                                          return (
                                            <div
                                              key={inst.id}
                                              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs ${
                                                isPaid
                                                  ? 'bg-neutral-900/60 border-emerald-900/40 text-neutral-300'
                                                  : isInReview
                                                  ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                                                  : isOverdue
                                                  ? 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                                                  : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                                              }`}
                                            >
                                              <div className="space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="font-bold text-white text-sm">
                                                    Cuota {instNum} de {totalInst}
                                                  </span>
                                                  <span className="text-[10px] text-neutral-500 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                                                    ID: {inst.id}
                                                  </span>
                                                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                                                    isPaid ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
                                                    isInReview ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse' :
                                                    isOverdue ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' :
                                                    'bg-neutral-800 text-neutral-400 border-neutral-700'
                                                  }`}>
                                                    {isPaid ? 'Pagada' :
                                                     isInReview ? 'En Revisión' :
                                                     isOverdue ? 'Vencida' : 'Pendiente'}
                                                  </span>
                                                </div>

                                                <div className="flex items-center gap-4 text-[11px] text-neutral-400 pt-0.5 flex-wrap">
                                                  <span>Vencimiento: <strong className="text-neutral-200">{formatDisplayDate(inst.dueDate)}</strong></span>
                                                  <span>Monto: <strong className="text-white">${instTotal.toFixed(2)}</strong></span>
                                                  <span>Abonado: <strong className="text-emerald-400">${instPaid.toFixed(2)}</strong></span>
                                                  <span>Saldo: <strong className={remaining > 0.001 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>${remaining.toFixed(2)}</strong></span>
                                                </div>
                                              </div>

                                              {/* ACCIONES Y COMPROBANTES DE LA CUOTA */}
                                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                                {receiptSrc && (
                                                  <button
                                                    type="button"
                                                    onClick={() => setSelectedReceipt({
                                                      imageUrl: receiptSrc,
                                                      entityName: exp.client.name,
                                                      amount: Number(matchedPay?.amount || instTotal),
                                                      reference: matchedPay?.reference || inst.id,
                                                      date: matchedPay?.date
                                                    })}
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <Receipt className="w-3.5 h-3.5" /> Ver Capture
                                                  </button>
                                                )}

                                                {inst.paidAt && (
                                                  <span className="text-[10px] text-neutral-500">
                                                    Liquidada: {new Date(inst.paidAt).toLocaleDateString('es-ES')}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* TAB 3: HISTORIAL CONCILIADO (APROBADOS Y RECHAZADOS) */
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-emerald-400" /> Historial de Comprobantes Procesados ({historyPayments.length})
            </h2>

            {historyPayments.length === 0 ? (
              <div className="text-center py-16 text-neutral-500 bg-neutral-950/50 border border-neutral-800/80 rounded-2xl">
                <Receipt className="w-12 h-12 mx-auto text-neutral-600 mb-3 opacity-50" />
                <p className="font-mono text-sm">No hay registros en el historial aún.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {historyPayments.map(p => {
                  const receiptSrc = p.receiptImageUrl || p.receiptImage;
                  const isApp = p.status === 'approved';

                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs ${
                        isApp ? 'bg-neutral-900/60 border-neutral-800' : 'bg-rose-950/10 border-rose-900/30'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {receiptSrc ? (
                          <div
                            onClick={() => setSelectedReceipt({
                              imageUrl: receiptSrc,
                              entityName: p.entityName,
                              amount: p.amount,
                              reference: p.reference,
                              date: p.date
                            })}
                            className="w-12 h-12 rounded-lg overflow-hidden border border-neutral-700 bg-neutral-950 cursor-pointer shrink-0 hover:scale-105 transition-all"
                            title="Ver capture"
                          >
                            <img src={receiptSrc} alt="Capture" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg border border-dashed border-neutral-800 bg-neutral-950 flex items-center justify-center text-neutral-600 shrink-0">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{p.entityName}</span>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                              isApp ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            }`}>
                              {isApp ? 'Aprobado' : 'Rechazado'}
                            </span>
                          </div>
                          <p className="text-neutral-400 text-[11px] mt-0.5">
                            Ref: <strong className="text-neutral-200">{p.reference}</strong> · Vía: {p.method || p.paymentMethod || 'Pago Móvil'} · Fecha: {p.date}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 justify-between md:justify-end">
                        <div className="text-right">
                          <span className="text-emerald-400 font-bold text-base">${Number(p.amount).toFixed(2)} USD</span>
                          {p.amountBs && <span className="block text-[10px] text-neutral-500">({Number(p.amountBs).toLocaleString('es-VE')} Bs)</span>}
                        </div>

                        {receiptSrc && (
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt({
                              imageUrl: receiptSrc,
                              entityName: p.entityName,
                              amount: p.amount,
                              reference: p.reference,
                              date: p.date
                            })}
                            className="p-2 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                            title="Ampliar comprobante"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE AMPLIACIÓN DE COMPROBANTE / CAPTURE */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  Comprobante de Pago - {selectedReceipt.entityName}
                </h3>
                <p className="text-xs font-mono text-neutral-400">
                  Ref: <strong className="text-amber-400">{selectedReceipt.reference}</strong> | Monto: <strong className="text-emerald-400">${selectedReceipt.amount.toFixed(2)} USD</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-2 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Image Body */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/40 min-h-[300px]">
              <img
                src={selectedReceipt.imageUrl}
                alt="Comprobante Completo"
                className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-lg border border-neutral-800"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex justify-between items-center text-xs font-mono text-neutral-500">
              <span>Fecha: {selectedReceipt.date ? (selectedReceipt.date.includes('T') ? new Date(selectedReceipt.date).toLocaleString('es-ES') : selectedReceipt.date) : 'N/A'}</span>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-bold transition-colors cursor-pointer"
              >
                Cerrar Visor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
