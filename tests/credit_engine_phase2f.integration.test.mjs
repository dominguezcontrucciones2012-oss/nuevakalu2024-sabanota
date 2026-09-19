/**
 * Suite de Pruebas de Integración HTTP Real — FASE 2F
 * KALU CRM Oficial / Sabanota
 *
 * Verifica:
 * - Aislamiento total mediante KALU_DATA_DIR en directorio temporal.
 * - Test 1: Venta a crédito a cliente legacy (outstanding=0, legacy=1.05 + venta $10 -> outstanding=11.05, legacy=0).
 * - Test 2: Intento de pago de deuda abierta > deuda efectiva -> rechazo 400 sin cobranza.
 * - Test 3: Pago parcial $0.50 en cliente legacy 1.05 -> outstanding=0.55, legacy=0.
 * - Test 4: Bloqueo de segundo reporte sobre cuota in_review -> 409 Conflict.
 * - Test 5: Rechazo de pago sobre cuota overdue -> restaura status a overdue.
 * - Test 6: Abono parcial sobre cuota overdue -> paidAmount aumenta y restaura status a overdue.
 * - Test 7: Confirmar eliminación del fallback de plural installmentIds.
 * - Test 8: Verificación estricta de invariabilidad SHA256 de data-dev.
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

// 1. Guardar hashes de data-dev ANTES de cualquier operación
const initialDevHashes = getDevHashes();

// 2. Crear directorio temporal aislado para KALU_DATA_DIR
const tempDir = path.join(os.tmpdir(), `kalu-test-phase2f-${Date.now()}-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });

// Copiar archivos base a tempDir
const devFiles = fs.readdirSync(devDir);
for (const file of devFiles) {
  const src = path.join(devDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(tempDir, file));
  }
}

// Configurar variable de entorno para que server.js use el directorio temporal
process.env.KALU_DATA_DIR = tempDir;
const tempMediaDir = path.join(tempDir, 'media');
fs.mkdirSync(path.join(tempMediaDir, 'captures'), { recursive: true });
process.env.KALU_MEDIA_DIR = tempMediaDir;

const validCapturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// 3. Importar dinámicamente server.js con KALU_DATA_DIR ya configurado
const { app, readCollection, writeCollection } = await import('../server.js');

const TEST_PORT = 3106;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('FASE 2F: Pruebas de Integración y Hardening del Motor de Crédito', () => {
  let serverInstance;

  // Sesiones
  let clientCookie = '';
  let clientCsrf = '';
  let adminCookie = '';
  let adminCsrf = '';

  const clientTestUser = {
    id: 'cli-test-2f',
    name: 'Cliente Test Fase 2F',
    phone: '584120000010',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 30.00,
    currentDebtUsd: 0,
    loyaltyPoints: 0
  };

  const legacyClientTestUser = {
    id: 'cli-legacy-2f',
    name: 'Cliente Legacy Test 2F',
    phone: '584120000011',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 0,
    currentDebtUsd: 1.05,
    loyaltyPoints: 0
  };

  const adminTestUser = {
    id: 'usr-admin-2f',
    username: 'admintest2f',
    email: 'admintest2f@kalu.com',
    active: true,
    name: 'Admin Test 2F',
    role: 'admin',
    passwordHash: bcrypt.hashSync('adminpass123', 10),
    pinHash: bcrypt.hashSync('123456', 10)
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
    // Inyectar usuarios de prueba en el directorio temporal
    const clients = readCollection('clients') || [];
    clients.push(clientTestUser, legacyClientTestUser);
    writeCollection('clients', clients);

    const users = readCollection('users') || [];
    users.push(adminTestUser);
    writeCollection('users', users);

    // Iniciar servidor HTTP
    serverInstance = http.createServer(app);
    await new Promise((resolve) => {
      serverInstance.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });

    // Iniciar sesión cliente normal
    const clientLoginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: clientTestUser.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(clientLoginRes.status, 200);
    clientCookie = (clientLoginRes.setCookie || '').split(';')[0];
    clientCsrf = clientLoginRes.data?.csrfToken || '';

    // Iniciar sesión Admin
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
    // Eliminar directorio temporal
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Error limpiando tempDir:', e);
    }
  });

  // TEST 1: Venta a crédito a cliente legacy (outstanding=0, legacy=1.05 + venta $10 -> outstanding=11.05, legacy=0)
  it('TEST 1: Nueva venta a crédito ($10) a cliente legacy (1.05) unifica deuda a outstandingDebt=11.05 y currentDebtUsd=0', async () => {
    const saleRes = await httpRequest('/api/pos/process-sale', {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf },
      body: {
        paymentMethodType: 'credit',
        clientId: legacyClientTestUser.id,
        saleItems: [
          {
            productId: 'prod-dummy-repuesto',
            productName: 'Guaya Acelerador Test',
            category: 'REPUESTOS DE MOTO',
            priceUSD: 10.00,
            quantityKg: 1,
            subtotal: 10.00
          }
        ],
        saleTotalAmount: 10.00,
        paidAmount: 0
      }
    });

    assert.strictEqual(saleRes.status, 200);
    assert.strictEqual(saleRes.data?.success, true);

    const clientAfter = (readCollection('clients') || []).find(c => c.id === legacyClientTestUser.id);
    assert.strictEqual(clientAfter?.outstandingDebt, 11.05);
    assert.strictEqual(clientAfter?.currentDebtUsd, 0);
  });

  // TEST 2: Cliente deuda abierta 1.05 intenta pagar $2 -> rechazo 400 sin cobranza
  it('TEST 2: Cliente deuda abierta (1.05) intenta pagar $2.00 (superior a deuda) -> rechazo 400 y sin cobranza', async () => {
    // Crear cliente con deuda abierta de $1.05 exacta para el test
    const clients = readCollection('clients') || [];
    const openDebtUser = {
      id: 'cli-open-debt-2f',
      name: 'Cliente Open Debt 2F',
      phone: '584120000012',
      pinHash: bcrypt.hashSync('123456', 10),
      outstandingDebt: 0,
      currentDebtUsd: 1.05,
      loyaltyPoints: 0
    };
    clients.push(openDebtUser);
    writeCollection('clients', clients);

    // Login
    const loginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: openDebtUser.phone, pin: '123456', portalType: 'client' }
    });
    const cookie = (loginRes.setCookie || '').split(';')[0];
    const csrf = loginRes.data?.csrfToken || '';

    // Crear reporte de pago por $2.00 (mayor a 1.05)
    const reportRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie,
      headers: { 'x-csrf-token': csrf },
      body: {
        amount: 2.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-EXCEED-OPEN',
        receiptImage: validCapturePng
      }
    });
    assert.strictEqual(reportRes.status, 200);
    const payId = reportRes.data?.payment?.id;

    const txsBefore = (readCollection('transactions') || []).length;

    // Intentar aprobar como admin
    const approveRes = await httpRequest(`/api/pwa-payments/${payId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(approveRes.status, 400);
    assert.match(approveRes.data?.error, /supera la deuda/);

    // Verificar cliente intacto
    const clientCheck = (readCollection('clients') || []).find(c => c.id === openDebtUser.id);
    assert.strictEqual(clientCheck?.currentDebtUsd, 1.05);

    // Cero transacciones nuevas
    const txsAfter = (readCollection('transactions') || []).length;
    assert.strictEqual(txsAfter, txsBefore);
  });

  // TEST 3: Cliente legacy 1.05 paga 0.50 -> outstandingDebt=0.55, currentDebtUsd=0
  it('TEST 3: Cliente legacy (1.05) realiza pago parcial de $0.50 -> normaliza a outstandingDebt=0.55 y currentDebtUsd=0', async () => {
    const clients = readCollection('clients') || [];
    const legacyPartialUser = {
      id: 'cli-legacy-partial-2f',
      name: 'Cliente Legacy Partial 2F',
      phone: '584120000013',
      pinHash: bcrypt.hashSync('123456', 10),
      outstandingDebt: 0,
      currentDebtUsd: 1.05,
      loyaltyPoints: 0
    };
    clients.push(legacyPartialUser);
    writeCollection('clients', clients);

    const loginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: legacyPartialUser.phone, pin: '123456', portalType: 'client' }
    });
    const cookie = (loginRes.setCookie || '').split(';')[0];
    const csrf = loginRes.data?.csrfToken || '';

    const reportRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie,
      headers: { 'x-csrf-token': csrf },
      body: {
        amount: 0.50,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-LEG-PARTIAL-50',
        receiptImage: validCapturePng
      }
    });
    assert.strictEqual(reportRes.status, 200);
    const payId = reportRes.data?.payment?.id;

    const approveRes = await httpRequest(`/api/pwa-payments/${payId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });
    assert.strictEqual(approveRes.status, 200);

    const clientAfter = (readCollection('clients') || []).find(c => c.id === legacyPartialUser.id);
    assert.strictEqual(clientAfter?.outstandingDebt, 0.55);
    assert.strictEqual(clientAfter?.currentDebtUsd, 0);
  });

  // TEST 4: Cuota pending crea reporte $4 -> in_review. Intento de crear otro reporte sobre misma cuota -> 409
  it('TEST 4: Cuota pending pasa a in_review al reportar pago; segundo reporte sobre la misma cuota devuelve 409 Conflict', async () => {
    const installments = readCollection('installments') || [];
    const pendingInst = {
      id: 'inst-pending-double-test',
      clientId: clientTestUser.id,
      transactionId: 'TX-PEND-01',
      amount: 10.00,
      amountUSD: 10.00,
      paidAmount: 0,
      status: 'pending'
    };
    installments.push(pendingInst);
    writeCollection('installments', installments);

    // 1. Primer reporte
    const rep1 = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 4.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-REP-1',
        installmentId: 'inst-pending-double-test',
        receiptImage: validCapturePng
      }
    });
    assert.strictEqual(rep1.status, 200);
    assert.strictEqual(rep1.data?.payment?.installmentPreviousStatus, 'pending');

    const instCheck1 = (readCollection('installments') || []).find(i => i.id === 'inst-pending-double-test');
    assert.strictEqual(instCheck1?.status, 'in_review');

    // 2. Segundo reporte sobre la misma cuota in_review
    const rep2 = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 4.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-REP-2',
        installmentId: 'inst-pending-double-test',
        receiptImage: validCapturePng
      }
    });
    assert.strictEqual(rep2.status, 409);
    assert.match(rep2.data?.error, /revisión/);
  });

  // TEST 5: Cuota overdue crea pago -> in_review. Rechazar -> vuelve overdue
  it('TEST 5: Cuota overdue pasa a in_review y tras rechazo se restaura exactamente a overdue', async () => {
    const installments = readCollection('installments') || [];
    const overdueInst = {
      id: 'inst-overdue-rej-test',
      clientId: clientTestUser.id,
      transactionId: 'TX-ODUE-01',
      amount: 15.00,
      amountUSD: 15.00,
      paidAmount: 0,
      status: 'overdue'
    };
    installments.push(overdueInst);
    writeCollection('installments', installments);

    // 1. Crear reporte
    const rep = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 15.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-ODUE-REJ',
        installmentId: 'inst-overdue-rej-test',
        receiptImage: validCapturePng
      }
    });
    assert.strictEqual(rep.status, 200);
    assert.strictEqual(rep.data?.payment?.installmentPreviousStatus, 'overdue');
    const payId = rep.data?.payment?.id;

    const instInRev = (readCollection('installments') || []).find(i => i.id === 'inst-overdue-rej-test');
    assert.strictEqual(instInRev?.status, 'in_review');

    // 2. Rechazar
    const rejRes = await httpRequest(`/api/pwa-payments/${payId}/reject`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });
    assert.strictEqual(rejRes.status, 200);

    // 3. Verificar estado restaurado a 'overdue'
    const instRestored = (readCollection('installments') || []).find(i => i.id === 'inst-overdue-rej-test');
    assert.strictEqual(instRestored?.status, 'overdue');
    assert.strictEqual(instRestored?.paidAmount, 0);
  });

  // TEST 6: Cuota overdue pago parcial -> paidAmount aumenta y status vuelve overdue
  it('TEST 6: Cuota overdue con abono parcial ($5 de $15) actualiza paidAmount=5 y vuelve a status=overdue', async () => {
    const installments = readCollection('installments') || [];
    const overdueInst = {
      id: 'inst-overdue-partial-test',
      clientId: clientTestUser.id,
      transactionId: 'TX-ODUE-PARTIAL',
      amount: 15.00,
      amountUSD: 15.00,
      paidAmount: 0,
      status: 'overdue'
    };
    installments.push(overdueInst);
    writeCollection('installments', installments);

    // 1. Crear reporte parcial de $5
    const rep = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientCookie,
      headers: { 'x-csrf-token': clientCsrf },
      body: {
        amount: 5.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-ODUE-PART',
        installmentId: 'inst-overdue-partial-test',
        receiptImage: validCapturePng
      }
    });
    assert.strictEqual(rep.status, 200);
    const payId = rep.data?.payment?.id;

    // 2. Aprobar abono parcial
    const approveRes = await httpRequest(`/api/pwa-payments/${payId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });
    assert.strictEqual(approveRes.status, 200);

    // 3. Verificar cuota
    const instAfter = (readCollection('installments') || []).find(i => i.id === 'inst-overdue-partial-test');
    assert.strictEqual(instAfter?.paidAmount, 5.00);
    assert.strictEqual(instAfter?.status, 'overdue');
  });

  // TEST 7: Confirmar que no existe bypass inseguro de installmentIds plural
  it('TEST 7: Endpoint de aprobación no procesa installmentIds plural arbitrario sin installmentId singular', async () => {
    const fakeFileName = 'capture-bypass-test.png';
    fs.writeFileSync(path.join(tempMediaDir, 'captures', fakeFileName), Buffer.from('fake-image-bytes'));

    const pwaPayments = readCollection('pwa_payments') || [];
    const legacyPluralPay = {
      id: 'pwa-plural-bypass-test',
      clientId: clientTestUser.id,
      entityId: clientTestUser.id,
      entityName: clientTestUser.name,
      amount: 10.00,
      status: 'pending',
      receiptFileName: fakeFileName,
      receiptImageUrl: `/api/pwa-payments/pwa-plural-bypass-test/receipt`,
      installmentIds: ['inst-some-fake-id'],
      createdAt: new Date().toISOString()
    };
    pwaPayments.push(legacyPluralPay);
    writeCollection('pwa_payments', pwaPayments);

    // Al no tener installmentId singular, se procesa como pago de deuda abierta sin alterar cuotas
    const approveRes = await httpRequest(`/api/pwa-payments/${legacyPluralPay.id}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });
    assert.strictEqual(approveRes.status, 200);

    // No hubo búsqueda ni mutación por batch inseguro de cuotas
    const pwaAfter = (readCollection('pwa_payments') || []).find(p => p.id === legacyPluralPay.id);
    assert.strictEqual(pwaAfter?.status, 'approved');
  });

  // TEST 8: Hash data-dev antes vs después es 100% idéntico
  it('TEST 8: Invariabilidad absoluta de data-dev (todos los SHA256 son idénticos antes y después)', () => {
    const postDevHashes = getDevHashes();
    assert.deepStrictEqual(postDevHashes, initialDevHashes, 'Error crítico: data-dev fue modificado durante los tests.');
  });
});
