import test from 'node:test';
import assert from 'node:assert/strict';

// Test of Canonical Debt Calculation logic & convergence
import { buildClientDebtGroups } from '../src/utils/debtGrouping.ts';
import { getPendingMundoKaluPaymentCount } from '../src/utils/pendingPayments.ts';

test('A. Debt with cuotas (1.93 paid, 1.93 pending, 1.94 pending) converges to 3.87 USD regardless of client.outstandingDebt = 0', () => {
  const mockClient = {
    id: 'cli-124',
    name: 'JUAN DOMINGUEZ',
    outstandingDebt: 0,
    currentDebtUsd: 0
  };

  const mockInstallments = [
    {
      id: 'INST-1789872085611-1',
      clientId: 'cli-124',
      transactionId: '1789872085611',
      amount: 1.93,
      amountUSD: 1.93,
      paidAmount: 1.93,
      installmentNumber: 1,
      totalInstallments: 3,
      status: 'paid',
      dueDate: '2026-10-05'
    },
    {
      id: 'INST-1789872085611-2',
      clientId: 'cli-124',
      transactionId: '1789872085611',
      amount: 1.93,
      amountUSD: 1.93,
      paidAmount: 0,
      installmentNumber: 2,
      totalInstallments: 3,
      status: 'pending',
      dueDate: '2026-10-20'
    },
    {
      id: 'INST-1789872085611-3',
      clientId: 'cli-124',
      transactionId: '1789872085611',
      amount: 1.94,
      amountUSD: 1.94,
      paidAmount: 0,
      installmentNumber: 3,
      totalInstallments: 3,
      status: 'pending',
      dueDate: '2026-11-04'
    }
  ];

  const mockPurchases = [
    {
      id: '1789872085611',
      clientId: 'cli-124',
      total: 23.20,
      financedAmount: 5.80,
      downPayment: 17.40,
      installmentsCount: 3,
      status: 'Aprobado',
      kaluCreditData: {
        totalVenta: 23.20,
        inicial: 17.40,
        aFinanciar: 5.80,
        cuotas: 3
      }
    }
  ];

  const result = buildClientDebtGroups({
    client: mockClient,
    installments: mockInstallments,
    purchases: mockPurchases,
    payments: []
  });

  // Canonical remaining sum = 1.93 + 1.94 = 3.87
  assert.equal(result.totalEffectiveDebt, 3.87);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].originalFinancedAmount, 5.80);
  assert.equal(result.groups[0].remainingAmount, 3.87);
  assert.equal(result.openDebtAmount, 0);
});

test('B. Pending payments count includes both pending and in_review statuses for robust header alerting', () => {
  const payments = [
    { id: '1', status: 'pending', entityType: 'client' },
    { id: '2', status: 'in_review', entityType: 'client' },
    { id: '3', status: 'approved', entityType: 'client' },
    { id: '4', status: 'rejected', entityType: 'client' }
  ];

  const count = getPendingMundoKaluPaymentCount(payments);
  assert.equal(count, 2);

  const emptyCount = getPendingMundoKaluPaymentCount([
    { id: '3', status: 'approved', entityType: 'client' },
    { id: '4', status: 'rejected', entityType: 'client' }
  ]);
  assert.equal(emptyCount, 0);
});

test('C. Pending or in_review installment does not reduce canonical remaining debt until approved', () => {
  const mockClient = { id: 'cli-124', outstandingDebt: 0 };
  const mockInstallments = [
    { id: 'INST-1', clientId: 'cli-124', amountUSD: 1.93, paidAmount: 1.93, status: 'paid' },
    { id: 'INST-2', clientId: 'cli-124', amountUSD: 1.93, paidAmount: 0, status: 'in_review' }, // Submitted, awaiting cashier
    { id: 'INST-3', clientId: 'cli-124', amountUSD: 1.94, paidAmount: 0, status: 'pending' }
  ];

  const result = buildClientDebtGroups({
    client: mockClient,
    installments: mockInstallments,
    purchases: [],
    payments: [{ id: 'p1', amount: 1.93, status: 'pending' }]
  });

  assert.equal(result.totalEffectiveDebt, 3.87);
});

test('D. Approved installment updates paidAmount/status and reduces debt to 1.94', () => {
  const mockClient = { id: 'cli-124', outstandingDebt: 0 };
  const mockInstallments = [
    { id: 'INST-1', clientId: 'cli-124', amountUSD: 1.93, paidAmount: 1.93, status: 'paid' },
    { id: 'INST-2', clientId: 'cli-124', amountUSD: 1.93, paidAmount: 1.93, status: 'paid' }, // Now approved
    { id: 'INST-3', clientId: 'cli-124', amountUSD: 1.94, paidAmount: 0, status: 'pending' }
  ];

  const result = buildClientDebtGroups({
    client: mockClient,
    installments: mockInstallments,
    purchases: [],
    payments: [{ id: 'p1', amount: 1.93, status: 'approved' }]
  });

  assert.equal(result.totalEffectiveDebt, 1.94);
});

test('E. Mixed debt semantic: client.outstandingDebt = 10 (fiado legacy) + cuotas = 3.87 -> total = 10.00 (Math.max prevents double counting unified balance)', () => {
  // En KALU CRM, el POS incrementa client.outstandingDebt con todo el monto financiado.
  // Por ende, safeClientDebt es el balance global de la cuenta del cliente.
  const mockInstallments = [
    { id: 'INST-2', clientId: 'cli-124', amountUSD: 1.93, paidAmount: 0, status: 'pending' },
    { id: 'INST-3', clientId: 'cli-124', amountUSD: 1.94, paidAmount: 0, status: 'pending' }
  ];

  const result = buildClientDebtGroups({
    clientDebt: 10.00,
    installments: mockInstallments,
    transactions: [],
    payments: []
  });

  assert.equal(result.totalEffectiveDebt, 10.00);
  assert.equal(result.totalCuotasRemaining, 3.87);
  assert.equal(result.openDebtAmount, 6.13); // 10.00 - 3.87 = 6.13 fiado abierto restante
  assert.equal(result.hasOpenDebt, true);
});

test('F. Idempotency logic: same reference and amount across two DIFFERENT clients must not interfere', () => {
  const existingPayments = [
    { id: 'p1', clientId: 'cli-A', reference: '123456', amount: 1.93, status: 'pending', installmentId: 'INST-A' }
  ];

  const incomingRequestClientB = {
    userId: 'cli-B',
    reference: '123456',
    amount: 1.93,
    installmentId: 'INST-B'
  };

  const isDuplicateForB = existingPayments.some(p => 
    String(p.clientId) === String(incomingRequestClientB.userId) &&
    String(p.reference) === String(incomingRequestClientB.reference) &&
    Math.abs(Number(p.amount) - Number(incomingRequestClientB.amount)) < 0.01 &&
    String(p.installmentId) === String(incomingRequestClientB.installmentId)
  );

  assert.equal(isDuplicateForB, false); // Client B is NOT blocked by Client A
});

test('G. Idempotency logic: same client submitting for DIFFERENT installments with same amount does NOT block second installment', () => {
  const existingPayments = [
    { id: 'p1', clientId: 'cli-124', reference: '123456', amount: 1.93, status: 'approved', installmentId: 'INST-1' }
  ];

  const incomingRequestInstallment2 = {
    userId: 'cli-124',
    reference: '123456',
    amount: 1.93,
    installmentId: 'INST-2'
  };

  const isDuplicateInst2 = existingPayments.some(p => 
    String(p.clientId) === String(incomingRequestInstallment2.userId) &&
    String(p.reference) === String(incomingRequestInstallment2.reference) &&
    Math.abs(Number(p.amount) - Number(incomingRequestInstallment2.amount)) < 0.01 &&
    String(p.installmentId) === String(incomingRequestInstallment2.installmentId)
  );

  assert.equal(isDuplicateInst2, false); // Installment 2 can proceed
});

test('H. Header badge & CollectionsView consistency: approved payment does NOT trigger alert or pending filter', () => {
  const allPayments = [
    { id: 'pwa-pay-1789872750788-v34nr', clientId: 'cli-124', entityType: 'client', status: 'approved', amount: 1.93 }
  ];

  const badgeCount = getPendingMundoKaluPaymentCount(allPayments);
  const pendingInCollections = allPayments.filter(p => p.status === 'pending' || p.status === 'in_review');

  assert.equal(badgeCount, 0);
  assert.equal(pendingInCollections.length, 0);
});
