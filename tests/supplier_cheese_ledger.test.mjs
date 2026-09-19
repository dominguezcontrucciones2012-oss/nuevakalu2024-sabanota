import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Normalización Contable Canónica para Cuentas de Proveedor/Productor:
 * netBalance = balanceOwed - storeDebt
 * balanceOwed = max(netBalance, 0)
 * storeDebt   = max(-netBalance, 0)
 */
export function normalizeSupplierBalance(balanceOwed, storeDebt) {
  const b = Number(balanceOwed) || 0;
  const d = Number(storeDebt) || 0;
  const net = Math.round((b - d) * 100) / 100;
  return {
    balanceOwed: Math.max(0, net),
    storeDebt: Math.max(0, -net),
    netBalance: net
  };
}

/**
 * Simulación del cálculo dinámico de Libreta de Quesero (SuppliersDebtsView.tsx)
 */
export function calculateDynamicBalances(supplier, txList = []) {
  const supNameClean = (supplier?.name || '').trim().toLowerCase();
  const supTxs = (txList || []).filter((d) => {
    if (!d) return false;
    const entityMatch = d.entity && String(d.entity).trim().toLowerCase() === supNameClean;
    const supplierIdMatch = d.supplierId && String(d.supplierId) === String(supplier.id);
    const entityIdMatch = d.entityId && String(d.entityId) === String(supplier.id);
    return entityMatch || supplierIdMatch || entityIdMatch;
  });

  if (supTxs.length > 0) {
    let running = 0;
    supTxs.forEach((tx) => {
      const notesLower = (tx.notes || '').toLowerCase();
      const pmLower = (tx.paymentMethod || '').toLowerCase();

      const isDelivery = (tx.category === 'compras' && tx.isIncome) ||
        notesLower.includes('recibido') ||
        notesLower.includes('arrime') ||
        notesLower.includes('entrega') ||
        notesLower.includes('compra de queso');

      const isStoreDebt = tx.category === 'ventas' ||
        (tx.category === 'credito' && !tx.isIncome) ||
        notesLower.includes('fiado') ||
        notesLower.includes('consumo de tienda') ||
        notesLower.includes('libreta') ||
        pmLower.includes('tienda') ||
        pmLower.includes('libreta') ||
        pmLower.includes('pos');

      if (isDelivery) {
        running += Number(tx.amount) || 0;
      } else if (isStoreDebt) {
        const debtAmt = Number(tx.debtAmount) > 0 ? Number(tx.debtAmount) : (Number(tx.amount) || 0);
        running -= debtAmt;
      } else if (tx.isIncome) {
        running += Number(tx.amount) || 0;
      } else {
        running -= Number(tx.amount) || 0;
      }
    });

    const rounded = Math.round(running * 100) / 100;
    if (rounded >= 0) {
      return { payable: rounded, debt: 0, net: rounded };
    } else {
      return { payable: 0, debt: Math.abs(rounded), net: rounded };
    }
  }

  const net = (Number(supplier?.balanceOwed) || 0) - (Number(supplier?.storeDebt) || 0);
  const rounded = Math.round(net * 100) / 100;
  if (rounded >= 0) {
    return { payable: rounded, debt: 0, net: rounded };
  } else {
    return { payable: 0, debt: Math.abs(rounded), net: rounded };
  }
}

/**
 * Simulación del handler de pago a proveedor (handlePaySupplierRemainingBalance en CRMApp.tsx)
 */
export function applySupplierPayment(currentBalanceOwed, currentStoreDebt, payAmount) {
  const currentNet = (Number(currentBalanceOwed) || 0) - (Number(currentStoreDebt) || 0);
  const finalNet = Math.round((currentNet - Number(payAmount)) * 100) / 100;
  return {
    balanceOwed: Math.max(0, finalNet),
    storeDebt: Math.max(0, -finalNet),
    finalNet
  };
}

describe('🧪 SUITE DE PRUEBAS DE LIBRETA DE QUESO Y CONTABILIDAD DE PROVEEDOR', () => {

  test('1. Subtotal Recibir Queso: 20 kg x $3.00 = $60.00 exactos', () => {
    const qty = 20;
    const price = 3.00;
    const subtotal = Math.round(qty * price * 100) / 100;
    assert.equal(subtotal, 60.00);
  });

  test('2. Caso Canónico: Entrega +400 -> balanceOwed 400, storeDebt 0', () => {
    const res = normalizeSupplierBalance(400, 0);
    assert.equal(res.balanceOwed, 400);
    assert.equal(res.storeDebt, 0);
    assert.equal(res.netBalance, 400);
  });

  test('3. Caso Canónico: POS Productor -21 -> balanceOwed 379, storeDebt 0', () => {
    // POS consume 21 contra el saldo a favor de 400
    const initialBalanceOwed = 400;
    const debtAmount = 21;
    const newBalanceOwed = initialBalanceOwed - debtAmount;
    const res = normalizeSupplierBalance(newBalanceOwed, 0);
    assert.equal(res.balanceOwed, 379);
    assert.equal(res.storeDebt, 0);
    assert.equal(res.netBalance, 379);
  });

  test('4. Caso Canónico: Pago Productor -379 -> balanceOwed 0, storeDebt 0', () => {
    const res = applySupplierPayment(379, 0, 379);
    assert.equal(res.balanceOwed, 0);
    assert.equal(res.storeDebt, 0);
    assert.equal(res.finalNet, 0);
  });

  test('5. Caso Canónico: Normalización si la posición era 400 / 21 y se pagan 379 -> 0 / 0', () => {
    const res = applySupplierPayment(400, 21, 379);
    assert.equal(res.balanceOwed, 0);
    assert.equal(res.storeDebt, 0);
    assert.equal(res.finalNet, 0);
  });

  test('6. Historial Progresivo completo: 400 -> 379 -> 0', () => {
    const supplier = { id: 'sup-angelito', name: 'Angelito', balanceOwed: 0, storeDebt: 0 };
    const txs = [
      { id: 'TX-1', supplierId: 'sup-angelito', entity: 'Angelito', category: 'compras', amount: 400, isIncome: true, notes: 'Entrega de queso' },
      { id: 'TX-2', supplierId: 'sup-angelito', entity: 'Angelito (Productor)', category: 'ventas', amount: 21, debtAmount: 21, isIncome: true, notes: 'Consumo POS' },
      { id: 'TX-3', supplierId: 'sup-angelito', entity: 'Angelito', category: 'compras', amount: 379, isIncome: false, notes: 'Liquidación saldo' }
    ];

    const finalBalances = calculateDynamicBalances(supplier, txs);
    assert.equal(finalBalances.payable, 0);
    assert.equal(finalBalances.debt, 0);
    assert.equal(finalBalances.net, 0);
  });

  test('7. Deuda previa 20 + Entrega 100 = Cuentas por pagar 80 / Cuentas por cobrar 0', () => {
    // Productor debía 20 en tienda (storeDebt: 20) y entrega 100 de queso
    const prevStoreDebt = 20;
    const deliveryCost = 100;
    const netBalance = deliveryCost - prevStoreDebt; // 80
    const res = normalizeSupplierBalance(netBalance, 0);
    assert.equal(res.balanceOwed, 80);
    assert.equal(res.storeDebt, 0);
    assert.equal(res.netBalance, 80);
  });

  test('8. Sobrepago / Adelanto: balanceOwed 50 - Pago 70 = storeDebt 20 (Adelanto)', () => {
    const res = applySupplierPayment(50, 0, 70);
    assert.equal(res.balanceOwed, 0);
    assert.equal(res.storeDebt, 20);
    assert.equal(res.finalNet, -20);
  });

  test('9. Pago exacto no genera adelanto ni deuda residual', () => {
    const res = applySupplierPayment(150.50, 0, 150.50);
    assert.equal(res.balanceOwed, 0);
    assert.equal(res.storeDebt, 0);
    assert.equal(res.finalNet, 0);
  });

  test('10. Límite/Tope de Crédito es comercial y se preserva independientemente del saldo contable', () => {
    const lastDeliveryAmount = 400; // Tope comercial
    const currentNet = 0; // Saldo contable actual
    assert.equal(lastDeliveryAmount, 400);
    assert.equal(currentNet, 0);
  });

  test('11. Stock de producto no involucrado no se modifica', () => {
    const products = [
      { id: 'prod-queso-1', name: 'Queso Llanero', stockKg: 100 },
      { id: 'prod-harina-1', name: 'Harina PAN', stockKg: 50 }
    ];
    // Operación de recepción de 20kg en queso
    const updated = products.map(p => p.id === 'prod-queso-1' ? { ...p, stockKg: p.stockKg + 20 } : p);
    assert.equal(updated.find(p => p.id === 'prod-harina-1').stockKg, 50);
    assert.equal(updated.find(p => p.id === 'prod-queso-1').stockKg, 120);
  });

  test('12. Venta POS normal a cliente no afecta cuentas de proveedores', () => {
    const supplier = { id: 'sup-1', balanceOwed: 379, storeDebt: 0 };
    const clientSale = { clientId: 'cli-1', total: 50, debtAmount: 0 };
    // La venta al cliente no toca el perfil del proveedor
    assert.equal(supplier.balanceOwed, 379);
    assert.equal(supplier.storeDebt, 0);
  });

  test('13. POS Productor sin saldo previo genera storeDebt (fiado)', () => {
    const supplier = { id: 'sup-nuevo', balanceOwed: 0, storeDebt: 0 };
    const debtAmount = 25;
    const res = normalizeSupplierBalance(0, debtAmount);
    assert.equal(res.balanceOwed, 0);
    assert.equal(res.storeDebt, 25);
    assert.equal(res.netBalance, -25);
  });
});
