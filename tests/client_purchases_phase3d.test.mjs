/**
 * Suite de Pruebas Unitarias — FASE 3D: Historial de Compras del Portal Cliente
 * KALU CRM Oficial / Sabanota
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientPurchaseHistory,
  isRealSaleTransaction,
  isCancelledPurchase
} from '../src/utils/clientPurchases.ts';

describe('FASE 3D: Tests Unitarios del Helper Puro buildClientPurchaseHistory', () => {

  // TEST 1: Venta cash $15 sin installments -> PAGADAS
  it('TEST 1: venta cash $15 sin installments -> PAGADAS', () => {
    const transactions = [
      {
        id: 'TX-CASH-15',
        clientId: 'CLI-001',
        category: 'ventas',
        amount: 15,
        totalUSD: 15,
        paymentMethod: 'Efectivo',
        status: 'approved',
        date: '2026-09-10',
        items: [{ name: 'Harina PAN', quantity: 5, price: 3, subtotal: 15 }]
      }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments: [],
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 1);
    assert.strictEqual(result.pagadas.length, 1);
    assert.strictEqual(result.porPagar.length, 0);
    assert.strictEqual(result.canceladas.length, 0);

    const p = result.pagadas[0];
    assert.strictEqual(p.saleTotal, 15);
    assert.strictEqual(p.paidAmount, 15);
    assert.strictEqual(p.remainingAmount, 0);
    assert.strictEqual(p.status, 'paid');
    assert.strictEqual(p.items.length, 1);
    assert.strictEqual(p.items[0].name, 'Harina PAN');
  });

  // TEST 2: Venta crédito 3 cuotas con saldo -> POR PAGAR
  it('TEST 2: venta crédito 3 cuotas con saldo -> POR PAGAR', () => {
    const transactions = [
      {
        id: 'TX-CRED-30',
        clientId: 'CLI-001',
        category: 'credito',
        amount: 30,
        totalUSD: 30,
        status: 'approved',
        date: '2026-09-01'
      }
    ];
    const installments = [
      { id: 'inst-1', transactionId: 'TX-CRED-30', amountUSD: 10, paidAmount: 10, status: 'paid', dueDate: '2026-09-10' },
      { id: 'inst-2', transactionId: 'TX-CRED-30', amountUSD: 10, paidAmount: 4, status: 'pending', dueDate: '2026-09-20' },
      { id: 'inst-3', transactionId: 'TX-CRED-30', amountUSD: 10, paidAmount: 0, status: 'pending', dueDate: '2026-09-30' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 1);
    assert.strictEqual(result.porPagar.length, 1);
    assert.strictEqual(result.pagadas.length, 0);
    assert.strictEqual(result.canceladas.length, 0);

    const p = result.porPagar[0];
    assert.strictEqual(p.saleTotal, 30);
    assert.strictEqual(p.financedAmount, 30);
    assert.strictEqual(p.paidAmount, 14);
    assert.strictEqual(p.remainingAmount, 16);
    assert.strictEqual(p.status, 'pending');
    assert.strictEqual(p.installments.length, 3);
  });

  // TEST 3: Todas cuotas pagadas -> PAGADAS
  it('TEST 3: todas cuotas pagadas -> PAGADAS', () => {
    const transactions = [
      {
        id: 'TX-CRED-PAID',
        clientId: 'CLI-001',
        category: 'credito',
        amount: 20,
        status: 'approved',
        date: '2026-08-15'
      }
    ];
    const installments = [
      { id: 'inst-p1', transactionId: 'TX-CRED-PAID', amountUSD: 10, paidAmount: 10, status: 'paid', dueDate: '2026-08-20' },
      { id: 'inst-p2', transactionId: 'TX-CRED-PAID', amountUSD: 10, paidAmount: 10, status: 'paid', dueDate: '2026-08-30' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 1);
    assert.strictEqual(result.pagadas.length, 1);
    assert.strictEqual(result.porPagar.length, 0);
    assert.strictEqual(result.canceladas.length, 0);

    const p = result.pagadas[0];
    assert.strictEqual(p.remainingAmount, 0);
    assert.strictEqual(p.status, 'paid');
  });

  // TEST 4: Cuota in_review -> POR PAGAR + estado EN REVISIÓN
  it('TEST 4: cuota in_review -> POR PAGAR + estado EN REVISIÓN', () => {
    const transactions = [
      {
        id: 'TX-IN-REVIEW',
        clientId: 'CLI-001',
        category: 'credito',
        amount: 25,
        status: 'approved',
        date: '2026-09-05'
      }
    ];
    const installments = [
      { id: 'inst-rev-1', transactionId: 'TX-IN-REVIEW', amountUSD: 25, paidAmount: 0, status: 'in_review', dueDate: '2026-09-15' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments: []
    });

    assert.strictEqual(result.porPagar.length, 1);
    const p = result.porPagar[0];
    assert.strictEqual(p.status, 'in_review');
    assert.strictEqual(p.remainingAmount, 25);
  });

  // TEST 5: Venta cancelada con saldo aparente -> CANCELADAS
  it('TEST 5: venta cancelada con saldo aparente -> CANCELADAS', () => {
    const transactions = [
      {
        id: 'TX-CANCELLED',
        clientId: 'CLI-001',
        category: 'ventas',
        amount: 12,
        isVoided: true,
        date: '2026-09-02'
      }
    ];
    const installments = [
      { id: 'inst-c1', transactionId: 'TX-CANCELLED', amountUSD: 12, paidAmount: 0, status: 'pending', dueDate: '2026-09-12' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments: []
    });

    assert.strictEqual(result.canceladas.length, 1);
    assert.strictEqual(result.porPagar.length, 0);
    assert.strictEqual(result.pagadas.length, 0);

    const p = result.canceladas[0];
    assert.strictEqual(p.status, 'cancelled');
  });

  // TEST 6: Transaction category ingresos_cobranza -> NO crea compra
  it('TEST 6: transaction category ingresos_cobranza -> NO crea compra', () => {
    const transactions = [
      {
        id: 'TX-COB-01',
        clientId: 'CLI-001',
        category: 'ingresos_cobranza',
        amount: 50,
        date: '2026-09-08'
      },
      {
        id: 'TX-COB-02',
        clientId: 'CLI-001',
        category: 'payment',
        amount: 10,
        date: '2026-09-09'
      }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments: [],
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 0);
    assert.strictEqual(result.porPagar.length, 0);
    assert.strictEqual(result.pagadas.length, 0);
    assert.strictEqual(result.canceladas.length, 0);
  });

  // TEST 7: PWA payment -> NO crea compra; queda dentro de la compra correcta
  it('TEST 7: PWA payment -> NO crea compra; queda dentro de la compra correcta', () => {
    const transactions = [
      {
        id: 'TX-BUY-1',
        clientId: 'CLI-001',
        category: 'credito',
        amount: 50,
        date: '2026-09-01'
      }
    ];
    const installments = [
      { id: 'inst-b1', transactionId: 'TX-BUY-1', amountUSD: 50, paidAmount: 20, status: 'pending' }
    ];
    const payments = [
      {
        id: 'pwa-pay-1',
        transactionId: 'TX-BUY-1',
        installmentId: 'inst-b1',
        amount: 20,
        reference: 'REF-777',
        status: 'approved',
        date: '2026-09-03'
      }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments
    });

    assert.strictEqual(result.allPurchases.length, 1);
    const p = result.allPurchases[0];
    assert.strictEqual(p.payments.length, 1);
    assert.strictEqual(p.payments[0].reference, 'REF-777');
    assert.strictEqual(p.payments[0].amount, 20);
  });

  // TEST 8: Dos pagos transactionId -> ambos dentro de una compra, sin duplicar compra
  it('TEST 8: dos pagos transactionId -> ambos dentro de una compra, sin duplicar compra', () => {
    const transactions = [
      {
        id: 'TX-MULTI-PAY',
        clientId: 'CLI-001',
        category: 'credito',
        amount: 100,
        date: '2026-09-01'
      }
    ];
    const installments = [
      { id: 'inst-m1', transactionId: 'TX-MULTI-PAY', amountUSD: 50, paidAmount: 50, status: 'paid' },
      { id: 'inst-m2', transactionId: 'TX-MULTI-PAY', amountUSD: 50, paidAmount: 50, status: 'paid' }
    ];
    const payments = [
      { id: 'pay-1', transactionId: 'TX-MULTI-PAY', amount: 50, reference: 'REF-1', date: '2026-09-05' },
      { id: 'pay-2', transactionId: 'TX-MULTI-PAY', amount: 50, reference: 'REF-2', date: '2026-09-10' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments
    });

    assert.strictEqual(result.allPurchases.length, 1);
    const p = result.allPurchases[0];
    assert.strictEqual(p.payments.length, 2);
    assert.strictEqual(p.status, 'paid');
  });

  // TEST 9: Payment solo installmentId -> fallback correcto
  it('TEST 9: payment solo installmentId -> fallback correcto', () => {
    const transactions = [
      {
        id: 'TX-FALLBACK',
        clientId: 'CLI-001',
        category: 'credito',
        amount: 40,
        date: '2026-09-01'
      }
    ];
    const installments = [
      { id: 'inst-fb-1', transactionId: 'TX-FALLBACK', amountUSD: 40, paidAmount: 40, status: 'paid' }
    ];
    const payments = [
      { id: 'pay-fb', installmentId: 'inst-fb-1', amount: 40, reference: 'REF-FB', date: '2026-09-02' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments
    });

    assert.strictEqual(result.allPurchases.length, 1);
    const p = result.allPurchases[0];
    assert.strictEqual(p.payments.length, 1);
    assert.strictEqual(p.payments[0].reference, 'REF-FB');
  });

  // TEST 10: Compra mixta 1 cuota cotidiano + 3 repuestos -> UNA compra
  it('TEST 10: compra mixta 1 cuota cotidiano + 3 repuestos -> UNA compra', () => {
    const transactions = [
      {
        id: 'TX-MIXTA-10',
        clientId: 'CLI-001',
        category: 'credito',
        amount: 70,
        totalUSD: 70,
        date: '2026-09-01',
        items: [
          { name: 'Arroz 1kg', quantity: 2, price: 10, subtotal: 20 },
          { name: 'Caucho Moto', quantity: 1, price: 50, subtotal: 50 }
        ]
      }
    ];
    const installments = [
      { id: 'inst-food-1', transactionId: 'TX-MIXTA-10', type: 'cotidiano', amountUSD: 20, paidAmount: 0, status: 'pending', installmentNumber: 1, totalInstallments: 1 },
      { id: 'inst-other-1', transactionId: 'TX-MIXTA-10', type: 'repuestos', amountUSD: 16.67, paidAmount: 0, status: 'pending', installmentNumber: 1, totalInstallments: 3 },
      { id: 'inst-other-2', transactionId: 'TX-MIXTA-10', type: 'repuestos', amountUSD: 16.67, paidAmount: 0, status: 'pending', installmentNumber: 2, totalInstallments: 3 },
      { id: 'inst-other-3', transactionId: 'TX-MIXTA-10', type: 'repuestos', amountUSD: 16.66, paidAmount: 0, status: 'pending', installmentNumber: 3, totalInstallments: 3 }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 1);
    const p = result.allPurchases[0];
    assert.strictEqual(p.installments.length, 4);
    assert.strictEqual(p.foodInstallments.length, 1);
    assert.strictEqual(p.otherInstallments.length, 3);
    assert.strictEqual(p.items.length, 2);
    assert.strictEqual(p.remainingAmount, 70);
    assert.strictEqual(p.status, 'pending');
  });

  // TEST 11: Saldo anterior sin transactionId -> NO aparece como compra
  it('TEST 11: saldo anterior sin transactionId -> NO aparece como compra', () => {
    // Si una transacción es puramente ajuste/cobranza sin items ni categoría de venta
    const transactions = [
      {
        id: 'TX-LEGACY-DEBT',
        clientId: 'CLI-001',
        category: 'ingresos_cobranza',
        amount: 25,
        invoiceNumber: 'PWA-SALDO-ANTERIOR'
      }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments: [],
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 0);
  });

  // TEST 12: Fechas desordenadas -> compras ordenadas reciente -> antigua
  it('TEST 12: fechas desordenadas -> compras ordenadas reciente -> antigua', () => {
    const transactions = [
      { id: 'TX-OLD', clientId: 'CLI-001', category: 'ventas', amount: 10, date: '2026-08-01' },
      { id: 'TX-NEW', clientId: 'CLI-001', category: 'ventas', amount: 20, date: '2026-09-15' },
      { id: 'TX-MID', clientId: 'CLI-001', category: 'ventas', amount: 15, date: '2026-08-20' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments: [],
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 3);
    assert.strictEqual(result.allPurchases[0].purchaseId, 'TX-NEW');
    assert.strictEqual(result.allPurchases[1].purchaseId, 'TX-MID');
    assert.strictEqual(result.allPurchases[2].purchaseId, 'TX-OLD');
  });

  // TEST 13: Cancelada tiene prioridad aunque installments digan paid
  it('TEST 13: cancelada tiene prioridad aunque installments digan paid', () => {
    const transactions = [
      {
        id: 'TX-VOIDED-PAID',
        clientId: 'CLI-001',
        category: 'ventas',
        amount: 30,
        isVoided: true,
        status: 'anulado',
        date: '2026-09-01'
      }
    ];
    const installments = [
      { id: 'inst-vp', transactionId: 'TX-VOIDED-PAID', amountUSD: 30, paidAmount: 30, status: 'paid' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 1);
    assert.strictEqual(result.canceladas.length, 1);
    assert.strictEqual(result.pagadas.length, 0);
    assert.strictEqual(result.porPagar.length, 0);
    assert.strictEqual(result.canceladas[0].status, 'cancelled');
  });

  // TEST 14: Venta pagada al contado con items -> productos visibles en Pagadas
  it('TEST 14: venta pagada al contado con items -> productos visibles en Pagadas', () => {
    const transactions = [
      {
        id: 'TX-CASH-ITEMS',
        clientId: 'CLI-001',
        category: 'ventas',
        amount: 45,
        totalUSD: 45,
        paymentMethod: 'Transferencia',
        date: '2026-09-12',
        items: [
          { name: 'Aceite 20W50', quantity: 2, price: 15, subtotal: 30 },
          { name: 'Bujía NGK', quantity: 3, price: 5, subtotal: 15 }
        ]
      }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments: [],
      payments: []
    });

    assert.strictEqual(result.pagadas.length, 1);
    const p = result.pagadas[0];
    assert.strictEqual(p.items.length, 2);
    assert.strictEqual(p.items[0].name, 'Aceite 20W50');
    assert.strictEqual(p.items[0].subtotal, 30);
    assert.strictEqual(p.items[1].name, 'Bujía NGK');
    assert.strictEqual(p.items[1].subtotal, 15);
    assert.strictEqual(p.saleTotal, 45);
    assert.strictEqual(p.remainingAmount, 0);
  });

  // TEST 15: 2 ingresos_cobranza + 3 PWA payments no aumentan el conteo de compras
  it('TEST 15: 2 ingresos_cobranza + 3 PWA payments no aumentan el total de compras', () => {
    const transactions = [
      { id: 'TX-CASH-1', clientId: 'CLI-001', category: 'ventas', amount: 15, totalUSD: 15, paymentMethod: 'Efectivo', date: '2026-09-10' },
      { id: 'TX-CRED-1', clientId: 'CLI-001', category: 'credito', amount: 30, totalUSD: 30, paymentMethod: 'Crédito Kalú', date: '2026-09-11' },
      { id: 'TX-CRED-2', clientId: 'CLI-001', category: 'credito', amount: 20, totalUSD: 20, paymentMethod: 'Crédito Kalú', date: '2026-09-12' },
      { id: 'TX-VOID-1', clientId: 'CLI-001', category: 'ventas', amount: 12, totalUSD: 12, isVoided: true, date: '2026-09-13' },
      { id: 'TX-MIXT-1', clientId: 'CLI-001', category: 'credito', amount: 30, totalUSD: 30, paymentMethod: 'Crédito Kalú', date: '2026-09-14' },
      // 2 transacciones de cobranza
      { id: 'TX-COB-1', clientId: 'CLI-001', category: 'ingresos_cobranza', amount: 10, date: '2026-09-15' },
      { id: 'TX-COB-2', clientId: 'CLI-001', category: 'ingresos_cobranza', amount: 4, date: '2026-09-16' }
    ];

    const installments = [
      { id: 'inst-cred1-1', transactionId: 'TX-CRED-1', amountUSD: 10, paidAmount: 10, status: 'paid' },
      { id: 'inst-cred1-2', transactionId: 'TX-CRED-1', amountUSD: 10, paidAmount: 4, status: 'pending' },
      { id: 'inst-cred1-3', transactionId: 'TX-CRED-1', amountUSD: 10, paidAmount: 0, status: 'pending' },
      { id: 'inst-cred2-1', transactionId: 'TX-CRED-2', amountUSD: 10, paidAmount: 10, status: 'paid' },
      { id: 'inst-cred2-2', transactionId: 'TX-CRED-2', amountUSD: 10, paidAmount: 10, status: 'paid' },
      { id: 'inst-mixt-1', transactionId: 'TX-MIXT-1', type: 'cotidiano', amountUSD: 10, paidAmount: 0, status: 'pending' },
      { id: 'inst-mixt-2', transactionId: 'TX-MIXT-1', type: 'repuestos', amountUSD: 20, paidAmount: 0, status: 'pending' }
    ];

    const payments = [
      { id: 'pwa-1', transactionId: 'TX-CRED-1', amount: 10, reference: 'REF-1' },
      { id: 'pwa-2', transactionId: 'TX-CRED-1', amount: 4, reference: 'REF-2' },
      { id: 'pwa-3', transactionId: 'TX-CRED-2', amount: 10, reference: 'REF-3' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments
    });

    assert.strictEqual(result.allPurchases.length, 5);
    assert.strictEqual(result.porPagar.length, 2);
    assert.strictEqual(result.pagadas.length, 2);
    assert.strictEqual(result.canceladas.length, 1);
  });

  // TEST 16: Deuda abierta legacy sin transactionId no aparece en Mis Compras
  it('TEST 16: deuda abierta legacy sin transactionId no aparece en Mis Compras', () => {
    const installments = [
      { id: 'inst-legacy-open', transactionId: null, amountUSD: 50, paidAmount: 0, status: 'pending' }
    ];

    const result = buildClientPurchaseHistory({
      transactions: [],
      installments,
      payments: []
    });

    assert.strictEqual(result.allPurchases.length, 0);
  });

  // TEST 17: Venta cash sin installments clasifica directamente en Pagadas
  it('TEST 17: venta cash sin installments clasifica directamente en Pagadas', () => {
    const transactions = [
      { id: 'TX-CASH-DIRECT', clientId: 'CLI-001', category: 'ventas', amount: 50, totalUSD: 50, paymentMethod: 'Efectivo', date: '2026-09-01' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments: [],
      payments: []
    });

    assert.strictEqual(result.pagadas.length, 1);
    assert.strictEqual(result.pagadas[0].status, 'paid');
    assert.strictEqual(result.pagadas[0].remainingAmount, 0);
  });

  // TEST 18: Cancelada tiene prioridad absoluta sobre cualquier cálculo
  it('TEST 18: cancelada tiene prioridad absoluta sobre cualquier cálculo', () => {
    const transactions = [
      {
        id: 'TX-CANCEL-PRIO',
        clientId: 'CLI-001',
        category: 'ventas',
        amount: 80,
        status: 'cancelado',
        isVoided: true,
        date: '2026-09-01'
      }
    ];
    const installments = [
      { id: 'inst-cp-1', transactionId: 'TX-CANCEL-PRIO', amountUSD: 80, paidAmount: 40, status: 'pending' }
    ];

    const result = buildClientPurchaseHistory({
      transactions,
      installments,
      payments: []
    });

    assert.strictEqual(result.canceladas.length, 1);
    assert.strictEqual(result.porPagar.length, 0);
    assert.strictEqual(result.pagadas.length, 0);
    assert.strictEqual(result.canceladas[0].status, 'cancelled');
  });

});
