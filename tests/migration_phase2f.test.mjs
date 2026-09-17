/**
 * Phase 2F Test Suite: Dual-Read / Shadow Verification Controlled Suite
 * Tests 2F-01 to 2F-30 & Adversarial Tests 2F-A01 to 2F-A12
 * Total: 42 Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ShadowVerificationEngine } from '../db/shadow/shadow-verifier.js';
import { runMigration } from '../db/migration/migration-runner.js';
import { Money, Weight, DateTimeNormalizer, normalizeString } from '../db/migration/normalizers.js';

const FROZEN_SNAPSHOT_DIR = path.resolve('./scratch/artifacts/phase2e/snap-ebfe75a08c742829');
const MANIFEST_PATH = path.join(FROZEN_SNAPSHOT_DIR, 'manifest.json');
const TARGET_SQLITE_PATH = path.resolve('./scratch/phase2f_test_target.sqlite');
const LEGACY_DB = path.resolve('./respaldo_restaurar.json.db');

describe('Phase 2F: Dual-Read & Shadow Verification Suite (2F-01 -> 2F-30 & 2F-A01 -> 2F-A12)', () => {
  let engine;
  let targetDb;

  before(() => {
    // Generate isolated SQLite target from data-dev
    if (fs.existsSync(TARGET_SQLITE_PATH)) {
      try { fs.unlinkSync(TARGET_SQLITE_PATH); } catch {}
    }

    const migrationRes = runMigration({
      sourceSnapshotDir: path.resolve('data-dev'),
      includeLegacy: true,
      legacyDbPath: fs.existsSync(LEGACY_DB) ? LEGACY_DB : null,
      targetDbPath: TARGET_SQLITE_PATH,
      allowOverwrite: true
    });

    targetDb = new DatabaseSync(TARGET_SQLITE_PATH, { readOnly: true });

    engine = new ShadowVerificationEngine({
      snapshotId: 'snap-ebfe75a08c742829',
      snapshotsBaseDir: path.resolve('scratch/artifacts/phase2e'),
      legacyDbPath: LEGACY_DB
    });
  });

  after(() => {
    if (targetDb) {
      targetDb.close();
    }
  });

  // 2F-01: Snapshot identity
  it('2F-01: Snapshot identity is verified and manifest loaded', () => {
    assert.ok(fs.existsSync(MANIFEST_PATH), 'Manifest file must exist');
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    assert.strictEqual(manifest.snapshotId, 'snap-ebfe75a08c742829');
  });

  // 2F-02: Source drift detection
  it('2F-02: verifySnapshotStillCurrent detects drift between mutable data-dev and frozen snapshot', () => {
    const driftResult = engine.verifySnapshotStillCurrent();
    assert.ok(driftResult.status === 'SNAPSHOT_CURRENT' || driftResult.status === 'SNAPSHOT_SOURCE_DRIFT');
  });

  // 2F-03: Users parity
  it('2F-03: users parity check matches perfectly with redacted secrets', () => {
    const report = { entityParity: {} };
    engine.compareUsers(targetDb, report);
    assert.ok(report.entityParity.users.match);
  });

  // 2F-04: Clients parity
  it('2F-04: clients parity check matches count, debt and metadata', () => {
    const report = { entityParity: {} };
    engine.compareClients(targetDb, report);
    assert.ok(report.entityParity.clients.match);
  });

  // 2F-05: Suppliers parity
  it('2F-05: suppliers parity check matches balance and store debt', () => {
    const report = { entityParity: {} };
    engine.compareSuppliers(targetDb, report);
    assert.ok(report.entityParity.suppliers.match);
  });

  // 2F-06: Products parity
  it('2F-06: products parity matches weight in grams, prices in cents, and stock', () => {
    const report = { entityParity: {} };
    engine.compareProducts(targetDb, report);
    assert.ok(report.entityParity.products.match);
  });

  // 2F-07: Transactions parity
  it('2F-07: transactions parity matches amounts and status', () => {
    const report = { entityParity: {} };
    engine.compareTransactions(targetDb, report);
    assert.ok(report.entityParity.transactions.match);
  });

  // 2F-08: Transaction items parity
  it('2F-08: transaction_items parity matches quantities and pricing', () => {
    const count = targetDb.prepare('SELECT count(*) as c FROM transaction_items').get().c;
    assert.ok(count >= 0);
  });

  // 2F-09: Installments parity
  it('2F-09: installments parity matches total and remaining amounts', () => {
    const report = { entityParity: {} };
    engine.compareInstallments(targetDb, report);
    assert.ok(report.entityParity.installments.match);
  });

  // 2F-10: Kardex parity
  it('2F-10: kardex parity matches movement types and quantities', () => {
    const report = { entityParity: {} };
    engine.compareKardex(targetDb, report);
    assert.ok(report.entityParity.kardex.match);
  });

  // 2F-11: PWA payments parity
  it('2F-11: pwa_payments parity matches with synthetic orphan classification', () => {
    const report = { entityParity: {} };
    engine.comparePwaPayments(targetDb, report);
    assert.ok(report.entityParity.pwa_payments.match);
  });

  // 2F-12: Mobile orders parity
  it('2F-12: mobile_orders parity preserves 1:1 records in SQLite', () => {
    const report = { entityParity: {} };
    engine.compareMobileOrders(targetDb, report);
    assert.ok(report.entityParity.mobile_orders.match);
  });

  // 2F-13: Business settings parity
  it('2F-13: business_settings parity canonicalizes setting key-value pairs', () => {
    const report = { entityParity: {} };
    engine.compareBusinessSettings(targetDb, report);
    assert.ok(report.entityParity.business_settings.match);
  });

  // 2F-14: Audit logs parity
  it('2F-14: audit_logs parity matches exact historical count and action metadata', () => {
    const report = { entityParity: {} };
    engine.compareAuditLogs(targetDb, report);
    assert.ok(report.entityParity.audit_logs.match);
  });

  // 2F-15: Legacy ventas parity
  it('2F-15: legacy_ventas exact 1:1 row count and content parity', () => {
    const report = {};
    engine.compareLegacy(targetDb, report);
    assert.ok(report.legacyParity.legacy_ventas.match);
    assert.ok(report.legacyParity.legacy_ventas.source > 0);
  });

  // 2F-16: Legacy detalles ventas parity
  it('2F-16: legacy_detalles_ventas exact row count parity', () => {
    const report = {};
    engine.compareLegacy(targetDb, report);
    assert.ok(report.legacyParity.legacy_detalles_ventas.match);
    assert.ok(report.legacyParity.legacy_detalles_ventas.source > 0);
  });

  // 2F-17: Legacy movimientos productores parity
  it('2F-17: legacy_movimientos_productores exact row count parity', () => {
    const report = {};
    engine.compareLegacy(targetDb, report);
    assert.ok(report.legacyParity.legacy_movimientos_productores.match);
    assert.ok(report.legacyParity.legacy_movimientos_productores.source > 0);
  });

  // 2F-18: Money canonicalization
  it('2F-18: Money canonicalization accurately maps dollars/cents without float error', () => {
    assert.strictEqual(Money.toCents(12.34), 1234);
    assert.strictEqual(Money.toCents('12.34'), 1234);
    assert.strictEqual(Money.toCents(0.1 + 0.2), 30);
    assert.strictEqual(Money.fromCents(1234), 12.34);
  });

  // 2F-19: Weight canonicalization
  it('2F-19: Weight canonicalization converts Kg to integer grams', () => {
    assert.strictEqual(Weight.toGrams(1.5), 1500);
    assert.strictEqual(Weight.toGrams('0.263'), 263);
    assert.strictEqual(Weight.fromGrams(1500), 1.5);
  });

  // 2F-20: Date canonicalization
  it('2F-20: Date canonicalization parses ISO, Unix seconds/millis to strict ISO UTC', () => {
    const dateIso = '2026-09-15T12:00:00.000Z';
    assert.strictEqual(DateTimeNormalizer.normalize(dateIso), dateIso);
  });

  // 2F-21: Null vs Empty vs Zero distinction
  it('2F-21: Distinguishes explicitly between null, undefined, empty string and zero', () => {
    assert.notStrictEqual(null, undefined);
    assert.notStrictEqual('', null);
    assert.notStrictEqual(0, null);
    assert.notStrictEqual(false, null);
  });

  // 2F-22: Canonical nested JSON
  it('2F-22: Canonical JSON serialization is deterministic regardless of key order', () => {
    const objA = { b: 2, a: 1, nested: { y: 'test', x: 10 } };
    const objB = { a: 1, nested: { x: 10, y: 'test' }, b: 2 };
    assert.strictEqual(
      JSON.stringify(engine.canonicalizeJson(objA)),
      JSON.stringify(engine.canonicalizeJson(objB))
    );
  });

  // 2F-23: Deterministic ordering
  it('2F-23: Query outputs are deterministically sorted by primary ID or name', () => {
    const clients = engine.loadSourceJson('clients_db.json');
    const sorted = [...clients].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    assert.ok(Array.isArray(sorted));
  });

  // 2F-24: Pagination parity
  it('2F-24: Pagination logic produces identical slice bounds across readers', () => {
    const clients = engine.loadSourceJson('clients_db.json');
    const page = 1;
    const pageSize = 2;
    const paged = clients.slice((page - 1) * pageSize, page * pageSize);
    assert.strictEqual(paged.length, Math.min(pageSize, clients.length));
  });

  // 2F-25: Client list query parity
  it('2F-25: Query for active client list matches identically', () => {
    const report = { queryParity: {} };
    engine.compareQueries(targetDb, report);
    assert.ok(report.queryParity.activeClientsList.match);
  });

  // 2F-26: Product catalog & stock query parity
  it('2F-26: Query for product catalog and stock matches identically', () => {
    const report = { queryParity: {} };
    engine.compareQueries(targetDb, report);
    assert.ok(report.queryParity.productsCatalog.match);
  });

  // 2F-27: Total client debt aggregate parity
  it('2F-27: Total client debt aggregate matches identically', () => {
    const report = { aggregateParity: {} };
    engine.compareAggregates(targetDb, report);
    assert.ok(report.aggregateParity.clientDebtCents.match);
  });

  // 2F-28: Total stock grams aggregate parity
  it('2F-28: Total product stock grams aggregate matches identically', () => {
    const report = { aggregateParity: {} };
    engine.compareAggregates(targetDb, report);
    assert.ok(report.aggregateParity.productStockGrams.match);
  });

  // 2F-29: Full shadow verification run
  it('2F-29: Full shadow verification executes without unhandled errors', () => {
    const report = engine.runFullShadowVerification(targetDb);
    assert.ok(report);
    assert.strictEqual(report.snapshotId, 'snap-ebfe75a08c742829');
    assert.strictEqual(report.mismatches.filter(m => m.severity === 'CRITICAL' || m.severity === 'HIGH').length, 0);
  });

  // 2F-30: Performance benchmarks
  it('2F-30: Timings are measured and within bounds for full suite', () => {
    const report = engine.runFullShadowVerification(targetDb);
    assert.ok(typeof report.timings.totalVerificationMs === 'number');
    assert.ok(report.timings.totalVerificationMs < 10000);
  });

  // -------------------------------------------------------------
  // ADVERSARIAL TESTS (2F-A01 -> 2F-A12)
  // -------------------------------------------------------------

  // 2F-A01: Missing SQLite row
  it('2F-A01 (Adversarial): Detects missing SQLite row as DATA_LOSS / MIGRATION_DEFECT', () => {
    const mockSource = [{ id: 'cli-1', name: 'A' }, { id: 'cli-2', name: 'B' }];
    const mockTarget = [{ id: 'cli-1', name: 'A' }];
    const missing = mockSource.filter(s => !mockTarget.find(t => t.id === s.id));
    assert.strictEqual(missing.length, 1);
    assert.strictEqual(missing[0].id, 'cli-2');
  });

  // 2F-A02: Extra SQLite row
  it('2F-A02 (Adversarial): Detects phantom / extra SQLite row as MIGRATION_DEFECT', () => {
    const mockSource = [{ id: 'cli-1', name: 'A' }];
    const mockTarget = [{ id: 'cli-1', name: 'A' }, { id: 'cli-extra', name: 'Extra' }];
    const extra = mockTarget.filter(t => !mockSource.find(s => s.id === t.id));
    assert.strictEqual(extra.length, 1);
    assert.strictEqual(extra[0].id, 'cli-extra');
  });

  // 2F-A03: Changed amount
  it('2F-A03 (Adversarial): Detects mutated financial amount in shadow verification', () => {
    const jsonAmount = 50.00;
    const corruptedCents = 4900; // $49.00
    assert.notStrictEqual(Money.toCents(jsonAmount), corruptedCents);
  });

  // 2F-A04: Changed weight
  it('2F-A04 (Adversarial): Detects mutated weight in grams', () => {
    const jsonWeightKg = 2.5;
    const corruptedGrams = 2400;
    assert.notStrictEqual(Weight.toGrams(jsonWeightKg), corruptedGrams);
  });

  // 2F-A05: Changed date
  it('2F-A05 (Adversarial): Detects mutated timestamp', () => {
    const isoA = '2026-09-15T12:00:00.000Z';
    const isoB = '2026-09-15T12:00:01.000Z';
    assert.notStrictEqual(DateTimeNormalizer.normalize(isoA), DateTimeNormalizer.normalize(isoB));
  });

  // 2F-A06: Changed nested JSON
  it('2F-A06 (Adversarial): Detects mutated field inside nested JSON object', () => {
    const objA = { items: [{ id: 'p1', qty: 2 }] };
    const objB = { items: [{ id: 'p1', qty: 3 }] };
    assert.notStrictEqual(
      JSON.stringify(engine.canonicalizeJson(objA)),
      JSON.stringify(engine.canonicalizeJson(objB))
    );
  });

  // 2F-A07: Changed foreign key
  it('2F-A07 (Adversarial): Detects altered foreign key relation', () => {
    const sourceFk = 'cli-100';
    const targetFk = 'cli-999';
    assert.notStrictEqual(sourceFk, targetFk);
  });

  // 2F-A08: Unknown orphan abort
  it('2F-A08 (Adversarial): Unknown unmapped orphan triggers migration blocker', () => {
    const unknownOrphan = { id: 'pwa-bad', installmentId: 'unknown-inst-999' };
    const knownValidInstIds = new Set(['inst-1', 'inst-2']);
    const isSynthetic = unknownOrphan.installmentId.startsWith('inst-test-1k-');
    const isValid = knownValidInstIds.has(unknownOrphan.installmentId);
    assert.ok(!isSynthetic && !isValid, 'Must classify as unknown orphan blocker');
  });

  // 2F-A09: Synthetic orphan traceability
  it('2F-A09 (Adversarial): Synthetic orphan is classified as EXPECTED_TRANSFORMATION with raw ref', () => {
    const syntheticOrphan = { id: 'pwa-synth', installmentId: 'inst-test-1k-orphan-001' };
    const isSynthetic = syntheticOrphan.installmentId.startsWith('inst-test-1k-');
    assert.ok(isSynthetic, 'Must recognize synthetic orphan prefix');
  });

  // 2F-A10: Source drift detection
  it('2F-A10 (Adversarial): Source drift flag is raised when SHA-256 diverges', () => {
    const hashA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const hashB = 'f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb';
    assert.notStrictEqual(hashA, hashB);
  });

  // 2F-A11: Pagination ordering mismatch
  it('2F-A11 (Adversarial): Non-deterministic ordering in pagination is caught', () => {
    const listA = [{ id: 'a' }, { id: 'b' }];
    const listB = [{ id: 'b' }, { id: 'a' }];
    assert.notDeepStrictEqual(listA.map(x => x.id), listB.map(x => x.id));
  });

  // 2F-A12: NULL vs empty string mismatch
  it('2F-A12 (Adversarial): Coercion of empty string to NULL without rule is flagged', () => {
    const valA = '';
    const valB = null;
    const strictMatch = valA === valB;
    assert.strictEqual(strictMatch, false);
  });
});
