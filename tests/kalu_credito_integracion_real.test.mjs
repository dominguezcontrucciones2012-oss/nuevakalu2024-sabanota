/**
 * Suite de Integración Real Mundo Kalu (Pruebas HTTP Productivas y Motor de Cobranzas)
 * KALU CRM Oficial / Sabanota
 *
 * Cubre:
 * CASO 1: POST pago Cuota 1 referencia ABC123 -> 200 -> crea exactamente un pwa_payment -> Cuota 1 pasa a in_review.
 * CASO 2: Volver a enviar la misma referencia ABC123 para el mismo cliente mientras el primer pago está activo -> HTTP 409 -> no crea segundo pago.
 * CASO 3: Aprobar el pago -> se aplica una sola vez (paidAmount actualizado, status = paid).
 * CASO 4: Intentar nuevamente la misma referencia después de approved -> HTTP 409 -> no crea segundo pago ni duplica abono.
 * CASO 5: Cliente con deuda general distinta a Mundo Kalu ($500 outstandingDebt general, $30 cuotas Mundo Kalu)
 *         -> saldo calculado en Expediente Mundo Kalu proviene ÚNICAMENTE de installments Mundo Kalu ($30)
 *         -> cliente con $500 deuda general y 0 cuotas Mundo Kalu NO entra al expediente Mundo Kalu.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import { buildKaluClientExpedientes } from '../src/utils/kaluCollectionsEngine.ts';
import { buildClientDebtGroups } from '../src/utils/debtGrouping.ts';

// 1. Directorios temporales aislados para DB y medios
const tempDir = path.join(os.tmpdir(), `kalu-test-kredit-real-${Date.now()}-${process.pid}`);
const tempMediaDir = path.join(os.tmpdir(), `kalu-test-kredit-media-${Date.now()}-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(tempMediaDir, { recursive: true });

const devDir = path.resolve('data-dev');
for (const file of fs.readdirSync(devDir)) {
  const src = path.join(devDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(tempDir, file));
  }
}

process.env.KALU_DATA_DIR = tempDir;
process.env.KALU_MEDIA_DIR = tempMediaDir;

const { app, readCollection, writeCollection } = await import('../server.js');

const TEST_PORT = 3118;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Imagen PNG válida sintética de 1x1 píxel
const VALID_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('INTEGRACIÓN REAL: CRÉDITO MUNDO KALU & CENTRO DE COBRANZAS', () => {
  let serverInstance;
  let clientCookie = '';
  let adminCookie = '';
  let createdPaymentId = '';

  let clientCsrf = '';
  let adminCsrf = '';

  const testClientId = 'cli-test-kalu-999';
  const testTransactionId = 'TX-KALU-TEST-999';
  const testInstallmentId = 'INST-KALU-999-1';

  before(async () => {
    // 1. Iniciar servidor HTTP en puerto dedicado
    await new Promise((resolve) => {
      serverInstance = http.createServer(app);
      serverInstance.listen(TEST_PORT, '127.0.0.1', resolve);
    });

    // 2. Sembrar cliente de prueba, compra a crédito y cuota en la DB aislada
    const clients = readCollection('clients');
    clients.push({
      id: testClientId,
      name: 'CLIENTE KALU REAL',
      phone: '584141234567',
      pinHash: bcrypt.hashSync('123456', 10),
      cedula: 'V12345678',
      outstandingDebt: 500, // Deuda general del CRM
      currentDebtUsd: 0,
      loyaltyPoints: 0,
      tier: 'K1',
      status: 'active',
      active: true
    });
    writeCollection('clients', clients);

    const transactions = readCollection('transactions');
    transactions.push({
      id: testTransactionId,
      clientId: testClientId,
      entity: 'CLIENTE KALU REAL',
      category: 'ventas',
      invoiceNumber: 'FAC-KALU-999',
      amount: 40.0,
      downPayment: 10.0,
      financedAmount: 30.0,
      status: 'Aprobado',
      date: new Date().toISOString()
    });
    writeCollection('transactions', transactions);

    const installments = readCollection('installments');
    installments.push({
      id: testInstallmentId,
      clientId: testClientId,
      transactionId: testTransactionId,
      amount: 30.0,
      amountUSD: 30.0,
      paidAmount: 0,
      installmentNumber: 1,
      totalInstallments: 1,
      status: 'pending',
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString()
    });
    writeCollection('installments', installments);

    const adminUser = {
      id: 'usr-admin-kalu-test',
      username: 'adminkalu',
      email: 'adminkalu@kalu.com',
      name: 'Admin Kalu Test',
      role: 'admin',
      passwordHash: bcrypt.hashSync('adminpass123', 10),
      pinHash: bcrypt.hashSync('123456', 10),
      active: true
    };
    const users = readCollection('users') || [];
    users.push(adminUser);
    writeCollection('users', users);

    // 3. Autenticar cliente en el portal
    const clientAuthRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portalType: 'client',
        identifier: '584141234567',
        pin: '123456'
      })
    });
    const clientBody = await clientAuthRes.json().catch(() => ({}));
    assert.equal(clientAuthRes.status, 200, `Client login fallo: ${JSON.stringify(clientBody)}`);
    const rawClientCookie = clientAuthRes.headers.get('set-cookie');
    clientCookie = rawClientCookie.split(';')[0];
    clientCsrf = clientBody.csrfToken || '';

    // 4. Autenticar admin en el CRM
    const adminAuthRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'adminkalu@kalu.com',
        password: 'adminpass123'
      })
    });
    const adminBody = await adminAuthRes.json().catch(() => ({}));
    assert.equal(adminAuthRes.status, 200, `Admin login fallo: ${JSON.stringify(adminBody)}`);
    const rawAdminCookie = adminAuthRes.headers.get('set-cookie');
    adminCookie = rawAdminCookie.split(';')[0];
    adminCsrf = adminBody.csrfToken || '';
  });

  after(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(tempMediaDir, { recursive: true, force: true });
    } catch {}
  });

  it('CASO 1: POST /api/portal/client/payments (Cuota 1, Ref: ABC123) -> HTTP 200, crea un pwa_payment y cuota pasa a in_review', async () => {
    const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': clientCsrf,
        Cookie: clientCookie
      },
      body: JSON.stringify({
        amount: 30.0,
        paymentMethod: 'Pago Móvil',
        reference: 'ABC123',
        installmentId: testInstallmentId,
        receiptImageUrl: VALID_PNG_BASE64
      })
    });

    const body = await res.json();
    assert.equal(res.status, 200, `Debe responder 200 OK: ${JSON.stringify(body)}`);
    assert.equal(body.success, true);
    assert.ok(body.payment?.id);
    createdPaymentId = body.payment.id;

    // Verificar en DB real
    const allPwa = readCollection('pwa_payments');
    const matches = allPwa.filter(p => p.id === createdPaymentId);
    assert.equal(matches.length, 1, 'Debe haberse creado exactamente un documento pwa_payment');
    assert.equal(matches[0].reference, 'ABC123');
    assert.equal(matches[0].status, 'pending');

    const insts = readCollection('installments');
    const targetInst = insts.find(i => i.id === testInstallmentId);
    assert.equal(targetInst.status, 'in_review', 'La cuota en base de datos debe haber pasado a in_review');
  });

  it('CASO 2: Enviar la misma referencia ABC123 para el mismo cliente mientras está activo -> HTTP 409 PAYMENT_REFERENCE_ALREADY_EXISTS', async () => {
    const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': clientCsrf,
        Cookie: clientCookie
      },
      body: JSON.stringify({
        amount: 30.0,
        paymentMethod: 'Pago Móvil',
        reference: 'ABC123', // Misma referencia
        installmentId: testInstallmentId,
        receiptImageUrl: VALID_PNG_BASE64
      })
    });

    const body = await res.json();
    assert.equal(res.status, 409, `Debe rechazar con 409 Conflict por referencia duplicada: ${JSON.stringify(body)}`);
    assert.equal(body.code, 'PAYMENT_REFERENCE_ALREADY_EXISTS');

    // Verificar que NO se creó un segundo documento en pwa_payments
    const allPwa = readCollection('pwa_payments');
    const clientActive = allPwa.filter(p => p.clientId === testClientId && p.reference === 'ABC123');
    assert.equal(clientActive.length, 1, 'Sigue existiendo exactamente un pwa_payment para esa referencia');
  });

  it('CASO 2B: Concurrencia Real (Doble Clic Simultáneo con Promise.all) -> exactamente 1 exitoso (200), 1 rechazado (409)', async () => {
    const concurrentInstallmentId = 'INST-CONCURRENT-1';
    const concurrentTxId = 'TX-CONCURRENT-1';

    // Sembrar cuota limpia para la prueba concurrente
    const installments = readCollection('installments');
    installments.push({
      id: concurrentInstallmentId,
      clientId: testClientId,
      transactionId: concurrentTxId,
      amount: 20.0,
      amountUSD: 20.0,
      paidAmount: 0,
      installmentNumber: 1,
      totalInstallments: 1,
      status: 'pending',
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString()
    });
    writeCollection('installments', installments);

    const makeRequest = () => fetch(`${BASE_URL}/api/portal/client/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': clientCsrf,
        Cookie: clientCookie
      },
      body: JSON.stringify({
        amount: 20.0,
        paymentMethod: 'Pago Móvil',
        reference: 'CONC999',
        installmentId: concurrentInstallmentId,
        receiptImageUrl: VALID_PNG_BASE64
      })
    });

    // Disparar dos peticiones estrictamente simultáneas
    const [resA, resB] = await Promise.all([makeRequest(), makeRequest()]);
    const bodyA = await resA.json().catch(() => ({}));
    const bodyB = await resB.json().catch(() => ({}));

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 409], `Un request debe ser 200 y el otro 409. Obtenido: ${resA.status} y ${resB.status}`);

    const okBody = resA.status === 200 ? bodyA : bodyB;
    const errBody = resA.status === 409 ? bodyA : bodyB;

    assert.equal(okBody.success, true);
    assert.ok(errBody.code === 'PAYMENT_REFERENCE_ALREADY_EXISTS' || errBody.code === 'INSTALLMENT_ALREADY_IN_REVIEW');

    // Comprobación de persistencia física: exactamente 1 pago registrado
    const allPwa = readCollection('pwa_payments');
    const matchingPayments = allPwa.filter(p => p.reference === 'CONC999' && p.clientId === testClientId);
    assert.equal(matchingPayments.length, 1, 'Exactamente UN documento pwa_payment debe existir en base de datos');

    // Comprobación del estado de la cuota: exactamente in_review
    const updatedInsts = readCollection('installments');
    const updatedInst = updatedInsts.find(i => i.id === concurrentInstallmentId);
    assert.equal(updatedInst.status, 'in_review', 'La cuota debe quedar en estado in_review');
    assert.equal(updatedInst.paidAmount, 0, 'paidAmount no debe sufrir incrementos prematuros');
  });

  it('CASO 3: POST /api/pwa-payments/:id/approve -> Aprueba el pago, actualiza cuota a paid ($30)', async () => {
    // Obtener token CSRF de admin
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
      headers: { Cookie: adminCookie }
    });
    const { csrfToken } = await csrfRes.json();

    const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${createdPaymentId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        Cookie: adminCookie
      }
    });

    const body = await approveRes.json();
    assert.equal(approveRes.status, 200, `Aprobación debe ser 200: ${JSON.stringify(body)}`);
    assert.equal(body.success, true);
    assert.equal(body.payment.status, 'approved');

    // Verificar en DB
    const insts = readCollection('installments');
    const targetInst = insts.find(i => i.id === testInstallmentId);
    assert.equal(targetInst.status, 'paid');
    assert.equal(targetInst.paidAmount, 30.0);
  });

  it('CASO 4: Intentar reportar la misma referencia ABC123 después de que fue aprobada -> HTTP 409', async () => {
    const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': clientCsrf,
        Cookie: clientCookie
      },
      body: JSON.stringify({
        amount: 30.0,
        paymentMethod: 'Pago Móvil',
        reference: 'ABC123',
        installmentId: testInstallmentId,
        receiptImageUrl: VALID_PNG_BASE64
      })
    });

    const body = await res.json();
    assert.equal(res.status, 409, 'Debe rechazar con 409 al intentar reutilizar una referencia ya aprobada');
    assert.equal(body.code, 'PAYMENT_REFERENCE_ALREADY_EXISTS');
  });

  it('CASO 5: buildKaluClientExpedientes deriva saldo exclusivamente de cuotas Mundo Kalu sin contaminar con outstandingDebt general', () => {
    const clients = [
      {
        id: 'cli-kalu-only',
        name: 'CLIENTE CON CUOTAS KALU',
        outstandingDebt: 500, // Deuda general del CRM ($500)
        currentDebtUsd: 0,
        loyaltyPoints: 0,
        phone: '111',
        tier: 'K1'
      },
      {
        id: 'cli-general-debt-only',
        name: 'CLIENTE SOLO DEUDA GENERAL',
        outstandingDebt: 850, // Deuda general del CRM ($850)
        currentDebtUsd: 0,
        loyaltyPoints: 0,
        phone: '222',
        tier: 'K1'
      }
    ];

    const installments = [
      {
        id: 'inst-1',
        clientId: 'cli-kalu-only',
        transactionId: 'tx-100',
        amount: 30.0,
        amountUSD: 30.0,
        paidAmount: 0,
        installmentNumber: 1,
        totalInstallments: 1,
        status: 'pending',
        dueDate: '2026-10-15'
      }
    ];

    const transactions = [
      {
        id: 'tx-100',
        clientId: 'cli-kalu-only',
        entity: 'CLIENTE CON CUOTAS KALU',
        category: 'ventas',
        invoiceNumber: 'FAC-100',
        amount: 40.0,
        financedAmount: 30.0,
        status: 'Aprobado',
        date: '2026-09-23'
      }
    ];

    // Ejecución de la función productiva pura
    const expedientes = buildKaluClientExpedientes({
      clients,
      installments,
      transactions,
      payments: []
    });

    // 1. Debe haber exactamente 1 cliente en Expedientes Mundo Kalu (cli-kalu-only)
    assert.equal(expedientes.length, 1, 'Solo clientes con cuotas Mundo Kalu deben entrar a expedientes');
    assert.equal(expedientes[0].client.id, 'cli-kalu-only');

    // 2. El saldo deudor del expediente debe ser exactamente $30 (cuotas restantes), NO $500 (deuda general)
    assert.equal(expedientes[0].totalRemainingDebt, 30.0, 'El saldo restante debe ser $30.00 y no los $500 de deuda general');
    assert.equal(expedientes[0].totalFinancedDebt, 30.0);

    // 3. El cliente con solo deuda general (cli-general-debt-only) NO debe aparecer en Mundo Kalu
    const generalFound = expedientes.find(e => e.client.id === 'cli-general-debt-only');
    assert.equal(generalFound, undefined, 'Cliente con 0 cuotas Mundo Kalu no debe aparecer en Centro de Cobranzas Mundo Kalu');
  });

  it('CASO 6: Aislamiento de Deuda Legacy en Portal Cliente (Casos 1, 2, 3 y 4)', () => {
    const legacyClient = {
      id: 'cli-legacy-user',
      name: 'CLIENTE CON DEUDA CRM',
      outstandingDebt: 500, // Deuda CRM general de $500
      currentDebtUsd: 0
    };

    // Helper puro de cálculo que replica la lógica de PaymentsTab
    const computePortalMundoKaluOverview = ({
      client,
      activeInstallments = [],
      allTransactions = [],
      paymentHistory = []
    }) => {
      const instTxIds = new Set((activeInstallments || []).map(i => String(i.transactionId || i.saleId || '')));
      const fiadoTotalTxs = (allTransactions || []).filter(t => {
        if (!t || t.isVoided) return false;
        const isKalu = t.kaluCreditData?.modalidad === 'fiado_total' ||
                       ((t.paymentMethod === 'Mundo Kalu' || t.creditType === 'kalu') && Number(t.installmentsCount ?? 0) === 0);
        const isApproved = ['approved', 'Aprobado', 'completed', 'Completado'].includes(t.status || '');
        return isKalu && isApproved && !instTxIds.has(String(t.id));
      });

      let totalFiado = 0;
      for (const tx of fiadoTotalTxs) {
        const financed = Number(tx.financedAmount || tx.kaluCreditData?.aFinanciar || tx.amount || 0);
        const approvedPaid = (paymentHistory || [])
          .filter(p => p && p.status === 'approved' && (String(p.transactionId) === String(tx.id) || (!p.installmentId && !p.transactionId)))
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const remaining = Math.max(0, Math.round((financed - approvedPaid) * 100) / 100);
        totalFiado += remaining;
      }
      const kaluOpenDebt = Math.round(totalFiado * 100) / 100;

      const cuotasRemaining = (activeInstallments || []).reduce((acc, inst) => {
        const total = Number(inst.amountUSD ?? inst.amount ?? 0);
        const paid = Number(inst.paidAmount ?? 0);
        return acc + Math.max(0, total - paid);
      }, 0);
      const kaluEffectiveDebt = Math.round((cuotasRemaining + kaluOpenDebt) * 100) / 100;

      // Invocar buildClientDebtGroups directamente
      return buildClientDebtGroups({
        installments: activeInstallments,
        transactions: allTransactions,
        payments: paymentHistory,
        clientDebt: kaluEffectiveDebt
      });
    };

    // Caso 1: outstandingDebt legacy = $500, cero compras Mundo Kalu
    const res1 = computePortalMundoKaluOverview({
      client: legacyClient,
      activeInstallments: [],
      allTransactions: [],
      paymentHistory: []
    });
    assert.equal(res1.totalEffectiveDebt, 0, 'Caso 1: No debe mostrar los $500 como deuda Mundo Kalu');
    assert.equal(res1.hasOpenDebt, false);
    assert.equal(res1.openDebtAmount, 0);

    // Caso 2: outstandingDebt legacy = $500 + venta Mundo Kalu $90 con 3 cuotas ($30 c/u)
    const insts90 = [
      { id: 'i1', transactionId: 'TX-K1', amount: 30, amountUSD: 30, paidAmount: 0, status: 'pending' },
      { id: 'i2', transactionId: 'TX-K1', amount: 30, amountUSD: 30, paidAmount: 0, status: 'pending' },
      { id: 'i3', transactionId: 'TX-K1', amount: 30, amountUSD: 30, paidAmount: 0, status: 'pending' }
    ];
    const txs90 = [
      { id: 'TX-K1', category: 'ventas', paymentMethod: 'Mundo Kalu', amount: 100, financedAmount: 90, status: 'Aprobado' }
    ];
    const res2 = computePortalMundoKaluOverview({
      client: legacyClient,
      activeInstallments: insts90,
      allTransactions: txs90,
      paymentHistory: []
    });
    assert.equal(res2.totalEffectiveDebt, 90, 'Caso 2: Debe mostrar exactamente $90 (y NO $590)');
    assert.equal(res2.totalCuotasRemaining, 90);
    assert.equal(res2.openDebtAmount, 0);

    // Caso 3: Deuda vieja CRM = $500 + operación NUEVA fiado_total Mundo Kalu = $80
    const txsFiado80 = [
      {
        id: 'TX-K-FIADO',
        category: 'ventas',
        paymentMethod: 'Mundo Kalu',
        creditType: 'kalu',
        amount: 80,
        financedAmount: 80,
        kaluCreditData: { modalidad: 'fiado_total', aFinanciar: 80, inicial: 0, cuotas: [] },
        status: 'Aprobado'
      }
    ];
    const res3 = computePortalMundoKaluOverview({
      client: legacyClient,
      activeInstallments: [],
      allTransactions: txsFiado80,
      paymentHistory: []
    });
    assert.equal(res3.totalEffectiveDebt, 80, 'Caso 3: Debe reconocer únicamente los $80 de Mundo Kalu');
    assert.equal(res3.openDebtAmount, 80);
    assert.equal(res3.hasOpenDebt, true);

    // Caso 4: Cliente sin deuda legacy con venta normal Mundo Kalu ($30)
    const cleanClient = { id: 'cli-clean', name: 'CLIENTE LIMPIO', outstandingDebt: 0 };
    const instsClean = [
      { id: 'c1', transactionId: 'TX-CLEAN', amount: 30, amountUSD: 30, paidAmount: 0, status: 'pending' }
    ];
    const res4 = computePortalMundoKaluOverview({
      client: cleanClient,
      activeInstallments: instsClean,
      allTransactions: [{ id: 'TX-CLEAN', category: 'ventas', paymentMethod: 'Mundo Kalu', financedAmount: 30, status: 'Aprobado' }],
      paymentHistory: []
    });
    assert.equal(res4.totalEffectiveDebt, 30, 'Caso 4: Comportamiento normal permanece intacto');
    assert.equal(res4.totalCuotasRemaining, 30);
  });

  describe('FIADO_TOTAL: ASOCIACIÓN EXPLÍCITA POR TRANSACCIÓN (CASOS A - H)', () => {
    const txAId = 'TX-FIADO-A-REAL';
    const txBId = 'TX-FIADO-B-REAL';
    const otherClientId = 'cli-other-client-888';
    const otherTxId = 'TX-OTHER-CLIENT-FIADO';
    const normalTxId = 'TX-NORMAL-NON-KALU';

    let paymentAId = '';
    let paymentBId = '';

    before(() => {
      // Sembrar transacciones de prueba
      const txs = readCollection('transactions');
      txs.push(
        {
          id: txAId,
          clientId: testClientId,
          entity: 'CLIENTE KALU REAL',
          category: 'ventas',
          invoiceNumber: 'FAC-FIADO-A',
          amount: 80.0,
          financedAmount: 80.0,
          status: 'Aprobado',
          paymentMethod: 'Mundo Kalu',
          creditType: 'kalu',
          kaluCreditData: { modalidad: 'fiado_total', aFinanciar: 80.0, inicial: 0, cuotas: [] },
          date: new Date().toISOString()
        },
        {
          id: txBId,
          clientId: testClientId,
          entity: 'CLIENTE KALU REAL',
          category: 'ventas',
          invoiceNumber: 'FAC-FIADO-B',
          amount: 50.0,
          financedAmount: 50.0,
          status: 'Aprobado',
          paymentMethod: 'Mundo Kalu',
          creditType: 'kalu',
          kaluCreditData: { modalidad: 'fiado_total', aFinanciar: 50.0, inicial: 0, cuotas: [] },
          date: new Date().toISOString()
        },
        {
          id: otherTxId,
          clientId: otherClientId,
          entity: 'OTRO CLIENTE',
          category: 'ventas',
          invoiceNumber: 'FAC-OTHER-1',
          amount: 100.0,
          financedAmount: 100.0,
          status: 'Aprobado',
          paymentMethod: 'Mundo Kalu',
          creditType: 'kalu',
          kaluCreditData: { modalidad: 'fiado_total', aFinanciar: 100.0, inicial: 0, cuotas: [] },
          date: new Date().toISOString()
        },
        {
          id: normalTxId,
          clientId: testClientId,
          entity: 'CLIENTE KALU REAL',
          category: 'ventas',
          invoiceNumber: 'FAC-NORMAL-1',
          amount: 45.0,
          financedAmount: 0,
          status: 'Aprobado',
          paymentMethod: 'Efectivo',
          date: new Date().toISOString()
        }
      );
      writeCollection('transactions', txs);

      const clients = readCollection('clients');
      const currentClient = clients.find(c => c.id === testClientId);
      if (currentClient) {
        currentClient.outstandingDebt = 500;
      }
      clients.push({
        id: otherClientId,
        name: 'OTRO CLIENTE',
        phone: '584149999999',
        pinHash: bcrypt.hashSync('123456', 10),
        cedula: 'V99999999',
        outstandingDebt: 0,
        status: 'active',
        active: true
      });
      writeCollection('clients', clients);
    });

    it('CASO A: Deuda inicial Mundo Kalu es $130 (TX-A $80 + TX-B $50) y NO $630 (aísla $500 legacy)', () => {
      const allTxs = readCollection('transactions');
      const clientFiados = allTxs.filter(t =>
        String(t.clientId) === testClientId &&
        t.category === 'ventas' &&
        t.kaluCreditData?.modalidad === 'fiado_total'
      );
      const totalKalu = clientFiados.reduce((sum, t) => sum + Number(t.financedAmount || 0), 0);
      assert.equal(totalKalu, 130.0, 'Debe sumar exactamente $80 + $50 = $130');

      const clients = readCollection('clients');
      const cli = clients.find(c => c.id === testClientId);
      assert.equal(cli.outstandingDebt, 500, 'Deuda legacy permanece intacta en $500 y no se suma a los $130 Mundo Kalu');
    });

    it('CASO B: Reportar $20 a TX-A -> payment.transactionId = TX-A. Tras aprobación: TX-A = $60, TX-B = $50, Total = $110', async () => {
      const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': clientCsrf,
          Cookie: clientCookie
        },
        body: JSON.stringify({
          amount: 20.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-TX-A-20',
          installmentId: null,
          transactionId: txAId,
          receiptImageUrl: VALID_PNG_BASE64
        })
      });

      const body = await res.json();
      assert.equal(res.status, 200, `Debe responder 200 OK: ${JSON.stringify(body)}`);
      assert.equal(body.success, true);
      assert.equal(body.payment.transactionId, txAId);
      assert.equal(body.payment.installmentId, null);
      paymentAId = body.payment.id;

      // Aprobar el pago desde admin
      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${paymentAId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        }
      });
      const approveBody = await approveRes.json();
      assert.equal(approveRes.status, 200, `Aprobación de TX-A debe ser 200: ${JSON.stringify(approveBody)}`);

      // Verificar saldos individuales
      const allPayments = readCollection('pwa_payments');
      const paidA = allPayments
        .filter(p => p.status === 'approved' && String(p.transactionId) === txAId)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const paidB = allPayments
        .filter(p => p.status === 'approved' && String(p.transactionId) === txBId)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const remainingA = 80.0 - paidA;
      const remainingB = 50.0 - paidB;
      const totalRemaining = remainingA + remainingB;

      assert.equal(remainingA, 60.0, 'TX-A restante debe ser $60');
      assert.equal(remainingB, 50.0, 'TX-B restante debe ser $50 (no afectado por pago a TX-A)');
      assert.equal(totalRemaining, 110.0, 'Total Mundo Kalu debe ser $110');
    });

    it('CASO C: Reportar $10 a TX-B -> Tras aprobación: TX-A = $60, TX-B = $40, Total = $100 (Cero cruce entre ventas)', async () => {
      const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': clientCsrf,
          Cookie: clientCookie
        },
        body: JSON.stringify({
          amount: 10.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-TX-B-10',
          installmentId: null,
          transactionId: txBId,
          receiptImageUrl: VALID_PNG_BASE64
        })
      });

      const body = await res.json();
      assert.equal(res.status, 200, `Debe responder 200 OK: ${JSON.stringify(body)}`);
      paymentBId = body.payment.id;

      // Aprobar el pago desde admin
      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${paymentBId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        }
      });
      assert.equal(approveRes.status, 200);

      // Verificar saldos individuales
      const allPayments = readCollection('pwa_payments');
      const paidA = allPayments
        .filter(p => p.status === 'approved' && String(p.transactionId) === txAId)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const paidB = allPayments
        .filter(p => p.status === 'approved' && String(p.transactionId) === txBId)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const remainingA = 80.0 - paidA;
      const remainingB = 50.0 - paidB;
      const totalRemaining = remainingA + remainingB;

      assert.equal(remainingA, 60.0, 'TX-A restante debe mantenerse en $60');
      assert.equal(remainingB, 40.0, 'TX-B restante debe ser $40');
      assert.equal(totalRemaining, 100.0, 'Total Mundo Kalu debe ser $100');
    });

    it('CASO D: Intentar reportar pago con transactionId de OTRO cliente -> HTTP 403, no crea pwa_payment', async () => {
      const pwaBefore = (readCollection('pwa_payments') || []).length;

      const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': clientCsrf,
          Cookie: clientCookie
        },
        body: JSON.stringify({
          amount: 15.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-STEAL-OTHER',
          installmentId: null,
          transactionId: otherTxId, // Pertenece a otherClientId
          receiptImageUrl: VALID_PNG_BASE64
        })
      });

      const body = await res.json();
      assert.equal(res.status, 403, `Debe rechazar con 403 Forbidden: ${JSON.stringify(body)}`);

      const pwaAfter = (readCollection('pwa_payments') || []).length;
      assert.equal(pwaAfter, pwaBefore, 'No debe haberse creado ningún documento pwa_payment');
    });

    it('CASO E: Intentar reportar pago con transactionId de venta que NO es Mundo Kalu fiado_total -> HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': clientCsrf,
          Cookie: clientCookie
        },
        body: JSON.stringify({
          amount: 15.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-INVALID-TYPE',
          installmentId: null,
          transactionId: normalTxId, // Venta al contado ordinaria
          receiptImageUrl: VALID_PNG_BASE64
        })
      });

      const body = await res.json();
      assert.equal(res.status, 400, `Debe rechazar con 400 Bad Request: ${JSON.stringify(body)}`);
    });

    it('CASO F: Doble clic concurrente sobre TX-A con misma referencia -> exactamente 1 exitoso (200) y 1 rechazado (409)', async () => {
      const makeRequest = () => fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': clientCsrf,
          Cookie: clientCookie
        },
        body: JSON.stringify({
          amount: 10.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-CONC-TXA-999',
          installmentId: null,
          transactionId: txAId,
          receiptImageUrl: VALID_PNG_BASE64
        })
      });

      const [res1, res2] = await Promise.all([makeRequest(), makeRequest()]);
      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(statuses, [200, 409], `Un request debe ser 200 y el otro 409. Obtenido: ${res1.status} y ${res2.status}`);

      const allPwa = readCollection('pwa_payments');
      const matches = allPwa.filter(p => p.reference === 'REF-CONC-TXA-999');
      assert.equal(matches.length, 1, 'Exactamente 1 registro persistido');
    });

    it('CASO G: Con pago pendiente en TX-A, intentar crear otro pago para TX-A con OTRA referencia -> HTTP 409 TRANSACTION_PAYMENT_ALREADY_IN_REVIEW', async () => {
      // TX-A ya tiene el pago pendiente de CASO F (REF-CONC-TXA-999)
      const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': clientCsrf,
          Cookie: clientCookie
        },
        body: JSON.stringify({
          amount: 10.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-OTHER-NEW-REF-777', // Referencia nueva y distinta
          installmentId: null,
          transactionId: txAId,
          receiptImageUrl: VALID_PNG_BASE64
        })
      });

      const body = await res.json();
      assert.equal(res.status, 409, `Debe rechazar con 409 por pago en revisión en la misma TX: ${JSON.stringify(body)}`);
      assert.equal(body.code, 'TRANSACTION_PAYMENT_ALREADY_IN_REVIEW');
    });

    it('CASO H: Con pago pendiente en TX-A, reportar pago en TX-B -> HTTP 200 (TX-B es independiente y no se bloquea)', async () => {
      const res = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': clientCsrf,
          Cookie: clientCookie
        },
        body: JSON.stringify({
          amount: 15.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-INDEPENDENT-TXB-555',
          installmentId: null,
          transactionId: txBId,
          receiptImageUrl: VALID_PNG_BASE64
        })
      });

      const body = await res.json();
      assert.equal(res.status, 200, `TX-B debe poder recibir abonos independientemente de TX-A: ${JSON.stringify(body)}`);
      assert.equal(body.success, true);
      assert.equal(body.payment.transactionId, txBId);
    });
  });

  describe('CORRECCIONES ESTRUCTURALES CONFIRMADAS (TESTS 1 - 7)', () => {
    const canonicalFiadoTxId = 'TX-CANONICAL-FIADO-777';
    const canonicalCuotasTxId = 'TX-CANONICAL-CUOTAS-888';
    const legacyClientId = 'cli-legacy-isolated-500';

    let fiadoNonce = '';
    let cuotasNonce = '';

    before(async () => {
      // Sembrar cliente con 500 de deuda legacy y login
      const clients = readCollection('clients');
      clients.push({
        id: legacyClientId,
        name: 'CLIENTE LEGACY 500',
        phone: '584145556677',
        pinHash: bcrypt.hashSync('123456', 10),
        cedula: 'V5556677',
        outstandingDebt: 500, // Deuda legacy de 500
        currentDebtUsd: 0,
        loyaltyPoints: 0,
        tier: 'K1',
        status: 'active',
        active: true
      });
      writeCollection('clients', clients);

      // Generar nonces criptográficos server-side
      fiadoNonce = crypto.randomBytes(32).toString('hex');
      cuotasNonce = crypto.randomBytes(32).toString('hex');

      const txs = readCollection('transactions');
      txs.push(
        // Transacción forma real POS: category 'credito', fiado_total
        {
          id: canonicalFiadoTxId,
          clientId: legacyClientId,
          entity: 'CLIENTE LEGACY 500',
          category: 'credito',
          paymentMethod: 'Mundo Kalu',
          creditType: 'kalu',
          amount: 80.0,
          downPayment: 0,
          financedAmount: 80.0,
          installmentsCount: 0,
          invoiceNumber: 'KALU-CANON-FIADO',
          status: 'pending_approval',
          authNonce: fiadoNonce,
          createdAt: Date.now(),
          kaluCreditData: { modalidad: 'fiado_total', aFinanciar: 80.0, inicial: 0, cuotas: [] }
        },
        // Transacción forma real POS: category 'credito', 3 cuotas
        {
          id: canonicalCuotasTxId,
          clientId: legacyClientId,
          entity: 'CLIENTE LEGACY 500',
          category: 'credito',
          paymentMethod: 'Mundo Kalu',
          creditType: 'kalu',
          amount: 90.0,
          downPayment: 0,
          financedAmount: 90.0,
          installmentsCount: 3,
          invoiceNumber: 'KALU-CANON-CUOTAS',
          status: 'pending_approval',
          authNonce: cuotasNonce,
          createdAt: Date.now(),
          kaluCreditData: { modalidad: '3_cuotas', aFinanciar: 90.0, inicial: 0, cuotas: [30.0, 30.0, 30.0] }
        }
      );
      writeCollection('transactions', txs);
    });

    it('TEST 1 — FORMA REAL DEL POS: category: "credito" fiado_total se aprueba y acepta reporte de abono con su transactionId', async () => {
      // 1. Autenticar cliente legacy
      const authRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'client',
          identifier: '584145556677',
          pin: '123456'
        })
      });
      const authBody = await authRes.json();
      const rawCookie = authRes.headers.get('set-cookie');
      const cookie = rawCookie.split(';')[0];
      const csrf = authBody.csrfToken;

      // 2. Aprobar transacción canonical fiado_total vía endpoint real
      const approveRes = await fetch(`${BASE_URL}/api/portal/client/transactions/${canonicalFiadoTxId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: cookie
        },
        body: JSON.stringify({ authNonce: fiadoNonce })
      });
      const approveBody = await approveRes.json();
      assert.equal(approveRes.status, 200, `Aprobación de TX canonical debe ser 200: ${JSON.stringify(approveBody)}`);
      assert.equal(approveBody.transaction.status, 'approved');

      // 3. Reportar abono de $20 a esta transacción canónica (category: 'credito')
      const payRes = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: cookie
        },
        body: JSON.stringify({
          amount: 20.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-CANONICAL-FIADO-20',
          installmentId: null,
          transactionId: canonicalFiadoTxId,
          receiptImageUrl: VALID_PNG_BASE64
        })
      });
      const payBody = await payRes.json();
      assert.equal(payRes.status, 200, `Debe aceptar abono sobre TX canónica category credito: ${JSON.stringify(payBody)}`);
      assert.equal(payBody.payment.transactionId, canonicalFiadoTxId);
    });

    it('TEST 2 — APROBACIÓN CREA CUOTAS SERVER-SIDE: Transacción 3 cuotas genera exactamente 3 installments en BD al aprobar', async () => {
      // 1. Verificar que antes de approve hay 0 cuotas para canonicalCuotasTxId
      const instsBefore = readCollection('installments').filter(i => String(i.transactionId) === canonicalCuotasTxId);
      assert.equal(instsBefore.length, 0, 'Antes de approve debe haber 0 cuotas');

      // 2. Autenticar cliente legacy
      const authRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'client',
          identifier: '584145556677',
          pin: '123456'
        })
      });
      const authBody = await authRes.json();
      const cookie = authRes.headers.get('set-cookie').split(';')[0];
      const csrf = authBody.csrfToken;

      // 3. POST approve
      const approveRes = await fetch(`${BASE_URL}/api/portal/client/transactions/${canonicalCuotasTxId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: cookie
        },
        body: JSON.stringify({ authNonce: cuotasNonce })
      });
      const approveBody = await approveRes.json();
      assert.equal(approveRes.status, 200);

      // 4. Verificar en BD que el backend creó exactamente 3 cuotas
      const instsAfter = readCollection('installments').filter(i => String(i.transactionId) === canonicalCuotasTxId);
      assert.equal(instsAfter.length, 3, 'El backend debió crear exactamente 3 cuotas');
      assert.equal(instsAfter[0].id, `INST-${canonicalCuotasTxId}-1`);
      assert.equal(instsAfter[1].id, `INST-${canonicalCuotasTxId}-2`);
      assert.equal(instsAfter[2].id, `INST-${canonicalCuotasTxId}-3`);
      assert.equal(instsAfter[0].amount, 30.0);
      assert.equal(instsAfter[1].amount, 30.0);
      assert.equal(instsAfter[2].amount, 30.0);
    });

    it('TEST 3 — RETRY NO DUPLICA: Reintentar sobre la misma transacción ya aprobada no duplica cuotas', async () => {
      const authRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'client',
          identifier: '584145556677',
          pin: '123456'
        })
      });
      const authBody = await authRes.json();
      const cookie = authRes.headers.get('set-cookie').split(';')[0];
      const csrf = authBody.csrfToken;

      // Reintentar aprobación (debe ser 409 por estar ya approved)
      const retryRes = await fetch(`${BASE_URL}/api/portal/client/transactions/${canonicalCuotasTxId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: cookie
        },
        body: JSON.stringify({ authNonce: cuotasNonce })
      });
      assert.equal(retryRes.status, 409);

      // Comprobar que siguen existiendo exactamente 3 cuotas y NO 6
      const insts = readCollection('installments').filter(i => String(i.transactionId) === canonicalCuotasTxId);
      assert.equal(insts.length, 3, 'Deben seguir existiendo exactamente 3 cuotas');
    });

    it('TEST 4 — POS CERRADO: Las cuotas existen en base de datos sin interacción del frontend CheesePOSView', () => {
      const insts = readCollection('installments').filter(i => String(i.transactionId) === canonicalCuotasTxId);
      assert.equal(insts.length, 3, 'Las cuotas persisten en disco de forma autónoma por el backend');
    });

    it('TEST 5 — LEGACY NO SE TOCA: Aprobar pago de cuota Mundo Kalu $30 no altera outstandingDebt ($500)', async () => {
      const authRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'client',
          identifier: '584145556677',
          pin: '123456'
        })
      });
      const authBody = await authRes.json();
      const cookie = authRes.headers.get('set-cookie').split(';')[0];
      const csrf = authBody.csrfToken;

      const inst1Id = `INST-${canonicalCuotasTxId}-1`;

      // Reportar pago de $30 a Cuota 1
      const payRes = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: cookie
        },
        body: JSON.stringify({
          amount: 30.0,
          paymentMethod: 'Pago Móvil',
          reference: 'REF-CUOTA-ISOLATION-30',
          installmentId: inst1Id,
          receiptImageUrl: VALID_PNG_BASE64
        })
      });
      const payBody = await payRes.json();
      assert.equal(payRes.status, 200);

      // Aprobar desde admin
      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${payBody.payment.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        }
      });
      assert.equal(approveRes.status, 200);

      // Comprobar que outstandingDebt sigue en 500
      const clients = readCollection('clients');
      const cli = clients.find(c => c.id === legacyClientId);
      assert.equal(cli.outstandingDebt, 500, 'Deuda legacy permanece estrictamente en $500 (NO se descontaron los $30)');
    });

    it('TEST 6 — LEGACY NO SE TOCA EN FIADO_TOTAL: Aprobar abono fiado_total de $20 no altera outstandingDebt ($500)', async () => {
      const allPayments = readCollection('pwa_payments');
      const fiadoPay = allPayments.find(p => p.reference === 'REF-CANONICAL-FIADO-20');
      assert.ok(fiadoPay);

      // Aprobar el pago fiado_total desde admin
      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${fiadoPay.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        }
      });
      assert.equal(approveRes.status, 200);

      // Comprobar que outstandingDebt sigue en 500
      const clients = readCollection('clients');
      const cli = clients.find(c => c.id === legacyClientId);
      assert.equal(cli.outstandingDebt, 500, 'Deuda legacy permanece intacta en $500 tras abono fiado_total');
    });

    it('TEST 7 — REFERENCE VACÍA: POST /api/portal/client/payments con referencia vacía responde HTTP 400 y no crea archivo', async () => {
      const authRes = await fetch(`${BASE_URL}/api/portal/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalType: 'client',
          identifier: '584145556677',
          pin: '123456'
        })
      });
      const authBody = await authRes.json();
      const cookie = authRes.headers.get('set-cookie').split(';')[0];
      const csrf = authBody.csrfToken;

      const pwaBefore = readCollection('pwa_payments').length;

      const payRes = await fetch(`${BASE_URL}/api/portal/client/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: cookie
        },
        body: JSON.stringify({
          amount: 30.0,
          paymentMethod: 'Pago Móvil',
          reference: '   ', // Vacía con espacios
          installmentId: `INST-${canonicalCuotasTxId}-2`,
          receiptImageUrl: VALID_PNG_BASE64
        })
      });

      const payBody = await payRes.json();
      assert.equal(payRes.status, 400, `Debe rechazar con 400 Bad Request: ${JSON.stringify(payBody)}`);
      assert.equal(payBody.code, 'INVALID_REFERENCE');

      const pwaAfter = readCollection('pwa_payments').length;
      assert.equal(pwaAfter, pwaBefore, 'No se debió crear ningún registro pwa_payment');
    });

    it('TEST A — VENTA MUNDO KALU: Cliente $500 deuda legacy + Venta Mundo Kalu $80 -> outstandingDebt permanece $500', async () => {
      const boundaryClientId = 'cli-boundary-test-a';
      const clients = readCollection('clients');
      clients.push({
        id: boundaryClientId,
        name: 'CLIENTE BOUNDARY A',
        phone: '584149990001',
        pinHash: bcrypt.hashSync('123456', 10),
        cedula: 'V9990001',
        outstandingDebt: 500, // Deuda legacy de $500
        currentDebtUsd: 0,
        loyaltyPoints: 0,
        tier: 'K1',
        status: 'active',
        active: true
      });
      writeCollection('clients', clients);

      const products = readCollection('products');
      const testProdId = products[0]?.id || 'prod-test-1';

      // Ejecutar venta atómica POS vía /api/pos/process-sale con pago Mundo Kalu ($80 financiado)
      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const saleRes = await fetch(`${BASE_URL}/api/pos/process-sale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        },
        body: JSON.stringify({
          saleItems: [{ productId: testProdId, quantityKg: 1, subtotal: 80.0, pricePerKg: 80.0 }],
          clientId: boundaryClientId,
          customerName: 'CLIENTE BOUNDARY A',
          paidAmount: 80.0,
          saleTotalAmount: 80.0,
          debtAmount: 0,
          paymentMethodType: 'Mundo Kalu',
          addedPayments: [{ method: 'Mundo Kalu', amount: 80.0, originalAmount: 80.0, currency: '$' }]
        })
      });
      assert.equal(saleRes.status, 200, 'Venta Mundo Kalu debe procesarse exitosamente (200 OK)');

      // Verificar que outstandingDebt NO aumentó a $580, permanece intacto en $500
      const clientsAfter = readCollection('clients');
      const updatedCli = clientsAfter.find(c => c.id === boundaryClientId);
      assert.equal(updatedCli.outstandingDebt, 500, 'TEST A: outstandingDebt legacy debe permanecer exactamente en $500');
      assert.equal(updatedCli.currentDebtUsd, 0, 'TEST A: currentDebtUsd no debe ser modificado');
    });

    it('TEST B — VENTA CRÉDITO LEGACY / GENERAL: Cliente $500 deuda legacy + Venta Crédito $80 -> outstandingDebt aumenta a $580', async () => {
      const boundaryClientIdB = 'cli-boundary-test-b';
      const clients = readCollection('clients');
      clients.push({
        id: boundaryClientIdB,
        name: 'CLIENTE BOUNDARY B',
        phone: '584149990002',
        pinHash: bcrypt.hashSync('123456', 10),
        cedula: 'V9990002',
        outstandingDebt: 500, // Deuda legacy de $500
        currentDebtUsd: 0,
        loyaltyPoints: 0,
        tier: 'K1',
        status: 'active',
        active: true
      });
      writeCollection('clients', clients);

      const products = readCollection('products');
      const testProdId = products[0]?.id || 'prod-test-1';

      // Ejecutar venta atómica POS vía /api/pos/process-sale con crédito regular del CRM ($80 deuda general)
      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const saleRes = await fetch(`${BASE_URL}/api/pos/process-sale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        },
        body: JSON.stringify({
          saleItems: [{ productId: testProdId, quantityKg: 1, subtotal: 80.0, pricePerKg: 80.0 }],
          clientId: boundaryClientIdB,
          customerName: 'CLIENTE BOUNDARY B',
          paidAmount: 0,
          saleTotalAmount: 80.0,
          debtAmount: 80.0,
          paymentMethodType: 'Crédito / Fiado',
          addedPayments: []
        })
      });
      assert.equal(saleRes.status, 200, 'Venta Crédito Legacy debe procesarse exitosamente (200 OK)');

      // Verificar que outstandingDebt SÍ aumentó a $580 según el comportamiento normal del CRM
      const clientsAfter = readCollection('clients');
      const updatedCli = clientsAfter.find(c => c.id === boundaryClientIdB);
      assert.equal(updatedCli.outstandingDebt, 580, 'TEST B: outstandingDebt legacy debe aumentar a $580');
    });

    it('TEST C — PAGO CUOTA MUNDO KALU: Cliente $500 deuda legacy + Pago cuota $30 -> outstandingDebt permanece $500', async () => {
      const boundaryClientIdC = 'cli-boundary-test-c';
      const clients = readCollection('clients');
      clients.push({
        id: boundaryClientIdC,
        name: 'CLIENTE BOUNDARY C',
        phone: '584149990003',
        pinHash: bcrypt.hashSync('123456', 10),
        cedula: 'V9990003',
        outstandingDebt: 500, // Deuda legacy de $500
        currentDebtUsd: 0,
        loyaltyPoints: 0,
        tier: 'K1',
        status: 'active',
        active: true
      });
      writeCollection('clients', clients);

      const txId = 'TX-BOUNDARY-C-1';
      const instId = 'INST-BOUNDARY-C-1';
      const txs = readCollection('transactions');
      txs.push({
        id: txId,
        clientId: boundaryClientIdC,
        entity: 'CLIENTE BOUNDARY C',
        paymentMethod: 'Mundo Kalu',
        category: 'credito',
        amount: 90.0,
        financedAmount: 90.0,
        kaluCreditData: { modalidad: '3_cuotas', aFinanciar: 90.0, inicial: 0, cuotas: [30, 30, 30] },
        status: 'Aprobado'
      });
      writeCollection('transactions', txs);

      const installments = readCollection('installments');
      installments.push({
        id: instId,
        clientId: boundaryClientIdC,
        transactionId: txId,
        amount: 30.0,
        amountUSD: 30.0,
        paidAmount: 0,
        installmentNumber: 1,
        totalInstallments: 3,
        status: 'pending'
      });
      writeCollection('installments', installments);

      // Crear y aprobar pago PWA de $30 a la cuota
      const pwaPayments = readCollection('pwa_payments');
      const payDoc = {
        id: `pwa-boundary-c-${Date.now()}`,
        clientId: boundaryClientIdC,
        entityName: 'CLIENTE BOUNDARY C',
        amount: 30.0,
        currency: 'USD',
        paymentMethod: 'Pago Móvil',
        reference: `REF-BC-${Date.now()}`,
        status: 'pending',
        installmentId: instId,
        receiptImageUrl: VALID_PNG_BASE64,
        createdAt: new Date().toISOString()
      };
      pwaPayments.push(payDoc);
      writeCollection('pwa_payments', pwaPayments);

      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${payDoc.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        }
      });
      assert.equal(approveRes.status, 200);

      const clientsAfter = readCollection('clients');
      const updatedCli = clientsAfter.find(c => c.id === boundaryClientIdC);
      assert.equal(updatedCli.outstandingDebt, 500, 'TEST C: outstandingDebt permanece intacto en $500');
    });

    it('TEST D — PAGO FIADO TOTAL MUNDO KALU: Cliente $500 deuda legacy + Abono $20 a fiado $80 -> outstandingDebt permanece $500', async () => {
      const boundaryClientIdD = 'cli-boundary-test-d';
      const clients = readCollection('clients');
      clients.push({
        id: boundaryClientIdD,
        name: 'CLIENTE BOUNDARY D',
        phone: '584149990004',
        pinHash: bcrypt.hashSync('123456', 10),
        cedula: 'V9990004',
        outstandingDebt: 500, // Deuda legacy de $500
        currentDebtUsd: 0,
        loyaltyPoints: 0,
        tier: 'K1',
        status: 'active',
        active: true
      });
      writeCollection('clients', clients);

      const txId = 'TX-BOUNDARY-D-1';
      const txs = readCollection('transactions');
      txs.push({
        id: txId,
        clientId: boundaryClientIdD,
        entity: 'CLIENTE BOUNDARY D',
        paymentMethod: 'Mundo Kalu',
        category: 'credito',
        amount: 80.0,
        financedAmount: 80.0,
        kaluCreditData: { modalidad: 'fiado_total', aFinanciar: 80.0, inicial: 0, cuotas: [] },
        status: 'Aprobado'
      });
      writeCollection('transactions', txs);

      // Crear y aprobar abono PWA de $20 a fiado_total
      const pwaPayments = readCollection('pwa_payments');
      const payDoc = {
        id: `pwa-boundary-d-${Date.now()}`,
        clientId: boundaryClientIdD,
        entityName: 'CLIENTE BOUNDARY D',
        amount: 20.0,
        currency: 'USD',
        paymentMethod: 'Pago Móvil',
        reference: `REF-BD-${Date.now()}`,
        status: 'pending',
        transactionId: txId,
        receiptImageUrl: VALID_PNG_BASE64,
        createdAt: new Date().toISOString()
      };
      pwaPayments.push(payDoc);
      writeCollection('pwa_payments', pwaPayments);

      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${payDoc.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        }
      });
      assert.equal(approveRes.status, 200);

      const clientsAfter = readCollection('clients');
      const updatedCli = clientsAfter.find(c => c.id === boundaryClientIdD);
      assert.equal(updatedCli.outstandingDebt, 500, 'TEST D: outstandingDebt permanece intacto en $500');
    });

    it('TEST REGRESIÓN — PAGO DEUDA GENERAL LEGACY: Cliente $500 deuda legacy + Pago Legacy $20 -> outstandingDebt se reduce a $480', async () => {
      const legacyClientReg = 'cli-legacy-reg-001';
      const clients = readCollection('clients');
      clients.push({
        id: legacyClientReg,
        name: 'CLIENTE LEGACY REGRESION',
        phone: '584149990005',
        pinHash: bcrypt.hashSync('123456', 10),
        cedula: 'V9990005',
        outstandingDebt: 500, // Deuda legacy de $500
        currentDebtUsd: 0,
        loyaltyPoints: 0,
        tier: 'K1',
        status: 'active',
        active: true
      });
      writeCollection('clients', clients);

      // Pago PWA de deuda general (sin installmentId ni transactionId Mundo Kalu)
      const pwaPayments = readCollection('pwa_payments');
      const payDoc = {
        id: `pwa-legacy-reg-${Date.now()}`,
        clientId: legacyClientReg,
        entityName: 'CLIENTE LEGACY REGRESION',
        amount: 20.0,
        currency: 'USD',
        paymentMethod: 'Pago Móvil',
        reference: `REF-LEG-${Date.now()}`,
        status: 'pending',
        receiptImageUrl: VALID_PNG_BASE64,
        createdAt: new Date().toISOString()
      };
      pwaPayments.push(payDoc);
      writeCollection('pwa_payments', pwaPayments);

      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        headers: { Cookie: adminCookie }
      });
      const { csrfToken } = await csrfRes.json();

      const approveRes = await fetch(`${BASE_URL}/api/pwa-payments/${payDoc.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: adminCookie
        }
      });
      assert.equal(approveRes.status, 200);

      const clientsAfter = readCollection('clients');
      const updatedCli = clientsAfter.find(c => c.id === legacyClientReg);
      assert.equal(updatedCli.outstandingDebt, 480, 'TEST REGRESIÓN: outstandingDebt legacy debe reducirse exactamente a $480');
    });
  });
});
