import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import zlib from 'zlib';

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
const tempDir = path.join(os.tmpdir(), `kalu-test-phase3c2-data-${Date.now()}-${process.pid}`);
const tempMediaDir = path.join(os.tmpdir(), `kalu-test-phase3c2-media-${Date.now()}-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(path.join(tempMediaDir, 'captures'), { recursive: true });

for (const file of fs.readdirSync(devDir)) {
  const src = path.join(devDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(tempDir, file));
  }
}

process.env.KALU_DATA_DIR = tempDir;
process.env.KALU_MEDIA_DIR = tempMediaDir;

const { app, readCollection, writeCollection } = await import('../server.js');

const TEST_PORT = 3111;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function parseTar(tarBuf) {
  const files = [];
  let offset = 0;
  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    offset += 512;
    if (header.every(b => b === 0)) break;
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const sizeStr = header.toString('utf8', 124, 136).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const data = tarBuf.subarray(offset, offset + size);
    offset += size;
    const pad = (512 - (size % 512)) % 512;
    offset += pad;
    files.push({ name, data });
  }
  return files;
}

describe('FASE 3C.2 — Backup Escalable TAR.GZ, Manifest SHA256, 20 Captures y Compatibilidad Legacy', () => {
  let serverInstance;
  let adminCookie = '';
  let adminCsrf = '';

  const adminUser = {
    id: 'usr-admin-3c2',
    username: 'admin3c2',
    email: 'admin3c2@kalu.com',
    name: 'Admin Escala 3C2',
    role: 'admin',
    passwordHash: bcrypt.hashSync('adminpass123', 10),
    pinHash: bcrypt.hashSync('123456', 10),
    active: true
  };

  // Crear 20 clientes y 20 cuotas
  const clientsList = [];
  const installmentsList = [];
  const pwaPaymentsList = [];
  const syntheticCapturesMap = new Map(); // filename -> { buffer, sha256, paymentId }

  // 1x1 PNG header base
  const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  for (let i = 1; i <= 20; i++) {
    const clientId = `cli-scale-${i}`;
    const paymentId = `pwa-scale-${i}`;
    const filename = `capture-scale-${i}.png`;

    // Generar buffer sintético de ~200 KB (con magic bytes PNG válidos)
    const padding = crypto.randomBytes(200 * 1024);
    const fullBuffer = Buffer.concat([PNG_HEADER, padding]);
    const sha256 = crypto.createHash('sha256').update(fullBuffer).digest('hex');

    syntheticCapturesMap.set(filename, {
      buffer: fullBuffer,
      sha256,
      paymentId,
      clientId
    });

    // Guardar archivo físico en tempMediaDir/captures
    fs.writeFileSync(path.join(tempMediaDir, 'captures', filename), fullBuffer);

    clientsList.push({
      id: clientId,
      name: `Cliente Escala ${i}`,
      phone: `58412000${String(i).padStart(4, '0')}`,
      outstandingDebt: 100,
      currentDebtUsd: 0,
      active: true
    });

    installmentsList.push({
      id: `inst-scale-${i}`,
      clientId: clientId,
      transactionId: `TX-SCALE-${i}`,
      amountUSD: 50,
      paidAmount: 0,
      status: 'in_review',
      installmentNumber: 1,
      totalInstallments: 2
    });

    pwaPaymentsList.push({
      id: paymentId,
      clientId: clientId,
      entityId: clientId,
      entityType: 'client',
      source: 'client_portal',
      amount: 50,
      paymentMethod: 'Pago Móvil',
      reference: `REF-SCALE-${i}`,
      receiptFileName: filename,
      receiptSha256: sha256,
      receiptMimeType: 'image/png',
      status: 'pending',
      createdAt: new Date().toISOString()
    });
  }

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
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null
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
    clients.push(...clientsList);
    writeCollection('clients', clients);

    const users = readCollection('users') || [];
    users.push(adminUser);
    writeCollection('users', users);

    const installments = readCollection('installments') || [];
    installments.push(...installmentsList);
    writeCollection('installments', installments);

    const pwaPayments = readCollection('pwa_payments') || [];
    pwaPayments.push(...pwaPaymentsList);
    writeCollection('pwa_payments', pwaPayments);

    serverInstance = http.createServer(app);
    await new Promise((resolve) => {
      serverInstance.listen(TEST_PORT, '127.0.0.1', resolve);
    });

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

  let downloadedBundleBuffer = null;

  it('1. GET /api/full-backup descarga bundle TAR.GZ con 20 captures binarios, backup.json y manifest.json', async () => {
    const res = await fetch(`${BASE_URL}/api/full-backup`, {
      headers: {
        'Cookie': adminCookie
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/gzip');
    assert.strictEqual(res.headers.get('x-backup-version'), '3.0');
    assert.strictEqual(res.headers.get('x-backup-captures-count'), '20');

    const arrayBuf = await res.arrayBuffer();
    downloadedBundleBuffer = Buffer.from(arrayBuf);

    // Descomprimir gzip y parsear tar
    const uncompressed = zlib.gunzipSync(downloadedBundleBuffer);
    const tarEntries = parseTar(uncompressed);

    const entryNames = tarEntries.map(e => e.name);
    assert.ok(entryNames.includes('backup.json'), 'Debe contener backup.json');
    assert.ok(entryNames.includes('manifest.json'), 'Debe contener manifest.json');

    // 1. Validar backup.json: NO debe contener bloque base64 de captures
    const backupEntry = tarEntries.find(e => e.name === 'backup.json');
    const parsedBackupJson = JSON.parse(backupEntry.data.toString('utf8'));
    assert.strictEqual(parsedBackupJson.captures, undefined, 'backup.json NO debe contener bloque base64 de captures');
    assert.ok(parsedBackupJson.collections.clients.length >= 20);

    // 2. Validar manifest.json: exactamente 20 entradas con sus SHA256 y paymentId
    const manifestEntry = tarEntries.find(e => e.name === 'manifest.json');
    const parsedManifest = JSON.parse(manifestEntry.data.toString('utf8'));
    assert.strictEqual(parsedManifest.filesCount, 20);
    assert.strictEqual(parsedManifest.captures.length, 20);

    for (const item of parsedManifest.captures) {
      assert.ok(item.filename);
      assert.ok(item.size > 200 * 1024);
      assert.ok(item.sha256);
      assert.ok(item.paymentId);

      const expected = syntheticCapturesMap.get(item.filename);
      assert.ok(expected);
      assert.strictEqual(item.sha256, expected.sha256);
      assert.strictEqual(item.paymentId, expected.paymentId);
    }

    // 3. Validar binarios en captures/
    const captureTarFiles = tarEntries.filter(e => e.name.startsWith('captures/'));
    assert.strictEqual(captureTarFiles.length, 20);

    for (const cEntry of captureTarFiles) {
      const fname = path.basename(cEntry.name);
      const expected = syntheticCapturesMap.get(fname);
      assert.ok(expected);
      const computedSha = crypto.createHash('sha256').update(cEntry.data).digest('hex');
      assert.strictEqual(computedSha, expected.sha256, `SHA256 del binario ${fname} dentro del TAR debe coincidir`);
    }
  });

  it('2. Restore del Bundle: borrar data y los 20 captures de disco -> restore -> verifica SHA256 de los 20 y GET receipt de 3 payments', async () => {
    // 1. Borrar todos los captures físicos de disco
    for (const filename of syntheticCapturesMap.keys()) {
      const p = path.join(tempMediaDir, 'captures', filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
      assert.strictEqual(fs.existsSync(p), false);
    }

    // 2. Enviar bundle binario en base64 a POST /api/restore-backup
    const restoreRes = await httpRequest('/api/restore-backup', {
      method: 'POST',
      headers: {
        'x-csrf-token': adminCsrf
      },
      cookie: adminCookie,
      body: {
        bundleBase64: downloadedBundleBuffer.toString('base64')
      }
    });

    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.data.success, true);
    assert.strictEqual(restoreRes.data.summary.captures, 20);

    // 3. Comprobar que los 20 archivos existen en disco y sus SHA256 coinciden exactamente
    for (const [filename, info] of syntheticCapturesMap.entries()) {
      const p = path.join(tempMediaDir, 'captures', filename);
      assert.strictEqual(fs.existsSync(p), true, `El capture ${filename} debe existir en disco`);
      const diskBuf = fs.readFileSync(p);
      const diskSha = crypto.createHash('sha256').update(diskBuf).digest('hex');
      assert.strictEqual(diskSha, info.sha256, `SHA256 de ${filename} debe coincidir bit a bit`);
    }

    // 4. Probar GET /api/pwa-payments/:id/receipt para 3 payments distintos
    const samplePayments = ['pwa-scale-1', 'pwa-scale-10', 'pwa-scale-20'];
    for (const pid of samplePayments) {
      const resReceipt = await fetch(`${BASE_URL}/api/pwa-payments/${pid}/receipt`, {
        headers: {
          'Cookie': adminCookie
        }
      });
      assert.strictEqual(resReceipt.status, 200, `Payment ${pid} receipt debe devolver HTTP 200`);
      assert.strictEqual(resReceipt.headers.get('content-type'), 'image/png');
      const arrayBuf = await resReceipt.arrayBuffer();
      const servedBuf = Buffer.from(arrayBuf);
      const servedSha = crypto.createHash('sha256').update(servedBuf).digest('hex');
      const pIndex = pid.split('-')[2];
      assert.strictEqual(servedSha, syntheticCapturesMap.get(`capture-scale-${pIndex}.png`).sha256);
    }
  });

  it('3. Detección de Archivo Corrupto: si un capture en el bundle no coincide con el manifest SHA256, el restore es abortado', async () => {
    // Construir un bundle manipulado (1 capture con contenido corrupto)
    const corruptedTarEntries = [];

    const validBackupJson = {
      version: '3.0',
      timestamp: new Date().toISOString(),
      collections: { clients: [], pwa_payments: [] }
    };
    corruptedTarEntries.push({
      name: 'backup.json',
      data: Buffer.from(JSON.stringify(validBackupJson), 'utf8')
    });

    const manifestWithValidSha = {
      version: '3.0',
      captures: [
        {
          filename: 'corrupted-test.png',
          size: 100,
          sha256: '0000000000000000000000000000000000000000000000000000000000000000' // SHA falso
        }
      ]
    };
    corruptedTarEntries.push({
      name: 'manifest.json',
      data: Buffer.from(JSON.stringify(manifestWithValidSha), 'utf8')
    });

    corruptedTarEntries.push({
      name: 'captures/corrupted-test.png',
      data: Buffer.from('Corrupted image payload bytes')
    });

    // Helper createTar local
    function createTestTar(entries) {
      const chunks = [];
      for (const entry of entries) {
        const { name, data } = entry;
        const header = Buffer.alloc(512);
        header.write(name, 0, 100, 'utf8');
        header.write('0000644\0', 100, 8, 'utf8');
        header.write('0000000\0', 108, 8, 'utf8');
        header.write('0000000\0', 116, 8, 'utf8');
        const sizeOctal = data.length.toString(8).padStart(11, '0') + ' ';
        header.write(sizeOctal, 124, 12, 'utf8');
        const mtimeOctal = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + ' ';
        header.write(mtimeOctal, 136, 12, 'utf8');
        header.fill(' ', 148, 156);
        header.write('0', 156, 1, 'utf8');
        header.write('ustar\0', 257, 6, 'utf8');
        header.write('00', 263, 2, 'utf8');

        let checksum = 0;
        for (let i = 0; i < 512; i++) checksum += header[i];
        header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');

        chunks.push(header);
        chunks.push(data);
        const padSize = (512 - (data.length % 512)) % 512;
        if (padSize > 0) chunks.push(Buffer.alloc(padSize));
      }
      chunks.push(Buffer.alloc(1024));
      return Buffer.concat(chunks);
    }

    const corruptedTar = createTestTar(corruptedTarEntries);
    const corruptedGz = zlib.gzipSync(corruptedTar);

    const corruptRestoreRes = await httpRequest('/api/restore-backup', {
      method: 'POST',
      headers: {
        'x-csrf-token': adminCsrf
      },
      cookie: adminCookie,
      body: {
        bundleBase64: corruptedGz.toString('base64')
      }
    });

    assert.strictEqual(corruptRestoreRes.status, 422, 'Debe devolver HTTP 422 si la verificación de integridad falla');
    assert.ok(corruptRestoreRes.data.error.includes('integridad fallida'));
    assert.ok(corruptRestoreRes.data.details[0].includes('corrupted-test.png'));
  });

  it('4. Compatibilidad con Backup JSON Legacy: POST /api/restore-backup acepta JSON directo sin romper', async () => {
    const legacyPayload = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      collections: {
        clients: [{ id: 'cli-legacy-compat', name: 'Legacy Compat', outstandingDebt: 0 }],
        pwa_payments: []
      }
    };

    const legacyRes = await httpRequest('/api/restore-backup', {
      method: 'POST',
      headers: {
        'x-csrf-token': adminCsrf
      },
      cookie: adminCookie,
      body: legacyPayload
    });

    assert.strictEqual(legacyRes.status, 200);
    assert.strictEqual(legacyRes.data.success, true);
    assert.strictEqual(legacyRes.data.summary.clients, 1);
  });
});
