import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Suite de Pruebas FASE 2D: Motor de Crédito, Cuotas, Bills, PWA y Aprobación Atómica
 * Evaluado en aislamiento sin mutar data-dev real.
 */

// Helper autoritativo para identificar alimentos (exactamente idéntico a server.js)
const isFoodProduct = (prod) => {
  const c = String(prod?.category || '').trim().toUpperCase();
  const n = String(prod?.name || '').trim().toUpperCase();
  if (c.includes('VÍVERE') || c.includes('VIVERE') || c.includes('ALIMENTO') || c.includes('CHARCUTER') || c.includes('QUESO')) return true;
  if (n.includes('HARINA') || n.includes('QUESO') || n.includes('MANTEQUILLA') || n.includes('ARROZ') || n.includes('PASTA') || n.includes('AZUCAR') || n.includes('AZÚCAR') || n.includes('ACEITE COMESTIBLE') || n.includes('CAFE') || n.includes('CAFÉ') || n.includes('LECHE')) return true;
  return false;
};

// Motor de generación de cuotas y bill de venta (lógica de server.js POST /api/pos/process-sale)
function processSaleCreditEngine({
  clientId,
  saleTotal,
  debtAmount,
  saleItems,
  productsData,
  nowMs = Date.now()
}) {
  const masterTransactionId = `TX-${nowMs}`;
  const bills = [];
  const installments = [];

  if (debtAmount > 0) {
    const newBill = {
      id: `bill-rcv-${nowMs}`,
      transactionId: masterTransactionId,
      type: 'receivable',
      entityId: clientId,
      amount: debtAmount,
      dueDate: new Date(nowMs + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: 'Pendiente'
    };
    bills.push(newBill);

    const financedAmount = debtAmount;
    let foodSubtotal = 0;
    let otherSubtotal = 0;

    for (const item of (saleItems || [])) {
      const prod = productsData.find(p => String(p.id) === String(item.productId));
      const itemSubtotal = Number(item.subtotal !== undefined ? item.subtotal : (Number(item.quantityKg || item.quantity || 1) * Number(item.pricePerKg || item.price || 0)));
      if (isFoodProduct(prod)) {
        foodSubtotal += itemSubtotal;
      } else {
        otherSubtotal += itemSubtotal;
      }
    }

    const totalSubtotals = foodSubtotal + otherSubtotal;
    let foodFinanced = 0;
    let otherFinanced = 0;

    if (totalSubtotals <= 0 || (foodSubtotal > 0 && otherSubtotal <= 0)) {
      foodFinanced = financedAmount;
      otherFinanced = 0;
    } else if (otherSubtotal > 0 && foodSubtotal <= 0) {
      foodFinanced = 0;
      otherFinanced = financedAmount;
    } else {
      const rawFoodFinanced = Math.round((financedAmount * (foodSubtotal / totalSubtotals)) * 100) / 100;
      foodFinanced = rawFoodFinanced;
      otherFinanced = Math.round((financedAmount - rawFoodFinanced) * 100) / 100;
    }

    let instIndex = 1;
    // Food installments (1 cuota)
    if (foodFinanced > 0.009) {
      let nextDate = new Date(nowMs);
      nextDate.setDate(nextDate.getDate() + 15);
      installments.push({
        id: `inst-${nowMs}-${instIndex++}`,
        clientId: clientId,
        transactionId: masterTransactionId,
        amount: foodFinanced,
        amountUSD: foodFinanced,
        dueDate: nextDate.toISOString().split('T')[0],
        status: 'pending',
        installmentNumber: 1,
        totalInstallments: 1,
        pointsEarned: Math.round(foodFinanced),
        pointsAwarded: false,
        createdAt: new Date(nowMs).toISOString(),
        type: 'cotidiano'
      });
    }

    // Other installments (3 cuotas con absorción de redondeo en la última cuota)
    if (otherFinanced > 0.009) {
      const count = 3;
      const baseCuota = Math.floor((otherFinanced / count) * 100) / 100;
      let sumPrev = 0;
      let nextDate = new Date(nowMs);

      for (let i = 1; i <= count; i++) {
        nextDate.setDate(nextDate.getDate() + 15);
        const isLast = (i === count);
        const cuotaVal = isLast ? Math.round((otherFinanced - sumPrev) * 100) / 100 : baseCuota;
        sumPrev = Math.round((sumPrev + cuotaVal) * 100) / 100;

        installments.push({
          id: `inst-${nowMs}-${instIndex++}`,
          clientId: clientId,
          transactionId: masterTransactionId,
          amount: cuotaVal,
          amountUSD: cuotaVal,
          dueDate: nextDate.toISOString().split('T')[0],
          status: 'pending',
          installmentNumber: i,
          totalInstallments: count,
          pointsEarned: Math.round(cuotaVal),
          pointsAwarded: false,
          createdAt: new Date(nowMs).toISOString(),
          type: 'repuestos'
        });
      }
    }
  }

  const newTx = {
    id: masterTransactionId,
    clientId,
    debtAmount,
    amount: saleTotal,
    items: saleItems
  };

  return { masterTransactionId, newTx, bills, installments };
}

// Motor de creación de reporte PWA (lógica de server.js POST /api/portal/client/payments)
function createPwaPayment({
  portalUserId,
  amount,
  installmentId,
  installmentsData = []
}) {
  const newPayment = {
    id: `pwa-pay-${Date.now()}`,
    clientId: portalUserId,
    amount: Number(amount),
    installmentId: installmentId ? String(installmentId) : null,
    status: 'pending'
  };

  if (installmentId) {
    const inst = installmentsData.find(i => String(i.id) === String(installmentId) && String(i.clientId) === String(portalUserId));
    if (inst) {
      newPayment.transactionId = inst.transactionId || null;
      if (inst.status === 'pending') {
        inst.status = 'in_review';
      }
    } else {
      newPayment.transactionId = null;
    }
  } else {
    newPayment.transactionId = null;
  }

  return newPayment;
}

// Motor atómico de aprobación PWA (lógica de server.js POST /api/pwa-payments/:id/approve)
function approvePwaPaymentEngine({
  paymentId,
  pwaPayments,
  clients,
  installments,
  transactions
}) {
  const paymentIndex = pwaPayments.findIndex(p => String(p.id) === String(paymentId));
  if (paymentIndex === -1) {
    throw new Error('PAYMENT_NOT_FOUND');
  }

  const payment = pwaPayments[paymentIndex];
  if (payment.status !== 'pending') {
    const conflictErr = new Error('PAYMENT_ALREADY_PROCESSED');
    conflictErr.statusCode = 409;
    conflictErr.paymentStatus = payment.status;
    throw conflictErr;
  }

  const targetId = payment.clientId;
  const cIndex = clients.findIndex(c => String(c.id) === String(targetId));
  let updatedClient = null;

  if (cIndex !== -1) {
    const c = clients[cIndex];
    const outstanding = Number(c.outstandingDebt ?? 0);
    const legacy = Number(c.currentDebtUsd ?? 0);
    const currentPoints = Number(c.loyaltyPoints || 0);
    const pointsToAdd = Math.round(payment.amount);

    let newOutstanding = outstanding;
    let newLegacy = legacy;

    if (outstanding > 0) {
      newOutstanding = Math.max(0, Math.round((outstanding - payment.amount) * 100) / 100);
    } else if (legacy > 0) {
      const remainingLegacy = Math.max(0, Math.round((legacy - payment.amount) * 100) / 100);
      if (remainingLegacy === 0) {
        newOutstanding = 0;
        newLegacy = 0;
      } else {
        newOutstanding = 0;
        newLegacy = remainingLegacy;
      }
    } else {
      newOutstanding = 0;
    }

    updatedClient = {
      ...c,
      outstandingDebt: newOutstanding,
      currentDebtUsd: newLegacy,
      loyaltyPoints: currentPoints + pointsToAdd
    };
    clients[cIndex] = updatedClient;
  }

  const instIds = payment.installmentIds || (payment.installmentId ? [payment.installmentId] : []);
  if (instIds.length > 0) {
    instIds.forEach(id => {
      const inst = installments.find(i => String(i.id) === String(id));
      if (inst) {
        inst.status = 'paid';
        inst.paidAt = new Date().toISOString();
      }
    });
  }

  const nowMs = Date.now();
  const newTx = {
    id: `TX-${nowMs}`,
    clientId: targetId,
    category: 'ingresos_cobranza',
    amount: payment.amount,
    isIncome: true,
    status: 'Completado',
    paymentId: payment.id,
    installmentId: payment.installmentId || null,
    transactionId: payment.transactionId || null
  };
  transactions.push(newTx);

  payment.status = 'approved';
  payment.approvedAt = new Date(nowMs).toISOString();
  pwaPayments[paymentIndex] = payment;

  return { payment, client: updatedClient, transaction: newTx };
}

describe('FASE 2D: Suite de Validación de Motor de Crédito, Cuotas y Cobranzas', () => {

  const mockProducts = [
    { id: 'p-viveres-1', name: 'Harina PAN 1kg', category: 'VÍVERES', price: 1.5 },
    { id: 'p-repuesto-1', name: 'Bujía NGK Racing', category: 'REPUESTOS DE MOTO', price: 10.0 },
    { id: 'p-repuesto-2', name: 'Cadena 428H', category: 'REPUESTOS', price: 30.0 }
  ];

  // TEST 1: Víveres $10 crédito -> 1 installment $10 -> transactionId coincide con venta
  it('TEST 1: Víveres $10 crédito genera exactamente 1 installment de $10 con el mismo transactionId maestro', () => {
    const res = processSaleCreditEngine({
      clientId: 'cli-001',
      saleTotal: 10,
      debtAmount: 10,
      saleItems: [{ productId: 'p-viveres-1', quantity: 1, price: 10, subtotal: 10 }],
      productsData: mockProducts,
      nowMs: 1700000001
    });

    assert.strictEqual(res.installments.length, 1);
    assert.strictEqual(res.installments[0].amount, 10);
    assert.strictEqual(res.installments[0].type, 'cotidiano');
    assert.strictEqual(res.installments[0].totalInstallments, 1);
    assert.strictEqual(res.installments[0].transactionId, res.masterTransactionId);
    assert.strictEqual(res.newTx.id, res.masterTransactionId);
  });

  // TEST 2: Repuesto $30 crédito -> 3 installments $10/$10/$10 -> todos transactionId coinciden
  it('TEST 2: Repuesto $30 crédito genera 3 installments ($10 cada una) con el mismo transactionId maestro', () => {
    const res = processSaleCreditEngine({
      clientId: 'cli-001',
      saleTotal: 30,
      debtAmount: 30,
      saleItems: [{ productId: 'p-repuesto-2', quantity: 1, price: 30, subtotal: 30 }],
      productsData: mockProducts,
      nowMs: 1700000002
    });

    assert.strictEqual(res.installments.length, 3);
    res.installments.forEach(inst => {
      assert.strictEqual(inst.amount, 10);
      assert.strictEqual(inst.type, 'repuestos');
      assert.strictEqual(inst.totalInstallments, 3);
      assert.strictEqual(inst.transactionId, res.masterTransactionId);
    });
  });

  // TEST 3: Repuesto $10 -> 3 cuotas cuya suma = $10 exactos
  it('TEST 3: Repuesto $10 genera 3 cuotas cuya suma es exactamente $10.00 (absorbiendo centavos)', () => {
    const res = processSaleCreditEngine({
      clientId: 'cli-001',
      saleTotal: 10,
      debtAmount: 10,
      saleItems: [{ productId: 'p-repuesto-1', quantity: 1, price: 10, subtotal: 10 }],
      productsData: mockProducts,
      nowMs: 1700000003
    });

    assert.strictEqual(res.installments.length, 3);
    assert.strictEqual(res.installments[0].amount, 3.33);
    assert.strictEqual(res.installments[1].amount, 3.33);
    assert.strictEqual(res.installments[2].amount, 3.34);
    const sum = res.installments.reduce((acc, i) => acc + i.amount, 0);
    assert.strictEqual(Math.round(sum * 100) / 100, 10.00);
  });

  // TEST 4: Venta mixta: Víveres $10 + Repuesto $30 financiada completa -> 1 cuota $10 + 3 cuotas $10 -> 1 sola transaction, mismo transactionId
  it('TEST 4: Venta mixta financiada completa genera 1 cuota de alimento ($10) y 3 cuotas de otros ($10 c/u) bajo el mismo transactionId', () => {
    const res = processSaleCreditEngine({
      clientId: 'cli-001',
      saleTotal: 40,
      debtAmount: 40,
      saleItems: [
        { productId: 'p-viveres-1', quantity: 1, price: 10, subtotal: 10 },
        { productId: 'p-repuesto-2', quantity: 1, price: 30, subtotal: 30 }
      ],
      productsData: mockProducts,
      nowMs: 1700000004
    });

    assert.strictEqual(res.installments.length, 4);
    const foodInst = res.installments.filter(i => i.type === 'cotidiano');
    const otherInst = res.installments.filter(i => i.type === 'repuestos');

    assert.strictEqual(foodInst.length, 1);
    assert.strictEqual(foodInst[0].amount, 10);

    assert.strictEqual(otherInst.length, 3);
    assert.strictEqual(otherInst[0].amount, 10);
    assert.strictEqual(otherInst[1].amount, 10);
    assert.strictEqual(otherInst[2].amount, 10);

    res.installments.forEach(inst => {
      assert.strictEqual(inst.transactionId, res.masterTransactionId);
    });
    assert.strictEqual(res.newTx.id, res.masterTransactionId);
  });

  // TEST 5: Bill contiene mismo transactionId
  it('TEST 5: Bill de cuenta por cobrar contiene exactamente el mismo masterTransactionId', () => {
    const res = processSaleCreditEngine({
      clientId: 'cli-001',
      saleTotal: 25,
      debtAmount: 25,
      saleItems: [{ productId: 'p-repuesto-1', quantity: 2.5, price: 10, subtotal: 25 }],
      productsData: mockProducts,
      nowMs: 1700000005
    });

    assert.strictEqual(res.bills.length, 1);
    assert.strictEqual(res.bills[0].transactionId, res.masterTransactionId);
    assert.strictEqual(res.bills[0].amount, 25);
  });

  // TEST 6: PWA para una cuota -> payment.installmentId correcto, payment.transactionId correcto
  it('TEST 6: PWA reportado para una cuota hereda fielmente el transactionId de la cuota', () => {
    const mockInstallments = [
      { id: 'inst-999', clientId: 'cli-001', transactionId: 'TX-ORIGINAL-999', amount: 10, status: 'pending' }
    ];

    const payment = createPwaPayment({
      portalUserId: 'cli-001',
      amount: 10,
      installmentId: 'inst-999',
      installmentsData: mockInstallments
    });

    assert.strictEqual(payment.installmentId, 'inst-999');
    assert.strictEqual(payment.transactionId, 'TX-ORIGINAL-999');
    assert.strictEqual(mockInstallments[0].status, 'in_review');
  });

  // TEST 7: Aprobar PWA -> reduce deuda una sola vez, installment paid, payment approved, transaction cobranza con referencias
  it('TEST 7: Aprobar PWA reduce deuda, marca cuota pagada y crea transacción de cobranza con referencias', () => {
    const pwaPayments = [
      { id: 'pay-001', clientId: 'cli-001', amount: 15, status: 'pending', installmentId: 'inst-001', transactionId: 'TX-SALE-100', entityName: 'Juan Perez' }
    ];
    const clients = [
      { id: 'cli-001', name: 'Juan Perez', outstandingDebt: 45, loyaltyPoints: 10 }
    ];
    const installments = [
      { id: 'inst-001', clientId: 'cli-001', transactionId: 'TX-SALE-100', amount: 15, status: 'in_review' }
    ];
    const transactions = [];

    const res = approvePwaPaymentEngine({
      paymentId: 'pay-001',
      pwaPayments,
      clients,
      installments,
      transactions
    });

    assert.strictEqual(res.payment.status, 'approved');
    assert.strictEqual(clients[0].outstandingDebt, 30);
    assert.strictEqual(clients[0].loyaltyPoints, 25);
    assert.strictEqual(installments[0].status, 'paid');
    assert.strictEqual(transactions.length, 1);
    assert.strictEqual(transactions[0].category, 'ingresos_cobranza');
    assert.strictEqual(transactions[0].amount, 15);
    assert.strictEqual(transactions[0].paymentId, 'pay-001');
    assert.strictEqual(transactions[0].installmentId, 'inst-001');
    assert.strictEqual(transactions[0].transactionId, 'TX-SALE-100');
  });

  // TEST 8: Aprobar mismo PWA dos veces -> segunda llamada falla con 409 y NO reduce deuda ni duplica cobranza
  it('TEST 8: Idempotencia: Aprobar el mismo PWA por segunda vez es rechazado y no reduce deuda ni duplica cobranza', () => {
    const pwaPayments = [
      { id: 'pay-002', clientId: 'cli-002', amount: 20, status: 'pending', installmentId: null, transactionId: null, entityName: 'Maria Gomez' }
    ];
    const clients = [
      { id: 'cli-002', name: 'Maria Gomez', outstandingDebt: 50, loyaltyPoints: 0 }
    ];
    const installments = [];
    const transactions = [];

    // Primera aprobación
    approvePwaPaymentEngine({
      paymentId: 'pay-002',
      pwaPayments,
      clients,
      installments,
      transactions
    });

    assert.strictEqual(clients[0].outstandingDebt, 30);
    assert.strictEqual(transactions.length, 1);

    // Segunda aprobación debe fallar de forma idempotente
    assert.throws(() => {
      approvePwaPaymentEngine({
        paymentId: 'pay-002',
        pwaPayments,
        clients,
        installments,
        transactions
      });
    }, (err) => {
      return err.statusCode === 409 || err.message === 'PAYMENT_ALREADY_PROCESSED';
    });

    // Invariantes intactos: no se volvió a descontar deuda ni se duplicó la transacción
    assert.strictEqual(clients[0].outstandingDebt, 30);
    assert.strictEqual(transactions.length, 1);
  });

  // TEST 9: Cliente legacy: outstandingDebt=0, currentDebtUsd=1.05 paga $1.05 -> deuda efectiva final 0
  it('TEST 9: Cliente legacy con outstandingDebt=0 y currentDebtUsd=1.05 que paga $1.05 queda con ambas en 0', () => {
    const pwaPayments = [
      { id: 'pay-leg-1', clientId: 'cli-legacy-1', amount: 1.05, status: 'pending', entityName: 'Cliente Legacy' }
    ];
    const clients = [
      { id: 'cli-legacy-1', name: 'Cliente Legacy', outstandingDebt: 0, currentDebtUsd: 1.05 }
    ];
    const installments = [];
    const transactions = [];

    approvePwaPaymentEngine({
      paymentId: 'pay-leg-1',
      pwaPayments,
      clients,
      installments,
      transactions
    });

    assert.strictEqual(clients[0].outstandingDebt, 0);
    assert.strictEqual(clients[0].currentDebtUsd, 0);
  });

  // TEST 10: Pago parcial legacy: 1.05 - 0.50 -> deuda efectiva final 0.55
  it('TEST 10: Pago parcial legacy de $0.50 sobre $1.05 deja currentDebtUsd=0.55 y outstandingDebt=0', () => {
    const pwaPayments = [
      { id: 'pay-leg-2', clientId: 'cli-legacy-2', amount: 0.50, status: 'pending', entityName: 'Cliente Legacy 2' }
    ];
    const clients = [
      { id: 'cli-legacy-2', name: 'Cliente Legacy 2', outstandingDebt: 0, currentDebtUsd: 1.05 }
    ];
    const installments = [];
    const transactions = [];

    approvePwaPaymentEngine({
      paymentId: 'pay-leg-2',
      pwaPayments,
      clients,
      installments,
      transactions
    });

    assert.strictEqual(clients[0].outstandingDebt, 0);
    assert.strictEqual(clients[0].currentDebtUsd, 0.55);
  });
});
