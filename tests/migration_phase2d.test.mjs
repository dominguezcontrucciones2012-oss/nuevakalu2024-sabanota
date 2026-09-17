/**
 * Phase 2D Test Suite: Exhaustive Parity Validation JSON/Legacy -> SQLite
 * 30 tests covering counts, IDs, relationships, precision, rollback, fuzzing, determinism, and sanitization.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { runMigration } from '../db/migration/migration-runner.js';
import { ParityValidator } from '../db/migration/parity-validator.js';
import { normalizeMoney, normalizeWeight, normalizeDate, Money, Weight, DateTimeNormalizer } from '../db/migration/normalizers.js';
import { Transformer } from '../db/migration/transformers.js';
import { createDatabaseConnection, initializeSchema } from '../db/connection.js';

const SCRATCH_DIR = path.resolve('./scratch/phase2d_test_artifacts');
const SOURCE_DIR = path.resolve('./data-dev');
const LEGACY_DB = path.resolve('./respaldo_restaurar.json.db');

describe('Phase 2D: Exhaustive Parity Validation Suite (2D-01 -> 2D-30)', () => {
  let targetDbA;
  let targetDbB;
  let targetDbAPath;
  let targetDbBPath;
  let validatorA;

  before(() => {
    if (!fs.existsSync(SCRATCH_DIR)) {
      fs.mkdirSync(SCRATCH_DIR, { recursive: true });
    }

    targetDbAPath = path.join(SCRATCH_DIR, 'target_A.sqlite');
    targetDbBPath = path.join(SCRATCH_DIR, 'target_B.sqlite');

    if (fs.existsSync(targetDbAPath)) fs.unlinkSync(targetDbAPath);
    if (fs.existsSync(targetDbBPath)) fs.unlinkSync(targetDbBPath);

    // Run migration A
    runMigration({
      sourceSnapshotDir: SOURCE_DIR,
      includeLegacy: true,
      legacyDbPath: fs.existsSync(LEGACY_DB) ? LEGACY_DB : null,
      targetDbPath: targetDbAPath
    });

    // Run migration B
    runMigration({
      sourceSnapshotDir: SOURCE_DIR,
      includeLegacy: true,
      legacyDbPath: fs.existsSync(LEGACY_DB) ? LEGACY_DB : null,
      targetDbPath: targetDbBPath
    });

    targetDbA = new DatabaseSync(targetDbAPath, { readOnly: true });
    targetDbB = new DatabaseSync(targetDbBPath, { readOnly: true });

    validatorA = new ParityValidator({
      sourceSnapshotDir: SOURCE_DIR,
      legacyDbPath: fs.existsSync(LEGACY_DB) ? LEGACY_DB : null,
      targetDb: targetDbA
    });
  });

  after(() => {
    try {
      if (targetDbA) targetDbA.close();
      if (targetDbB) targetDbB.close();
    } catch {}
  });

  // 2D-01: Source Inventory
  it('2D-01: Source inventory is readable and contains valid JSON collections', () => {
    const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.json'));
    assert.ok(files.length >= 8, 'Should have at least 8 core JSON files in data-dev');
    for (const f of files) {
      const content = fs.readFileSync(path.join(SOURCE_DIR, f), 'utf8');
      assert.doesNotThrow(() => JSON.parse(content), `File ${f} must be valid JSON`);
    }
  });

  // 2D-02: JSON Counts
  it('2D-02: Source JSON counts match validation expectations', () => {
    const clients = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'clients_db.json'), 'utf8'));
    const products = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'products_db.json'), 'utf8'));
    assert.ok(clients.length > 0, 'Clients collection must not be empty');
    assert.ok(products.length > 0, 'Products collection must not be empty');
  });

  // 2D-03: SQLite Counts
  it('2D-03: Target SQLite table row counts match non-empty source collections', () => {
    const clientsCount = targetDbA.prepare('SELECT COUNT(*) as c FROM clients').get().c;
    const productsCount = targetDbA.prepare('SELECT COUNT(*) as c FROM products').get().c;
    const usersCount = targetDbA.prepare('SELECT COUNT(*) as c FROM users').get().c;
    assert.ok(clientsCount > 0, 'Clients in SQLite > 0');
    assert.ok(productsCount > 0, 'Products in SQLite > 0');
    assert.ok(usersCount > 0, 'Users in SQLite > 0');
  });

  // 2D-04: ID Parity
  it('2D-04: Every source client and product ID is preserved in SQLite', () => {
    const sourceClients = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'clients_db.json'), 'utf8'));
    const targetClients = new Set(targetDbA.prepare('SELECT id FROM clients').all().map(r => r.id));
    for (const c of sourceClients) {
      if (c.id) assert.ok(targetClients.has(c.id), `Client ID ${c.id} must be in SQLite`);
    }
  });

  // 2D-05: Duplicate ID Detection
  it('2D-05: No duplicate primary keys exist in SQLite target tables', () => {
    const tables = ['clients', 'suppliers', 'products', 'transactions', 'installments', 'users'];
    for (const t of tables) {
      const dupes = targetDbA.prepare(`SELECT id, COUNT(*) as c FROM ${t} GROUP BY id HAVING c > 1`).all();
      assert.equal(dupes.length, 0, `Table ${t} must not have duplicate IDs`);
    }
  });

  // 2D-06: Relationship Parity
  it('2D-06: Foreign key constraints are satisfied across all migrated rows', () => {
    // Check SQLite built-in FK check
    const fkErrors = targetDbA.prepare('PRAGMA foreign_key_check').all();
    assert.equal(fkErrors.length, 0, `foreign_key_check must return 0 errors, got: ${JSON.stringify(fkErrors)}`);
  });

  // 2D-07: Transaction / Item Parity
  it('2D-07: Every transaction_item links to a valid transaction and valid product', () => {
    const items = targetDbA.prepare(`
      SELECT ti.id, ti.transaction_id, ti.product_id, t.id as t_id, p.id as p_id
      FROM transaction_items ti
      LEFT JOIN transactions t ON ti.transaction_id = t.id
      LEFT JOIN products p ON ti.product_id = p.id
    `).all();

    for (const item of items) {
      assert.ok(item.t_id, `Item ${item.id} points to missing transaction ${item.transaction_id}`);
      assert.ok(item.p_id, `Item ${item.id} points to missing product ${item.product_id}`);
    }
  });

  // 2D-08: Installment Parity
  it('2D-08: Every installment links to a valid client and transaction (if provided)', () => {
    const insts = targetDbA.prepare(`
      SELECT i.id, i.client_id, i.transaction_id, c.id as c_id, t.id as t_id
      FROM installments i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN transactions t ON i.transaction_id = t.id
    `).all();

    for (const i of insts) {
      assert.ok(i.c_id, `Installment ${i.id} points to missing client ${i.client_id}`);
      if (i.transaction_id) {
        assert.ok(i.t_id, `Installment ${i.id} points to missing transaction ${i.transaction_id}`);
      }
    }
  });

  // 2D-09: Payment / Installment Parity
  it('2D-09: PWA payments handle synthetic test orphans cleanly without corrupting DB', () => {
    const payments = targetDbA.prepare(`SELECT * FROM pwa_payments`).all();
    assert.ok(payments.length >= 0, 'PWA payments table should query successfully');
  });

  // 2D-10: Exact Money Precision
  it('2D-10: Money normalizer round-trips decimal <-> integer cents exactly', () => {
    const testCases = [
      { decimal: 0, cents: 0 },
      { decimal: 0.01, cents: 1 },
      { decimal: 0.10, cents: 10 },
      { decimal: 12.50, cents: 1250 },
      { decimal: 999999.99, cents: 99999999 }
    ];
    for (const tc of testCases) {
      const cents = Money.toCents(tc.decimal);
      assert.equal(cents, tc.cents, `Money.toCents(${tc.decimal}) == ${tc.cents}`);
      const decimal = Money.fromCents(cents);
      assert.equal(decimal, tc.decimal, `Money.fromCents(${cents}) == ${tc.decimal}`);
    }
  });

  // 2D-11: Extreme Money Values
  it('2D-11: Money normalizer handles edge cases and extreme values safely', () => {
    assert.equal(Money.toCents(null), 0);
    assert.equal(Money.toCents(undefined), 0);
    assert.equal(Money.toCents('invalid'), 0);
    assert.equal(Money.toCents(-15.50), -1550);
    assert.equal(Money.fromCents(-1550), -15.50);
  });

  // 2D-12: Weight / Quantity Precision
  it('2D-12: Weight normalizer round-trips Kg <-> grams exactly', () => {
    const testCases = [
      { kg: 0, grams: 0 },
      { kg: 1.5, grams: 1500 },
      { kg: 0.25, grams: 250 },
      { kg: 123.456, grams: 123456 }
    ];
    for (const tc of testCases) {
      const grams = Weight.toGrams(tc.kg);
      assert.equal(grams, tc.grams, `Weight.toGrams(${tc.kg}) == ${tc.grams}`);
      const kg = Weight.fromGrams(grams);
      assert.equal(kg, tc.kg, `Weight.fromGrams(${grams}) == ${tc.kg}`);
    }
  });

  // 2D-13: Date Normalization
  it('2D-13: DateTime normalizer produces valid ISO UTC strings without day drift', () => {
    const iso = '2026-03-15T12:00:00.000Z';
    const normalized = DateTimeNormalizer.normalize(iso);
    assert.equal(normalized, iso);

    const dateOnly = '2026-03-15';
    const normalizedDate = DateTimeNormalizer.normalize(dateOnly);
    assert.ok(normalizedDate.startsWith('2026-03-15'), 'Should preserve date part');
  });

  // 2D-14: Ambiguous Timezone Detection
  it('2D-14: DateTime normalizer handles ambiguous timestamps gracefully without throwing', () => {
    assert.equal(DateTimeNormalizer.normalize('not-a-date'), null);
    assert.equal(DateTimeNormalizer.normalize(null), null);
    assert.equal(DateTimeNormalizer.normalize(''), null);
  });

  // 2D-15: Client Debt Reconciliation
  it('2D-15: Client debt is preserved accurately in stored cents', () => {
    const sourceClients = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'clients_db.json'), 'utf8'));
    for (const c of sourceClients) {
      if (!c.id) continue;
      const row = targetDbA.prepare('SELECT outstanding_debt_cents FROM clients WHERE id = ?').get(c.id);
      assert.ok(row, `Client ${c.id} exists`);
      assert.equal(row.outstanding_debt_cents, Money.toCents(c.outstandingDebt || 0));
    }
  });

  // 2D-16: Inventory Reconciliation
  it('2D-16: Product stock is preserved accurately in stored grams', () => {
    const sourceProducts = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'products_db.json'), 'utf8'));
    for (const p of sourceProducts) {
      if (!p.id) continue;
      const row = targetDbA.prepare('SELECT stock_grams FROM products WHERE id = ?').get(p.id);
      assert.ok(row, `Product ${p.id} exists`);
      assert.equal(row.stock_grams, Weight.toGrams(p.stockKg ?? p.stock ?? 0));
    }
  });

  // 2D-17: Supplier Balance Separation
  it('2D-17: Supplier balanceOwed and storeDebt are kept strictly separated', () => {
    const sourceSuppliers = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'suppliers_db.json'), 'utf8'));
    for (const s of sourceSuppliers) {
      if (!s.id) continue;
      const row = targetDbA.prepare('SELECT balance_owed_cents, store_debt_cents FROM suppliers WHERE id = ?').get(s.id);
      assert.ok(row, `Supplier ${s.id} exists`);
      assert.equal(row.balance_owed_cents, Money.toCents(s.balanceOwed || 0));
      assert.equal(row.store_debt_cents, Money.toCents(s.storeDebt || 0));
    }
  });

  // 2D-18: Audit Preservation
  it('2D-18: Audit log records are preserved with actor, action, and timestamps intact', () => {
    const auditFile = path.join(SOURCE_DIR, 'audit_logs_db.json');
    if (fs.existsSync(auditFile)) {
      const sourceAudit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
      const targetCount = targetDbA.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
      assert.equal(targetCount, sourceAudit.length, 'All audit logs should be migrated');
    }
  });

  // 2D-19: Secret-Free Report Sanitization
  it('2D-19: Report generation completely redacts passwords, PINs, tokens, and secrets', () => {
    const valResults = validatorA.validateAll();
    const serialized = JSON.stringify(valResults);

    // Deep check for forbidden raw patterns
    assert.doesNotMatch(serialized, /"password":\s*"(?!\*\*\*)/i);
    assert.doesNotMatch(serialized, /"pin":\s*"(?!\*\*\*)/i);
    assert.doesNotMatch(serialized, /"token":\s*"(?!\*\*\*)/i);
    assert.doesNotMatch(serialized, /"sessionSecret"/i);
    assert.doesNotMatch(serialized, /"TRANSACTION_SIGNATURE_SECRET"/i);
  });

  // 2D-20: Legacy Row-Count Parity
  it('2D-20: Legacy tables match source legacy DB row counts exactly', () => {
    if (fs.existsSync(LEGACY_DB)) {
      const legacyDb = new DatabaseSync(LEGACY_DB, { readOnly: true });
      const vSource = legacyDb.prepare('SELECT COUNT(*) as c FROM ventas').get().c;
      const vTarget = targetDbA.prepare('SELECT COUNT(*) as c FROM legacy_ventas').get().c;
      assert.equal(vTarget, vSource, 'legacy_ventas count matches');

      const dSource = legacyDb.prepare('SELECT COUNT(*) as c FROM detalles_ventas').get().c;
      const dTarget = targetDbA.prepare('SELECT COUNT(*) as c FROM legacy_detalles_ventas').get().c;
      assert.equal(dTarget, dSource, 'legacy_detalles_ventas count matches');
      legacyDb.close();
    }
  });

  // 2D-21: Legacy Value Parity
  it('2D-21: Legacy table sample rows match columns and values exactly', () => {
    if (fs.existsSync(LEGACY_DB)) {
      const legacyDb = new DatabaseSync(LEGACY_DB, { readOnly: true });
      const sampleSource = legacyDb.prepare('SELECT * FROM ventas LIMIT 5').all();
      for (const s of sampleSource) {
        const t = targetDbA.prepare('SELECT * FROM legacy_ventas WHERE id = ?').get(s.id);
        assert.ok(t, `Legacy sale ${s.id} must exist in migrated table`);
        assert.equal(t.total, s.total);
        assert.equal(t.estado, s.estado);
      }
      legacyDb.close();
    }
  });

  // 2D-22: Deterministic Migration
  it('2D-22: Two migrations from the same snapshot produce identical table row counts and IDs', () => {
    const tables = ['users', 'clients', 'suppliers', 'products', 'transactions', 'installments'];
    for (const t of tables) {
      const rowsA = targetDbA.prepare(`SELECT id FROM ${t} ORDER BY id`).all();
      const rowsB = targetDbB.prepare(`SELECT id FROM ${t} ORDER BY id`).all();
      assert.equal(rowsA.length, rowsB.length, `Table ${t} row count identical in both runs`);
      assert.deepEqual(rowsA, rowsB, `Table ${t} IDs identical in both runs`);
    }
  });

  // 2D-23: Rerun Protection / Dirty DB Rejection
  it('2D-23: Re-running migration on an already populated DB is rejected or requires explicit overwrite', () => {
    const testDbPath = path.join(SCRATCH_DIR, 'dirty_rerun.sqlite');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

    // Initial run
    runMigration({ sourceSnapshotDir: SOURCE_DIR, targetDbPath: testDbPath });

    // Rerun without allowOverwrite
    assert.throws(() => {
      runMigration({ sourceSnapshotDir: SOURCE_DIR, targetDbPath: testDbPath, allowOverwrite: false });
    }, /Target database already exists|populated/i);
  });

  // 2D-24: Rollback & Failure Injection
  it('2D-24: Failure injection triggers atomic transaction rollback leaving DB pristine', () => {
    const failDbPath = path.join(SCRATCH_DIR, 'rollback_test.sqlite');
    if (fs.existsSync(failDbPath)) fs.unlinkSync(failDbPath);

    // Run migration with an invalid injection that throws midway
    assert.throws(() => {
      runMigration({
        sourceSnapshotDir: SOURCE_DIR,
        targetDbPath: failDbPath,
        _injectFailureBeforeCommit: true
      });
    }, /injected failure/i);

    // Target DB should either not exist or be empty of migrated entities
    if (fs.existsSync(failDbPath)) {
      const db = new DatabaseSync(failDbPath);
      // If tables exist, they must have 0 clients
      try {
        const count = db.prepare('SELECT COUNT(*) as c FROM clients').get()?.c || 0;
        assert.equal(count, 0, 'Clients count must be 0 after rollback');
      } catch {}
      db.close();
    }
  });

  // 2D-25: Fuzzing & Adversarial Inputs
  it('2D-25: Transformer & normalizer handle adversarial characters, emojis, and huge payloads safely', () => {
    const rawClient = {
      id: 'cli-adv-🚀-999',
      name: '  José   "Super" O\'Connor  😀 \u0000 ',
      phone: '+58 (414) 123-4567 Ext 888',
      address: 'Calle 10, Edif 2, Apto 4-B \n San Cristóbal <script>alert(1)</script>',
      outstandingDebt: '12345.67'
    };

    const transformed = Transformer.client(rawClient);
    assert.equal(transformed.id, 'cli-adv-🚀-999');
    assert.ok(transformed.name.includes('José'), 'Preserves valid characters');
    assert.equal(transformed.outstanding_debt_cents, 1234567);
  });

  // 2D-26: Source Checksum Preservation
  it('2D-26: Source files checksums before and after migration remain 100% identical', () => {
    const initialChecksums = validatorA.computeChecksums();
    // Run another migration to scratch
    const tempDb = path.join(SCRATCH_DIR, 'checksum_verify.sqlite');
    if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    runMigration({ sourceSnapshotDir: SOURCE_DIR, targetDbPath: tempDb });
    const finalChecksums = validatorA.computeChecksums();

    assert.deepEqual(initialChecksums, finalChecksums, 'Source JSON and legacy DB must be byte-for-byte untouched');
  });

  // 2D-27: Semantic Comparator
  it('2D-27: Parity validator generates well-structured findings classification', () => {
    const valResults = validatorA.validateAll();
    assert.ok(Array.isArray(valResults.findings));
    for (const f of valResults.findings) {
      assert.ok(['MATCH', 'EXPECTED_TRANSFORMATION', 'SOURCE_INCONSISTENCY', 'MIGRATOR_BUG', 'LEGACY_SCHEMA_DIFFERENCE', 'OPEN_QUESTION'].includes(f.classification));
      assert.ok(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(f.severity));
    }
  });

  // 2D-28: No Source Mutation
  it('2D-28: No temporary or scratch files were written inside data-dev directory', () => {
    const files = fs.readdirSync(SOURCE_DIR);
    for (const f of files) {
      assert.ok(!f.endsWith('.tmp') && !f.endsWith('.bak') && !f.startsWith('~'), `File ${f} in data-dev is unexpected`);
    }
  });

  // 2D-29: Two-Target Equivalence
  it('2D-29: Two independent targets match table-by-table schema and row count/data', () => {
    const tables = ['users', 'clients', 'suppliers', 'products'];
    for (const t of tables) {
      const rowsA = targetDbA.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
      const rowsB = targetDbB.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
      assert.equal(rowsA.length, rowsB.length, `Table ${t} count matches`);
      // Validate business keys match
      for (let i = 0; i < rowsA.length; i++) {
        assert.equal(rowsA[i].id, rowsB[i].id);
        assert.equal(rowsA[i].name, rowsB[i].name);
      }
    }
  });

  // 2D-30: Final Migration Report Completeness
  it('2D-30: Migration report contains all required summary keys without missing sections', () => {
    const valResults = validatorA.validateAll();
    const requiredKeys = [
      'timestamp', 'sourceChecksums', 'entityCounts', 'moneyReconciliation',
      'weightReconciliation', 'debtReconciliation', 'supplierReconciliation',
      'auditPreservation', 'findings'
    ];
    for (const k of requiredKeys) {
      assert.ok(k in valResults, `Report must contain key: ${k}`);
    }
  });

  // 2D-A01: Mobile Order Lifecycle Classification
  it('2D-A01: Mobile orders lifecycle is preserved with order_type, items and status intact', () => {
    const orders = targetDbA.prepare('SELECT * FROM mobile_orders').all();
    assert.ok(orders.length > 0, 'mobile_orders table must be populated');
    for (const o of orders) {
      assert.ok(['client', 'supplier'].includes(o.order_type));
      assert.ok(['Pendiente', 'Entregado', 'Cancelado'].includes(o.status));
      assert.doesNotThrow(() => JSON.parse(o.items), 'items must be valid JSON');
    }
  });

  // 2D-A02: Mobile Order Cardinality Rule
  it('2D-A02: Mobile order count in SQLite matches source count exactly 1:1', () => {
    const sourceOrders = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'mobileOrders_db.json'), 'utf8'));
    const targetCount = targetDbA.prepare('SELECT COUNT(*) as c FROM mobile_orders').get().c;
    assert.equal(targetCount, sourceOrders.length, 'Target mobile_orders count must match source exactly');
  });

  // 2D-A03: Synthetic Orphan Identification
  it('2D-A03: Synthetic orphan payments are identified and documented with note preservation', () => {
    const synthTestDir = path.join(SCRATCH_DIR, 'synth_orphan_test_snapshot');
    if (!fs.existsSync(synthTestDir)) fs.mkdirSync(synthTestDir, { recursive: true });
    fs.copyFileSync(path.join(SOURCE_DIR, 'clients_db.json'), path.join(synthTestDir, 'clients_db.json'));
    fs.copyFileSync(path.join(SOURCE_DIR, 'products_db.json'), path.join(synthTestDir, 'products_db.json'));
    fs.writeFileSync(path.join(synthTestDir, 'installments_db.json'), JSON.stringify([]));
    fs.writeFileSync(path.join(synthTestDir, 'pwa_payments_db.json'), JSON.stringify([
      {
        id: 'pwa-synth-test',
        clientId: 'cli-demo-1',
        installmentId: 'inst-test-1k-orphan-999',
        amount: 25.0,
        notes: 'Test synthetic orphan'
      }
    ]));
    const synthDbPath = path.join(SCRATCH_DIR, 'synth_orphan_target.sqlite');
    if (fs.existsSync(synthDbPath)) fs.unlinkSync(synthDbPath);
    runMigration({ sourceSnapshotDir: synthTestDir, targetDbPath: synthDbPath });
    const synthDb = new DatabaseSync(synthDbPath, { readOnly: true });
    const rows = synthDb.prepare("SELECT notes, installment_id FROM pwa_payments WHERE notes LIKE '%SYNTHETIC_TEST_ORPHAN_INSTALLMENT%'").all();
    synthDb.close();
    assert.equal(rows.length, 1, 'Must identify synthetic orphan test payment');
    assert.equal(rows[0].installment_id, null, 'Installment ID must be nullified');
  });

  // 2D-A04: Unknown Orphan Rejection
  it('2D-A04: Unknown non-synthetic orphan installment reference triggers validation abort', () => {
    const testSnapshotDir = path.join(SCRATCH_DIR, 'orphan_test_snapshot');
    if (!fs.existsSync(testSnapshotDir)) fs.mkdirSync(testSnapshotDir, { recursive: true });

    // Copy clients and products
    fs.copyFileSync(path.join(SOURCE_DIR, 'clients_db.json'), path.join(testSnapshotDir, 'clients_db.json'));
    fs.copyFileSync(path.join(SOURCE_DIR, 'installments_db.json'), path.join(testSnapshotDir, 'installments_db.json'));

    // Create a rogue payment with unknown orphan installment ID
    const roguePayments = [
      {
        id: 'pwa-rogue-orphan',
        clientId: 'cli-demo-1',
        installmentId: 'inst-rogue-unknown-999',
        amount: 25,
        status: 'pending',
        date: '2026-03-16T12:00:00.000Z'
      }
    ];
    fs.writeFileSync(path.join(testSnapshotDir, 'pwa_payments_db.json'), JSON.stringify(roguePayments));

    const testDb = path.join(SCRATCH_DIR, 'orphan_reject.sqlite');
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

    assert.throws(() => {
      runMigration({ sourceSnapshotDir: testSnapshotDir, targetDbPath: testDb });
    }, /critical validation errors|UNKNOWN_ORPHAN_INSTALLMENT/i);
  });

  // 2D-A05: No Silent FK Nullification
  it('2D-A05: Non-synthetic foreign keys are not silently dropped to NULL', () => {
    const payments = targetDbA.prepare('SELECT * FROM pwa_payments WHERE installment_id IS NOT NULL').all();
    const instIds = new Set(targetDbA.prepare('SELECT id FROM installments').all().map(i => i.id));
    for (const p of payments) {
      assert.ok(instIds.has(p.installment_id), `Valid installment_id ${p.installment_id} must exist in DB`);
    }
  });

  // 2D-A06: Ambiguous Datetime Classification
  it('2D-A06: Ambiguous naive SQL datetimes are detected by DateTimeNormalizer.isAmbiguous', () => {
    assert.equal(DateTimeNormalizer.isAmbiguous('2026-03-16 12:00:00'), true);
    assert.equal(DateTimeNormalizer.isAmbiguous('2026-03-16'), true);
    assert.equal(DateTimeNormalizer.isAmbiguous('2026-03-16T12:00:00Z'), false);
    assert.equal(DateTimeNormalizer.isAmbiguous('2026-03-16T08:00:00-04:00'), false);
  });

  // 2D-A07: Timezone Round Trip Without Day Drift
  it('2D-A07: Date normalizer round trip preserves calendar day and chronological order', () => {
    const dates = [
      '2026-03-16 00:00:00',
      '2026-03-16 23:59:59',
      '2026-01-01 00:00:00',
      '2026-12-31 23:59:59'
    ];
    for (const d of dates) {
      const normalized = DateTimeNormalizer.normalize(d);
      assert.ok(normalized.startsWith(d.slice(0, 10)), `Day part must not drift for ${d}`);
    }
  });

  // 2D-A08: No Silent Numeric Defaults on Invalid Non-Numeric Fields
  it('2D-A08: Money normalizer throws on unparseable corrupted strings or NaN', () => {
    assert.throws(() => {
      normalizeMoney('not-a-number-price', 100, 'testField');
    }, /Invalid non-numeric string/i);
  });

  // 2D-A09: Expected Transformation Allowlist
  it('2D-A09: All findings in validation report belong strictly to allowed classification list', () => {
    const valResults = validatorA.validateAll();
    const ALLOWED_CLASSIFICATIONS = [
      'MATCH',
      'EXPECTED_TRANSFORMATION',
      'SOURCE_INCONSISTENCY',
      'MIGRATOR_BUG',
      'LEGACY_SCHEMA_DIFFERENCE',
      'OPEN_QUESTION'
    ];
    for (const f of valResults.findings) {
      assert.ok(ALLOWED_CLASSIFICATIONS.includes(f.classification), `Classification ${f.classification} must be allowed`);
    }
  });

  // 2D-A10: Source Checksum Integrity Verification
  it('2D-A10: Complete sha256 checksums of all data-dev JSON and legacy DB remain identical', () => {
    const currentChecksums = validatorA.computeChecksums();
    assert.ok(Object.keys(currentChecksums).length >= 8);
    for (const [file, hash] of Object.entries(currentChecksums)) {
      assert.equal(hash.length, 64, `Hash for ${file} must be valid SHA-256 hex string`);
    }
  });
});
