/**
 * Suite de Pruebas de Integración HTTP Real — FASE 2E
 * KALU CRM Oficial / Sabanota
 *
 * Prueba endpoints reales del servidor Express mediante peticiones HTTP completas
 * con sesiones de usuario, tokens CSRF y transacciones atómicas.
 * Aislamiento completo con KALU_DATA_DIR en directorio temporal.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const devDir = path.resolve('data-dev');

function getDevHashes() {
  const files = fs.readdirSync(devDir).filter(f => f.endsWith('_db.json')).sort();
  const hashes = {};
  for (const f of files) {
    const content = fs.readFileSync(path.join(devDir, f));
    hashes[f] = crypto.createHash('sha256').update(content).digest('hex');
  }
  return hashes;
}

const initialDevHashes = getDevHashes();

// Directorio temporal aislado
const tempDir = path.join(os.tmpdir(), `kalu-test-phase2e-${Date.now()}-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });

for (const file of fs.readdirSync(devDir)) {
  const src = path.join(devDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(tempDir, file));
  }
}

process.env.KALU_DATA_DIR = tempDir;
const tempMediaDir = path.join(tempDir, 'media');
fs.mkdirSync(path.join(tempMediaDir, 'captures'), { recursive: true });
process.env.KALU_MEDIA_DIR = tempMediaDir;

const validCapturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const { app, readCollection, writeCollection } = await import('../server.js');

const TEST_PORT = 3105;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('FASE 2E: Pruebas de Integración HTTP Real (Credit Engine, PWA & Idempotencia)', () => {
  let serverInstance;

  // Cookies y CSRF para sesiones
  let clientCookie = '';
  let clientCsrf = '';
  let adminCookie = '';
  let adminCsrf = '';

  const clientTestUser = {
    id: 'cli-test-2e',
    name: 'Cliente Test Fase 2E',
    phone: '584120000001',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 30.00,
    currentDebtUsd: 0,
    loyaltyPoints: 0
  };

  const otherClientTestUser = {
    id: 'cli-other-2e',
    name: 'Otro Cliente Test 2E',
    phone: '584120000002',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 50.00,
    currentDebtUsd: 0,
    loyaltyPoints: 0
  };

  const legacyClientTestUser = {
    id: 'cli-legacy-2e',
    name: 'Cliente Legacy Test 2E',
    phone: '584120000003',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 0,
    currentDebtUsd: 1.05,
    loyaltyPoints: 0
  };

  const adminTestUser = {
    id: 'usr-admin-2e',
    username: 'admintest2e',
    email: 'admintest2e@kalu.com',
    active: true,
    name: 'Admin Test 2E',
    role: 'admin',
    passwordHash: bcrypt.hashSync('adminpass123', 10),
    pinHash: bcrypt.hashSync('123456', 10)
  };

  const testInstallment = {
    id: 'inst-test-100',
    clientId: 'cli-test-2e',
    transactionId: 'TX-TEST-100',
    amount: 10.00,
    amountUSD: 10.00,
    paidAmount: 0,
    dueDate: '2026-10-15',
    status: 'pending',
    type: 'cotidiano'
  };

  const otherClientInstallment = {
    id: 'inst-other-200',
    clientId: 'cli-other-2e',
    transactionId: 'TX-OTHER-200',
    amount: 20.00,
    amountUSD: 20.00,
    paidAmount: 0,
    dueDate: '2026-10-15',
    status: 'pending',
    type: 'repuestos'
  };

  // Helper HTTP genérico
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
    // Inyectar fixtures aislados en colecciones de memoria/disco temporal
    const clients = readCollection('clients') || [];
    clients.push(clientTestUser, otherClientTestUser, legacyClientTestUser);
    writeCollection('clients', clients);

    const users = readCollection('users') || [];
    users.push(adminTestUser);
    writeCollection('users', users);

    const installments = readCollection('installments') || [];
    installments.push(testInstallment, otherClientInstallment);
    writeCollection('installments', installments);

    // Iniciar servidor HTTP en puerto dedicado
    serverInstance = http.createServer(app);
    await new Promise((resolve) => {
      serverInstance.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });

    // Autenticar Cliente PWA
    const clientLoginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: clientTestUser.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(clientLoginRes.status, 200);
    clientCookie = (clientLoginRes.setCookie || '').split(';')[0];
    clientCsrf = clientLoginRes.data?.csrfToken || '';

    // Autenticar Admin CRM
    const adminLoginRes = await httpRequest('/api/auth/login', {
      method: 'POST',
      body: { email: adminTestUser.email, password: 'adminpass123' }
    });
    assert.strictEqual(adminLoginRes.status, 200);
    adminCookie = (adminLoginRes.setCookie || '').split(';')[0];
    adminCsrf = adminLoginRes.data?.csrfToken || '';
  });

  after(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Error limpiando tempDir:', e);
    }
  });

  // CASO A: installmentId inexistente al crear PWA -> rechazo -> cero pagos creados
  it('CASO A: POST /api/portal/client/payments con installmentId inexistente es rechazado con 404', async () => {
    const pwaBefore = readCollection('pwa_payments') || [];
    const res = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 10.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-FAKE-001',
        installmentId: 'inst-non-existent-99999',
        receiptImage: validCapturePng
      }
    });

    assert.strictEqual(res.status, 404);
    assert.match(res.data?.error, /Cuota no encontrada/);

    const pwaAfter = readCollection('pwa_payments') || [];
    assert.strictEqual(pwaAfter.length, pwaBefore.length);
  });

  // CASO B: installmentId de otro cliente -> rechazo 404/403
  it('CASO B: POST /api/portal/client/payments con installment de otro cliente es rechazado con 404', async () => {
    const res = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 20.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-STEAL-001',
        installmentId: 'inst-other-200',
        receiptImage: validCapturePng
      }
    });

    assert.strictEqual(res.status, 404);
    assert.match(res.data?.error, /Cuota no encontrada o no pertenece al cliente/);
  });

  // CASO C: approval con installment/client inconsistente -> rechazo atómico
  it('CASO C: POST /api/pwa-payments/:id/approve con cuota inconsistente rechaza atómicamente', async () => {
    const fakeFileName = 'capture-forged-test.png';
    fs.writeFileSync(path.join(tempMediaDir, 'captures', fakeFileName), Buffer.from('fake-image-bytes'));

    const pwaPayments = readCollection('pwa_payments') || [];
    const forgedPayment = {
      id: 'pwa-forged-001',
      clientId: 'cli-test-2e',
      entityId: 'cli-test-2e',
      entityName: 'Cliente Test',
      amount: 20.00,
      status: 'pending',
      receiptFileName: fakeFileName,
      receiptImageUrl: `/api/pwa-payments/pwa-forged-001/receipt`,
      installmentId: 'inst-other-200',
      transactionId: 'TX-OTHER-200'
    };
    pwaPayments.push(forgedPayment);
    writeCollection('pwa_payments', pwaPayments);

    const res = await httpRequest('/api/pwa-payments/pwa-forged-001/approve', {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(res.status, 403);
    assert.match(res.data?.error, /no pertenece al cliente/);

    const pwaCheck = (readCollection('pwa_payments') || []).find(p => p.id === 'pwa-forged-001');
    assert.strictEqual(pwaCheck?.status, 'pending');
  });

  // CASO D: cuota $10 + pago parcial $4 -> paidAmount=4, pending, deuda cliente -4
  let partialPaymentId = '';
  it('CASO D: Pago parcial $4 sobre cuota $10 actualiza paidAmount=4, status=pending y reduce deuda global', async () => {
    const createRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 4.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-PARTIAL-4',
        installmentId: 'inst-test-100',
        receiptImage: validCapturePng
      }
    });

    assert.strictEqual(createRes.status, 200);
    assert.strictEqual(createRes.data?.success, true);
    partialPaymentId = createRes.data?.payment?.id;
    assert.strictEqual(createRes.data?.payment?.transactionId, 'TX-TEST-100');

    const instInReview = (readCollection('installments') || []).find(i => i.id === 'inst-test-100');
    assert.strictEqual(instInReview?.status, 'in_review');

    const approveRes = await httpRequest(`/api/pwa-payments/${partialPaymentId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.data?.success, true);

    const instAfter = (readCollection('installments') || []).find(i => i.id === 'inst-test-100');
    assert.strictEqual(instAfter?.paidAmount, 4.00);
    assert.strictEqual(instAfter?.status, 'pending');
    assert.strictEqual(instAfter?.paidAt, null);

    const clientAfter = (readCollection('clients') || []).find(c => c.id === 'cli-test-2e');
    assert.strictEqual(clientAfter?.outstandingDebt, 26.00);
  });

  // CASO E: segundo pago $6 sobre cuota anterior -> paidAmount=10, paid, deuda cliente -6 adicional
  let finalPaymentId = '';
  it('CASO E: Segundo pago $6 sobre cuota restante salda la cuota (status=paid, paidAmount=10) y reduce deuda a 20', async () => {
    const createRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 6.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-FINAL-6',
        installmentId: 'inst-test-100',
        receiptImage: validCapturePng
      }
    });

    assert.strictEqual(createRes.status, 200);
    finalPaymentId = createRes.data?.payment?.id;

    const approveRes = await httpRequest(`/api/pwa-payments/${finalPaymentId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(approveRes.status, 200);

    const instAfter = (readCollection('installments') || []).find(i => i.id === 'inst-test-100');
    assert.strictEqual(instAfter?.paidAmount, 10.00);
    assert.strictEqual(instAfter?.status, 'paid');
    assert.ok(instAfter?.paidAt);

    const clientAfter = (readCollection('clients') || []).find(c => c.id === 'cli-test-2e');
    assert.strictEqual(clientAfter?.outstandingDebt, 20.00);
  });

  // CASO F: pago $11 sobre saldo $10 -> rechazo sin efectos
  it('CASO F: Intentar pagar $11 sobre una cuota de $10 es rechazado con 400', async () => {
    const installments = readCollection('installments') || [];
    const freshInst = {
      id: 'inst-fresh-10',
      clientId: 'cli-test-2e',
      transactionId: 'TX-FRESH-10',
      amount: 10.00,
      amountUSD: 10.00,
      paidAmount: 0,
      status: 'pending'
    };
    installments.push(freshInst);
    writeCollection('installments', installments);

    const res = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 11.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-EXCEED',
        installmentId: 'inst-fresh-10',
        receiptImage: validCapturePng
      }
    });

    assert.strictEqual(res.status, 400);
    assert.match(res.data?.error, /excede el saldo restante/);
  });

  // CASO G: aprobar mismo pago dos veces -> segunda devuelve 409 y no cambia nada
  it('CASO G: Idempotencia: Aprobar el mismo pago por segunda vez devuelve 409 y no duplica cobranza', async () => {
    const clientBefore = (readCollection('clients') || []).find(c => c.id === 'cli-test-2e');
    const txCountBefore = (readCollection('transactions') || []).length;

    const resRepeat = await httpRequest(`/api/pwa-payments/${finalPaymentId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(resRepeat.status, 409);
    assert.match(resRepeat.data?.error, /ya fue procesado previamente/);

    const clientAfter = (readCollection('clients') || []).find(c => c.id === 'cli-test-2e');
    assert.strictEqual(clientAfter?.outstandingDebt, clientBefore?.outstandingDebt);

    const txCountAfter = (readCollection('transactions') || []).length;
    assert.strictEqual(txCountAfter, txCountBefore);
  });

  // CASO H: rechazar pago in_review -> cuota vuelve a pending sin alterar paidAmount
  it('CASO H: Rechazar pago en revisión devuelve la cuota a pending conservando paidAmount', async () => {
    const installments = readCollection('installments') || [];
    const rejectTestInst = {
      id: 'inst-rej-test',
      clientId: 'cli-test-2e',
      transactionId: 'TX-REJ-01',
      amount: 10.00,
      amountUSD: 10.00,
      paidAmount: 2.00,
      status: 'pending'
    };
    installments.push(rejectTestInst);
    writeCollection('installments', installments);

    const createRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 3.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-TO-REJECT',
        installmentId: 'inst-rej-test',
        receiptImage: validCapturePng
      }
    });
    assert.strictEqual(createRes.status, 200);
    const rejPayId = createRes.data?.payment?.id;

    const instInRev = (readCollection('installments') || []).find(i => i.id === 'inst-rej-test');
    assert.strictEqual(instInRev?.status, 'in_review');

    const rejectRes = await httpRequest(`/api/pwa-payments/${rejPayId}/reject`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });
    assert.strictEqual(rejectRes.status, 200);

    const instAfterRej = (readCollection('installments') || []).find(i => i.id === 'inst-rej-test');
    assert.strictEqual(instAfterRej?.status, 'pending');
    assert.strictEqual(instAfterRej?.paidAmount, 2.00);
  });

  // CASO I: legacy: outstanding=0, currentDebtUsd=1.05 paga 0.50 -> normaliza a outstanding=0.55, currentDebtUsd=0
  it('CASO I: Cliente legacy con outstandingDebt=0 y currentDebtUsd=1.05 normaliza a outstandingDebt=0.55 y currentDebtUsd=0 tras pago de $0.50', async () => {
    const legLoginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: legacyClientTestUser.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(legLoginRes.status, 200);
    const legCookie = (legLoginRes.setCookie || '').split(';')[0];
    const legCsrf = legLoginRes.data?.csrfToken || '';

    const createRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: legCookie,
      headers: { 'x-csrf-token': legCsrf },
      body: {
        amount: 0.50,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-LEGACY-50',
        receiptImage: validCapturePng
      }
    });
    assert.strictEqual(createRes.status, 200);
    const legPayId = createRes.data?.payment?.id;

    const approveRes = await httpRequest(`/api/pwa-payments/${legPayId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });
    assert.strictEqual(approveRes.status, 200);

    const clientAfter = (readCollection('clients') || []).find(c => c.id === 'cli-legacy-2e');
    assert.strictEqual(clientAfter?.outstandingDebt, 0.55);
    assert.strictEqual(clientAfter?.currentDebtUsd, 0);
  });

  // CASO J: Verificación de Grupo C
  it('CASO J: Verificación de consistencia del Grupo C (0 clientes en base actual)', () => {
    const clients = readCollection('clients') || [];
    const groupC = clients.filter(c => Number(c.outstandingDebt || 0) > 0 && Number(c.currentDebtUsd || 0) > 0);
    assert.strictEqual(groupC.length, 0);
  });
});
