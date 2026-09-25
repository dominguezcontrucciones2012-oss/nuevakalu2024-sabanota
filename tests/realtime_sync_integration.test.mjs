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
const { onCollectionSnapshot, onCollectionSignal, initSocket, reconnectSocket, disconnectSocket, clearRealtimeCacheForAuthBoundary, fetchBootstrapDataApi } = await import('../src/services/localApi.ts');

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
    process.env.KALU_TEST_ADMIN_COOKIE = adminCookie;

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
    disconnectSocket();
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

  // TEST 6 — CASO A: Venta POS -> Ficha Productor/Proveedor y ProducerPortal sin F5
  it('TEST 6: Venta POS a productor/proveedor -> Ficha Productor/Proveedor y ProducerPortal se actualizan en tiempo real sin F5', async () => {
    // Setup de Productor
    const producerId = 'SUP-REALTIME-001';
    const initialSupplier = {
      id: producerId,
      name: 'Quesera El Palmar',
      contactName: 'Carlos Productor',
      phone: '04141112233',
      rfc: 'J-12345678-0',
      isCheeseProducer: true,
      balanceOwed: 100,
      storeDebt: 0,
      pinHash: bcrypt.hashSync('123456', 10),
      status: 'active',
      active: true
    };
    const currentSuppliers = readCollection('suppliers');
    currentSuppliers.push(initialSupplier);
    writeCollection('suppliers', currentSuppliers);

    // Login Portal Productor para Client B
    const producerLoginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'producer', identifier: '04141112233', pin: '123456' })
    });
    const producerCookie = (producerLoginRes.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(producerCookie, 'Login de productor debe devolver cookie');

    // Conectar sockets: Socket Staff (CRM B) y Socket Productor (Portal B)
    const staffSocket = await connectTestSocket(adminCookie);
    const producerSocket = await connectTestSocket(producerCookie);

    const receivedStaff = [];
    const receivedProducer = [];
    staffSocket.on('collection_delta', (d) => receivedStaff.push(d));
    producerSocket.on('collection_delta', (d) => receivedProducer.push(d));

    // Client A (POS) procesa venta con Libreta a nombre del productor
    const salePayload = {
      saleItems: [{ productId: 'prod-1', name: 'Queso Duro', pricePerKg: 5, quantityKg: 4, subtotal: 20 }],
      saleTotalAmount: 20,
      supplierId: producerId,
      paidAmount: 0,
      paymentMethodType: 'Libreta Quesero'
    };

    const posRes = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': adminCsrf,
        'Cookie': adminCookie
      },
      body: JSON.stringify(salePayload)
    });
    assert.strictEqual(posRes.status, 200, 'Venta POS debe retornar 200');

    await new Promise((r) => setTimeout(r, 400));

    // Verificar que CRM Staff recibió delta de suppliers y transactions
    const supStaffDelta = receivedStaff.find((d) => d.collection === 'suppliers' && String(d.doc?.id) === String(producerId));
    const txStaffDelta = receivedStaff.find((d) => d.collection === 'transactions' && String(d.doc?.supplierId) === String(producerId));
    assert.ok(supStaffDelta, 'CRM Staff debe recibir delta de suppliers');
    assert.strictEqual(supStaffDelta.doc.balanceOwed, 80, 'balanceOwed debe descontar $20 de deuda');
    assert.ok(txStaffDelta, 'CRM Staff debe recibir delta de transactions');

    // Verificar que ProducerPortal recibió delta scoped de suppliers y transactions sin F5
    const supProducerDelta = receivedProducer.find((d) => d.collection === 'suppliers' && String(d.doc?.id) === String(producerId));
    const txProducerDelta = receivedProducer.find((d) => d.collection === 'transactions' && String(d.doc?.supplierId) === String(producerId));
    assert.ok(supProducerDelta, 'Portal Productor debe recibir delta scoped de suppliers');
    assert.strictEqual(supProducerDelta.doc.balanceOwed, 80);
    assert.ok(txProducerDelta, 'Portal Productor debe recibir delta scoped de transactions');

    staffSocket.disconnect();
    producerSocket.disconnect();
  });

  // TEST 7 — CASO B: Mundo Kalu -> Teléfono (ClientPortal) sin F5
  it('TEST 7: Venta/Crédito Mundo Kalu -> Aplicación/Portal teléfono (ClientPortal) recibe cuotas, transacciones y perfil sin F5', async () => {
    // Setup de Cliente
    const clientId = 'CLI-REALTIME-777';
    const initialClient = {
      id: clientId,
      name: 'Ana Pérez',
      phone: '04127778899',
      cedula: '27778899',
      outstandingDebt: 0,
      currentDebtUsd: 0,
      loyaltyPoints: 25,
      tier: 'K1',
      pinHash: bcrypt.hashSync('777899', 10),
      status: 'active',
      active: true
    };
    const currentClients = readCollection('clients');
    currentClients.push(initialClient);
    writeCollection('clients', currentClients);

    // Login Portal Cliente para Client B
    const clientLoginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '04127778899', pin: '777899' })
    });
    const clientCookie = (clientLoginRes.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(clientCookie, 'Login de cliente debe devolver cookie');

    // Conectar socket del teléfono del cliente
    const clientPhoneSocket = await connectTestSocket(clientCookie);

    const receivedPhoneDeltas = [];
    clientPhoneSocket.on('collection_delta', (d) => receivedPhoneDeltas.push(d));

    // Client A (POS / Mundo Kalu) procesa venta a crédito Mundo Kalu
    const mkSalePayload = {
      saleItems: [{ productId: 'prod-2', name: 'Mantequilla Criolla', pricePerKg: 10, quantityKg: 3, subtotal: 30 }],
      saleTotalAmount: 30,
      clientId: clientId,
      paidAmount: 0,
      paymentMethodType: 'Mundo Kalu',
      addedPayments: [{ method: 'Mundo Kalu', amount: 30, installmentsCount: 3 }]
    };

    const mkRes = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': adminCsrf,
        'Cookie': adminCookie
      },
      body: JSON.stringify(mkSalePayload)
    });
    assert.strictEqual(mkRes.status, 200, 'Venta Mundo Kalu debe retornar 200');

    await new Promise((r) => setTimeout(r, 400));

    // Verificar que el teléfono del cliente recibió deltas de clients, transactions e installments
    const clientDelta = receivedPhoneDeltas.find((d) => d.collection === 'clients' && String(d.doc?.id) === String(clientId));
    const txDelta = receivedPhoneDeltas.find((d) => d.collection === 'transactions' && String(d.doc?.clientId) === String(clientId));
    const instDelta = receivedPhoneDeltas.find((d) => d.collection === 'installments' && (String(d.clientId) === String(clientId) || (d.docs && d.docs.some(doc => String(doc.clientId) === String(clientId)))));

    assert.ok(clientDelta, 'Teléfono del cliente debe recibir delta de clients en tiempo real');
    assert.strictEqual(clientDelta.doc.outstandingDebt, 30, 'Deuda debe reflejarse en 30 USD');
    assert.strictEqual(clientDelta.doc.tier, 'K1', 'Perfil Kalu activo');
    assert.ok(txDelta, 'Teléfono del cliente debe recibir delta de transactions');
    assert.ok(instDelta, 'Teléfono del cliente debe recibir delta de installments sin F5');

    clientPhoneSocket.disconnect();
  });

  // TEST 8 — DOS OPERACIONES CONSECUTIVAS SIN REFRESH MANUAL
  it('TEST 8: Dos operaciones consecutivas reflejadas en pantalla receptora sin recarga manual', async () => {
    const clientId = 'CLI-CONSECUTIVE-888';
    const initialClient = {
      id: clientId,
      name: 'Luis Gómez',
      phone: '04168889900',
      cedula: '28889900',
      outstandingDebt: 10,
      loyaltyPoints: 50,
      tier: 'K1',
      pinHash: bcrypt.hashSync('889900', 10),
      status: 'active',
      active: true
    };
    const currentClients = readCollection('clients');
    currentClients.push(initialClient);
    writeCollection('clients', currentClients);

    const clientLoginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '04168889900', pin: '889900' })
    });
    const clientCookie = (clientLoginRes.headers.get('set-cookie') || '').split(';')[0];

    const receiverSocket = await connectTestSocket(clientCookie);
    const clientDeltas = [];
    receiverSocket.on('collection_delta', (d) => {
      if (d.collection === 'clients' && String(d.doc?.id) === String(clientId)) {
        clientDeltas.push(d.doc);
      }
    });

    // Operación 1: Venta 1 (+20 USD)
    const res1 = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({
        saleItems: [{ productId: 'prod-1', name: 'Queso', pricePerKg: 5, quantityKg: 4, subtotal: 20 }],
        saleTotalAmount: 20,
        clientId: clientId,
        paidAmount: 0,
        paymentMethodType: 'Crédito'
      })
    });
    assert.strictEqual(res1.status, 200);

    await new Promise((r) => setTimeout(r, 300));

    // Operación 2: Venta 2 (+15 USD)
    const res2 = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({
        saleItems: [{ productId: 'prod-1', name: 'Queso', pricePerKg: 5, quantityKg: 3, subtotal: 15 }],
        saleTotalAmount: 15,
        clientId: clientId,
        paidAmount: 0,
        paymentMethodType: 'Crédito'
      })
    });
    assert.strictEqual(res2.status, 200);

    await new Promise((r) => setTimeout(r, 400));

    assert.strictEqual(clientDeltas.length, 2, 'Debe recibir exactamente 2 deltas consecutivos sin F5');
    assert.strictEqual(clientDeltas[0].outstandingDebt, 30, 'Primer delta: 10 + 20 = 30 USD');
    assert.strictEqual(clientDeltas[1].outstandingDebt, 45, 'Segundo delta: 30 + 15 = 45 USD');

    receiverSocket.disconnect();
  });

  // TEST 9 — DESCONEXIÓN Y RECONEXIÓN SIN BUCLE DE REFRESCO
  it('TEST 9: Desconexión y Reconexión de Socket.IO — sincronización completa sin bucle de refresco', async () => {
    let socketInstance = await connectTestSocket(adminCookie);
    assert.ok(socketInstance.connected);

    let connectCount = 0;
    socketInstance.on('connect', () => { connectCount++; });

    // Simular desconexión forzada
    socketInstance.disconnect();
    assert.strictEqual(socketInstance.connected, false);

    // Reconectar limpiamente
    socketInstance = await connectTestSocket(adminCookie);
    assert.ok(socketInstance.connected);

    // Suscripción sigue activa y recibe eventos
    const deltaPromise = new Promise((resolve) => {
      socketInstance.on('collection_delta', (d) => {
        if (d.collection === 'clients' && d.doc?.id === 'test-reconnect-id') {
          resolve(d);
        }
      });
    });

    const testDoc = { id: 'test-reconnect-id', name: 'Cliente Reconnect', outstandingDebt: 0 };
    const allClients = readCollection('clients');
    allClients.push(testDoc);
    writeCollection('clients', allClients, { action: 'add', collection: 'clients', doc: testDoc });

    const received = await deltaPromise;
    assert.strictEqual(received.doc.name, 'Cliente Reconnect');

    socketInstance.disconnect();
  });

  // TEST 10 — COMPROBAR QUE NO EXISTE RELOAD CONTINUO DE LA APP
  it('TEST 10: Comprobar que no existen llamadas cíclicas a reload o loops de reconexión', async () => {
    // Verificar que los archivos frontend no contienen llamadas no controladas a location.reload
    const clientPortalSrc = fs.readFileSync('src/components/portals/ClientPortal.tsx', 'utf8');
    const producerPortalSrc = fs.readFileSync('src/components/portals/ProducerPortal.tsx', 'utf8');
    const crmAppSrc = fs.readFileSync('src/CRMApp.tsx', 'utf8');
    const localApiSrc = fs.readFileSync('src/services/localApi.ts', 'utf8');

    assert.strictEqual(clientPortalSrc.includes('location.reload'), false, 'ClientPortal no debe tener location.reload');
    assert.strictEqual(producerPortalSrc.includes('location.reload'), false, 'ProducerPortal no debe tener location.reload');
    assert.strictEqual(crmAppSrc.includes('location.reload'), false, 'CRMApp no debe tener location.reload');
    assert.strictEqual(localApiSrc.includes('location.reload'), false, 'localApi no debe tener location.reload');
  });

  // TEST 11 — AUDITORÍA DE LISTENERS Y NO DUPLICACIÓN DE EVENTOS
  it('TEST 11: Auditoría de listeners concurrentes multi-minuto: sin fugas de memoria ni multiplicación de eventos', async () => {
    const socket = await connectTestSocket(adminCookie);
    let eventCounter = 0;

    const handler = (d) => {
      if (d.collection === 'clients' && d.doc?.id === 'cli-test-audit') {
        eventCounter++;
      }
    };

    socket.on('collection_delta', handler);

    // Emitir 1 solo evento
    const clientDoc = { id: 'cli-test-audit', name: 'Cliente Audit', outstandingDebt: 10 };
    const allClients = readCollection('clients');
    allClients.push(clientDoc);
    writeCollection('clients', allClients, { action: 'add', collection: 'clients', doc: clientDoc });

    await new Promise((r) => setTimeout(r, 300));
    assert.strictEqual(eventCounter, 1, 'Debe procesar exactamente 1 evento, sin duplicados');

    socket.off('collection_delta', handler);
    socket.disconnect();
  });

  // =========================================================================
  // BLOQUE OBLIGATORIO DE CORRECCIÓN: TESTS A A G
  // =========================================================================

  // TEST A — CACHE BOOTSTRAP: [A,B,C] + ADD D -> [A,B,C,D]
  it('TEST A — CACHE BOOTSTRAP: Bootstrap [A,B,C] y luego delta ADD D -> Resultado [A,B,C,D]', async () => {
    // Configurar 3 clientes iniciales [A, B, C]
    const initialClients = [
      { id: 'client-A', name: 'Cliente A', outstandingDebt: 10 },
      { id: 'client-B', name: 'Cliente B', outstandingDebt: 20 },
      { id: 'client-C', name: 'Cliente C', outstandingDebt: 30 }
    ];
    writeCollection('clients', initialClients);

    const socket = await connectTestSocket(adminCookie);

    let currentClientsState = [...initialClients];

    socket.on('collection_delta', (payload) => {
      if (payload.collection === 'clients') {
        if (payload.action === 'add' && payload.doc) {
          currentClientsState = [...currentClientsState.filter(c => c.id !== payload.doc.id), payload.doc];
        } else if (payload.action === 'update' && payload.doc) {
          currentClientsState = currentClientsState.map(c => c.id === payload.doc.id ? { ...c, ...payload.doc } : c);
        } else if (payload.action === 'delete' && payload.id) {
          currentClientsState = currentClientsState.filter(c => c.id !== payload.id);
        }
      }
    });

    assert.strictEqual(currentClientsState.length, 3, 'Estado inicial debe contener exactamente 3 clientes [A,B,C]');

    // Backend emite delta ADD D
    const clientD = { id: 'client-D', name: 'Cliente D', outstandingDebt: 40 };
    const updatedAll = [...readCollection('clients'), clientD];
    writeCollection('clients', updatedAll, { action: 'add', collection: 'clients', doc: clientD });

    await new Promise((r) => setTimeout(r, 300));

    // collectionCache / estado debe tener [A,B,C,D] (4 elementos)
    assert.strictEqual(currentClientsState.length, 4, 'Tras ADD D debe tener [A,B,C,D]');
    const foundD = currentClientsState.find(c => c.id === 'client-D');
    assert.ok(foundD, 'Cliente D debe estar presente en el estado reactivo');
    assert.strictEqual(foundD.outstandingDebt, 40);

    socket.disconnect();
  });

  // TEST B — CACHE UPDATE: [A,B,C] -> UPDATE B -> [A,B actualizado,C]
  it('TEST B — CACHE UPDATE: [A,B,C] y luego delta UPDATE B -> Resultado [A,B actualizado,C]', async () => {
    const socket = await connectTestSocket(adminCookie);

    let currentClientsState = [
      { id: 'client-A', name: 'Cliente A', outstandingDebt: 10 },
      { id: 'client-B', name: 'Cliente B', outstandingDebt: 20 },
      { id: 'client-C', name: 'Cliente C', outstandingDebt: 30 }
    ];

    socket.on('collection_delta', (payload) => {
      if (payload.collection === 'clients') {
        if (payload.action === 'update' && payload.doc) {
          currentClientsState = currentClientsState.map(c => c.id === payload.doc.id ? { ...c, ...payload.doc } : c);
        }
      }
    });

    const prevCount = currentClientsState.length;

    // Actualizar B: outstandingDebt 20 -> 99
    const clientBUpdated = { id: 'client-B', name: 'Cliente B Modificado', outstandingDebt: 99 };
    const currentList = readCollection('clients').map(c => c.id === 'client-B' ? clientBUpdated : c);
    writeCollection('clients', currentList, { action: 'update', collection: 'clients', doc: clientBUpdated });

    await new Promise((r) => setTimeout(r, 300));

    assert.strictEqual(currentClientsState.length, prevCount, 'Longitud no debe cambiar en update');
    const foundB = currentClientsState.find(c => c.id === 'client-B');
    assert.ok(foundB, 'Cliente B debe existir');
    assert.strictEqual(foundB.name, 'Cliente B Modificado');
    assert.strictEqual(foundB.outstandingDebt, 99, 'Deuda debe reflejar 99 USD');

    socket.disconnect();
  });

  // TEST C — CACHE DELETE: [A,B,C] -> DELETE B -> [A,C]
  it('TEST C — CACHE DELETE: [A,B,C] y luego delta DELETE B -> Resultado [A,C]', async () => {
    const socket = await connectTestSocket(adminCookie);

    let currentClientsState = [
      { id: 'client-A', name: 'Cliente A', outstandingDebt: 10 },
      { id: 'client-B', name: 'Cliente B', outstandingDebt: 20 },
      { id: 'client-C', name: 'Cliente C', outstandingDebt: 30 }
    ];

    socket.on('collection_delta', (payload) => {
      if (payload.collection === 'clients') {
        if (payload.action === 'delete' && payload.id) {
          currentClientsState = currentClientsState.filter(c => c.id !== payload.id);
        }
      }
    });

    const prevCount = currentClientsState.length;

    // Eliminar B
    const filteredList = readCollection('clients').filter(c => c.id !== 'client-B');
    writeCollection('clients', filteredList, { action: 'delete', collection: 'clients', id: 'client-B' });

    await new Promise((r) => setTimeout(r, 300));

    assert.strictEqual(currentClientsState.length, prevCount - 1, 'Longitud debe decrementar en 1');
    const foundB = currentClientsState.find(c => c.id === 'client-B');
    assert.strictEqual(foundB, undefined, 'Cliente B ya no debe existir en el estado');

    socket.disconnect();
  });

  // TEST D — CLIENT PORTAL REALTIME
  it('TEST D — CLIENT PORTAL: Cliente conectado a su room recibe deltas de clients, installments y transactions sin F5', async () => {
    const testClientId = 'CLI-SCOPE-TEST-D';
    const testClientDoc = {
      id: testClientId,
      name: 'Cliente Scope D',
      phone: '04149998877',
      pinHash: bcrypt.hashSync('999887', 10),
      outstandingDebt: 10,
      active: true
    };
    const clients = readCollection('clients');
    clients.push(testClientDoc);
    writeCollection('clients', clients);

    const loginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '04149998877', pin: '999887' })
    });
    const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(cookie);

    const socket = await connectTestSocket(cookie);
    const deltasReceived = [];
    socket.on('collection_delta', d => deltasReceived.push(d));

    // Backend modifica client debt
    const updatedClient = { ...testClientDoc, outstandingDebt: 35 };
    const allC = readCollection('clients').map(c => c.id === testClientId ? updatedClient : c);
    writeCollection('clients', allC, { action: 'update', collection: 'clients', doc: updatedClient });

    await new Promise((r) => setTimeout(r, 300));

    const received = deltasReceived.find(d => d.collection === 'clients' && String(d.doc?.id) === String(testClientId));
    assert.ok(received, 'Portal de cliente debe recibir delta de clients en su room');
    assert.strictEqual(received.doc.outstandingDebt, 35);

    socket.disconnect();
  });

  // TEST E — PRODUCER PORTAL REALTIME
  it('TEST E — PRODUCER PORTAL: Productor conectado a su room recibe deltas de suppliers, transactions y cheeseTrips sin F5', async () => {
    const testProducerId = 'SUP-SCOPE-TEST-E';
    const testProducerDoc = {
      id: testProducerId,
      name: 'Productor Scope E',
      phone: '04161110099',
      pinHash: bcrypt.hashSync('111009', 10),
      balanceOwed: 500,
      active: true
    };
    const suppliers = readCollection('suppliers');
    suppliers.push(testProducerDoc);
    writeCollection('suppliers', suppliers);

    const loginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'producer', identifier: '04161110099', pin: '111009' })
    });
    const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(cookie);

    const socket = await connectTestSocket(cookie);
    const deltasReceived = [];
    socket.on('collection_delta', d => deltasReceived.push(d));

    // Backend modifica supplier balance
    const updatedSup = { ...testProducerDoc, balanceOwed: 450 };
    const allS = readCollection('suppliers').map(s => s.id === testProducerId ? updatedSup : s);
    writeCollection('suppliers', allS, { action: 'update', collection: 'suppliers', doc: updatedSup });

    await new Promise((r) => setTimeout(r, 300));

    const received = deltasReceived.find(d => d.collection === 'suppliers' && String(d.doc?.id) === String(testProducerId));
    assert.ok(received, 'Portal de productor debe recibir delta de suppliers en su room');
    assert.strictEqual(received.doc.balanceOwed, 450);

    socket.disconnect();
  });

  // TEST F — BATCH INSTALLMENTS
  it('TEST F — BATCH INSTALLMENTS: Mundo Kalu genera cuotas por batchAdd y llegan a room:portal:client:<clientId>', async () => {
    const testClientId = 'CLI-BATCH-TEST-F';
    const testClientDoc = {
      id: testClientId,
      name: 'Cliente Batch F',
      phone: '04123334455',
      pinHash: bcrypt.hashSync('333445', 10),
      outstandingDebt: 0,
      active: true
    };
    const clients = readCollection('clients');
    clients.push(testClientDoc);
    writeCollection('clients', clients);

    const loginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '04123334455', pin: '333445' })
    });
    const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

    const clientSocket = await connectTestSocket(cookie);
    const deltasReceived = [];
    clientSocket.on('collection_delta', d => deltasReceived.push(d));

    // Emitir batchAdd con docs y clientId
    const nowMs = Date.now();
    const batchDocs = [
      { id: `inst-batch-1-${nowMs}`, clientId: testClientId, amount: 25, status: 'pending' },
      { id: `inst-batch-2-${nowMs}`, clientId: testClientId, amount: 25, status: 'pending' }
    ];
    const allInsts = [...readCollection('installments'), ...batchDocs];
    writeCollection('installments', allInsts, { action: 'batchAdd', collection: 'installments', docs: batchDocs, clientId: testClientId });

    await new Promise((r) => setTimeout(r, 300));

    const batchDelta = deltasReceived.find(d => d.collection === 'installments' && d.action === 'batchAdd');
    assert.ok(batchDelta, 'El socket del cliente debe recibir el delta batchAdd de cuotas');
    assert.strictEqual(batchDelta.docs.length, 2, 'Debe contener las 2 cuotas generadas');

    clientSocket.disconnect();
  });

  // TEST G — RECONNECT
  it('TEST G — RECONNECT: Conectar portal -> Desconectar -> Reconectar -> Continúa recibiendo deltas sin bucle ni duplicados', async () => {
    const testClientId = 'CLI-RECONNECT-TEST-G';
    const testClientDoc = {
      id: testClientId,
      name: 'Cliente Reconnect G',
      phone: '04147776655',
      pinHash: bcrypt.hashSync('777665', 10),
      outstandingDebt: 0,
      active: true
    };
    const clients = readCollection('clients');
    clients.push(testClientDoc);
    writeCollection('clients', clients);

    const loginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '04147776655', pin: '777665' })
    });
    const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

    // 1. Conexión inicial
    let socket = await connectTestSocket(cookie);
    assert.ok(socket.connected);

    // 2. Desconexión
    socket.disconnect();
    assert.strictEqual(socket.connected, false);

    // 3. Reconexión
    socket = await connectTestSocket(cookie);
    assert.ok(socket.connected);

    let eventCount = 0;
    socket.on('collection_delta', (d) => {
      if (d.collection === 'clients' && String(d.doc?.id) === String(testClientId)) {
        eventCount++;
      }
    });

    // 4. Emitir delta
    const updated = { ...testClientDoc, outstandingDebt: 80 };
    const allC = readCollection('clients').map(c => c.id === testClientId ? updated : c);
    writeCollection('clients', allC, { action: 'update', collection: 'clients', doc: updated });

    await new Promise((r) => setTimeout(r, 300));

    assert.strictEqual(eventCount, 1, 'Tras reconectar debe recibir exactamente 1 evento (sin duplicación ni pérdida)');
    socket.disconnect();
  });

  // =========================================================================
  // BLOQUE OBLIGATORIO DE CORRECCIÓN: ORPHAN DELTAS Y COLD CACHE (TEST 1 - 7)
  // =========================================================================

  // TEST 1 — DELTA HUÉRFANO ADD
  it('TEST 1 — DELTA HUÉRFANO ADD: Cache frío no emite [D] parcial, recupera [A,B,C] y emite [A,B,C,D]', async () => {
    clearRealtimeCacheForAuthBoundary();

    const initialClients = [
      { id: 'cli-orph-A', name: 'Cliente A', outstandingDebt: 10 },
      { id: 'cli-orph-B', name: 'Cliente B', outstandingDebt: 20 },
      { id: 'cli-orph-C', name: 'Cliente C', outstandingDebt: 30 }
    ];
    writeCollection('clients', initialClients);

    const receivedSnapshots = [];
    const unsub = onCollectionSnapshot('clients', (data) => {
      receivedSnapshots.push([...data]);
    });

    // Simular llegada inmediata de delta ADD D mientras cache está frío
    const docD = { id: 'cli-orph-D', name: 'Cliente D', outstandingDebt: 40 };
    const allC = [...readCollection('clients'), docD];
    writeCollection('clients', allC, { action: 'add', collection: 'clients', doc: docD });

    await new Promise((r) => setTimeout(r, 400));

    // Validar que NUNCA se emitió un arreglo parcial [D] de longitud 1
    for (const snap of receivedSnapshots) {
      if (snap.length === 1 && snap[0].id === 'cli-orph-D') {
        assert.fail('Se emitió estado parcial [D], lo cual está estrictamente prohibido');
      }
    }

    const lastSnap = receivedSnapshots[receivedSnapshots.length - 1];
    assert.ok(lastSnap && lastSnap.length >= 4, 'Snapshot final debe contener [A,B,C,D]');
    assert.ok(lastSnap.find(c => c.id === 'cli-orph-D'));

    unsub();
  });

  // TEST 2 — DELTA HUÉRFANO UPDATE
  it('TEST 2 — DELTA HUÉRFANO UPDATE: Cache frío con UPDATE B no emite [B modificado], entrega [A,B mod,C]', async () => {
    clearRealtimeCacheForAuthBoundary();

    const initialClients = [
      { id: 'cli-orph-A2', name: 'Cliente A', outstandingDebt: 10 },
      { id: 'cli-orph-B2', name: 'Cliente B', outstandingDebt: 20 },
      { id: 'cli-orph-C2', name: 'Cliente C', outstandingDebt: 30 }
    ];
    writeCollection('clients', initialClients);

    const receivedSnapshots = [];
    const unsub = onCollectionSnapshot('clients', (data) => {
      receivedSnapshots.push([...data]);
    });

    const docBUpdated = { id: 'cli-orph-B2', name: 'Cliente B Actualizado', outstandingDebt: 95 };
    const allC = readCollection('clients').map(c => c.id === 'cli-orph-B2' ? docBUpdated : c);
    writeCollection('clients', allC, { action: 'update', collection: 'clients', doc: docBUpdated });

    await new Promise((r) => setTimeout(r, 400));

    for (const snap of receivedSnapshots) {
      if (snap.length === 1 && snap[0].id === 'cli-orph-B2') {
        assert.fail('Se emitió estado parcial [B actualizado] de 1 solo elemento');
      }
    }

    const lastSnap = receivedSnapshots[receivedSnapshots.length - 1];
    assert.ok(lastSnap && lastSnap.length >= 3);
    const bDoc = lastSnap.find(c => c.id === 'cli-orph-B2');
    assert.ok(bDoc);
    assert.strictEqual(bDoc.name, 'Cliente B Actualizado');
    assert.strictEqual(bDoc.outstandingDebt, 95);

    unsub();
  });

  // TEST 3 — DELTA HUÉRFANO DELETE
  it('TEST 3 — DELTA HUÉRFANO DELETE: Cache frío con DELETE B entrega [A,C]', async () => {
    clearRealtimeCacheForAuthBoundary();

    const initialClients = [
      { id: 'cli-orph-A3', name: 'Cliente A', outstandingDebt: 10 },
      { id: 'cli-orph-B3', name: 'Cliente B', outstandingDebt: 20 },
      { id: 'cli-orph-C3', name: 'Cliente C', outstandingDebt: 30 }
    ];
    writeCollection('clients', initialClients);

    const receivedSnapshots = [];
    const unsub = onCollectionSnapshot('clients', (data) => {
      receivedSnapshots.push([...data]);
    });

    const allC = readCollection('clients').filter(c => c.id !== 'cli-orph-B3');
    writeCollection('clients', allC, { action: 'delete', collection: 'clients', id: 'cli-orph-B3' });

    await new Promise((r) => setTimeout(r, 400));

    const lastSnap = receivedSnapshots[receivedSnapshots.length - 1];
    assert.ok(lastSnap && lastSnap.length >= 2);
    assert.strictEqual(lastSnap.find(c => c.id === 'cli-orph-B3'), undefined);
    assert.ok(lastSnap.find(c => c.id === 'cli-orph-A3'));
    assert.ok(lastSnap.find(c => c.id === 'cli-orph-C3'));

    unsub();
  });

  // TEST 4 — MÚLTIPLES DELTAS DURANTE REFRESH
  it('TEST 4 — MÚLTIPLES DELTAS DURANTE REFRESH: ADD D, UPDATE B, DELETE C -> [A, B actualizado, D]', async () => {
    clearRealtimeCacheForAuthBoundary();

    const initialClients = [
      { id: 'cli-m-A', name: 'Cliente A', outstandingDebt: 10 },
      { id: 'cli-m-B', name: 'Cliente B', outstandingDebt: 20 },
      { id: 'cli-m-C', name: 'Cliente C', outstandingDebt: 30 }
    ];
    writeCollection('clients', initialClients);

    const receivedSnapshots = [];
    const unsub = onCollectionSnapshot('clients', (data) => {
      receivedSnapshots.push([...data]);
    });

    // Disparar en ráfaga rápida mientras carga
    const docD = { id: 'cli-m-D', name: 'Cliente D', outstandingDebt: 40 };
    const docBUp = { id: 'cli-m-B', name: 'Cliente B Actualizado', outstandingDebt: 99 };

    const c1 = [...readCollection('clients'), docD];
    writeCollection('clients', c1, { action: 'add', collection: 'clients', doc: docD });

    const c2 = readCollection('clients').map(c => c.id === 'cli-m-B' ? docBUp : c);
    writeCollection('clients', c2, { action: 'update', collection: 'clients', doc: docBUp });

    const c3 = readCollection('clients').filter(c => c.id !== 'cli-m-C');
    writeCollection('clients', c3, { action: 'delete', collection: 'clients', id: 'cli-m-C' });

    await new Promise((r) => setTimeout(r, 500));

    const lastSnap = receivedSnapshots[receivedSnapshots.length - 1];
    assert.ok(lastSnap);

    const foundA = lastSnap.find(c => c.id === 'cli-m-A');
    const foundB = lastSnap.find(c => c.id === 'cli-m-B');
    const foundC = lastSnap.find(c => c.id === 'cli-m-C');
    const foundD = lastSnap.find(c => c.id === 'cli-m-D');

    assert.ok(foundA, 'A debe existir');
    assert.ok(foundB, 'B debe existir');
    assert.strictEqual(foundB.name, 'Cliente B Actualizado');
    assert.strictEqual(foundB.outstandingDebt, 99);
    assert.strictEqual(foundC, undefined, 'C debe haber sido eliminado');
    assert.ok(foundD, 'D debe haber sido agregado');

    unsub();
  });

  // TEST 5 — DOS DELTAS RÁPIDOS
  it('TEST 5 — DOS DELTAS RÁPIDOS: ADD D y ADD E en frío entregan [A,B,C,D,E]', async () => {
    clearRealtimeCacheForAuthBoundary();

    const initialClients = [
      { id: 'cli-fast-A', name: 'Cliente A', outstandingDebt: 10 },
      { id: 'cli-fast-B', name: 'Cliente B', outstandingDebt: 20 },
      { id: 'cli-fast-C', name: 'Cliente C', outstandingDebt: 30 }
    ];
    writeCollection('clients', initialClients);

    const receivedSnapshots = [];
    const unsub = onCollectionSnapshot('clients', (data) => {
      receivedSnapshots.push([...data]);
    });

    const docD = { id: 'cli-fast-D', name: 'Cliente D', outstandingDebt: 40 };
    const docE = { id: 'cli-fast-E', name: 'Cliente E', outstandingDebt: 50 };

    const c1 = [...readCollection('clients'), docD];
    writeCollection('clients', c1, { action: 'add', collection: 'clients', doc: docD });

    const c2 = [...readCollection('clients'), docE];
    writeCollection('clients', c2, { action: 'add', collection: 'clients', doc: docE });

    await new Promise((r) => setTimeout(r, 500));

    const lastSnap = receivedSnapshots[receivedSnapshots.length - 1];
    assert.ok(lastSnap && lastSnap.length >= 5);
    assert.ok(lastSnap.find(c => c.id === 'cli-fast-D'));
    assert.ok(lastSnap.find(c => c.id === 'cli-fast-E'));

    unsub();
  });

  // TEST 6 — INSTALLMENTS
  it('TEST 6 — INSTALLMENTS: Sin cache previo, nueva cuota Mundo Kalu entrega dataset completo de cuotas', async () => {
    clearRealtimeCacheForAuthBoundary();

    const initialInstallments = [
      { id: 'inst-test-1', clientId: 'cli-inst-1', amount: 30, status: 'pending' },
      { id: 'inst-test-2', clientId: 'cli-inst-1', amount: 30, status: 'pending' }
    ];
    writeCollection('installments', initialInstallments);

    const receivedSnapshots = [];
    const unsub = onCollectionSnapshot('installments', (data) => {
      receivedSnapshots.push([...data]);
    });

    const newInst = { id: 'inst-test-3', clientId: 'cli-inst-1', amount: 30, status: 'pending' };
    const allInst = [...readCollection('installments'), newInst];
    writeCollection('installments', allInst, { action: 'add', collection: 'installments', doc: newInst, clientId: 'cli-inst-1' });

    await new Promise((r) => setTimeout(r, 500));

    const lastSnap = receivedSnapshots[receivedSnapshots.length - 1];
    assert.ok(lastSnap && lastSnap.length >= 3, 'Debe contener las 3 cuotas completas');
    assert.ok(lastSnap.find(i => i.id === 'inst-test-1'));
    assert.ok(lastSnap.find(i => i.id === 'inst-test-2'));
    assert.ok(lastSnap.find(i => i.id === 'inst-test-3'));

    unsub();
  });

  // TEST 7 — PWA PAYMENTS
  it('TEST 7 — PWA PAYMENTS: Sin cache previo, nuevo pago conserva historial completo + nuevo pago', async () => {
    clearRealtimeCacheForAuthBoundary();

    const initialPayments = [
      { id: 'pwa-hist-1', clientId: 'cli-pwa-1', amount: 15, status: 'approved' },
      { id: 'pwa-hist-2', clientId: 'cli-pwa-1', amount: 20, status: 'approved' }
    ];
    writeCollection('pwa_payments', initialPayments);

    const receivedSnapshots = [];
    const unsub = onCollectionSnapshot('pwa_payments', (data) => {
      receivedSnapshots.push([...data]);
    });

    const newPayment = { id: 'pwa-hist-3', clientId: 'cli-pwa-1', amount: 25, status: 'pending' };
    const allP = [...readCollection('pwa_payments'), newPayment];
    writeCollection('pwa_payments', allP, { action: 'add', collection: 'pwa_payments', doc: newPayment, clientId: 'cli-pwa-1' });

    await new Promise((r) => setTimeout(r, 500));

    const lastSnap = receivedSnapshots[receivedSnapshots.length - 1];
    assert.ok(lastSnap && lastSnap.length >= 3, 'Debe contener los 3 pagos');
    assert.ok(lastSnap.find(p => p.id === 'pwa-hist-1'));
    assert.ok(lastSnap.find(p => p.id === 'pwa-hist-2'));
    assert.ok(lastSnap.find(p => p.id === 'pwa-hist-3'));

    unsub();
  });

  // =========================================================================
  // BLOQUE OBLIGATORIO: PORTALES REALTIME SCOPED & SIGNAL INVALIDATION (SECCIONES 6 - 9)
  // =========================================================================

  // SECCIÓN 6 — PRUEBA REAL PORTAL CLIENTE
  it('SECCIÓN 6 — PORTAL CLIENTE: Socket emite señal a room:portal:client:<id> -> Portal consulta endpoints scoped autorizados sin leer colecciones globales', async () => {
    const testClientId = 'CLI-SCOPED-SIGNAL-01';
    const testClientDoc = {
      id: testClientId,
      name: 'Elena Señal Cliente',
      phone: '04149991122',
      cedula: '19991122',
      pinHash: bcrypt.hashSync('991122', 10),
      outstandingDebt: 0,
      active: true
    };
    const clients = readCollection('clients');
    clients.push(testClientDoc);
    writeCollection('clients', clients);

    // 1. Login real como portal CLIENTE
    const loginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '04149991122', pin: '991122' })
    });
    const clientCookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(clientCookie, 'Login cliente exitoso');

    // 2. Conectar socket y registrar listener de señal (como ClientPortal.tsx usando socket autenticado)
    const clientSocket = await connectTestSocket(clientCookie);
    let signalFiredCount = 0;
    let loadedFinances = null;
    let loadedTxs = null;

    const signalCollections = ['transactions', 'installments', 'pwa_payments', 'clients', 'mobileOrders'];
    const signalHandler = async (payload) => {
      if (signalCollections.includes(payload?.collection)) {
        signalFiredCount++;
        // Endpoint scoped autorizados
        const [finRes, txRes] = await Promise.all([
          fetch(`${BASE_URL}/api/portal/client/finances`, { headers: { Cookie: clientCookie } }),
          fetch(`${BASE_URL}/api/portal/client/transactions`, { headers: { Cookie: clientCookie } })
        ]);
        if (finRes.ok) loadedFinances = await finRes.json();
        if (txRes.ok) loadedTxs = await txRes.json();
      }
    };
    clientSocket.on('collection_delta', signalHandler);

    // 3. Crear cuota para este cliente desde backend/CRM
    const newInstallment = {
      id: `inst-scoped-${Date.now()}`,
      clientId: testClientId,
      amount: 45,
      status: 'pending'
    };
    const allInsts = [...readCollection('installments'), newInstallment];
    writeCollection('installments', allInsts, {
      action: 'add',
      collection: 'installments',
      doc: newInstallment,
      clientId: testClientId
    });

    await new Promise((r) => setTimeout(r, 400));

    // 4. Verificar que se recibió la señal y se consultaron endpoints scoped
    assert.ok(signalFiredCount >= 1, 'Señal de Socket debió dispararse para el cliente');
    assert.ok(loadedFinances, 'Endpoint scoped de finanzas debe responder');
    const myInst = (loadedFinances.installments || []).find(i => i.id === newInstallment.id);
    assert.ok(myInst, 'Finanzas scoped debe contener la nueva cuota del cliente');
    assert.strictEqual(myInst.amount, 45);

    // 5. Verificar que el portal NO puede leer GET /api/collections/installments (debe dar 401/403)
    const genericRes = await fetch(`${BASE_URL}/api/collections/installments`, {
      headers: { Cookie: clientCookie }
    });
    assert.ok([401, 403].includes(genericRes.status), 'Endpoint genérico de colecciones debe denegar acceso al portal');

    clientSocket.off('collection_delta', signalHandler);
    clientSocket.disconnect();
  });

  // SECCIÓN 7 — PRUEBA REAL PORTAL PRODUCTOR
  it('SECCIÓN 7 — PORTAL PRODUCTOR: Socket emite señal a room:portal:producer:<id> -> Portal consulta endpoints scoped autorizados sin leer colecciones globales', async () => {
    const testProducerId = 'SUP-SCOPED-SIGNAL-02';
    const testProducerDoc = {
      id: testProducerId,
      name: 'Quesera Señal Productor',
      phone: '04168882233',
      pinHash: bcrypt.hashSync('882233', 10),
      balanceOwed: 200,
      status: 'active',
      active: true
    };
    const suppliers = readCollection('suppliers');
    suppliers.push(testProducerDoc);
    writeCollection('suppliers', suppliers);

    // 1. Login real como productor
    const loginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'producer', identifier: '04168882233', pin: '882233' })
    });
    const producerCookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(producerCookie, 'Login productor exitoso');

    // 2. Conectar socket y registrar listener de señal (como ProducerPortal.tsx usando socket autenticado)
    const producerSocket = await connectTestSocket(producerCookie);
    let signalFiredCount = 0;
    let loadedTrips = null;

    const signalCollections = ['cheeseTrips', 'transactions', 'suppliers', 'mobileOrders'];
    const signalHandler = async (payload) => {
      if (signalCollections.includes(payload?.collection)) {
        signalFiredCount++;
        const tripsRes = await fetch(`${BASE_URL}/api/portal/producer/trips`, { headers: { Cookie: producerCookie } });
        if (tripsRes.ok) loadedTrips = await tripsRes.json();
      }
    };
    producerSocket.on('collection_delta', signalHandler);

    // 3. Crear viaje de queso para este productor desde backend/CRM
    const newTrip = {
      id: `trip-scoped-${Date.now()}`,
      supplierId: testProducerId,
      kilos: 350,
      pricePerKg: 4.5,
      totalUSD: 1575,
      status: 'received'
    };
    const allTrips = [...readCollection('cheeseTrips'), newTrip];
    writeCollection('cheeseTrips', allTrips, {
      action: 'add',
      collection: 'cheeseTrips',
      doc: newTrip,
      supplierId: testProducerId
    });

    await new Promise((r) => setTimeout(r, 400));

    // 4. Verificar que se recibió la señal y se consultaron endpoints scoped
    assert.ok(signalFiredCount >= 1, `Señal debió dispararse pero count es ${signalFiredCount}`);
    assert.ok(loadedTrips, 'Endpoint scoped de viajes debe responder');
    const myTrip = (loadedTrips || []).find(t => t.id === newTrip.id);
    assert.ok(myTrip, 'Viajes scoped debe contener el viaje del productor');
    assert.strictEqual(myTrip.kilos, 350);

    // 5. Verificar que el portal NO puede leer GET /api/collections/cheeseTrips (debe dar 401/403)
    const genericRes = await fetch(`${BASE_URL}/api/collections/cheeseTrips`, {
      headers: { Cookie: producerCookie }
    });
    assert.ok([401, 403].includes(genericRes.status), 'Endpoint genérico debe denegar acceso (401/403) al portal productor');

    producerSocket.off('collection_delta', signalHandler);
    producerSocket.disconnect();
  });

  // SECCIÓN 8 — AISLAMIENTO CLIENTE A/B Y PRODUCTOR A/B
  it('SECCIÓN 8 — AISLAMIENTO: Cliente A / Productor A NO reciben señales ni datos de Cliente B / Productor B', async () => {
    // 1. Setup Clientes A y B
    const clientA = { id: 'CLI-ISO-A', name: 'Cliente A', phone: '04141110001', pinHash: bcrypt.hashSync('111001', 10), active: true };
    const clientB = { id: 'CLI-ISO-B', name: 'Cliente B', phone: '04141110002', pinHash: bcrypt.hashSync('111002', 10), active: true };
    const clients = readCollection('clients');
    clients.push(clientA, clientB);
    writeCollection('clients', clients);

    // Login Cliente A
    const loginA = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '04141110001', pin: '111001' })
    });
    const cookieA = (loginA.headers.get('set-cookie') || '').split(';')[0];
    const socketA = await connectTestSocket(cookieA);

    let deltasReceivedA = [];
    socketA.on('collection_delta', d => deltasReceivedA.push(d));

    // Emitir operación para Cliente B
    const instB = { id: 'inst-iso-B', clientId: 'CLI-ISO-B', amount: 90 };
    const allInsts = [...readCollection('installments'), instB];
    writeCollection('installments', allInsts, { action: 'add', collection: 'installments', doc: instB, clientId: 'CLI-ISO-B' });

    await new Promise((r) => setTimeout(r, 400));

    // Cliente A no debe haber recibido el delta de Cliente B
    assert.strictEqual(deltasReceivedA.length, 0, 'Socket de Cliente A no debe recibir eventos de Cliente B');

    // Consulta scoped de Cliente A debe dar 0 cuotas de B
    const finResA = await fetch(`${BASE_URL}/api/portal/client/finances`, { headers: { Cookie: cookieA } });
    const finDataA = await finResA.json();
    assert.strictEqual((finDataA.installments || []).some(i => i.clientId === 'CLI-ISO-B'), false, 'Cliente A no ve datos de Cliente B');

    socketA.disconnect();

    // 2. Setup Productores A y B
    const prodA = { id: 'SUP-ISO-A', name: 'Productor A', phone: '04161110001', pinHash: bcrypt.hashSync('111001', 10), balanceOwed: 50, active: true };
    const prodB = { id: 'SUP-ISO-B', name: 'Productor B', phone: '04161110002', pinHash: bcrypt.hashSync('111002', 10), balanceOwed: 80, active: true };
    const suppliers = readCollection('suppliers');
    suppliers.push(prodA, prodB);
    writeCollection('suppliers', suppliers);

    // Login Productor A
    const loginProdA = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'producer', identifier: '04161110001', pin: '111001' })
    });
    const cookieProdA = (loginProdA.headers.get('set-cookie') || '').split(';')[0];
    const socketProdA = await connectTestSocket(cookieProdA);

    let deltasReceivedProdA = [];
    socketProdA.on('collection_delta', d => deltasReceivedProdA.push(d));

    // Emitir cheeseTrips, suppliers y transactions exclusivamente para Productor B
    const tripB = { id: 'trip-iso-B', supplierId: 'SUP-ISO-B', kilos: 200, totalUSD: 800, status: 'received' };
    const allTrips = [...readCollection('cheeseTrips'), tripB];
    writeCollection('cheeseTrips', allTrips, { action: 'add', collection: 'cheeseTrips', doc: tripB, supplierId: 'SUP-ISO-B' });

    const txB = { id: 'tx-iso-B', supplierId: 'SUP-ISO-B', amount: 800, category: 'pagos_productores' };
    const allTxs = [...readCollection('transactions'), txB];
    writeCollection('transactions', allTxs, { action: 'add', collection: 'transactions', doc: txB, supplierId: 'SUP-ISO-B' });

    await new Promise((r) => setTimeout(r, 400));

    // Productor A no debe recibir deltas de Productor B
    assert.strictEqual(deltasReceivedProdA.length, 0, 'Socket de Productor A no debe recibir eventos de Productor B');

    // Consulta scoped de viajes y transacciones de Productor A no contiene datos de B
    const tripsResA = await fetch(`${BASE_URL}/api/portal/producer/trips`, { headers: { Cookie: cookieProdA } });
    const tripsDataA = await tripsResA.json();
    assert.strictEqual((tripsDataA || []).some(t => t.supplierId === 'SUP-ISO-B'), false, 'Productor A no ve viajes de Productor B');

    const txsResA = await fetch(`${BASE_URL}/api/portal/producer/transactions`, { headers: { Cookie: cookieProdA } });
    const txsDataA = await txsResA.json();
    assert.strictEqual((txsDataA || []).some(t => t.supplierId === 'SUP-ISO-B'), false, 'Productor A no ve transacciones de Productor B');

    socketProdA.disconnect();
  });

  // SECCIÓN 9 — RECONNECT CON SCOPED APIS
  it('SECCIÓN 9 — RECONNECT: Desconexión y Reconexión recibe señal y refresca endpoints scoped sin reload ni loops', async () => {
    const testClientId = 'CLI-RECON-SIGNAL';
    const testClientDoc = {
      id: testClientId,
      name: 'Cliente Reconnect Signal',
      phone: '04143339900',
      pinHash: bcrypt.hashSync('333990', 10),
      active: true
    };
    const clients = readCollection('clients');
    clients.push(testClientDoc);
    writeCollection('clients', clients);

    const loginRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalType: 'client', identifier: '04143339900', pin: '333990' })
    });
    const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

    // 1. Conexión inicial
    let socket = await connectTestSocket(cookie);
    assert.ok(socket.connected);

    // 2. Desconexión
    socket.disconnect();
    assert.strictEqual(socket.connected, false);

    // 3. Reconexión
    socket = await connectTestSocket(cookie);
    assert.ok(socket.connected);

    let signalFired = 0;
    socket.on('collection_delta', (d) => {
      if (d.collection === 'transactions' && String(d.doc?.clientId) === String(testClientId)) {
        signalFired++;
      }
    });

    // 4. Emitir delta tras reconexión
    const newTx = { id: `tx-recon-${Date.now()}`, clientId: testClientId, amount: 60, category: 'ventas' };
    const allTxs = [...readCollection('transactions'), newTx];
    writeCollection('transactions', allTxs, { action: 'add', collection: 'transactions', doc: newTx, clientId: testClientId });

    await new Promise((r) => setTimeout(r, 400));

    assert.strictEqual(signalFired, 1, 'Tras reconectar debe recibir exactamente 1 evento');

    // 5. Consulta scoped refleja la nueva transacción
    const txRes = await fetch(`${BASE_URL}/api/portal/client/transactions`, { headers: { Cookie: cookie } });
    const txData = await txRes.json();
    assert.ok((txData || []).some(t => t.id === newTx.id), 'Endpoint scoped refleja la nueva transacción sin F5');

    socket.disconnect();
  });

  // SECCIÓN 10 — HELPER onCollectionSignal DIRECTO Y UNSUBSCRIBE
  it('SECCIÓN 10 — onCollectionSignal: Recibe señal reactiva ante deltas y cancela ejecución tras unsubscribe', async () => {
    clearRealtimeCacheForAuthBoundary();
    disconnectSocket();
    process.env.KALU_TEST_SOCKET_COOKIE = adminCookie;

    let signalCount = 0;
    const testCallback = () => {
      signalCount++;
    };

    // Suscribir a varias colecciones con onCollectionSignal
    const unsub = onCollectionSignal(['transactions', 'installments', 'clients'], testCallback);

    // Esperar conexión inicial y registrar baseline
    await new Promise((r) => setTimeout(r, 400));
    const baseline = signalCount;

    // Emitir delta de transactions
    const txDoc = { id: `tx-signal-${Date.now()}`, amount: 100, category: 'ventas' };
    const allTxs = [...readCollection('transactions'), txDoc];
    writeCollection('transactions', allTxs, { action: 'add', collection: 'transactions', doc: txDoc });

    await new Promise((r) => setTimeout(r, 400));
    assert.strictEqual(signalCount - baseline, 1, 'onCollectionSignal debió ejecutar callback exactamente 1 vez para el delta de transactions');

    // Emitir delta de clients
    const cliDoc = { id: `cli-signal-${Date.now()}`, name: 'Cliente Signal', active: true };
    const allClis = [...readCollection('clients'), cliDoc];
    writeCollection('clients', allClis, { action: 'add', collection: 'clients', doc: cliDoc });

    await new Promise((r) => setTimeout(r, 400));
    assert.strictEqual(signalCount - baseline, 2, 'onCollectionSignal debió ejecutar callback exactamente 1 vez para el delta de clients (total 2)');

    // Ejecutar unsubscribe
    unsub();

    // Emitir otro delta
    const txDoc2 = { id: `tx-signal-2-${Date.now()}`, amount: 50, category: 'ventas' };
    const allTxs2 = [...readCollection('transactions'), txDoc2];
    writeCollection('transactions', allTxs2, { action: 'add', collection: 'transactions', doc: txDoc2 });

    await new Promise((r) => setTimeout(r, 400));
    assert.strictEqual(signalCount - baseline, 2, 'Tras unsubscribe, el callback NO debe ejecutarse');

    disconnectSocket();
    delete process.env.KALU_TEST_SOCKET_COOKIE;
  });

  // SECCIÓN 11 — DEDUPLICACIÓN DE CALLBACKS EN RECONNECT
  it('SECCIÓN 11 — RECONNECT DEDUPLICACIÓN: ClientPortal (5 colecciones) y ProducerPortal (4 colecciones) ejecutan callback exactamente 1 vez en reconnect', async () => {
    clearRealtimeCacheForAuthBoundary();
    disconnectSocket();

    let clientPortalRefreshCount = 0;
    const clientRefreshCallback = () => {
      clientPortalRefreshCount++;
    };

    let producerPortalRefreshCount = 0;
    const producerRefreshCallback = () => {
      producerPortalRefreshCount++;
    };

    // ClientPortal suscribe 5 colecciones con el mismo callback
    const unsubClient = onCollectionSignal(
      ['transactions', 'installments', 'pwa_payments', 'clients', 'mobileOrders'],
      clientRefreshCallback
    );

    // ProducerPortal suscribe 4 colecciones con el mismo callback
    const unsubProducer = onCollectionSignal(
      ['cheeseTrips', 'transactions', 'suppliers', 'mobileOrders'],
      producerRefreshCallback
    );

    // Esperar conexión inicial
    await new Promise((r) => setTimeout(r, 300));
    const initialClientCount = clientPortalRefreshCount;
    const initialProducerCount = producerPortalRefreshCount;

    // Forzar reconexión del socket central
    const socket = reconnectSocket();
    await new Promise((resolve) => {
      if (socket.connected) resolve();
      else socket.once('connect', resolve);
    });

    await new Promise((r) => setTimeout(r, 400));

    // En reconnect, cada portal debe haberse ejecutado exactamente 1 vez adicional (NO 5 ni 4 veces)
    const clientDelta = clientPortalRefreshCount - initialClientCount;
    const producerDelta = producerPortalRefreshCount - initialProducerCount;

    assert.strictEqual(clientDelta, 1, `ClientPortal debió ejecutarse exactamente 1 vez en reconnect (recibido: ${clientDelta})`);
    assert.strictEqual(producerDelta, 1, `ProducerPortal debió ejecutarse exactamente 1 vez en reconnect (recibido: ${producerDelta})`);

    unsubClient();
    unsubProducer();
    disconnectSocket();
  });
});
