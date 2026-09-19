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
const tempDir = path.join(os.tmpdir(), `kalu-test-phase3a2-${Date.now()}-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });

for (const file of fs.readdirSync(devDir)) {
  const src = path.join(devDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(tempDir, file));
  }
}

process.env.KALU_DATA_DIR = tempDir;

const { app, readCollection, writeCollection } = await import('../server.js');

const TEST_PORT = 3108;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('FASE 3A.2: Verificación real de /api/portal/client/finances con compra 3 cuotas', () => {
  let serverInstance;
  let clientCookie = '';
  let clientCsrf = '';

  const clientTestUser = {
    id: 'cli-phase3a2-test',
    name: 'Cliente Prueba 3A.2',
    phone: '584120003322',
    pinHash: bcrypt.hashSync('123456', 10),
    outstandingDebt: 30.00,
    currentDebtUsd: 0,
    creditLimitUsd: 200,
    loyaltyPoints: 50,
    tier: 'K1',
    active: true
  };

  const txId = 'TX-CUOTAS-TEST';

  const testInstallments = [
    {
      id: 'inst-3a2-1',
      clientId: clientTestUser.id,
      transactionId: txId,
      amount: 10.00,
      amountUSD: 10.00,
      paidAmount: 0,
      installmentNumber: 1,
      totalInstallments: 3,
      dueDate: '2026-09-25',
      status: 'pending',
      type: 'repuestos',
      createdAt: '2026-09-19T00:00:00.000Z'
    },
    {
      id: 'inst-3a2-2',
      clientId: clientTestUser.id,
      transactionId: txId,
      amount: 10.00,
      amountUSD: 10.00,
      paidAmount: 0,
      installmentNumber: 2,
      totalInstallments: 3,
      dueDate: '2026-10-10',
      status: 'pending',
      type: 'repuestos',
      createdAt: '2026-09-19T00:00:00.000Z'
    },
    {
      id: 'inst-3a2-3',
      clientId: clientTestUser.id,
      transactionId: txId,
      amount: 10.00,
      amountUSD: 10.00,
      paidAmount: 0,
      installmentNumber: 3,
      totalInstallments: 3,
      dueDate: '2026-10-25',
      status: 'pending',
      type: 'repuestos',
      createdAt: '2026-09-19T00:00:00.000Z'
    }
  ];

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
    clients.push(clientTestUser);
    writeCollection('clients', clients);

    const installments = readCollection('installments') || [];
    installments.push(...testInstallments);
    writeCollection('installments', installments);

    serverInstance = http.createServer(app);
    await new Promise((resolve) => {
      serverInstance.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });

    // Login cliente
    const loginRes = await httpRequest('/api/portal/auth/login', {
      method: 'POST',
      body: { identifier: clientTestUser.phone, pin: '123456', portalType: 'client' }
    });
    assert.strictEqual(loginRes.status, 200);
    clientCookie = (loginRes.setCookie || '').split(';')[0];
    clientCsrf = loginRes.data?.csrfToken || '';
  });

  after(async () => {
    if (serverInstance) {
      await new Promise(r => serverInstance.close(r));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('GET /api/portal/client/finances devuelve las 3 cuotas completas con installmentNumber y totalInstallments', async () => {
    const financesRes = await httpRequest('/api/portal/client/finances', {
      method: 'GET',
      cookie: clientCookie
    });

    assert.strictEqual(financesRes.status, 200);
    const json = financesRes.data;

    console.log('CRUDE_RESPONSE_START');
    console.log(JSON.stringify(json, null, 2));
    console.log('CRUDE_RESPONSE_END');

    assert.strictEqual(json.outstandingDebt, 30);
    assert.strictEqual(json.installments.length, 3);

    for (let i = 0; i < 3; i++) {
      const inst = json.installments[i];
      assert.strictEqual(inst.transactionId, txId);
      assert.strictEqual(inst.installmentNumber, i + 1);
      assert.strictEqual(inst.totalInstallments, 3);
      assert.strictEqual(inst.amount, 10);
      assert.strictEqual(inst.paidAmount, 0);
      assert.strictEqual(inst.status, 'pending');
      assert.strictEqual(inst.type, 'repuestos');
      assert.ok(inst.dueDate);
      assert.ok(inst.id);
    }
  });

  it('Invariabilidad de data-dev', () => {
    const finalHashes = getDevHashes();
    assert.deepStrictEqual(initialDevHashes, finalHashes);
  });
});
