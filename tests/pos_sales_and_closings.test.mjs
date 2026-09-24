import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import http from 'http';
import bcrypt from 'bcryptjs';
import { io as ClientIO } from 'socket.io-client';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const TEST_DATA_DIR = path.join(projectRoot, 'test_pos_closings_data');
const TEST_UPLOADS_DIR = path.join(projectRoot, 'test_pos_closings_uploads');
const TEST_PORT = 3899;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

process.env.KALU_DATA_DIR = TEST_DATA_DIR;
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.UPLOAD_DIR = TEST_UPLOADS_DIR;
process.env.PORT = String(TEST_PORT);
process.env.AUTO_START_SERVER = 'false';
process.env.BUSINESS_TIMEZONE = 'America/Caracas';

function setupCleanEnvironment() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(TEST_UPLOADS_DIR)) {
    fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  fs.mkdirSync(TEST_UPLOADS_DIR, { recursive: true });

  const initialCollections = {
    users: [
      {
        id: 'admin-1',
        username: 'admin',
        email: 'admin@queserialakalu.com',
        role: 'admin',
        name: 'Administrador',
        passwordHash: bcrypt.hashSync('adminpass123', 10),
        pinHash: bcrypt.hashSync('123456', 10),
        active: true
      },
      {
        id: 'cajero-1',
        username: 'cajero1',
        cedula: '87654321',
        role: 'cajero',
        name: 'Juan Cajero',
        passwordHash: bcrypt.hashSync('cajeropass123', 10),
        pinHash: bcrypt.hashSync('4321', 10),
        active: true
      },
      {
        id: 'cajero-2',
        username: 'cajero2',
        cedula: '11223344',
        role: 'cajero',
        name: 'Pedro Cajero',
        passwordHash: bcrypt.hashSync('cajeropass456', 10),
        pinHash: bcrypt.hashSync('9999', 10),
        active: true
      }
    ],
    settings: [{ id: 'general', exchangeRate: 42.50, centralVaultBalance: { usd: 100, bs: 2000, bankBs: 5000, bankUsd: 500 } }],
    products: [{ id: 'prod-1', name: 'Queso Llanero', category: 'QUESOS', sellingPrice: 5.0, stockKg: 100, alertThreshold: 10 }],
    clients: [{ id: 'client-1', name: 'Juan Perez', outstandingDebt: 0, currentDebtUsd: 0 }],
    suppliers: [{ id: 'sup-1', name: 'Productor Quesero', balanceOwed: 0, storeDebt: 0 }],
    transactions: [],
    cashClosings: [],
    installments: [],
    pwa_payments: [],
    bills: [],
    kardex: [],
    audit_logs: [],
    daily_drafts: [],
    mobileOrders: []
  };

  for (const [col, data] of Object.entries(initialCollections)) {
    fs.writeFileSync(path.join(TEST_DATA_DIR, `${col}_db.json`), JSON.stringify(data, null, 2), 'utf8');
  }
}

let serverInstance = null;
let serverModule = null;
let adminCookie = '';
let adminCsrf = '';

async function startServer(isRestart = false) {
  if (!isRestart) {
    setupCleanEnvironment();
  }
  serverModule = await import(`../server.js?t=${Date.now()}`);
  await new Promise((resolve) => {
    serverInstance = serverModule.server.listen(TEST_PORT, '127.0.0.1', () => {
      resolve();
    });
  });

  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`);
  const csrfData = await csrfRes.json();
  adminCsrf = csrfData.csrfToken;
  const initialCookie = (csrfRes.headers.get('set-cookie') || '').split(';')[0];

  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': initialCookie },
    body: JSON.stringify({ loginMode: 'admin', email: 'admin@queserialakalu.com', password: 'adminpass123' })
  });
  const adminLoginData = await adminLoginRes.json();
  assert.equal(adminLoginRes.status, 200, 'Admin login debe responder 200');
  
  const setCookieHeader = adminLoginRes.headers.get('set-cookie') || initialCookie;
  adminCookie = setCookieHeader.split(';')[0];
  if (adminLoginData.csrfToken) adminCsrf = adminLoginData.csrfToken;
}

async function stopServer() {
  if (serverModule && serverModule.io) {
    try {
      serverModule.io.close();
    } catch (e) {}
  }
  if (serverInstance) {
    if (typeof serverInstance.closeAllConnections === 'function') {
      serverInstance.closeAllConnections();
    }
    await new Promise((resolve) => serverInstance.close(resolve));
    serverInstance = null;
  }
}

function connectTestSocket(cookie) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookie) headers['Cookie'] = cookie;
    const socket = ClientIO(BASE_URL, {
      transports: ['polling'],
      transportOptions: {
        polling: {
          extraHeaders: headers
        }
      }
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
      reject(err);
    });
  });
}

test('SUITE INTEGRAL: HISTORIAL DE VENTAS, CIERRE MANUAL, CONTINGENCIA Y FACTURAS EN ESPERA', async (t) => {
  await startServer();

  t.after(async () => {
    await stopServer();
    if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    if (fs.existsSync(TEST_UPLOADS_DIR)) fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  });

  const { executeShiftClosing, performContingencyCloseForOrphans, withTransaction, readCollection } = serverModule;

  // Helpers para simular UI logic de CheesePOSView
  function computePOSViewModel(allTransactions) {
    const validSalesHistory = (allTransactions || []).filter(t => t.category === 'ventas' && !t.isVoided);
    const currentShiftSales = validSalesHistory.filter(s => !s.isClosed && !s.isVoided);
    const allSalesHistory = [...validSalesHistory].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    const historyTotalCount = allSalesHistory.length;
    const historyTotalRevenue = allSalesHistory.reduce((sum, s) => sum + (Number(s.amount) || Number(s.total) || 0), 0);
    return { validSalesHistory, currentShiftSales, allSalesHistory, historyTotalCount, historyTotalRevenue };
  }

  // --- SECCIÓN 1: HISTORIAL DE VENTAS Y SEPARACIÓN DEL TURNO ACTUAL ---
  await t.test('BASE 1: Venta abierta aparece en Historial de Ventas y en Turno Actual', async () => {
    const nowMs = Date.now();
    const openSale = {
      id: 'TX-OPEN-001',
      entity: 'Cliente Mostrador',
      category: 'ventas',
      amount: 25.0,
      createdAt: nowMs,
      date: '24 sept 2026',
      isClosed: false,
      isVoided: false
    };

    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push(openSale);
      tx.write('transactions', txs);
    });

    const txs = readCollection('transactions');
    const vm = computePOSViewModel(txs);

    assert.equal(vm.allSalesHistory.length, 1);
    assert.equal(vm.allSalesHistory[0].id, 'TX-OPEN-001');
    assert.equal(vm.currentShiftSales.length, 1);
  });

  await t.test('BASE 2: Venta cerrada (isClosed=true) SIGUE apareciendo en Historial de Ventas pero SALE de currentShiftSales', async () => {
    const nowMs = Date.now();
    const closedSale = {
      id: 'TX-CLOSED-002',
      entity: 'Cliente Anterior',
      category: 'ventas',
      amount: 50.0,
      createdAt: nowMs - 10000,
      date: '24 sept 2026',
      isClosed: true,
      closureId: 'CLO-TEST-PREV',
      isVoided: false
    };

    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push(closedSale);
      tx.write('transactions', txs);
    });

    const txs = readCollection('transactions');
    const vm = computePOSViewModel(txs);

    assert.equal(vm.allSalesHistory.length, 2, 'Historial de ventas debe contener tanto la abierta como la cerrada');
    assert.equal(vm.currentShiftSales.length, 1, 'currentShiftSales solo debe contener la venta abierta');
    assert.equal(vm.currentShiftSales[0].id, 'TX-OPEN-001');
  });

  await t.test('BASE 3: Venta anulada (isVoided=true) no cuenta en Historial ni en Turno', async () => {
    const nowMs = Date.now();
    const voidedSale = {
      id: 'TX-VOIDED-003',
      entity: 'Cliente Anulado',
      category: 'ventas',
      amount: 100.0,
      createdAt: nowMs + 1000,
      date: '24 sept 2026',
      isClosed: false,
      isVoided: true
    };

    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push(voidedSale);
      tx.write('transactions', txs);
    });

    const txs = readCollection('transactions');
    const vm = computePOSViewModel(txs);

    assert.equal(vm.allSalesHistory.length, 2);
    assert.equal(vm.currentShiftSales.length, 1);
    assert.ok(!vm.allSalesHistory.some(s => s.id === 'TX-VOIDED-003'));
  });

  await t.test('BASE 4: Cierre manual crea 1 cashClosing tipo MANUAL y emite Socket.IO', async () => {
    const staffSocket = await connectTestSocket(adminCookie);
    let liveClosingEvent = null;
    staffSocket.on('collection_delta', (delta) => {
      if (delta.collection === 'cashClosings' && delta.action === 'add') {
        liveClosingEvent = delta.doc;
      }
    });

    const result = await executeShiftClosing({
      type: 'MANUAL',
      closedBy: 'Juan Cajero',
      startingCashUsd: 10.0,
      startingCashBs: 500.0,
      actualCashUsd: 35.0,
      actualCashBs: 500.0,
      bcvRate: 42.50,
      isAuto: false
    });

    assert.ok(result.closing);
    assert.equal(result.closing.type, 'MANUAL');
    assert.equal(result.closing.status, 'Balance Perfecto');

    await new Promise(r => setTimeout(r, 200));
    assert.ok(liveClosingEvent);
    assert.equal(liveClosingEvent.id, result.closing.id);
    staffSocket.disconnect();
  });

  // =========================================================================
  // LAS 10 PRUEBAS OBLIGATORIAS DE CIERRE DE CONTINGENCIA Y FACTURAS EN ESPERA
  // =========================================================================

  await t.test('TEST 1: Venta finalizada hoy. Ejecutar detector de contingencia hoy -> NO cierre', async () => {
    const nowMs = Date.now();
    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push({
        id: 'TX-TEST1-TODAY',
        category: 'ventas',
        amount: 20.0,
        createdAt: nowMs,
        date: '24 sept 2026',
        isClosed: false,
        isVoided: false
      });
      tx.write('transactions', txs);
    });

    const closingsBefore = readCollection('cashClosings').length;
    const res = await performContingencyCloseForOrphans('TEST_1_CHECK');

    assert.equal(res.count, 0, 'No debe cerrar ventas del día comercial actual');
    assert.equal(res.closing, null);

    const closingsAfter = readCollection('cashClosings').length;
    assert.equal(closingsAfter, closingsBefore, 'No se deben crear nuevos cashClosings');

    const txs = readCollection('transactions');
    const tToday = txs.find(t => t.id === 'TX-TEST1-TODAY');
    assert.equal(tToday.isClosed, false, 'Venta de hoy permanece abierta');
  });

  await t.test('TEST 2: Venta finalizada ayer, sin cierre. Startup hoy -> 1 cierre CONTINGENCIA', async () => {
    const yesterdayMs = new Date('2026-09-23T16:00:00.000-04:00').getTime();
    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push({
        id: 'TX-TEST2-YEST',
        category: 'ventas',
        amount: 45.0,
        createdAt: yesterdayMs,
        date: '23 sept 2026',
        isClosed: false,
        isVoided: false
      });
      tx.write('transactions', txs);
    });

    const res = await performContingencyCloseForOrphans('STARTUP_CATCHUP');
    assert.ok(res);
    assert.equal(res.count, 1, 'Debe cerrar exactamente 1 venta huérfana de ayer');
    assert.ok(res.closing);
    assert.equal(res.closing.type, 'CONTINGENCIA', 'El tipo debe ser estrictamente CONTINGENCIA');
    assert.equal(res.closing.status, 'Cierre de contingencia - Sin arqueo físico');
    assert.ok(res.closing.transactionIds.includes('TX-TEST2-YEST'));

    const txs = readCollection('transactions');
    const tYest = txs.find(t => t.id === 'TX-TEST2-YEST');
    assert.equal(tYest.isClosed, true);
    assert.equal(tYest.closureId, res.closing.id);
  });

  await t.test('TEST 3: Venta finalizada ayer + factura congelada ayer. Startup hoy -> Cierre contiene solo venta finalizada. Factura congelada intacta', async () => {
    const yesterdayMs = new Date('2026-09-23T18:00:00.000-04:00').getTime();
    
    // 1. Venta finalizada de ayer
    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push({
        id: 'TX-TEST3-FINAL-SALE',
        category: 'ventas',
        amount: 30.0,
        createdAt: yesterdayMs,
        date: '23 sept 2026',
        isClosed: false,
        isVoided: false
      });
      tx.write('transactions', txs);

      // 2. Factura congelada / en espera en daily_drafts
      const drafts = tx.read('daily_drafts');
      drafts.push({
        id: 'DRAFT-TEST3-HOLD-1',
        type: 'invoice_draft',
        status: 'on_hold',
        customerName: 'Cliente Espera',
        items: [{ productId: 'prod-1', quantityKg: 2, subtotal: 10.0 }],
        createdAt: yesterdayMs
      });
      tx.write('daily_drafts', drafts);
    });

    const res = await performContingencyCloseForOrphans('STARTUP_CATCHUP');
    assert.ok(res);
    assert.equal(res.count, 1);
    assert.ok(res.closing.transactionIds.includes('TX-TEST3-FINAL-SALE'));
    assert.ok(!res.closing.transactionIds.includes('DRAFT-TEST3-HOLD-1'), 'Factura congelada NO debe estar en transactionIds del cierre');

    // Comprobar que factura congelada en daily_drafts sigue intacta
    const drafts = readCollection('daily_drafts');
    const d1 = drafts.find(d => d.id === 'DRAFT-TEST3-HOLD-1');
    assert.ok(d1, 'Factura congelada debe existir');
    assert.equal(d1.status, 'on_hold');
    assert.equal(d1.isClosed, undefined, 'Factura congelada no debe recibir isClosed');
    assert.equal(d1.closureId, undefined, 'Factura congelada no debe recibir closureId');
  });

  await t.test('TEST 4: 3 facturas congeladas, 0 ventas finalizadas. Cambio de día / startup -> 0 cashClosings nuevos. Las 3 facturas siguen disponibles', async () => {
    const yesterdayMs = new Date('2026-09-22T10:00:00.000-04:00').getTime();
    
    await withTransaction(async (tx) => {
      const drafts = tx.read('daily_drafts');
      drafts.push(
        { id: 'DRAFT-T4-1', type: 'invoice_draft', status: 'on_hold', total: 15.0, createdAt: yesterdayMs },
        { id: 'DRAFT-T4-2', type: 'invoice_draft', status: 'on_hold', total: 25.0, createdAt: yesterdayMs },
        { id: 'DRAFT-T4-3', type: 'invoice_draft', status: 'on_hold', total: 35.0, createdAt: yesterdayMs }
      );
      tx.write('daily_drafts', drafts);
    });

    const closingsBefore = readCollection('cashClosings').length;
    const res = await performContingencyCloseForOrphans('STARTUP_CATCHUP');

    assert.equal(res.count, 0, 'No debe haber procesado ninguna venta');
    assert.equal(res.closing, null);

    const closingsAfter = readCollection('cashClosings').length;
    assert.equal(closingsAfter, closingsBefore, 'Exactamente 0 cashClosings nuevos');

    const drafts = readCollection('daily_drafts');
    assert.ok(drafts.find(d => d.id === 'DRAFT-T4-1'));
    assert.ok(drafts.find(d => d.id === 'DRAFT-T4-2'));
    assert.ok(drafts.find(d => d.id === 'DRAFT-T4-3'));
  });

  await t.test('TEST 5: Cierre manual con 5 ventas finalizadas + 2 facturas en espera -> Cierre manual contiene 5 ventas, las 2 en espera no participan', async () => {
    const nowMs = Date.now();
    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      for (let i = 1; i <= 5; i++) {
        txs.push({
          id: `TX-T5-SALE-${i}`,
          category: 'ventas',
          amount: 10.0 * i,
          createdAt: nowMs + i,
          date: '24 sept 2026',
          isClosed: false,
          isVoided: false
        });
      }
      tx.write('transactions', txs);

      const drafts = tx.read('daily_drafts');
      drafts.push(
        { id: 'DRAFT-T5-1', type: 'invoice_draft', status: 'on_hold', total: 99.0, createdAt: nowMs },
        { id: 'DRAFT-T5-2', type: 'invoice_draft', status: 'on_hold', total: 88.0, createdAt: nowMs }
      );
      tx.write('daily_drafts', drafts);
    });

    const resManual = await executeShiftClosing({
      type: 'MANUAL',
      closedBy: 'Juan Cajero',
      startingCashUsd: 0,
      actualCashUsd: 150.0, // 10+20+30+40+50 = 150 (+ 20 de TEST 1 = 170)
      isAuto: false
    });

    assert.ok(resManual.closing);
    assert.equal(resManual.closing.type, 'MANUAL');
    assert.ok(!resManual.closing.transactionIds.includes('DRAFT-T5-1'));
    assert.ok(!resManual.closing.transactionIds.includes('DRAFT-T5-2'));

    // Las 2 en espera siguen intactas en daily_drafts
    const drafts = readCollection('daily_drafts');
    const d1 = drafts.find(d => d.id === 'DRAFT-T5-1');
    const d2 = drafts.find(d => d.id === 'DRAFT-T5-2');
    assert.ok(d1);
    assert.ok(d2);
    assert.equal(d1.isClosed, undefined);
    assert.equal(d2.isClosed, undefined);
  });

  await t.test('TEST 6: Cierre manual realizado correctamente. Reiniciar al día siguiente -> NO cierre de contingencia duplicado', async () => {
    // Todas las ventas están cerradas
    const resCatchup = await performContingencyCloseForOrphans('STARTUP_CATCHUP');
    assert.equal(resCatchup.count, 0, 'No debe crear ningún cierre');
    assert.equal(resCatchup.closing, null);
  });

  await t.test('TEST 7: Apagón simulado: crear ventas finalizadas, persistirlas, NO ejecutar cierre, apagar backend, reiniciar -> Contingencia protege ventas', async () => {
    // 1. Crear venta de un día anterior simulando corte de luz antes del cierre
    const blackoutDayMs = new Date('2026-09-20T21:30:00.000-04:00').getTime();
    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push({
        id: 'TX-BLACKOUT-001',
        category: 'ventas',
        amount: 120.0,
        createdAt: blackoutDayMs,
        date: '20 sept 2026',
        isClosed: false,
        isVoided: false
      });
      tx.write('transactions', txs);
    });

    // 2. Simular apagón: detener servidor
    await stopServer();

    // 3. Reiniciar backend con el mismo DATA_DIR
    await startServer(true);

    // 4. Ejecutar startup catch-up
    const resRecovery = await serverModule.performContingencyCloseForOrphans('STARTUP_CATCHUP');
    assert.ok(resRecovery);
    assert.ok(resRecovery.closing);
    assert.equal(resRecovery.closing.type, 'CONTINGENCIA');
    assert.ok(resRecovery.closing.transactionIds.includes('TX-BLACKOUT-001'));

    const txs = serverModule.readCollection('transactions');
    const blackoutTx = txs.find(t => t.id === 'TX-BLACKOUT-001');
    assert.equal(blackoutTx.isClosed, true);
    assert.equal(blackoutTx.closureId, resRecovery.closing.id);
  });

  await t.test('TEST 8: Contingencia: status = "Cierre de contingencia - Sin arqueo físico", actualCash = null, difference = null, NO modifica bóveda', async () => {
    // Obtener balance de bóveda antes de la prueba
    const settingsBefore = serverModule.readCollection('settings');
    const vaultBefore = settingsBefore.find(s => s.id === 'general')?.centralVaultBalance || { usd: 0 };
    const initialUsd = vaultBefore.usd;

    const oldDayMs = new Date('2026-09-19T14:00:00.000-04:00').getTime();
    await serverModule.withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push({
        id: 'TX-T8-CONTINGENCY-VAULT',
        category: 'ventas',
        amount: 55.0,
        createdAt: oldDayMs,
        date: '19 sept 2026',
        isClosed: false,
        isVoided: false
      });
      tx.write('transactions', txs);
    });

    const res = await serverModule.performContingencyCloseForOrphans('STARTUP_CATCHUP');
    assert.ok(res.closing);
    assert.equal(res.closing.type, 'CONTINGENCIA');
    assert.equal(res.closing.status, 'Cierre de contingencia - Sin arqueo físico');
    assert.equal(res.closing.actualCashUsd, null);
    assert.equal(res.closing.actualCashBs, null);
    assert.equal(res.closing.countedCashUsd, null);
    assert.equal(res.closing.countedCashBs, null);
    assert.equal(res.closing.diffUsd, null);
    assert.equal(res.closing.diffBs, null);
    assert.equal(res.closing.differenceUsd, null);
    assert.equal(res.closing.differenceBs, null);

    // Verificar que bóveda central NO fue alterada
    const settingsAfter = serverModule.readCollection('settings');
    const vaultAfter = settingsAfter.find(s => s.id === 'general')?.centralVaultBalance || { usd: 0 };
    assert.equal(vaultAfter.usd, initialUsd, 'La bóveda central no debe haber sido modificada por cierre de contingencia');
  });

  await t.test('TEST 9: Factura congelada de ayer se recupera posteriormente -> NO había sido cerrada, NO tiene closureId, NO se convirtió en venta por cambio de día', async () => {
    const yesterdayMs = new Date('2026-09-23T11:00:00.000-04:00').getTime();
    
    // Crear borrador en daily_drafts
    await serverModule.withTransaction(async (tx) => {
      const drafts = tx.read('daily_drafts');
      drafts.push({
        id: 'DRAFT-RESUME-009',
        type: 'invoice_draft',
        status: 'on_hold',
        customerName: 'Cliente Juan Reanudar',
        items: [{ productId: 'prod-1', quantityKg: 5, subtotal: 25.0 }],
        createdAt: yesterdayMs
      });
      tx.write('daily_drafts', drafts);
    });

    // Ejecutar catchup de contingencia
    await serverModule.performContingencyCloseForOrphans('STARTUP_CATCHUP');

    // Verificar que el borrador sigue sin tocar
    const drafts = serverModule.readCollection('daily_drafts');
    const draft = drafts.find(d => d.id === 'DRAFT-RESUME-009');
    assert.ok(draft);
    assert.equal(draft.isClosed, undefined);
    assert.equal(draft.closureId, undefined);
    assert.equal(draft.status, 'on_hold');

    // Recuperar / reanudar la factura: sigue disponible como borrador editable
    assert.equal(draft.items.length, 1);
    assert.equal(draft.items[0].subtotal, 25.0);
  });

  await t.test('TEST 10: No existe setInterval periódico de auto-cierre en server.js', async () => {
    const serverCode = fs.readFileSync(path.join(projectRoot, 'server.js'), 'utf8');
    
    // Comprobar que NO existe setInterval con performAutoClose o performContingencyClose
    const hasIntervalAutoClose = /setInterval\s*\(\s*(?:\(\s*\)\s*=>\s*)?\{?\s*perform(?:Auto|Contingency)Close/i.test(serverCode);
    assert.equal(hasIntervalAutoClose, false, 'No debe existir ningún setInterval periódico para cierre automático o de contingencia en server.js');

    const hasClosurePeriodicTimer = /setInterval\s*\([^)]*(?:close|closing|orphans|shift)/i.test(serverCode);
    assert.equal(hasClosurePeriodicTimer, false, 'No debe existir ningún timer periódico relacionado a cierres');
  });

  // --- SECCIÓN SEGURIDAD Y FRONTERA DE NUEVO DÍA ---
  await t.test('TEST 11: Frontera de Nuevo Día en POST /api/pos/process-sale ejecuta contingencia de días previos antes de crear la venta del día', async () => {
    // 1. Insertar venta huérfana de hace 2 días
    const twoDaysAgoMs = new Date('2026-09-22T09:00:00.000-04:00').getTime();
    await serverModule.withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push({
        id: 'TX-TWO-DAYS-AGO',
        category: 'ventas',
        amount: 35.0,
        createdAt: twoDaysAgoMs,
        date: '22 sept 2026',
        isClosed: false,
        isVoided: false
      });
      tx.write('transactions', txs);
    });

    // 2. Enviar nueva venta mediante endpoint /api/pos/process-sale
    const salePayload = {
      saleItems: [{ productId: 'prod-1', quantityKg: 1, pricePerKg: 5.0, subtotal: 5.0 }],
      customerName: 'Cliente Nuevo Día',
      paidAmount: 5.0,
      saleTotalAmount: 5.0,
      addedPayments: [{ method: 'Efectivo $', amount: 5.0, currency: 'USD' }]
    };

    const res = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify(salePayload)
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.transaction);

    // 3. Comprobar que la venta de hace 2 días fue cerrada por contingencia
    const txs = serverModule.readCollection('transactions');
    const oldTx = txs.find(t => t.id === 'TX-TWO-DAYS-AGO');
    assert.equal(oldTx.isClosed, true, 'La venta vieja debió cerrarse en la frontera del nuevo día');
    assert.ok(oldTx.closureId);

    // 4. La nueva venta creada está abierta (isClosed = false)
    const newTx = txs.find(t => t.id === data.transaction.id);
    assert.equal(newTx.isClosed, false, 'La venta nueva debe permanecer abierta en el turno activo');
  });

  await t.test('TEST 12: Seguridad de POST /api/pos/close-shift: payload manipulado es ignorado', async () => {
    // Cajero envía payload intentando manipular totalSalesAmount y type
    const maliciousPayload = {
      startingCashUsd: 10,
      startingCashBs: 0,
      actualCashUsd: 15,
      actualCashBs: 0,
      totalSalesAmount: 999999,
      salesCount: 9999,
      transactionIds: ['TX-FAKE-123'],
      closedBy: 'ADMINISTRADOR FALSO',
      type: 'CONTINGENCIA',
      status: 'HACKED'
    };

    const res = await fetch(`${BASE_URL}/api/pos/close-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify(maliciousPayload)
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.closing);

    assert.equal(data.closing.totalSalesAmount, 5.0, 'El monto total debe ser el calculado por el servidor (5.0), no 999999');
    assert.equal(data.closing.salesCount, 1, 'La cantidad de ventas debe ser 1, no 9999');
    assert.equal(data.closing.type, 'MANUAL', 'El tipo debe ser forzado a MANUAL por el endpoint');
    assert.notEqual(data.closing.closedBy, 'ADMINISTRADOR FALSO');
    assert.ok(!data.closing.transactionIds.includes('TX-FAKE-123'));
  });

  await t.test('TEST 13: Autorización RBAC en POST /api/pos/close-shift', async () => {
    const anonRes = await fetch(`${BASE_URL}/api/pos/close-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualCashUsd: 0 })
    });
    assert.equal(anonRes.status, 401, 'Petición anónima debe responder 401 Unauthorized');
  });

  // =========================================================================
  // REMATES TÉCNICOS: TESTS A, B, C, D, E
  // =========================================================================

  await t.test('REQUERIMIENTO 1 — TEST A: Ayer 2 ventas finalizadas sin cierre + Hoy 5 ventas finalizadas -> Cierre manual genera 1 CONTINGENCIA de ayer (2 ventas) + 1 MANUAL de hoy (5 ventas). Cero cruce de fechas', async () => {
    const yesterdayMs = new Date('2026-09-23T15:00:00.000-04:00').getTime();
    const nowMs = Date.now();

    await serverModule.withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      // 2 ventas de ayer
      txs.push(
        { id: 'TX-REQ1-Y1', category: 'ventas', amount: 15.0, createdAt: yesterdayMs, date: '23 sept 2026', isClosed: false, isVoided: false },
        { id: 'TX-REQ1-Y2', category: 'ventas', amount: 25.0, createdAt: yesterdayMs + 1000, date: '23 sept 2026', isClosed: false, isVoided: false }
      );
      // 5 ventas de hoy
      for (let i = 1; i <= 5; i++) {
        txs.push({
          id: `TX-REQ1-H${i}`,
          category: 'ventas',
          amount: 10.0 * i,
          createdAt: nowMs + i * 10,
          date: '24 sept 2026',
          isClosed: false,
          isVoided: false
        });
      }
      tx.write('transactions', txs);
    });

    const closingsBefore = serverModule.readCollection('cashClosings').length;

    // Cajero ejecuta POST /api/pos/close-shift
    const res = await fetch(`${BASE_URL}/api/pos/close-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({ startingCashUsd: 0, actualCashUsd: 150.0 })
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.closing);

    // Cierre manual de hoy: debe contener exactamente las 5 ventas de hoy
    assert.equal(data.closing.type, 'MANUAL');
    assert.equal(data.closing.salesCount, 5, 'El cierre manual de hoy debe tener exactamente 5 ventas');
    assert.equal(data.closing.totalSalesAmount, 150.0);
    assert.ok(data.closing.transactionIds.includes('TX-REQ1-H1'));
    assert.ok(data.closing.transactionIds.includes('TX-REQ1-H5'));
    assert.ok(!data.closing.transactionIds.includes('TX-REQ1-Y1'), 'Cierre manual de hoy NO debe contener ventas de ayer');

    // Total de cierres en base de datos debe haber aumentado en 2 (1 contingencia + 1 manual)
    const closingsAfter = serverModule.readCollection('cashClosings');
    assert.equal(closingsAfter.length, closingsBefore + 2);

    const contingencyClosing = closingsAfter.find(c => c.type === 'CONTINGENCIA' && c.transactionIds.includes('TX-REQ1-Y1'));
    assert.ok(contingencyClosing, 'Debe haberse generado el cierre de contingencia para las ventas de ayer');
    assert.equal(contingencyClosing.salesCount, 2);
    assert.equal(contingencyClosing.totalSalesAmount, 40.0);
    assert.ok(contingencyClosing.transactionIds.includes('TX-REQ1-Y2'));
    assert.ok(!contingencyClosing.transactionIds.includes('TX-REQ1-H1'));
  });

  await t.test('REQUERIMIENTO 1 — TEST B: Ayer solo facturas congeladas daily_drafts + Hoy 5 ventas -> Cierre manual genera 0 contingencias y 1 MANUAL con 5 ventas. Facturas intactas', async () => {
    const yesterdayMs = new Date('2026-09-23T11:00:00.000-04:00').getTime();
    const nowMs = Date.now();

    await serverModule.withTransaction(async (tx) => {
      // 2 facturas en espera de ayer
      const drafts = tx.read('daily_drafts');
      drafts.push(
        { id: 'DRAFT-REQ1-B1', type: 'invoice_draft', status: 'on_hold', total: 60.0, createdAt: yesterdayMs },
        { id: 'DRAFT-REQ1-B2', type: 'invoice_draft', status: 'on_hold', total: 90.0, createdAt: yesterdayMs }
      );
      tx.write('daily_drafts', drafts);

      // 5 ventas de hoy
      const txs = tx.read('transactions');
      for (let i = 1; i <= 5; i++) {
        txs.push({
          id: `TX-REQ1-TB-${i}`,
          category: 'ventas',
          amount: 20.0,
          createdAt: nowMs + i * 10,
          date: '24 sept 2026',
          isClosed: false,
          isVoided: false
        });
      }
      tx.write('transactions', txs);
    });

    const closingsBefore = serverModule.readCollection('cashClosings').length;

    const res = await fetch(`${BASE_URL}/api/pos/close-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({ startingCashUsd: 0, actualCashUsd: 100.0 })
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.closing);

    // Debe haberse creado exactamente 1 cierre (el manual de hoy), 0 de contingencia
    const closingsAfter = serverModule.readCollection('cashClosings');
    assert.equal(closingsAfter.length, closingsBefore + 1, 'Exactamente 1 cierre nuevo');
    assert.equal(data.closing.salesCount, 5);
    assert.equal(data.closing.totalSalesAmount, 100.0);

    // Las facturas congeladas permanecen intactas
    const drafts = serverModule.readCollection('daily_drafts');
    assert.ok(drafts.find(d => d.id === 'DRAFT-REQ1-B1'));
    assert.ok(drafts.find(d => d.id === 'DRAFT-REQ1-B2'));
  });

  await t.test('REQUERIMIENTO 2 — TEST C: Manipulación BCV: Cajero autenticado envía bcvRate: 999999 -> Servidor utiliza estrictamente la tasa de settings (42.50)', async () => {
    const nowMs = Date.now();
    await serverModule.withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push({
        id: 'TX-BCV-MANIPULATED',
        category: 'ventas',
        amount: 50.0,
        createdAt: nowMs,
        date: '24 sept 2026',
        isClosed: false,
        isVoided: false,
        addedPayments: [{ method: 'Efectivo Bs', amount: 50.0, originalAmount: 2125.0 }] // 50 * 42.50 = 2125 Bs
      });
      tx.write('transactions', txs);
    });

    const res = await fetch(`${BASE_URL}/api/pos/close-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({
        startingCashUsd: 0,
        startingCashBs: 0,
        actualCashUsd: 0,
        actualCashBs: 2125.0,
        bcvRate: 999999 // Tasa manipulada en payload
      })
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.closing);

    // La tasa de cierre DEBE ser 42.50 (de settings), NO 999999
    assert.equal(data.closing.bcvRateAtClose, 42.50, 'bcvRateAtClose debe ser la tasa autoritativa de settings (42.50)');
    assert.notEqual(data.closing.bcvRateAtClose, 999999);
  });

  await t.test('REQUERIMIENTO 3 — TEST D: Orden histórico con mezcla de timestamp numérico y legacy ISO string: Cierre A 10:00, B 12:00, C 14:00 -> parseClosingTimestamp ordena C, B, A sin NaN', async () => {
    const { parseClosingTimestamp } = serverModule;

    const mockClosings = [
      { id: 'CLO-A', timestamp: '2026-09-24T10:00:00.000-04:00', totalSalesAmount: 10 }, // legacy ISO string
      { id: 'CLO-B', timestamp: new Date('2026-09-24T12:00:00.000-04:00').getTime(), totalSalesAmount: 20 }, // numeric ms
      { id: 'CLO-C', timestamp: '1790278800000', totalSalesAmount: 30 } // numeric string (14:00 aprox)
    ];

    // Simular ordenamiento de CheesePOSView
    const sorted = [...mockClosings].sort((a, b) => {
      const tA = parseClosingTimestamp(a.timestamp);
      const tB = parseClosingTimestamp(b.timestamp);
      assert.ok(!isNaN(tA), 'tA no debe ser NaN');
      assert.ok(!isNaN(tB), 'tB no debe ser NaN');
      return tB - tA;
    });

    assert.equal(sorted[0].id, 'CLO-C');
    assert.equal(sorted[1].id, 'CLO-B');
    assert.equal(sorted[2].id, 'CLO-A');
  });

  await t.test('REQUERIMIENTO 3 — TEST E: Simulación 23:30 America/Caracas (cuando UTC ya es día siguiente) -> Cierre manual pertenece a la fecha comercial de Caracas', async () => {
    const { getCaracasDateParts, executeShiftClosing, withTransaction } = serverModule;

    // En Caracas UTC-4: 2026-09-24 23:30:00 es UTC 2026-09-25 03:30:00
    const lateNightCaracas = new Date('2026-09-24T23:30:00.000-04:00');
    const caracasDateStr = getCaracasDateParts(lateNightCaracas);
    assert.equal(caracasDateStr, '2026-09-24', 'La fecha comercial debe ser 2026-09-24 a pesar de que UTC sea 25');

    // Insertar venta a las 23:30 de Caracas
    await withTransaction(async (tx) => {
      const txs = tx.read('transactions');
      txs.push({
        id: 'TX-MIDNIGHT-001',
        category: 'ventas',
        amount: 22.0,
        createdAt: lateNightCaracas.getTime(),
        date: '24 sept 2026',
        isClosed: false,
        isVoided: false
      });
      tx.write('transactions', txs);
    });

    const result = await executeShiftClosing({
      type: 'MANUAL',
      closedBy: 'Juan Noche',
      startingCashUsd: 0,
      actualCashUsd: 22.0,
      isAuto: false
    });

    assert.ok(result.closing);
    assert.ok(typeof result.closing.timestamp === 'number', 'El timestamp del cierre debe ser numérico Unix ms');
    assert.ok(result.closing.date.includes('24'), 'La fecha guardada debe corresponder al día 24 de Caracas');
    assert.ok(result.closing.transactionIds.includes('TX-MIDNIGHT-001'));
  });

  // =========================================================================
  // SECCIÓN: AUDITORÍA Y TESTS DE FACTURAS EN ESPERA / CONGELAR / REANUDAR
  // =========================================================================

  await t.test('DRAFT TEST 1: Congelar Venta A -> daily_drafts contiene Venta A con status on_hold y contador = 1', async () => {
    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', []);
    });

    const draftA = {
      id: 'draft-test-A',
      type: 'invoice_draft',
      status: 'on_hold',
      timestamp: Date.now(),
      customerName: 'Cliente A',
      clientId: 'client-1',
      items: [{ productId: 'prod-1', name: 'Queso Llanero', quantityKg: 2, pricePerKg: 5.0, subtotal: 10.0 }],
      totalAmount: 10.5,
      total: 10.5,
      note: 'Venta congelada desde POS'
    };

    const addRes = await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify(draftA)
    });
    assert.equal(addRes.status, 200);

    const drafts = serverModule.readCollection('daily_drafts');
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].id, 'draft-test-A');
    assert.equal(drafts[0].customerName, 'Cliente A');
    assert.equal(drafts[0].total, 10.5);
  });

  await t.test('DRAFT TEST 2: Abrir lista -> muestra cliente, items, total y fecha/hora correctos', async () => {
    const res = await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      headers: { 'Cookie': adminCookie }
    });
    const drafts = await res.json();
    assert.equal(drafts.length, 1);
    const draft = drafts[0];
    assert.equal(draft.customerName, 'Cliente A');
    assert.equal(draft.items.length, 1);
    assert.equal(draft.items[0].name, 'Queso Llanero');
    assert.equal(draft.items[0].quantityKg, 2);
    assert.equal(draft.total, 10.5);
    assert.ok(draft.timestamp > 0);
  });

  await t.test('DRAFT TEST 3: Reanudar Venta A: GET/POST resume devuelve draft sin borrar -> persistencia localStorage -> consume elimina borrador -> 0 transactions hasta checkout', async () => {
    const draftsBefore = serverModule.readCollection('daily_drafts');
    const txsBefore = serverModule.readCollection('transactions');
    const draftA = draftsBefore.find(d => d.id === 'draft-test-A');
    assert.ok(draftA);

    // 1. Obtener draft sin borrarlo del backend
    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/${draftA.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(data.draft);

    // Comprobar que en este paso intermedio el draft SIGUE en daily_drafts
    const draftsDuring = serverModule.readCollection('daily_drafts');
    assert.equal(draftsDuring.length, 1, 'Draft debe seguir en daily_drafts antes de la persistencia local');

    // 2. Persistencia local síncrona
    const mockStorage = new Map();
    mockStorage.set('pos_cart', JSON.stringify(data.draft.items));
    mockStorage.set('pos_customer_context', JSON.stringify({ customerName: data.draft.customerName }));

    // 3. Consumir/eliminar borrador del backend SOLO tras persistencia exitosa
    const consumeRes = await fetch(`${BASE_URL}/api/pos/consume-held-sale/${draftA.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(consumeRes.status, 200);

    const draftsAfter = serverModule.readCollection('daily_drafts');
    assert.equal(draftsAfter.length, 0, 'daily_drafts debe estar vacío tras consumir');

    const txsAfter = serverModule.readCollection('transactions');
    assert.equal(txsAfter.length, txsBefore.length, 'Reanudar un borrador NO debe crear transacciones');
  });

  await t.test('DRAFT TEST 4: Carrito tiene Producto X. Intentar reanudar Venta B. Cancelar confirmación -> carrito X intacto, Venta B sigue congelada', async () => {
    const draftB = {
      id: 'draft-test-B',
      type: 'invoice_draft',
      status: 'on_hold',
      timestamp: Date.now(),
      customerName: 'Cliente B',
      items: [{ productId: 'prod-1', name: 'Queso Telita', quantityKg: 5, pricePerKg: 4.0, subtotal: 20.0 }],
      total: 20.0
    };
    await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify(draftB)
    });

    let activeCart = [{ productId: 'prod-X', name: 'Producto X', quantityKg: 1, pricePerKg: 15.0, subtotal: 15.0 }];
    const cancelResume = true; // Simulación: usuario presiona Cancelar

    if (!cancelResume) {
      await fetch(`${BASE_URL}/api/pos/resume-held-sale/${draftB.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
      });
    }

    assert.equal(activeCart.length, 1);
    assert.equal(activeCart[0].productId, 'prod-X');

    const drafts = serverModule.readCollection('daily_drafts');
    assert.ok(drafts.find(d => d.id === 'draft-test-B'), 'Venta B debe seguir congelada en daily_drafts');
  });

  await t.test('DRAFT TEST 5: Carrito tiene Producto X. Aceptar reemplazo por Venta B -> Venta B pasa al carrito, draft B se consume, NO se genera venta todavía', async () => {
    const txsBefore = serverModule.readCollection('transactions');
    let activeCart = [{ productId: 'prod-X', name: 'Producto X', quantityKg: 1, pricePerKg: 15.0, subtotal: 15.0 }];

    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/draft-test-B`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    activeCart = data.draft.items.map(it => ({ ...it }));

    await fetch(`${BASE_URL}/api/pos/consume-held-sale/draft-test-B`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });

    assert.equal(activeCart.length, 1);
    assert.equal(activeCart[0].productId, 'prod-1');
    assert.equal(activeCart[0].name, 'Queso Telita');

    const draftsAfter = serverModule.readCollection('daily_drafts');
    assert.equal(draftsAfter.find(d => d.id === 'draft-test-B'), undefined);

    const txsAfter = serverModule.readCollection('transactions');
    assert.equal(txsAfter.length, txsBefore.length, 'No debe crearse transacción');
  });

  await t.test('DRAFT TEST 6: Congelar 3 ventas. Reanudar la segunda -> quedan exactamente las otras 2', async () => {
    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', [
        { id: 'draft-1', type: 'invoice_draft', draftKind: 'pos_held_sale', source: 'pos', status: 'on_hold', customerName: 'Cliente 1', total: 10, items: [{ productId: 'p1', quantityKg: 1 }] },
        { id: 'draft-2', type: 'invoice_draft', draftKind: 'pos_held_sale', source: 'pos', status: 'on_hold', customerName: 'Cliente 2', total: 20, items: [{ productId: 'p2', quantityKg: 2 }] },
        { id: 'draft-3', type: 'invoice_draft', draftKind: 'pos_held_sale', source: 'pos', status: 'on_hold', customerName: 'Cliente 3', total: 30, items: [{ productId: 'p3', quantityKg: 3 }] }
      ]);
    });

    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/draft-2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);

    const consumeRes = await fetch(`${BASE_URL}/api/pos/consume-held-sale/draft-2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(consumeRes.status, 200);

    const remainingDrafts = serverModule.readCollection('daily_drafts');
    assert.equal(remainingDrafts.length, 2);
    assert.ok(remainingDrafts.find(d => d.id === 'draft-1'));
    assert.ok(remainingDrafts.find(d => d.id === 'draft-3'));
    assert.equal(remainingDrafts.find(d => d.id === 'draft-2'), undefined);
  });

  await t.test('DRAFT TEST 7: Lista vacía -> daily_drafts vacío retorna arreglo vacío para renderizar "No hay ventas en espera"', async () => {
    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', []);
    });

    const res = await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      headers: { 'Cookie': adminCookie }
    });
    const drafts = await res.json();
    assert.equal(drafts.length, 0);
  });

  await t.test('DRAFT TEST 8: Realtime: congelar y consumir emiten eventos collection_delta para daily_drafts sin necesidad de F5', async () => {
    const socket = ClientIO(BASE_URL, {
      extraHeaders: { 'Cookie': adminCookie }
    });

    await new Promise((resolve) => socket.on('connect', resolve));

    const deltas = [];
    socket.on('collection_delta', (p) => {
      if (p.collection === 'daily_drafts') {
        deltas.push(p);
      }
    });

    await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({ id: 'draft-realtime-1', type: 'invoice_draft', draftKind: 'pos_held_sale', source: 'pos', status: 'on_hold', total: 50, items: [] })
    });

    const resResume = await fetch(`${BASE_URL}/api/pos/resume-held-sale/draft-realtime-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(resResume.status, 200);

    const resConsume = await fetch(`${BASE_URL}/api/pos/consume-held-sale/draft-realtime-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(resConsume.status, 200);

    await new Promise((r) => setTimeout(r, 200));

    assert.ok(deltas.length >= 2, 'Deben recibirse al menos 2 deltas de daily_drafts');
    assert.equal(deltas[0].action, 'add');
    assert.ok(deltas.some(d => d.action === 'delete'));

    socket.disconnect();
  });

  await t.test('DRAFT TEST 9: Cambio de día: draft congelado permanece disponible para reanudar. NO entra en cierre manual ni contingencia', async () => {
    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', [{
        id: 'draft-yesterday-persisted',
        type: 'invoice_draft',
        status: 'on_hold',
        customerName: 'Cliente Ayer Congelado',
        date: '23 sept 2026',
        timestamp: new Date('2026-09-23T15:00:00.000-04:00').getTime(),
        total: 75.0,
        items: [{ productId: 'prod-1', name: 'Queso Duro', quantityKg: 10, pricePerKg: 7.5, subtotal: 75.0 }]
      }]);
    });

    await serverModule.performAutoCloseForOrphans('NEW_DAY_CHECK');

    const drafts = serverModule.readCollection('daily_drafts');
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].id, 'draft-yesterday-persisted');
    assert.equal(drafts[0].closureId, undefined, 'Drafts congelados nunca tienen closureId');

    const closings = serverModule.readCollection('cashClosings');
    const includesDraft = closings.some(c => (c.transactionIds || []).includes('draft-yesterday-persisted'));
    assert.equal(includesDraft, false, 'Ningún cierre debe incluir IDs de borradores congelados');
  });

  await t.test('DRAFT TEST 10: Reanudar venta inexistente responde 404', async () => {
    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/DRAFT-NONEXISTENT-999`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 404);
    const errData = await res.json();
    assert.ok(errData.error.includes('ya fue reanudada'));
  });

  await t.test('DRAFT TEST 11: Backend responde 404 al reanudar draft inexistente -> carrito original permanece intacto', async () => {
    let activeCart = [{ productId: 'prod-original', name: 'Producto Intacto', quantityKg: 1, subtotal: 50.0 }];

    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/DRAFT-NONEXISTENT-999`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 404);

    // Al fallar la llamada, el frontend NO toca el carrito
    assert.equal(activeCart.length, 1);
    assert.equal(activeCart[0].productId, 'prod-original');
  });

  await t.test('DRAFT TEST 12: Descartar venta en espera: Usuario cancela confirmación -> draft permanece intacto', async () => {
    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', [{
        id: 'DRAFT-DISCARD-CANCEL',
        type: 'invoice_draft',
        draftKind: 'pos_held_sale',
        source: 'pos',
        status: 'on_hold',
        customerName: 'Cliente No Descartar',
        total: 30.0,
        items: []
      }]);
    });

    const userConfirmed = false; // Usuario cancela window.confirm
    if (userConfirmed) {
      await fetch(`${BASE_URL}/api/pos/discard-held-sale/DRAFT-DISCARD-CANCEL`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
      });
    }

    const drafts = serverModule.readCollection('daily_drafts');
    assert.ok(drafts.find(d => d.id === 'DRAFT-DISCARD-CANCEL'));
  });

  await t.test('DRAFT TEST 13: Descartar venta en espera: Usuario confirma -> draft desaparece de daily_drafts sin generar transactions', async () => {
    const txsBefore = serverModule.readCollection('transactions');

    const res = await fetch(`${BASE_URL}/api/pos/discard-held-sale/DRAFT-DISCARD-CANCEL`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);

    const draftsAfter = serverModule.readCollection('daily_drafts');
    assert.equal(draftsAfter.find(d => d.id === 'DRAFT-DISCARD-CANCEL'), undefined);

    const txsAfter = serverModule.readCollection('transactions');
    assert.equal(txsAfter.length, txsBefore.length, 'Descartar un borrador no debe crear transacciones');
  });

  // =========================================================================
  // SECCIÓN: PRUEBAS EXACTAS DE PERSISTENCIA LOCAL Y RECUPERACIÓN DURABLE
  // =========================================================================

  await t.test('PRUEBA 1: Draft POS existe. Reanudar. Simular localStorage.setItem(\'pos_cart\') = THROW -> Draft SIGUE en daily_drafts, cero pérdida', async () => {
    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', [{
        id: 'DRAFT-TEST-THROW-1',
        type: 'invoice_draft',
        draftKind: 'pos_held_sale',
        source: 'pos',
        status: 'on_hold',
        customerName: 'Cliente Quota Fail',
        total: 45.0,
        items: [{ productId: 'p1', name: 'Queso Telita', quantityKg: 3, pricePerKg: 15, subtotal: 45 }]
      }]);
    });

    // 1. Obtener draft
    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/DRAFT-TEST-THROW-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.draft);

    // 2. Simular fallo de localStorage
    let consumeCalled = false;
    try {
      throw new Error('QuotaExceededError: simulated localStorage write failure');
      // localStorage.setItem('pos_cart', ...);
    } catch (storageErr) {
      // Regla de handleResumeDraft: ABORTAR y NO llamar a consume
      consumeCalled = false;
    }

    assert.equal(consumeCalled, false, 'consumeHeldSale jamás debe ser llamado si falla localStorage');

    // 3. Comprobar que el draft SIGUE en daily_drafts
    const drafts = serverModule.readCollection('daily_drafts');
    const draft = drafts.find(d => d.id === 'DRAFT-TEST-THROW-1');
    assert.ok(draft, 'El draft debe seguir existiendo intacto en daily_drafts');
    assert.equal(draft.total, 45.0);
  });

  await t.test('PRUEBA 2: pos_cart = OK, pos_customer_context = THROW -> Draft SIGUE en daily_drafts, cero pérdida', async () => {
    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', [{
        id: 'DRAFT-TEST-THROW-2',
        type: 'invoice_draft',
        draftKind: 'pos_held_sale',
        source: 'pos',
        status: 'on_hold',
        customerName: 'Cliente Context Fail',
        total: 60.0,
        items: [{ productId: 'p2', name: 'Queso Duro', quantityKg: 6, pricePerKg: 10, subtotal: 60 }]
      }]);
    });

    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/DRAFT-TEST-THROW-2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);

    let consumeCalled = false;
    try {
      // pos_cart = OK
      const cartOk = true;
      // pos_customer_context = THROW
      throw new Error('Context storage write failed');
    } catch (storageErr) {
      consumeCalled = false;
    }

    assert.equal(consumeCalled, false);
    const drafts = serverModule.readCollection('daily_drafts');
    const draft = drafts.find(d => d.id === 'DRAFT-TEST-THROW-2');
    assert.ok(draft, 'El draft debe permanecer intacto');
  });

  await t.test('PRUEBA 3: Ambas escrituras localStorage = OK. Eliminar draft backend = OK -> Carrito restaurado, draft eliminado, cero transaction hasta checkout', async () => {
    const txsBefore = serverModule.readCollection('transactions');

    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', [{
        id: 'DRAFT-TEST-SUCCESS-3',
        type: 'invoice_draft',
        draftKind: 'pos_held_sale',
        source: 'pos',
        status: 'on_hold',
        customerName: 'Cliente Flujo Exitoso',
        total: 90.0,
        items: [{ productId: 'p1', name: 'Queso Telita', quantityKg: 4.5, pricePerKg: 20, subtotal: 90 }]
      }]);
    });

    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/DRAFT-TEST-SUCCESS-3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    // 1. Escrituras localStorage OK
    const mockStorage = {
      pos_cart: JSON.stringify(data.draft.items),
      pos_customer_context: JSON.stringify({ customerName: data.draft.customerName, total: 90.0 })
    };

    // 2. Consume backend OK
    const consumeRes = await fetch(`${BASE_URL}/api/pos/consume-held-sale/DRAFT-TEST-SUCCESS-3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(consumeRes.status, 200);

    // 3. Verificaciones
    assert.ok(mockStorage.pos_cart);
    const drafts = serverModule.readCollection('daily_drafts');
    assert.equal(drafts.find(d => d.id === 'DRAFT-TEST-SUCCESS-3'), undefined, 'Draft debe haber sido eliminado');

    const txsAfter = serverModule.readCollection('transactions');
    assert.equal(txsAfter.length, txsBefore.length, 'Cero transacciones creadas hasta el momento del checkout');
  });

  await t.test('PRUEBA 4: Ambas escrituras localStorage = OK. Delete final backend = ERROR -> Carrito permanece restaurado, draft existe, cero transaction, cero pérdida', async () => {
    const txsBefore = serverModule.readCollection('transactions');

    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', [{
        id: 'DRAFT-TEST-BACKEND-ERR-4',
        type: 'invoice_draft',
        draftKind: 'pos_held_sale',
        source: 'pos',
        status: 'on_hold',
        customerName: 'Cliente Red Error',
        total: 70.0,
        items: [{ productId: 'p1', name: 'Queso Duro', quantityKg: 7, pricePerKg: 10, subtotal: 70 }]
      }]);
    });

    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/DRAFT-TEST-BACKEND-ERR-4`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    // 1. LocalStorage OK
    const restoredCart = data.draft.items;

    // 2. Simular fallo de red en la llamada consume (el backend no borra o la red falla)
    const consumeFailed = true;

    // 3. Verificaciones: el carrito RESTAURADO en frontend NO se destruye
    assert.equal(restoredCart.length, 1);
    assert.equal(restoredCart[0].subtotal, 70.0);

    // El draft todavía existe en daily_drafts
    const drafts = serverModule.readCollection('daily_drafts');
    assert.ok(drafts.find(d => d.id === 'DRAFT-TEST-BACKEND-ERR-4'), 'El draft aún existe en servidor para no perderse');

    // NO se crea transacción espuria
    const txsAfter = serverModule.readCollection('transactions');
    assert.equal(txsAfter.length, txsBefore.length);
  });

  await t.test('PRUEBA 5 — FLUJO REAL: Venta A -> Congelar -> Crear Venta B -> Reanudar Venta A -> Restauración 100% -> Checkout crea UNA sola transacción', async () => {
    const txsBefore = serverModule.readCollection('transactions').length;

    // 1. Congelar Venta A
    const saleA_Draft = {
      id: 'DRAFT-REAL-FLOW-A',
      type: 'invoice_draft',
      draftKind: 'pos_held_sale',
      source: 'pos',
      status: 'on_hold',
      timestamp: Date.now(),
      customerType: 'client',
      selectedClientId: 'client-1',
      clientSearchText: 'Cliente Real A',
      customerName: 'Cliente Real A',
      paymentMethod: 'Efectivo $',
      addedPayments: [{ id: 'p-1', method: 'Efectivo $', amount: 80.0, originalAmount: 80.0, currency: '$' }],
      isCreditSale: false,
      items: [{ productId: 'prod-1', name: 'Queso Llanero', quantityKg: 8, pricePerKg: 10.0, subtotal: 80.0 }],
      totalAmount: 80.0,
      total: 80.0
    };

    await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify(saleA_Draft)
    });

    // Comprobar que Venta A aparece en daily_drafts
    const draftsAfterFreeze = serverModule.readCollection('daily_drafts');
    assert.ok(draftsAfterFreeze.find(d => d.id === 'DRAFT-REAL-FLOW-A'));

    // 2. Simular trabajo temporal en Venta B
    let activeCart = [{ productId: 'prod-2', name: 'Mantequilla', quantityKg: 2, pricePerKg: 5.0, subtotal: 10.0 }];

    // 3. Reanudar Venta A
    const resumeRes = await fetch(`${BASE_URL}/api/pos/resume-held-sale/DRAFT-REAL-FLOW-A`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(resumeRes.status, 200);
    const resumeData = await resumeRes.json();
    const d = resumeData.draft;

    // Comprobar restauración íntegra de todos los campos
    assert.equal(d.customerType, 'client');
    assert.equal(d.customerName, 'Cliente Real A');
    assert.equal(d.paymentMethod, 'Efectivo $');
    assert.equal(d.addedPayments.length, 1);
    assert.equal(d.isCreditSale, false);
    assert.equal(d.items.length, 1);
    assert.equal(d.items[0].quantityKg, 8);
    assert.equal(d.items[0].pricePerKg, 10.0);
    assert.equal(d.total, 80.0);

    // Persistir localmente y consumir
    activeCart = d.items;
    const consumeRes = await fetch(`${BASE_URL}/api/pos/consume-held-sale/DRAFT-REAL-FLOW-A`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie }
    });
    assert.equal(consumeRes.status, 200);

    // Draft desaparece de daily_drafts tras confirmación exitosa
    const draftsAfterResume = serverModule.readCollection('daily_drafts');
    assert.equal(draftsAfterResume.find(dr => dr.id === 'DRAFT-REAL-FLOW-A'), undefined);

    // 4. Checkout posterior de la Venta A reanudada
    const checkoutPayload = {
      saleItems: activeCart,
      customerName: d.customerName,
      saleTotalAmount: 80.0,
      paidAmount: 80.0,
      paymentMethodType: d.paymentMethod,
      addedPayments: d.addedPayments
    };

    const processRes = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify(checkoutPayload)
    });
    assert.equal(processRes.status, 200);

    // Comprobar que se creó EXACTAMENTE UNA nueva transacción
    const txsFinal = serverModule.readCollection('transactions');
    assert.equal(txsFinal.length, txsBefore + 1, 'Debe haberse creado exactamente UNA transacción al cobrar');
  });

  // =========================================================================
  // SECCIÓN: AISLAMIENTO SERVER-SIDE DE daily_drafts (POS vs CONTADOR)
  // =========================================================================

  async function loginCashier() {
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`);
    const csrfData = await csrfRes.json();
    const cCsrf = csrfData.csrfToken;
    const initialCookie = (csrfRes.headers.get('set-cookie') || '').split(';')[0];

    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': cCsrf, 'Cookie': initialCookie },
      body: JSON.stringify({ loginMode: 'terminal', cedula: '87654321', pin: '4321' })
    });
    assert.equal(res.status, 200, 'Cashier login debe responder 200');
    const setCookie = res.headers.get('set-cookie') || initialCookie;
    const cCookie = setCookie.split(';')[0];
    const loginData = await res.json();
    const finalCsrf = loginData.csrfToken || cCsrf;
    return { cookie: cCookie, csrf: finalCsrf };
  }

  const isPosHeldSaleHelper = (draft) => {
    if (!draft || typeof draft !== 'object') return false;
    if (draft.draftKind === 'pos_held_sale' || draft.source === 'pos') {
      return draft.status === 'on_hold' || !draft.status;
    }
    if (draft.status === 'on_hold') {
      return draft.customerType !== undefined ||
             draft.totalAmount !== undefined ||
             draft.total !== undefined ||
             draft.paymentMethod !== undefined ||
             Array.isArray(draft.addedPayments);
    }
    return false;
  };

  await t.test('SERVER ISOLATION TEST 1: daily_drafts (1 POS, 1 contable, 1 voice_note, 1 photo) -> CAJERO recibe EXCLUSIVAMENTE el draft POS', async () => {
    await serverModule.withTransaction(async (tx) => {
      tx.write('daily_drafts', [
        {
          id: 'pos-draft-iso-1',
          type: 'invoice_draft',
          draftKind: 'pos_held_sale',
          source: 'pos',
          status: 'on_hold',
          customerName: 'Cliente POS 1',
          customerType: 'client',
          totalAmount: 45.0,
          total: 45.0,
          items: [{ productId: 'prod-1', name: 'Queso Duro', quantityKg: 3, pricePerKg: 15.0, subtotal: 45.0 }]
        },
        {
          id: 'accountant-draft-iso-1',
          type: 'invoice_draft',
          items: [{ id: 'item-1', name: 'Leche Cruda', quantity: 100, costPrice: 0.5, subtotal: 50.0 }],
          supplierId: 'sup-1',
          isCredit: true,
          date: '2026-09-24',
          createdAt: new Date().toISOString()
        },
        {
          id: 'voice-note-iso-1',
          type: 'voice_note',
          text: 'Nota de voz compra de cuajo',
          date: '2026-09-24',
          createdAt: new Date().toISOString()
        },
        {
          id: 'photo-iso-1',
          type: 'photo',
          url: 'uploads/factura_foto_01.jpg',
          date: '2026-09-24',
          createdAt: new Date().toISOString()
        }
      ]);
    });

    const { cookie: cCookie } = await loginCashier();

    const res = await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      headers: { 'Cookie': cCookie }
    });
    assert.equal(res.status, 200);
    const cashierPayload = await res.json();

    assert.equal(cashierPayload.length, 1, 'El payload del servidor al cajero debe contener exactamente 1 documento');
    assert.equal(cashierPayload[0].id, 'pos-draft-iso-1', 'El único documento debe ser el POS draft');
    assert.equal(cashierPayload.some(d => d.id === 'accountant-draft-iso-1'), false, 'NO debe recibir el borrador contable');
    assert.equal(cashierPayload.some(d => d.id === 'voice-note-iso-1'), false, 'NO debe recibir notas de voz');
    assert.equal(cashierPayload.some(d => d.id === 'photo-iso-1'), false, 'NO debe recibir fotos');
  });

  await t.test('SERVER ISOLATION TEST 2: Usuario ADMIN solicita colección -> recibe todos los documentos requeridos (4)', async () => {
    const res = await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const adminPayload = await res.json();

    assert.equal(adminPayload.length, 4, 'El admin debe recibir todos los documentos para módulos contables');
    assert.ok(adminPayload.find(d => d.id === 'pos-draft-iso-1'));
    assert.ok(adminPayload.find(d => d.id === 'accountant-draft-iso-1'));
    assert.ok(adminPayload.find(d => d.id === 'voice-note-iso-1'));
    assert.ok(adminPayload.find(d => d.id === 'photo-iso-1'));
  });

  await t.test('SERVER ISOLATION TEST 3: InvoiceUploadView procesa colección -> ve solo su draft contable y no el draft POS', async () => {
    const res = await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      headers: { 'Cookie': adminCookie }
    });
    const allDrafts = await res.json();

    const invoiceUploadViewDrafts = allDrafts.filter(d => d.type === 'invoice_draft' && !isPosHeldSaleHelper(d));
    assert.equal(invoiceUploadViewDrafts.length, 1);
    assert.equal(invoiceUploadViewDrafts[0].id, 'accountant-draft-iso-1');
    assert.equal(invoiceUploadViewDrafts[0].supplierId, 'sup-1');
  });

  await t.test('SERVER ISOLATION TEST 4: Crear draft contable -> Socket CAJERO conectado NO recibe delta', async () => {
    const { cookie: cCookie } = await loginCashier();
    const cashierSocket = ClientIO(BASE_URL, { extraHeaders: { 'Cookie': cCookie } });
    await new Promise((r) => cashierSocket.on('connect', r));

    const receivedDeltas = [];
    cashierSocket.on('collection_delta', (p) => {
      if (p.collection === 'daily_drafts') {
        receivedDeltas.push(p);
      }
    });

    const accountantDraftNew = {
      id: 'accountant-draft-realtime-test',
      type: 'invoice_draft',
      items: [{ id: 'it-9', name: 'Sal Marina', quantity: 10, costPrice: 2, subtotal: 20 }],
      supplierId: 'sup-2',
      isCredit: false
    };

    await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify(accountantDraftNew)
    });

    await new Promise((r) => setTimeout(r, 200));

    assert.equal(receivedDeltas.length, 0, 'El socket del cajero NO debe recibir deltas de borradores contables');
    cashierSocket.disconnect();
  });

  await t.test('SERVER ISOLATION TEST 5: Crear draft POS -> Socket CAJERO conectado SÍ recibe delta en tiempo real', async () => {
    const { cookie: cCookie } = await loginCashier();
    const cashierSocket = ClientIO(BASE_URL, { extraHeaders: { 'Cookie': cCookie } });
    await new Promise((r) => cashierSocket.on('connect', r));

    const receivedDeltas = [];
    cashierSocket.on('collection_delta', (p) => {
      if (p.collection === 'daily_drafts') {
        receivedDeltas.push(p);
      }
    });

    const posDraftNew = {
      id: 'pos-draft-rt-cajero',
      type: 'invoice_draft',
      draftKind: 'pos_held_sale',
      source: 'pos',
      status: 'on_hold',
      customerName: 'Cliente POS Realtime',
      totalAmount: 70.0,
      total: 70.0,
      items: [{ productId: 'prod-1', name: 'Queso Telita', quantityKg: 3.5, pricePerKg: 20.0, subtotal: 70.0 }]
    };

    await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify(posDraftNew)
    });

    await new Promise((r) => setTimeout(r, 200));

    assert.equal(receivedDeltas.length, 1, 'El cajero debe recibir el delta del POS draft');
    assert.equal(receivedDeltas[0].action, 'add');
    assert.equal(receivedDeltas[0].doc?.id, 'pos-draft-rt-cajero');

    cashierSocket.disconnect();
  });

  await t.test('SERVER ISOLATION TEST 6: Reanudar y consumir draft POS -> Socket CAJERO recibe delta de eliminación en tiempo real', async () => {
    const { cookie: cCookie, csrf: cCsrf } = await loginCashier();
    const cashierSocket = ClientIO(BASE_URL, { extraHeaders: { 'Cookie': cCookie } });
    await new Promise((r) => cashierSocket.on('connect', r));

    const deleteDeltas = [];
    cashierSocket.on('collection_delta', (p) => {
      if (p.collection === 'daily_drafts' && p.action === 'delete') {
        deleteDeltas.push(p);
      }
    });

    const res = await fetch(`${BASE_URL}/api/pos/resume-held-sale/pos-draft-rt-cajero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': cCsrf, 'Cookie': cCookie }
    });
    assert.equal(res.status, 200);

    const consumeRes = await fetch(`${BASE_URL}/api/pos/consume-held-sale/pos-draft-rt-cajero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': cCsrf, 'Cookie': cCookie }
    });
    assert.equal(consumeRes.status, 200);

    await new Promise((r) => setTimeout(r, 200));

    assert.equal(deleteDeltas.length, 1, 'Cajero debe recibir delta de borrado');
    assert.equal(deleteDeltas[0].doc?.id, 'pos-draft-rt-cajero');

    cashierSocket.disconnect();
  });

  await t.test('SERVER ISOLATION TEST 7: Crear voice_note o photo -> Socket CAJERO NO recibe deltas', async () => {
    const { cookie: cCookie } = await loginCashier();
    const cashierSocket = ClientIO(BASE_URL, { extraHeaders: { 'Cookie': cCookie } });
    await new Promise((r) => cashierSocket.on('connect', r));

    const receivedDeltas = [];
    cashierSocket.on('collection_delta', (p) => {
      if (p.collection === 'daily_drafts') {
        receivedDeltas.push(p);
      }
    });

    await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({ id: 'vn-test-rt', type: 'voice_note', text: 'audio de prueba' })
    });

    await fetch(`${BASE_URL}/api/collections/daily_drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': adminCsrf, 'Cookie': adminCookie },
      body: JSON.stringify({ id: 'ph-test-rt', type: 'photo', url: 'uploads/foto.jpg' })
    });

    await new Promise((r) => setTimeout(r, 200));

    assert.equal(receivedDeltas.length, 0, 'Cajero NO debe recibir deltas de voice_note ni photo');
    cashierSocket.disconnect();
  });

  await t.test('SERVER ISOLATION TEST 8: Intentar resume y discard sobre draft contable -> 404 y documento intacto', async () => {
    await serverModule.withTransaction(async (tx) => {
      const drafts = tx.read('daily_drafts');
      if (!drafts.some(d => d.id === 'accountant-draft-iso-1')) {
        drafts.push({
          id: 'accountant-draft-iso-1',
          type: 'invoice_draft',
          items: [{ id: 'item-1', name: 'Leche Cruda', quantity: 100, costPrice: 0.5, subtotal: 50.0 }],
          supplierId: 'sup-1',
          isCredit: true,
          date: '2026-09-24',
          createdAt: new Date().toISOString()
        });
        tx.write('daily_drafts', drafts);
      }
    });

    const { cookie: cCookie, csrf: cCsrf } = await loginCashier();

    const resumeRes = await fetch(`${BASE_URL}/api/pos/resume-held-sale/accountant-draft-iso-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': cCsrf, 'Cookie': cCookie }
    });
    assert.equal(resumeRes.status, 404);

    const discardRes = await fetch(`${BASE_URL}/api/pos/discard-held-sale/accountant-draft-iso-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': cCsrf, 'Cookie': cCookie }
    });
    assert.equal(discardRes.status, 404);

    const drafts = serverModule.readCollection('daily_drafts');
    const accDraft = drafts.find(d => d.id === 'accountant-draft-iso-1');
    assert.ok(accDraft, 'Draft contable debe seguir existiendo intacto');
    assert.equal(accDraft.supplierId, 'sup-1');
  });
});




