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

  await t.test('G) Caso Real: Venta POS (F-7519) + Autorización Crédito (KALU-161091) + 3 Cuotas ($58 saldo)', () => {
    // 1. Transacción de venta POS generada al facturar
    const txSalePos = {
      id: 'TX-1790458201469',
      invoiceNumber: 'F-7519',
      category: 'ventas',
      amount: 232.00,
      totalUSD: 232.00,
      date: '2026-09-26',
      status: 'Completado',
      paymentMethod: 'Multipago',
      clientId: 'cli-124',
      items: [{ name: 'BENCINA', quantityKg: 200, subtotal: 200, price: 1.0 }],
      addedPayments: [
        { method: 'Tarjeta / Punto', amount: 174.00 },
        { method: 'Mundo Kalu', amount: 58.00, reference: 'KALU-161091' }
      ]
    };

    // 2. Transacción de crédito autorizada
    const txCreditApproval = {
      id: '1790458161742',
      invoiceNumber: 'KALU-161091',
      category: 'credito',
      amount: 232.00,
      totalUSD: 232.00,
      downPayment: 174.00,
      financedAmount: 58.00,
      status: 'approved',
      clientId: 'cli-124',
      date: '2026-09-26',
      kaluCreditData: {
        inicial: 174.00,
        aFinanciar: 58.00,
        cuotas: [19.33, 19.33, 19.34]
      }
    };

    // 3. Cuotas asociadas al transactionId de la autorización de crédito
    const installments = [
      { id: 'INST-1790458161742-1', transactionId: '1790458161742', installmentNumber: 1, amountUSD: 19.33, paidAmount: 0, status: 'pending', dueDate: '2026-10-11' },
      { id: 'INST-1790458161742-2', transactionId: '1790458161742', installmentNumber: 2, amountUSD: 19.33, paidAmount: 0, status: 'pending', dueDate: '2026-10-26' },
      { id: 'INST-1790458161742-3', transactionId: '1790458161742', installmentNumber: 3, amountUSD: 19.34, paidAmount: 0, status: 'pending', dueDate: '2026-11-10' }
    ];

    const result = buildClientPurchaseHistory({
      transactions: [txSalePos, txCreditApproval],
      installments,
      payments: []
    });

    // Validar Home (allPurchases)
    assert.equal(result.allPurchases.length, 1, 'Debe unificar en EXACTAMENTE 1 sola compra comercial (no 2 tarjetas)');
    const p = result.allPurchases[0];

    assert.equal(p.saleTotal, 232.00, 'Total de la compra = $232.00');
    assert.equal(p.financedAmount, 58.00, 'Monto financiado = $58.00');
    assert.equal(p.paidAmount, 174.00, 'Inicial abonada = $174.00');
    assert.equal(p.remainingAmount, 58.00, 'Saldo pendiente real = $58.00');
    assert.equal(p.status, 'pending', 'Estado debe ser pending (no pagada ni liquidada)');
    assert.equal(p.invoiceNumber, 'F-7519', 'Debe conservar la factura comercial POS F-7519');
    assert.equal(p.items.length, 1, 'Conserva el producto BENCINA');
    assert.equal(p.items[0].name, 'BENCINA');
    assert.equal(p.installments.length, 3, 'Conserva las 3 cuotas para el modal de detalle');

    // Validar Pestañas de Mis Compras
    assert.equal(result.porPagar.length, 1, 'Debe figurar en Por Pagar (1)');
    assert.equal(result.pagadas.length, 0, 'NO debe figurar en Pagadas (0)');
    assert.equal(result.canceladas.length, 0, 'NO debe figurar en Canceladas (0)');
  });

  await t.test('H) Control: Compra totalmente pagada (balance = 0) figura en Pagadas / Liquidada sin romperse', () => {
    // Venta a crédito ya saldada 100%
    const txSale = {
      id: 'TX-PAID-1',
      invoiceNumber: 'F-8000',
      category: 'ventas',
      amount: 100.00,
      totalUSD: 100.00,
      date: '2026-03-01',
      clientId: 'cli-124',
      items: [{ name: 'Queso Telita', quantityKg: 10, subtotal: 100 }],
      addedPayments: [{ method: 'Mundo Kalu', amount: 100.00, reference: 'KALU-999000' }]
    };

    const txCredit = {
      id: '999000',
      invoiceNumber: 'KALU-999000',
      category: 'credito',
      amount: 100.00,
      totalUSD: 100.00,
      downPayment: 0,
      financedAmount: 100.00,
      clientId: 'cli-124'
    };

    const installments = [
      { id: 'INST-PAID-1', transactionId: '999000', installmentNumber: 1, amountUSD: 50.00, paidAmount: 50.00, status: 'paid' },
      { id: 'INST-PAID-2', transactionId: '999000', installmentNumber: 2, amountUSD: 50.00, paidAmount: 50.00, status: 'paid' }
    ];

    const result = buildClientPurchaseHistory({
      transactions: [txSale, txCredit],
      installments,
      payments: []
    });

    assert.equal(result.allPurchases.length, 1, 'Total 1 compra comercial');
    const p = result.allPurchases[0];
    assert.equal(p.saleTotal, 100.00);
    assert.equal(p.paidAmount, 100.00);
    assert.equal(p.remainingAmount, 0);
    assert.equal(p.status, 'paid');

    assert.equal(result.porPagar.length, 0, 'Por pagar = 0');
    assert.equal(result.pagadas.length, 1, 'Pagadas = 1');
    assert.equal(result.canceladas.length, 0, 'Canceladas = 0');
  });

});

