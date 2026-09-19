import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  runAccountingReset,
  sha256,
  computeMasterHash,
  validateReceiptPath,
  isProductionTarget,
  CLIENT_MASTER_FIELDS,
  SUPPLIER_MASTER_FIELDS,
  ACCOUNTING_COLLECTIONS
} from '../scripts/reset_accounting_data.mjs';

describe('TESTS DE HARDENING Y ATOMICIDAD — RESET CONTABLE (FASE 3)', () => {
  const tempFixtureDir = path.resolve('./temp-accounting-reset-fixture');
  const tempMediaDir = path.resolve('./temp-accounting-reset-media');

  beforeEach(() => {
    if (fs.existsSync(tempFixtureDir)) fs.rmSync(tempFixtureDir, { recursive: true, force: true });
    if (fs.existsSync(tempMediaDir)) fs.rmSync(tempMediaDir, { recursive: true, force: true });

    fs.mkdirSync(tempFixtureDir, { recursive: true });
    fs.mkdirSync(path.join(tempMediaDir, 'captures'), { recursive: true });

    const sourceFiles = fs.readdirSync('./data-dev').filter(f => f.endsWith('.json'));
    for (const f of sourceFiles) {
      fs.copyFileSync(path.join('./data-dev', f), path.join(tempFixtureDir, f));
    }
  });

  after(() => {
    if (fs.existsSync(tempFixtureDir)) fs.rmSync(tempFixtureDir, { recursive: true, force: true });
    if (fs.existsSync(tempMediaDir)) fs.rmSync(tempMediaDir, { recursive: true, force: true });
  });

  // 1. DRY-RUN
  test('1. DRY-RUN por defecto NO modifica ningún archivo ni capture', async () => {
    const clientsBefore = fs.readFileSync(path.join(tempFixtureDir, 'clients_db.json'), 'utf8');
    const productsBefore = fs.readFileSync(path.join(tempFixtureDir, 'products_db.json'), 'utf8');

    const res = await runAccountingReset({
      dataDir: tempFixtureDir,
      isDryRun: true,
      logger: () => {}
    });

    assert.strictEqual(res.isDryRun, true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(fs.readFileSync(path.join(tempFixtureDir, 'clients_db.json'), 'utf8'), clientsBefore);
    assert.strictEqual(fs.readFileSync(path.join(tempFixtureDir, 'products_db.json'), 'utf8'), productsBefore);
  });

  // 2. GUARD PRODUCCIÓN DOBLE
  test('2. Guard Producción: Detección canónica estricta', async () => {
    // A. prod path + confirm correcto + SIN --production → FAIL
    assert.strictEqual(isProductionTarget('/var/www/app/data'), true);
    assert.strictEqual(isProductionTarget('/root/kalu-crm/data'), true);

    // B. Ruta parecida que NO es producción -> NO se confunde
    assert.strictEqual(isProductionTarget('/root/kalu-crm/data-backup'), false);
    assert.strictEqual(isProductionTarget('/var/www/app/data-dev'), false);
    assert.strictEqual(isProductionTarget('./temp-accounting-reset-fixture'), false);

    // C. Pasar --production sobre target NO productivo -> ABORTA
    await assert.rejects(
      async () => {
        await runAccountingReset({
          dataDir: tempFixtureDir,
          isDryRun: false,
          isProduction: true, // Inconsistente en test local
          confirmCode: 'RESET-ACCOUNTING',
          logger: () => {}
        });
      },
      /no está en la allowlist de producción/
    );
  });

  // 3. RESET NORMAL CON VALIDACIÓN POST-DISCO
  test('3. Reset normal: Valida re-lectura desde disco e integridad SHA256', async () => {
    const productsHashBefore = sha256(fs.readFileSync(path.join(tempFixtureDir, 'products_db.json'), 'utf8'));
    const usersHashBefore = sha256(fs.readFileSync(path.join(tempFixtureDir, 'users_db.json'), 'utf8'));

    const res = await runAccountingReset({
      dataDir: tempFixtureDir,
      isDryRun: false,
      logger: () => {}
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isDryRun, false);

    // Re-leer desde disco directamente
    const diskProducts = JSON.parse(fs.readFileSync(path.join(tempFixtureDir, 'products_db.json'), 'utf8'));
    const diskClients = JSON.parse(fs.readFileSync(path.join(tempFixtureDir, 'clients_db.json'), 'utf8'));
    const diskSuppliers = JSON.parse(fs.readFileSync(path.join(tempFixtureDir, 'suppliers_db.json'), 'utf8'));
    const diskTransactions = JSON.parse(fs.readFileSync(path.join(tempFixtureDir, 'transactions_db.json'), 'utf8'));
    const diskPwaPayments = JSON.parse(fs.readFileSync(path.join(tempFixtureDir, 'pwa_payments_db.json'), 'utf8'));

    assert.strictEqual(sha256(JSON.stringify(diskProducts, null, 2)), productsHashBefore);
    assert.strictEqual(diskTransactions.length, 0);
    assert.strictEqual(diskPwaPayments.length, 0);

    for (const c of diskClients) {
      assert.strictEqual(c.currentDebtUsd, 0);
      assert.strictEqual(c.outstandingDebt, 0);
      assert.strictEqual(c.saldoBs, 0);
    }
    for (const s of diskSuppliers) {
      assert.strictEqual(s.balanceUsd, 0);
      assert.strictEqual(s.balanceOwed, 0);
      assert.strictEqual(s.storeDebt, 0);
    }
  });

  // 4. CLIENTES LEGACY Y AVAILABLE CREDIT
  test('4. Variantes legacy de deuda se resetean y availableCredit se sincroniza con creditLimitUsd', async () => {
    const legacyClients = [
      {
        id: 'cli-legacy-test',
        name: 'Cliente Legacy',
        cedula: 'V-99887766',
        phone: '04140001122',
        creditLimitUsd: 1200,
        availableCredit: 200,
        currentDebt: 1000,
        currentDebtUsd: 1000,
        outstandingDebt: 1000,
        debt: 1000,
        paidAmount: 500,
        creditUsed: 1000,
        pendingBalance: 1000,
        accountsReceivable: 1000,
        saldoBs: 40000,
        points: 50,
        tier: 'K1'
      }
    ];
    fs.writeFileSync(path.join(tempFixtureDir, 'clients_db.json'), JSON.stringify(legacyClients, null, 2));

    await runAccountingReset({
      dataDir: tempFixtureDir,
      isDryRun: false,
      logger: () => {}
    });

    const diskClients = JSON.parse(fs.readFileSync(path.join(tempFixtureDir, 'clients_db.json'), 'utf8'));
    const c = diskClients[0];

    assert.strictEqual(c.currentDebtUsd, 0);
    assert.strictEqual(c.outstandingDebt, 0);
    assert.strictEqual(c.currentDebt, 0);
    assert.strictEqual(c.debt, 0);
    assert.strictEqual(c.paidAmount, 0);
    assert.strictEqual(c.creditUsed, 0);
    assert.strictEqual(c.pendingBalance, 0);
    assert.strictEqual(c.accountsReceivable, 0);
    assert.strictEqual(c.saldoBs, 0);

    assert.strictEqual(c.creditLimitUsd, 1200);
    assert.strictEqual(c.availableCredit, 1200, 'availableCredit debe quedar igual al cupo total 1200');
  });

  // 5. PURGA EXIGE MEDIA-DIR
  test('5. Purga de receipts sin media-dir válido aborta inmediatamente', async () => {
    await assert.rejects(
      async () => {
        await runAccountingReset({
          dataDir: tempFixtureDir,
          isDryRun: false,
          purgeReceipts: true,
          mediaDir: null,
          logger: () => {}
        });
      },
      /requiere especificar un --media-dir válido/
    );
  });

  // 6. PATH TRAVERSAL EN RECEIPTS
  test('6. Path traversal en receiptFileName es bloqueado y no toca archivos externos', () => {
    const capturesDir = path.join(tempMediaDir, 'captures');
    const secretOutsideFile = path.join(tempMediaDir, 'secret_system_file.txt');
    fs.writeFileSync(secretOutsideFile, 'SECRET_KEY_DATA');

    const result = validateReceiptPath(capturesDir, '../../secret_system_file.txt');
    assert.strictEqual(result, null, 'Path traversal debe ser rechazado como null');
    assert.strictEqual(fs.existsSync(secretOutsideFile), true, 'El archivo externo debe permanecer intacto');
  });

  // 7. RECEIPT DUPLICADO DEDUPLICADO
  test('7. Receipts duplicados referenciados por múltiples pagos se respaldan y purgan 1 sola vez', async () => {
    const capturesDir = path.join(tempMediaDir, 'captures');
    const receiptData = 'SHARED_RECEIPT_IMAGE_CONTENT_2026';
    fs.writeFileSync(path.join(capturesDir, 'shared-receipt.jpg'), receiptData);

    const pwaPayments = [
      { id: 'pwa-dup-1', clientId: 'cli-1', receiptFileName: 'shared-receipt.jpg', amount: 40 },
      { id: 'pwa-dup-2', clientId: 'cli-2', receiptFileName: 'shared-receipt.jpg', amount: 60 }
    ];
    fs.writeFileSync(path.join(tempFixtureDir, 'pwa_payments_db.json'), JSON.stringify(pwaPayments, null, 2));

    const res = await runAccountingReset({
      dataDir: tempFixtureDir,
      mediaDir: tempMediaDir,
      isDryRun: false,
      purgeReceipts: true,
      logger: () => {}
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.stats.receiptsBackedUp, 1, 'Solo 1 archivo físico debe ser respaldado');
    assert.strictEqual(res.stats.receiptsToPurge, 1, 'Solo 1 archivo físico debe ser purgado');
    assert.strictEqual(fs.existsSync(path.join(capturesDir, 'shared-receipt.jpg')), false);
  });

  // 8. ROLLBACK ATÓMICO ANTE FALLO EN COMMIT DE JSON
  test('8. Fallo inducido durante commit de JSON activa Rollback Físico Completo', async () => {
    const originalTransactions = fs.readFileSync(path.join(tempFixtureDir, 'transactions_db.json'), 'utf8');
    const originalClients = fs.readFileSync(path.join(tempFixtureDir, 'clients_db.json'), 'utf8');

    await assert.rejects(
      async () => {
        await runAccountingReset({
          dataDir: tempFixtureDir,
          isDryRun: false,
          _simulateCommitFailure: true,
          logger: () => {}
        });
      },
      /ROLLBACK COMPLETADO/
    );

    // Comprobar que el rollback restauró los archivos a su estado original
    const restoredTransactions = fs.readFileSync(path.join(tempFixtureDir, 'transactions_db.json'), 'utf8');
    const restoredClients = fs.readFileSync(path.join(tempFixtureDir, 'clients_db.json'), 'utf8');

    assert.strictEqual(restoredTransactions, originalTransactions);
    assert.strictEqual(restoredClients, originalClients);
  });

  // 9. ROLLBACK ATÓMICO ANTE FALLO EN PURGA DE MEDIA (TODO-O-NADA)
  test('9. Fallo inducido durante purga de media activa Rollback Físico de JSON y Captures', async () => {
    const capturesDir = path.join(tempMediaDir, 'captures');
    fs.writeFileSync(path.join(capturesDir, 'receipt-1.jpg'), 'CAP_1');
    fs.writeFileSync(path.join(capturesDir, 'receipt-2.jpg'), 'CAP_2');

    const pwaPayments = [
      { id: 'pwa-1', clientId: 'cli-1', receiptFileName: 'receipt-1.jpg', amount: 10 },
      { id: 'pwa-2', clientId: 'cli-2', receiptFileName: 'receipt-2.jpg', amount: 20 }
    ];
    fs.writeFileSync(path.join(tempFixtureDir, 'pwa_payments_db.json'), JSON.stringify(pwaPayments, null, 2));

    await assert.rejects(
      async () => {
        await runAccountingReset({
          dataDir: tempFixtureDir,
          mediaDir: tempMediaDir,
          isDryRun: false,
          purgeReceipts: true,
          _simulateMediaPurgeFailure: true,
          logger: () => {}
        });
      },
      /ROLLBACK COMPLETADO/
    );

    // Ambas captures deben estar presentes en captures/ gracias al rollback
    assert.strictEqual(fs.existsSync(path.join(capturesDir, 'receipt-1.jpg')), true);
    assert.strictEqual(fs.existsSync(path.join(capturesDir, 'receipt-2.jpg')), true);

    // pwa_payments_db.json debe haber restaurado los 2 pagos
    const restoredPwa = JSON.parse(fs.readFileSync(path.join(tempFixtureDir, 'pwa_payments_db.json'), 'utf8'));
    assert.strictEqual(restoredPwa.length, 2);
  });

  // 10. RESTORE FÍSICO DE MEDIA DESDE BACKUP
  test('10. Restauración física de comprobantes desde el backup verifica SHA256 bit a bit', async () => {
    const capturesDir = path.join(tempMediaDir, 'captures');
    const rawC1 = 'BINARY_DATA_RECEIPT_1_RESTORE_TEST';
    const rawC2 = 'BINARY_DATA_RECEIPT_2_RESTORE_TEST';
    fs.writeFileSync(path.join(capturesDir, 'r1.jpg'), rawC1);
    fs.writeFileSync(path.join(capturesDir, 'r2.jpg'), rawC2);

    const pwaPayments = [
      { id: 'pwa-r1', clientId: 'cli-1', receiptFileName: 'r1.jpg', amount: 100 },
      { id: 'pwa-r2', clientId: 'cli-2', receiptFileName: 'r2.jpg', amount: 200 }
    ];
    fs.writeFileSync(path.join(tempFixtureDir, 'pwa_payments_db.json'), JSON.stringify(pwaPayments, null, 2));

    const res = await runAccountingReset({
      dataDir: tempFixtureDir,
      mediaDir: tempMediaDir,
      isDryRun: false,
      purgeReceipts: true,
      logger: () => {}
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(fs.existsSync(path.join(capturesDir, 'r1.jpg')), false);
    assert.strictEqual(fs.existsSync(path.join(capturesDir, 'r2.jpg')), false);

    // Restaurar manualmente desde mediaBackupDir
    for (const f of fs.readdirSync(res.mediaBackupDir)) {
      if (f !== 'manifest.json') {
        fs.copyFileSync(path.join(res.mediaBackupDir, f), path.join(capturesDir, f));
      }
    }

    assert.strictEqual(fs.readFileSync(path.join(capturesDir, 'r1.jpg'), 'utf8'), rawC1);
    assert.strictEqual(fs.readFileSync(path.join(capturesDir, 'r2.jpg'), 'utf8'), rawC2);
    assert.strictEqual(sha256(fs.readFileSync(path.join(capturesDir, 'r1.jpg'))), sha256(rawC1));
  });

  // 11. IDEMPOTENCIA
  test('11. Idempotencia: Ejecución repetida sobre fixture ya reseteado mantiene consistencia', async () => {
    await runAccountingReset({ dataDir: tempFixtureDir, isDryRun: false, logger: () => {} });

    const clients1 = fs.readFileSync(path.join(tempFixtureDir, 'clients_db.json'), 'utf8');
    const products1 = fs.readFileSync(path.join(tempFixtureDir, 'products_db.json'), 'utf8');

    const res2 = await runAccountingReset({ dataDir: tempFixtureDir, isDryRun: false, logger: () => {} });
    assert.strictEqual(res2.success, true);

    const clients2 = fs.readFileSync(path.join(tempFixtureDir, 'clients_db.json'), 'utf8');
    const products2 = fs.readFileSync(path.join(tempFixtureDir, 'products_db.json'), 'utf8');

    assert.strictEqual(clients1, clients2);
    assert.strictEqual(products1, products2);
  });
});
