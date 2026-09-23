/**
 * Motor Puro de Expedientes y Cobranzas Mundo Kalu
 * Exclusivo para CRÉDITO MUNDO KALU
 *
 * Reglas Arquitectónicas:
 * 1. Deriva los expedientes y saldos deudores ÚNICAMENTE de las cuotas / ventas reales de Mundo Kalu.
 * 2. NO contamina el saldo con outstandingDebt general del CRM.
 * 3. Si un cliente tiene outstandingDebt general pero 0 cuotas Mundo Kalu, NO entra al expediente Mundo Kalu.
 */

import type { ClientProfile, DebtInstallment, Transaction } from '../types.ts';
import { formatDisplayDate, parseSafeDate } from './debtGrouping.ts';

export interface PWAPaymentReport {
  id: string;
  type?: 'cliente' | 'productor' | 'credito_cashea';
  clientId?: string;
  entityId: string;
  entityName: string;
  amount: number;
  amountBs?: number;
  currency?: 'USD' | 'VES' | string;
  reference: string;
  method?: string;
  paymentMethod?: string;
  status: 'pending' | 'in_review' | 'approved' | 'rejected';
  date: string;
  timestamp?: any;
  installmentId?: string;
  installmentIds?: string[];
  receiptImageUrl?: string;
  receiptImage?: string;
  notes?: string;
  transactionId?: string;
  casheaData?: {
    inicial: number;
    aFinanciar: number;
    cuotas: number;
    tienda: string;
  };
}

export interface KaluSaleExpediente {
  saleKey: string;
  transactionId: string | null;
  purchase: Transaction | null;
  invoiceNumber: string;
  purchaseDate: string;
  totalAmount: number;
  financedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'pending' | 'overdue' | 'in_review' | 'paid';
  installments: DebtInstallment[];
  payments: PWAPaymentReport[];
}

export interface KaluClientExpediente {
  client: ClientProfile;
  totalFinancedDebt: number;
  totalRemainingDebt: number;
  totalPaid: number;
  sales: KaluSaleExpediente[];
}

export function buildKaluClientExpedientes(params: {
  clients: ClientProfile[];
  installments: DebtInstallment[];
  transactions: Transaction[];
  payments: PWAPaymentReport[];
}): KaluClientExpediente[] {
  const { clients, installments = [], transactions = [], payments = [] } = params;

  // 1. Indexar cuotas reales exclusivamente por clientId
  const instByClient = new Map<string, DebtInstallment[]>();
  for (const inst of installments) {
    if (!inst) continue;
    const cId = String(inst.clientId || (inst as any).client_id || '');
    if (!cId) continue;
    if (!instByClient.has(cId)) {
      instByClient.set(cId, []);
    }
    instByClient.get(cId)!.push(inst);
  }

  // 2. Un cliente pertenece a Expedientes Mundo Kalu ÚNICAMENTE si tiene cuotas Mundo Kalu
  const relevantClientIds = Array.from(instByClient.keys());

  const result: KaluClientExpediente[] = [];

  for (const cId of relevantClientIds) {
    const client = clients.find(c => String(c.id) === String(cId)) || {
      id: cId,
      name: `Cliente #${cId}`,
      outstandingDebt: 0,
      loyaltyPoints: 0,
      phone: '',
      tier: 'K1'
    } as ClientProfile;

    const clientInstList = instByClient.get(cId) || [];
    const clientPayments = payments.filter(p => String(p.clientId || p.entityId) === String(cId));

    // Agrupar cuotas por venta (transactionId)
    const salesMap = new Map<string, DebtInstallment[]>();
    for (const inst of clientInstList) {
      const txId = inst.transactionId ? String(inst.transactionId) : `inst-single-${inst.id}`;
      if (!salesMap.has(txId)) {
        salesMap.set(txId, []);
      }
      salesMap.get(txId)!.push(inst);
    }

    const clientSales: KaluSaleExpediente[] = [];
    let clientTotalFinanced = 0;
    let clientTotalRemaining = 0;
    let clientTotalPaid = 0;

    for (const [saleKey, instList] of salesMap.entries()) {
      // Ordenar cuotas de forma determinista (1, 2, 3...)
      const sortedInstList = [...instList].sort((a, b) => {
        const numA = Number((a as any).installmentNumber ?? 0);
        const numB = Number((b as any).installmentNumber ?? 0);
        if (numA !== numB && numA > 0 && numB > 0) return numA - numB;
        const timeA = parseSafeDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const timeB = parseSafeDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (timeA !== timeB) return timeA - timeB;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

      const realTxId = instList[0]?.transactionId ? String(instList[0].transactionId) : null;
      const purchase = realTxId ? (transactions.find(t => String(t.id) === String(realTxId)) || null) : null;

      let saleFinanced = 0;
      let salePaid = 0;
      let saleRemaining = 0;
      let hasOverdue = false;
      let hasInReview = false;

      for (const inst of sortedInstList) {
        const total = Number((inst as any).amountUSD ?? inst.amount ?? 0);
        const paid = Number(inst.paidAmount ?? 0);
        const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

        saleFinanced += total;
        salePaid += paid;
        saleRemaining += remaining;

        if (inst.status === 'in_review') hasInReview = true;
        if (inst.status === 'overdue' && remaining > 0.001) hasOverdue = true;
      }

      saleFinanced = Math.round(saleFinanced * 100) / 100;
      salePaid = Math.round(salePaid * 100) / 100;
      saleRemaining = Math.round(saleRemaining * 100) / 100;

      clientTotalFinanced += saleFinanced;
      clientTotalPaid += salePaid;
      clientTotalRemaining += saleRemaining;

      const saleStatus: 'pending' | 'overdue' | 'in_review' | 'paid' =
        saleRemaining <= 0.001 ? 'paid' :
        hasInReview ? 'in_review' :
        hasOverdue ? 'overdue' : 'pending';

      const instIdSet = new Set(sortedInstList.map(i => String(i.id)));
      const matchedPayments = clientPayments.filter(p => {
        const matchTx = realTxId && p.transactionId && String(p.transactionId) === String(realTxId);
        const matchInst = p.installmentId && instIdSet.has(String(p.installmentId));
        return Boolean(matchTx || matchInst);
      });

      const invoiceNumber = purchase?.invoiceNumber || (realTxId ? `TX-${realTxId.replace('TX-', '').slice(-6)}` : `Cuota #${sortedInstList[0]?.id}`);
      const purchaseDate = purchase?.date || (sortedInstList[0]?.dueDate ? formatDisplayDate(sortedInstList[0].dueDate) : 'Reciente');

      clientSales.push({
        saleKey,
        transactionId: realTxId,
        purchase,
        invoiceNumber,
        purchaseDate,
        totalAmount: Number(purchase?.amount || saleFinanced),
        financedAmount: saleFinanced,
        paidAmount: salePaid,
        remainingAmount: saleRemaining,
        status: saleStatus,
        installments: sortedInstList,
        payments: matchedPayments
      });
    }

    // Ordenar ventas: pendientes primero, luego por fecha reciente
    clientSales.sort((a, b) => {
      if (a.remainingAmount > 0 && b.remainingAmount <= 0) return -1;
      if (b.remainingAmount > 0 && a.remainingAmount <= 0) return 1;
      return (b.transactionId || '').localeCompare(a.transactionId || '');
    });

    result.push({
      client,
      totalFinancedDebt: Math.round(clientTotalFinanced * 100) / 100,
      totalRemainingDebt: Math.round(clientTotalRemaining * 100) / 100,
      totalPaid: Math.round(clientTotalPaid * 100) / 100,
      sales: clientSales
    });
  }

  // Ordenar clientes por mayor saldo deudor Mundo Kalu
  return result.sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt);
}
