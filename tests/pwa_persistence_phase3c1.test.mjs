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

// Directorios temporales aislados
const tempDir = path.join(os.tmpdir(), `kalu-test-phase3c1-data-${Date.now()}-${process.pid}`);
const tempMediaDir = path.join(os.tmpdir(), `kalu-test-phase3c1-media-${Date.now()}-${process.pid}`);
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

const TEST_PORT = 3110;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

const PNG_1X1_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const rawPngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const expectedSha256 = crypto.createHash('sha256').update(rawPngBytes).digest('hex');

describe('FASE 3C.1 — Persistencia de Captures, Recreación de Proceso y Backup/Restore Integral', () => {
  let serverInstance;
  let clientCookie = '';
  let clientCsrf = '';
  let adminCookie = '';
  let adminCsrf = '';

  const client1 = {
    id: 'cli-test-3c1-1',
    name: 'Cliente Persistencia 3C1',
    phone: '584120003399',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 100.00,
    currentDebtUsd: 0,
    creditLimitUsd: 500,
    loyaltyPoints: 0,
    active: true
  };

  const adminUser = {
    id: 'usr-admin-3c1',
    username: 'admin3c1',
    email: 'admin3c1@kalu.com',
    name: 'Admin Persistencia 3C1',
    role: 'admin',
    passwordHash: bcrypt.hashSync('adminpass123', 10),
    pinHash: bcrypt.hashSync('123456', 10),
    active: true
  };

  const inst1 = {
    id: 'inst-3c1-1',
    clientId: client1.id,
    transactionId: 'TX-3C1-1',
    amount: 50.00,
    amountUSD: 50.00,
    paidAmount: 0,
    dueDate: '2026-09-30',
    status: 'pending',
    type: 'repuestos',
    installmentNumber: 1,
    totalInstallments: 2
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
    clients.push(client1);
    writeCollection('clients', clients);

    const users = readCollection('users') || [];
    users.push(adminUser);
    writeCollection('users', users);

    const installments = readCollection('installments') || [];
    installments.push(inst1);
    writeCollection('installments', installments);

    serverInstance = http.createServer(app);
    await new Promise((resolve) => {
      serverInstance.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });

    // Login Cliente
    const loginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: client1.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(loginRes.status, 200);
    clientCookie = (loginRes.setCookie || '').split(';')[0];
    clientCsrf = loginRes.data?.csrfToken || '';

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
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(tempMediaDir, { recursive: true, force: true });
    } catch {}

    const finalDevHashes = getDevHashes();
    assert.deepStrictEqual(finalDevHashes, initialDevHashes, 'Los archivos de data-dev real no deben haber sido modificados.');
  });

  let createdPaymentId = null;
  let createdFileName = null;
  let backupPayload = null;

  it('1. Cliente crea reporte de pago con capture válido en Servidor Activo', async () => {
    const postRes = await httpRequest('/api/portal/client/payments', {
      method: 'POST',
      headers: {
        'x-csrf-token': clientCsrf
      },
      cookie: clientCookie,
      body: {
        amount: 50.00,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-3C1-PERSISTENCE',
        bank: 'Banesco',
        installmentId: inst1.id,
        receiptImage: PNG_1X1_BASE64
      }
    });

    assert.strictEqual(postRes.status, 200);
    assert.strictEqual(postRes.data.success, true);
    assert.ok(postRes.data.payment.id);
    assert.strictEqual(postRes.data.payment.receiptSha256, expectedSha256);
    assert.strictEqual(postRes.data.payment.entityType, 'client');
    assert.strictEqual(postRes.data.payment.source, 'client_portal');

    createdPaymentId = postRes.data.payment.id;
    createdFileName = postRes.data.payment.receiptFileName;

    // Verificar existencia física en directorio protegido de medios
    const physicalPath = path.join(tempMediaDir, 'captures', createdFileName);
    assert.strictEqual(fs.existsSync(physicalPath), true, 'El capture debe existir en protected_media/captures');
    const diskBuf = fs.readFileSync(physicalPath);
    assert.strictEqual(crypto.createHash('sha256').update(diskBuf).digest('hex'), expectedSha256);
  });

  it('2. Recreación de Proceso: apagar y reiniciar servidor apuntando al mismo KALU_MEDIA_DIR y verificar comprobante con SHA256', async () => {
    // 1. Apagar servidor 1
    await new Promise(r => serverInstance.close(r));
    await new Promise(r => setTimeout(r, 50));

    // 2. Iniciar nueva instancia en el mismo puerto apuntando al MISMO KALU_MEDIA_DIR
    const newServer = http.createServer(app);
    await new Promise(r => newServer.listen(TEST_PORT, '127.0.0.1', r));
    serverInstance = newServer;
    await new Promise(r => setTimeout(r, 50));

    // Re-autenticar sesión del cliente en la nueva instancia
    const loginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: client1.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(loginRes.status, 200);
    const newClientCookie = (loginRes.setCookie || '').split(';')[0];

    // Solicitar el comprobante por HTTP GET
    const resReceipt = await fetch(`${BASE_URL}/api/pwa-payments/${createdPaymentId}/receipt`, {
      headers: {
        'Cookie': newClientCookie
      }
    });

    assert.strictEqual(resReceipt.status, 200, 'Debe devolver HTTP 200 tras reiniciar');
    assert.strictEqual(resReceipt.headers.get('content-type'), 'image/png');
    const arrayBuf = await resReceipt.arrayBuffer();
    const servedSha256 = crypto.createHash('sha256').update(Buffer.from(arrayBuf)).digest('hex');
    assert.strictEqual(servedSha256, expectedSha256, 'El SHA256 servido tras recreación debe coincidir exactamente');
  });

  it('3. Backup Integral: GET /api/full-backup exporta colecciones Y captures en base64', async () => {
    // Re-autenticar admin en la instancia reiniciada
    const adminLoginRes = await httpRequest('/api/auth/login', {
      method: 'POST',
      body: { email: adminUser.email, password: 'adminpass123' }
    });
    assert.strictEqual(adminLoginRes.status, 200);
    adminCookie = (adminLoginRes.setCookie || '').split(';')[0];
    adminCsrf = adminLoginRes.data?.csrfToken || '';

    const res = await fetch(`${BASE_URL}/api/full-backup`, {
      headers: {
        'Cookie': adminCookie
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/gzip');
    const arrayBuf = await res.arrayBuffer();
    const bundleBuf = Buffer.from(arrayBuf);
    assert.ok(bundleBuf.length > 0);

    backupPayload = { bundleBase64: bundleBuf.toString('base64') };
  });

  it('4. Restore Integral: borrar comprobante temporal de disco, ejecutar POST /api/restore-backup y verificar restauración íntegra con SHA256', async () => {
    // 1. Borrar comprobante físicamente del disco
    const physicalPath = path.join(tempMediaDir, 'captures', createdFileName);
    fs.unlinkSync(physicalPath);
    assert.strictEqual(fs.existsSync(physicalPath), false, 'El archivo debe estar eliminado antes del restore');

    // 2. Ejecutar restore-backup con el backupPayload obtenido
    const restoreRes = await httpRequest('/api/restore-backup', {
      method: 'POST',
      headers: {
        'x-csrf-token': adminCsrf
      },
      cookie: adminCookie,
      body: backupPayload
    });

    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.data.success, true);
    assert.ok(restoreRes.data.summary.captures >= 1, 'Debe reportar al menos 1 capture restaurado');

    // 3. Verificar que el archivo reapareció físicamente en disco con SHA256 intacto
    assert.strictEqual(fs.existsSync(physicalPath), true, 'El capture debe existir en disco tras restore');
    const restoredDiskBuf = fs.readFileSync(physicalPath);
    const restoredSha = crypto.createHash('sha256').update(restoredDiskBuf).digest('hex');
    assert.strictEqual(restoredSha, expectedSha256, 'El SHA256 en disco tras restore debe ser idéntico al original');

    // 4. Verificar servicio por HTTP GET
    const resReceipt = await fetch(`${BASE_URL}/api/pwa-payments/${createdPaymentId}/receipt`, {
      headers: {
        'Cookie': adminCookie
      }
    });
    assert.strictEqual(resReceipt.status, 200);
    const arrayBuf = await resReceipt.arrayBuffer();
    const servedSha = crypto.createHash('sha256').update(Buffer.from(arrayBuf)).digest('hex');
    assert.strictEqual(servedSha, expectedSha256);
  });
});
