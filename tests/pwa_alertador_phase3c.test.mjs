/**
 * Suite de Tests — FASE 3C / 3C.1: Alertador PAGOS MUNDO KALU en Tiempo Real (Exclusivo Clientes)
 * KALU CRM Oficial / Sabanota
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPendingMundoKaluPaymentCount, isClientMundoKaluPayment } from '../src/utils/pendingPayments.ts';

describe('FASE 3C / 3C.1: Helper Puro getPendingMundoKaluPaymentCount (Client-Only)', () => {
  // CASO A: Lista vacía o nula retorna 0
  it('CASO A: [] retorna 0 pagos pendientes', () => {
    assert.strictEqual(getPendingMundoKaluPaymentCount([]), 0);
    assert.strictEqual(getPendingMundoKaluPaymentCount(null), 0);
    assert.strictEqual(getPendingMundoKaluPaymentCount(undefined), 0);
  });

  // CASO B: 1 pago cliente en pending retorna 1
  it('CASO B: 1 pago de cliente en pending retorna 1', () => {
    const list = [
      { id: 'pwa-1', status: 'pending', amount: 4.00, entityType: 'client', clientId: 'cli-1' }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 1);
  });

  // CASO C: Cliente approved o rejected no incrementa el contador (retorna 0)
  it('CASO C: Pagos de cliente approved o rejected retornan 0', () => {
    const list = [
      { id: 'pwa-1', status: 'approved', amount: 4.00, entityType: 'client', clientId: 'cli-1' },
      { id: 'pwa-2', status: 'rejected', amount: 6.00, entityType: 'client', clientId: 'cli-2' }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 0);
  });

  // CASO D: Pago pendiente de proveedor / productor NO incrementa Pagos Mundo Kalu (retorna 0)
  it('CASO D: Pago de proveedor/productor en pending NO se cuenta en Pagos Mundo Kalu (0)', () => {
    const list = [
      { id: 'pwa-supp-1', status: 'pending', amount: 50.00, type: 'productor', entityType: 'supplier', supplierId: 'supp-1' },
      { id: 'pwa-supp-2', status: 'pending', amount: 30.00, portalType: 'producer', supplierId: 'supp-2' }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 0);
  });

  // CASO E: 2 clientes pending + 1 supplier pending retorna 2 (NO 3)
  it('CASO E: 2 clientes pending + 1 supplier pending resulta en badge [2], NO [3]', () => {
    const list = [
      { id: 'pwa-cli-1', status: 'pending', amount: 4.00, entityType: 'client', clientId: 'cli-1' },
      { id: 'pwa-cli-2', status: 'pending', amount: 10.00, entityType: 'client', clientId: 'cli-2' },
      { id: 'pwa-supp-1', status: 'pending', amount: 100.00, type: 'productor', supplierId: 'supp-1' }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 2);
  });

  // CASO F: Registros legacy con clientId / installmentId se reconocen como clientes
  it('CASO F: Registros legacy con clientId o installmentId se cuentan si no son suppliers', () => {
    const list = [
      { id: 'pwa-leg-1', status: 'pending', amount: 5.00, clientId: 'cli-legacy-1' },
      { id: 'pwa-leg-2', status: 'pending', amount: 8.00, installmentId: 'inst-legacy-1' }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 2);
  });

  // CASO G: Flag "viewed" o apertura de vista no altera el conteo autoritativo
  it('CASO G: Flag "viewed" o apertura de vista no altera el conteo autoritativo', () => {
    const list = [
      { id: 'pwa-1', status: 'pending', amount: 4.00, entityType: 'client', viewed: true },
      { id: 'pwa-2', status: 'pending', amount: 6.00, entityType: 'client', viewed: false },
      { id: 'pwa-3', status: 'pending', amount: 8.00, entityType: 'client', viewed: true }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 3);
  });

  // CASO H: Al mutar clientes a approved o rejected el contador disminuye en tiempo real
  it('CASO H: Al mutar clientes a approved o rejected el contador disminuye en tiempo real', () => {
    const list = [
      { id: 'pwa-1', status: 'pending', amount: 4.00, entityType: 'client' },
      { id: 'pwa-2', status: 'pending', amount: 6.00, entityType: 'client' },
      { id: 'pwa-3', status: 'pending', amount: 8.00, entityType: 'client' }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 3);

    // Pago 1 aprobado
    list[0].status = 'approved';
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 2);

    // Pago 2 rechazado
    list[1].status = 'rejected';
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 1);

    // Pago 3 aprobado
    list[2].status = 'approved';
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 0);
  });

  // CASO I (3C.2): Registro legacy con SOLO entityId es ambiguo y retorna 0
  it('CASO I (3C.2): Registro legacy con solo entityId (sin clientId/installmentId/client markers) retorna 0', () => {
    const list = [
      { id: 'pwa-ambiguous-1', status: 'pending', amount: 25.00, entityId: 'some-generic-id-123' }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 0);
    assert.strictEqual(isClientMundoKaluPayment(list[0]), false);
  });

  // CASO J (3C.2): Matriz completa: 2 clientes + 1 supplier + 1 ambiguous entityId -> badge [2]
  it('CASO J (3C.2): 2 clientes pending + 1 supplier pending + 1 ambiguous entityId pending -> badge [2]', () => {
    const list = [
      { id: 'cli-p-1', status: 'pending', amount: 15.00, entityType: 'client', clientId: 'c1' },
      { id: 'cli-p-2', status: 'pending', amount: 20.00, source: 'client_portal', clientId: 'c2' },
      { id: 'supp-p-1', status: 'pending', amount: 100.00, supplierId: 's1', portalType: 'producer' },
      { id: 'ambig-p-1', status: 'pending', amount: 50.00, entityId: 'unknown-entity-id' }
    ];
    assert.strictEqual(getPendingMundoKaluPaymentCount(list), 2);
  });
});
