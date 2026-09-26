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
    creditTx: Transaction | null;
    instList: DebtInstallment[];
  }>();

  // 1. Separar transacciones de venta POS y de crédito
  const saleTxs: Transaction[] = [];
  const creditTxs: Transaction[] = [];
  const otherTxs: Transaction[] = [];

  for (const tx of transactions) {
    if (!isRealSaleTransaction(tx)) continue;
    if (tx.category === 'credito') {
      creditTxs.push(tx);
    } else if (tx.category === 'ventas' || (Array.isArray(tx.items) && tx.items.length > 0)) {
      saleTxs.push(tx);
    } else {
      otherTxs.push(tx);
    }
  }

  // Mapa auxiliar para asociar transacciones de crédito a transacciones de venta POS
  const linkedCreditTxIds = new Set<string>();

  // Indexar ventas POS
  for (const saleTx of saleTxs) {
    const saleId = saleTx.id ? String(saleTx.id) : `TX-TEMP-${Math.random()}`;
    
    // Buscar si esta venta POS está vinculada a alguna transacción de crédito (por addedPayments.reference o IDs)
    let matchingCreditTx: Transaction | null = null;
    if (Array.isArray(saleTx.addedPayments)) {
      for (const p of saleTx.addedPayments) {
        if (!p || !p.reference) continue;
        const ref = String(p.reference).trim();
        const found = creditTxs.find(c =>
          String(c.id).trim() === ref ||
          String(c.invoiceNumber).trim() === ref ||
          (c.id && ref.includes(String(c.id))) ||
          (c.invoiceNumber && ref.includes(String(c.invoiceNumber)))
        );
        if (found) {
          matchingCreditTx = found;
          linkedCreditTxIds.add(String(found.id));
          break;
        }
      }
    }

    // Si no se encontró por addedPayments, buscar por coincidencia de invoiceNumber o id directo
    if (!matchingCreditTx) {
      const found = creditTxs.find(c =>
        (saleTx.invoiceNumber && c.invoiceNumber && String(saleTx.invoiceNumber) === String(c.invoiceNumber)) ||
        (saleTx.id && c.id && String(saleTx.id) === String(c.id))
      );
      if (found) {
        matchingCreditTx = found;
        linkedCreditTxIds.add(String(found.id));
      }
    }

    purchaseMap.set(saleId, {
      transactionId: saleTx.id ? String(saleTx.id) : null,
      purchaseTx: saleTx,
      creditTx: matchingCreditTx,
      instList: []
    });
  }

  // Indexar transacciones de crédito no vinculadas (ej. ventas directas a crédito sin factura POS separada)
  for (const creditTx of creditTxs) {
    const creditId = creditTx.id ? String(creditTx.id) : `TX-TEMP-${Math.random()}`;
    if (linkedCreditTxIds.has(creditId)) continue;

    purchaseMap.set(creditId, {
      transactionId: creditTx.id ? String(creditTx.id) : null,
      purchaseTx: creditTx,
      creditTx: creditTx,
      instList: []
    });
  }

  // Indexar otras transacciones de venta
  for (const otherTx of otherTxs) {
    const otherId = otherTx.id ? String(otherTx.id) : `TX-TEMP-${Math.random()}`;
    if (purchaseMap.has(otherId)) continue;
    purchaseMap.set(otherId, {
      transactionId: otherTx.id ? String(otherTx.id) : null,
      purchaseTx: otherTx,
      creditTx: null,
      instList: []
    });
  }

  // 2. Asociar cuotas (installments) a sus respectivas ventas
  for (const inst of installments) {
    if (!inst) continue;
    const txId = inst.transactionId ? String(inst.transactionId) : null;
    if (!txId) continue;

    // Buscar si coincide con purchaseMap directo (saleId o creditId)
    let foundEntry = purchaseMap.get(txId);
    if (!foundEntry) {
      // Buscar en entradas donde creditTx.id coincida con txId o creditTx.invoiceNumber coincida
      for (const entry of purchaseMap.values()) {
        if (
          (entry.creditTx && String(entry.creditTx.id) === txId) ||
          (entry.creditTx?.invoiceNumber && String(entry.creditTx.invoiceNumber) === txId) ||
          (entry.purchaseTx && String(entry.purchaseTx.id) === txId) ||
          (entry.purchaseTx?.invoiceNumber && String(entry.purchaseTx.invoiceNumber) === txId)
        ) {
          foundEntry = entry;
          break;
        }
      }
    }

    if (foundEntry) {
      foundEntry.instList.push(inst);
    } else {
      // Venta a crédito que tiene transactionId pero no vino en transactions_db
      purchaseMap.set(txId, {
        transactionId: txId,
        purchaseTx: null,
        creditTx: null,
        instList: [inst]
      });
    }
  }

  const allPurchases: ClientPurchaseRecord[] = [];

  for (const [key, entry] of purchaseMap.entries()) {
    const { transactionId, purchaseTx, creditTx, instList } = entry;

    // Normalizar items (preferir purchaseTx, luego creditTx)
    const rawItems: any[] = (purchaseTx?.items && Array.isArray(purchaseTx.items) && purchaseTx.items.length > 0)
      ? purchaseTx.items
      : (creditTx?.items && Array.isArray(creditTx.items) ? creditTx.items : []);
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
        saleTotal = Number(purchaseTx.totalUSD ?? purchaseTx.amount ?? (creditTx ? (creditTx.totalUSD ?? creditTx.amount) : financedAmount));
        let downPayment = Number(
          purchaseTx.downPayment ??
          purchaseTx.kaluCreditData?.inicial ??
          creditTx?.downPayment ??
          creditTx?.kaluCreditData?.inicial ??
          0
        );

        // Si downPayment no vino explícito pero tenemos addedPayments físicos en la venta POS
        if (downPayment <= 0 && Array.isArray(purchaseTx.addedPayments)) {
          const physicalAbono = purchaseTx.addedPayments
            .filter((p: any) => p && p.method !== 'Mundo Kalu')
            .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
          if (physicalAbono > 0) {
            downPayment = physicalAbono;
          }
        }

        if (downPayment > 0) {
          paidAmount = Math.round((paidAmount + downPayment) * 100) / 100;
        }
      } else {
        saleTotal = creditTx ? Number(creditTx.totalUSD ?? creditTx.amount ?? financedAmount) : financedAmount;
        const downPayment = Number(creditTx?.downPayment ?? creditTx?.kaluCreditData?.inicial ?? 0);
        if (downPayment > 0) {
          paidAmount = Math.round((paidAmount + downPayment) * 100) / 100;
        }
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
