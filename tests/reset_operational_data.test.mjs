/**
 * Test Suite de Validación del Script de Reset Operativo
 * KALU CRM Oficial / Sabanota
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { runOperationalReset } from '../scripts/reset-operational-data.mjs';

const tempSandboxDir = path.join(os.tmpdir(), `kalu-test-reset-sandbox-${Date.now()}-${process.pid}`);
const tempMediaDir = path.join(os.tmpdir(), `kalu-test-reset-media-${Date.now()}-${process.pid}`);

const VALID_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('SUITE DE VALIDACIÓN: SCRIPT DE RESET OPERATIVO LOCAL', () => {
  let originalClientCount = 0;
  let originalSupplierCount = 0;
  let originalProductCount = 0;
  let originalAuditLogsCount = 0;
  let originalProductsSnapshot = [];
  let serverInstance = null;
  const TEST_PORT = 3121;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

  before(() => {
    // 1. Preparar sandbox temporal copiando dataset real
    fs.mkdirSync(tempSandboxDir, { recursive: true });
    fs.mkdirSync(path.join(tempMediaDir, 'captures'), { recursive: true });
    fs.mkdirSync(path.join(tempMediaDir, 'pwa_captures'), { recursive: true });

    const sourceDataDir = path.resolve('data-dev');
    for (const file of fs.readdirSync(sourceDataDir)) {
      const src = path.join(sourceDataDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, path.join(tempSandboxDir, file));
      }
    }

    // Sembrar deudas y puntos en clientes para comprobar el reseteo exhaustivo
    const clients = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'clients_db.json'), 'utf8'));
    originalClientCount = clients.length;

    // Cliente 0: Múltiples deudas y puntos
    clients[0].outstandingDebt = 500;
    clients[0].currentDebtUsd = 125;
    clients[0].saldoBs = 10000;
    clients[0].debt = 77;
    clients[0].historicalDebt = 45;
    clients[0].loyaltyPoints = 850;
    clients[0].points = 850;
    clients[0].tier = 'K5';
    clients[0].pinHash = bcrypt.hashSync('123456', 10);
    clients[0].status = 'active';

    // Cliente 1: Deuda en outstandingDebt y saldoBs
    if (clients.length > 1) {
      clients[1].outstandingDebt = 250;
      clients[1].currentDebtUsd = 0;
      clients[1].saldoBs = 3500;
      clients[1].loyaltyPoints = 120;
      clients[1].points = 120;
      clients[1].tier = 'K2';
    }

    // Cliente 2: Deuda en currentDebtUsd
    if (clients.length > 2) {
      clients[2].outstandingDebt = 0;
      clients[2].currentDebtUsd = 90;
      clients[2].saldoBs = 0;
      clients[2].loyaltyPoints = 0;
      clients[2].points = 40;
      clients[2].tier = 'K3';
    }

    fs.writeFileSync(path.join(tempSandboxDir, 'clients_db.json'), JSON.stringify(clients, null, 2), 'utf8');

    // Sembrar deudas en productores para comprobar el reseteo exhaustivo
    const suppliers = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'suppliers_db.json'), 'utf8'));
    originalSupplierCount = suppliers.length;

    // Productor 0: Múltiples saldos
    suppliers[0].balanceUsd = 300;
    suppliers[0].balanceOwed = 900;
    suppliers[0].storeDebt = 530;
    suppliers[0].debt = 44;

    // Productor 1: Solo balanceUsd y storeDebt
    if (suppliers.length > 1) {
      suppliers[1].balanceUsd = 150;
      suppliers[1].balanceOwed = 0;
      suppliers[1].storeDebt = 200;
    }

    fs.writeFileSync(path.join(tempSandboxDir, 'suppliers_db.json'), JSON.stringify(suppliers, null, 2), 'utf8');

    // Sembrar usuario admin conocido para pruebas HTTP
    const users = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'users_db.json'), 'utf8'));
    users.push({
      id: 'usr-admin-reset-test',
      username: 'adminkalu',
      email: 'adminkalu@kalu.com',
      name: 'Admin Kalu Test',
      role: 'admin',
      passwordHash: bcrypt.hashSync('adminpass123', 10),
      pinHash: bcrypt.hashSync('123456', 10),
      active: true
    });
    fs.writeFileSync(path.join(tempSandboxDir, 'users_db.json'), JSON.stringify(users, null, 2), 'utf8');

    const products = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'products_db.json'), 'utf8'));
    originalProductCount = products.length;
    originalProductsSnapshot = JSON.parse(JSON.stringify(products));

    const auditLogs = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'audit_logs_db.json'), 'utf8'));
    originalAuditLogsCount = auditLogs.length;

    // Sembrar comprobantes sintéticos en pwa_captures y captures
    fs.writeFileSync(path.join(tempMediaDir, 'captures', 'dummy_capture_1.png'), 'DUMMY_CAPTURE_BYTES_1');
    fs.writeFileSync(path.join(tempMediaDir, 'pwa_captures', 'dummy_pwa_1.png'), 'DUMMY_PWA_BYTES_1');
  });

  after(async () => {
    if (serverInstance) {
      await new Promise(res => serverInstance.close(res));
    }
  });

  it('1. DRY RUN en sandbox: reporta impacto exacto por cada campo financiero y NO altera ningún archivo', async () => {
    const report = await runOperationalReset({
      dataDir: tempSandboxDir,
      mediaDir: tempMediaDir,
      execute: false
    });

    assert.equal(report.mode, 'DRY_RUN');
    assert.equal(report.summary.masterClientsPreserved, originalClientCount);
    assert.equal(report.summary.masterSuppliersPreserved, originalSupplierCount);
    assert.equal(report.summary.masterProductsPreserved, originalProductCount);
    assert.equal(report.mediaDetails.captures.filesFound, 1);
    assert.equal(report.mediaDetails.pwa_captures.filesFound, 1);
    assert.ok(report.summary.totalRecordsDeleted > 0);

    // Verificar desglose específico por campo
    assert.ok(report.summary.clientFieldDetails.outstandingDebt >= 2, 'Debe detectar al menos 2 clientes con outstandingDebt > 0');
    assert.ok(report.summary.clientFieldDetails.currentDebtUsd >= 2, 'Debe detectar al menos 2 clientes con currentDebtUsd > 0');
    assert.ok(report.summary.clientFieldDetails.saldoBs >= 2, 'Debe detectar al menos 2 clientes con saldoBs > 0');
    assert.ok(report.summary.supplierFieldDetails.balanceUsd >= 2, 'Debe detectar al menos 2 proveedores con balanceUsd > 0');
    assert.ok(report.summary.supplierFieldDetails.balanceOwed >= 1, 'Debe detectar al menos 1 proveedor con balanceOwed > 0');
    assert.ok(report.summary.supplierFieldDetails.storeDebt >= 2, 'Debe detectar al menos 2 proveedores con storeDebt > 0');

    // Verificar que los datos en el sandbox NO cambiaron en absoluto
    const clientsAfterDry = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'clients_db.json'), 'utf8'));
    assert.equal(clientsAfterDry[0].outstandingDebt, 500, 'Dry run no debe modificar outstandingDebt');
    assert.equal(clientsAfterDry[0].currentDebtUsd, 125, 'Dry run no debe modificar currentDebtUsd');
    assert.equal(clientsAfterDry[0].saldoBs, 10000, 'Dry run no debe modificar saldoBs');
    assert.equal(clientsAfterDry[0].debt, 77, 'Dry run no debe modificar debt');
    assert.equal(clientsAfterDry[0].tier, 'K5', 'Dry run no debe modificar tier');

    const suppliersAfterDry = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'suppliers_db.json'), 'utf8'));
    assert.equal(suppliersAfterDry[0].balanceUsd, 300, 'Dry run no debe modificar balanceUsd');
    assert.equal(suppliersAfterDry[0].balanceOwed, 900, 'Dry run no debe modificar balanceOwed');
    assert.equal(suppliersAfterDry[0].storeDebt, 530, 'Dry run no debe modificar storeDebt');
    assert.equal(suppliersAfterDry[0].debt, 44, 'Dry run no debe modificar debt');
  });

  it('2. EXECUTE sin confirmación: aborta con error de seguridad y no modifica nada', async () => {
    await assert.rejects(async () => {
      await runOperationalReset({
        dataDir: tempSandboxDir,
        mediaDir: tempMediaDir,
        execute: true,
        confirmation: 'WRONG_CONFIRMATION'
      });
    }, /ABORTADO/);
  });

  it('3. EXECUTE con confirmación RESET-KALU-OPERATIONS: prueba anti-falso-positivo de campos reales', async () => {
    const report = await runOperationalReset({
      dataDir: tempSandboxDir,
      mediaDir: tempMediaDir,
      execute: true,
      confirmation: 'RESET-KALU-OPERATIONS'
    });

    assert.equal(report.mode, 'EXECUTE');
    assert.ok(report.backupDir && fs.existsSync(report.backupDir), 'Backup debe existir en disco');

    // Verificar manifiesto con desglose de medios
    const manifestPath = path.join(report.backupDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'Manifiesto de backup debe existir');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.mediaBackup.pwa_captures.filesBackedUp, 1);
    assert.equal(manifest.mediaBackup.captures.filesBackedUp, 1);

    // 1. Clientes: verificación exhaustiva anti-falso-positivo de TODOS los campos
    const clientsClean = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'clients_db.json'), 'utf8'));
    assert.equal(clientsClean.length, originalClientCount, 'Total de clientes debe ser idéntico');
    for (const c of clientsClean) {
      assert.equal(c.outstandingDebt, 0, 'outstandingDebt debe ser 0 en todos los clientes');
      assert.equal(c.currentDebtUsd, 0, 'currentDebtUsd debe ser 0 en todos los clientes');
      assert.equal(c.saldoBs, 0, 'saldoBs debe ser 0 en todos los clientes');
      if ('debt' in c) assert.equal(c.debt, 0, 'debt debe ser 0 si existe');
      if ('historicalDebt' in c) assert.equal(c.historicalDebt, 0, 'historicalDebt debe ser 0 si existe');
      if ('balance' in c) assert.equal(c.balance, 0, 'balance debe ser 0 si existe');
      assert.equal(c.loyaltyPoints, 0, 'loyaltyPoints debe ser 0');
      assert.equal(c.points, 0, 'points debe ser 0');
      assert.equal(c.tier, 'K1', 'tier debe ser K1 en todos los clientes');
      assert.ok(c.id && c.name, 'Datos maestros de identidad (id, name) deben estar presentes');
    }

    // 2. Productores: verificación exhaustiva anti-falso-positivo de TODOS los campos
    const suppliersClean = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'suppliers_db.json'), 'utf8'));
    assert.equal(suppliersClean.length, originalSupplierCount, 'Total de proveedores debe ser idéntico');
    for (const s of suppliersClean) {
      assert.equal(s.balanceUsd, 0, 'balanceUsd debe ser 0 en todos los proveedores');
      assert.equal(s.balanceOwed, 0, 'balanceOwed debe ser 0 en todos los proveedores');
      assert.equal(s.storeDebt, 0, 'storeDebt debe ser 0 en todos los proveedores');
      if ('debt' in s) assert.equal(s.debt, 0, 'debt debe ser 0 si existe');
      if ('balance' in s) assert.equal(s.balance, 0, 'balance debe ser 0 si existe');
      assert.ok(s.id && s.name, 'Datos maestros de identidad de productor (id, name) deben estar presentes');
    }

    // 3. Productos y existencias
    const productsClean = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'products_db.json'), 'utf8'));
    assert.equal(productsClean.length, originalProductCount, 'Total de productos debe ser idéntico');
    for (let i = 0; i < productsClean.length; i++) {
      assert.equal(productsClean[i].stockKg, originalProductsSnapshot[i].stockKg, `Stock de ${productsClean[i].name} (idx ${i}) debe mantenerse idéntico`);
    }

    // 4. Colecciones operativas vacías
    const opCollections = [
      'transactions_db.json',
      'installments_db.json',
      'pwa_payments_db.json',
      'bills_db.json',
      'kardex_db.json',
      'sales_db.json',
      'purchases_db.json',
      'expenses_db.json',
      'cashClosings_db.json',
      'adminLedger_db.json',
      'mobileOrders_db.json'
    ];

    for (const col of opCollections) {
      const colData = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, col), 'utf8'));
      assert.equal(colData.length, 0, `Colección ${col} debe tener exactamente 0 registros`);
    }

    // 5. Bóveda en settings
    const settingsClean = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'settings_db.json'), 'utf8'));
    const vault = settingsClean[0].centralVaultBalance;
    assert.deepEqual(vault, { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 }, 'Bóveda central debe quedar en ceros');

    // 6. Audit logs preservados
    const auditLogsAfter = JSON.parse(fs.readFileSync(path.join(tempSandboxDir, 'audit_logs_db.json'), 'utf8'));
    assert.equal(auditLogsAfter.length, originalAuditLogsCount, 'Audit logs se preservan idénticos');

    // 7. Medios limpiados en el directorio operativo
    assert.equal(fs.readdirSync(path.join(tempMediaDir, 'captures')).length, 0, 'captures operativo debe quedar vacío');
    assert.equal(fs.readdirSync(path.join(tempMediaDir, 'pwa_captures')).length, 0, 'pwa_captures operativo debe quedar vacío');
  });

  it('4. BACKEND CON DATASET LIMPIO: Login, ventas y reporte de nuevo pago con comprobante', async () => {
    process.env.KALU_DATA_DIR = tempSandboxDir;
    process.env.KALU_MEDIA_DIR = tempMediaDir;

    const { app, buildTransactionCanonicalPayload, computeTransactionHmac } = await import('../server.js');

    await new Promise((resolve) => {
      serverInstance = http.createServer(app);
      serverInstance.listen(TEST_PORT, '127.0.0.1', resolve);
    });

    // 1. Iniciar sesión como Admin
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'adminkalu@kalu.com',
        password: 'adminpass123'
      })
    });
    const adminCookie = (adminLoginRes.headers.get('set-cookie') || '').split(';')[0];
    const adminBody = await adminLoginRes.json();
    assert.equal(adminLoginRes.status, 200, `Admin debe autenticar correctamente: ${JSON.stringify(adminBody)}`);

    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
      headers: { Cookie: adminCookie }
    });
    const { csrfToken } = await csrfRes.json();

    // 2. Obtener lista de clientes y productos limpios desde la API
    const clientsRes = await fetch(`${BASE_URL}/api/collections/clients`, {
      headers: { Cookie: adminCookie }
    });
    const clientsData = await clientsRes.json();
    assert.equal(clientsData.length, originalClientCount);
    const sampleClient = clientsData[0];
    assert.equal(sampleClient.tier, 'K1', 'Cliente debe reportar tier K1');
    assert.equal(sampleClient.loyaltyPoints, 0, 'Cliente debe reportar 0 puntos');

    const productsRes = await fetch(`${BASE_URL}/api/collections/products`, {
      headers: { Cookie: adminCookie }
    });
    const productsData = await productsRes.json();
    assert.equal(productsData.length, originalProductCount);
    const sampleProduct = productsData[0];
    const initialProductStock = sampleProduct.stockKg;

    // 3. Ejecutar NUEVA venta normal al contado ($20)
    const normalSaleRes = await fetch(`${BASE_URL}/api/pos/process-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        Cookie: adminCookie
      },
      body: JSON.stringify({
        saleItems: [{ productId: sampleProduct.id, quantityKg: 1, subtotal: 20.0, pricePerKg: 20.0 }],
        clientId: sampleClient.id,
        customerName: sampleClient.name,
        paidAmount: 20.0,
        saleTotalAmount: 20.0,
        debtAmount: 0,
        paymentMethodType: 'Efectivo $',
        addedPayments: [{ method: 'Efectivo $', amount: 20.0, originalAmount: 20.0, currency: '$' }]
      })
    });
    assert.equal(normalSaleRes.status, 200, 'Venta normal tras reset debe procesarse exitosamente (200 OK)');

    // 4. Iniciar sesión como Cliente en el Portal
    const clientAuthRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portalType: 'client',
        identifier: sampleClient.phone,
        pin: '123456'
      })
    });
    const clientCookie = (clientAuthRes.headers.get('set-cookie') || '').split(';')[0];
    const clientAuthBody = await clientAuthRes.json();
    assert.equal(clientAuthRes.status, 200, 'Cliente debe poder autenticar en el portal con sus credenciales');

    const clientCsrf = clientAuthBody.csrfToken;

    // 5. Crear NUEVA orden / transacción Mundo Kalu vía API
    const newTxId = `TX-NEW-KALU-${Date.now()}`;
    const nowMs = Date.now();
    const txObj = {
      id: newTxId,
      clientId: sampleClient.id,
      entity: sampleClient.name,
      paymentMethod: 'Mundo Kalu',
      category: 'credito',
      amount: 60.0,
      financedAmount: 60.0,
      installmentsCount: 3,
      createdAt: nowMs,
      timestamp: new Date(nowMs).toISOString(),
      kaluCreditData: { modalidad: '3_cuotas', aFinanciar: 60.0, inicial: 0, cuotas: [20, 20, 20] },
      status: 'pending_approval'
    };

    const pendingTxRes = await fetch(`${BASE_URL}/api/collections/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        Cookie: adminCookie
      },
      body: JSON.stringify(txObj)
    });
    assert.equal(pendingTxRes.status, 200);
    const createdTxRes = await pendingTxRes.json();
    const persistedTx = createdTxRes.doc;
    assert.ok(persistedTx.authNonce, 'El servidor generó authNonce server-side');

    // Calcular firma criptográfica canónica válida
    const canonicalPayload = buildTransactionCanonicalPayload(persistedTx);
    const validSignature = `SIG-v1.${persistedTx.authNonce.slice(-8)}.${computeTransactionHmac(canonicalPayload)}`;

    // 6. Aprobar la transacción Mundo Kalu desde la sesión del cliente en el portal
    const approveKaluRes = await fetch(`${BASE_URL}/api/portal/client/transactions/${newTxId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': clientCsrf,
        Cookie: clientCookie
      },
      body: JSON.stringify({
        clientId: sampleClient.id,
        authNonce: persistedTx.authNonce,
        signature: validSignature
      })
    });
    const approveBody = await approveKaluRes.json().catch(() => ({}));
    assert.equal(approveKaluRes.status, 200, `Aprobación de venta Mundo Kalu por cliente responde 200 OK: ${JSON.stringify(approveBody)}`);

    // 7. Verificar cuotas generadas
    const instRes = await fetch(`${BASE_URL}/api/collections/installments`, {
      headers: { Cookie: adminCookie }
    });
    const instData = await instRes.json();
    assert.equal(instData.length, 3, 'Se generaron exactamente 3 cuotas nuevas para la venta Mundo Kalu');
    const firstInst = instData[0];

    // 8. Reportar NUEVO pago para la primera cuota adjuntando comprobante PNG
    const reportPayRes = await fetch(`${BASE_URL}/api/portal/client/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': clientCsrf,
        Cookie: clientCookie
      },
      body: JSON.stringify({
        amount: 20.0,
        paymentMethod: 'Pago Móvil',
        reference: `REF-RESET-TEST-${Date.now()}`,
        installmentId: firstInst.id,
        receiptImageUrl: VALID_PNG_BASE64
      })
    });
    assert.equal(reportPayRes.status, 200, 'Reporte de pago con comprobante responde 200 OK');
    const reportPayBody = await reportPayRes.json();
    assert.ok(reportPayBody.payment.id);

    // 9. Verificar que el NUEVO comprobante físico se almacenó en captures
    const capturesAfter = fs.readdirSync(path.join(tempMediaDir, 'captures'));
    assert.equal(capturesAfter.length, 1, 'Se almacenó exactamente 1 nuevo comprobante físico tras el reporte de pago');

    // 10. Verificar que el stock del producto disminuyó correctamente desde su valor inicial
    const productsAfterRes = await fetch(`${BASE_URL}/api/collections/products`, {
      headers: { Cookie: adminCookie }
    });
    const productsAfter = await productsAfterRes.json();
    const updatedProduct = productsAfter.find(p => p.id === sampleProduct.id);
    assert.equal(updatedProduct.stockKg, initialProductStock - 1, 'El stock disminuyó exactamente 1 Kg tras la venta normal');
  });
});
