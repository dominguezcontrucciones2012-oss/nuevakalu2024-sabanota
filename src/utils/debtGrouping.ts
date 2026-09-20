/**
 * Helper Puro de Agrupación de Deudas y Cuotas por Compra (Fase 3A.1)
 * KALU CRM Oficial / Sabanota
 *
 * Regla Canónica: UNA COMPRA (transactionId) = UN ACORDEÓN.
 * No inventa transactionId para registros legacy (usa groupKey interno para la UI).
 */

import type { DebtInstallment, Transaction } from '../types.ts';

export interface DebtGroup {
  groupKey: string;
  transactionId: string | null;
  purchase: Transaction | null;
  installments: DebtInstallment[];
  foodInstallments: DebtInstallment[];
  otherInstallments: DebtInstallment[];
  payments: any[];
  originalFinancedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  nextDueDate: string | null;
  status: 'pending' | 'overdue' | 'in_review' | 'paid';
}

export interface ClientDebtOverview {
  groups: DebtGroup[];
  activeGroups: DebtGroup[];
  paidGroups: DebtGroup[];
  totalEffectiveDebt: number;
  totalCuotasRemaining: number;
  openDebtAmount: number;
  hasOpenDebt: boolean;
  openDebtPayments: any[];
}

/**
 * Parsea una fecha de forma segura soportando ISO, YYYY-MM-DD y DD/MM/YYYY o timestamps.
 */
export function parseSafeDate(dateStr?: string | number | null): Date | null {
  if (!dateStr) return null;
  if (typeof dateStr === 'number') {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(dateStr).trim();
  if (!str) return null;

  // 1. Formato simple YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    const localD = new Date(y, m, d);
    return isNaN(localD.getTime()) ? null : localD;
  }

  // 2. Formato simple DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    const localD = new Date(y, m, d);
    return isNaN(localD.getTime()) ? null : localD;
  }

  // 3. Formato ISO completo con hora o timestamp en string
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
}

/**
 * Formatea una fecha de forma consistente en DD/MM/YYYY.
 */
export function formatDisplayDate(dateStr?: string | number | null): string {
  const d = parseSafeDate(dateStr);
  if (!d) return 'Sin fecha';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Agrupa cuotas y pagos asociados por cada compra (transactionId) de forma pura y desacoplada.
 */
export function buildClientDebtGroups({
  installments = [],
  transactions = [],
  payments = [],
  clientDebt = 0
}: {
  installments?: DebtInstallment[];
  transactions?: Transaction[];
  payments?: any[];
  clientDebt?: number;
}): ClientDebtOverview {
  const safeClientDebt = Number(clientDebt || 0);

  // 1. Agrupar installments por transactionId real o por installment individual para legacy
  const rawGroups: Record<string, { groupKey: string; transactionId: string | null; installments: DebtInstallment[] }> = {};

  for (const inst of installments) {
    if (!inst) continue;
    const realTxId = inst.transactionId ? String(inst.transactionId) : null;
    const groupKey = realTxId ? `tx:${realTxId}` : `inst:${inst.id}`;

    if (!rawGroups[groupKey]) {
      rawGroups[groupKey] = {
        groupKey,
        transactionId: realTxId,
        installments: []
      };
    }
    rawGroups[groupKey].installments.push(inst);
  }

  // 2. Procesar cada grupo
  const processedGroups: DebtGroup[] = [];
  const claimedPaymentIds = new Set<string>();

  for (const { groupKey, transactionId, installments: instList } of Object.values(rawGroups)) {
    // Buscar transacción padre si existe transactionId real
    const purchase = transactionId ? (transactions.find(t => String(t.id) === String(transactionId)) || null) : null;

    // Ordenar cuotas de forma determinista: 1. installmentNumber (ascendente), 2. dueDate (ascendente), 3. id (ascendente)
    const sortInstallmentsStable = (list: DebtInstallment[]) => {
      return [...list].sort((a, b) => {
        const numA = Number((a as any).installmentNumber ?? 0);
        const numB = Number((b as any).installmentNumber ?? 0);
        if (numA !== numB && numA > 0 && numB > 0) {
          return numA - numB;
        }
        const timeA = parseSafeDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const timeB = parseSafeDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (timeA !== timeB) {
          return timeA - timeB;
        }
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
    };

    const sortedInstList = sortInstallmentsStable(instList);

    // Subdivisión por tipo (Víveres / cotidiano vs Repuestos / otros)
    const foodInstallments = sortedInstList.filter(i => (i as any).type === 'cotidiano');
    const otherInstallments = sortedInstList.filter(i => (i as any).type !== 'cotidiano');

    // Cálculos de montos
    let originalFinancedAmount = 0;
    let paidAmount = 0;
    let remainingAmount = 0;

    for (const inst of sortedInstList) {
      const total = Number((inst as any).amountUSD ?? inst.amount ?? 0);
      const paid = Number(inst.paidAmount ?? 0);
      const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

      originalFinancedAmount += total;
      paidAmount += paid;
      remainingAmount += remaining;
    }

    originalFinancedAmount = Math.round(originalFinancedAmount * 100) / 100;
    paidAmount = Math.round(paidAmount * 100) / 100;
    remainingAmount = Math.round(remainingAmount * 100) / 100;

    // Determinar estado del grupo
    let status: 'pending' | 'overdue' | 'in_review' | 'paid' = 'pending';
    const allPaid = instList.every(i => i.status === 'paid' || (Number((i as any).amountUSD ?? i.amount ?? 0) - Number(i.paidAmount ?? 0) <= 0.001));
    const hasInReview = instList.some(i => i.status === 'in_review');
    const hasOverdue = instList.some(i => {
      const rem = Number((i as any).amountUSD ?? i.amount ?? 0) - Number(i.paidAmount ?? 0);
      return rem > 0.001 && i.status === 'overdue';
    });

    if (allPaid) {
      status = 'paid';
    } else if (hasInReview) {
      status = 'in_review';
    } else if (hasOverdue) {
      status = 'overdue';
    } else {
      status = 'pending';
    }

    // Calcular próximo vencimiento entre cuotas con saldo pendiente
    const unpaidInstallments = instList.filter(i => {
      const rem = Number((i as any).amountUSD ?? i.amount ?? 0) - Number(i.paidAmount ?? 0);
      return rem > 0.001 && i.status !== 'paid';
    });

    let nextDueDate: string | null = null;
    if (unpaidInstallments.length > 0) {
      const sortedByDue = [...unpaidInstallments].sort((a, b) => {
        const timeA = parseSafeDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const timeB = parseSafeDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return timeA - timeB;
      });
      nextDueDate = sortedByDue[0].dueDate || null;
    }

    // Asociar pagos correspondientes a este grupo
    const groupInstIds = new Set(instList.map(i => String(i.id)));
    const groupPayments = payments.filter(p => {
      if (!p) return false;
      const matchTx = transactionId && p.transactionId && String(p.transactionId) === String(transactionId);
      const matchInst = p.installmentId && groupInstIds.has(String(p.installmentId));
      if (matchTx || matchInst) {
        if (p.id) claimedPaymentIds.add(String(p.id));
        return true;
      }
      return false;
    });

    // Ordenar pagos del grupo descendente
    groupPayments.sort((a, b) => {
      const timeA = parseSafeDate(a.date || a.timestamp || a.createdAt)?.getTime() ?? 0;
      const timeB = parseSafeDate(b.date || b.timestamp || b.createdAt)?.getTime() ?? 0;
      return timeB - timeA;
    });

    processedGroups.push({
      groupKey,
      transactionId,
      purchase,
      installments: sortedInstList,
      foodInstallments,
      otherInstallments,
      payments: groupPayments,
      originalFinancedAmount,
      paidAmount,
      remainingAmount,
      nextDueDate,
      status
    });
  }

  // 3. Ordenar grupos: 1. Overdue, 2. In_review, 3. Pending (por nextDueDate), 4. Paid
  const statusPriority: Record<string, number> = {
    overdue: 1,
    in_review: 2,
    pending: 3,
    paid: 4
  };

  processedGroups.sort((a, b) => {
    const pA = statusPriority[a.status] || 99;
    const pB = statusPriority[b.status] || 99;
    if (pA !== pB) return pA - pB;

    const timeA = parseSafeDate(a.nextDueDate)?.getTime() ?? 0;
    const timeB = parseSafeDate(b.nextDueDate)?.getTime() ?? 0;
    return timeA - timeB;
  });

  const activeGroups = processedGroups.filter(g => g.remainingAmount > 0.001 || g.status === 'in_review');
  const paidGroups = processedGroups.filter(g => g.status === 'paid' && g.remainingAmount <= 0.001);

  // 4. Calcular Deuda Abierta / Saldo Legacy sin cuotas
  const totalCuotasRemaining = Math.round(
    processedGroups.reduce((acc, g) => acc + g.remainingAmount, 0) * 100
  ) / 100;

  const openDebtAmount = Math.max(0, Math.round((safeClientDebt - totalCuotasRemaining) * 100) / 100);
  const hasOpenDebt = openDebtAmount > 0.01;

  // Pagos huérfanos o sin cuota (para deuda abierta)
  const openDebtPayments = payments.filter(p => {
    if (!p) return false;
    if (p.id && claimedPaymentIds.has(String(p.id))) return false;
    return !p.transactionId && !p.installmentId;
  });

  openDebtPayments.sort((a, b) => {
    const timeA = parseSafeDate(a.date || a.timestamp || a.createdAt)?.getTime() ?? 0;
    const timeB = parseSafeDate(b.date || b.timestamp || b.createdAt)?.getTime() ?? 0;
    return timeB - timeA;
  });

  const totalEffectiveDebt = Math.max(safeClientDebt, totalCuotasRemaining);

  return {
    groups: processedGroups,
    activeGroups,
    paidGroups,
    totalEffectiveDebt,
    totalCuotasRemaining,
    openDebtAmount,
    hasOpenDebt,
    openDebtPayments
  };
}
