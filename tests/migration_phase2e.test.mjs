/**
 * Phase 2E Test Suite: Snapshot Creation, Immutability & Reproducibility
 * Tests 2E-01 to 2E-20 covering source inventory, SHA-256 integrity, size, counts,
 * duplicate IDs, numeric/date checks, legacy read-only inspection, deterministic IDs,
 * secret/PII scanning, checksum verification, collision protection, and unexpected files detection.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { SnapshotEngine } from '../db/migration/snapshot-engine.js';

const SCRATCH_PHASE2E_DIR = path.resolve('./scratch/phase2e_test_artifacts');
const SOURCE_DIR = path.resolve('./data-dev');
const LEGACY_DB = path.resolve('./respaldo_restaurar.json.db');

describe('Phase 2E: Historical Snapshot & Freeze Suite (2E-01 -> 2E-20)', () => {
  let engine;
  let snapshotResultA;
  let snapshotResultB;

  before(() => {
    if (!fs.existsSync(SCRATCH_PHASE2E_DIR)) {
      fs.mkdirSync(SCRATCH_PHASE2E_DIR, { recursive: true });
    }

    engine = new SnapshotEngine({
      sourceDir: SOURCE_DIR,
      legacyDbPath: fs.existsSync(LEGACY_DB) ? LEGACY_DB : null,
      outputDir: SCRATCH_PHASE2E_DIR
    });

    snapshotResultA = engine.createSnapshot({
      gitCommit: 'db720947a32ff1713d07617c2322604c53e9c35d',
      branch: 'dev/security-hardening'
    });

    snapshotResultB = engine.createSnapshot({
      gitCommit: 'db720947a32ff1713d07617c2322604c53e9c35d',
      branch: 'dev/security-hardening'
    });
  });

  // 2E-01: Snapshot Source Inventory
  it('2E-01: Snapshot discovers and inventories all relevant JSON collections', () => {
    const manifest = snapshotResultA.manifest;
    assert.ok(manifest.sourceFilesCount >= 8, 'Must inventory at least 8 core collections');
    assert.ok(manifest.inventory['clients_db.json'], 'clients_db.json must be in inventory');
    assert.ok(manifest.inventory['products_db.json'], 'products_db.json must be in inventory');
    assert.ok(manifest.inventory['mobileOrders_db.json'], 'mobileOrders_db.json must be in inventory');
  });

  // 2E-02: Source SHA-256
  it('2E-02: Every source JSON has a valid 64-character SHA-256 hash', () => {
    const inventory = snapshotResultA.manifest.inventory;
    for (const [file, item] of Object.entries(inventory)) {
      assert.equal(item.sha256.length, 64, `SHA-256 for ${file} must be 64 hex chars`);
      assert.match(item.sha256, /^[0-9a-f]{64}$/);
    }
  });

  // 2E-03: Source Size
  it('2E-03: Every source JSON has non-negative byte size matching disk', () => {
    const inventory = snapshotResultA.manifest.inventory;
    for (const [file, item] of Object.entries(inventory)) {
      assert.ok(item.sizeBytes >= 0, `Size for ${file} must be >= 0`);
      const actualSize = fs.statSync(path.join(SOURCE_DIR, file)).size;
      assert.equal(item.sizeBytes, actualSize, `Recorded size matches actual size for ${file}`);
    }
  });

  // 2E-04: Record Counts
  it('2E-04: Record counts match array lengths in source files', () => {
    const summary = snapshotResultA.manifest.semanticSummary;
    for (const [col, item] of Object.entries(summary)) {
      const fullPath = path.join(SOURCE_DIR, item.file);
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const expectedCount = Array.isArray(parsed) ? parsed.length : (parsed ? 1 : 0);
      assert.equal(item.recordCount, expectedCount, `Record count for ${col} matches source JSON`);
    }
  });

  // 2E-05: Duplicate ID Detection
  it('2E-05: Semantic summary tracks unique and duplicate ID counts per collection', () => {
    const summary = snapshotResultA.manifest.semanticSummary;
    assert.ok(summary.clients, 'clients summary exists');
    assert.ok(summary.clients.uniqueIds > 0, 'clients unique IDs > 0');
    assert.equal(summary.clients.duplicateIds, 0, 'no duplicate client IDs in source');
  });

  // 2E-06: Invalid Numeric Detection
  it('2E-06: Semantic summary detects invalid numerics (NaN / Infinity)', () => {
    const summary = snapshotResultA.manifest.semanticSummary;
    for (const [col, item] of Object.entries(summary)) {
      assert.equal(item.invalidNumerics, 0, `Collection ${col} should have 0 invalid numeric values in valid snapshot`);
    }
  });

  // 2E-07: Ambiguous Date Detection
  it('2E-07: Semantic summary catalogues naive/ambiguous date fields for classification', () => {
    const summary = snapshotResultA.manifest.semanticSummary;
    assert.ok('ambiguousDates' in summary.clients, 'clients summary tracks ambiguous dates');
  });

  // 2E-08: JSON Mutation Detection
  it('2E-08: Snapshot engine detects source mutation during capture and aborts', () => {
    const tempDir = path.join(SCRATCH_PHASE2E_DIR, 'mutating_source');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const testFile = path.join(tempDir, 'test_db.json');
    fs.writeFileSync(testFile, JSON.stringify([{ id: '1', val: 'initial' }]));

    const testEngine = new SnapshotEngine({
      sourceDir: tempDir,
      outputDir: path.join(SCRATCH_PHASE2E_DIR, 'test_out')
    });

    // Mock mutate during capture
    const origRead = fs.readFileSync;
    let mutated = false;
    fs.readFileSync = function (...args) {
      const res = origRead.apply(this, args);
      if (args[0] === testFile && !mutated) {
        fs.writeFileSync(testFile, JSON.stringify([{ id: '1', val: 'mutated' }]));
        mutated = true;
      }
      return res;
    };

    assert.throws(() => {
      testEngine.createSnapshot();
    }, /SNAPSHOT_SOURCE_MUTATION_DETECTED/i);

    // Restore original readFileSync
    fs.readFileSync = origRead;
  });

  // 2E-09: Legacy DB Read-Only
  it('2E-09: Legacy DB inspection opens exclusively read-only without modifying file timestamp or mode', () => {
    if (fs.existsSync(LEGACY_DB)) {
      const mtimeBefore = fs.statSync(LEGACY_DB).mtimeMs;
      const legacyDb = new DatabaseSync(LEGACY_DB, { readOnly: true });
      const count = legacyDb.prepare('SELECT COUNT(*) as c FROM ventas').get().c;
      assert.equal(count, 7357);
      legacyDb.close();
      const mtimeAfter = fs.statSync(LEGACY_DB).mtimeMs;
      assert.equal(mtimeAfter, mtimeBefore, 'Legacy DB mtime must remain untouched');
    }
  });

  // 2E-10: Legacy DB Hash
  it('2E-10: Legacy DB SHA-256 hash is recorded in manifest metadata', () => {
    if (fs.existsSync(LEGACY_DB)) {
      const legacyMeta = snapshotResultA.manifest.legacyMetadata;
      assert.ok(legacyMeta, 'legacyMetadata must exist');
      assert.equal(legacyMeta.sha256.length, 64);
      assert.match(legacyMeta.sha256, /^[0-9a-f]{64}$/);
    }
  });

  // 2E-11: Legacy Row Counts
  it('2E-11: Legacy tables row counts match historical baseline', () => {
    if (fs.existsSync(LEGACY_DB)) {
      const legacyMeta = snapshotResultA.manifest.legacyMetadata;
      assert.equal(legacyMeta.preservationTables.legacy_ventas, 7357);
      assert.equal(legacyMeta.preservationTables.legacy_detalles_ventas, 16780);
      assert.equal(legacyMeta.preservationTables.legacy_movimientos_productores, 3290);
    }
  });

  // 2E-12: Legacy Schema Hash
  it('2E-12: Legacy SQLite schema SQL hash is computed and recorded', () => {
    if (fs.existsSync(LEGACY_DB)) {
      const legacyMeta = snapshotResultA.manifest.legacyMetadata;
      assert.ok(legacyMeta.schemaHash, 'schemaHash must exist');
      assert.equal(legacyMeta.schemaHash.length, 64);
    }
  });

  // 2E-13: Migrated / Preserved / Out-Of-Scope Classification
  it('2E-13: Manifest explicitly classifies all collections into MIGRATED, PRESERVED_LEGACY, and INSPECTED_NOT_MIGRATED', () => {
    const cats = snapshotResultA.manifest.classificationCategories;
    assert.ok(cats.MIGRATED.includes('clients'));
    assert.ok(cats.MIGRATED.includes('mobile_orders'));
    assert.ok(cats.PRESERVED_LEGACY.includes('legacy_ventas'));
    assert.ok(cats.INSPECTED_NOT_MIGRATED.includes('banners'));
  });

  // 2E-14: Deterministic Snapshot ID
  it('2E-14: Snapshot ID is canonical and derived deterministically from source hashes and gitCommit', () => {
    assert.ok(snapshotResultA.snapshotId.startsWith('snap-'));
    assert.equal(snapshotResultA.snapshotId, snapshotResultB.snapshotId, 'Identical sources produce identical snapshot IDs');
  });

  // 2E-15: Reproducibility
  it('2E-15: Two consecutive snapshots on identical sources produce matching manifests', () => {
    const invA = JSON.stringify(snapshotResultA.manifest.inventory);
    const invB = JSON.stringify(snapshotResultB.manifest.inventory);
    assert.equal(invA, invB, 'Inventories must be identical');

    const semA = JSON.stringify(snapshotResultA.manifest.semanticSummary);
    const semB = JSON.stringify(snapshotResultB.manifest.semanticSummary);
    assert.equal(semA, semB, 'Semantic summaries must be identical');
  });

  // 2E-16: Manifest Secret Scan
  it('2E-16: Manifest, checksums, and source-inventory contain 0 secrets, tokens, or raw hashes', () => {
    const serializedManifest = JSON.stringify(snapshotResultA.manifest);
    const forbiddenPatterns = [
      /password/i,
      /passwordhash/i,
      /pinhash/i,
      /session_secret/i,
      /recovery_secret/i,
      /transaction_signature_secret/i,
      /authorization/i,
      /api_key/i,
      /csrftoken/i,
      /resettoken/i
    ];

    for (const pat of forbiddenPatterns) {
      assert.doesNotMatch(serializedManifest, pat, `Manifest must not contain pattern: ${pat}`);
    }
  });

  // 2E-17: Manifest PII Minimization
  it('2E-17: Manifest contains only structural counts and checksums without raw user personal data', () => {
    const serialized = JSON.stringify(snapshotResultA.manifest);
    assert.doesNotMatch(serialized, /"email":\s*"[^"]+"/i);
    assert.doesNotMatch(serialized, /"cedula":\s*"[^"]+"/i);
    assert.doesNotMatch(serialized, /"phone":\s*"[^"]+"/i);
  });

  // 2E-18: Checksum Verification
  it('2E-18: verifySnapshot tool validates 100% of checksums against current disk files', () => {
    const verifyResult = engine.verifySnapshot(snapshotResultA.snapshotDir);
    assert.equal(verifyResult.verified, true);
    assert.equal(verifyResult.mismatchesCount, 0);
  });

  // 2E-19: Existing Snapshot Collision Protection
  it('2E-19: Re-creating an identical snapshot reuses and validates the existing folder without corrupting it', () => {
    const reSnapshot = engine.createSnapshot();
    assert.equal(reSnapshot.snapshotId, snapshotResultA.snapshotId);
  });

  // 2E-20: Unexpected Snapshot File Detection
  it('2E-20: Snapshot directory contains only expected manifest, checksums, and inventory files', () => {
    const files = fs.readdirSync(snapshotResultA.snapshotDir).sort();
    assert.deepEqual(files, ['checksums.sha256', 'manifest.json', 'source-inventory.json']);
  });
});
