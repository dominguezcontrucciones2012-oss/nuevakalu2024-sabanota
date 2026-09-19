/**
 * Suite de Pruebas de Integración HTTP Real — FASE 3B
 * KALU CRM Oficial / Sabanota
 *
 * Verifica el flujo completo de:
 * 1. Capture obligatorio (MIME, base64, tamaño, magic bytes).
 * 2. Cleanup de archivos huérfanos en fallos de transacción.
 * 3. Deuda cliente intacta al reportar pago.
 * 4. Aprobación y rechazo desde CRM con comprobante obligatorio.
 * 5. Control de autorización estricto para ver captures (/api/pwa-payments/:id/receipt).
 * 6. Vínculo autoritativo transaction.paymentId -> pwa_payment -> capture.
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

// 1. Directorios temporales aislados para datos y medios
const tempDir = path.join(os.tmpdir(), `kalu-test-phase3b-data-${Date.now()}-${process.pid}`);
const tempMediaDir = path.join(os.tmpdir(), `kalu-test-phase3b-media-${Date.now()}-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(tempMediaDir, { recursive: true });

for (const file of fs.readdirSync(devDir)) {
  const src = path.join(devDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(tempDir, file));
  }
}

process.env.KALU_DATA_DIR = tempDir;
process.env.KALU_MEDIA_DIR = tempMediaDir;

const { app, readCollection, writeCollection } = await import('../server.js');

const TEST_PORT = 3109;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Imagen PNG sintética válida de 1x1 píxel
const VALID_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Imagen JPEG sintética válida
const VALID_JPG_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

// Texto falso simulando imagen inválida
const INVALID_TXT_BASE64 = 'data:image/png;base64,SGVsbG8gV29ybGQgTm90IEFuIEltYWdl';

describe('FASE 3B: Suite de Integración HTTP — Capture Obligatorio, Seguridad y Cobranza', () => {
  let serverInstance;

  let clientACookie = '';
  let clientACsrf = '';
  let clientBCookie = '';
  let clientBCsrf = '';
  let adminCookie = '';
  let adminCsrf = '';

  const clientA = {
    id: 'cli-test-3b-a',
    name: 'Cliente A (Test 3B)',
    phone: '584120003301',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 30.00,
    currentDebtUsd: 0,
    creditLimitUsd: 200,
    loyaltyPoints: 0,
    active: true
  };

  const clientB = {
    id: 'cli-test-3b-b',
    name: 'Cliente B (Test 3B)',
    phone: '584120003302',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 40.00,
    currentDebtUsd: 0,
    creditLimitUsd: 200,
    loyaltyPoints: 0,
    active: true
  };

  const adminUser = {
    id: 'usr-admin-3b',
    username: 'admin3b',
    email: 'admin3b@kalu.com',
    name: 'Admin Cobranzas 3B',
    role: 'admin',
    passwordHash: bcrypt.hashSync('adminpass123', 10),
    pinHash: bcrypt.hashSync('123456', 10),
    active: true
  };

  const instA1 = {
    id: 'inst-3b-a1',
    clientId: clientA.id,
    transactionId: 'TX-3B-A',
    amount: 10.00,
    amountUSD: 10.00,
    paidAmount: 0,
    dueDate: '2026-09-30',
    status: 'pending',
    type: 'repuestos',
    installmentNumber: 1,
    totalInstallments: 3
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
    const clients = readCollection('clients') || [];
    clients.push(clientA, clientB);
    writeCollection('clients', clients);

    const users = readCollection('users') || [];
    users.push(adminUser);
    writeCollection('users', users);

    const installments = readCollection('installments') || [];
    installments.push(instA1);
    writeCollection('installments', installments);

    serverInstance = http.createServer(app);
    await new Promise((resolve) => {
      serverInstance.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });

    // Login Cliente A
    const loginARes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: clientA.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(loginARes.status, 200);
    clientACookie = (loginARes.setCookie || '').split(';')[0];
    clientACsrf = loginARes.data?.csrfToken || '';

    // Login Cliente B
    const loginBRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: clientB.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(loginBRes.status, 200);
    clientBCookie = (loginBRes.setCookie || '').split(';')[0];
    clientBCsrf = loginBRes.data?.csrfToken || '';

    // Login Admin CRM
    const adminLoginRes = await httpRequest('/api/auth/login', {
      method: 'POST',
      body: { email: adminUser.email, password: 'adminpass123' }
    });
    assert.strictEqual(adminLoginRes.status, 200);
    adminCookie = (adminLoginRes.setCookie || '').split(';')[0];
    adminCsrf = adminLoginRes.data?.csrfToken || '';
  });

  after(async () => {
    if (serverInstance) {
      await new Promise(r => serverInstance.close(r));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(tempMediaDir, { recursive: true, force: true });
  });

  // TEST A: Reportar pago SIN capture -> 400, no payment, cuota pending, deuda intacta 30
  it('TEST A: Reportar pago SIN capture es rechazado con 400 y mantiene deuda intacta', async () => {
    const res = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientACookie,
      headers: { 'x-csrf-token': clientACsrf },
      body: {
        amount: 4.00,
        paymentMethod: 'Pago Móvil',
        reference: '123456',
        installmentId: instA1.id
        // Sin receiptImageUrl
      }
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('comprobante'));

    // Verificar cuota y deuda en DB
    const installments = readCollection('installments');
    const inst = installments.find(i => i.id === instA1.id);
    assert.strictEqual(inst.status, 'pending');
    assert.strictEqual(inst.paidAmount, 0);

    const clients = readCollection('clients');
    const cli = clients.find(c => c.id === clientA.id);
    assert.strictEqual(cli.outstandingDebt, 30.00);
  });

  // TEST B: Reportar pago CON capture válido -> 200, payment pending, cuota in_review, paidAmount 0, deuda 30, archivo existe
  let createdPaymentId = null;
  let createdPaymentFileName = null;
  it('TEST B: Reportar pago CON capture válido crea payment pending, cuota in_review, y NO cambia deuda (30)', async () => {
    const res = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientACookie,
      headers: { 'x-csrf-token': clientACsrf },
      body: {
        amount: 4.00,
        paymentMethod: 'Pago Móvil',
        reference: '654321',
        installmentId: instA1.id,
        receiptImageUrl: VALID_PNG_BASE64
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.payment.id);
    createdPaymentId = res.data.payment.id;
    createdPaymentFileName = res.data.payment.receiptFileName;

    assert.strictEqual(res.data.payment.status, 'pending');
    assert.strictEqual(res.data.payment.amount, 4.00);
    assert.ok(res.data.payment.receiptImageUrl.includes('/receipt'));

    // Comprobar existencia de archivo en tempMediaDir
    const captureFile = path.join(tempMediaDir, 'captures', res.data.payment.receiptFileName);
    assert.ok(fs.existsSync(captureFile));

    // Comprobar estado en DB
    const installments = readCollection('installments');
    const inst = installments.find(i => i.id === instA1.id);
    assert.strictEqual(inst.status, 'in_review');
    assert.strictEqual(inst.paidAmount, 0);

    const clients = readCollection('clients');
    const cli = clients.find(c => c.id === clientA.id);
    assert.strictEqual(cli.outstandingDebt, 30.00); // DEUDA INTACTA
  });

  // TEST C: Capture con magic bytes inválidos -> 400 y cero efectos
  it('TEST C: Capture con contenido no-imagen es rechazado con 400', async () => {
    const res = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientBCookie,
      headers: { 'x-csrf-token': clientBCsrf },
      body: {
        amount: 5.00,
        paymentMethod: 'Pago Móvil',
        reference: '777888',
        receiptImageUrl: INVALID_TXT_BASE64
      }
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('Formato'));
  });

  // TEST D: Capture demasiado grande (>5MB) -> 400
  it('TEST D: Capture que supera 5MB es rechazado con 400', async () => {
    const fakeLargeBase64 = 'data:image/png;base64,' + Buffer.alloc(6 * 1024 * 1024).toString('base64');
    const res = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientBCookie,
      headers: { 'x-csrf-token': clientBCsrf },
      body: {
        amount: 5.00,
        paymentMethod: 'Pago Móvil',
        reference: '999000',
        receiptImageUrl: fakeLargeBase64
      }
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('tamaño máximo'));
  });

  // TEST E: Aprobar pago válido desde CRM -> deuda 26, paidAmount 4, payment approved, cobranza creada
  it('TEST E: Aprobar pago con capture descuenta deuda (26), sube paidAmount (4) y crea cobranza', async () => {
    const approveRes = await httpRequest(`/api/pwa-payments/${createdPaymentId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.data.success, true);
    assert.strictEqual(approveRes.data.client.outstandingDebt, 26.00);

    // Comprobar estado en DB
    const installments = readCollection('installments');
    const inst = installments.find(i => i.id === instA1.id);
    assert.strictEqual(inst.status, 'pending'); // Cuota restaurada porque aún resta saldo ($6)
    assert.strictEqual(inst.paidAmount, 4.00);

    const txs = readCollection('transactions');
    const cobTx = txs.find(t => t.paymentId === createdPaymentId);
    assert.ok(cobTx);
    assert.strictEqual(cobTx.category, 'ingresos_cobranza');
    assert.strictEqual(cobTx.amount, 4.00);
    assert.ok(cobTx.receiptImageUrl);
  });

  // TEST F: Intentar aprobar pago legacy SIN capture -> rechazo 400 y deuda intacta
  it('TEST F: Intentar aprobar pago legacy sin capture es rechazado con 400', async () => {
    const fakeLegacyPay = {
      id: 'pwa-legacy-no-receipt',
      clientId: clientB.id,
      entityId: clientB.id,
      entityName: clientB.name,
      amount: 10.00,
      paymentMethod: 'Pago Móvil',
      reference: 'LEGACY001',
      status: 'pending',
      receiptImageUrl: null,
      receiptImage: null,
      createdAt: new Date().toISOString()
    };
    const pwaList = readCollection('pwa_payments');
    pwaList.push(fakeLegacyPay);
    writeCollection('pwa_payments', pwaList);

    const res = await httpRequest(`/api/pwa-payments/${fakeLegacyPay.id}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('comprobante'));

    const clients = readCollection('clients');
    const cli = clients.find(c => c.id === clientB.id);
    assert.strictEqual(cli.outstandingDebt, 40.00); // DEUDA INTACTA
  });

  // TEST G: Rechazar pago con capture -> payment rejected, cuota restaurada, deuda intacta, capture se conserva
  it('TEST G: Rechazar pago PWA restaura cuota, deja deuda intacta y conserva capture para auditoría', async () => {
    // 1. Crear pago con capture para rechazar
    const payRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientACookie,
      headers: { 'x-csrf-token': clientACsrf },
      body: {
        amount: 2.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REJECTME',
        installmentId: instA1.id,
        receiptImageUrl: VALID_JPG_BASE64
      }
    });
    assert.strictEqual(payRes.status, 200);
    const rejectPaymentId = payRes.data.payment.id;
    const captureFileName = payRes.data.payment.receiptFileName;

    // 2. Rechazar desde CRM
    const rejectRes = await httpRequest(`/api/pwa-payments/${rejectPaymentId}/reject`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });
    assert.strictEqual(rejectRes.status, 200);

    // 3. Verificaciones
    const pwaList = readCollection('pwa_payments');
    const p = pwaList.find(x => x.id === rejectPaymentId);
    assert.strictEqual(p.status, 'rejected');

    const clients = readCollection('clients');
    const cli = clients.find(c => c.id === clientA.id);
    assert.strictEqual(cli.outstandingDebt, 26.00); // No cambia tras rechazo

    // Archivo de capture sigue existiendo
    const filePath = path.join(tempMediaDir, 'captures', captureFileName);
    assert.ok(fs.existsSync(filePath));
  });

  // TEST H: Cliente B NO puede acceder al receipt de Cliente A -> 403 Forbidden
  it('TEST H: Control de seguridad: Cliente B es rechazado con 403 al solicitar comprobante de Cliente A', async () => {
    const res = await httpRequest(`/api/pwa-payments/${createdPaymentId}/receipt`, {
      method: 'GET',
      cookie: clientBCookie
    });
    assert.strictEqual(res.status, 403);
  });

  // TEST I: Cliente A (propietario) SÍ puede acceder a su propio receipt
  it('TEST I: Cliente A propietario puede descargar su comprobante correctamente', async () => {
    const res = await httpRequest(`/api/pwa-payments/${createdPaymentId}/receipt`, {
      method: 'GET',
      cookie: clientACookie
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
  });

  // TEST J: Admin CRM SÍ puede acceder al comprobante
  it('TEST J: Admin CRM puede ver y descargar el comprobante para conciliación', async () => {
    const res = await httpRequest(`/api/pwa-payments/${createdPaymentId}/receipt`, {
      method: 'GET',
      cookie: adminCookie
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
  });

  // TEST K: Idempotencia: Aprobar por segunda vez devuelve 409 y no reduce doble deuda
  it('TEST K: Idempotencia: Aprobar por segunda vez devuelve 409 y no duplica cobranza', async () => {
    const res = await httpRequest(`/api/pwa-payments/${createdPaymentId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });
    assert.strictEqual(res.status, 409);

    const clients = readCollection('clients');
    const cli = clients.find(c => c.id === clientA.id);
    assert.strictEqual(cli.outstandingDebt, 26.00);
  });

  // TEST M: Deuda abierta sin installmentId + capture reporta correctamente sin bajar deuda
  let openDebtPaymentId = '';
  let openDebtFileName = '';
  it('TEST M: Deuda abierta sin installmentId + capture reporta correctamente sin bajar deuda (30)', async () => {
    const clientOpenDebt = {
      id: 'cli-open-debt-test',
      name: 'Cliente Deuda Abierta Test',
      phone: '584120000099',
      pinHash: bcrypt.hashSync('123456', 10),
      outstandingDebt: 30.00,
      currentDebtUsd: 0,
      loyaltyPoints: 0
    };
    const clients = readCollection('clients') || [];
    clients.push(clientOpenDebt);
    writeCollection('clients', clients);

    // Login cliente de deuda abierta
    const loginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: clientOpenDebt.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(loginRes.status, 200);
    const openCookie = (loginRes.setCookie || '').split(';')[0];
    const openCsrf = loginRes.data?.csrfToken || '';

    // POST reporte de pago de deuda abierta (installmentId = null)
    const reportRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: openCookie,
      headers: { 'x-csrf-token': openCsrf },
      body: {
        amount: 4.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-OPEN-4',
        installmentId: null,
        receiptImageUrl: VALID_PNG_BASE64
      }
    });

    assert.strictEqual(reportRes.status, 200);
    assert.strictEqual(reportRes.data?.success, true);
    openDebtPaymentId = reportRes.data?.payment?.id;
    openDebtFileName = reportRes.data?.payment?.receiptFileName;

    assert.ok(openDebtPaymentId);
    assert.strictEqual(reportRes.data?.payment?.status, 'pending');
    assert.strictEqual(reportRes.data?.payment?.installmentId, null);
    assert.strictEqual(reportRes.data?.payment?.transactionId, null);
    assert.ok(openDebtFileName);

    // Archivo existe en disco
    const captureDiskPath = path.join(tempMediaDir, 'captures', openDebtFileName);
    assert.ok(fs.existsSync(captureDiskPath));

    // Deuda del cliente permanece INTACTA en $30.00
    const cliCheck = (readCollection('clients') || []).find(c => c.id === 'cli-open-debt-test');
    assert.strictEqual(cliCheck?.outstandingDebt, 30.00);
  });

  // TEST N: Aprobar deuda abierta baja deuda solo después de aprobación
  it('TEST N: Aprobar deuda abierta baja deuda a 26 y crea cobranza conservando capture', async () => {
    const approveRes = await httpRequest(`/api/pwa-payments/${openDebtPaymentId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.data?.success, true);

    // Deuda del cliente ahora sí baja a 26.00
    const cliCheck = (readCollection('clients') || []).find(c => c.id === 'cli-open-debt-test');
    assert.strictEqual(cliCheck?.outstandingDebt, 26.00);

    // Cobranza creada en transactions
    const txs = readCollection('transactions') || [];
    const colTx = txs.find(t => t.paymentId === openDebtPaymentId);
    assert.ok(colTx);
    assert.strictEqual(colTx.category, 'ingresos_cobranza');
    assert.strictEqual(colTx.amount, 4.00);

    // Capture sigue existiendo y accesible por endpoint autenticado
    const receiptRes = await httpRequest(`/api/pwa-payments/${openDebtPaymentId}/receipt`, {
      method: 'GET',
      cookie: adminCookie
    });
    assert.strictEqual(receiptRes.status, 200);
  });

  // TEST O: Fallo atómico después de crear archivo ejecuta cleanup y no deja archivo huérfano
  it('TEST O: Fallo atómico en persistencia ejecuta cleanup y no deja archivo huérfano en disco', async () => {
    const capturesFolder = path.join(tempMediaDir, 'captures');
    const filesBefore = fs.readdirSync(capturesFolder).sort();
    const paymentsBefore = (readCollection('pwa_payments') || []).length;

    // Enviar pago con capture válido pero installmentId inexistente -> genera archivo y luego falla en transacción
    const failedRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      cookie: clientACookie,
      headers: { 'x-csrf-token': clientACsrf },
      body: {
        amount: 5.00,
        paymentMethod: 'Transferencia',
        reference: 'REF-ORPHAN-TEST',
        installmentId: 'inst-non-existent-fail-trigger',
        receiptImageUrl: VALID_PNG_BASE64
      }
    });

    assert.strictEqual(failedRes.status, 404);

    // Verificar que el directorio captures NO tiene archivos huérfanos nuevos
    const filesAfter = fs.readdirSync(capturesFolder).sort();
    assert.deepStrictEqual(filesAfter, filesBefore, 'Error: Se detectó un archivo huérfano tras fallo en transacción.');

    // Verificar que no se persistió ningún payment nuevo
    const paymentsAfter = (readCollection('pwa_payments') || []).length;
    assert.strictEqual(paymentsAfter, paymentsBefore);
  });

  // TEST P: receiptImageUrl falso o no resoluble es rechazado en aprobación
  it('TEST P: receiptImageUrl falso o no resoluble es rechazado con 400 y mantiene deuda intacta', async () => {
    const clientFakeReceipt = {
      id: 'cli-fake-receipt-test',
      name: 'Cliente Fake Receipt Test',
      phone: '584120000088',
      pinHash: bcrypt.hashSync('123456', 10),
      outstandingDebt: 50.00,
      currentDebtUsd: 0,
      loyaltyPoints: 0
    };
    const clients = readCollection('clients') || [];
    clients.push(clientFakeReceipt);
    writeCollection('clients', clients);

    // Insertar pago PWA con URL falsa sin archivo real
    const fakePayId = `pwa-fake-${Date.now()}`;
    const fakePayment = {
      id: fakePayId,
      clientId: clientFakeReceipt.id,
      entityId: clientFakeReceipt.id,
      entityName: clientFakeReceipt.name,
      amount: 10.00,
      paymentMethod: 'Pago Móvil',
      reference: 'REF-FAKE-URL',
      installmentId: null,
      transactionId: null,
      receiptFileName: null,
      receiptImageUrl: '/ruta/falsa/que-no-existe-en-disco.png',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    const pwaPayments = readCollection('pwa_payments') || [];
    pwaPayments.push(fakePayment);
    writeCollection('pwa_payments', pwaPayments);

    const txsBefore = (readCollection('transactions') || []).length;

    // Intentar aprobar pago con URL falsa
    const approveRes = await httpRequest(`/api/pwa-payments/${fakePayId}/approve`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'x-csrf-token': adminCsrf }
    });

    assert.strictEqual(approveRes.status, 400);

    // Deuda del cliente permanece INTACTA en $50.00
    const cliAfter = (readCollection('clients') || []).find(c => c.id === clientFakeReceipt.id);
    assert.strictEqual(cliAfter?.outstandingDebt, 50.00);

    // Cero transacciones nuevas
    const txsAfter = (readCollection('transactions') || []).length;
    assert.strictEqual(txsAfter, txsBefore);
  });

  // TEST Q: paymentId de cobranza resuelve exactamente el comprobante y SHA256 del PWA correcto
  it('TEST Q: paymentId de cobranza resuelve exactamente el comprobante y SHA256 del PWA correcto', async () => {
    const txs = readCollection('transactions') || [];
    const collectionTx = txs.find(t => t.paymentId === createdPaymentId);
    assert.ok(collectionTx, 'No se encontró la transacción de cobranza con paymentId.');

    const pwaPayments = readCollection('pwa_payments') || [];
    const sourcePwa = pwaPayments.find(p => p.id === collectionTx.paymentId);
    assert.ok(sourcePwa, 'No se encontró el PWA payment vinculado.');

    assert.strictEqual(sourcePwa.id, createdPaymentId);
    assert.strictEqual(sourcePwa.receiptFileName, createdPaymentFileName);
    assert.ok(sourcePwa.receiptSha256, 'receiptSha256 debe estar presente.');

    // Verificar hash real del archivo en disco
    const captureDiskPath = path.join(tempMediaDir, 'captures', sourcePwa.receiptFileName);
    const diskContent = fs.readFileSync(captureDiskPath);
    const diskSha256 = crypto.createHash('sha256').update(diskContent).digest('hex');
    assert.strictEqual(sourcePwa.receiptSha256, diskSha256);
  });

  // TEST R: Invariabilidad absoluta de data-dev
  it('TEST R: Integridad: data-dev original no fue modificado durante las pruebas', () => {
    const finalHashes = getDevHashes();
    assert.deepStrictEqual(initialDevHashes, finalHashes);
  });
});
