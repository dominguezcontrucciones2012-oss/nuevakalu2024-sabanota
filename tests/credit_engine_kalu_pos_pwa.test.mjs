/**
 * Suite de Pruebas: Motor de Crédito Kalu, Contrato Portal y Autorización POS/PWA
 * FASE KREDIT-1.1
 * 
 * Casos Verificados:
 * CASO A: Cliente A consulta sus transacciones y recibe sus campos financieros (downPayment, financedAmount, installmentsCount, kaluCreditData, authNonce).
 * CASO B: Cliente A no puede obtener transacciones de Cliente B (estricto aislamiento por req.portalUser.id).
 * CASO C: Transacción Crédito Kalu pendiente devuelve exactamente downPayment = 15.75, financedAmount = 5.25, installmentsCount = 3, kaluCreditData.cuotas = [1.75, 1.75, 1.75], authNonce presente.
 * CASO D: Nonce correcto permite aprobación exitosa una sola vez y genera authSignature HMAC.
 * CASO E: Nonce ausente rechaza con 400 Bad Request.
 * CASO F: Nonce incorrecto rechaza con 400 Bad Request.
 * CASO G: Segundo uso del mismo nonce rechaza con 409 Conflict (transacción ya aprobada).
 * CASO H: Cliente B no puede aprobar transacción de Cliente A aunque conozca transactionId o nonce (404/rechazo por pertenencia).
 * CASO I: Historial de transacciones aprobadas/antiguas no expone authNonce.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const devDir = path.resolve('data-dev');

// 1. Crear directorio temporal aislado para KALU_DATA_DIR
const tempDir = path.join(os.tmpdir(), `kalu-test-kredit11-${Date.now()}-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });

// Copiar archivos base a tempDir
const devFiles = fs.readdirSync(devDir);
for (const file of devFiles) {
  const src = path.join(devDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(tempDir, file));
  }
}

// Configurar entorno aislado
process.env.KALU_DATA_DIR = tempDir;
const tempMediaDir = path.join(tempDir, 'media');
fs.mkdirSync(path.join(tempMediaDir, 'captures'), { recursive: true });
process.env.KALU_MEDIA_DIR = tempMediaDir;
process.env.TRANSACTION_SIGNATURE_SECRET = 'test-kalu-hmac-secret-kredit-11-xyz987';

// 2. Importar server.js
const { app, readCollection, writeCollection } = await import('../server.js');

const TEST_PORT = 3108;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('FASE KREDIT-1.1: Contrato Portal Móvil y Seguridad Criptográfica Nonce', () => {
  let serverInstance;

  let clientACookie = '';
  let clientACsrf = '';
  let clientBCookie = '';
  let clientBCsrf = '';

  const clientA = {
    id: 'cli-kredit-a',
    name: 'Cliente A Sabanota',
    phone: '584121111111',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 0,
    currentDebtUsd: 0,
    loyaltyPoints: 0
  };

  const clientB = {
    id: 'cli-kredit-b',
    name: 'Cliente B Sabanota',
    phone: '584122222222',
    pinHash: bcrypt.hashSync('654321', 10),
    outstandingDebt: 0,
    currentDebtUsd: 0,
    loyaltyPoints: 0
  };

  const testNonceA = crypto.randomBytes(32).toString('hex');
  const testNonceB = crypto.randomBytes(32).toString('hex');

  const pendingTxA = {
    id: 'TX-KREDIT-PENDING-A-101',
    clientId: clientA.id,
    entity: clientA.name,
    amount: 21.00,
    debtAmount: 5.25,
    downPayment: 15.75,
    financedAmount: 5.25,
    installmentsCount: 3,
    status: 'pending_approval',
    paymentMethod: 'Crédito Kalu',
    category: 'Repuestos / GEN',
    kaluCreditData: {
      rubro: 'Repuestos / GEN',
      plan: '3 Cuotas (25% Financiado)',
      cuotasCount: 3,
      porcentajeFinanciado: 25,
      inicial: 15.75,
      aFinanciar: 5.25,
      cuotas: [1.75, 1.75, 1.75]
    },
    authNonce: testNonceA,
    createdAt: Date.now(),
    date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  const approvedOldTxA = {
    id: 'TX-KREDIT-APPROVED-A-100',
    clientId: clientA.id,
    entity: clientA.name,
    amount: 10.00,
    debtAmount: 2.50,
    downPayment: 7.50,
    financedAmount: 2.50,
    installmentsCount: 2,
    status: 'approved',
    paymentMethod: 'Crédito Kalu',
    category: 'Víveres',
    kaluCreditData: {
      rubro: 'Víveres',
      plan: '2 Cuotas (25% Financiado)',
      cuotasCount: 2,
      porcentajeFinanciado: 25,
      inicial: 7.50,
      aFinanciar: 2.50,
      cuotas: [1.25, 1.25]
    },
    authNonce: 'secret-old-nonce-should-not-leak',
    authSignature: 'SIG-v1.leaktest.1234567890abcdef',
    createdAt: Date.now() - 3600000,
    date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  const pendingTxB = {
    id: 'TX-KREDIT-PENDING-B-201',
    clientId: clientB.id,
    entity: clientB.name,
    amount: 50.00,
    debtAmount: 12.50,
    downPayment: 37.50,
    financedAmount: 12.50,
    installmentsCount: 3,
    status: 'pending_approval',
    paymentMethod: 'Crédito Kalu',
    authNonce: testNonceB,
    createdAt: Date.now(),
    date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  async function httpRequest(urlPath, { method = 'GET', headers = {}, body = null, cookie = '' } = {}) {
    const fullUrl = `${BASE_URL}${urlPath}`;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (cookie) {
      reqHeaders['Cookie'] = cookie;
    }

    const res = await fetch(fullUrl, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : null
    });

    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const setCookie = res.headers.get('set-cookie') || '';
    return {
      status: res.status,
      headers: res.headers,
      setCookie,
      data
    };
  }

  before(async () => {
    // 1. Guardar usuarios de prueba
    const clients = readCollection('clients');
    clients.push(clientA, clientB);
    writeCollection('clients', clients);

    // 2. Guardar transacciones de prueba
    const txs = readCollection('transactions');
    txs.push(pendingTxA, approvedOldTxA, pendingTxB);
    writeCollection('transactions', txs);

    // 3. Iniciar servidor en TEST_PORT
    await new Promise((resolve) => {
      serverInstance = app.listen(TEST_PORT, () => {
        resolve();
      });
    });

    // 4. Login Cliente A
    const loginResA = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: clientA.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(loginResA.status, 200, 'Login Cliente A debe retornar 200');
    clientACookie = (loginResA.setCookie || '').split(';')[0];
    clientACsrf = loginResA.data?.csrfToken || '';

    // 5. Login Cliente B
    const loginResB = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: clientB.phone, pin: '654321', portalType: 'client' }
    });
    assert.strictEqual(loginResB.status, 200, 'Login Cliente B debe retornar 200');
    clientBCookie = (loginResB.setCookie || '').split(';')[0];
    clientBCsrf = loginResB.data?.csrfToken || '';
  });

  after(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('CASO A y CASO C: Cliente A consulta sus transacciones y recibe sus campos financieros con cuotas [1.75, 1.75, 1.75] y authNonce en pending_approval', async () => {
    const res = await httpRequest('/api/portal/client/transactions', {
      method: 'GET',
      cookie: clientACookie
    });

    assert.strictEqual(res.status, 200, 'Status debe ser 200');
    assert.ok(Array.isArray(res.data), 'Debe devolver array de transacciones');
    
    // Buscar la transacción pendiente de Crédito Kalu
    const tx = res.data.find(t => t.id === pendingTxA.id);
    assert.ok(tx, 'Debe encontrar la transacción pendiente de Cliente A');

    // Validación financiera exacta
    assert.strictEqual(tx.amount, 21.00, 'amount debe ser 21.00');
    assert.strictEqual(tx.downPayment, 15.75, 'downPayment debe ser 15.75');
    assert.strictEqual(tx.financedAmount, 5.25, 'financedAmount debe ser 5.25');
    assert.strictEqual(tx.installmentsCount, 3, 'installmentsCount debe ser 3');
    
    // kaluCreditData
    assert.ok(tx.kaluCreditData, 'kaluCreditData debe estar presente');
    assert.strictEqual(tx.kaluCreditData.inicial, 15.75, 'kaluCreditData.inicial debe ser 15.75');
    assert.strictEqual(tx.kaluCreditData.aFinanciar, 5.25, 'kaluCreditData.aFinanciar debe ser 5.25');
    assert.deepStrictEqual(tx.kaluCreditData.cuotas, [1.75, 1.75, 1.75], 'kaluCreditData.cuotas debe ser [1.75, 1.75, 1.75]');
    assert.strictEqual(tx.kaluCreditData.cuotas.reduce((acc, c) => acc + c, 0), 5.25, 'La suma de las 3 cuotas debe ser exactamente 5.25');

    // authNonce presente para pending_approval
    assert.strictEqual(tx.authNonce, testNonceA, 'authNonce debe ser el generado para Cliente A');
  });

  it('CASO B: Cliente A NO puede obtener transacciones de Cliente B (Aislamiento)', async () => {
    const res = await httpRequest('/api/portal/client/transactions', {
      method: 'GET',
      cookie: clientACookie
    });

    assert.strictEqual(res.status, 200);
    const txIds = res.data.map(t => t.id);
    assert.ok(!txIds.includes(pendingTxB.id), 'Cliente A no debe ver la transacción de Cliente B');
    for (const t of res.data) {
      assert.strictEqual(String(t.clientId), clientA.id, 'Todas las transacciones devueltas deben pertenecer a Cliente A');
    }
  });

  it('CASO I: Transacciones aprobadas / históricas NO exponen authNonce', async () => {
    const res = await httpRequest('/api/portal/client/transactions', {
      method: 'GET',
      cookie: clientACookie
    });

    assert.strictEqual(res.status, 200);
    const approvedTx = res.data.find(t => t.id === approvedOldTxA.id);
    assert.ok(approvedTx, 'Debe incluir la transacción aprobada histórica');
    assert.strictEqual(approvedTx.authNonce, undefined, 'authNonce NO debe ser devuelto en transacciones no pendientes');
  });

  it('CASO E: Nonce ausente rechaza la aprobación con 400 Bad Request', async () => {
    const res = await httpRequest(`/api/portal/client/transactions/${pendingTxA.id}/approve`, {
      method: 'POST',
      headers: { 'x-csrf-token': clientACsrf },
      cookie: clientACookie,
      body: {} // Sin authNonce
    });

    assert.strictEqual(res.status, 400, 'Debe retornar 400 por nonce ausente');
    assert.ok(res.data.error.includes('Nonce de autorización requerido'), 'Mensaje de error debe indicar nonce requerido');
  });

  it('CASO F: Nonce incorrecto rechaza la aprobación con 400 Bad Request', async () => {
    const res = await httpRequest(`/api/portal/client/transactions/${pendingTxA.id}/approve`, {
      method: 'POST',
      headers: { 'x-csrf-token': clientACsrf },
      cookie: clientACookie,
      body: { authNonce: 'nonce_falso_invalido_1234567890' }
    });

    assert.strictEqual(res.status, 400, 'Debe retornar 400 por nonce incorrecto');
    assert.ok(res.data.error.includes('inválido'), 'Mensaje de error debe indicar nonce inválido');
  });

  it('CASO H: Cliente B NO puede aprobar transacción de Cliente A aunque conozca transactionId y nonce', async () => {
    const res = await httpRequest(`/api/portal/client/transactions/${pendingTxA.id}/approve`, {
      method: 'POST',
      headers: { 'x-csrf-token': clientBCsrf },
      cookie: clientBCookie,
      body: { authNonce: testNonceA }
    });

    assert.strictEqual(res.status, 404, 'Debe retornar 404 por no pertenencia a Cliente B');
  });

  it('CASO D: Nonce correcto permite aprobación exitosa una sola vez y genera authSignature HMAC', async () => {
    const res = await httpRequest(`/api/portal/client/transactions/${pendingTxA.id}/approve`, {
      method: 'POST',
      headers: { 'x-csrf-token': clientACsrf },
      cookie: clientACookie,
      body: { authNonce: testNonceA }
    });

    assert.strictEqual(res.status, 200, 'Aprobación debe retornar 200 OK');
    assert.strictEqual(res.data.success, true, 'success debe ser true');
    assert.ok(res.data.transaction?.authSignature, 'Debe devolver authSignature criptográfica');
    assert.ok(res.data.transaction.authSignature.startsWith('SIG-v1.'), 'Firma debe comenzar con SIG-v1.');

    // Verificar en BD
    const txs = readCollection('transactions');
    const approvedTx = txs.find(t => t.id === pendingTxA.id);
    assert.strictEqual(approvedTx.status, 'approved', 'Estado en BD debe ser approved');
    assert.strictEqual(approvedTx.authSignature, res.data.transaction.authSignature, 'authSignature debe coincidir en BD');
  });

  it('CASO G: Segundo uso del mismo nonce / segundo intento de aprobación rechaza con 409 Conflict', async () => {
    const res = await httpRequest(`/api/portal/client/transactions/${pendingTxA.id}/approve`, {
      method: 'POST',
      headers: { 'x-csrf-token': clientACsrf },
      cookie: clientACookie,
      body: { authNonce: testNonceA }
    });

    assert.strictEqual(res.status, 409, 'Debe retornar 409 Conflict porque la transacción ya fue aprobada');
    assert.ok(res.data.error.includes('no está pendiente de aprobación'), 'Error debe advertir estado no pendiente');
  });

  // ====================================================
  // SUITE KREDIT-1.3: CONTRATO CANÓNICO DE CUOTAS Y REDONDEO
  // ====================================================

  it('KREDIT-1.3 TEST A: Total 21.00 (Caso Juan) -> 15.75 inicial (75%), 5.25 financiado (25%), 3 cuotas exactas de [1.75, 1.75, 1.75]', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    const breakdown = calculateKaluCreditBreakdown('3_cuotas', 21.00, 0);

    assert.strictEqual(breakdown.initialPct, 0.75);
    assert.strictEqual(breakdown.initialAmount, 15.75);
    assert.strictEqual(breakdown.financedAmount, 5.25);
    assert.strictEqual(breakdown.installmentsCount, 3);
    assert.deepStrictEqual(breakdown.installments.map(i => i.amount), [1.75, 1.75, 1.75]);
    
    // Invariante canónica: SUM(cuotas) === financedAmount
    const sumCuotas = breakdown.installments.reduce((acc, i) => acc + i.amount, 0);
    assert.strictEqual(Math.round(sumCuotas * 100) / 100, 5.25);
    assert.strictEqual(breakdown.initialAmount + breakdown.financedAmount, 21.00);
  });

  it('KREDIT-1.3 TEST B: Total 24.36 (Con IVA) -> 18.27 inicial (75%), 6.09 financiado (25%), 3 cuotas exactas de [2.03, 2.03, 2.03]', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    const breakdown = calculateKaluCreditBreakdown('3_cuotas', 24.36, 0);

    assert.strictEqual(breakdown.initialPct, 0.75);
    assert.strictEqual(breakdown.initialAmount, 18.27);
    assert.strictEqual(breakdown.financedAmount, 6.09);
    assert.strictEqual(breakdown.installmentsCount, 3);
    assert.deepStrictEqual(breakdown.installments.map(i => i.amount), [2.03, 2.03, 2.03]);
    
    // Invariante canónica: SUM(cuotas) === financedAmount
    const sumCuotas = breakdown.installments.reduce((acc, i) => acc + i.amount, 0);
    assert.strictEqual(Math.round(sumCuotas * 100) / 100, 6.09);
    assert.strictEqual(breakdown.initialAmount + breakdown.financedAmount, 24.36);
  });

  it('KREDIT-1.3 TEST C: Monto no divisible exactamente (Financiado 10.00 / 3 cuotas) -> [3.33, 3.33, 3.34] suma exactamente 10.00', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    // Para total 40 con 75% inicial = 30 inicial, 10 financiado
    const breakdown = calculateKaluCreditBreakdown('3_cuotas', 40.00, 0);

    assert.strictEqual(breakdown.initialAmount, 30.00);
    assert.strictEqual(breakdown.financedAmount, 10.00);
    assert.strictEqual(breakdown.installmentsCount, 3);
    assert.deepStrictEqual(breakdown.installments.map(i => i.amount), [3.33, 3.33, 3.34]);
    
    const sumCuotas = breakdown.installments.reduce((acc, i) => acc + i.amount, 0);
    assert.strictEqual(Math.round(sumCuotas * 100) / 100, 10.00);
  });

  it('KREDIT-1.3 TEST D: Modalidad 1_inicial -> 1 cuota por el 100% del saldo financiado', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    const breakdown = calculateKaluCreditBreakdown('1_inicial', 20.00, 0);

    assert.strictEqual(breakdown.initialAmount, 15.00);
    assert.strictEqual(breakdown.financedAmount, 5.00);
    assert.strictEqual(breakdown.installmentsCount, 1);
    assert.deepStrictEqual(breakdown.installments.map(i => i.amount), [5.00]);
    assert.strictEqual(breakdown.installments[0].daysOffset, 15);
  });

  it('KREDIT-1.3 TEST E: Modalidad 2_iniciales -> 2 cuotas quincenales de [2.50, 2.50]', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    const breakdown = calculateKaluCreditBreakdown('2_iniciales', 20.00, 0);

    assert.strictEqual(breakdown.initialAmount, 15.00);
    assert.strictEqual(breakdown.financedAmount, 5.00);
    assert.strictEqual(breakdown.installmentsCount, 2);
    assert.deepStrictEqual(breakdown.installments.map(i => i.amount), [2.50, 2.50]);
    assert.strictEqual(breakdown.installments[0].daysOffset, 15);
    assert.strictEqual(breakdown.installments[1].daysOffset, 30);
  });

  it('KREDIT-1.3 TEST F: Modalidad 6_cuotas -> 6 cuotas con suma exacta al financiado', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    const breakdown = calculateKaluCreditBreakdown('6_cuotas', 100.00, 0);

    assert.strictEqual(breakdown.initialAmount, 75.00);
    assert.strictEqual(breakdown.financedAmount, 25.00);
    assert.strictEqual(breakdown.installmentsCount, 6);
    assert.deepStrictEqual(breakdown.installments.map(i => i.amount), [4.16, 4.16, 4.16, 4.16, 4.16, 4.20]);
    
    const sumCuotas = breakdown.installments.reduce((acc, i) => acc + i.amount, 0);
    assert.strictEqual(Math.round(sumCuotas * 100) / 100, 25.00);
  });

  it('KREDIT-1.3 TEST G: Modalidad fiado_total -> 0 inicial, 100% financiado, 0 cuotas programadas (deuda abierta)', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    const breakdown = calculateKaluCreditBreakdown('fiado_total', 50.00, 0);

    assert.strictEqual(breakdown.initialPct, 0);
    assert.strictEqual(breakdown.initialAmount, 0);
    assert.strictEqual(breakdown.financedAmount, 50.00);
    assert.strictEqual(breakdown.installmentsCount, 0);
    assert.deepStrictEqual(breakdown.installments, []);
  });

  it('KREDIT-1.3 TEST H: Invariante Estricta: La inicial NUNCA se suma a las cuotas y SUM(cuotas) jamás excede financedAmount', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    const testTotals = [7.50, 15.00, 21.00, 24.36, 33.33, 99.99, 150.00, 325.40];
    const testOptions = ['1_inicial', '2_iniciales', '3_cuotas', '6_cuotas', 'fiado_total'];

    for (const tot of testTotals) {
      for (const opt of testOptions) {
        const b = calculateKaluCreditBreakdown(opt, tot, 0);
        assert.strictEqual(Math.round((b.initialAmount + b.financedAmount) * 100) / 100, tot, `Total mismatch for ${opt} at ${tot}`);
        if (opt !== 'fiado_total') {
          const sum = b.installments.reduce((acc, i) => acc + i.amount, 0);
          assert.strictEqual(Math.round(sum * 100) / 100, b.financedAmount, `Cuotas sum mismatch for ${opt} at ${tot}`);
          for (const inst of b.installments) {
            assert.ok(inst.amount <= b.financedAmount, `Single cuota ${inst.amount} exceeds financed ${b.financedAmount}`);
          }
        }
      }
    }
  });

  it('KREDIT-1.5 TEST: Secuencia de Transición entre modalidades (6 -> 3 -> 2 -> 1 -> Deuda Total -> 6)', async () => {
    const { calculateKaluCreditBreakdown } = await import('../src/utils/kaluCreditCalculator.ts');
    const total = 24.36;
    const points = 0; // VIP 1 (75% inicial, 25% financiado)

    // Paso 1: 6 cuotas
    const b6 = calculateKaluCreditBreakdown('6_cuotas', total, points);
    assert.strictEqual(b6.initialAmount, 18.27);
    assert.strictEqual(b6.financedAmount, 6.09);
    assert.strictEqual(b6.installmentsCount, 6);
    assert.deepStrictEqual(b6.installments.map(i => i.amount), [1.01, 1.01, 1.01, 1.01, 1.01, 1.04]);
    assert.strictEqual(Math.round(b6.installments.reduce((s, i) => s + i.amount, 0) * 100) / 100, 6.09);

    // Paso 2: 3 cuotas (Ningún dato residual de 6 cuotas sobrevive)
    const b3 = calculateKaluCreditBreakdown('3_cuotas', total, points);
    assert.strictEqual(b3.initialAmount, 18.27);
    assert.strictEqual(b3.financedAmount, 6.09);
    assert.strictEqual(b3.installmentsCount, 3);
    assert.deepStrictEqual(b3.installments.map(i => i.amount), [2.03, 2.03, 2.03]);
    assert.strictEqual(Math.round(b3.installments.reduce((s, i) => s + i.amount, 0) * 100) / 100, 6.09);

    // Paso 3: Cotidiano 2 iniciales / 2 pagos
    const b2 = calculateKaluCreditBreakdown('2_iniciales', total, points);
    assert.strictEqual(b2.initialAmount, 18.27);
    assert.strictEqual(b2.financedAmount, 6.09);
    assert.strictEqual(b2.installmentsCount, 2);
    assert.deepStrictEqual(b2.installments.map(i => i.amount), [3.04, 3.05]);
    assert.strictEqual(Math.round(b2.installments.reduce((s, i) => s + i.amount, 0) * 100) / 100, 6.09);

    // Paso 4: Cotidiano 1 inicial / 1 pago de saldo
    const b1 = calculateKaluCreditBreakdown('1_inicial', total, points);
    assert.strictEqual(b1.initialAmount, 18.27);
    assert.strictEqual(b1.financedAmount, 6.09);
    assert.strictEqual(b1.installmentsCount, 1);
    assert.deepStrictEqual(b1.installments.map(i => i.amount), [6.09]);
    assert.strictEqual(Math.round(b1.installments.reduce((s, i) => s + i.amount, 0) * 100) / 100, 6.09);

    // Paso 5: Deuda Total / Fiado 100% ($0 inicial, $24.36 financiado)
    const bFiado = calculateKaluCreditBreakdown('fiado_total', total, points);
    assert.strictEqual(bFiado.initialPct, 0);
    assert.strictEqual(bFiado.initialAmount, 0);
    assert.strictEqual(bFiado.financedAmount, 24.36);
    assert.strictEqual(bFiado.installmentsCount, 0);
    assert.deepStrictEqual(bFiado.installments, []);

    // Paso 6: Retorno a 6 cuotas (Recalcula perfectamente sin arrastrar 0 inicial ni 24.36 de fiado)
    const b6Return = calculateKaluCreditBreakdown('6_cuotas', total, points);
    assert.strictEqual(b6Return.initialAmount, 18.27);
    assert.strictEqual(b6Return.financedAmount, 6.09);
    assert.strictEqual(b6Return.installmentsCount, 6);
    assert.deepStrictEqual(b6Return.installments.map(i => i.amount), [1.01, 1.01, 1.01, 1.01, 1.01, 1.04]);
    assert.strictEqual(Math.round(b6Return.installments.reduce((s, i) => s + i.amount, 0) * 100) / 100, 6.09);
  });
});

