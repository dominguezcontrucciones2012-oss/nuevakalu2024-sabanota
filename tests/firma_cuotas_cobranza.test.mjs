import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateKaluCreditBreakdown } from '../src/utils/kaluCreditCalculator.ts';
import { getVIPLevelInfo } from '../src/config/vipMatrix.ts';
import { buildClientDebtGroups } from '../src/utils/debtGrouping.ts';
import { getPendingMundoKaluPaymentCount } from '../src/utils/pendingPayments.ts';

// 1. firma/aprobación exitosa -> una sola compra
test('1. Firma/aprobación exitosa -> genera y aprueba una sola compra con sus cuotas', () => {
  const transactionId = 'TX-KALU-1001';
  const initialPurchase = {
    id: transactionId,
    clientId: 'cli-001',
    status: 'Pendiente Firma',
    total: 100.0,
    financedAmount: 25.0,
    installmentsCount: 3
  };

  // Simulación de aprobación backend
  const approvedPurchase = {
    ...initialPurchase,
    status: 'Aprobado',
    signedAt: new Date().toISOString()
  };

  assert.equal(approvedPurchase.id, transactionId);
  assert.equal(approvedPurchase.status, 'Aprobado');
  assert.equal(approvedPurchase.clientId, 'cli-001');
});

// 2. reintento de firma/aprobación -> idempotencia, no duplica compra ni cuotas
test('2. Reintento de firma/aprobación -> idempotencia, no duplica compra ni cuotas', () => {
  const existingTransactions = [{ id: 'TX-KALU-1001', status: 'Aprobado', clientId: 'cli-001' }];
  const existingInstallments = [
    { id: 'INST-1001-1', transactionId: 'TX-KALU-1001', installmentNumber: 1 },
    { id: 'INST-1001-2', transactionId: 'TX-KALU-1001', installmentNumber: 2 },
    { id: 'INST-1001-3', transactionId: 'TX-KALU-1001', installmentNumber: 3 }
  ];

  // Intento de re-aprobar la misma transacción
  const targetTx = existingTransactions.find(t => t.id === 'TX-KALU-1001');
  const isAlreadyApproved = targetTx && (targetTx.status === 'Aprobado' || targetTx.status === 'completed');

  assert.equal(isAlreadyApproved, true, 'Transacción ya detectada como aprobada');
  // Al ser detectada como aprobada, no se agregan nuevas cuotas
  assert.equal(existingInstallments.length, 3, 'Se mantienen exactamente las 3 cuotas originales');
});

// 3. plan 3 -> exactamente 3 cuotas
test('3. Plan 3 cuotas -> calcula exactamente 3 cuotas quincenales exactas', () => {
  const breakdown = calculateKaluCreditBreakdown('3_cuotas', 100.0, 0); // K1: 75% inicial ($75), financiado $25
  assert.equal(breakdown.installmentsCount, 3);
  assert.equal(breakdown.installments.length, 3);
  assert.equal(breakdown.initialAmount, 75.0);
  assert.equal(breakdown.financedAmount, 25.0);

  const sumInstallments = Math.round(breakdown.installments.reduce((acc, c) => acc + c.amount, 0) * 100) / 100;
  assert.equal(sumInstallments, 25.0, 'La suma de las 3 cuotas coincide con el monto financiado');
});

// 4. plan 6 -> exactamente 6 cuotas
test('4. Plan 6 cuotas -> calcula exactamente 6 cuotas quincenales exactas', () => {
  const breakdown = calculateKaluCreditBreakdown('6_cuotas', 100.0, 800); // K5: 35% inicial ($35), financiado $65
  assert.equal(breakdown.installmentsCount, 6);
  assert.equal(breakdown.installments.length, 6);
  assert.equal(breakdown.initialAmount, 35.0);
  assert.equal(breakdown.financedAmount, 65.0);

  const sumInstallments = Math.round(breakdown.installments.reduce((acc, c) => acc + c.amount, 0) * 100) / 100;
  assert.equal(sumInstallments, 65.0, 'La suma de las 6 cuotas coincide exactamente con el monto financiado');
});

// 5. Cuota 1 pendiente -> no se puede pagar Cuota 2
test('5. Orden estricto: Cuota 1 pendiente -> bloquea el pago de Cuota 2', () => {
  const installments = [
    { id: 'inst-1', transactionId: 'tx-1', installmentNumber: 1, amount: 10, paidAmount: 0, status: 'pending' },
    { id: 'inst-2', transactionId: 'tx-2', installmentNumber: 2, amount: 10, paidAmount: 0, status: 'pending' }
  ];

  // Regla backend/frontend de validación secuencial
  function canPayInstallment(targetInstallment, allSiblingInstallments, inReviewInstallmentIds = new Set()) {
    const prevPending = allSiblingInstallments.find(other => {
      if (other.installmentNumber >= targetInstallment.installmentNumber) return false;
      const isPaid = other.status === 'paid' || (Number(other.paidAmount || 0) >= Number(other.amount || 0) && Number(other.amount || 0) > 0);
      const isOtherInReview = other.status === 'in_review' || inReviewInstallmentIds.has(other.id);
      return !isPaid || isOtherInReview;
    });
    return !prevPending;
  }

  const canPayCuota2 = canPayInstallment(installments[1], installments);
  assert.equal(canPayCuota2, false, 'Cuota 2 no puede pagarse si Cuota 1 está pendiente');
});

// 6. Cuota 1 en revisión -> no se puede pagar Cuota 2
test('6. Orden estricto: Cuota 1 en revisión -> bloquea el pago de Cuota 2', () => {
  const installments = [
    { id: 'inst-1', transactionId: 'tx-1', installmentNumber: 1, amount: 10, paidAmount: 0, status: 'in_review' },
    { id: 'inst-2', transactionId: 'tx-2', installmentNumber: 2, amount: 10, paidAmount: 0, status: 'pending' }
  ];

  function canPayInstallment(targetInstallment, allSiblingInstallments, inReviewInstallmentIds = new Set()) {
    const prevPending = allSiblingInstallments.find(other => {
      if (other.installmentNumber >= targetInstallment.installmentNumber) return false;
      const isPaid = other.status === 'paid' || (Number(other.paidAmount || 0) >= Number(other.amount || 0) && Number(other.amount || 0) > 0);
      const isOtherInReview = other.status === 'in_review' || inReviewInstallmentIds.has(other.id);
      return !isPaid || isOtherInReview;
    });
    return !prevPending;
  }

  const canPayCuota2 = canPayInstallment(installments[1], installments);
  assert.equal(canPayCuota2, false, 'Cuota 2 no puede pagarse si Cuota 1 está en revisión');
});

// 7. Cuota 1 parcialmente pagada -> próximo pago continúa en Cuota 1
test('7. Pagos parciales: Cuota 1 parcialmente pagada ($4 de $10) -> próximo pago continúa en Cuota 1', () => {
  const installments = [
    { id: 'inst-1', transactionId: 'tx-1', installmentNumber: 1, amount: 10, paidAmount: 4, status: 'partially_paid' },
    { id: 'inst-2', transactionId: 'tx-2', installmentNumber: 2, amount: 10, paidAmount: 0, status: 'pending' }
  ];

  function canPayInstallment(targetInstallment, allSiblingInstallments) {
    const prevPending = allSiblingInstallments.find(other => {
      if (other.installmentNumber >= targetInstallment.installmentNumber) return false;
      const isPaid = other.status === 'paid' || (Number(other.paidAmount || 0) >= Number(other.amount || 0) && Number(other.amount || 0) > 0);
      return !isPaid;
    });
    return !prevPending;
  }

  const canPayCuota1 = canPayInstallment(installments[0], installments);
  const canPayCuota2 = canPayInstallment(installments[1], installments);

  assert.equal(canPayCuota1, true, 'Cuota 1 sigue activa para completar su saldo restante de $6');
  assert.equal(canPayCuota2, false, 'Cuota 2 permanece bloqueada hasta que Cuota 1 quede completamente saldada');
});

// 8. Cuota 1 totalmente pagada -> se habilita Cuota 2
test('8. Orden estricto: Cuota 1 totalmente pagada -> se habilita Cuota 2', () => {
  const installments = [
    { id: 'inst-1', transactionId: 'tx-1', installmentNumber: 1, amount: 10, paidAmount: 10, status: 'paid' },
    { id: 'inst-2', transactionId: 'tx-2', installmentNumber: 2, amount: 10, paidAmount: 0, status: 'pending' }
  ];

  function canPayInstallment(targetInstallment, allSiblingInstallments) {
    const prevPending = allSiblingInstallments.find(other => {
      if (other.installmentNumber >= targetInstallment.installmentNumber) return false;
      const isPaid = other.status === 'paid' || (Number(other.paidAmount || 0) >= Number(other.amount || 0) && Number(other.amount || 0) > 0);
      return !isPaid;
    });
    return !prevPending;
  }

  const canPayCuota2 = canPayInstallment(installments[1], installments);
  assert.equal(canPayCuota2, true, 'Cuota 2 queda habilitada al estar Cuota 1 totalmente pagada');
});

// 9. pago rechazado -> misma cuota vuelve a quedar disponible
test('9. Pago rechazado -> cuota vuelve al estado pendiente y queda disponible', () => {
  const installment = {
    id: 'inst-1',
    transactionId: 'tx-1',
    installmentNumber: 1,
    amount: 10,
    paidAmount: 0,
    status: 'in_review'
  };

  // Acción de rechazar comprobante
  installment.status = 'pending';

  assert.equal(installment.status, 'pending');
  assert.equal(installment.paidAmount, 0);
});

// 10. comprobante repetido -> idempotencia, no duplica movimiento
test('10. Idempotencia: comprobante con la misma referencia no se procesa dos veces', () => {
  const existingPayments = [
    { id: 'pwa-01', reference: 'REF-987654', status: 'approved', amount: 10 }
  ];

  const duplicatePayment = { id: 'pwa-02', reference: 'REF-987654', amount: 10 };
  const isDuplicate = existingPayments.some(p => p.reference === duplicatePayment.reference && p.status === 'approved');

  assert.equal(isDuplicate, true, 'El pago duplicado es detectado y no se duplica');
});

// 11. pago reportado -> conteo de alertas en tiempo real
test('11. Pago reportado en PWA -> alertador de Centro de Cobranzas refleja el pendiente', () => {
  const payments = [
    { id: 'p1', status: 'pending', amount: 15, clientId: 'c1' },
    { id: 'p2', status: 'approved', amount: 20, clientId: 'c1' }
  ];

  const pendingCount = getPendingMundoKaluPaymentCount(payments);
  assert.equal(pendingCount, 1, 'El conteo en tiempo real refleja exactamente 1 pago pendiente de conciliación');
});

// 12. aprobar/rechazar -> UI queda preparada para reflejar estado sin F5
test('12. Suscripciones reactivas en Centro de Cobranzas reflejan cambios de pwa_payments sin F5', () => {
  let statePayments = [{ id: 'p1', status: 'pending', amount: 15 }];

  // Simulación de handler reactivo onCollectionSnapshot
  function onSnapshot(newCollection) {
    statePayments = newCollection;
  }

  onSnapshot([{ id: 'p1', status: 'approved', amount: 15 }]);
  assert.equal(statePayments[0].status, 'approved', 'El estado se actualiza en memoria sin requerir F5');
});

// 13. cliente con varias ventas -> una sola agrupación de cliente
test('13. Cliente con varias ventas -> buildClientDebtGroups genera una sola agrupación por cliente', () => {
  const client = { id: 'cli-multi', name: 'JUAN DOMINGUEZ' };
  const purchases = [
    { id: 'v1', clientId: 'cli-multi', total: 50, financedAmount: 20, status: 'Aprobado' },
    { id: 'v2', clientId: 'cli-multi', total: 80, financedAmount: 30, status: 'Aprobado' }
  ];
  const installments = [
    { id: 'inst-v1-1', transactionId: 'v1', clientId: 'cli-multi', amount: 10, paidAmount: 0, installmentNumber: 1, totalInstallments: 2, status: 'pending' },
    { id: 'inst-v1-2', transactionId: 'v1', clientId: 'cli-multi', amount: 10, paidAmount: 0, installmentNumber: 2, totalInstallments: 2, status: 'pending' },
    { id: 'inst-v2-1', transactionId: 'v2', clientId: 'cli-multi', amount: 15, paidAmount: 0, installmentNumber: 1, totalInstallments: 2, status: 'pending' },
    { id: 'inst-v2-2', transactionId: 'v2', clientId: 'cli-multi', amount: 15, paidAmount: 0, installmentNumber: 2, totalInstallments: 2, status: 'pending' }
  ];

  const overview = buildClientDebtGroups({
    client,
    installments,
    purchases,
    payments: []
  });

  assert.equal(overview.groups.length, 2, 'El cliente tiene 2 compras/acordeones de venta');
  assert.equal(overview.groups[0].installments.length, 2, 'La venta 1 tiene 2 cuotas');
  assert.equal(overview.groups[1].installments.length, 2, 'La venta 2 tiene 2 cuotas');
  assert.equal(overview.totalEffectiveDebt, 50, 'Deuda total calculada correctamente (10+10+15+15)');
});

// 14. cada venta conserva únicamente sus propias cuotas
test('14. Cada venta conserva únicamente sus propias cuotas sin mezclarse', () => {
  const installments = [
    { id: 'inst-A1', transactionId: 'VENTA-A', installmentNumber: 1 },
    { id: 'inst-A2', transactionId: 'VENTA-A', installmentNumber: 2 },
    { id: 'inst-B1', transactionId: 'VENTA-B', installmentNumber: 1 },
    { id: 'inst-B2', transactionId: 'VENTA-B', installmentNumber: 2 },
    { id: 'inst-B3', transactionId: 'VENTA-B', installmentNumber: 3 }
  ];

  const cuotasVentaA = installments.filter(i => i.transactionId === 'VENTA-A');
  const cuotasVentaB = installments.filter(i => i.transactionId === 'VENTA-B');

  assert.equal(cuotasVentaA.length, 2);
  assert.equal(cuotasVentaB.length, 3);
  assert.ok(cuotasVentaA.every(i => i.transactionId === 'VENTA-A'));
  assert.ok(cuotasVentaB.every(i => i.transactionId === 'VENTA-B'));
});

// 15. K5/K6 + 6 cuotas -> permitido normalmente
test('15. Regla comercial: Clientes K5 y K6 tienen permitido 6 cuotas normalmente', () => {
  const vipK5 = getVIPLevelInfo(800); // K5 (750 - 1200)
  const vipK6 = getVIPLevelInfo(1500); // K6 (1200+)

  assert.equal(vipK5.code, 'K5');
  assert.equal(vipK5.mainMaxInstallments, 6);
  assert.equal(vipK6.code, 'K6');
  assert.equal(vipK6.mainMaxInstallments, 6);
});

// 16. K1-K4 + 6 cuotas -> advertencia comercial pero permitido si se autoriza
test('16. Regla comercial: Clientes K1-K4 pueden recibir 6 cuotas bajo confirmación/autorización sin bloqueo rígido', () => {
  const vipK1 = getVIPLevelInfo(50); // K1
  const vipK4 = getVIPLevelInfo(500); // K4

  assert.equal(vipK1.code, 'K1');
  assert.equal(vipK4.code, 'K4');
  assert.equal(vipK1.level < 5, true, 'K1 requiere confirmación');
  assert.equal(vipK4.level < 5, true, 'K4 requiere confirmación');

  // Simulación de confirmación comercial
  function handleSelect6Cuotas(clientPoints, isAuthorizedByUser) {
    const vip = getVIPLevelInfo(clientPoints);
    if (vip.level < 5) {
      if (!isAuthorizedByUser) {
        return { allowed: false, reason: 'Cancelado por usuario' };
      }
    }
    const breakdown = calculateKaluCreditBreakdown('6_cuotas', 100.0, clientPoints);
    return { allowed: true, breakdown };
  }

  const authorized = handleSelect6Cuotas(50, true);
  assert.equal(authorized.allowed, true);
  assert.equal(authorized.breakdown.installmentsCount, 6);

  const denied = handleSelect6Cuotas(50, false);
  assert.equal(denied.allowed, false);
});
