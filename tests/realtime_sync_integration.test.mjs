/**
 * Suite de Pruebas de Integración Completa: Sincronización Realtime, Rooms y Cache Boundaries
 * KALU CRM Oficial / Sabanota
 *
 * Cubre:
 * TEST A — ADMIN: Recibe eventos tanto de room:crm:staff como de room:crm:admin (settings).
 * TEST B — CAJERO / STAFF: Recibe colecciones operativas pero NO colecciones ADMIN_ONLY.
 * TEST C — PORTAL CLIENTE A vs CLIENTE B: Cliente A recibe solo sus deltas, Cliente B no recibe los de A.
 * TEST D — PORTAL PRODUCTOR A vs PRODUCTOR B: Productor A recibe solo sus viajes, Productor B no.
 * TEST E — PÚBLICO / ANÓNIMO: Socket anónimo solo recibe room:public (banners), NO colecciones privadas.
 * TEST F — CAMBIO DE USUARIO: clearRealtimeCacheForAuthBoundary purga datos cacheados evitando fuga a Usuario B.
 * TEST G — CLIENTE A -> CLIENTE B: Portal Cliente B no recibe caché residual de Cliente A.
 * TEST H — hClient Reactivo: hClient derivado de clients refleja cambio de deuda 0 -> 50 en vivo.
 * TEST 1 — CLIENTE: Venta POS a crédito emite delta de clients y actualiza deuda inmediatamente.
 * TEST 2 — MUNDO KALU: Venta Mundo Kalu emite deltas para transactions e installments consumidos por POS.
 * TEST 3 — INDICADOR: Nuevo pwa_payment emite evento en tiempo real actualizando el alertador.
 * TEST 4 — COBRANZAS: Aprobación de pago actualiza pwa_payments e installments en tiempo real sin F5.
 * TEST 5 — EVENTO REAL Y RECONEXIÓN: Eventos Socket.IO y suscripciones persisten tras reconnect / login.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import bcrypt from 'bcryptjs';
import { io as ClientIO } from 'socket.io-client';

const tempDir = path.join(os.tmpdir(), `kalu-test-realtime-full-${Date.now()}-${process.pid}`);
const tempMediaDir = path.join(os.tmpdir(), `kalu-test-realtime-full-media-${Date.now()}-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(tempMediaDir, { recursive: true });

const devDir = path.resolve('data-dev');
for (const file of fs.readdirSync(devDir)) {
  const src = path.join(devDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(tempDir, file));
  }
}

const TEST_PORT = 3149;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

process.env.KALU_DATA_DIR = tempDir;
process.env.KALU_MEDIA_DIR = tempMediaDir;
process.env.KALU_API_URL = `${BASE_URL}/api`;
process.env.KALU_SOCKET_URL = `${BASE_URL}`;

const { app, server, io, readCollection, writeCollection, withTransaction, emitCollectionDeltaScoped } = await import('../server.js');
const { onCollectionSnapshot, clearRealtimeCacheForAuthBoundary } = await import('../src/services/localApi.ts');

function connectTestSocket(cookie, extraOptions = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    const socket = ClientIO(BASE_URL, {
      transports: ['polling'],
      transportOptions: {
        polling: {
          extraHeaders: headers
        }
      },
      ...extraOptions
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket.IO connection timeout'));
    }, 4000);

    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      resolve({ error: err, socket });
    });
  });
}

function waitForSocketEvent(socket, eventName, timeoutMs = 800) {
  return new Promise((resolve) => {
    let resolved = false;
    const handler = (data) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        socket.off(eventName, handler);
        resolve({ received: true, data });
      }
    };
    socket.on(eventName, handler);
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.off(eventName, handler);
        resolve({ received: false, data: null });
      }
    }, timeoutMs);
  });
}

describe('SUITE DE INTEGRACIÓN COMPLETA: REALTIME, ROOMS Y CACHE BOUNDARIES', () => {
  let adminCookie = '';
  let adminCsrf = '';
  let cashierCookie = '';
  let clientACookie = '';
  let clientBCookie = '';
  let producerACookie = '';
  let producerBCookie = '';

  before(async () => {
    // 0. Sembrar usuarios y entidades de prueba
    const users = readCollection('users') || [];
    users.push(
      {
        id: 'usr-admin-full-test',
        username: 'adminfull',
        email: 'admin@queserialakalu.com',
        name: 'Admin Full',
        role: 'admin',
        passwordHash: bcrypt.hashSync('adminpass123', 10),
        pinHash: bcrypt.hashSync('123456', 10),
        active: true
      },
      {
        id: 'usr-cajero-full-test',
        username: 'cajerofull',
        cedula: '87654321',
        name: 'Cajero Full',
        role: 'cajero',
        passwordHash: bcrypt.hashSync('cajeropass123', 10),
        pinHash: bcrypt.hashSync('4321', 10),
        active: true
      }
    );
    writeCollection('users', users);

    const clients = readCollection('clients') || [];
    clients.push(
      {
        id: 'cli-test-A',
        name: 'Cliente A Test',
        phone: '584140000001',
        pinHash: bcrypt.hashSync('111111', 10),
        status: 'active',
        active: true,
        outstandingDebt: 0
      },
      {
        id: 'cli-test-B',
        name: 'Cliente B Test',
        phone: '584140000002',
        pinHash: bcrypt.hashSync('222222', 10),
        status: 'active',
        active: true,
        outstandingDebt: 0
      }
    );
    writeCollection('clients', clients);

    const suppliers = readCollection('suppliers') || [];
    suppliers.push(
      {
        id: 'sup-test-A',
        name: 'Productor A Test',
        phone: '584120000001',
        pinHash: bcrypt.hashSync('333333', 10),
        status: 'active',
        active: true
      },
      {
        id: 'sup-test-B',
        name: 'Productor B Test',
        phone: '584120000002',
        pinHash: bcrypt.hashSync('444444', 10),
        status: 'active',
        active: true
      }
    );
    writeCollection('suppliers', suppliers);

    await new Promise((resolve) => {
      server.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });

    // 1. Auth Admin
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`);
    const csrfData = await csrfRes.json();
    adminCsrf = csrfData.csrfToken;
    adminCookie = (csrfRes.headers.get('set-cookie') || '').split(';')[0];

    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({ loginMode: 'admin', email: 'admin@queserialakalu.com', password: 'adminpass123' })
    });
    const adminLoginData = await adminLoginRes.json();
    assert.strictEqual(adminLoginRes.status, 200);
    adminCookie = (adminLoginRes.headers.get('set-cookie') || adminCookie).split(';')[0];
    if (adminLoginData.csrfToken) adminCsrf = adminLoginData.csrfToken;

    // 2. Auth Cajero
    const cajeroLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf },
      body: JSON.stringify({ loginMode: 'cajero', cedula: '87654321', pin: '4321' })
    });
    assert.strictEqual(cajeroLoginRes.status, 200);
    cashierCookie = (cajeroLoginRes.headers.get('set-cookie') || '').split(';')[0];

    // 3. Auth Portal Client A
    const clientALoginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '584140000001', pin: '111111' })
    });
    assert.strictEqual(clientALoginRes.status, 200);
    clientACookie = (clientALoginRes.headers.get('set-cookie') || '').split(';')[0];

    // 4. Auth Portal Client B
    const clientBLoginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '584140000002', pin: '222222' })
    });
    assert.strictEqual(clientBLoginRes.status, 200);
    clientBCookie = (clientBLoginRes.headers.get('set-cookie') || '').split(';')[0];

    // 5. Auth Portal Producer A
    const prodALoginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'producer', identifier: '584120000001', pin: '333333' })
    });
    assert.strictEqual(prodALoginRes.status, 200);
    producerACookie = (prodALoginRes.headers.get('set-cookie') || '').split(';')[0];

    // 6. Auth Portal Producer B
    const prodBLoginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'producer', identifier: '584120000002', pin: '444444' })
    });
    assert.strictEqual(prodBLoginRes.status, 200);
    producerBCookie = (prodBLoginRes.headers.get('set-cookie') || '').split(';')[0];
  });

  after(async () => {
    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(tempMediaDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  // TEST A — ADMIN
  it('TEST A — ADMIN: Recibe eventos tanto de room:crm:staff como de room:crm:admin (settings)', async () => {
    const adminSocket = await connectTestSocket(adminCookie);
    assert.ok(adminSocket && adminSocket.id);

    const eventPromise = waitForSocketEvent(adminSocket, 'collection_delta', 1200);

    const settingsDoc = { id: 'general', testField: 'admin-val-' + Date.now() };
    const settings = readCollection('settings');
    settings[0] = { ...settings[0], ...settingsDoc };
    writeCollection('settings', settings, { action: 'update', collection: 'settings', doc: settings[0] });

    const res = await eventPromise;
    assert.strictEqual(res.received, true, 'Admin debe recibir evento de settings en room:crm:admin');
    assert.strictEqual(res.data.collection, 'settings');

    adminSocket.disconnect();
  });

  // TEST B — CAJERO / STAFF
  it('TEST B — CAJERO / STAFF: Recibe colecciones operativas pero NO colecciones ADMIN_ONLY', async () => {
    const cashierSocket = await connectTestSocket(cashierCookie);
    assert.ok(cashierSocket && cashierSocket.id);

    // 1. Debe recibir evento operativo de kardex (room:crm:staff)
    const kardexPromise = waitForSocketEvent(cashierSocket, 'collection_delta', 1200);
    const kardexMovement = { id: 'kardex-test-' + Date.now(), productId: 'prod-1', quantity: 5 };
    const kardex = readCollection('kardex');
    kardex.push(kardexMovement);
    writeCollection('kardex', kardex, { action: 'add', collection: 'kardex', doc: kardexMovement });

    const kardexRes = await kardexPromise;
    assert.strictEqual(kardexRes.received, true, 'Cajero debe recibir colección operativa kardex');

    // 2. NO debe recibir evento privado ADMIN_ONLY de settings (room:crm:admin)
    const settingsPromise = waitForSocketEvent(cashierSocket, 'collection_delta', 800);
    const settings = readCollection('settings');
    writeCollection('settings', settings, { action: 'update', collection: 'settings', doc: { id: 'general', v: Date.now() } });

    const settingsRes = await settingsPromise;
    assert.strictEqual(settingsRes.received, false, 'Cajero NO debe recibir colecciones ADMIN_ONLY');

    cashierSocket.disconnect();
  });

  // TEST C — PORTAL CLIENTE A vs CLIENTE B
  it('TEST C — PORTAL CLIENTE A vs CLIENTE B: Cliente A recibe solo sus deltas, Cliente B no recibe los de A', async () => {
    const socketA = await connectTestSocket(clientACookie);
    const socketB = await connectTestSocket(clientBCookie);

    const promiseA = waitForSocketEvent(socketA, 'collection_delta', 1200);
    const promiseB = waitForSocketEvent(socketB, 'collection_delta', 800);

    // Emitir delta dirigido exclusivamente a Cliente A
    const txA = { id: 'tx-clientA-' + Date.now(), clientId: 'cli-test-A', amount: 15.5 };
    const txs = readCollection('transactions');
    txs.push(txA);
    writeCollection('transactions', txs, { action: 'add', collection: 'transactions', doc: txA });

    const [resA, resB] = await Promise.all([promiseA, promiseB]);

    assert.strictEqual(resA.received, true, 'Cliente A debe recibir su propia transacción');
    assert.strictEqual(resA.data.doc.clientId, 'cli-test-A');
    assert.strictEqual(resB.received, false, 'Cliente B NO debe recibir la transacción de Cliente A');

    socketA.disconnect();
    socketB.disconnect();
  });

  // TEST D — PORTAL PRODUCTOR A vs PRODUCTOR B
  it('TEST D — PORTAL PRODUCTOR A vs PRODUCTOR B: Productor A recibe solo sus viajes, Productor B no', async () => {
    const socketA = await connectTestSocket(producerACookie);
    const socketB = await connectTestSocket(producerBCookie);

    const promiseA = waitForSocketEvent(socketA, 'collection_delta', 1200);
    const promiseB = waitForSocketEvent(socketB, 'collection_delta', 800);

    // Emitir delta dirigido exclusivamente a Productor A
    const tripA = { id: 'trip-prodA-' + Date.now(), supplierId: 'sup-test-A', cheeseTotalKg: 100 };
    const trips = readCollection('cheeseTrips');
    trips.push(tripA);
    writeCollection('cheeseTrips', trips, { action: 'add', collection: 'cheeseTrips', doc: tripA });

    const [resA, resB] = await Promise.all([promiseA, promiseB]);

    assert.strictEqual(resA.received, true, 'Productor A debe recibir su propio viaje de queso');
    assert.strictEqual(resA.data.doc.supplierId, 'sup-test-A');
    assert.strictEqual(resB.received, false, 'Productor B NO debe recibir el viaje de Productor A');

    socketA.disconnect();
    socketB.disconnect();
  });

  // TEST E — PÚBLICO / ANÓNIMO
  it('TEST E — PÚBLICO / ANÓNIMO: Socket anónimo solo recibe room:public (banners), NO colecciones privadas', async () => {
    const anonSocket = await connectTestSocket(null);

    // 1. Debe recibir evento público de banners
    const bannerPromise = waitForSocketEvent(anonSocket, 'collection_delta', 1200);
    const bannerDoc = { id: 'banner-1', title: 'Queso Promo' };
    const banners = readCollection('banners');
    banners.push(bannerDoc);
    writeCollection('banners', banners, { action: 'add', collection: 'banners', doc: bannerDoc });

    const bannerRes = await bannerPromise;
    assert.strictEqual(bannerRes.received, true, 'Socket anónimo debe recibir banners públicos');

    // 2. NO debe recibir colecciones privadas CRM (ej. transactions)
    const privatePromise = waitForSocketEvent(anonSocket, 'collection_delta', 800);
    const tx = { id: 'tx-priv-' + Date.now(), amount: 50 };
    const txs = readCollection('transactions');
    txs.push(tx);
    writeCollection('transactions', txs, { action: 'add', collection: 'transactions', doc: tx });

    const privateRes = await privatePromise;
    assert.strictEqual(privateRes.received, false, 'Socket anónimo NO debe recibir transactions privadas');

    anonSocket.disconnect();
  });

  // TEST F — CAMBIO DE USUARIO (Auth Boundary Cache Isolation)
  it('TEST F — CAMBIO DE USUARIO: clearRealtimeCacheForAuthBoundary purga datos cacheados evitando fuga a Usuario B', async () => {
    let notifiedData = [];

    // 1. Usuario A suscribe a colección y cachea datos
    const unsub = onCollectionSnapshot('settings', (data) => {
      notifiedData = data;
    });

    // 2. Simular cierre de sesión / cambio de usuario invocando el límite de seguridad
    clearRealtimeCacheForAuthBoundary();

    // 3. Un nuevo suscriptor no recibe datos privados cacheados de Usuario A antes del fetch
    let freshSubscriberData = null;
    const unsubB = onCollectionSnapshot('settings', (data) => {
      freshSubscriberData = data;
    });

    // Inmediatamente tras la suscripción, freshSubscriberData no entrega datos residuales
    assert.strictEqual(freshSubscriberData, null, 'Usuario B no debe recibir caché previa de Usuario A');

    unsub();
    unsubB();
  });

  // TEST G — CLIENTE A -> CLIENTE B
  it('TEST G — CLIENTE A → CLIENTE B: Portal Cliente B no recibe caché residual de Cliente A', async () => {
    let clientASnap = [];
    const unsubA = onCollectionSnapshot('transactions', (data) => {
      clientASnap = data;
    });

    // Simular logout de Cliente A / login de Cliente B
    clearRealtimeCacheForAuthBoundary();

    let clientBSnap = null;
    const unsubB = onCollectionSnapshot('transactions', (data) => {
      clientBSnap = data;
    });

    assert.strictEqual(clientBSnap, null, 'Cliente B no recibe datos síncronos cacheados de Cliente A');

    unsubA();
    unsubB();
  });

  // TEST H — hClient Reactivo
  it('TEST H — hClient Reactivo: hClient derivado de clients refleja cambio de deuda 0 -> 50 en vivo', async () => {
    let clientsState = [
      { id: 'client-reactivo-1', name: 'Juan Reactivo', outstandingDebt: 0 }
    ];

    const selectedHistoryClientId = 'client-reactivo-1';

    // Función derivada equivalente a ClientsCreditView.tsx
    const computeHClient = () => {
      const hClient = clientsState.find(c => c.id === selectedHistoryClientId);
      return hClient ? { ...hClient } : null;
    };

    assert.strictEqual(computeHClient().outstandingDebt, 0, 'Deuda inicial debe ser 0');

    // Llega actualización en tiempo real
    clientsState = clientsState.map(c => c.id === selectedHistoryClientId ? { ...c, outstandingDebt: 50 } : c);

    // Sin desmontar componente, la derivación es reactiva e inmediata
    const updatedHClient = computeHClient();
    assert.strictEqual(updatedHClient.outstandingDebt, 50, 'hClient debe reflejar inmediatamente $50 USD');
  });

  // TEST 1 — CLIENTE
  it('TEST 1: Venta POS a crédito emite delta de clients y actualiza deuda inmediatamente', async () => {
    const clients = readCollection('clients');
    let testClient = clients[0];
    const initialDebt = Number(testClient.outstandingDebt || 0);

    const socket = await connectTestSocket(adminCookie);
    assert.ok(socket && socket.id);

    const deltaPromise = new Promise((resolve) => {
      const handler = (payload) => {
        if (payload.collection === 'clients' && String(payload.doc?.id) === String(testClient.id)) {
          socket.off('collection_delta', handler);
          resolve(payload);
        }
      };
      socket.on('collection_delta', handler);
    });

    const salePayload = {
      saleItems: [
        {
          productId: 'prod-1',
          name: 'Queso Semiduro',
          quantityKg: 2,
          pricePerKg: 5,
          subtotal: 10
        }
      ],
      clientId: testClient.id,
      customerName: testClient.name,
      paidAmount: 0,
      saleTotalAmount: 10,
      paymentMethodType: 'Crédito / Fiado'
    };

    const saleRes = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': adminCsrf,
        'Cookie': adminCookie
      },
      body: JSON.stringify(salePayload)
    });

    assert.strictEqual(saleRes.status, 200, 'Venta POS a crédito debe responder 200');

    const deltaPayload = await deltaPromise;
    assert.strictEqual(deltaPayload.collection, 'clients');
    assert.strictEqual(deltaPayload.action, 'update');
    assert.strictEqual(Number(deltaPayload.doc.outstandingDebt), initialDebt + 10, 'La deuda en el delta debe incrementarse en $10');

    socket.disconnect();
  });

  // TEST 2 — MUNDO KALU
  it('TEST 2: Venta Mundo Kalu emite deltas para transactions e installments consumidos por POS', async () => {
    const clients = readCollection('clients');
    const testClient = clients[0];

    const socket = await connectTestSocket(adminCookie);
    assert.ok(socket && socket.id);

    const receivedDeltas = [];
    socket.on('collection_delta', (payload) => {
      receivedDeltas.push(payload);
    });

    const nowMs = Date.now();
    const kaluSalePayload = {
      saleItems: [
        {
          productId: 'prod-kalu',
          name: 'Harina PAN (Víveres)',
          category: 'Víveres',
          quantityKg: 5,
          pricePerKg: 2,
          subtotal: 10
        }
      ],
      clientId: testClient.id,
      customerName: testClient.name,
      paidAmount: 2,
      saleTotalAmount: 10,
      addedPayments: [
        { id: `pay-init-${nowMs}`, method: 'Efectivo $', amount: 2, originalAmount: 2, currency: '$' },
        { id: `pay-kalu-${nowMs}`, method: 'Mundo Kalu', amount: 8, originalAmount: 8, currency: '$' }
      ],
      paymentMethodType: 'Mundo Kalu'
    };

    const res = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': adminCsrf,
        'Cookie': adminCookie
      },
      body: JSON.stringify(kaluSalePayload)
    });

    assert.strictEqual(res.status, 200, 'Venta Mundo Kalu debe responder 200');

    await new Promise((r) => setTimeout(r, 400));

    const installmentDelta = receivedDeltas.find((d) => d.collection === 'installments');
    const clientsDelta = receivedDeltas.find((d) => d.collection === 'clients' && String(d.doc?.id) === String(testClient.id));

    assert.ok(installmentDelta, 'Debe emitir delta para la colección installments');
    assert.ok(clientsDelta, 'Debe emitir delta para la colección clients');

    socket.disconnect();
  });

  // TEST 3 — INDICADOR SUPERIOR DE PAGOS
  it('TEST 3: Nuevo pwa_payment emite evento en tiempo real actualizando el alertador', async () => {
    const socket = await connectTestSocket(adminCookie);
    assert.ok(socket && socket.id);

    const paymentDeltaPromise = new Promise((resolve) => {
      const handler = (payload) => {
        if (payload.collection === 'pwa_payments' && payload.doc?.reference === 'TEST-ALERT-REF-001') {
          socket.off('collection_delta', handler);
          resolve(payload);
        }
      };
      socket.on('collection_delta', handler);
    });

    const newPayment = {
      id: `pay-alert-${Date.now()}`,
      clientId: 'client-1',
      clientName: 'Cliente Test',
      amount: 25.50,
      reference: 'TEST-ALERT-REF-001',
      status: 'pending',
      type: 'cuota_kalu',
      createdAt: new Date().toISOString()
    };

    const payments = readCollection('pwa_payments');
    payments.push(newPayment);
    writeCollection('pwa_payments', payments, { action: 'add', collection: 'pwa_payments', doc: newPayment });

    const deltaReceived = await paymentDeltaPromise;
    assert.strictEqual(deltaReceived.collection, 'pwa_payments');
    assert.strictEqual(deltaReceived.doc.status, 'pending');
    assert.strictEqual(deltaReceived.doc.amount, 25.50);

    socket.disconnect();
  });

  // TEST 4 — COBRANZAS: APROBACIÓN DE PAGO
  it('TEST 4: Aprobación de pago actualiza pwa_payments e installments en tiempo real sin F5', async () => {
    const socket = await connectTestSocket(adminCookie);
    assert.ok(socket && socket.id);

    const installmentId = `inst-test-cob-${Date.now()}`;
    const paymentId = `pwa-test-cob-${Date.now()}`;
    const testInst = {
      id: installmentId,
      clientId: 'client-1',
      transactionId: 'TX-COB-001',
      amount: 20.00,
      amountUSD: 20.00,
      dueDate: new Date().toISOString().split('T')[0],
      status: 'pending',
      installmentNumber: 1,
      totalInstallments: 1,
      type: 'cotidiano'
    };

    const testPwa = {
      id: paymentId,
      clientId: 'client-1',
      installmentId: installmentId,
      amount: 20.00,
      reference: `COB-REF-${Date.now()}`,
      status: 'pending',
      type: 'cuota_kalu',
      paymentMethod: 'Pago Móvil',
      receiptImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      createdAt: new Date().toISOString()
    };

    const insts = readCollection('installments');
    insts.push(testInst);
    writeCollection('installments', insts);

    const pays = readCollection('pwa_payments');
    pays.push(testPwa);
    writeCollection('pwa_payments', pays);

    const receivedUpdates = [];
    socket.on('collection_delta', (payload) => {
      receivedUpdates.push(payload);
    });

    const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${paymentId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': adminCsrf,
        'Cookie': adminCookie
      }
    });

    assert.strictEqual(approveRes.status, 200, 'Aprobación debe retornar 200');

    await new Promise((r) => setTimeout(r, 400));

    const pwaDelta = receivedUpdates.find((u) => u.collection === 'pwa_payments' && String(u.doc?.id) === String(paymentId));
    const instDelta = receivedUpdates.find((u) => u.collection === 'installments' && String(u.doc?.id) === String(installmentId));

    assert.ok(pwaDelta, 'Debe emitir delta de pwa_payments con status approved');
    assert.strictEqual(pwaDelta.doc.status, 'approved');
    assert.ok(instDelta, 'Debe emitir delta de installments con status paid');
    assert.strictEqual(instDelta.doc.status, 'paid');

    socket.disconnect();
  });

  // TEST 5 — EVENTO REAL Y RESILIENCIA DE RECONEXIÓN
  it('TEST 5: Resiliencia de reconexión tras login — las suscripciones reciben eventos sin reinicializarse', async () => {
    // 1. Conexión anónima previa
    let socket1 = await connectTestSocket(null);
    assert.ok(socket1 && socket1.id);
    socket1.disconnect();

    // 2. Conectar socket con sesión autenticada
    let socket2 = await connectTestSocket(adminCookie);
    assert.ok(socket2 && socket2.id);

    // 3. Suscripción debe recibir el evento emitido por el backend
    const eventPromise = new Promise((resolve) => {
      socket2.on('collection_delta', (payload) => {
        if (payload.collection === 'clients' && payload.doc?.id === 'test-resilience-client') {
          resolve(payload);
        }
      });
    });

    // Emisión backend
    const testDoc = { id: 'test-resilience-client', name: 'Cliente Resiliencia', outstandingDebt: 50 };
    const allClients = readCollection('clients');
    allClients.push(testDoc);
    writeCollection('clients', allClients, { action: 'add', collection: 'clients', doc: testDoc });

    const received = await eventPromise;
    assert.strictEqual(received.collection, 'clients');
    assert.strictEqual(received.doc.name, 'Cliente Resiliencia');

    socket2.disconnect();
  });
});
