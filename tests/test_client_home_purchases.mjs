import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClientPurchaseHistory } from '../src/utils/clientPurchases.ts';

test('CLIENT PORTAL HOME & PURCHASES: Regla de 5 compras recientes y 1 tarjeta por compra', async (t) => {

  await t.test('A) 1 a 5 compras -> se muestran todas (hasta 5)', () => {
    const transactions = [
      { id: 'TX-1', category: 'ventas', amount: 50, date: '2026-03-01', items: [{ name: 'Lima de Machete', quantity: 1, subtotal: 50 }] },
      { id: 'TX-2', category: 'ventas', amount: 20, date: '2026-03-02', items: [{ name: 'Queso', quantity: 2, subtotal: 20 }] },
      { id: 'TX-3', category: 'ventas', amount: 35, date: '2026-03-03', items: [{ name: 'Herramienta', quantity: 1, subtotal: 35 }] }
    ];

    const result = buildClientPurchaseHistory({ transactions, installments: [], payments: [] });
    const recentHome = result.allPurchases.slice(0, 5);

    assert.equal(recentHome.length, 3, 'Debe devolver las 3 compras');
    assert.equal(result.allPurchases.length, 3, 'Total en historial = 3');
  });

  await t.test('B) 6+ compras -> Home muestra exactamente 5 y el historial conserva todas', () => {
    const transactions = [];
    for (let i = 1; i <= 8; i++) {
      transactions.push({
        id: `TX-${i}`,
        category: 'ventas',
        amount: 10 * i,
        date: `2026-03-0${i}`,
        createdAt: 1772496000000 + i * 86400000,
        items: [{ name: `Producto ${i}`, quantity: 1, subtotal: 10 * i }]
      });
    }

    const result = buildClientPurchaseHistory({ transactions, installments: [], payments: [] });
    const recentHome = result.allPurchases.slice(0, 5);

    assert.equal(recentHome.length, 5, 'Home debe estar limitado a exactamente 5 compras recientes');
    assert.equal(result.allPurchases.length, 8, 'El historial completo conserva las 8 compras');
  });

  await t.test('C) Orden = Más reciente primero', () => {
    const transactions = [
      { id: 'TX-OLD', category: 'ventas', amount: 15, date: '2026-01-10', createdAt: 1768000000000, items: [{ name: 'Antiguo', quantity: 1, subtotal: 15 }] },
      { id: 'TX-NEW', category: 'ventas', amount: 30, date: '2026-03-15', createdAt: 1773500000000, items: [{ name: 'Nuevo', quantity: 1, subtotal: 30 }] },
      { id: 'TX-MID', category: 'ventas', amount: 25, date: '2026-02-20', createdAt: 1771500000000, items: [{ name: 'Medio', quantity: 1, subtotal: 25 }] }
    ];

    const result = buildClientPurchaseHistory({ transactions, installments: [], payments: [] });
    const recentHome = result.allPurchases.slice(0, 5);

    assert.equal(recentHome[0].transactionId, 'TX-NEW', 'La primera compra debe ser la más reciente');
    assert.equal(recentHome[1].transactionId, 'TX-MID', 'La segunda compra debe ser la intermedia');
    assert.equal(recentHome[2].transactionId, 'TX-OLD', 'La tercera compra debe ser la más antigua');
  });

  await t.test('D) Compra con 6 cuotas -> Produce 1 sola tarjeta / registro de compra, no 6 filas', () => {
    const transactions = [
      {
        id: 'TX-FINANCED',
        category: 'credito',
        amount: 300,
        totalUSD: 300,
        date: '2026-03-10',
        items: [{ name: 'Herramienta Mayor', quantity: 1, subtotal: 300 }]
      }
    ];

    const installments = [
      { id: 'INST-1', transactionId: 'TX-FINANCED', installmentNumber: 1, amountUSD: 50, status: 'paid', paidAmount: 50, dueDate: '2026-03-25' },
      { id: 'INST-2', transactionId: 'TX-FINANCED', installmentNumber: 2, amountUSD: 50, status: 'pending', paidAmount: 0, dueDate: '2026-04-10' },
      { id: 'INST-3', transactionId: 'TX-FINANCED', installmentNumber: 3, amountUSD: 50, status: 'pending', paidAmount: 0, dueDate: '2026-04-25' },
      { id: 'INST-4', transactionId: 'TX-FINANCED', installmentNumber: 4, amountUSD: 50, status: 'pending', paidAmount: 0, dueDate: '2026-05-10' },
      { id: 'INST-5', transactionId: 'TX-FINANCED', installmentNumber: 5, amountUSD: 50, status: 'pending', paidAmount: 0, dueDate: '2026-05-25' },
      { id: 'INST-6', transactionId: 'TX-FINANCED', installmentNumber: 6, amountUSD: 50, status: 'pending', paidAmount: 0, dueDate: '2026-06-10' }
    ];

    const result = buildClientPurchaseHistory({ transactions, installments, payments: [] });
    const recentHome = result.allPurchases.slice(0, 5);

    assert.equal(recentHome.length, 1, 'Debe haber exactamente 1 tarjeta de compra en Home, no 6 cuotas desplegadas');
    const record = recentHome[0];
    assert.equal(record.saleTotal, 300, 'Total de la compra intacto ($300)');
    assert.equal(record.financedAmount, 300, 'Monto financiado = $300');
    assert.equal(record.paidAmount, 50, 'Monto abonado = $50');
    assert.equal(record.remainingAmount, 250, 'Saldo pendiente = $250');
    assert.equal(record.installments.length, 6, 'Conserva el desglose interno de 6 cuotas para el modal de detalle');
  });

  await t.test('E) Compras excluyen abonos / cobranzas (no mezcla abonos en lista de compras)', () => {
    const transactions = [
      { id: 'TX-BUY', category: 'ventas', amount: 80, date: '2026-03-01', items: [{ name: 'Saco de Alimento', quantity: 1, subtotal: 80 }] },
      { id: 'TX-ABONO-1', category: 'ingresos_cobranza', amount: 30, date: '2026-03-05' },
      { id: 'TX-ABONO-2', category: 'pagos', amount: 20, date: '2026-03-08' },
      { id: 'TX-PWA', category: 'ingresos_cobranza', invoiceNumber: 'PWA-PAY-123', amount: 15, date: '2026-03-09' }
    ];

    const result = buildClientPurchaseHistory({ transactions, installments: [], payments: [] });

    assert.equal(result.allPurchases.length, 1, 'Solo debe haber 1 compra real');
    assert.equal(result.allPurchases[0].transactionId, 'TX-BUY');
  });

  await t.test('F) Saldos y montos contables no se alteran al presentar en Home', () => {
    const transactions = [
      { id: 'TX-10', category: 'ventas', amount: 120, totalUSD: 120, date: '2026-03-12', items: [{ name: 'Lima Machete', quantity: 2, subtotal: 120 }] }
    ];
    const installments = [
      { id: 'INST-10-1', transactionId: 'TX-10', installmentNumber: 1, amountUSD: 60, status: 'paid', paidAmount: 60 },
      { id: 'INST-10-2', transactionId: 'TX-10', installmentNumber: 2, amountUSD: 60, status: 'pending', paidAmount: 20 }
    ];
    const payments = [
      { id: 'PAY-1', transactionId: 'TX-10', installmentId: 'INST-10-1', amount: 60, date: '2026-03-13' },
      { id: 'PAY-2', transactionId: 'TX-10', installmentId: 'INST-10-2', amount: 20, date: '2026-03-14' }
    ];

    const result = buildClientPurchaseHistory({ transactions, installments, payments });
    const purchase = result.allPurchases[0];

    assert.equal(purchase.saleTotal, 120);
    assert.equal(purchase.paidAmount, 80);
    assert.equal(purchase.remainingAmount, 40);
    assert.equal(purchase.status, 'pending');
  });

});
