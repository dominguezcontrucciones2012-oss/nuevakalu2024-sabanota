/**
 * Suite de Pruebas Unitarias — FASE 3A y 3A.1: Helper de Agrupación de Deudas
 * KALU CRM Oficial / Sabanota
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientDebtGroups, parseSafeDate, formatDisplayDate } from '../src/utils/debtGrouping.ts';

describe('FASE 3A: Tests Unitarios del Helper Puro buildClientDebtGroups', () => {

  // TEST 1: Una compra, 3 cuotas (10/10/10, paid 10/4/0) -> original 30, pagado 14, remaining 16
  it('TEST 1: Calcula correctamente originalFinancedAmount=30, paidAmount=14 y remainingAmount=16', () => {
    const installments = [
      { id: 'inst-1', transactionId: 'TX-100', amountUSD: 10, paidAmount: 10, status: 'paid', dueDate: '2026-10-01' },
      { id: 'inst-2', transactionId: 'TX-100', amountUSD: 10, paidAmount: 4, status: 'pending', dueDate: '2026-10-15' },
      { id: 'inst-3', transactionId: 'TX-100', amountUSD: 10, paidAmount: 0, status: 'pending', dueDate: '2026-10-30' }
    ];

    const result = buildClientDebtGroups({
      installments,
      transactions: [{ id: 'TX-100', amount: 30, invoiceNumber: 'INV-100' }],
      clientDebt: 16
    });

    assert.strictEqual(result.groups.length, 1);
    const g = result.groups[0];
    assert.strictEqual(g.originalFinancedAmount, 30);
    assert.strictEqual(g.paidAmount, 14);
    assert.strictEqual(g.remainingAmount, 16);
    assert.strictEqual(g.status, 'pending');
    assert.strictEqual(g.nextDueDate, '2026-10-15');
  });

  // TEST 2: Compra mixta: 1 cotidiano + 3 repuestos con mismo transactionId -> UN solo grupo con 4 installments
  it('TEST 2: Compra mixta genera UN solo grupo conteniendo 1 cuota de alimento y 3 de repuestos', () => {
    const installments = [
      { id: 'inst-food-1', transactionId: 'TX-MIXTO', type: 'cotidiano', amountUSD: 10, paidAmount: 0, status: 'pending' },
      { id: 'inst-rep-1', transactionId: 'TX-MIXTO', type: 'repuestos', amountUSD: 10, paidAmount: 0, status: 'pending' },
      { id: 'inst-rep-2', transactionId: 'TX-MIXTO', type: 'repuestos', amountUSD: 10, paidAmount: 0, status: 'pending' },
      { id: 'inst-rep-3', transactionId: 'TX-MIXTO', type: 'repuestos', amountUSD: 10, paidAmount: 0, status: 'pending' }
    ];

    const result = buildClientDebtGroups({
      installments,
      transactions: [{ id: 'TX-MIXTO', amount: 40 }],
      clientDebt: 40
    });

    assert.strictEqual(result.groups.length, 1);
    const g = result.groups[0];
    assert.strictEqual(g.installments.length, 4);
    assert.strictEqual(g.foodInstallments.length, 1);
    assert.strictEqual(g.otherInstallments.length, 3);
    assert.strictEqual(g.originalFinancedAmount, 40);
  });

  // TEST 3: Dos transactionId distintos -> DOS acordeones
  it('TEST 3: Dos transactionId distintos producen exactamente DOS grupos/acordeones separados', () => {
    const installments = [
      { id: 'inst-a1', transactionId: 'TX-AAA', amountUSD: 15, paidAmount: 0, status: 'pending' },
      { id: 'inst-b1', transactionId: 'TX-BBB', amountUSD: 25, paidAmount: 0, status: 'pending' }
    ];

    const result = buildClientDebtGroups({
      installments,
      transactions: [
        { id: 'TX-AAA', amount: 15 },
        { id: 'TX-BBB', amount: 25 }
      ],
      clientDebt: 40
    });

    assert.strictEqual(result.groups.length, 2);
    const txIds = result.groups.map(g => g.transactionId);
    assert.ok(txIds.includes('TX-AAA'));
    assert.ok(txIds.includes('TX-BBB'));
  });

  // TEST 4: payment con transactionId -> aparece solo en el grupo correcto
  it('TEST 4: Pago con transactionId se asocia exclusivamente a la compra correspondiente', () => {
    const installments = [
      { id: 'inst-a', transactionId: 'TX-1', amountUSD: 20, paidAmount: 5, status: 'pending' },
      { id: 'inst-b', transactionId: 'TX-2', amountUSD: 30, paidAmount: 0, status: 'pending' }
    ];

    const payments = [
      { id: 'pwa-1', transactionId: 'TX-1', amount: 5, status: 'approved' }
    ];

    const result = buildClientDebtGroups({
      installments,
      payments,
      clientDebt: 45
    });

    const g1 = result.groups.find(g => g.transactionId === 'TX-1');
    const g2 = result.groups.find(g => g.transactionId === 'TX-2');

    assert.strictEqual(g1?.payments.length, 1);
    assert.strictEqual(g1?.payments[0].id, 'pwa-1');
    assert.strictEqual(g2?.payments.length, 0);
  });

  // TEST 5: payment legacy con installmentId pero sin transactionId -> fallback al grupo correcto
  it('TEST 5: Pago legacy con installmentId pero sin transactionId se vincula al grupo correcto por fallback', () => {
    const installments = [
      { id: 'inst-target', transactionId: 'TX-TARGET', amountUSD: 20, paidAmount: 10, status: 'pending' }
    ];

    const payments = [
      { id: 'pwa-legacy', installmentId: 'inst-target', transactionId: null, amount: 10, status: 'approved' }
    ];

    const result = buildClientDebtGroups({
      installments,
      payments,
      clientDebt: 10
    });

    const g = result.groups.find(g => g.transactionId === 'TX-TARGET');
    assert.strictEqual(g?.payments.length, 1);
    assert.strictEqual(g?.payments[0].id, 'pwa-legacy');
  });

  // TEST 6: deuda global 50, remaining cuotas 30 -> openDebtAmount = 20 (NO 80)
  it('TEST 6: Deuda global $50 y saldo de cuotas $30 calcula deuda abierta $20 sin doble conteo', () => {
    const installments = [
      { id: 'inst-1', transactionId: 'TX-1', amountUSD: 30, paidAmount: 0, status: 'pending' }
    ];

    const result = buildClientDebtGroups({
      installments,
      clientDebt: 50.00
    });

    assert.strictEqual(result.totalEffectiveDebt, 50.00);
    assert.strictEqual(result.totalCuotasRemaining, 30.00);
    assert.strictEqual(result.openDebtAmount, 20.00);
    assert.strictEqual(result.hasOpenDebt, true);
  });

  // TEST 7: todas paid -> estado PAGADA / no entra en activeGroups
  it('TEST 7: Compra con todas las cuotas pagadas tiene estado paid y no aparece en activeGroups', () => {
    const installments = [
      { id: 'inst-paid-1', transactionId: 'TX-PAID', amountUSD: 10, paidAmount: 10, status: 'paid' },
      { id: 'inst-paid-2', transactionId: 'TX-PAID', amountUSD: 10, paidAmount: 10, status: 'paid' }
    ];

    const result = buildClientDebtGroups({
      installments,
      clientDebt: 0
    });

    assert.strictEqual(result.groups.length, 1);
    assert.strictEqual(result.groups[0].status, 'paid');
    assert.strictEqual(result.groups[0].remainingAmount, 0);
    assert.strictEqual(result.activeGroups.length, 0);
    assert.strictEqual(result.paidGroups.length, 1);
  });

  // TEST 8: una overdue -> grupo VENCIDO ('overdue')
  it('TEST 8: Si alguna cuota no pagada está overdue, el grupo completo pasa a estado overdue', () => {
    const installments = [
      { id: 'inst-1', transactionId: 'TX-OD', amountUSD: 10, paidAmount: 10, status: 'paid' },
      { id: 'inst-2', transactionId: 'TX-OD', amountUSD: 10, paidAmount: 0, status: 'overdue' }
    ];

    const result = buildClientDebtGroups({
      installments,
      clientDebt: 10
    });

    assert.strictEqual(result.groups[0].status, 'overdue');
  });

  // TEST 9: una in_review -> grupo EN REVISIÓN ('in_review')
  it('TEST 9: Si alguna cuota está in_review, el grupo pasa a estado in_review', () => {
    const installments = [
      { id: 'inst-1', transactionId: 'TX-REV', amountUSD: 10, paidAmount: 0, status: 'in_review' },
      { id: 'inst-2', transactionId: 'TX-REV', amountUSD: 10, paidAmount: 0, status: 'pending' }
    ];

    const result = buildClientDebtGroups({
      installments,
      clientDebt: 20
    });

    assert.strictEqual(result.groups[0].status, 'in_review');
  });

  // TEST 10: Formato y parseo seguro de fechas
  it('TEST 10: parseSafeDate y formatDisplayDate manejan fechas ISO, DD/MM/YYYY y valores nulos', () => {
    assert.strictEqual(formatDisplayDate('2026-10-15'), '15/10/2026');
    assert.strictEqual(formatDisplayDate('15/10/2026'), '15/10/2026');
    assert.strictEqual(formatDisplayDate(null), 'Sin fecha');
  });

  // ================= FASE 3A.1 TESTS =================

  // TEST A: installment sin transactionId -> group.transactionId === null, groupKey interno, sin LEGACY- inventado
  it('TEST A (3A.1): Cuota sin transactionId mantiene transactionId=null con groupKey interno sin inventar prefijo LEGACY-', () => {
    const installments = [
      { id: 'inst-legacy-1', transactionId: null, amountUSD: 25, paidAmount: 0, status: 'pending' }
    ];

    const result = buildClientDebtGroups({
      installments,
      clientDebt: 25.00
    });

    assert.strictEqual(result.groups.length, 1);
    const g = result.groups[0];
    assert.strictEqual(g.transactionId, null);
    assert.strictEqual(g.groupKey, 'inst:inst-legacy-1');
    assert.strictEqual(g.originalFinancedAmount, 25.00);
    assert.ok(!String(g.transactionId).includes('LEGACY-'));
  });

  // TEST B: payment sin transactionId pero con installmentId -> se asocia correctamente al grupo legacy
  it('TEST B (3A.1): Pago PWA sin transactionId pero con installmentId se asocia al grupo legacy correspondiente', () => {
    const installments = [
      { id: 'inst-legacy-99', transactionId: null, amountUSD: 50, paidAmount: 20, status: 'pending' }
    ];

    const payments = [
      { id: 'pwa-legacy-pay', installmentId: 'inst-legacy-99', transactionId: null, amount: 20, status: 'approved' }
    ];

    const result = buildClientDebtGroups({
      installments,
      payments,
      clientDebt: 30.00
    });

    assert.strictEqual(result.groups.length, 1);
    const g = result.groups[0];
    assert.strictEqual(g.transactionId, null);
    assert.strictEqual(g.payments.length, 1);
    assert.strictEqual(g.payments[0].id, 'pwa-legacy-pay');
    assert.strictEqual(g.paidAmount, 20.00);
    assert.strictEqual(g.remainingAmount, 30.00);
  });

  // TEST C: cliente legacy: outstanding=0, currentDebtUsd=1.05 -> deuda efectiva visual 1.05 y openDebtAmount=1.05
  it('TEST C (3A.1): Cliente legacy puro (outstanding=0, currentDebtUsd=1.05, sin cuotas) calcula deuda efectiva y abierta = $1.05', () => {
    const clientData = {
      id: 'cli-legacy-pure',
      outstandingDebt: 0,
      currentDebtUsd: 1.05
    };

    const outstanding = Number(clientData.outstandingDebt ?? 0);
    const legacy = Number(clientData.currentDebtUsd ?? 0);
    const clientEffectiveDebt = outstanding > 0 ? outstanding : legacy;

    const result = buildClientDebtGroups({
      installments: [],
      clientDebt: clientEffectiveDebt
    });

    assert.strictEqual(result.totalEffectiveDebt, 1.05);
    assert.strictEqual(result.openDebtAmount, 1.05);
    assert.strictEqual(result.hasOpenDebt, true);
    assert.strictEqual(result.activeGroups.length, 0);
  });

  // TEST D: post-report refresh: simula la actualización de datos sin recarga manual (F5)
  it('TEST D (3A.1): Simulación de refresh tras reporte de pago: la cuota pasa a in_review y el PWA se incorpora al historial de la compra', () => {
    // 1. Estado inicial
    const initialInstallments = [
      { id: 'inst-flow-1', transactionId: 'TX-FLOW-1', amountUSD: 10, paidAmount: 0, status: 'pending' }
    ];
    const initialPayments = [];

    const beforeReport = buildClientDebtGroups({
      installments: initialInstallments,
      payments: initialPayments,
      clientDebt: 10.00
    });
    assert.strictEqual(beforeReport.groups[0].status, 'pending');
    assert.strictEqual(beforeReport.groups[0].payments.length, 0);

    // 2. Reporte de pago de $4 enviado a backend -> backend pone cuota in_review y crea PWA
    const updatedInstallments = [
      { id: 'inst-flow-1', transactionId: 'TX-FLOW-1', amountUSD: 10, paidAmount: 0, status: 'in_review' }
    ];
    const updatedPayments = [
      { id: 'pwa-flow-new', transactionId: 'TX-FLOW-1', installmentId: 'inst-flow-1', amount: 4.00, status: 'pending' }
    ];

    // 3. Resultado tras refreshClientPaymentData() sin F5
    const afterRefresh = buildClientDebtGroups({
      installments: updatedInstallments,
      payments: updatedPayments,
      clientDebt: 10.00
    });

    assert.strictEqual(afterRefresh.groups[0].status, 'in_review');
    assert.strictEqual(afterRefresh.groups[0].payments.length, 1);
    assert.strictEqual(afterRefresh.groups[0].payments[0].id, 'pwa-flow-new');
    assert.strictEqual(afterRefresh.groups[0].payments[0].amount, 4.00);
  });

  // ================= FASE 3A.2 TESTS =================

  // TEST A (3A.2): Cuotas recibidas en desorden 3, 1, 2 -> render lógico y orden queda 1, 2, 3
  it('TEST A (3A.2): Cuotas recibidas en orden 3, 1, 2 se ordenan estrictamente como 1, 2, 3', () => {
    const installments = [
      { id: 'inst-3', transactionId: 'TX-ORDER', installmentNumber: 3, totalInstallments: 3, amountUSD: 10, dueDate: '2026-11-15' },
      { id: 'inst-1', transactionId: 'TX-ORDER', installmentNumber: 1, totalInstallments: 3, amountUSD: 10, dueDate: '2026-09-15' },
      { id: 'inst-2', transactionId: 'TX-ORDER', installmentNumber: 2, totalInstallments: 3, amountUSD: 10, dueDate: '2026-10-15' }
    ];

    const result = buildClientDebtGroups({
      installments,
      clientDebt: 30.00
    });

    assert.strictEqual(result.groups.length, 1);
    const g = result.groups[0];
    assert.strictEqual(g.installments.length, 3);
    assert.strictEqual(g.installments[0].installmentNumber, 1);
    assert.strictEqual(g.installments[1].installmentNumber, 2);
    assert.strictEqual(g.installments[2].installmentNumber, 3);
  });

  // TEST B (3A.2): totalInstallments se conserva íntegro
  it('TEST B (3A.2): totalInstallments e installmentNumber se conservan íntegros en las cuotas agrupadas', () => {
    const installments = [
      { id: 'inst-1', transactionId: 'TX-PRESERVE', installmentNumber: 1, totalInstallments: 3, amountUSD: 15 },
      { id: 'inst-2', transactionId: 'TX-PRESERVE', installmentNumber: 2, totalInstallments: 3, amountUSD: 15 },
      { id: 'inst-3', transactionId: 'TX-PRESERVE', installmentNumber: 3, totalInstallments: 3, amountUSD: 15 }
    ];

    const result = buildClientDebtGroups({
      installments,
      clientDebt: 45.00
    });

    const g = result.groups[0];
    g.installments.forEach((inst, idx) => {
      assert.strictEqual(inst.installmentNumber, idx + 1);
      assert.strictEqual(inst.totalInstallments, 3);
    });
  });

  // TEST C (3A.2): Compra mixta: food 1/1 y other 1/3, 2/3, 3/3 dentro del mismo grupo
  it('TEST C (3A.2): Compra mixta contiene food 1/1 y other 1/3, 2/3, 3/3 correctamente clasificados y ordenados', () => {
    const installments = [
      // Cuota de víveres (1 de 1)
      { id: 'inst-f1', transactionId: 'TX-MIXED', type: 'cotidiano', installmentNumber: 1, totalInstallments: 1, amountUSD: 10, dueDate: '2026-09-20' },
      // Cuotas de repuestos (3 de 3 en desorden 2, 3, 1)
      { id: 'inst-o2', transactionId: 'TX-MIXED', type: 'repuestos', installmentNumber: 2, totalInstallments: 3, amountUSD: 10, dueDate: '2026-10-20' },
      { id: 'inst-o3', transactionId: 'TX-MIXED', type: 'repuestos', installmentNumber: 3, totalInstallments: 3, amountUSD: 10, dueDate: '2026-11-20' },
      { id: 'inst-o1', transactionId: 'TX-MIXED', type: 'repuestos', installmentNumber: 1, totalInstallments: 3, amountUSD: 10, dueDate: '2026-09-20' }
    ];

    const result = buildClientDebtGroups({
      installments,
      clientDebt: 40.00
    });

    assert.strictEqual(result.groups.length, 1);
    const g = result.groups[0];
    assert.strictEqual(g.foodInstallments.length, 1);
    assert.strictEqual(g.foodInstallments[0].installmentNumber, 1);
    assert.strictEqual(g.foodInstallments[0].totalInstallments, 1);

    assert.strictEqual(g.otherInstallments.length, 3);
    assert.strictEqual(g.otherInstallments[0].installmentNumber, 1);
    assert.strictEqual(g.otherInstallments[1].installmentNumber, 2);
    assert.strictEqual(g.otherInstallments[2].installmentNumber, 3);
  });
});
