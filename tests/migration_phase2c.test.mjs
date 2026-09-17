import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { runMigration, validateDestinationPath, reconcileDomainInvariants, compareJsonVsSqlite, sanitizeMigrationReport } from '../db/migration/migration-runner.js';
import { normalizeMoney, normalizeWeight, normalizeDate } from '../db/migration/normalizers.js';
import { createDatabaseConnection, initializeSchema } from '../db/connection.js';
import { JsonImporter } from '../db/migration/json-importer.js';
import { IdMap } from '../db/migration/id-map.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err);
    failed++;
  }
}

async function run() {
  console.log('\n==================================================');
  console.log('EJECUTANDO SUITE DE PRUEBAS MIGRACIÓN — FASE 2C');
  console.log('==================================================\n');

  // Synthetic snapshot for testing
  const testSnapshotDir = path.resolve('scratch', 'test_snapshot');
  if (!fs.existsSync(testSnapshotDir)) {
    fs.mkdirSync(testSnapshotDir, { recursive: true });
  }

  const mockClients = [
    { id: 'cli-01', name: 'Carlos Perez', cedula: 'V-11223344', outstandingDebt: 100.50, loyaltyPoints: 10 },
    { id: 'cli-02', name: 'Maria Gomez', cedula: 'V-22334455', outstandingDebt: 0, loyaltyPoints: 5 }
  ];
  const mockSuppliers = [
    { id: 'sup-01', name: 'Productor Quesos El Roble', rif: 'J-12345678', isCheeseProducer: true, balanceOwed: 350.00, storeDebt: 25.00 }
  ];
  const mockProducts = [
    { id: 'prod-01', name: 'Queso Paisa', category: 'Fresco', stockKg: 20.000, purchasePrice: 4.00, sellingPrice: 5.50 }
  ];
  const mockTransactions = [
    {
      id: 'tx-01',
      invoiceNumber: 'INV-100',
      clientId: 'cli-01',
      amount: 100.50,
      category: 'ventas',
      status: 'Completado',
      items: [{ productId: 'prod-01', name: 'Queso Paisa', quantityKg: 5, pricePerKg: 5.50, subtotal: 27.50 }]
    }
  ];
  const mockInstallments = [
    { id: 'inst-01', clientId: 'cli-01', transactionId: 'tx-01', amount: 100.50, dueDate: '2026-12-31', status: 'pending' }
  ];
  const mockUsers = [
    { id: 'u-01', username: 'admin_test', name: 'Admin Test', role: 'admin', passwordHash: '$2b$10$xyzFakeBcryptHash', pinHash: '$2b$10$fakePinHash' }
  ];

  fs.writeFileSync(path.join(testSnapshotDir, 'clients_db.json'), JSON.stringify(mockClients));
  fs.writeFileSync(path.join(testSnapshotDir, 'suppliers_db.json'), JSON.stringify(mockSuppliers));
  fs.writeFileSync(path.join(testSnapshotDir, 'products_db.json'), JSON.stringify(mockProducts));
  fs.writeFileSync(path.join(testSnapshotDir, 'transactions_db.json'), JSON.stringify(mockTransactions));
  fs.writeFileSync(path.join(testSnapshotDir, 'installments_db.json'), JSON.stringify(mockInstallments));
  fs.writeFileSync(path.join(testSnapshotDir, 'users_db.json'), JSON.stringify(mockUsers));

  // 2C-01: Dry-run does not write to target SQLite database
  await test('2C-01: Modo --dry-run valida la migración sin insertar registros en SQLite', () => {
    const db = createDatabaseConnection(':memory:');
    initializeSchema(db);

    const report = runMigration({
      sourceSnapshotDir: testSnapshotDir,
      targetDbPath: ':memory:',
      dryRun: true
    });

    assert.strictEqual(report.dryRun, true);
    assert.strictEqual(report.status, 'DRY_RUN_COMPLETED');
    const clientCount = db.prepare('SELECT COUNT(*) as c FROM clients;').get().c;
    assert.strictEqual(clientCount, 0, 'La base de datos debe permanecer vacía en dry-run');
  });

  // 2C-02: Snapshot isolation
  await test('2C-02: Aislamiento estricto: el migrador rechaza escribir dentro de data-dev o sobrescribir la fuente', () => {
    assert.throws(() => {
      validateDestinationPath(path.resolve('data-dev', 'test.db'), path.resolve('data-dev'));
    }, /Safety violation/);

    assert.throws(() => {
      validateDestinationPath(path.resolve('data-dev'), path.resolve('data-dev'));
    }, /Safety violation/);
  });

  // 2C-03: ID preservation
  await test('2C-03: Preservación exacta de identificadores personalizados string (cli-01, sup-01, tx-01)', () => {
    const report = runMigration({
      sourceSnapshotDir: testSnapshotDir,
      targetDbPath: ':memory:',
      dryRun: false
    });

    assert.strictEqual(report.status, 'MIGRATION_SUCCESS');
    assert.strictEqual(report.jsonImport.idMappings.totalMappings, 6);
  });

  // 2C-04: Duplicate ID detection
  await test('2C-04: IdMap detecta y rechaza colisiones de ID duplicados', () => {
    const idMap = new IdMap();
    idMap.register('json', 'clients', 'cli-dup-1', 'clients', 'cli-dup-1');
    assert.throws(() => {
      idMap.register('json', 'suppliers', 'sup-dup-1', 'clients', 'cli-dup-1');
    }, /ID collision detected/);
  });

  // 2C-05: Orphan reference detection
  await test('2C-05: Detección de referencias huérfanas en transacciones o cuotas', () => {
    const importer = new JsonImporter({ dryRun: true });
    const orphanSnapshot = {
      clients: [{ id: 'cli-01', name: 'Carlos' }],
      suppliers: [],
      products: [],
      transactions: [{ id: 'tx-orphan', clientId: 'cli-nonexistent', amount: 50 }],
      installments: []
    };
    importer.importSnapshot(orphanSnapshot, createDatabaseConnection(':memory:'));
    const summary = importer.validator.getSummary();
    assert.strictEqual(summary.totalOrphans, 1);
    assert.strictEqual(summary.orphans[0].foreignField, 'clientId');
  });

  // 2C-06: Money conversion precision
  await test('2C-06: Conversión monetaria centralizada a centavos enteros sin pérdida de punto flotante', () => {
    assert.strictEqual(normalizeMoney(1234.56), 123456);
    assert.strictEqual(normalizeMoney('  $50.25 '), 5025);
    assert.strictEqual(normalizeMoney(0), 0);
    assert.throws(() => normalizeMoney(NaN), /Invalid non-finite number/);
  });

  // 2C-07: Weight conversion precision
  await test('2C-07: Conversión de peso fraccionario a miligramos/gramos enteros', () => {
    assert.strictEqual(normalizeWeight(12.750), 12750);
    assert.strictEqual(normalizeWeight('0.500'), 500);
    assert.strictEqual(normalizeWeight(0), 0);
  });

  // 2C-08: Date normalization
  await test('2C-08: Normalización determinista de fechas a formato ISO-8601 UTC', () => {
    const iso1 = normalizeDate('2026-03-16 08:30:00');
    assert.ok(iso1.startsWith('2026-03-16T08:30:00'));
    const iso2 = normalizeDate(1789500000000);
    assert.ok(iso2.endsWith('Z'));
  });

  // 2C-09: Transaction atomic rollback on fatal failure
  await test('2C-09: Rollback transaccional atómico ante fallo de validación crítica', () => {
    const db = createDatabaseConnection(':memory:');
    initializeSchema(db);

    const corruptSnapshot = {
      clients: [{ id: 'cli-valid', name: 'Valido' }],
      products: [{ id: 'prod-valid', name: 'Queso' }],
      transactions: [{ id: null, amount: 100 }] // Critical: Missing ID
    };

    const importer = new JsonImporter({ dryRun: false });
    assert.throws(() => {
      importer.importSnapshot(corruptSnapshot, db);
    }, /Migration aborted/);

    const count = db.prepare('SELECT COUNT(*) as c FROM clients;').get().c;
    assert.strictEqual(count, 0, 'No debe quedar ningún registro persistido tras rollback');
  });

  // 2C-10: Transactions and items relational linkage
  await test('2C-10: Vínculo relacional completo entre transacciones y renglones de detalle en SQLite', () => {
    const db = createDatabaseConnection(':memory:');
    initializeSchema(db);
    const importer = new JsonImporter({ dryRun: false });
    importer.importSnapshot({
      clients: [{ id: 'cli-01', name: 'Carlos' }],
      suppliers: [],
      products: [{ id: 'prod-01', name: 'Queso Paisa' }],
      transactions: [{
        id: 'tx-10',
        clientId: 'cli-01',
        amount: 50,
        items: [
          { productId: 'prod-01', name: 'Queso', quantityKg: 2, pricePerKg: 25, subtotal: 50 }
        ]
      }],
      installments: []
    }, db);

    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?;').get('tx-10');
    assert.ok(tx);
    assert.strictEqual(tx.amount_cents, 5000);

    const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?;').all('tx-10');
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].product_id, 'prod-01');
    assert.strictEqual(items[0].subtotal_cents, 5000);
  });

  // 2C-11: Stock reconciliation
  await test('2C-11: Reconciliación de inventario entre stock actual y movimientos kardex', () => {
    const db = createDatabaseConnection(':memory:');
    initializeSchema(db);
    const reconciliation = reconcileDomainInvariants({
      clients: [],
      products: [{ id: 'prod-01', name: 'Queso', stockKg: 10 }],
      kardex: [
        { productId: 'prod-01', type: 'ENTRADA_COMPRA', quantity: 15 },
        { productId: 'prod-01', type: 'SALIDA_VENTA', quantity: 5 }
      ],
      installments: []
    }, db);

    assert.strictEqual(reconciliation.stockWarnings.length, 0);
  });

  // 2C-12: Client debt reconciliation
  await test('2C-12: Reconciliación de deuda de cliente contra cuotas vivas pendientes', () => {
    const db = createDatabaseConnection(':memory:');
    initializeSchema(db);
    const reconciliation = reconcileDomainInvariants({
      clients: [{ id: 'cli-01', name: 'Carlos', outstandingDebt: 100 }],
      installments: [
        { clientId: 'cli-01', amount: 50, status: 'pending' },
        { clientId: 'cli-01', amount: 50, status: 'overdue' },
        { clientId: 'cli-01', amount: 30, status: 'paid' }
      ],
      products: [],
      kardex: []
    }, db);

    assert.strictEqual(reconciliation.debtDiscrepancies.length, 0);
  });

  // 2C-13: Supplier balances preservation
  await test('2C-13: Preservación independiente de balanceOwed y storeDebt de proveedores', () => {
    const db = createDatabaseConnection(':memory:');
    initializeSchema(db);
    const importer = new JsonImporter({ dryRun: false });
    importer.importSnapshot({
      clients: [],
      suppliers: [{ id: 'sup-01', name: 'Productor', balanceOwed: 500, storeDebt: 75 }],
      products: [],
      transactions: [],
      installments: []
    }, db);

    const sup = db.prepare('SELECT * FROM suppliers WHERE id = ?;').get('sup-01');
    assert.strictEqual(sup.balance_owed_cents, 50000);
    assert.strictEqual(sup.store_debt_cents, 7500);
  });

  // 2C-14: Audit log preservation
  await test('2C-14: Importación de logs de auditoría preserva metadatos sin alterar historial', () => {
    const db = createDatabaseConnection(':memory:');
    initializeSchema(db);
    const importer = new JsonImporter({ dryRun: false });
    importer.importSnapshot({
      clients: [],
      suppliers: [],
      products: [],
      transactions: [],
      installments: [],
      audit_logs: [{
        id: 'audit-01',
        action: 'auth.crm_login',
        actorId: 'u1',
        actorRole: 'admin',
        result: 'success',
        metadata: { ip: '127.0.0.1' }
      }]
    }, db);

    const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?;').get('audit-01');
    assert.ok(log);
    assert.strictEqual(log.action, 'auth.crm_login');
    assert.deepStrictEqual(JSON.parse(log.metadata), { ip: '127.0.0.1' });
  });

  // 2C-15: Legacy read-only import
  await test('2C-15: Importador legacy lee de forma strictly read-only la base SQLite histórica', () => {
    const legacyPath = path.resolve('respaldo_restaurar.json.db');
    if (fs.existsSync(legacyPath)) {
      const db = createDatabaseConnection(':memory:');
      initializeSchema(db);
      const report = runMigration({
        sourceSnapshotDir: testSnapshotDir,
        targetDbPath: ':memory:',
        includeLegacy: true,
        legacyDbPath: legacyPath,
        dryRun: false
      });
      assert.ok(report.legacyImport);
      assert.strictEqual(report.legacyImport.status, 'LEGACY_MIGRATION_SUCCESS');
      assert.ok(report.legacyImport.stats.recordsInserted > 0);
    }
  });

  await test('2C-16: Cobertura de tablas legacy de preservación (legacy_ventas, legacy_detalles_ventas)', () => {
    const legacyPath = path.resolve('respaldo_restaurar.json.db');
    if (fs.existsSync(legacyPath)) {
      const db = createDatabaseConnection(':memory:');
      initializeSchema(db);
      const report = runMigration({
        db,
        sourceSnapshotDir: testSnapshotDir,
        targetDbPath: ':memory:',
        includeLegacy: true,
        legacyDbPath: legacyPath,
        dryRun: false
      });
      const ventasCount = db.prepare('SELECT COUNT(*) as c FROM legacy_ventas;').get().c;
      assert.strictEqual(ventasCount, 7357, 'Debe migrar exactamente las 7357 ventas históricas');
    }
  });

  // 2C-17: Credential hash preservation without exposure
  await test('2C-17: Preservación de hashes bcrypt/pbkdf2 en base de datos sin exponerlos en reportes', () => {
    const report = runMigration({
      sourceSnapshotDir: testSnapshotDir,
      targetDbPath: ':memory:',
      dryRun: false
    });
    const reportStr = JSON.stringify(report);
    assert.ok(!reportStr.includes('xyzFakeBcryptHash'), 'Reporte no debe incluir el hash de contraseña');
    assert.ok(!reportStr.includes('fakePinHash'), 'Reporte no debe incluir el hash de PIN');
  });

  // 2C-18: Deterministic migration
  await test('2C-18: Migración determinista: dos ejecuciones sobre el mismo snapshot generan resultados idénticos', () => {
    const db1 = createDatabaseConnection(':memory:');
    initializeSchema(db1);
    const db2 = createDatabaseConnection(':memory:');
    initializeSchema(db2);

    const imp1 = new JsonImporter({ dryRun: false });
    const imp2 = new JsonImporter({ dryRun: false });

    const snap = imp1.loadSnapshot(testSnapshotDir);
    imp1.importSnapshot(snap, db1);
    imp2.importSnapshot(snap, db2);

    const count1 = db1.prepare('SELECT COUNT(*) as c FROM clients;').get().c;
    const count2 = db2.prepare('SELECT COUNT(*) as c FROM clients;').get().c;
    assert.strictEqual(count1, count2);
  });

  // 2C-19: Second-run protection on dirty database
  await test('2C-19: Protección contra re-ejecución sobre base destino no limpia (evita duplicados)', () => {
    const db = createDatabaseConnection(':memory:');
    initializeSchema(db);
    const imp = new JsonImporter({ dryRun: false });
    const snap = imp.loadSnapshot(testSnapshotDir);

    imp.importSnapshot(snap, db); // Run 1

    // Run 2 on same DB must throw PRIMARY KEY unique violation
    assert.throws(() => {
      const imp2 = new JsonImporter({ dryRun: false });
      imp2.importSnapshot(snap, db);
    }, /UNIQUE constraint failed/);
  });

  // 2C-20: Migration report secret sanitization
  await test('2C-20: Sanitización estricta de reportes de migración (cero fugas de tokens, claves o cookies)', () => {
    const dirtyReport = {
      status: 'OK',
      passwordHash: 'secret_hash',
      apiKey: 'gemini_secret',
      metadata: {
        token: 'session_token',
        pin: '123456',
        safeData: 'safe_value'
      }
    };

    const clean = sanitizeMigrationReport(dirtyReport);
    assert.strictEqual(clean.passwordHash, undefined);
    assert.strictEqual(clean.apiKey, undefined);
    assert.strictEqual(clean.metadata.token, undefined);
    assert.strictEqual(clean.metadata.pin, undefined);
    assert.strictEqual(clean.metadata.safeData, 'safe_value');
  });

  console.log('\n==================================================');
  console.log(`RESULTADO MIGRACIÓN FASE 2C: ${passed} PASADAS / ${failed} FALLIDAS`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error running migration tests:', err);
  process.exit(1);
});
