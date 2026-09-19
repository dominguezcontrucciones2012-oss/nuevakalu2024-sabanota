/**
 * Helper Puro para el Historial de Compras del Portal Cliente (Fase 3D)
 * KALU CRM Oficial / Sabanota
 *
 * Regla de Negocio:
 * "Mis Compras" muestra COMPRAS / VENTAS REALES DEL CLIENTE.
 * Excluye categóricamente abonos, pagos, ingresos_cobranza, y movimientos que no sean compras.
 *
 * Pestañas:
 * - POR PAGAR: Compras no canceladas con remainingAmount > 0.
 * - PAGADAS: Compras no canceladas completamente saldadas (contado o cuotas 100% pagadas).
 * - CANCELADAS: Compras anuladas / canceladas (isVoided === true o status cancelado/anulado/voided/rejected).
 */

import type { Transaction, DebtInstallment } from '../types.ts';
import { parseSafeDate, formatDisplayDate } from './debtGrouping.ts';

export interface ClientPurchaseItem {
  name: string;
  quantity: number;
  unitPrice?: number;
  subtotal: number;
}

export interface ClientPurchaseRecord {
  purchaseId: string;
  transactionId: string | null;
  purchase: Transaction | null;
  installments: DebtInstallment[];
  foodInstallments: DebtInstallment[];
  otherInstallments: DebtInstallment[];
  payments: any[];
  saleTotal: number;
  financedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'pending' | 'overdue' | 'in_review' | 'paid' | 'cancelled';
  purchaseDate: string;
  invoiceNumber: string;
  items: ClientPurchaseItem[];
  paymentMethod: string;
  isCredit: boolean;
  nextDueDate: string | null;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface ClientPurchasesOverview {
  allPurchases: ClientPurchaseRecord[];
  porPagar: ClientPurchaseRecord[];
  pagadas: ClientPurchaseRecord[];
  canceladas: ClientPurchaseRecord[];
}

/**
 * Determina si una transacción es una COMPRA/VENTA real (y no una cobranza o abono).
 */
export function isRealSaleTransaction(tx: any): boolean {
  if (!tx || typeof tx !== 'object') return false;

  // 1. Excluir categóricamente categorías de abonos y cobranzas
  if (
    tx.category === 'ingresos_cobranza' ||
    tx.category === 'payment' ||
    tx.category === 'pagos' ||
    tx.isAbono === true
  ) {
    return false;
  }

  // 2. Excluir si su propósito o invoiceNumber es explícitamente PWA / cobranza
  if (typeof tx.invoiceNumber === 'string' && tx.invoiceNumber.startsWith('PWA-')) {
    return false;
  }

  // 3. Excluir gastos o compras de inventario al mayor si no es venta al cliente
  if (tx.category === 'gastos' || tx.category === 'compras') {
    return false;
  }

  // 4. Es venta si la categoría es ventas, credito, o si tiene items de venta / monto
  if (tx.category === 'ventas' || tx.category === 'credito') {
    return true;
  }

  // Si no tiene categoría explícita pero tiene items o isIncome y no es abono
  if (Array.isArray(tx.items) && tx.items.length > 0) {
    return true;
  }

  if (tx.isIncome && !tx.category && !tx.isAbono) {
    return true;
  }

  return false;
}

/**
 * Determina si una transacción o compra está cancelada / anulada.
 */
export function isCancelledPurchase(tx: any): boolean {
  if (!tx || typeof tx !== 'object') return false;
  if (tx.isVoided === true) return true;
  const statusStr = String(tx.status || '').toLowerCase();
  return (
    statusStr === 'voided' ||
    statusStr === 'cancelado' ||
    statusStr === 'cancelada' ||
    statusStr === 'rejected' ||
    statusStr === 'rechazado' ||
    statusStr === 'anulado' ||
    statusStr === 'anulada'
  );
}

/**
 * Helper Principal: Construye el historial completo y autoritativo de compras del cliente.
 */
export function buildClientPurchaseHistory({
  transactions = [],
  installments = [],
  payments = []
}: {
  transactions?: Transaction[];
  installments?: DebtInstallment[];
  payments?: any[];
}): ClientPurchasesOverview {
  const purchaseMap = new Map<string, {
    transactionId: string | null;
    purchaseTx: Transaction | null;
    instList: DebtInstallment[];
  }>();

  // 1. Indexar ventas reales desde transacciones
  for (const tx of transactions) {
    if (!isRealSaleTransaction(tx)) continue;
    const txId = tx.id ? String(tx.id) : `TX-TEMP-${Math.random()}`;
    purchaseMap.set(txId, {
      transactionId: tx.id ? String(tx.id) : null,
      purchaseTx: tx,
      instList: []
    });
  }

  // 2. Asociar cuotas (installments) a sus respectivas ventas
  for (const inst of installments) {
    if (!inst) continue;
    const txId = inst.transactionId ? String(inst.transactionId) : null;
    if (txId && purchaseMap.has(txId)) {
      purchaseMap.get(txId)!.instList.push(inst);
    } else if (txId) {
      // Venta a crédito que tiene transactionId pero no vino en transactions_db
      purchaseMap.set(txId, {
        transactionId: txId,
        purchaseTx: null,
        instList: [inst]
      });
    }
    // NOTA: Si inst no tiene transactionId (saldo anterior / deuda abierta legacy), NO es una compra y no se indexa aquí.
  }

  const allPurchases: ClientPurchaseRecord[] = [];

  for (const [key, entry] of purchaseMap.entries()) {
    const { transactionId, purchaseTx, instList } = entry;

    // Normalizar items
    const rawItems: any[] = purchaseTx?.items && Array.isArray(purchaseTx.items) ? purchaseTx.items : [];
    const items: ClientPurchaseItem[] = rawItems.map(it => ({
      name: it.name || it.productName || it.nombre || it.productId || 'Producto',
      quantity: Number(it.quantity || it.quantityKg || it.cantidad || 1),
      unitPrice: it.price !== undefined ? Number(it.price) : (it.unitPrice !== undefined ? Number(it.unitPrice) : undefined),
      subtotal: Number(it.subtotal || it.total || (Number(it.quantity || 1) * Number(it.price || 0)))
    }));

    // Ordenar cuotas
    const sortedInstList = [...instList].sort((a, b) => {
      const numA = a.installmentNumber != null ? Number(a.installmentNumber) : 999;
      const numB = b.installmentNumber != null ? Number(b.installmentNumber) : 999;
      if (numA !== numB) return numA - numB;
      const dateA = parseSafeDate(a.dueDate)?.getTime() ?? 0;
      const dateB = parseSafeDate(b.dueDate)?.getTime() ?? 0;
      return dateA - dateB;
    });

    const foodInstallments = sortedInstList.filter(i => (i as any).type === 'cotidiano');
    const otherInstallments = sortedInstList.filter(i => (i as any).type !== 'cotidiano');

    // Asociar pagos
    const instIdSet = new Set(sortedInstList.map(i => String(i.id)));
    const matchedPayments = payments.filter(p => {
      if (!p) return false;
      const matchTx = transactionId && p.transactionId && String(p.transactionId) === String(transactionId);
      const matchInst = p.installmentId && instIdSet.has(String(p.installmentId));
      return Boolean(matchTx || matchInst);
    });

    // Dedupe pagos por id
    const uniquePayments: any[] = [];
    const seenPaymentIds = new Set<string>();
    for (const p of matchedPayments) {
      const pid = String(p.id || `${p.reference}-${p.amount}-${p.date}`);
      if (!seenPaymentIds.has(pid)) {
        seenPaymentIds.add(pid);
        uniquePayments.push(p);
      }
    }

    uniquePayments.sort((a, b) => {
      const tA = parseSafeDate(a.date || a.timestamp || a.createdAt)?.getTime() ?? 0;
      const tB = parseSafeDate(b.date || b.timestamp || b.createdAt)?.getTime() ?? 0;
      return tB - tA;
    });

    // Cálculos de totales
    let saleTotal = 0;
    let financedAmount = 0;
    let paidAmount = 0;
    let remainingAmount = 0;

    const hasInstallments = sortedInstList.length > 0;

    if (hasInstallments) {
      for (const inst of sortedInstList) {
        const total = Number((inst as any).amountUSD ?? inst.amount ?? 0);
        const paid = Number(inst.paidAmount ?? 0);
        const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

        financedAmount += total;
        paidAmount += paid;
        remainingAmount += remaining;
      }

      financedAmount = Math.round(financedAmount * 100) / 100;
      paidAmount = Math.round(paidAmount * 100) / 100;
      remainingAmount = Math.round(remainingAmount * 100) / 100;

      // Si tenemos la transacción de venta, el saleTotal es el monto total de la venta
      // (que puede incluir inicial + financiado). Si no, es al menos el financiado.
      if (purchaseTx) {
        saleTotal = Number(purchaseTx.totalUSD ?? purchaseTx.amount ?? financedAmount);
        const downPayment = Number(purchaseTx.downPayment ?? purchaseTx.kaluCreditData?.inicial ?? 0);
        if (downPayment > 0) {
          paidAmount = Math.round((paidAmount + downPayment) * 100) / 100;
        }
      } else {
        saleTotal = financedAmount;
      }
    } else {
      // Venta al contado sin cuotas
      saleTotal = Number(purchaseTx?.totalUSD ?? purchaseTx?.amount ?? 0);
      financedAmount = 0;
      paidAmount = saleTotal;
      remainingAmount = 0;
    }

    // Determinar estado de la compra
    const isCancelled = isCancelledPurchase(purchaseTx);
    let status: 'pending' | 'overdue' | 'in_review' | 'paid' | 'cancelled' = 'pending';

    if (isCancelled) {
      status = 'cancelled';
    } else if (remainingAmount <= 0.001) {
      status = 'paid';
    } else {
      const hasInReview = sortedInstList.some(i => i.status === 'in_review');
      const hasOverdue = sortedInstList.some(i => {
        const rem = Number((i as any).amountUSD ?? i.amount ?? 0) - Number(i.paidAmount ?? 0);
        return rem > 0.001 && i.status === 'overdue';
      });

      if (hasInReview) {
        status = 'in_review';
      } else if (hasOverdue) {
        status = 'overdue';
      } else {
        status = 'pending';
      }
    }

    // Próximo vencimiento
    let nextDueDate: string | null = null;
    const unpaidInsts = sortedInstList.filter(i => {
      const rem = Number((i as any).amountUSD ?? i.amount ?? 0) - Number(i.paidAmount ?? 0);
      return rem > 0.001 && i.status !== 'paid';
    });
    if (unpaidInsts.length > 0) {
      const sortedByDue = [...unpaidInsts].sort((a, b) => {
        const timeA = parseSafeDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const timeB = parseSafeDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return timeA - timeB;
      });
      nextDueDate = sortedByDue[0].dueDate || null;
    }

    // Fecha de compra
    const rawDate = purchaseTx?.date || purchaseTx?.timestamp || purchaseTx?.createdAt || sortedInstList[0]?.createdAt;
    const purchaseDate = formatDisplayDate(rawDate);

    // Número de factura
    const invoiceNumber = purchaseTx?.invoiceNumber || (transactionId ? `FAC-${String(transactionId).replace(/^TX-/, '')}` : 'Factura Kalu');
    const paymentMethod = purchaseTx?.paymentMethod || (hasInstallments ? 'Crédito Kalú' : 'Contado');
    const isCredit = hasInstallments || paymentMethod.toLowerCase().includes('crédito') || purchaseTx?.category === 'credito';

    allPurchases.push({
      purchaseId: key,
      transactionId,
      purchase: purchaseTx,
      installments: sortedInstList,
      foodInstallments,
      otherInstallments,
      payments: uniquePayments,
      saleTotal: Math.round(saleTotal * 100) / 100,
      financedAmount,
      paidAmount,
      remainingAmount,
      status,
      purchaseDate,
      invoiceNumber,
      items,
      paymentMethod,
      isCredit,
      nextDueDate,
      cancelledAt: purchaseTx?.isVoided ? 'Anulada' : undefined
    });
  }

  // Ordenar todas las compras de más reciente a más antigua
  allPurchases.sort((a, b) => {
    const rawDateA = a.purchase?.date || a.purchase?.timestamp || a.purchase?.createdAt || a.installments[0]?.createdAt;
    const rawDateB = b.purchase?.date || b.purchase?.timestamp || b.purchase?.createdAt || b.installments[0]?.createdAt;
    const tA = parseSafeDate(rawDateA)?.getTime() ?? 0;
    const tB = parseSafeDate(rawDateB)?.getTime() ?? 0;
    if (tB !== tA) return tB - tA;
    return String(b.purchaseId).localeCompare(String(a.purchaseId));
  });

  // Clasificar en las tres pestañas
  const porPagar = allPurchases.filter(p => p.status !== 'cancelled' && p.status !== 'paid' && p.remainingAmount > 0.001);
  const pagadas = allPurchases.filter(p => p.status === 'paid' && p.remainingAmount <= 0.001);
  const canceladas = allPurchases.filter(p => p.status === 'cancelled');

  return {
    allPurchases,
    porPagar,
    pagadas,
    canceladas
  };
}
