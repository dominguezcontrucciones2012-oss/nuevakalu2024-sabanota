import test from 'node:test';
import assert from 'node:assert/strict';

// Helper simulación del motor de bóveda (idéntico a CRMApp.tsx y server.js)
function calculateVaultDelta(addedPayments, paymentMethodType, amountPaid, bcvRateAtSettlement) {
  let deltaUsd = 0;
  let deltaBs = 0;
  let deltaBankBs = 0;
  let deltaBankUsd = 0;
  const rate = bcvRateAtSettlement || 848.5458;

  if (addedPayments && Array.isArray(addedPayments) && addedPayments.length > 0) {
    addedPayments.forEach((p) => {
      const m = (p.method || '').toLowerCase().trim();
      const amt = Number(p.amount) || 0;
      const orig = Number(p.originalAmount) || 0;

      // Exclusión estricta de crédito / financiamiento (no constituyen dinero físico recibido en caja ni bóveda)
      if (m.includes('kalu') || m.includes('crédito') || m.includes('credito') || m.includes('fiado') || m.includes('libreta')) {
        return;
      }

      if (m.includes('efectivo') && (m.includes('$') || m.includes('usd') || (!m.includes('bs') && !m.includes('ves')))) {
        deltaUsd += amt;
      } else if (m.includes('efectivo') && (m.includes('bs') || m.includes('ves'))) {
        deltaBs += orig || (amt * rate);
      } else if (m.includes('movil') || m.includes('móvil') || m.includes('transfer') || m.includes('tarjeta') || m.includes('punto') || m.includes('bio') || m.includes('banco bs') || p.currency === 'Bs' || p.currency === 'VES') {
        deltaBankBs += orig || (amt * rate);
      } else if (m.includes('zelle') || m.includes('banco usd') || m.includes('binance') || m.includes('dolar') || m.includes('usd') || p.currency === 'USD') {
        deltaBankUsd += amt;
      } else {
        deltaBankBs += orig || (amt * rate);
      }
    });
  } else {
    const pm = (paymentMethodType || 'Efectivo').toLowerCase().trim();
    if (pm.includes('kalu') || pm.includes('crédito') || pm.includes('credito') || pm.includes('fiado') || pm.includes('libreta')) {
      // Ventas a crédito / financiamiento puro no generan delta físico en bóveda
    } else if (pm.includes('efectivo') && (pm.includes('$') || pm.includes('usd') || (!pm.includes('bs') && !pm.includes('ves')))) {
      deltaUsd += amountPaid;
    } else if (pm.includes('efectivo') && (pm.includes('bs') || pm.includes('ves'))) {
      deltaBs += amountPaid * rate;
    } else if (pm.includes('movil') || pm.includes('móvil') || pm.includes('transfer') || pm.includes('tarjeta') || pm.includes('punto') || pm.includes('bio')) {
      deltaBankBs += amountPaid * rate;
    } else if (pm.includes('zelle') || pm.includes('banco usd') || pm.includes('binance')) {
      deltaBankUsd += amountPaid;
    } else {
      deltaUsd += amountPaid;
    }
  }

  return { deltaUsd, deltaBs, deltaBankBs, deltaBankUsd };
}

// Helper simulación Cierre de Caja totalCreditSales (CheesePOSView.tsx)
function calculateTotalCreditSales(salesList) {
  return salesList.reduce((sum, s) => {
    let creditInSale = Number(s.debtAmount) || 0;
    if (s.addedPayments && Array.isArray(s.addedPayments)) {
      const kaluFinanced = s.addedPayments
        .filter((p) => p && (p.method || '').toLowerCase().includes('kalu'))
        .reduce((kSum, p) => kSum + (Number(p.amount) || 0), 0);
      if (kaluFinanced > 0 && creditInSale === 0) {
        creditInSale += kaluFinanced;
      }
    }
    return sum + creditInSale;
  }, 0);
}

// Helper simulación Arqueo POS por método físico (CheesePOSView.tsx)
function calculateArqueoByMethod(salesList, method, rate = 848.5458) {
  return salesList.reduce((sum, s) => {
    if (s.addedPayments && Array.isArray(s.addedPayments) && s.addedPayments.length > 0) {
      const amountInMethod = s.addedPayments
        .filter((p) => {
          if (!p || !p.method) return false;
          const m = p.method.toLowerCase().trim();
          if (method === 'Efectivo $') return m.includes('efectivo') && (m.includes('$') || m.includes('usd') || (!m.includes('bs') && !m.includes('ves')));
          if (method === 'Efectivo Bs') return m.includes('efectivo') && (m.includes('bs') || m.includes('ves'));
          if (method === 'Pago Móvil') return m.includes('movil') || m.includes('transfer') || m === 'pago movil' || m === 'pago móvil';
          if (method === 'Tarjeta / Punto') return m.includes('tarjeta') || m.includes('punto') || m.includes('pos') || m.includes('debito');
          if (method === 'BioPago') return m.includes('bio');
          return m === method.toLowerCase().trim();
        })
        .reduce((acc, p) => {
          if (method === 'Efectivo Bs' || method === 'Pago Móvil' || method === 'BioPago' || method === 'Tarjeta / Punto') {
            const val = Number(p.originalAmount) || (Number(p.amount) * rate);
            return acc + val;
          }
          return acc + (Number(p.amount) || 0);
        }, 0);
      return sum + amountInMethod;
    }
    return sum;
  }, 0);
}

test('1. Caso Real Crédito Kalu: Total $23.20 (Inicial Pago Móvil $17.40 + Financiado $5.80)', () => {
  const addedPayments = [
    { method: 'Mundo Kalu', amount: 5.80, originalAmount: 5.80, currency: '$', reference: 'KALU-085893' },
    { method: 'Pago Móvil', amount: 17.40, originalAmount: 14764.70, currency: 'Bs', reference: '123456' }
  ];

  const vault = calculateVaultDelta(addedPayments, 'Multipago', 23.20, 848.5458);

  // La bóveda debe recibir ÚNICAMENTE el Pago Móvil físico (14,764.70 Bs).
  // Mundo Kalu ($5.80) NO debe agregar NADA a deltaBankBs ni deltaUsd.
  assert.equal(vault.deltaUsd, 0, 'deltaUsd debe ser 0');
  assert.equal(vault.deltaBs, 0, 'deltaBs debe ser 0');
  assert.equal(vault.deltaBankBs, 14764.70, 'deltaBankBs debe ser exactamente 14764.70 Bs (solo la inicial física)');
  assert.equal(vault.deltaBankUsd, 0, 'deltaBankUsd debe ser 0');
});

test('2. Cierre de Caja contabiliza crédito financiado de Mundo Kalu ($5.80) sin duplicar', () => {
  const sale = {
    id: 'TX-1789872177220',
    invoiceNumber: 'F-6055',
    amount: 23.20,
    debtAmount: 0,
    addedPayments: [
      { method: 'Mundo Kalu', amount: 5.80, reference: 'KALU-085893' },
      { method: 'Pago Móvil', amount: 17.40, originalAmount: 14764.70 }
    ]
  };

  const creditTotal = calculateTotalCreditSales([sale]);
  assert.equal(creditTotal, 5.80, 'totalCreditSales en Cierre debe ser 5.80 USD');
});

test('3. Arqueo de Caja POS suma exclusivamente la moneda física de la inicial', () => {
  const sale = {
    id: 'TX-1789872177220',
    amount: 23.20,
    addedPayments: [
      { method: 'Mundo Kalu', amount: 5.80 },
      { method: 'Pago Móvil', amount: 17.40, originalAmount: 14764.70 }
    ]
  };

  const mobileTotal = calculateArqueoByMethod([sale], 'Pago Móvil');
  const cashUsdTotal = calculateArqueoByMethod([sale], 'Efectivo $');

  assert.equal(mobileTotal, 14764.70, 'Arqueo de Pago Móvil debe ser 14764.70 Bs');
  assert.equal(cashUsdTotal, 0, 'Arqueo de Efectivo USD debe ser 0.00');
});

test('4. Regresiones de Métodos Físicos Puros y Multipago sin Kalu', () => {
  // A. Efectivo USD puro
  const vUsd = calculateVaultDelta(null, 'Efectivo $', 50.00, 848.5458);
  assert.equal(vUsd.deltaUsd, 50.00);

  // B. Pago Móvil puro
  const vPm = calculateVaultDelta(null, 'Pago Móvil', 10.00, 848.5458);
  assert.equal(vPm.deltaBankBs, 10.00 * 848.5458);

  // C. Multipago Físico (Efectivo $20 + Pago Móvil $30)
  const multiAdded = [
    { method: 'Efectivo $', amount: 20.00 },
    { method: 'Pago Móvil', amount: 30.00, originalAmount: 25456.37, currency: 'Bs' }
  ];
  const vMulti = calculateVaultDelta(multiAdded, 'Multipago', 50.00, 848.5458);
  assert.equal(vMulti.deltaUsd, 20.00);
  assert.equal(vMulti.deltaBankBs, 25456.37);

  // D. Crédito Tradicional / Fiado puro (sin inicial)
  const vFiado = calculateVaultDelta(null, 'Crédito / Fiado', 40.00, 848.5458);
  assert.equal(vFiado.deltaUsd, 0);
  assert.equal(vFiado.deltaBankBs, 0);
});
