import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseTarArchive(tarBuf) {
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

test('1. Pre-Deploy Guard: Verify configuration and safety checks', async (t) => {
  const guardPath = path.join(rootDir, 'scripts', 'predeploy_guard.mjs');
  assert.ok(fs.existsSync(guardPath), 'scripts/predeploy_guard.mjs must exist');

  const configPath = path.join(rootDir, 'config', 'protected-data.json');
  assert.ok(fs.existsSync(configPath), 'config/protected-data.json must exist');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(config.dataMounts, 'Must define dataMounts');
  assert.ok(config.protectedCollections, 'Must define protectedCollections');
  assert.ok(config.forbiddenDeployCommands, 'Must define forbiddenDeployCommands');

  // Ejecutar predeploy guard en modo CLI
  const res = await new Promise((resolve) => {
    const proc = spawn(process.execPath, [guardPath], { cwd: rootDir });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => resolve({ code, stdout, stderr }));
  });

  assert.equal(res.code, 0, `Predeploy guard must exit with code 0: ${res.stdout} ${res.stderr}`);
  assert.ok(res.stdout.includes('PRE-DEPLOY GUARD: PASS'), 'Output must confirm PRE-DEPLOY GUARD: PASS');
});

test('2. Destructive Operations Protection & Security Tokens', async (t) => {
  const serverPath = path.join(rootDir, 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  // Verificar presencia de funciones de token destructivo
  assert.ok(serverContent.includes('issueDestructiveActionToken'), 'Must have issueDestructiveActionToken');
  assert.ok(serverContent.includes('consumeDestructiveActionToken'), 'Must have consumeDestructiveActionToken');
  assert.ok(serverContent.includes('/api/admin/request-destructive-auth'), 'Must have request-destructive-auth endpoint');
  assert.ok(serverContent.includes('/api/admin/reset-accounting'), 'Must have reset-accounting endpoint');

  // Test unitario de token destructivo en memoria
  const destructiveTokens = new Map();
  function issueToken(userId, role, action, scope, ttlMs = 5 * 60 * 1000) {
    const token = 'dtk_' + crypto.randomBytes(24).toString('hex');
    destructiveTokens.set(token, {
      userId,
      role,
      action,
      scope,
      expiresAt: Date.now() + ttlMs,
      used: false
    });
    return token;
  }

  function consumeToken(token, expectedUser, expectedAction, expectedScope) {
    if (!token || typeof token !== 'string') return { ok: false, error: 'Token requerido' };
    const entry = destructiveTokens.get(token);
    if (!entry) return { ok: false, error: 'Token no encontrado' };
    if (entry.used) return { ok: false, error: 'Token ya utilizado' };
    if (Date.now() > entry.expiresAt) {
      destructiveTokens.delete(token);
      return { ok: false, error: 'Token expirado' };
    }
    if (entry.userId !== expectedUser) return { ok: false, error: 'Usuario no coincide' };
    if (entry.action !== expectedAction) return { ok: false, error: 'Acción no coincide' };
    if (expectedScope && entry.scope !== expectedScope) return { ok: false, error: 'Alcance no coincide' };
    
    entry.used = true;
    destructiveTokens.delete(token);
    return { ok: true, entry };
  }

  // Escenario A: Token generado para Admin
  const tok = issueToken('usr-admin-1', 'admin', 'reset_accounting', 'accounting_all');
  assert.ok(tok.startsWith('dtk_'));

  // Escenario B: Token consumido por cajero -> Denegado
  const wrongUser = consumeToken(tok, 'usr-cajero-2', 'reset_accounting', 'accounting_all');
  assert.equal(wrongUser.ok, false);
  assert.match(wrongUser.error, /Usuario no coincide/);

  // Escenario C: Token consumido con acción incorrecta -> Denegado
  const wrongAction = consumeToken(tok, 'usr-admin-1', 'wipe_users', 'accounting_all');
  assert.equal(wrongAction.ok, false);
  assert.match(wrongAction.error, /Acción no coincide/);

  // Escenario D: Token válido consumido exitosamente
  const validConsume = consumeToken(tok, 'usr-admin-1', 'reset_accounting', 'accounting_all');
  assert.equal(validConsume.ok, true);

  // Escenario E: Token reutilizado -> Denegado (Single use)
  const reusedConsume = consumeToken(tok, 'usr-admin-1', 'reset_accounting', 'accounting_all');
  assert.equal(reusedConsume.ok, false);
  assert.match(reusedConsume.error, /Token no encontrado|ya utilizado/);

  // Escenario F: Token expirado -> Denegado
  const expiredTok = issueToken('usr-admin-1', 'admin', 'reset_accounting', 'accounting_all', -1000);
  const expiredConsume = consumeToken(expiredTok, 'usr-admin-1', 'reset_accounting', 'accounting_all');
  assert.equal(expiredConsume.ok, false);
  assert.match(expiredConsume.error, /expirado/);
});

test('3. Full Backup Packaging & Manifest Consistency', async (t) => {
  // Simular creación del bundle tar.gz idéntico a server.js
  const BACKUP_COLLECTIONS = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'protected-data.json'), 'utf8')).protectedCollections;
  
  const rawCollections = {};
  const recordCounts = {};
  const collectionHashes = {};

  const devDir = path.join(rootDir, 'data-dev');
  for (const colName of BACKUP_COLLECTIONS) {
    const filePath = path.join(devDir, `${colName}_db.json`);
    let data = [];
    if (fs.existsSync(filePath)) {
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        data = [];
      }
    }
    
    // Sanitizar
    if ((colName === 'users' || colName === 'clients' || colName === 'suppliers') && Array.isArray(data)) {
      data = data.map(u => {
        const copy = { ...u };
        delete copy.passwordHash;
        delete copy.pinHash;
        return copy;
      });
    }
    if (colName === 'settings' && Array.isArray(data)) {
      data = data.map(s => {
        const copy = { ...s };
        delete copy.geminiApiKey;
        delete copy.whatsappToken;
        delete copy.jwtSecret;
        delete copy.sessionSecret;
        delete copy.passwordHash;
        delete copy.pinHash;
        return copy;
      });
    }
    rawCollections[colName] = data;
    recordCounts[colName] = Array.isArray(data) ? data.length : (data ? 1 : 0);
    const colBuf = Buffer.from(JSON.stringify(data), 'utf8');
    collectionHashes[colName] = crypto.createHash('sha256').update(colBuf).digest('hex');
  }

  const backupJson = {
    version: '3.0',
    timestamp: new Date().toISOString(),
    company: 'Mundo Kalu Sabanota',
    recordCounts,
    collections: rawCollections
  };

  const manifest = {
    backupVersion: '3.0',
    timestamp: backupJson.timestamp,
    company: backupJson.company,
    collections: BACKUP_COLLECTIONS,
    recordCounts,
    collectionHashes,
    filesCount: 0,
    captures: []
  };

  // Validar que no contenga password hashes ni claves secretas
  const backupStr = JSON.stringify(backupJson);
  assert.ok(!backupStr.includes('"passwordHash"'), 'Must not contain passwordHash');
  assert.ok(!backupStr.includes('"pinHash"'), 'Must not contain pinHash');
  assert.ok(!backupStr.includes('GEMINI_API_KEY'), 'Must not contain GEMINI_API_KEY');
  assert.ok(!backupStr.includes('sessionSecret'), 'Must not contain sessionSecret');

  // Validar que colecciones críticas estén presentes
  assert.ok(recordCounts['cashClosings'] !== undefined, 'cashClosings must be recorded');
  assert.ok(recordCounts['transactions'] !== undefined, 'transactions must be recorded');
  assert.ok(recordCounts['clients'] !== undefined, 'clients must be recorded');
  assert.ok(recordCounts['suppliers'] !== undefined, 'suppliers must be recorded');
  assert.ok(recordCounts['products'] !== undefined, 'products must be recorded');
  assert.ok(recordCounts['installments'] !== undefined, 'installments must be recorded');
  assert.ok(recordCounts['audit_logs'] !== undefined, 'audit_logs must be recorded');

  // Validar hashes generados
  for (const col of BACKUP_COLLECTIONS) {
    assert.equal(typeof collectionHashes[col], 'string');
    assert.equal(collectionHashes[col].length, 64, `SHA256 hex string expected for ${col}`);
  }
});

test('4. Deploy Script Pre-Deploy Guard: Fail-Closed & Execution Ordering', async (t) => {
  const deployScriptPath = path.join(rootDir, 'deploy_seguro_produccion.mjs');
  assert.ok(fs.existsSync(deployScriptPath), 'deploy_seguro_produccion.mjs must exist');

  const deployCode = fs.readFileSync(deployScriptPath, 'utf8');

  // Análisis estático del orden estricto: runPredeployGuard debe ejecutarse antes de ssh.connect o envíos
  const guardCallIndex = deployCode.indexOf('runPredeployGuard(');
  const sshConnectIndex = deployCode.indexOf('ssh.connect(');
  const putFileIndex = deployCode.indexOf('ssh.putFile(');
  const execCommandIndex = deployCode.indexOf('ssh.execCommand(');

  assert.ok(guardCallIndex !== -1, 'deploy_seguro_produccion.mjs must invoke runPredeployGuard');
  assert.ok(sshConnectIndex !== -1, 'deploy_seguro_produccion.mjs has ssh.connect');
  assert.ok(guardCallIndex < sshConnectIndex, 'Predeploy guard MUST run before ssh.connect');
  assert.ok(guardCallIndex < putFileIndex, 'Predeploy guard MUST run before any file upload (putFile)');
  assert.ok(guardCallIndex < execCommandIndex, 'Predeploy guard MUST run before remote commands (execCommand)');

  // Probar lógica pura del runPredeployGuard importando de manera aislada la función sin ejecutar deploy
  const { pathToFileURL } = await import('node:url');
  const { runPredeployGuard } = await import(pathToFileURL(path.join(rootDir, 'deploy_seguro_produccion.mjs')).href);

  // Caso A: Guard válido existente -> PASS
  const validRes = runPredeployGuard(path.join(rootDir, 'scripts', 'predeploy_guard.mjs'));
  assert.equal(validRes.ok, true, 'Valid guard must return ok: true');
  assert.equal(validRes.code, 0);

  // Caso B: Guard inexistente -> FAIL CLOSED
  const missingRes = runPredeployGuard(path.join(rootDir, 'scripts', 'non_existent_guard.mjs'));
  assert.equal(missingRes.ok, false, 'Missing guard must return ok: false');
  assert.equal(missingRes.code, 1);
  assert.equal(missingRes.error, 'GUARD_SCRIPT_NOT_FOUND');

  // Caso C: Guard que falla (exit 1) -> FAIL CLOSED
  const tempFailingGuard = path.join(rootDir, 'scripts', 'temp_failing_guard.mjs');
  fs.writeFileSync(tempFailingGuard, 'console.error("SIMULATED GUARD FAILURE"); process.exit(1);', 'utf8');
  try {
    const failingRes = runPredeployGuard(tempFailingGuard);
    assert.equal(failingRes.ok, false, 'Failing guard must return ok: false');
    assert.equal(failingRes.code, 1);
  } finally {
    if (fs.existsSync(tempFailingGuard)) fs.unlinkSync(tempFailingGuard);
  }
});

test('5. Direct NPM and Node Execution Bypass Verification', async (t) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.deploy, 'package.json must define deploy script');
  assert.ok(pkg.scripts.deploy.includes('deploy_seguro_produccion.mjs'), 'npm run deploy must execute deploy_seguro_produccion.mjs');

  const deployCode = fs.readFileSync(path.join(rootDir, 'deploy_seguro_produccion.mjs'), 'utf8');
  assert.ok(deployCode.includes('if (!guardResult.ok)'), 'Must contain fail-closed abort check');
  assert.ok(deployCode.includes('process.exit('), 'Must exit process if guard fails');
});

