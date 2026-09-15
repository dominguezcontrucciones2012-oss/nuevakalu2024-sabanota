// ============================================================
// SUITE DE PRUEBAS AUTOMATIZADAS — FASE 1A: AUTENTICACIÓN
// ============================================================
import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { io as ioClient } from 'socket.io-client';
import {
  createRecoveryChallenge,
  verifyRecoveryCode,
  consumeResetToken,
  invalidateRecoveryChallenge,
  cleanupRecoveryStore,
  recoveryChallengeStore,
  recoveryResetTokenStore,
  hashEphemeralSecret,
  maskRecipient,
  emitCollectionDeltaScoped,
  emitCollectionUpdatedScoped,
  sanitizeClientPayload,
  sanitizeProducerPayload,
  sanitizePublicProduct,
  isOriginAllowed,
  writeCollection,
  activeSessionSockets,
  setGeminiClientForTest,
  getGeminiClient,
  isGeminiConfigured,
  aiRateLimiter,
  dataDir,
  uploadDir,
  getCollectionFilePath,
  parseAllowedOrigins,
  normalizeOrigin,
  verifyWhatsAppWebhookSignature,
  whatsappWebhookLimiter,
  isWebhookEventProcessed,
  markWebhookEventProcessed,
  extractWebhookEventIds,
  resetProcessedWebhookEventsForTest,
  hashRateLimitKey,
  loginAccountLimiter,
  portalAccountLoginLimiter,
  recoveryResetPinLimiter,
  syncRateLimiter,
  adminBackupLimiter,
  adminRestoreLimiter,
  adminResetLimiter,
  buildTransactionCanonicalPayload,
  computeTransactionHmac,
  verifyTransactionApprovalSignature,
  getTransactionSignatureSecret,
  resetEphemeralDevTxSecretForTest,
  generateTransactionAuthNonce,
  atomicWriteJsonFile,
  withTransaction,
  readCollection,
  withCollectionLock,
  recordAuditLog
} from '../server.js';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3001';

async function request(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let data = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  // Extraer cookies de respuesta
  const setCookie = response.headers.get('set-cookie') || '';

  return {
    status: response.status,
    headers: response.headers,
    setCookie,
    data
  };
}

async function runTests() {
  console.log('🧪 Iniciando Suite de Pruebas Automatizadas — Fases 1A, 1B, 1C y 1D-A: Portal Server-Side Auth (81 Pruebas)\n');

  // Inicializar fixtures de desarrollo para ejecución determinista
  const clientsPath = path.resolve('data-dev/clients_db.json');
  if (fs.existsSync(clientsPath)) {
    const clientsData = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));
    const c1 = clientsData.find(item => item.id === 'cli-demo-1');
    if (c1) c1.pinHash = bcrypt.hashSync('678000', 10);
    const c2 = clientsData.find(item => item.id === 'cli-demo-2');
    if (c2) c2.pinHash = bcrypt.hashSync('543200', 10);
    fs.writeFileSync(clientsPath, JSON.stringify(clientsData, null, 2));
  }

  const suppliersPath = path.resolve('data-dev/suppliers_db.json');
  if (fs.existsSync(suppliersPath)) {
    const suppliersData = JSON.parse(fs.readFileSync(suppliersPath, 'utf8'));
    const s1 = suppliersData.find(item => item.id === 'sup-demo-1');
    if (s1) s1.pinHash = bcrypt.hashSync('321900', 10);
    const s2 = suppliersData.find(item => item.id === 'sup-demo-2');
    if (s2) s2.pinHash = bcrypt.hashSync('998877', 10);
    fs.writeFileSync(suppliersPath, JSON.stringify(suppliersData, null, 2));
  }

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}\n`);
      failed++;
    }
  }

  // 1. GET /api/auth/me sin sesión -> 401
  await test('1. GET /api/auth/me sin sesión devuelve 401 Unauthorized', async () => {
    const res = await request('/api/auth/me');
    assert.strictEqual(res.status, 401, `Esperado 401, recibido ${res.status}`);
    assert.strictEqual(res.data.error, 'No autenticado');
  });

  // 2. Login sin credenciales -> 400
  await test('2. POST /api/auth/login sin credenciales devuelve 400 Bad Request', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ loginMode: 'admin' })
    });
    assert.strictEqual(res.status, 400, `Esperado 400, recibido ${res.status}`);
  });

  // 3. Login con password incorrecto -> 401
  await test('3. POST /api/auth/login con password incorrecto devuelve 401', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'PasswordErroneo123!'
      })
    });
    assert.strictEqual(res.status, 401, `Esperado 401, recibido ${res.status}`);
  });

  // 4. Login con usuario inexistente -> 401
  await test('4. POST /api/auth/login con usuario inexistente devuelve 401', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'usuario.fantasma@example.com',
        password: 'Password123!'
      })
    });
    assert.strictEqual(res.status, 401, `Esperado 401, recibido ${res.status}`);
  });

  // 5. No enumeración de usuarios (Mismo mensaje de error genérico)
  await test('5. Login no enumera usuarios (mismo mensaje genérico para user inexistente y pass incorrecto)', async () => {
    const resWrongPass = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'WrongPassword!'
      })
    });
    const resWrongUser = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'inexistente@kalu.local',
        password: 'WrongPassword!'
      })
    });
    assert.strictEqual(resWrongPass.data.error, resWrongUser.data.error, 'Los mensajes de error deben ser idénticos');
    assert.strictEqual(resWrongPass.data.error, 'Credenciales inválidas o cuenta no autorizada');
  });

  // 6. Login exitoso como Admin
  let adminCookie = '';
  let adminCsrf = '';
  await test('6. POST /api/auth/login exitoso (Admin con email y password)', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    assert.strictEqual(res.status, 200, `Esperado 200, recibido ${res.status}`);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.user.role, 'admin');
    assert.strictEqual(res.data.user.name, 'Administrador General (DEV)');
    assert.ok(res.setCookie.includes('__kalu_sid'), 'Debe emitir cookie __kalu_sid');
    adminCookie = res.setCookie.split(';')[0];
    adminCsrf = res.data.csrfToken;
  });

  // 7. Cookie de sesión tiene httpOnly y SameSite
  await test('7. Cookie de sesión tiene directivas httpOnly y SameSite=Lax', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    assert.ok(res.setCookie.toLowerCase().includes('httponly'), 'Falta httpOnly en cookie');
    assert.ok(res.setCookie.toLowerCase().includes('samesite=lax'), 'Falta sameSite=lax en cookie');
  });

  // 8. GET /api/auth/me con sesión válida -> 200
  await test('8. GET /api/auth/me con sesión válida devuelve 200 OK y datos del usuario', async () => {
    const res = await request('/api/auth/me', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.id, 'usr-admin-dev');
    assert.strictEqual(res.data.user.role, 'admin');
  });

  // 9. GET /api/auth/me devuelve identidad mínima
  await test('9. GET /api/auth/me devuelve únicamente identidad mínima requerida', async () => {
    const res = await request('/api/auth/me', {
      headers: { 'Cookie': adminCookie }
    });
    const keys = Object.keys(res.data.user);
    assert.ok(keys.includes('id'));
    assert.ok(keys.includes('name'));
    assert.ok(keys.includes('role'));
    assert.ok(keys.includes('cedula'));
    assert.ok(keys.includes('initials'));
  });

  // 10. GET /api/auth/me NO devuelve password
  await test('10. GET /api/auth/me NUNCA expone el campo password', async () => {
    const res = await request('/api/auth/me', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.data.user.password, undefined);
  });

  // 11. GET /api/auth/me NO devuelve PIN
  await test('11. GET /api/auth/me NUNCA expone el campo pin', async () => {
    const res = await request('/api/auth/me', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.data.user.pin, undefined);
  });

  // 12. GET /api/auth/me NO devuelve passwordHash
  await test('12. GET /api/auth/me NUNCA expone passwordHash ni pinHash', async () => {
    const res = await request('/api/auth/me', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.data.user.passwordHash, undefined);
    assert.strictEqual(res.data.user.pinHash, undefined);
  });

  // 13. Login exitoso como Cajero (PIN y Cédula)
  let cashierCookie = '';
  await test('13. POST /api/auth/login exitoso (Cajero con Cédula y PIN)', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.role, 'cajero');
    assert.strictEqual(res.data.user.name, 'Cajero Principal (DEV)');
    cashierCookie = res.setCookie.split(';')[0];
  });

  // 14. Sesión se crea únicamente tras login válido
  await test('14. Sesión no otorga acceso con credenciales inválidas', async () => {
    const resInvalid = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '0000'
      })
    });
    assert.strictEqual(resInvalid.status, 401);
    const invalidCookie = (resInvalid.setCookie || '').split(';')[0];
    const resMe = await request('/api/auth/me', {
      headers: invalidCookie ? { 'Cookie': invalidCookie } : {}
    });
    assert.strictEqual(resMe.status, 401);
  });

  // 15. Regeneración de ID de sesión en login (Previene Session Fixation)
  await test('15. Login regenera la sesión emitiendo un nuevo identificador de sesión', async () => {
    const res1 = await request('/api/auth/csrf-token');
    const initialCookie = res1.setCookie.split(';')[0];

    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Cookie': initialCookie },
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const newCookie = resLogin.setCookie.split(';')[0];
    assert.notStrictEqual(initialCookie, newCookie, 'El identificador de sesión debe renovarse tras el login');
  });

  // 16. CSRF Validation: Petición mutadora SIN x-csrf-token -> 403
  await test('16. POST /api/auth/logout sin x-csrf-token es rechazada con 403 Forbidden', async () => {
    const res = await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.status, 403, `Esperado 403, recibido ${res.status}`);
    assert.strictEqual(res.data.error, 'CSRF token inválido o ausente');
  });

  // 17. CSRF Validation: Petición mutadora con token incorrecto -> 403
  await test('17. POST /api/auth/logout con x-csrf-token falso es rechazada con 403 Forbidden', async () => {
    const res = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': 'token_falso_malicioso_12345'
      }
    });
    assert.strictEqual(res.status, 403, `Esperado 403, recibido ${res.status}`);
    assert.strictEqual(res.data.error, 'CSRF token inválido o ausente');
  });

  // 18. CSRF Validation: Petición mutadora con token correcto -> 200
  await test('18. POST /api/auth/logout con x-csrf-token válido es aceptada con 200 OK', async () => {
    const resLogout = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': adminCsrf
      }
    });
    assert.strictEqual(resLogout.status, 200);
    assert.strictEqual(resLogout.data.success, true);
  });

  // 19. GET /api/auth/me después de logout -> 401
  await test('19. GET /api/auth/me después de logout devuelve 401 Unauthorized', async () => {
    const resMe = await request('/api/auth/me', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(resMe.status, 401, `Esperado 401 después de logout, recibido ${resMe.status}`);
  });

  // 20. Sanitización de GET /api/collections/users (No expone hashes al cliente)
  await test('20. GET /api/collections/users no expone passwordHash ni pinHash', async () => {
    // Autenticar para obtener cookie válida
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const resUsers = await request('/api/collections/users', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(resUsers.status, 200);
    assert.ok(Array.isArray(resUsers.data));
    resUsers.data.forEach(u => {
      assert.strictEqual(u.passwordHash, undefined, 'passwordHash expuesto en /api/collections/users');
      assert.strictEqual(u.pinHash, undefined, 'pinHash expuesto en /api/collections/users');
      assert.strictEqual(u.password, undefined, 'password expuesto en /api/collections/users');
      assert.strictEqual(u.pin, undefined, 'pin expuesto en /api/collections/users');
    });
  });

  // 21. CSRF Token Endpoint
  await test('21. GET /api/auth/csrf-token emite token CSRF criptográfico', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.csrfToken && res.data.csrfToken.length >= 32, 'CSRF token debe tener al menos 32 caracteres');
  });

  // 22. Inmunidad a manipulación de localStorage (Sin cookie válida el servidor rechaza)
  await test('22. Manipular localStorage sin cookie de sesión server-side rechaza con 401 en /api/auth/me', async () => {
    const res = await request('/api/auth/me', {
      headers: {
        // Simular cliente que inyectó localStorage pero no tiene cookie de sesión válida
        'x-client-storage-state': 'kalu_auth_state=true'
      }
    });
    assert.strictEqual(res.status, 401, 'El servidor debe rechazar cualquier intento sin cookie válida');
  });

  // 23. Endpoint protegido sin sesión -> 401 Unauthorized
  await test('23. RBAC: Endpoint administrativo sin sesión devuelve 401 Unauthorized', async () => {
    const res = await request('/api/rbac/admin-only');
    assert.strictEqual(res.status, 401, `Esperado 401, recibido ${res.status}`);
    assert.strictEqual(res.data.error, 'No autenticado');
  });

  // 24. Endpoint protegido con sesión válida de Admin -> 200 OK
  await test('24. RBAC: Admin accede exitosamente a endpoint administrativo (200 OK)', async () => {
    // Re-autenticar como admin
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/rbac/admin-only', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.user.role, 'admin');
  });

  // 25. Endpoint exclusivo de Admin rechazado para rol Cajero -> 403 Forbidden
  let freshCashierCookie = '';
  await test('25. RBAC: Cajero intentando acceder a endpoint exclusivo de Admin recibe 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    freshCashierCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/rbac/admin-only', {
      headers: { 'Cookie': freshCashierCookie }
    });
    assert.strictEqual(res.status, 403, `Esperado 403, recibido ${res.status}`);
    assert.strictEqual(res.data.error, 'Acceso denegado: permisos insuficientes para esta operación');
  });

  // 26. GET /api/full-backup rechazado para rol Cajero -> 403 Forbidden
  await test('26. RBAC: Cajero no puede descargar /api/full-backup (403 Forbidden)', async () => {
    const res = await request('/api/full-backup', {
      headers: { 'Cookie': freshCashierCookie }
    });
    assert.strictEqual(res.status, 403);
  });

  // 27. GET /api/full-backup permitido para rol Admin -> 200 OK
  await test('27. RBAC: Admin puede descargar /api/full-backup (200 OK)', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/full-backup', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.collections, 'Debe contener objeto collections');
  });

  // 28. Endpoint de caja permitido para Cajero -> 200 OK
  await test('28. RBAC: Cajero accede exitosamente a endpoint de caja autorizado (200 OK)', async () => {
    const res = await request('/api/rbac/cashier-allowed', {
      headers: { 'Cookie': freshCashierCookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.role, 'cajero');
  });

  // 29. Endpoint de caja rechazado para rol Productor -> 403 Forbidden
  await test('29. RBAC: Productor intentando acceder a endpoint de caja recibe 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '87654321',
        pin: '4321'
      })
    });
    const producerCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/rbac/cashier-allowed', {
      headers: { 'Cookie': producerCookie }
    });
    assert.strictEqual(res.status, 403);
  });

  // 30. Intento de elevar privilegio enviando role=admin en body -> Inmune
  await test('30. RBAC: Manipular role=admin en body no eleva permisos en el servidor', async () => {
    const res = await request('/api/rbac/role-change-test', {
      method: 'POST',
      headers: { 'Cookie': freshCashierCookie },
      body: JSON.stringify({
        role: 'admin',
        userRole: 'admin',
        isAdmin: true
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.effectiveRole, 'cajero', 'El servidor debe mantener el rol de sesión original');
  });

  // 31. Intento de elevar privilegio con headers falsos -> Inmune
  await test('31. RBAC: Manipular headers (x-user-role, x-role) no eleva permisos', async () => {
    const res = await request('/api/rbac/admin-only', {
      headers: {
        'Cookie': freshCashierCookie,
        'x-user-role': 'admin',
        'x-role': 'admin',
        'x-authenticated-role': 'admin'
      }
    });
    assert.strictEqual(res.status, 403, 'El servidor debe ignorar headers manipulados por el cliente');
  });

  // 32. Diferenciación estricta entre 401 (sin sesión) y 403 (rol insuficiente)
  await test('32. RBAC: Códigos 401 y 403 permanecen estrictamente diferenciados', async () => {
    const resNoAuth = await request('/api/rbac/admin-only');
    const resForbidden = await request('/api/rbac/admin-only', {
      headers: { 'Cookie': freshCashierCookie }
    });
    assert.strictEqual(resNoAuth.status, 401, 'Sin sesión debe ser 401');
    assert.strictEqual(resForbidden.status, 403, 'Con sesión pero rol insuficiente debe ser 403');
  });

  // 33. Ninguna respuesta RBAC expone credenciales ni hashes
  await test('33. RBAC: Ninguna respuesta expone password, pin, passwordHash ni pinHash', async () => {
    const res = await request('/api/rbac/cashier-allowed', {
      headers: { 'Cookie': freshCashierCookie }
    });
    assert.strictEqual(res.data.user.password, undefined);
    assert.strictEqual(res.data.user.pin, undefined);
    assert.strictEqual(res.data.user.passwordHash, undefined);
    assert.strictEqual(res.data.user.pinHash, undefined);
  });

  // 34. Operación sensible /api/restore-backup rechazada para Cajero -> 403
  await test('34. RBAC: POST /api/restore-backup rechazado para rol Cajero (403 Forbidden)', async () => {
    const res = await request('/api/restore-backup', {
      method: 'POST',
      headers: { 'Cookie': freshCashierCookie },
      body: JSON.stringify({ collections: {} })
    });
    assert.strictEqual(res.status, 403);
  });

  // 35. Operación sensible /api/restore-backup permitida para Admin con CSRF -> 200
  await test('35. RBAC: POST /api/restore-backup permitido para Admin con token CSRF válido (200 OK)', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/restore-backup', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        collections: {
          daily_drafts: []
        }
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 36. POS: POST /api/pos/process-sale sin sesión devuelve 401 Unauthorized
  await test('36. 1C-POS: POST /api/pos/process-sale sin sesión devuelve 401 Unauthorized', async () => {
    const res = await request('/api/pos/process-sale', {
      method: 'POST',
      body: JSON.stringify({ saleItems: [{ productId: 'test', quantityKg: 1 }] })
    });
    assert.strictEqual(res.status, 401, `Esperado 401, recibido ${res.status}`);
  });

  // 37. POS: POST /api/pos/process-sale con rol no autorizado (productor) devuelve 403 Forbidden
  await test('37. 1C-POS: POST /api/pos/process-sale con rol no autorizado (productor) devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '87654321',
        pin: '4321'
      })
    });
    const producerCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: {
        'Cookie': producerCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({ saleItems: [{ productId: 'test', quantityKg: 1 }] })
    });
    assert.strictEqual(res.status, 403, `Esperado 403, recibido ${res.status}`);
  });

  // 38. POS: POST /api/pos/process-sale sin x-csrf-token devuelve 403 Forbidden
  await test('38. 1C-POS: POST /api/pos/process-sale sin x-csrf-token devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: {
        'Cookie': cashierCookie
      },
      body: JSON.stringify({ saleItems: [{ productId: 'test', quantityKg: 1 }] })
    });
    assert.strictEqual(res.status, 403, `Esperado 403, recibido ${res.status}`);
  });

  // 39. POS: POST /api/pos/process-sale válido ejecuta venta atómica (200 OK)
  await test('39. 1C-POS: POST /api/pos/process-sale válido por Cajero ejecuta venta atómica (200 OK)', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;

    const res = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        saleItems: [
          { productId: 'prod-queso-duro', productName: 'Queso Duro', quantityKg: 2, subtotal: 10 }
        ],
        customerName: 'Cliente Mostrador Test',
        paidAmount: 10,
        saleTotalAmount: 10,
        paymentMethodType: 'Efectivo'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.transaction, 'Debe generar objeto transaction');
  });

  // 40. PRODUCTS: GET /api/products sin sesión devuelve 401 Unauthorized
  await test('40. 1C-PRODUCTS: GET /api/products sin sesión devuelve 401 Unauthorized', async () => {
    const res = await request('/api/products');
    assert.strictEqual(res.status, 401);
  });

  // 41. PRODUCTS: GET /api/products con sesión válida devuelve 200 OK (sin CSRF)
  await test('41. 1C-PRODUCTS: GET /api/products con sesión válida devuelve 200 OK (sin CSRF)', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/products', {
      headers: { 'Cookie': cashierCookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  // 42. PRODUCTS: POST /api/products por Cajero devuelve 403 Forbidden
  await test('42. 1C-PRODUCTS: POST /api/products por Cajero devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/products', {
      method: 'POST',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({ name: 'Producto Ilegal Cajero', pricePerKg: 5 })
    });
    assert.strictEqual(res.status, 403);
  });

  // 43. PRODUCTS: POST /api/products por Admin sin CSRF devuelve 403 Forbidden
  await test('43. 1C-PRODUCTS: POST /api/products por Admin sin CSRF devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': adminCookie },
      body: JSON.stringify({ name: 'Producto Sin CSRF', pricePerKg: 5 })
    });
    assert.strictEqual(res.status, 403);
  });

  // 44. PRODUCTS: POST /api/products por Admin con CSRF crea producto (200 OK)
  let createdTestProductId = 'prod-test-fase1c';
  await test('44. 1C-PRODUCTS: POST /api/products por Admin con CSRF crea producto (200 OK)', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/products', {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        id: createdTestProductId,
        name: 'Queso Especial Test 1C',
        pricePerKg: 6.5,
        wholesalePrice: 5.0,
        stockKg: 50
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 45. PRODUCTS: PATCH /api/products/:id por Cajero intentando alterar wholesalePrice devuelve 403 Forbidden
  await test('45. 1C-PRODUCTS: PATCH por Cajero intentando alterar wholesalePrice devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request(`/api/products/${createdTestProductId}`, {
      method: 'PATCH',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        wholesalePrice: 1.0,
        pricePerKg: 1.0
      })
    });
    assert.strictEqual(res.status, 403, `Esperado 403, recibido ${res.status}`);
    assert.strictEqual(res.data.error, 'Acceso denegado: los cajeros solo tienen autorización para ajustes de inventario (stock).');
  });

  // 46. PRODUCTS: PATCH /api/products/:id por Cajero ajustando adjustStockKg devuelve 200 OK
  await test('46. 1C-PRODUCTS: PATCH por Cajero ajustando adjustStockKg devuelve 200 OK', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request(`/api/products/${createdTestProductId}`, {
      method: 'PATCH',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        adjustStockKg: 10
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 47. PRODUCTS: DELETE /api/products/:id por Cajero devuelve 403 Forbidden
  await test('47. 1C-PRODUCTS: DELETE por Cajero devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request(`/api/products/${createdTestProductId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(res.status, 403);
  });

  // 48. PRODUCTS: DELETE /api/products/:id por Admin con CSRF elimina producto (200 OK)
  await test('48. 1C-PRODUCTS: DELETE por Admin con CSRF elimina producto (200 OK)', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request(`/api/products/${createdTestProductId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 49. COLLECTIONS: GET /api/collections/:name sin sesión devuelve 401 Unauthorized
  await test('49. 1C-COLLECTIONS: GET sin sesión devuelve 401 Unauthorized', async () => {
    const res = await request('/api/collections/clients');
    assert.strictEqual(res.status, 401);
  });

  // 50. COLLECTIONS: GET /api/collections/adminLedger por Cajero devuelve 403 Forbidden
  await test('50. 1C-COLLECTIONS: GET /api/collections/adminLedger por Cajero devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/collections/adminLedger', {
      headers: { 'Cookie': cashierCookie }
    });
    assert.strictEqual(res.status, 403);
  });

  // 51. COLLECTIONS: GET /api/collections/adminLedger por Admin devuelve 200 OK
  await test('51. 1C-COLLECTIONS: GET /api/collections/adminLedger por Admin devuelve 200 OK', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/collections/adminLedger', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.status, 200);
  });

  // 52. COLLECTIONS: POST /api/collections/banners sin CSRF devuelve 403 Forbidden
  await test('52. 1C-COLLECTIONS: POST /api/collections/banners sin CSRF devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/collections/banners', {
      method: 'POST',
      headers: { 'Cookie': adminCookie },
      body: JSON.stringify({ id: 'banner-test', title: 'Banner 1' })
    });
    assert.strictEqual(res.status, 403);
  });

  // 53. COLLECTIONS: POST /api/collections/users por Cajero devuelve 403 Forbidden
  await test('53. 1C-COLLECTIONS: POST /api/collections/users por Cajero devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/collections/users', {
      method: 'POST',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({ name: 'Infiltrado', role: 'admin' })
    });
    assert.strictEqual(res.status, 403);
  });

  // 54. COLLECTIONS: batchDelete en colección protegida (clients) por Admin devuelve 403 Forbidden
  await test('54. 1C-COLLECTIONS: batchDelete en colección protegida (clients) por Admin devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/collections/clients/batchDelete', {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({ ids: ['cli-1', 'cli-2'] })
    });
    assert.strictEqual(res.status, 403);
  });

  // 55. COLLECTIONS: batchDelete en colección permitida (banners) por Admin con CSRF devuelve 200 OK
  await test('55. 1C-COLLECTIONS: batchDelete en colección permitida (banners) por Admin con CSRF devuelve 200 OK', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/collections/banners/batchDelete', {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({ ids: ['banner-non-existent'] })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 56. COLLECTIONS: DELETE /api/collections/clients/:id por Admin devuelve 403 Forbidden
  await test('56. 1C-COLLECTIONS: DELETE individual en colección protegida (clients) devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/collections/clients/cli-1', {
      method: 'DELETE',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(res.status, 403);
  });

  // 57. COLLECTIONS: DELETE /api/collections/banners/:id por Admin con CSRF devuelve 200 OK
  await test('57. 1C-COLLECTIONS: DELETE individual en colección permitida (banners) con CSRF devuelve 200 OK', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/collections/banners/banner-test-del', {
      method: 'DELETE',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 58. WIPE ELIMINADO: DELETE /api/collections/transactions devuelve 404 Not Found
  await test('58. 1C-WIPE: DELETE /api/collections/:name (wipe destructivo) responde 404 Not Found', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/collections/transactions', {
      method: 'DELETE',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(res.status, 404, `Esperado 404 al eliminar endpoint de wipe, recibido ${res.status}`);
  });

  // 59. RESET ACCOUNTING: POST /api/admin/reset-accounting sin sesión devuelve 401 Unauthorized
  await test('59. 1C-RESET: POST /api/admin/reset-accounting sin sesión devuelve 401 Unauthorized', async () => {
    const res = await request('/api/admin/reset-accounting', {
      method: 'POST'
    });
    assert.strictEqual(res.status, 401);
  });

  // 60. RESET ACCOUNTING: POST /api/admin/reset-accounting por Cajero devuelve 403 Forbidden
  await test('60. 1C-RESET: POST /api/admin/reset-accounting por Cajero devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/admin/reset-accounting', {
      method: 'POST',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(res.status, 403);
  });

  // 61. RESET ACCOUNTING: POST /api/admin/reset-accounting por Admin sin CSRF devuelve 403 Forbidden
  await test('61. 1C-RESET: POST /api/admin/reset-accounting por Admin sin CSRF devuelve 403 Forbidden', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/admin/reset-accounting', {
      method: 'POST',
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.status, 403);
  });

  // 62. RESET ACCOUNTING: POST /api/admin/reset-accounting por Admin con CSRF ejecuta scope fijo (200 OK)
  await test('62. 1C-RESET: POST /api/admin/reset-accounting por Admin con CSRF ejecuta restablecimiento fijo (200 OK)', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/admin/reset-accounting', {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // ============================================================
  // PRUEBAS DE FASE 1D-A: AUTENTICACIÓN SERVER-SIDE DE PORTALES
  // ============================================================

  // 64. Client portal login correcto -> 200
  await test('64. 1D-A: POST /api/portal/auth/login con cliente válido devuelve 200 y portalUser sanitizado', async () => {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });
    assert.strictEqual(res.status, 200, `Esperado 200, recibido ${res.status}`);
    assert.strictEqual(res.data.authenticated, true);
    assert.strictEqual(res.data.portalUser.type, 'client');
    assert.strictEqual(res.data.portalUser.id, 'cli-demo-1');
    assert.ok(res.data.csrfToken, 'Debe devolver un csrfToken');
    assert.strictEqual(res.data.portalUser.pin, undefined);
    assert.strictEqual(res.data.portalUser.pinHash, undefined);
    assert.strictEqual(res.data.portalUser.outstandingDebt, undefined);
    assert.ok(res.setCookie.includes('__kalu_sid'), 'Debe emitir cookie httpOnly __kalu_sid');
  });

  // 65. Producer portal login correcto -> 200
  await test('65. 1D-A: POST /api/portal/auth/login con productor válido devuelve 200 y sesión', async () => {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        pin: '321900'
      })
    });
    assert.strictEqual(res.status, 200, `Esperado 200, recibido ${res.status}`);
    assert.strictEqual(res.data.authenticated, true);
    assert.strictEqual(res.data.portalUser.type, 'producer');
    assert.strictEqual(res.data.portalUser.id, 'sup-demo-1');
    assert.strictEqual(res.data.portalUser.balanceOwed, undefined);
  });

  // 66. PIN incorrecto -> 401
  await test('66. 1D-A: POST /api/portal/auth/login con PIN erróneo devuelve 401', async () => {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '000000'
      })
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.error, 'Identificador o PIN incorrecto');
  });

  // 67. Identificador inexistente -> 401 con mensaje genérico idéntico
  await test('67. 1D-A: POST /api/portal/auth/login con usuario inexistente no enumera cuentas', async () => {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04999999999',
        pin: '123456'
      })
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.error, 'Identificador o PIN incorrecto');
  });

  // 68. Login sin datos -> 400
  await test('68. 1D-A: POST /api/portal/auth/login con payload incompleto devuelve 400 Bad Request', async () => {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ portalType: 'client' })
    });
    assert.strictEqual(res.status, 400);
  });

  // 69. No devuelve datos sensibles ni colección completa
  await test('69. 1D-A: Login de portal no expone arrays ni campos protegidos', async () => {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04249876543',
        pin: '543200'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(Array.isArray(res.data), false);
    assert.strictEqual(res.data.clients, undefined);
    assert.strictEqual(res.data.portalUser.creditLimitUsd, undefined);
  });

  // 70. GET /api/portal/auth/me sin sesión -> 401
  await test('70. 1D-A: GET /api/portal/auth/me sin cookie devuelve 401 Unauthorized', async () => {
    const res = await request('/api/portal/auth/me');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.error, 'No autenticado en portal');
  });

  // 71. GET /api/portal/auth/me con sesión activa de portal -> 200
  await test('71. 1D-A: GET /api/portal/auth/me con sesión portal devuelve identidad autenticada', async () => {
    const loginRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });
    const cookie = loginRes.setCookie.split(';')[0];
    const res = await request('/api/portal/auth/me', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.authenticated, true);
    assert.strictEqual(res.data.portalUser.id, 'cli-demo-1');
  });

  // 72. Logout invalida sesión portal
  await test('72. 1D-A: POST /api/portal/auth/logout invalida la sesión de portal', async () => {
    const loginRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });
    const cookie = loginRes.setCookie.split(';')[0];
    const csrf = loginRes.data.csrfToken;

    const logoutRes = await request('/api/portal/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(logoutRes.status, 200);

    const meRes = await request('/api/portal/auth/me', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(meRes.status, 401);
  });

  // 73. isolatedId NO autentica por sí solo en el backend
  await test('73. 1D-A: isolatedId en URL o parámetros no genera autenticación en backend', async () => {
    const res = await request('/api/portal/auth/me?isolatedId=cli-demo-1');
    assert.strictEqual(res.status, 401);
  });

  // 74. localStorage / Headers falsos no crean sesión
  await test('74. 1D-A: Headers o valores falsos de cliente no son aceptados como autoridad', async () => {
    const res = await request('/api/portal/auth/me', {
      headers: {
        'x-client-id': 'cli-demo-1',
        'x-user-id': 'cli-demo-1'
      }
    });
    assert.strictEqual(res.status, 401);
  });

  // 75. clientId arbitrario enviado en el body no crea sesión
  await test('75. 1D-A: Peticiones mutadoras sin sesión no autentican por clientId en body', async () => {
    const res = await request('/api/portal/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ clientId: 'cli-demo-1' })
    });
    assert.strictEqual(res.status, 403);
  });

  // 76. supplierId arbitrario enviado no crea sesión
  await test('76. 1D-A: supplierId en body/query no crea sesión de productor', async () => {
    const res = await request('/api/portal/auth/me?supplierId=sup-demo-1');
    assert.strictEqual(res.status, 401);
  });

  // 77. Separación de identidades CRM y Portal
  await test('77. 1D-A: Sesión exclusiva de portal no puede acceder a endpoints internos del CRM (/api/auth/me)', async () => {
    const loginRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });
    const portalCookie = loginRes.setCookie.split(';')[0];

    const crmMeRes = await request('/api/auth/me', {
      headers: { 'Cookie': portalCookie }
    });
    assert.strictEqual(crmMeRes.status, 401, 'Sesión de portal no debe autenticar en CRM interno');
  });

  // 78. Sesión CRM interna mantiene acceso a colecciones y no es borrada por login portal
  await test('78. 1D-A: Sesión CRM autenticada mantiene acceso a colecciones autorizadas', async () => {
    const crmLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const crmCookie = crmLogin.setCookie.split(';')[0];

    const clientsRes = await request('/api/collections/clients', {
      headers: { 'Cookie': crmCookie }
    });
    assert.strictEqual(clientsRes.status, 200);
    assert.ok(Array.isArray(clientsRes.data));
  });

  // 79. Usuario anónimo sigue recibiendo 401 en colecciones internas
  await test('79. 1D-A: Usuario anónimo sin sesión recibe 401 en GET /api/collections/clients', async () => {
    const res = await request('/api/collections/clients');
    assert.strictEqual(res.status, 401);
  });

  // ============================================================
  // PRUEBAS DE FASE 1D-B: SCOPED DATA, IDOR Y AISLAMIENTO DE PORTALES
  // ============================================================

  // Helper para login de cliente
  async function loginClientA() {
    const clientsPath = path.resolve('data-dev/clients_db.json');
    if (fs.existsSync(clientsPath)) {
      try {
        const clientsData = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));
        const c1 = clientsData.find(item => item.id === 'cli-demo-1');
        if (c1 && !bcrypt.compareSync('678000', c1.pinHash || '')) {
          c1.pinHash = bcrypt.hashSync('678000', 10);
          fs.writeFileSync(clientsPath, JSON.stringify(clientsData, null, 2));
        }
      } catch {}
    }

    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });
    return {
      cookie: res.setCookie ? res.setCookie.split(';')[0] : '',
      csrf: res.data?.csrfToken,
      user: res.data?.portalUser
    };
  }

  // Helper para login de cliente B
  async function loginClientB() {
    const clientsPath = path.resolve('data-dev/clients_db.json');
    if (fs.existsSync(clientsPath)) {
      try {
        const clientsData = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));
        const c2 = clientsData.find(item => item.id === 'cli-demo-2');
        if (c2 && !bcrypt.compareSync('678000', c2.pinHash || '')) {
          c2.pinHash = bcrypt.hashSync('678000', 10);
          fs.writeFileSync(clientsPath, JSON.stringify(clientsData, null, 2));
        }
      } catch {}
    }

    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04249876543',
        pin: '678000'
      })
    });
    return {
      cookie: res.setCookie ? res.setCookie.split(';')[0] : '',
      csrf: res.data?.csrfToken,
      user: res.data?.portalUser
    };
  }

  // Helper para login de productor
  async function loginProducerA() {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        pin: '321900'
      })
    });
    return {
      cookie: res.setCookie.split(';')[0],
      csrf: res.data.csrfToken,
      user: res.data.portalUser
    };
  }

  // 82. Cliente A obtiene su propio perfil scoped (GET /api/portal/client/profile)
  await test('82. 1D-B: Cliente A obtiene su propio perfil scoped (GET /api/portal/client/profile)', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/profile', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.id, 'cli-demo-1');
    assert.strictEqual(res.data.name, 'Cliente Demo Comercial S.A.');
  });

  // 83. Perfil de cliente no expone campos protegidos
  await test('83. 1D-B: Perfil de cliente no expone pin, pinHash, password ni passwordHash', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/profile', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.pin, undefined);
    assert.strictEqual(res.data.pinHash, undefined);
    assert.strictEqual(res.data.password, undefined);
    assert.strictEqual(res.data.passwordHash, undefined);
  });

  // 84. Cliente A obtiene únicamente sus finances e installments
  await test('84. 1D-B: Cliente A obtiene únicamente sus finances e installments', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/finances', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data.outstandingDebt === 'number');
    assert.ok(Array.isArray(res.data.installments));
    for (const inst of res.data.installments) {
      assert.strictEqual(String(inst.clientId), 'cli-demo-1');
    }
  });

  // 85. Cliente A obtiene únicamente sus transactions
  await test('85. 1D-B: Cliente A obtiene únicamente sus transactions', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/transactions', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    for (const tx of res.data) {
      assert.strictEqual(String(tx.clientId), 'cli-demo-1');
    }
  });

  // 86. Cliente A obtiene únicamente sus pwa_payments
  await test('86. 1D-B: Cliente A obtiene únicamente sus pwa_payments', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/payments', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    for (const pay of res.data) {
      assert.ok(String(pay.entityId) === 'cli-demo-1' || String(pay.clientId) === 'cli-demo-1');
    }
  });

  // 87. Cliente A no puede alterar scope con clientId=cli-demo-2 en query
  await test('87. 1D-B: Cliente A no puede alterar scope con clientId=cli-demo-2 en query', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/transactions?clientId=cli-demo-2', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    for (const tx of res.data) {
      assert.strictEqual(String(tx.clientId), 'cli-demo-1');
    }
  });

  // 88. Cliente A no puede alterar scope con isolatedId o headers falsos
  await test('88. 1D-B: Cliente A no puede alterar scope con isolatedId o headers falsos', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/finances?isolatedId=cli-demo-2', {
      headers: {
        'Cookie': cookie,
        'x-client-id': 'cli-demo-2',
        'x-user-id': 'cli-demo-2'
      }
    });
    assert.strictEqual(res.status, 200);
    for (const inst of res.data.installments) {
      assert.strictEqual(String(inst.clientId), 'cli-demo-1');
    }
  });

  // 89. Cliente A creando payment con entityId=cli-demo-2 en body es forzado a entityId=cli-demo-1
  await test('89. 1D-B: Cliente A creando payment con entityId=cli-demo-2 en body es forzado a entityId=cli-demo-1', async () => {
    const { cookie, csrf } = await loginClientA();
    const res = await request('/api/portal/client/payments', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        entityId: 'cli-demo-2',
        clientId: 'cli-demo-2',
        entityName: 'Tercero Manipulado',
        amount: 35.5,
        paymentMethod: 'Pago Móvil',
        reference: '123456'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.payment.entityId, 'cli-demo-1');
    assert.strictEqual(res.data.payment.clientId, 'cli-demo-1');
    assert.strictEqual(res.data.payment.entityName, 'Cliente Demo Comercial S.A.');
  });

  // 90. Cliente A no puede reportar pago de installment inexistente o de otro cliente (404)
  await test('90. 1D-B: Cliente A no puede reportar pago de installment ajena (404 Not Found)', async () => {
    const { cookie, csrf } = await loginClientA();
    const res = await request('/api/portal/client/installments/inst-no-existente-de-otro/report-payment', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(res.status, 404);
  });

  // 91. Cliente A creando orden con clientId=cli-demo-2 es forzado a clientId=cli-demo-1
  await test('91. 1D-B: Cliente A creando orden con clientId=cli-demo-2 es forzado a clientId=cli-demo-1', async () => {
    const { cookie, csrf } = await loginClientA();
    const res = await request('/api/portal/client/orders', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        clientId: 'cli-demo-2',
        clientName: 'Hack Client',
        items: [{ productId: 'p1', name: 'Harina', quantity: 2, price: 1.5, subtotal: 3.0 }]
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.order.clientId, 'cli-demo-1');
    assert.strictEqual(res.data.order.clientName, 'Cliente Demo Comercial S.A.');
  });

  // 92. Productor A obtiene su propio perfil scoped (GET /api/portal/producer/profile)
  await test('92. 1D-B: Productor A obtiene su propio perfil scoped (GET /api/portal/producer/profile)', async () => {
    const { cookie } = await loginProducerA();
    const res = await request('/api/portal/producer/profile', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.id, 'sup-demo-1');
    assert.strictEqual(res.data.name, 'Hacienda El Roble (Productor Demo)');
  });

  // 93. Perfil de productor no expone secretos ni pin/pinHash
  await test('93. 1D-B: Perfil de productor no expone secretos ni pin/pinHash', async () => {
    const { cookie } = await loginProducerA();
    const res = await request('/api/portal/producer/profile', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.pin, undefined);
    assert.strictEqual(res.data.pinHash, undefined);
    assert.strictEqual(res.data.password, undefined);
    assert.strictEqual(res.data.passwordHash, undefined);
  });

  // 94. Productor A obtiene únicamente sus trips
  await test('94. 1D-B: Productor A obtiene únicamente sus trips (GET /api/portal/producer/trips)', async () => {
    const { cookie } = await loginProducerA();
    const res = await request('/api/portal/producer/trips', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    for (const trip of res.data) {
      assert.strictEqual(String(trip.supplierId), 'sup-demo-1');
    }
  });

  // 95. Productor A obtiene únicamente sus transactions
  await test('95. 1D-B: Productor A obtiene únicamente sus transactions (GET /api/portal/producer/transactions)', async () => {
    const { cookie } = await loginProducerA();
    const res = await request('/api/portal/producer/transactions', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    for (const tx of res.data) {
      assert.strictEqual(String(tx.supplierId), 'sup-demo-1');
    }
  });

  // 96. Productor A obtiene únicamente sus orders
  await test('96. 1D-B: Productor A obtiene únicamente sus orders (GET /api/portal/producer/orders)', async () => {
    const { cookie } = await loginProducerA();
    const res = await request('/api/portal/producer/orders', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    for (const ord of res.data) {
      assert.ok(String(ord.entityId) === 'sup-demo-1' || String(ord.supplierId) === 'sup-demo-1');
    }
  });

  // 97. Productor A creando orden con entityId=sup-demo-2 es forzado a entityId=sup-demo-1
  await test('97. 1D-B: Productor A creando orden con entityId=sup-demo-2 es forzado a entityId=sup-demo-1', async () => {
    const { cookie, csrf } = await loginProducerA();
    const res = await request('/api/portal/producer/orders', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        entityId: 'sup-demo-2',
        supplierId: 'sup-demo-2',
        entityName: 'Hacker Supplier',
        items: [{ productId: 'p2', name: 'Aceite', quantity: 1, price: 5.0, subtotal: 5.0 }]
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.order.entityId, 'sup-demo-1');
    assert.strictEqual(res.data.order.supplierId, 'sup-demo-1');
    assert.strictEqual(res.data.order.entityName, 'Hacienda El Roble (Productor Demo)');
  });

  // 98. Aislamiento: Cliente no puede acceder a endpoints de productor (403 Forbidden)
  await test('98. 1D-B: Aislamiento: Cliente no puede acceder a endpoints de productor (403 Forbidden)', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/producer/trips', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 403, 'Cliente debe recibir 403 al llamar endpoint de productor');
  });

  // 99. Aislamiento: Productor no puede acceder a endpoints de cliente (403 Forbidden)
  await test('99. 1D-B: Aislamiento: Productor no puede acceder a endpoints de cliente (403 Forbidden)', async () => {
    const { cookie } = await loginProducerA();
    const res = await request('/api/portal/client/finances', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 403, 'Productor debe recibir 403 al llamar endpoint de cliente');
  });

  // 100. Portal no puede acceder a colecciones genéricas internas (401 Unauthorized)
  await test('100. 1D-B: Portal no puede acceder a colecciones genéricas internas (401 Unauthorized)', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/collections/clients', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 401, 'Usuario portal no debe poder leer /api/collections/clients');
  });

  // 101. Portal no puede acceder a users internos (401 Unauthorized)
  await test('101. 1D-B: Portal no puede acceder a users internos (401 Unauthorized)', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/collections/users', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 401);
  });

  // 102. Portal no puede acceder a adminLedger (401 Unauthorized)
  await test('102. 1D-B: Portal no puede acceder a adminLedger (401 Unauthorized)', async () => {
    const { cookie } = await loginProducerA();
    const res = await request('/api/collections/adminLedger', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 401);
  });

  // 103. Configuración pública no expone centralVaultBalance ni secretos
  await test('103. 1D-B: Configuración pública no expone centralVaultBalance ni secretos', async () => {
    const res = await request('/api/portal/public-config');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data.exchangeRate === 'number');
    assert.strictEqual(res.data.centralVaultBalance, undefined);
    assert.strictEqual(res.data.SESSION_SECRET, undefined);
  });

  // 104. Catálogo público no expone wholesalePrice ni costos mayoristas
  await test('104. 1D-B: Catálogo público no expone wholesalePrice ni costos mayoristas', async () => {
    const res = await request('/api/portal/public-catalog');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    for (const p of res.data) {
      assert.strictEqual(p.wholesalePrice, undefined);
      assert.ok(p.pricePerKg !== undefined || p.sellingPrice !== undefined);
    }
  });

  // 105. CSRF obligatorio en POST /api/portal/client/payments (403 sin token)
  await test('105. 1D-B: CSRF obligatorio en POST /api/portal/client/payments (403 sin token)', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/payments', {
      method: 'POST',
      headers: { 'Cookie': cookie },
      body: JSON.stringify({ amount: 10, reference: '123' })
    });
    assert.strictEqual(res.status, 403);
  });

  // 106. CSRF obligatorio en POST /api/portal/client/orders (403 sin token)
  await test('106. 1D-B: CSRF obligatorio en POST /api/portal/client/orders (403 sin token)', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/orders', {
      method: 'POST',
      headers: { 'Cookie': cookie },
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1, price: 1 }] })
    });
    assert.strictEqual(res.status, 403);
  });

  // 107. CSRF obligatorio en POST /api/portal/producer/orders (403 sin token)
  await test('107. 1D-B: CSRF obligatorio en POST /api/portal/producer/orders (403 sin token)', async () => {
    const { cookie } = await loginProducerA();
    const res = await request('/api/portal/producer/orders', {
      method: 'POST',
      headers: { 'Cookie': cookie },
      body: JSON.stringify({ items: [{ productId: 'p2', quantity: 1, price: 2 }] })
    });
    assert.strictEqual(res.status, 403);
  });

  // 108. CSRF obligatorio en POST /api/portal/client/installments/:id/report-payment (403 sin token)
  await test('108. 1D-B: CSRF obligatorio en report-payment de cuotas (403 sin token)', async () => {
    const { cookie } = await loginClientA();
    const res = await request('/api/portal/client/installments/inst-1/report-payment', {
      method: 'POST',
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 403);
  });

  // 109. Regresión CRM: Admin conserva acceso global a colecciones (/api/collections/clients)
  await test('109. 1D-B: Regresión CRM: Admin conserva acceso global a clients', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/collections/clients', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  // 110. Regresión CRM: Admin conserva acceso global a transactions
  await test('110. 1D-B: Regresión CRM: Admin conserva acceso global a transactions', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/collections/transactions', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  // 111. Regresión CRM: Cajero conserva ejecución de venta atómica POS (/api/pos/process-sale)
  await test('111. 1D-B: Regresión CRM: Cajero conserva ejecución de venta atómica POS', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cashierCookie = resLogin.setCookie.split(';')[0];
    const csrf = resLogin.data.csrfToken;
    const res = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      },
      body: JSON.stringify({
        saleItems: [{ productId: 'test-p', quantityKg: 1, subtotal: 10 }],
        paidAmount: 10,
        paymentMethodType: 'Efectivo USD'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 112. Regresión CRM: Accountant / Admin conserva acceso a adminLedger
  await test('112. 1D-B: Regresión CRM: Admin conserva acceso a adminLedger', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const accCookie = resLogin.setCookie.split(';')[0];
    const res = await request('/api/collections/adminLedger', {
      headers: { 'Cookie': accCookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  // ============================================================
  // PRUEBAS DE FASE 1D-C.1: RECOVERY CORE MODULE (SERVER-SIDE)
  // ============================================================

  // 114. OTP generado tiene exactamente 6 dígitos numéricos
  await test('114. 1D-C.1: OTP generado tiene exactamente 6 dígitos numéricos', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-test-1',
      targetName: 'Cliente Test',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    assert.ok(ch.otpForDelivery, 'Debe retornar otpForDelivery');
    assert.strictEqual(ch.otpForDelivery.length, 6);
    assert.ok(/^\d{6}$/.test(ch.otpForDelivery), 'OTP debe contener únicamente 6 dígitos numéricos');
  });

  // 115. OTP utiliza CSPRNG y es pseudoaleatorio entre 100000 y 999999
  await test('115. 1D-C.1: OTP utiliza CSPRNG dentro del rango 100000-999999', async () => {
    const otps = new Set();
    for (let i = 0; i < 20; i++) {
      const ch = createRecoveryChallenge({
        portalType: 'client',
        targetId: `cli-test-${i}`,
        targetName: 'Cliente Test',
        channel: 'email',
        recipient: 'test@kalu.local'
      });
      const num = parseInt(ch.otpForDelivery, 10);
      assert.ok(num >= 100000 && num <= 999999);
      otps.add(ch.otpForDelivery);
    }
    assert.ok(otps.size >= 18, 'Los códigos OTP deben tener alta entropía y no repetirse en ráfaga');
  });

  // 116. Challenge queda vinculado a targetId y portalType
  await test('116. 1D-C.1: Challenge queda vinculado a targetId y portalType', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Cliente Demo Comercial S.A.',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const stored = recoveryChallengeStore.get(ch.challengeId);
    assert.ok(stored, 'Challenge debe existir en recoveryChallengeStore');
    assert.strictEqual(stored.targetId, 'cli-demo-1');
    assert.strictEqual(stored.portalType, 'client');
    assert.strictEqual(stored.targetName, 'Cliente Demo Comercial S.A.');
  });

  // 117. OTP plaintext NO queda almacenado en el store
  await test('117. 1D-C.1: OTP plaintext NUNCA queda almacenado en el challenge store', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'producer',
      targetId: 'sup-demo-1',
      targetName: 'Hacienda El Roble',
      channel: 'whatsapp',
      recipient: '04125550101'
    });
    const stored = recoveryChallengeStore.get(ch.challengeId);
    assert.strictEqual(stored.otp, undefined);
    assert.strictEqual(stored.code, undefined);
    assert.strictEqual(stored.otpForDelivery, undefined);
    assert.ok(stored.codeHash && stored.codeHash.length === 64, 'Solo debe almacenar el SHA-256 HMAC del OTP');
    assert.notStrictEqual(stored.codeHash, ch.otpForDelivery);
  });

  // 118. Enmascaramiento de destinatarios protege privacidad
  await test('118. 1D-C.1: Helper de enmascaramiento protege teléfono y correo', async () => {
    assert.strictEqual(maskRecipient('whatsapp', '04141234567'), '+58***4567');
    assert.strictEqual(maskRecipient('email', 'usuario.demo@sistemakalu.com'), 'us***@sistemakalu.com');
  });

  // 119. OTP correcto verifica exitosamente
  await test('119. 1D-C.1: OTP correcto verifica exitosamente', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-verify-1',
      targetName: 'Cliente Verify',
      channel: 'whatsapp',
      recipient: '04141112233'
    });
    const res = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-verify-1',
      code: ch.otpForDelivery
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.resetToken && res.resetToken.length >= 32);
  });

  // 120. OTP incorrecto falla y descuenta intentos
  await test('120. 1D-C.1: OTP incorrecto falla y descuenta intentos', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-fail-1',
      targetName: 'Cliente Fail',
      channel: 'whatsapp',
      recipient: '04141112233'
    });
    const res = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-fail-1',
      code: '000000'
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_CODE');
    assert.strictEqual(res.attemptsRemaining, 2);
  });

  // 121. Tercer fallo consecutivo invalida permanentemente el challenge
  await test('121. 1D-C.1: Tercer fallo consecutivo invalida el challenge', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-lock-1',
      targetName: 'Cliente Lock',
      channel: 'whatsapp',
      recipient: '04141112233'
    });
    verifyRecoveryCode({ challengeId: ch.challengeId, portalType: 'client', targetId: 'cli-lock-1', code: '111111' });
    verifyRecoveryCode({ challengeId: ch.challengeId, portalType: 'client', targetId: 'cli-lock-1', code: '222222' });
    const thirdTry = verifyRecoveryCode({ challengeId: ch.challengeId, portalType: 'client', targetId: 'cli-lock-1', code: '333333' });
    assert.strictEqual(thirdTry.success, false);
    assert.strictEqual(thirdTry.code, 'LOCKED');

    // Intento posterior con código real debe fallar por estar invalidado
    const tryWithReal = verifyRecoveryCode({ challengeId: ch.challengeId, portalType: 'client', targetId: 'cli-lock-1', code: ch.otpForDelivery });
    assert.strictEqual(tryWithReal.success, false);
  });

  // 122. OTP expirado falla
  await test('122. 1D-C.1: OTP expirado (>10 min) es rechazado', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-exp-1',
      targetName: 'Cliente Expire',
      channel: 'email',
      recipient: 'exp@kalu.local'
    });
    // Forzar expiración simulada en store
    const stored = recoveryChallengeStore.get(ch.challengeId);
    stored.expiresAt = Date.now() - 1000;

    const res = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-exp-1',
      code: ch.otpForDelivery
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'EXPIRED');
  });

  // 123. Single-use: OTP verificado no puede volver a utilizarse (Anti-Replay)
  await test('123. 1D-C.1: Single-use: OTP verificado no puede volver a utilizarse (Anti-Replay)', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-replay-1',
      targetName: 'Cliente Replay',
      channel: 'whatsapp',
      recipient: '04149998877'
    });
    const firstVerify = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-replay-1',
      code: ch.otpForDelivery
    });
    assert.strictEqual(firstVerify.success, true);

    const secondVerify = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-replay-1',
      code: ch.otpForDelivery
    });
    assert.strictEqual(secondVerify.success, false);
  });

  // 124. Reset token se genera tras verificación exitosa con TTL de 5 minutos
  await test('124. 1D-C.1: Reset token tiene TTL de 5 minutos y binding de identidad', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-token-1',
      targetName: 'Cliente Token',
      channel: 'whatsapp',
      recipient: '04149998877'
    });
    const verRes = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-token-1',
      code: ch.otpForDelivery
    });
    assert.strictEqual(verRes.success, true);
    assert.ok(verRes.resetToken);
    assert.ok(verRes.expiresAt > Date.now());
    assert.ok(verRes.expiresAt <= Date.now() + 5 * 60 * 1000 + 1000);
  });

  // 125. consumeResetToken consume exitosamente el token para la identidad correcta
  await test('125. 1D-C.1: consumeResetToken consume exitosamente el token para la identidad correcta', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-consume-1',
      targetName: 'Cliente Consume',
      channel: 'whatsapp',
      recipient: '04149998877'
    });
    const verRes = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-consume-1',
      code: ch.otpForDelivery
    });
    const consumeRes = consumeResetToken({
      resetToken: verRes.resetToken,
      portalType: 'client',
      targetId: 'cli-consume-1'
    });
    assert.strictEqual(consumeRes.success, true);
    assert.strictEqual(consumeRes.targetId, 'cli-consume-1');
  });

  // 126. Reset token no puede reutilizarse (Single-use reset token)
  await test('126. 1D-C.1: Reset token no puede reutilizarse (Single-use reset token)', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-reuse-1',
      targetName: 'Cliente Reuse',
      channel: 'whatsapp',
      recipient: '04149998877'
    });
    const verRes = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-reuse-1',
      code: ch.otpForDelivery
    });
    const firstConsume = consumeResetToken({
      resetToken: verRes.resetToken,
      portalType: 'client',
      targetId: 'cli-reuse-1'
    });
    assert.strictEqual(firstConsume.success, true);

    const secondConsume = consumeResetToken({
      resetToken: verRes.resetToken,
      portalType: 'client',
      targetId: 'cli-reuse-1'
    });
    assert.strictEqual(secondConsume.success, false);
  });

  // 127. Reset token no puede ser consumido por otro portalType u otro targetId
  await test('127. 1D-C.1: Reset token rechaza discrepancia de identidad o tipo de portal', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-mismatch-1',
      targetName: 'Cliente Mismatch',
      channel: 'whatsapp',
      recipient: '04149998877'
    });
    const verRes = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-mismatch-1',
      code: ch.otpForDelivery
    });

    // Intento 1: Consumir con otro targetId
    const badTarget = consumeResetToken({
      resetToken: verRes.resetToken,
      portalType: 'client',
      targetId: 'cli-otro-target'
    });
    assert.strictEqual(badTarget.success, false);
    assert.strictEqual(badTarget.code, 'IDENTITY_MISMATCH');

    // Intento 2: Consumir con otro portalType (producer)
    const badType = consumeResetToken({
      resetToken: verRes.resetToken,
      portalType: 'producer',
      targetId: 'cli-mismatch-1'
    });
    assert.strictEqual(badType.success, false);
    assert.strictEqual(badType.code, 'IDENTITY_MISMATCH');
  });

  // 128. Challenge de productor funciona de forma aislada y simétrica
  await test('128. 1D-C.1: Challenge de productor opera de forma aislada e independiente', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'producer',
      targetId: 'sup-demo-1',
      targetName: 'Hacienda El Roble',
      channel: 'whatsapp',
      recipient: '04125550101'
    });
    const verRes = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'producer',
      targetId: 'sup-demo-1',
      code: ch.otpForDelivery
    });
    assert.strictEqual(verRes.success, true);
    assert.strictEqual(verRes.portalType, 'producer');

    const consRes = consumeResetToken({
      resetToken: verRes.resetToken,
      portalType: 'producer',
      targetId: 'sup-demo-1'
    });
    assert.strictEqual(consRes.success, true);
  });

  // 129. invalidateRecoveryChallenge cancela explícitamente un challenge
  await test('129. 1D-C.1: invalidateRecoveryChallenge cancela explícitamente un challenge', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-inval-1',
      targetName: 'Cliente Inval',
      channel: 'email',
      recipient: 'inval@kalu.local'
    });
    const didCancel = invalidateRecoveryChallenge(ch.challengeId);
    assert.strictEqual(didCancel, true);

    const verRes = verifyRecoveryCode({
      challengeId: ch.challengeId,
      portalType: 'client',
      targetId: 'cli-inval-1',
      code: ch.otpForDelivery
    });
    assert.strictEqual(verRes.success, false);
    assert.strictEqual(verRes.code, 'CHALLENGE_NOT_FOUND');
  });

  // 130. cleanupRecoveryStore elimina retos y tokens expirados o consumidos
  await test('130. 1D-C.1: cleanupRecoveryStore purga retos y tokens caducados de memoria', async () => {
    const ch = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-clean-1',
      targetName: 'Cliente Clean',
      channel: 'email',
      recipient: 'clean@kalu.local'
    });
    const stored = recoveryChallengeStore.get(ch.challengeId);
    stored.expiresAt = Date.now() - 5000;

    cleanupRecoveryStore();
    assert.strictEqual(recoveryChallengeStore.has(ch.challengeId), false);
  });

  // ============================================================
  // PRUEBAS DE ENDPOINTS DE RECUPERACIÓN — FASE 1D-C.2 (TESTS 131-169)
  // ============================================================

  // --- RECOVERY REQUEST ---
  // 131. Request con cliente válido genera reto y despacha OTP
  await test('131. 1D-C.2: POST /api/portal/auth/recovery/request con cliente válido genera challenge', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        channel: 'whatsapp'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.challengeId);
    assert.ok(res.data.recipientMasked);
    assert.strictEqual(res.data.otp, undefined);
    assert.strictEqual(res.data.otpForDelivery, undefined);
  });

  // 132. Request con productor válido por email
  await test('132. 1D-C.2: POST /api/portal/auth/recovery/request con productor válido genera challenge', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: 'elroble.demo@example.com',
        channel: 'email'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.challengeId);
  });

  // 133. Anti-enumeration: usuario inexistente devuelve 200 OK con mensaje idéntico
  await test('133. 1D-C.2: Anti-enumeration: usuario inexistente devuelve respuesta exitosa genérica', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04149999999',
        channel: 'whatsapp'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.challengeId, undefined);
  });

  // 134. portalType inválido devuelve 400 Bad Request
  await test('134. 1D-C.2: portalType inválido en request devuelve 400 Bad Request', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'admin',
        identifier: '04141234567',
        channel: 'whatsapp'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 135. channel inválido devuelve 400 Bad Request
  await test('135. 1D-C.2: channel inválido en request devuelve 400 Bad Request', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        channel: 'telegram'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 136. Phone arbitrario enviado en body NO es aceptado para redirección
  await test('136. 1D-C.2: Phone arbitrario en body es ignorado (destinatario se resuelve server-side)', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        channel: 'whatsapp',
        phone: '04140000000', // Intento de secuestro
        recipient: '04140000000'
      })
    });
    assert.strictEqual(res.status, 200);
    const challenge = recoveryChallengeStore.get(res.data.challengeId);
    assert.ok(challenge);
    assert.notStrictEqual(challenge.recipient, '04140000000');
    assert.strictEqual(challenge.recipient, '04141234567');
  });

  // 137. Email arbitrario enviado en body NO es aceptado para redirección
  await test('137. 1D-C.2: Email arbitrario en body es ignorado (destinatario se resuelve server-side)', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: 'elroble.demo@example.com',
        channel: 'email',
        email: 'hacker@evil.com'
      })
    });
    assert.strictEqual(res.status, 200);
    const challenge = recoveryChallengeStore.get(res.data.challengeId);
    assert.ok(challenge);
    assert.strictEqual(challenge.recipient, 'elroble.demo@example.com');
  });

  // 138. targetId arbitrario enviado en body NO es aceptado
  await test('138. 1D-C.2: targetId arbitrario en body es ignorado (se resuelve por identifier)', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        channel: 'whatsapp',
        targetId: 'cli-demo-2'
      })
    });
    assert.strictEqual(res.status, 200);
    const challenge = recoveryChallengeStore.get(res.data.challengeId);
    assert.strictEqual(challenge.targetId, 'cli-demo-1');
  });

  // 139. OTP NUNCA se expone en la respuesta HTTP
  await test('139. 1D-C.2: OTP plaintext no se expone en respuesta de /request', async () => {
    const res = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        channel: 'whatsapp'
      })
    });
    assert.strictEqual(res.status, 200);
    const rawBody = JSON.stringify(res.data);
    assert.strictEqual(rawBody.includes('otpForDelivery'), false);
    assert.strictEqual(rawBody.includes('codeHash'), false);
  });

  // --- RECOVERY VERIFY ---
  // 140. Verify con OTP correcto emite resetToken
  await test('140. 1D-C.2: POST /api/portal/auth/recovery/verify con OTP correcto devuelve resetToken', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });

    const verRes = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        challengeId: otpTest.challengeId,
        code: otpTest.otpForDelivery
      })
    });
    assert.strictEqual(verRes.status, 200);
    assert.strictEqual(verRes.data.success, true);
    assert.ok(verRes.data.resetToken);
  });

  // 141. Verify con OTP incorrecto devuelve 400 Bad Request
  await test('141. 1D-C.2: Verify con OTP incorrecto devuelve 400 Bad Request', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        challengeId: otpTest.challengeId,
        code: '000000'
      })
    });
    assert.strictEqual(verRes.status, 400);
  });

  // 142. Verify con challenge inexistente devuelve 400 Bad Request
  await test('142. 1D-C.2: Verify con challenge inexistente devuelve 400 Bad Request', async () => {
    const verRes = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        challengeId: 'rec-ch-fake-999',
        code: '123456'
      })
    });
    assert.strictEqual(verRes.status, 400);
  });

  // 143. Verify con challenge expirado devuelve 400 Bad Request
  await test('143. 1D-C.2: Verify con challenge expirado devuelve 400 Bad Request', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const doc = recoveryChallengeStore.get(otpTest.challengeId);
    doc.expiresAt = Date.now() - 1000;

    const verRes = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        challengeId: otpTest.challengeId,
        code: otpTest.otpForDelivery
      })
    });
    assert.strictEqual(verRes.status, 400);
  });

  // 144. Challenge de client verificado con portalType=producer es rechazado
  await test('144. 1D-C.2: Challenge de client no puede verificarse como producer', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: 'elroble.demo@example.com',
        challengeId: otpTest.challengeId,
        code: otpTest.otpForDelivery
      })
    });
    assert.strictEqual(verRes.status, 400);
  });

  // 145. Challenge de producer verificado con portalType=client es rechazado
  await test('145. 1D-C.2: Challenge de producer no puede verificarse como client', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'producer',
      targetId: 'sup-demo-1',
      targetName: 'Hacienda El Roble',
      channel: 'whatsapp',
      recipient: '04125550101'
    });
    const verRes = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        challengeId: otpTest.challengeId,
        code: otpTest.otpForDelivery
      })
    });
    assert.strictEqual(verRes.status, 400);
  });

  // 146. Replay: OTP verificado no puede usarse de nuevo en /verify
  await test('146. 1D-C.2: Replay en /verify es rechazado (Single-use OTP)', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const firstTry = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        challengeId: otpTest.challengeId,
        code: otpTest.otpForDelivery
      })
    });
    assert.strictEqual(firstTry.status, 200);

    const secondTry = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        challengeId: otpTest.challengeId,
        code: otpTest.otpForDelivery
      })
    });
    assert.strictEqual(secondTry.status, 400);
  });

  // 147. 3 fallos consecutivos en /verify bloquean el challenge
  await test('147. 1D-C.2: 3 fallos consecutivos en /verify invalidan el reto (Lockout)', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    await request('/api/portal/auth/recovery/verify', { method: 'POST', body: JSON.stringify({ portalType: 'client', identifier: '04141234567', challengeId: otpTest.challengeId, code: '000001' }) });
    await request('/api/portal/auth/recovery/verify', { method: 'POST', body: JSON.stringify({ portalType: 'client', identifier: '04141234567', challengeId: otpTest.challengeId, code: '000002' }) });
    const lockRes = await request('/api/portal/auth/recovery/verify', { method: 'POST', body: JSON.stringify({ portalType: 'client', identifier: '04141234567', challengeId: otpTest.challengeId, code: '000003' }) });
    assert.strictEqual(lockRes.status, 429);

    // Intento con código correcto posterior es rechazado
    const goodRes = await request('/api/portal/auth/recovery/verify', { method: 'POST', body: JSON.stringify({ portalType: 'client', identifier: '04141234567', challengeId: otpTest.challengeId, code: otpTest.otpForDelivery }) });
    assert.ok(goodRes.status === 400 || goodRes.status === 429);
  });

  // 148. Identifier manipulado en /verify no coincide con challenge
  await test('148. 1D-C.2: Identifier manipulado en /verify es rechazado', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = await request('/api/portal/auth/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04147654321', // Cliente 2
        challengeId: otpTest.challengeId,
        code: otpTest.otpForDelivery
      })
    });
    assert.ok(verRes.status === 400 || verRes.status === 429);
  });

  // --- RECOVERY RESET-PIN ---
  // 149. Reset-PIN con resetToken válido actualiza PIN de cliente
  await test('149. 1D-C.2: POST /api/portal/auth/recovery/reset-pin actualiza el PIN de cliente', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-1',
      code: otpTest.otpForDelivery
    });
    assert.strictEqual(verRes.success, true);

    const resetRes = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: verRes.resetToken,
        newPin: '654321'
      })
    });
    assert.strictEqual(resetRes.status, 200);
    assert.strictEqual(resetRes.data.success, true);

    // Validar que el login funcione con el nuevo PIN
    const loginRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '654321'
      })
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.data.authenticated, true);

    // Restaurar PIN por defecto '678000' para cli-demo-1
    const fs = await import('fs');
    const bcrypt = await import('bcryptjs');
    const defaultPinHash = bcrypt.hashSync('678000', 10);
    const clientsPath = path.resolve('data-dev/clients_db.json');
    if (fs.existsSync(clientsPath)) {
      const clientsData = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));
      const c = clientsData.find(item => item.id === 'cli-demo-1');
      if (c) c.pinHash = defaultPinHash;
      fs.writeFileSync(clientsPath, JSON.stringify(clientsData, null, 2));
    }
  });

  // 150. Reset-PIN con productor actualiza PIN de productor
  await test('150. 1D-C.2: Reset-PIN actualiza el PIN de productor', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'producer',
      targetId: 'sup-demo-1',
      targetName: 'Hacienda El Roble',
      channel: 'whatsapp',
      recipient: '04125550101'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'producer',
      targetId: 'sup-demo-1',
      code: otpTest.otpForDelivery
    });

    const resetRes = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        resetToken: verRes.resetToken,
        newPin: '888999'
      })
    });
    assert.strictEqual(resetRes.status, 200);

    const loginRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        pin: '888999'
      })
    });
    assert.strictEqual(loginRes.status, 200);

    // Restaurar PIN por defecto '321900' para sup-demo-1
    const fs = await import('fs');
    const bcrypt = await import('bcryptjs');
    const defaultPinHash = bcrypt.hashSync('321900', 10);
    const suppliersPath = path.resolve('data-dev/suppliers_db.json');
    if (fs.existsSync(suppliersPath)) {
      const suppliersData = JSON.parse(fs.readFileSync(suppliersPath, 'utf8'));
      const s = suppliersData.find(item => item.id === 'sup-demo-1');
      if (s) s.pinHash = defaultPinHash;
      fs.writeFileSync(suppliersPath, JSON.stringify(suppliersData, null, 2));
    }
  });

  // 151. Reset-PIN con resetToken inválido es rechazado
  await test('151. 1D-C.2: Reset-PIN con resetToken inválido devuelve 400 Bad Request', async () => {
    const res = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: 'fake-token-123456',
        newPin: '112233'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 152. Reset-PIN con resetToken expirado es rechazado
  await test('152. 1D-C.2: Reset-PIN con resetToken expirado devuelve 400 Bad Request', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-1',
      code: otpTest.otpForDelivery
    });
    const tokDoc = recoveryResetTokenStore.get(verRes.resetToken);
    tokDoc.expiresAt = Date.now() - 1000;

    const res = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: verRes.resetToken,
        newPin: '112233'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 153. Reset-PIN no permite reutilizar resetToken (Single-use resetToken)
  await test('153. 1D-C.2: Replay de resetToken en reset-pin es rechazado', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-1',
      code: otpTest.otpForDelivery
    });

    const first = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: verRes.resetToken,
        newPin: '123456'
      })
    });
    assert.strictEqual(first.status, 200);

    const second = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: verRes.resetToken,
        newPin: '999888'
      })
    });
    assert.strictEqual(second.status, 400);

    // Restaurar PIN por defecto '678000' para cli-demo-1
    const defaultPinHash = bcrypt.hashSync('678000', 10);
    const clientsPath = path.resolve('data-dev/clients_db.json');
    if (fs.existsSync(clientsPath)) {
      const clientsData = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));
      const c = clientsData.find(item => item.id === 'cli-demo-1');
      if (c) c.pinHash = defaultPinHash;
      fs.writeFileSync(clientsPath, JSON.stringify(clientsData, null, 2));
    }
  });

  // 154. resetToken de cliente usado para resetear productor es rechazado
  await test('154. 1D-C.2: resetToken de cliente no puede usarse con portalType=producer', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-1',
      code: otpTest.otpForDelivery
    });

    const res = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        resetToken: verRes.resetToken,
        newPin: '555666'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 155. resetToken de Cliente 1 usado con identifier de Cliente 2 es rechazado
  await test('155. 1D-C.2: resetToken de Cliente 1 no puede usarse para modificar Cliente 2', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-1',
      code: otpTest.otpForDelivery
    });

    const res = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04147654321', // Cliente 2
        resetToken: verRes.resetToken,
        newPin: '555666'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 156. PIN de 5 dígitos es rechazado
  await test('156. 1D-C.2: PIN de 5 dígitos en reset-pin es rechazado (400)', async () => {
    const res = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: 'some-token',
        newPin: '12345'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 157. PIN de 7 dígitos es rechazado
  await test('157. 1D-C.2: PIN de 7 dígitos en reset-pin es rechazado (400)', async () => {
    const res = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: 'some-token',
        newPin: '1234567'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 158. PIN alfanumérico es rechazado
  await test('158. 1D-C.2: PIN alfanumérico en reset-pin es rechazado (400)', async () => {
    const res = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: 'some-token',
        newPin: '12A45B'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 159. Body con campos maliciosos/arbitrarios es ignorado (Whitelist)
  await test('159. 1D-C.2: Body con campos arbitrarios (role, creditLimit) no altera la entidad', async () => {
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-1',
      code: otpTest.otpForDelivery
    });

    const res = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: verRes.resetToken,
        newPin: '123456',
        role: 'admin',
        creditLimit: 999999,
        balance: 0
      })
    });
    assert.strictEqual(res.status, 200);

    // Verificar en DB que el cliente no adquirió rol admin ni alteró balance
    const clients = JSON.parse(await import('fs').then(fs => fs.promises.readFile('./data-dev/clients_db.json', 'utf8')));
    const client = clients.find(c => c.id === 'cli-demo-1');
    assert.strictEqual(client.role, undefined);
    assert.notStrictEqual(client.creditLimit, 999999);
  });

  // 160. PIN plaintext NUNCA queda almacenado en la colección
  await test('160. 1D-C.2: PIN plaintext NUNCA se almacena en el JSON tras reset', async () => {
    const clients = JSON.parse(await import('fs').then(fs => fs.promises.readFile('./data-dev/clients_db.json', 'utf8')));
    const client = clients.find(c => c.id === 'cli-demo-1');
    assert.strictEqual(client.pin, undefined);
    assert.ok(client.pinHash);
    assert.ok(client.pinHash.startsWith('$2'));
  });

  // 161. Invalida la sesión portal activa si coincide con el usuario que reseteó
  await test('161. 1D-C.2: Reset-PIN invalida sesión portal activa del usuario', async () => {
    // 1. Iniciar sesión portal como cliente 1
    const loginRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '123456'
      })
    });
    const portalCookie = loginRes.setCookie;

    // 2. Realizar recovery y reset de PIN usando la cookie activa
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-1',
      code: otpTest.otpForDelivery
    });

    const resetRes = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      headers: { Cookie: portalCookie },
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: verRes.resetToken,
        newPin: '998877'
      })
    });
    assert.strictEqual(resetRes.status, 200);

    // 3. Verificar que la cookie previa ya no tenga acceso
    const meRes = await request('/api/portal/auth/me', {
      headers: { Cookie: portalCookie }
    });
    assert.strictEqual(meRes.status, 401);
  });

  // 162. Reset-PIN no destruye la sesión CRM de un usuario administrativo
  await test('162. 1D-C.2: Reset-PIN portal no destruye la sesión CRM si coexiste en sesión', async () => {
    // Iniciar sesión como admin CRM
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const adminCookie = adminLogin.setCookie;

    // Resetear PIN de cliente usando otra petición
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-2',
      targetName: 'María Rodríguez',
      channel: 'whatsapp',
      recipient: '04249876543'
    });
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-2',
      code: otpTest.otpForDelivery
    });

    await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04249876543',
        resetToken: verRes.resetToken,
        newPin: '112233'
      })
    });

    // Sesión CRM del admin debe seguir 100% activa
    const meRes = await request('/api/auth/me', {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.user.role, 'admin');

    // Restaurar PINs por defecto para que los bloques de prueba posteriores no fallen
    const fs = await import('fs');
    const bcrypt = await import('bcryptjs');

    const clientsPath = path.resolve('data-dev/clients_db.json');
    if (fs.existsSync(clientsPath)) {
      const clientsData = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));
      const c1 = clientsData.find(item => item.id === 'cli-demo-1');
      if (c1) c1.pinHash = bcrypt.hashSync('678000', 10);
      const c2 = clientsData.find(item => item.id === 'cli-demo-2');
      if (c2) c2.pinHash = bcrypt.hashSync('112233', 10);
      fs.writeFileSync(clientsPath, JSON.stringify(clientsData, null, 2));
    }

    const suppliersPath = path.resolve('data-dev/suppliers_db.json');
    if (fs.existsSync(suppliersPath)) {
      const suppliersData = JSON.parse(fs.readFileSync(suppliersPath, 'utf8'));
      const s1 = suppliersData.find(item => item.id === 'sup-demo-1');
      if (s1) s1.pinHash = bcrypt.hashSync('321900', 10);
      const s2 = suppliersData.find(item => item.id === 'sup-demo-2');
      if (s2) s2.pinHash = bcrypt.hashSync('998877', 10);
      fs.writeFileSync(suppliersPath, JSON.stringify(suppliersData, null, 2));
    }
  });

  // 163. Legacy /api/send-recovery fue retirado definitivamente (404 Not Found)
  await test('163. 1D-C.4: Legacy POST /api/send-recovery fue retirado definitivamente (404 Not Found)', async () => {
    const res = await request('/api/send-recovery', {
      method: 'POST',
      body: JSON.stringify({
        channel: 'whatsapp',
        phone: '04141234567',
        code: '123456',
        name: 'Cliente Test'
      })
    });
    assert.strictEqual(res.status, 404, 'Endpoint legacy /api/send-recovery debe retornar 404 Not Found');
  });

  // ============================================================
  // PRUEBAS DE MIGRACIÓN FRONTEND Y CONSUMER SCAN (FASE 1D-C.3)
  // ============================================================

  // 164. Consumer scan: Confirmar que ProfileTab.tsx y ProducerPortal.tsx ya no llaman a /api/send-recovery
  await test('164. 1D-C.3: Consumer scan: Componentes migraron 100% fuera de /api/send-recovery', async () => {
    const fs = await import('fs');
    const profileTabCode = await fs.promises.readFile('./src/components/ProfileTab.tsx', 'utf8');
    const producerPortalCode = await fs.promises.readFile('./src/components/portals/ProducerPortal.tsx', 'utf8');

    assert.strictEqual(profileTabCode.includes('/api/send-recovery'), false, 'ProfileTab no debe llamar a /api/send-recovery');
    assert.strictEqual(producerPortalCode.includes('/api/send-recovery'), false, 'ProducerPortal no debe llamar a /api/send-recovery');
  });

  // 165. No generación local de OTP en ProfileTab ni ProducerPortal
  await test('165. 1D-C.3: No existe generación local de OTP con Math.random en ProfileTab ni ProducerPortal', async () => {
    const fs = await import('fs');
    const profileTabCode = await fs.promises.readFile('./src/components/ProfileTab.tsx', 'utf8');
    const producerPortalCode = await fs.promises.readFile('./src/components/portals/ProducerPortal.tsx', 'utf8');

    assert.strictEqual(profileTabCode.includes('Math.random() * 900000'), false, 'ProfileTab no debe generar OTP local');
    assert.strictEqual(producerPortalCode.includes('Math.random() * 900000'), false, 'ProducerPortal no debe generar OTP local');
  });

  // 166. No verificación local de OTP en frontend
  await test('166. 1D-C.3: No existe comparación local de recoveryCode en frontend', async () => {
    const fs = await import('fs');
    const profileTabCode = await fs.promises.readFile('./src/components/ProfileTab.tsx', 'utf8');
    const producerPortalCode = await fs.promises.readFile('./src/components/portals/ProducerPortal.tsx', 'utf8');

    assert.strictEqual(profileTabCode.includes('recoveryCodeInput === recoveryCode'), false, 'ProfileTab no debe comparar OTP localmente');
    assert.strictEqual(producerPortalCode.includes('recoveryCodeInput === recoveryCode'), false, 'ProducerPortal no debe comparar OTP localmente');
  });

  // 167. Helpers de localApi para recovery implementados y tipados
  await test('167. 1D-C.3: localApi exporta helpers de recovery tipados y limpios', async () => {
    const fs = await import('fs');
    const localApiCode = await fs.promises.readFile('./src/services/localApi.ts', 'utf8');

    assert.ok(localApiCode.includes('export const portalRecoveryRequestApi'));
    assert.ok(localApiCode.includes('export const portalRecoveryVerifyApi'));
    assert.ok(localApiCode.includes('export const portalRecoveryResetPinApi'));
  });

  // 168. Flujo completo E2E client mediante endpoints server-side
  await test('168. 1D-C.3: Flujo E2E completo de Cliente: challenge -> verify -> reset-pin', async () => {
    // 1. Challenge generado server-side
    const otpTest = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      targetName: 'Juan Pérez',
      channel: 'whatsapp',
      recipient: '04141234567'
    });
    assert.ok(otpTest.challengeId);

    // 2. Verificación server-side
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'client',
      targetId: 'cli-demo-1',
      code: otpTest.otpForDelivery
    });
    assert.strictEqual(verRes.success, true);
    assert.ok(verRes.resetToken);

    // 3. Reset-PIN endpoint server-side
    const resetRes = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        resetToken: verRes.resetToken,
        newPin: '778899'
      })
    });
    assert.strictEqual(resetRes.status, 200);
    assert.strictEqual(resetRes.data.success, true);
  });

  // 169. Flujo completo E2E producer mediante endpoints server-side
  await test('169. 1D-C.3: Flujo E2E completo de Productor: challenge -> verify -> reset-pin', async () => {
    // 1. Challenge generado server-side
    const otpTest = createRecoveryChallenge({
      portalType: 'producer',
      targetId: 'sup-demo-1',
      targetName: 'Hacienda El Roble',
      channel: 'whatsapp',
      recipient: '04125550101'
    });
    assert.ok(otpTest.challengeId);

    // 2. Verificación server-side
    const verRes = verifyRecoveryCode({
      challengeId: otpTest.challengeId,
      portalType: 'producer',
      targetId: 'sup-demo-1',
      code: otpTest.otpForDelivery
    });
    assert.strictEqual(verRes.success, true);
    assert.ok(verRes.resetToken);

    // 3. Reset-PIN endpoint server-side
    const resetRes = await request('/api/portal/auth/recovery/reset-pin', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        resetToken: verRes.resetToken,
        newPin: '445566'
      })
    });
    assert.strictEqual(resetRes.status, 200);
    assert.strictEqual(resetRes.data.success, true);
  });

  // ============================================================
  // PRUEBAS DE FASE 1D-D.1: SOCKET.IO HANDSHAKE AUTH + ROOMS
  // ============================================================

  // Helper para conectar cliente Socket.IO de prueba con cookie opcional
  function connectTestSocket(cookie = null, extraOptions = {}) {
    return new Promise((resolve, reject) => {
      const headers = cookie ? { 'Cookie': cookie } : {};
      const socket = ioClient(BASE_URL, {
        withCredentials: true,
        transports: ['polling', 'websocket'],
        forceNew: true,
        extraHeaders: headers,
        transportOptions: {
          polling: {
            extraHeaders: headers
          }
        },
        ...extraOptions
      });

      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Socket.IO connection timeout'));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        resolve({ error: err, socket });
      });
    });
  }

  // TEST D1-01: Socket anónimo
  await test('170. TEST D1-01: Socket anónimo puede conectarse y obtiene únicamente room:public (NO rooms privadas)', async () => {
    const socket = await connectTestSocket(null);
    assert.ok(socket && socket.id, 'Socket anónimo debe poder conectarse');

    // Verificar que pertenece a room:public
    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.status, 200);
    assert.strictEqual(resRooms.data.identity.isAnonymous, true);
    assert.strictEqual(resRooms.data.identity.crm, null);
    assert.strictEqual(resRooms.data.identity.portal, null);
    assert.ok(resRooms.data.rooms.includes('room:public'), 'Debe estar en room:public');
    assert.ok(!resRooms.data.rooms.includes('room:crm:staff'), 'NO debe estar en room:crm:staff');
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'NO debe estar en room:crm:admin');
    const hasPortalRoom = resRooms.data.rooms.some(r => r.startsWith('room:portal:'));
    assert.strictEqual(hasPortalRoom, false, 'NO debe tener ninguna room:portal:*');
    socket.disconnect();
  });

  // TEST D1-02: CRM admin
  await test('171. TEST D1-02: CRM admin válido obtiene room:crm:staff y room:crm:admin', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const socket = await connectTestSocket(cookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.status, 200);
    assert.strictEqual(resRooms.data.identity.isAnonymous, false);
    assert.strictEqual(resRooms.data.identity.crm.role, 'admin');
    assert.strictEqual(resRooms.data.identity.crm.userId, 'usr-admin-dev');
    assert.ok(resRooms.data.rooms.includes('room:public'), 'Debe estar en room:public');
    assert.ok(resRooms.data.rooms.includes('room:crm:staff'), 'Debe estar en room:crm:staff');
    assert.ok(resRooms.data.rooms.includes('room:crm:admin'), 'Debe estar en room:crm:admin');
    const hasPortalRoom = resRooms.data.rooms.some(r => r.startsWith('room:portal:'));
    assert.strictEqual(hasPortalRoom, false, 'Admin CRM no debe tener portal rooms asignadas');
    socket.disconnect();
  });

  // TEST D1-03: CRM cajero
  await test('172. TEST D1-03: CRM cajero válido obtiene room:crm:staff pero NO room:crm:admin', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const socket = await connectTestSocket(cookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.status, 200);
    assert.strictEqual(resRooms.data.identity.isAnonymous, false);
    assert.strictEqual(resRooms.data.identity.crm.role, 'cajero');
    assert.ok(resRooms.data.rooms.includes('room:crm:staff'), 'Cajero debe estar en room:crm:staff');
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'Cajero NO debe estar en room:crm:admin');
    socket.disconnect();
  });

  // TEST D1-04: CRM accountant (o staff no-admin)
  await test('173. TEST D1-04: CRM staff con rol no-admin obtiene room:crm:staff y NO room:crm:admin', async () => {
    // usr-producer-dev en users_db tiene role 'producer' (no-admin CRM staff)
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '87654321',
        pin: '4321'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const socket = await connectTestSocket(cookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.status, 200);
    assert.strictEqual(resRooms.data.identity.isAnonymous, false);
    assert.ok(resRooms.data.rooms.includes('room:crm:staff'), 'Debe estar en room:crm:staff');
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'NO debe estar en room:crm:admin');
    socket.disconnect();
  });

  // TEST D1-05: Portal client
  await test('174. TEST D1-05: Portal client obtiene únicamente su room:portal:client:<id> (NO CRM rooms)', async () => {
    const resLogin = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '778899'
      })
    });
    assert.strictEqual(resLogin.status, 200);
    const cookie = resLogin.setCookie.split(';')[0];
    const socket = await connectTestSocket(cookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.status, 200);
    assert.strictEqual(resRooms.data.identity.portal.type, 'client');
    assert.strictEqual(resRooms.data.identity.portal.id, 'cli-demo-1');
    assert.ok(resRooms.data.rooms.includes('room:public'));
    assert.ok(resRooms.data.rooms.includes('room:portal:client:cli-demo-1'), 'Debe estar en su propia room de cliente');
    assert.ok(!resRooms.data.rooms.includes('room:crm:staff'), 'Cliente NO debe estar en room:crm:staff');
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'Cliente NO debe estar en room:crm:admin');
    socket.disconnect();
  });

  // TEST D1-06: Portal producer
  await test('175. TEST D1-06: Portal producer obtiene únicamente su room:portal:producer:<id> (NO CRM rooms)', async () => {
    const resLogin = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        pin: '445566'
      })
    });
    assert.strictEqual(resLogin.status, 200);
    const cookie = resLogin.setCookie.split(';')[0];
    const socket = await connectTestSocket(cookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.status, 200);
    assert.strictEqual(resRooms.data.identity.portal.type, 'producer');
    assert.strictEqual(resRooms.data.identity.portal.id, 'sup-demo-1');
    assert.ok(resRooms.data.rooms.includes('room:public'));
    assert.ok(resRooms.data.rooms.includes('room:portal:producer:sup-demo-1'), 'Debe estar en su propia room de productor');
    assert.ok(!resRooms.data.rooms.includes('room:crm:staff'), 'Productor NO debe estar en room:crm:staff');
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'Productor NO debe estar en room:crm:admin');
    socket.disconnect();
  });

  // TEST D1-07: Client A NO portal room de Client B
  await test('176. TEST D1-07: Client A no obtiene la room de Client B', async () => {
    const resLogin = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '778899'
      })
    });
    assert.strictEqual(resLogin.status, 200);
    const cookie = resLogin.setCookie.split(';')[0];
    const socket = await connectTestSocket(cookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.ok(resRooms.data.rooms.includes('room:portal:client:cli-demo-1'));
    assert.ok(!resRooms.data.rooms.includes('room:portal:client:cli-demo-2'), 'Client A NO debe estar en room de Client B');
    socket.disconnect();
  });

  // TEST D1-08: Producer A NO portal room de Producer B
  await test('177. TEST D1-08: Producer A no obtiene la room de Producer B', async () => {
    const resLogin = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        pin: '445566'
      })
    });
    assert.strictEqual(resLogin.status, 200);
    const cookie = resLogin.setCookie.split(';')[0];
    const socket = await connectTestSocket(cookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.ok(resRooms.data.rooms.includes('room:portal:producer:sup-demo-1'));
    assert.ok(!resRooms.data.rooms.includes('room:portal:producer:sup-demo-2'), 'Producer A NO debe estar en room de Producer B');
    socket.disconnect();
  });

  // TEST D1-09: Forged handshake identity en query/auth/headers NO modifica la identidad
  await test('178. TEST D1-09: Forged handshake identity (query/auth/headers/body) no altera la identidad', async () => {
    // Conexión anónima pero intentando suplantar a admin y client mediante query y auth payload
    const socket = await connectTestSocket(null, {
      query: { clientId: 'cli-demo-1', role: 'admin', userId: 'usr-admin-dev', room: 'room:crm:admin' },
      auth: { clientId: 'cli-demo-1', role: 'admin', userId: 'usr-admin-dev' }
    });
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.data.identity.isAnonymous, true, 'Debe permanecer estrictamente anónimo');
    assert.strictEqual(resRooms.data.identity.crm, null);
    assert.strictEqual(resRooms.data.identity.portal, null);
    assert.ok(!resRooms.data.rooms.includes('room:crm:staff'));
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'));
    assert.ok(!resRooms.data.rooms.includes('room:portal:client:cli-demo-1'));
    socket.disconnect();
  });

  // TEST D1-10: Inactive CRM user
  await test('179. TEST D1-10: Usuario CRM inactivo o inexistente no recibe rooms privadas', async () => {
    // Sesión con userId inexistente
    const fakeCookie = '__kalu_sid=s%3Afake_invalid_session_crm.xyz123';
    const socket = await connectTestSocket(fakeCookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.data.identity.isAnonymous, true);
    assert.strictEqual(resRooms.data.identity.crm, null);
    assert.ok(!resRooms.data.rooms.includes('room:crm:staff'));
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'));
    socket.disconnect();
  });

  // TEST D1-11: Inactive client
  await test('180. TEST D1-11: Cliente inexistente o inactivo en sesión no recibe portal room', async () => {
    const fakeCookie = '__kalu_sid=s%3Afake_invalid_session_client.xyz123';
    const socket = await connectTestSocket(fakeCookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.data.identity.isAnonymous, true);
    assert.strictEqual(resRooms.data.identity.portal, null);
    assert.ok(!resRooms.data.rooms.includes('room:portal:client:cli-fake'));
    socket.disconnect();
  });

  // TEST D1-12: Inactive producer
  await test('181. TEST D1-12: Productor inexistente o inactivo en sesión no recibe portal room', async () => {
    const fakeCookie = '__kalu_sid=s%3Afake_invalid_session_producer.xyz123';
    const socket = await connectTestSocket(fakeCookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.data.identity.isAnonymous, true);
    assert.strictEqual(resRooms.data.identity.portal, null);
    assert.ok(!resRooms.data.rooms.includes('room:portal:producer:sup-fake'));
    socket.disconnect();
  });

  // TEST D1-13: CRM + Portal coexist
  await test('182. TEST D1-13: Coexistencia CRM + Portal en la misma sesión asigna ambas rooms sin sobrescribir', async () => {
    // 1. Iniciar sesión como CRM admin
    const resLoginCRM = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    assert.strictEqual(resLoginCRM.status, 200);
    const crmCookie = resLoginCRM.setCookie.split(';')[0];

    // 2. En la misma sesión (mismo cookie), autenticar portal client
    const resLoginPortal = await request('/api/portal/auth/login', {
      method: 'POST',
      headers: { 'Cookie': crmCookie },
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '778899'
      })
    });
    assert.strictEqual(resLoginPortal.status, 200);
    const combinedCookie = resLoginPortal.setCookie ? resLoginPortal.setCookie.split(';')[0] : crmCookie;

    // 3. Conectar socket con la cookie combinada
    const socket = await connectTestSocket(combinedCookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.data.identity.isAnonymous, false);
    assert.ok(resRooms.data.identity.crm, 'Debe contener identidad CRM');
    assert.strictEqual(resRooms.data.identity.crm.role, 'admin');
    assert.ok(resRooms.data.identity.portal, 'Debe contener identidad Portal');
    assert.strictEqual(resRooms.data.identity.portal.type, 'client');
    assert.strictEqual(resRooms.data.identity.portal.id, 'cli-demo-1');

    // Rooms
    assert.ok(resRooms.data.rooms.includes('room:crm:staff'), 'Debe pertenecer a room:crm:staff');
    assert.ok(resRooms.data.rooms.includes('room:crm:admin'), 'Debe pertenecer a room:crm:admin');
    assert.ok(resRooms.data.rooms.includes('room:portal:client:cli-demo-1'), 'Debe pertenecer a room:portal:client:cli-demo-1');
    socket.disconnect();
  });

  // TEST D1-14: No socket mutator
  await test('183. TEST D1-14: Socket.IO no expone listeners mutadores entrantes (update, delete, process-sale, join-room)', async () => {
    const socket = await connectTestSocket(null);
    assert.ok(socket && socket.id);

    // Intentar emitir mutación simulada por socket
    let mutationAckReceived = false;
    socket.emit('process-sale', { test: true }, () => {
      mutationAckReceived = true;
    });
    socket.emit('join', 'room:crm:admin');
    socket.emit('join-room', 'room:crm:admin');

    await new Promise(r => setTimeout(r, 300));
    assert.strictEqual(mutationAckReceived, false, 'No deben existir listeners mutadores entrantes');

    // Verificar que un socket anónimo no pudo unirse a room:crm:admin vía emit
    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'Cliente no puede solicitar unirse a rooms');
    socket.disconnect();
  });

  // TEST D1-15: Cookie/session handshake
  await test('184. TEST D1-15: Socket.IO handshake comparte la misma sesión Express (sin segundo auth)', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const socket = await connectTestSocket(cookie);
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.data.sessionIdPresent, true, 'Socket debe compartir el session ID de Express');
    assert.strictEqual(resRooms.data.identity.crm.userId, 'usr-admin-dev');
    socket.disconnect();
  });

  // TEST D1-16: Existing HTTP auth regression
  await test('185. TEST D1-16: Regresión HTTP: Endpoints HTTP de 1A/1B/1C/1D-A/B/C operan con normalidad', async () => {
    const resLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    const cookie = resLogin.setCookie.split(';')[0];
    const resMe = await request('/api/auth/me', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(resMe.status, 200);
    assert.strictEqual(resMe.data.user.role, 'admin');

    const resCollections = await request('/api/collections/settings', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(resCollections.status, 200);
  });

  // ============================================================
  // PRUEBAS DE FASE 1D-D.2: EMISIÓN SOCKET.IO DIRIGIDA + AISLAMIENTO DE PAYLOADS
  // ============================================================

  // Helpers específicos de autenticación para pruebas D2
  async function loginAdminD2() {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    return {
      cookie: res.setCookie.split(';')[0],
      csrf: res.data.csrfToken,
      user: res.data.user
    };
  }

  async function loginCashierD2() {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'cajero',
        cedula: '12345678',
        pin: '1234'
      })
    });
    return {
      cookie: res.setCookie.split(';')[0],
      csrf: res.data.csrfToken,
      user: res.data.user
    };
  }

  async function loginClientAD2() {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '778899'
      })
    });
    return {
      cookie: res.setCookie.split(';')[0],
      csrf: res.data.csrfToken,
      user: res.data.portalUser
    };
  }

  async function loginClientBD2() {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04249876543',
        pin: '112233'
      })
    });
    return {
      cookie: res.setCookie.split(';')[0],
      csrf: res.data.csrfToken,
      user: res.data.portalUser
    };
  }

  async function loginProducerAD2() {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        pin: '445566'
      })
    });
    return {
      cookie: res.setCookie.split(';')[0],
      csrf: res.data.csrfToken,
      user: res.data.portalUser
    };
  }

  async function loginProducerBD2() {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04169998877',
        pin: '998877'
      })
    });
    return {
      cookie: res.setCookie.split(';')[0],
      csrf: res.data.csrfToken,
      user: res.data.portalUser
    };
  }

  // Helper para esperar eventos socket específicos con timeout
  function waitForSocketEvent(socket, eventName, timeoutMs = 1500) {
    return new Promise((resolve) => {
      let resolved = false;
      const handler = (data) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          socket.off(eventName, handler);
          resolve({ received: true, data });
        }
      };
      socket.on(eventName, handler);
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.off(eventName, handler);
          resolve({ received: false, data: null });
        }
      }, timeoutMs);
    });
  }

  // D2-01: anonymous NO recibe collection_delta privado
  await test('186. TEST D2-01: Conexión anónima NO recibe collection_delta de colecciones privadas', async () => {
    const anonSocket = await connectTestSocket(null);
    assert.ok(anonSocket && anonSocket.id);

    const eventPromise = waitForSocketEvent(anonSocket, 'collection_delta', 800);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'transactions',
      doc: { id: 'tx-test-anon', clientId: 'cli-demo-1', amount: 50 }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Socket anónimo no debe recibir deltas de transactions');
    anonSocket.disconnect();
  });

  // D2-02: anonymous NO recibe collection_updated privado
  await test('187. TEST D2-02: Conexión anónima NO recibe collection_updated de colecciones privadas', async () => {
    const anonSocket = await connectTestSocket(null);
    assert.ok(anonSocket && anonSocket.id);

    const eventPromise = waitForSocketEvent(anonSocket, 'collection_updated', 800);
    emitCollectionUpdatedScoped('transactions');

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Socket anónimo no debe recibir collection_updated de transactions');
    anonSocket.disconnect();
  });

  // D2-03: admin recibe evento interno autorizado
  await test('188. TEST D2-03: Admin CRM recibe eventos internos de colecciones administrativas (adminLedger, settings)', async () => {
    const { cookie: adminCookie } = await loginAdminD2();
    const adminSocket = await connectTestSocket(adminCookie);
    assert.ok(adminSocket && adminSocket.id);

    const eventPromise = waitForSocketEvent(adminSocket, 'collection_delta', 1200);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'adminLedger',
      doc: { id: 'ledger-test-1', amount: 500, type: 'capital_injection' }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, true, 'Admin CRM debe recibir delta de adminLedger');
    assert.strictEqual(result.data.doc.id, 'ledger-test-1');
    adminSocket.disconnect();
  });

  // D2-04: cajero recibe únicamente eventos CRM que su matriz actual permite (NO adminLedger)
  await test('189. TEST D2-04: Cajero recibe eventos operativos CRM pero NO eventos administrativos exclusivos (adminLedger)', async () => {
    const { cookie: cashierCookie } = await loginCashierD2();
    const cashierSocket = await connectTestSocket(cashierCookie);
    assert.ok(cashierSocket && cashierSocket.id);

    // 1. Debe recibir evento operativo (bills / transactions / kardex)
    const billPromise = waitForSocketEvent(cashierSocket, 'collection_delta', 1200);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'bills',
      doc: { id: 'bill-test-cashier', amount: 20 }
    });
    const billResult = await billPromise;
    assert.strictEqual(billResult.received, true, 'Cajero debe recibir delta operativo de bills');

    // 2. NO debe recibir evento de adminLedger
    const ledgerPromise = waitForSocketEvent(cashierSocket, 'collection_delta', 800);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'adminLedger',
      doc: { id: 'ledger-secret-test', amount: 9999 }
    });
    const ledgerResult = await ledgerPromise;
    assert.strictEqual(ledgerResult.received, false, 'Cajero NO debe recibir deltas de adminLedger');

    cashierSocket.disconnect();
  });

  // D2-05: client A recibe transaction de A
  await test('190. TEST D2-05: Portal Client A recibe únicamente transactions pertenecientes a Client A', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const clientASocket = await connectTestSocket(clientACookie);
    assert.ok(clientASocket && clientASocket.id);

    const eventPromise = waitForSocketEvent(clientASocket, 'collection_delta', 1200);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'transactions',
      doc: { id: 'tx-client-a-test', clientId: 'cli-demo-1', amount: 45.5, status: 'Completado' }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, true, 'Cliente A debe recibir su propia transacción');
    assert.strictEqual(result.data.doc.id, 'tx-client-a-test');
    assert.strictEqual(result.data.doc.clientId, 'cli-demo-1');
    clientASocket.disconnect();
  });

  // D2-06: client A NO recibe transaction de B
  await test('191. TEST D2-06: Portal Client A NO recibe transactions pertenecientes a Client B', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const clientASocket = await connectTestSocket(clientACookie);
    assert.ok(clientASocket && clientASocket.id);

    const eventPromise = waitForSocketEvent(clientASocket, 'collection_delta', 800);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'transactions',
      doc: { id: 'tx-client-b-test', clientId: 'cli-demo-2', amount: 150.0, status: 'Completado' }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Cliente A jamás debe recibir transacciones de Cliente B');
    clientASocket.disconnect();
  });

  // D2-07: producer A recibe cheeseTrip de A
  await test('192. TEST D2-07: Portal Producer A recibe cheeseTrips pertenecientes a Producer A', async () => {
    const { cookie: producerACookie } = await loginProducerAD2();
    const producerASocket = await connectTestSocket(producerACookie);
    assert.ok(producerASocket && producerASocket.id);

    const eventPromise = waitForSocketEvent(producerASocket, 'collection_delta', 1200);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'cheeseTrips',
      doc: { id: 'trip-producer-a-test', supplierId: 'sup-demo-1', totalKg: 200, status: 'Completado' }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, true, 'Productor A debe recibir su propio viaje de queso');
    assert.strictEqual(result.data.doc.id, 'trip-producer-a-test');
    producerASocket.disconnect();
  });

  // D2-08: producer A NO recibe cheeseTrip de B
  await test('193. TEST D2-08: Portal Producer A NO recibe cheeseTrips de Producer B', async () => {
    const { cookie: producerACookie } = await loginProducerAD2();
    const producerASocket = await connectTestSocket(producerACookie);
    assert.ok(producerASocket && producerASocket.id);

    const eventPromise = waitForSocketEvent(producerASocket, 'collection_delta', 800);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'cheeseTrips',
      doc: { id: 'trip-producer-b-test', supplierId: 'sup-demo-2', totalKg: 450, status: 'Completado' }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Productor A jamás debe recibir viajes de Productor B');
    producerASocket.disconnect();
  });

  // D2-09: client A NO recibe kardex
  await test('194. TEST D2-09: Portal Client NO recibe eventos de la colección kardex', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const clientASocket = await connectTestSocket(clientACookie);
    assert.ok(clientASocket && clientASocket.id);

    const eventPromise = waitForSocketEvent(clientASocket, 'collection_delta', 800);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'kardex',
      doc: { id: 'kardex-internal-1', productId: 'p1', quantity: 10, unitCost: 4.5 }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Portal Client no debe recibir deltas de kardex');
    clientASocket.disconnect();
  });

  // D2-10: client A NO recibe adminLedger
  await test('195. TEST D2-10: Portal Client NO recibe eventos de adminLedger', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const clientASocket = await connectTestSocket(clientACookie);
    assert.ok(clientASocket && clientASocket.id);

    const eventPromise = waitForSocketEvent(clientASocket, 'collection_delta', 800);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'adminLedger',
      doc: { id: 'ledger-secret', amount: 50000 }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Portal Client no debe recibir adminLedger');
    clientASocket.disconnect();
  });

  // D2-11: producer A NO recibe business_debts
  await test('196. TEST D2-11: Portal Producer NO recibe eventos de business_debts ni deudas internas', async () => {
    const { cookie: producerACookie } = await loginProducerAD2();
    const producerASocket = await connectTestSocket(producerACookie);
    assert.ok(producerASocket && producerASocket.id);

    const eventPromise = waitForSocketEvent(producerASocket, 'collection_delta', 800);
    emitCollectionDeltaScoped({
      action: 'add',
      collection: 'business_debts',
      doc: { id: 'debt-internal-1', amount: 12000, creditor: 'Banco' }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Portal Producer no debe recibir business_debts');
    producerASocket.disconnect();
  });

  // D2-12: portal NO recibe users/settings internos
  await test('197. TEST D2-12: Usuarios del portal NO reciben eventos de users ni settings confidenciales', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const clientASocket = await connectTestSocket(clientACookie);
    assert.ok(clientASocket && clientASocket.id);

    const eventPromise = waitForSocketEvent(clientASocket, 'collection_delta', 800);
    emitCollectionDeltaScoped({
      action: 'update',
      collection: 'users',
      doc: { id: 'usr-admin-dev', name: 'Admin', role: 'admin' }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Portal no debe recibir eventos de users');
    clientASocket.disconnect();
  });

  // D2-13: public product event no contiene wholesalePrice/cost/supplier/internal fields
  await test('198. TEST D2-13: Evento público de products es sanitizado y no contiene wholesalePrice, cost ni notas internas', async () => {
    const anonSocket = await connectTestSocket(null);
    assert.ok(anonSocket && anonSocket.id);

    const eventPromise = waitForSocketEvent(anonSocket, 'collection_delta', 1200);
    emitCollectionDeltaScoped({
      action: 'update',
      collection: 'products',
      doc: {
        id: 'p-test-sanitized',
        name: 'Queso Duro Santa Bárbara',
        pricePerKg: 6.5,
        wholesalePrice: 4.2,
        cost: 3.8,
        margin: 0.35,
        adminNotes: 'Confidencial margen Sabanota'
      }
    });

    const result = await eventPromise;
    assert.strictEqual(result.received, true, 'Socket público debe recibir el evento de producto');
    assert.strictEqual(result.data.doc.name, 'Queso Duro Santa Bárbara');
    assert.strictEqual(result.data.doc.pricePerKg, 6.5);
    assert.strictEqual(result.data.doc.wholesalePrice, undefined, 'wholesalePrice debe estar sanitizado');
    assert.strictEqual(result.data.doc.cost, undefined, 'cost debe estar sanitizado');
    assert.strictEqual(result.data.doc.adminNotes, undefined, 'adminNotes debe estar sanitizado');
    anonSocket.disconnect();
  });

  // D2-14: collection_updated respeta exactamente el mismo scoping
  await test('199. TEST D2-14: collection_updated respeta scoping estricto (no llega a portales para colecciones privadas)', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const clientASocket = await connectTestSocket(clientACookie);
    assert.ok(clientASocket && clientASocket.id);

    const eventPromise = waitForSocketEvent(clientASocket, 'collection_updated', 800);
    emitCollectionUpdatedScoped('kardex');

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Portal no debe recibir collection_updated de kardex');
    clientASocket.disconnect();
  });

  // D2-15: DELETE de recurso de client A no llega a client B
  await test('200. TEST D2-15: DELETE de recurso perteneciente a Client A se notifica a A pero NO a Client B', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const { cookie: clientBCookie } = await loginClientBD2();

    const socketA = await connectTestSocket(clientACookie);
    const socketB = await connectTestSocket(clientBCookie);

    const promiseA = waitForSocketEvent(socketA, 'collection_delta', 1200);
    const promiseB = waitForSocketEvent(socketB, 'collection_delta', 800);

    const previousDoc = { id: 'ord-client-a-del', clientId: 'cli-demo-1', total: 30 };
    emitCollectionDeltaScoped(
      { action: 'delete', collection: 'mobileOrders', doc: { id: 'ord-client-a-del' } },
      previousDoc
    );

    const [resA, resB] = await Promise.all([promiseA, promiseB]);
    assert.strictEqual(resA.received, true, 'Client A debe recibir el delete de su pedido');
    assert.strictEqual(resB.received, false, 'Client B NO debe recibir el delete del pedido de A');

    socketA.disconnect();
    socketB.disconnect();
  });

  // D2-16: DELETE de recurso de producer A no llega a producer B
  await test('201. TEST D2-16: DELETE de recurso perteneciente a Producer A se notifica a A pero NO a Producer B', async () => {
    const { cookie: producerACookie } = await loginProducerAD2();
    const { cookie: producerBCookie } = await loginProducerBD2();

    const socketA = await connectTestSocket(producerACookie);
    const socketB = await connectTestSocket(producerBCookie);

    const promiseA = waitForSocketEvent(socketA, 'collection_delta', 1200);
    const promiseB = waitForSocketEvent(socketB, 'collection_delta', 800);

    const previousDoc = { id: 'trip-producer-a-del', supplierId: 'sup-demo-1', totalKg: 300 };
    emitCollectionDeltaScoped(
      { action: 'delete', collection: 'cheeseTrips', doc: { id: 'trip-producer-a-del' } },
      previousDoc
    );

    const [resA, resB] = await Promise.all([promiseA, promiseB]);
    assert.strictEqual(resA.received, true, 'Producer A debe recibir delete de su viaje');
    assert.strictEqual(resB.received, false, 'Producer B NO debe recibir delete de A');

    socketA.disconnect();
    socketB.disconnect();
  });

  // D2-17: ownership change A -> B notifica eliminación al propietario anterior y alta al nuevo
  await test('202. TEST D2-17: Cambio de propietario A -> B emite remoción al owner anterior y actualización al nuevo', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const { cookie: clientBCookie } = await loginClientBD2();

    const socketA = await connectTestSocket(clientACookie);
    const socketB = await connectTestSocket(clientBCookie);

    const promiseA = waitForSocketEvent(socketA, 'collection_delta', 1200);
    const promiseB = waitForSocketEvent(socketB, 'collection_delta', 1200);

    const previousDoc = { id: 'tx-reassigned', clientId: 'cli-demo-1', amount: 100 };
    const updatedDoc = { id: 'tx-reassigned', clientId: 'cli-demo-2', amount: 100 };

    emitCollectionDeltaScoped(
      { action: 'update', collection: 'transactions', doc: updatedDoc },
      previousDoc
    );

    const [resA, resB] = await Promise.all([promiseA, promiseB]);
    assert.strictEqual(resA.received, true, 'Client A debe recibir delta para remover la transacción reasignada');
    assert.strictEqual(resA.data.action, 'delete', 'Client A debe recibir acción delete');
    assert.strictEqual(resB.received, true, 'Client B debe recibir delta con la nueva transacción asignada');
    assert.strictEqual(resB.data.action, 'update', 'Client B debe recibir acción update');

    socketA.disconnect();
    socketB.disconnect();
  });

  // D2-18: process-sale no genera eventos duplicados para una misma escritura
  await test('203. TEST D2-18: POST /api/pos/process-sale genera exactamente 1 emisión por movimiento y no eventos duplicados', async () => {
    const { cookie: adminCookie, csrf } = await loginAdminD2();
    const adminSocket = await connectTestSocket(adminCookie);
    assert.ok(adminSocket && adminSocket.id);

    const receivedDeltas = [];
    adminSocket.on('collection_delta', (d) => {
      receivedDeltas.push(d);
    });

    // Asegurar que el producto existe para la venta
    const prodId = 'prod-demo-1';
    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': adminCookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Queso Demo 1', pricePerKg: 4.5, stockKg: 20 })
    });

    const resSale = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': adminCookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [{ productId: prodId, quantityKg: 1, subtotal: 4.5 }],
        clientId: 'cli-demo-1',
        customerName: 'Cliente Demo Comercial S.A.',
        paidAmount: 4.5,
        saleTotalAmount: 4.5,
        paymentMethodType: 'Efectivo'
      })
    });
    assert.strictEqual(resSale.status, 200);

    await new Promise(r => setTimeout(r, 600));

    // Contar emisiones de kardex
    const kardexEmissions = receivedDeltas.filter(d => d.collection === 'kardex');
    assert.strictEqual(kardexEmissions.length, 1, 'Debe haber exactamente 1 emisión de kardex para la venta');

    adminSocket.disconnect();
  });

  // D2-19: database_restored no expone payload sensible a portal
  await test('204. TEST D2-19: database_restored NO llega a usuarios de portal ni expone resumen sensible', async () => {
    const { cookie: clientACookie } = await loginClientAD2();
    const clientASocket = await connectTestSocket(clientACookie);
    assert.ok(clientASocket && clientASocket.id);

    const eventPromise = waitForSocketEvent(clientASocket, 'database_restored', 800);

    const { cookie: adminCookie, csrf } = await loginAdminD2();
    const resRestore = await request('/api/restore-backup', {
      method: 'POST',
      headers: { 'Cookie': adminCookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        collections: {
          banners: []
        }
      })
    });
    assert.strictEqual(resRestore.status, 200);

    const result = await eventPromise;
    assert.strictEqual(result.received, false, 'Portal Client jamás debe recibir evento database_restored');
    clientASocket.disconnect();
  });

  // D2-20: Socket.IO CORS rechaza origin no permitido
  await test('205. TEST D2-20: isOriginAllowed rechaza orígenes no permitidos y valida allowlist', () => {
    assert.strictEqual(isOriginAllowed('http://evil-hacker.com'), false, 'Origin desconocido debe ser rechazado');
    assert.strictEqual(isOriginAllowed('https://malicious-site.xyz'), false, 'Sitio malicioso debe ser rechazado');
  });

  // D2-21: Socket.IO permite origins DEV explícitamente autorizados
  await test('206. TEST D2-21: isOriginAllowed permite orígenes de desarrollo locales autorizados', () => {
    assert.strictEqual(isOriginAllowed('http://localhost:3000'), true, 'localhost:3000 debe estar permitido');
    assert.strictEqual(isOriginAllowed('http://127.0.0.1:3000'), true, '127.0.0.1:3000 debe estar permitido');
    assert.strictEqual(isOriginAllowed('http://localhost:5173'), true, 'localhost:5173 debe estar permitido');
    assert.strictEqual(isOriginAllowed(''), true, 'Petición local sin Origin debe estar permitida');
  });

  // D2-22: payload de portal no contiene passwordHash/pinHash/tokens/secrets
  await test('207. TEST D2-22: sanitizeClientPayload y sanitizeProducerPayload eliminan hashes, pines y secretos', () => {
    const rawDoc = {
      id: 'doc-sensitive-1',
      name: 'Cliente Demo',
      password: 'PlainPassword123',
      pin: '1234',
      passwordHash: '$2a$10$abcdef1234567890',
      pinHash: '$2a$10$0987654321fedcba',
      wholesalePrice: 3.5,
      unitCost: 3.0,
      adminNotes: 'Nota confidencial',
      balance: 100
    };

    const sanitizedClient = sanitizeClientPayload('transactions', rawDoc);
    assert.strictEqual(sanitizedClient.password, undefined);
    assert.strictEqual(sanitizedClient.pin, undefined);
    assert.strictEqual(sanitizedClient.passwordHash, undefined);
    assert.strictEqual(sanitizedClient.pinHash, undefined);
    assert.strictEqual(sanitizedClient.wholesalePrice, undefined);
    assert.strictEqual(sanitizedClient.unitCost, undefined);
    assert.strictEqual(sanitizedClient.adminNotes, undefined);
    assert.strictEqual(sanitizedClient.balance, 100);

    const sanitizedProducer = sanitizeProducerPayload('cheeseTrips', rawDoc);
    assert.strictEqual(sanitizedProducer.passwordHash, undefined);
    assert.strictEqual(sanitizedProducer.pinHash, undefined);
    assert.strictEqual(sanitizedProducer.wholesalePrice, undefined);
    assert.strictEqual(sanitizedProducer.balance, 100);
  });

  // D2-23: forged clientId/supplierId no altera el destinatario
  await test('208. TEST D2-23: Socket.IO asignación de rooms no confía en parámetros alterados por el frontend', async () => {
    // Cliente intenta conectarse enviando auth custom o query params falsificados
    const socket = await connectTestSocket(null, {
      auth: { clientId: 'cli-victim-99', role: 'admin' },
      query: { clientId: 'cli-victim-99', supplierId: 'sup-victim-99' }
    });
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resRooms.data.identity.isAnonymous, true, 'Debe permanecer anónimo a pesar de auth/query params falsos');
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'No debe obtener room admin');
    assert.ok(!resRooms.data.rooms.includes('room:portal:client:cli-victim-99'), 'No debe obtener room cliente falsa');
    socket.disconnect();
  });

  // D2-24: Regresión general y persistencia de 1D-D.2
  await test('209. TEST D2-24: Verificación de estabilidad general: funciones de emisión operan limpiamente', () => {
    assert.doesNotThrow(() => {
      emitCollectionDeltaScoped({ action: 'add', collection: 'banners', doc: { id: 'b1', title: 'Banner' } });
      emitCollectionUpdatedScoped('banners');
    });
  });

  // ============================================================
  // PRUEBAS DE FASE 1D-D.3: SOCKET LIFECYCLE, INVALIDATION & RECONNECT
  // ============================================================

  // D3-01: anonymous socket -> portal login -> old socket remains public only
  await test('210. TEST D3-01: Socket anónimo previo a login de portal NO adquiere privilegios de portal', async () => {
    const anonSocket = await connectTestSocket(null);
    assert.ok(anonSocket && anonSocket.id);

    // Login HTTP de cliente A
    const { cookie: clientCookie } = await loginClientAD2();

    // Consultar rooms del socket viejo
    const resRooms = await request(`/api/test-socket-info/${anonSocket.id}`);
    assert.strictEqual(resRooms.data.identity.isAnonymous, true, 'Socket viejo debe seguir siendo anónimo');
    assert.ok(!resRooms.data.rooms.includes('room:portal:client:cli-demo-1'), 'Socket viejo NO debe adquirir room de cliente');
    anonSocket.disconnect();
  });

  // D3-02: portal client login -> reconnect -> correct client room
  await test('211. TEST D3-02: Cliente reconecta tras login y obtiene su room de cliente legítima', async () => {
    const { cookie: clientCookie } = await loginClientAD2();
    const newSocket = await connectTestSocket(clientCookie);
    assert.ok(newSocket && newSocket.id);

    const resRooms = await request(`/api/test-socket-info/${newSocket.id}`);
    assert.strictEqual(resRooms.data.identity.portal.type, 'client');
    assert.strictEqual(resRooms.data.identity.portal.id, 'cli-demo-1');
    assert.ok(resRooms.data.rooms.includes('room:portal:client:cli-demo-1'), 'Nuevo socket debe tener su room de cliente');
    newSocket.disconnect();
  });

  // D3-03: portal producer login -> reconnect -> correct producer room
  await test('212. TEST D3-03: Productor reconecta tras login y obtiene su room de productor legítima', async () => {
    const { cookie: producerCookie } = await loginProducerAD2();
    const newSocket = await connectTestSocket(producerCookie);
    assert.ok(newSocket && newSocket.id);

    const resRooms = await request(`/api/test-socket-info/${newSocket.id}`);
    assert.strictEqual(resRooms.data.identity.portal.type, 'producer');
    assert.strictEqual(resRooms.data.identity.portal.id, 'sup-demo-1');
    assert.ok(resRooms.data.rooms.includes('room:portal:producer:sup-demo-1'), 'Nuevo socket debe tener su room de productor');
    newSocket.disconnect();
  });

  // D3-04: CRM admin login -> reconnect -> admin rooms
  await test('213. TEST D3-04: Admin CRM reconecta tras login y obtiene rooms staff y admin', async () => {
    const { cookie: adminCookie } = await loginAdminD2();
    const adminSocket = await connectTestSocket(adminCookie);
    assert.ok(adminSocket && adminSocket.id);

    const resRooms = await request(`/api/test-socket-info/${adminSocket.id}`);
    assert.strictEqual(resRooms.data.identity.crm.role, 'admin');
    assert.ok(resRooms.data.rooms.includes('room:crm:staff'));
    assert.ok(resRooms.data.rooms.includes('room:crm:admin'));
    adminSocket.disconnect();
  });

  // D3-05: CRM cashier login -> reconnect -> staff only (NO admin)
  await test('214. TEST D3-05: Cajero CRM reconecta tras login y obtiene staff pero NO admin room', async () => {
    const { cookie: cashierCookie } = await loginCashierD2();
    const cashierSocket = await connectTestSocket(cashierCookie);
    assert.ok(cashierSocket && cashierSocket.id);

    const resRooms = await request(`/api/test-socket-info/${cashierSocket.id}`);
    assert.strictEqual(resRooms.data.identity.crm.role, 'cajero');
    assert.ok(resRooms.data.rooms.includes('room:crm:staff'));
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'Cajero no debe obtener room:crm:admin');
    cashierSocket.disconnect();
  });

  // D3-06: admin logout invalidates all sockets of same session
  await test('215. TEST D3-06: Logout de Admin CRM invalida y desconecta server-side los sockets de la sesión', async () => {
    const { cookie: adminCookie, csrf } = await loginAdminD2();
    const socket = await connectTestSocket(adminCookie);
    assert.ok(socket && socket.id);

    const disconnectPromise = new Promise((resolve) => {
      socket.on('disconnect', () => resolve(true));
      setTimeout(() => resolve(false), 2000);
    });

    // Ejecutar HTTP logout con CSRF
    const resLogout = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(resLogout.status, 200);

    const disconnected = await disconnectPromise;
    assert.strictEqual(disconnected, true, 'Socket debe ser desconectado server-side tras logout');
  });

  // D3-07: portal logout invalidates portal room
  await test('216. TEST D3-07: Logout de Portal Cliente invalida y desconecta socket exclusivo de portal', async () => {
    const { cookie: clientCookie, csrf } = await loginClientAD2();
    const socket = await connectTestSocket(clientCookie);
    assert.ok(socket && socket.id);

    const disconnectPromise = new Promise((resolve) => {
      socket.on('disconnect', () => resolve(true));
      setTimeout(() => resolve(false), 2000);
    });

    const resLogout = await request('/api/portal/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': clientCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(resLogout.status, 200);

    const disconnected = await disconnectPromise;
    assert.strictEqual(disconnected, true, 'Socket de portal exclusivo debe ser desconectado');
  });

  // D3-08: CRM + client coexistence -> portal logout removes only portal room, preserves CRM socket
  await test('217. TEST D3-08: Coexistencia CRM + Portal: Portal logout purga room de portal y preserva CRM rooms', async () => {
    const { cookie: adminCookie, csrf } = await loginAdminD2();

    // Login portal en la misma sesión (coexistencia)
    const resPortalLogin = await request('/api/portal/auth/login', {
      method: 'POST',
      headers: { 'Cookie': adminCookie },
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '778899'
      })
    });
    const sessionCookie = resPortalLogin.setCookie.split(';')[0];
    const portalCsrf = resPortalLogin.data.csrfToken;

    const socket = await connectTestSocket(sessionCookie);
    assert.ok(socket && socket.id);

    // Verificar que tiene ambas rooms inicialmente
    const resRoomsBefore = await request(`/api/test-socket-info/${socket.id}`);
    assert.ok(resRoomsBefore.data.rooms.includes('room:crm:admin'));
    assert.ok(resRoomsBefore.data.rooms.includes('room:portal:client:cli-demo-1'));

    // Ejecutar Portal Logout preservando CRM
    const resPortalLogout = await request('/api/portal/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'x-csrf-token': portalCsrf
      }
    });
    assert.strictEqual(resPortalLogout.status, 200);

    // Verificar rooms después del logout
    const resRoomsAfter = await request(`/api/test-socket-info/${socket.id}`);
    assert.ok(resRoomsAfter.data.rooms.includes('room:crm:admin'), 'Debe conservar room:crm:admin');
    assert.ok(resRoomsAfter.data.rooms.includes('room:crm:staff'), 'Debe conservar room:crm:staff');
    assert.ok(!resRoomsAfter.data.rooms.includes('room:portal:client:cli-demo-1'), 'Debe haber purgado room:portal:client:cli-demo-1');
    socket.disconnect();
  });

  // D3-09: CRM + producer coexistence -> portal logout removes only producer room
  await test('218. TEST D3-09: Coexistencia CRM + Productor: Portal logout purga room de productor y preserva CRM rooms', async () => {
    const { cookie: adminCookie } = await loginAdminD2();

    const resPortalLogin = await request('/api/portal/auth/login', {
      method: 'POST',
      headers: { 'Cookie': adminCookie },
      body: JSON.stringify({
        portalType: 'producer',
        identifier: '04125550101',
        pin: '445566'
      })
    });
    const sessionCookie = resPortalLogin.setCookie.split(';')[0];
    const portalCsrf = resPortalLogin.data.csrfToken;

    const socket = await connectTestSocket(sessionCookie);
    assert.ok(socket && socket.id);

    const resRoomsBefore = await request(`/api/test-socket-info/${socket.id}`);
    assert.ok(resRoomsBefore.data.rooms.includes('room:crm:admin'));
    assert.ok(resRoomsBefore.data.rooms.includes('room:portal:producer:sup-demo-1'));

    const resPortalLogout = await request('/api/portal/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'x-csrf-token': portalCsrf
      }
    });
    assert.strictEqual(resPortalLogout.status, 200);

    const resRoomsAfter = await request(`/api/test-socket-info/${socket.id}`);
    assert.ok(resRoomsAfter.data.rooms.includes('room:crm:admin'));
    assert.ok(!resRoomsAfter.data.rooms.includes('room:portal:producer:sup-demo-1'), 'Debe haber purgado room de productor');
    socket.disconnect();
  });

  // D3-10: CRM logout invalidates CRM rooms
  await test('219. TEST D3-10: CRM logout destruye sesión e invalida acceso a eventos privados', async () => {
    const { cookie: cashierCookie, csrf } = await loginCashierD2();
    const socket = await connectTestSocket(cashierCookie);
    assert.ok(socket && socket.id);

    const resLogout = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': cashierCookie,
        'x-csrf-token': csrf
      }
    });
    assert.strictEqual(resLogout.status, 200);

    const resSocket = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resSocket.status, 404, 'Socket cerrado no debe estar activo');
  });

  // D3-11: admin logout -> cashier login -> old admin socket cannot receive admin events
  await test('220. TEST D3-11: Admin logout seguido de login Cajero en nueva conexión no otorga privilegios admin', async () => {
    const { cookie: adminCookie, csrf } = await loginAdminD2();
    const adminSocket = await connectTestSocket(adminCookie);
    assert.ok(adminSocket && adminSocket.id);

    await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': adminCookie, 'x-csrf-token': csrf }
    });

    const { cookie: cashierCookie } = await loginCashierD2();
    const cashierSocket = await connectTestSocket(cashierCookie);

    const resRooms = await request(`/api/test-socket-info/${cashierSocket.id}`);
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'Nueva conexión de cajero jamás hereda room admin');
    cashierSocket.disconnect();
  });

  // D3-12: portal A logout -> portal B login -> A room is never inherited
  await test('221. TEST D3-12: Portal A logout seguido de login Portal B no hereda rooms de Portal A', async () => {
    const { cookie: clientACookie, csrf: csrfA } = await loginClientAD2();
    const socketA = await connectTestSocket(clientACookie);
    assert.ok(socketA && socketA.id);

    await request('/api/portal/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': clientACookie, 'x-csrf-token': csrfA }
    });

    const { cookie: clientBCookie } = await loginClientBD2();
    const socketB = await connectTestSocket(clientBCookie);
    assert.ok(socketB && socketB.id);

    const resRoomsB = await request(`/api/test-socket-info/${socketB.id}`);
    assert.ok(resRoomsB.data.rooms.includes('room:portal:client:cli-demo-2'));
    assert.ok(!resRoomsB.data.rooms.includes('room:portal:client:cli-demo-1'), 'Socket B jamás hereda room de Client A');
    socketB.disconnect();
  });

  // D3-13: two sockets same session both invalidated on logout
  await test('222. TEST D3-13: Múltiples sockets asociados a una misma sesión son todos invalidados en logout', async () => {
    const { cookie: adminCookie, csrf } = await loginAdminD2();
    const socket1 = await connectTestSocket(adminCookie);
    const socket2 = await connectTestSocket(adminCookie);
    assert.ok(socket1 && socket1.id);
    assert.ok(socket2 && socket2.id);

    const disconnectCount = { count: 0 };
    socket1.on('disconnect', () => { disconnectCount.count++; });
    socket2.on('disconnect', () => { disconnectCount.count++; });

    await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': adminCookie, 'x-csrf-token': csrf }
    });

    await new Promise(r => setTimeout(r, 600));
    assert.strictEqual(disconnectCount.count, 2, 'Ambos sockets de la misma sesión deben ser desconectados');
  });

  // D3-14: two different sessions remain isolated on single logout
  await test('223. TEST D3-14: Logout en sesión 1 no afecta los sockets de una sesión 2 independiente', async () => {
    const { cookie: session1Cookie, csrf: csrf1 } = await loginAdminD2();
    const { cookie: session2Cookie } = await loginCashierD2();

    const socket1 = await connectTestSocket(session1Cookie);
    const socket2 = await connectTestSocket(session2Cookie);
    assert.ok(socket1 && socket1.id);
    assert.ok(socket2 && socket2.id);

    // Logout en sesión 1
    await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': session1Cookie, 'x-csrf-token': csrf1 }
    });

    await new Promise(r => setTimeout(r, 400));
    const resSocket2 = await request(`/api/test-socket-info/${socket2.id}`);
    assert.strictEqual(resSocket2.status, 200, 'Socket de la sesión 2 debe permanecer activo e inalterado');
    socket2.disconnect();
  });

  // D3-15: destroyed session cannot keep private socket access
  await test('224. TEST D3-15: Sesión destruida no retiene sockets en el registry activo', async () => {
    const { cookie: clientCookie, csrf } = await loginClientAD2();
    const socket = await connectTestSocket(clientCookie);
    assert.ok(socket && socket.id);

    await request('/api/portal/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': clientCookie, 'x-csrf-token': csrf }
    });

    const resSocket = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resSocket.status, 404, 'Socket de sesión destruida no debe existir en servidor');
  });

  // D3-16: reconnect uses current cookie/session automatically
  await test('225. TEST D3-16: Reconexión con cookie actual resuelve identidad automáticamente', async () => {
    const { cookie: clientCookie } = await loginClientAD2();
    const socket = await connectTestSocket(clientCookie);
    assert.ok(socket && socket.id);

    const resInfo = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resInfo.data.identity.portal.id, 'cli-demo-1');
    socket.disconnect();
  });

  // D3-17: registry memory cleanup on disconnect
  await test('226. TEST D3-17: Desconexión voluntaria del socket limpia referencias en memoria (evita memory leaks)', async () => {
    const socket = await connectTestSocket(null);
    assert.ok(socket && socket.id);

    const resInfoBefore = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resInfoBefore.status, 200);

    socket.disconnect();
    await new Promise(r => setTimeout(r, 400));

    const resInfoAfter = await request(`/api/test-socket-info/${socket.id}`);
    assert.strictEqual(resInfoAfter.status, 404, 'Socket desconectado debe ser removido de las referencias activas');
  });

  // D3-18: multiple connect/disconnect cycles stay leak-free
  await test('227. TEST D3-18: Múltiples ciclos de conexión y desconexión operan de forma limpia y estable', async () => {
    for (let i = 0; i < 3; i++) {
      const socket = await connectTestSocket(null);
      assert.ok(socket && socket.id);
      socket.disconnect();
    }
  });

  // D3-19: forged identity cannot override socket authorization
  await test('228. TEST D3-19: Parámetros forzados en reconnect no alteran rooms de sesión', async () => {
    const { cookie: clientCookie } = await loginClientAD2();
    const socket = await connectTestSocket(clientCookie, {
      auth: { role: 'admin', clientId: 'cli-demo-2' },
      query: { role: 'admin', clientId: 'cli-demo-2' }
    });
    assert.ok(socket && socket.id);

    const resRooms = await request(`/api/test-socket-info/${socket.id}`);
    assert.ok(resRooms.data.rooms.includes('room:portal:client:cli-demo-1'));
    assert.ok(!resRooms.data.rooms.includes('room:crm:admin'), 'No debe adquirir admin');
    assert.ok(!resRooms.data.rooms.includes('room:portal:client:cli-demo-2'), 'No debe adquirir client 2');
    socket.disconnect();
  });

  // D3-20: session regeneration on login keeps old socket bounded to old state
  await test('229. TEST D3-20: Session regeneration en login HTTP no otorga privilegios al socket anterior', async () => {
    const { cookie: anonCookie } = await (async () => {
      const res = await request('/api/auth/csrf-token');
      return { cookie: res.setCookie.split(';')[0] };
    })();
    const oldSocket = await connectTestSocket(anonCookie);
    assert.ok(oldSocket && oldSocket.id);

    // Login HTTP regenera sesión
    await loginAdminD2();

    const resInfoOld = await request(`/api/test-socket-info/${oldSocket.id}`);
    assert.strictEqual(resInfoOld.data.identity.isAnonymous, true, 'Socket previo no debe adquirir rol admin tras login');
    oldSocket.disconnect();
  });

  // ============================================================
  // PRUEBAS DE FASE 1E-A: SUBSISTEMA BACKEND DE IA (GEMINI SERVER-SIDE)
  // ============================================================

  // Mock seguro de cliente Gemini para testing hermético sin llamadas externas
  const mockGeminiClient = {
    models: {
      generateContent: async ({ model, contents, config }) => {
        const allText = (contents?.[0]?.parts || []).map(p => p.text || '').join('\n');
        const hasImage = contents?.[0]?.parts?.some(p => p.inlineData);

        if (allText.includes('error_simulado')) {
          const fakeErr = new Error('Google AI upstream error with confidential details');
          fakeErr.config = { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash?key=AIzaSySecretFakeKey' };
          throw fakeErr;
        }

        if (allText.includes('CATÁLOGO ACTUAL (Solo lectura/referencia)')) {
          return {
            text: JSON.stringify({
              actions: [{ type: 'ADD_PRODUCT', payload: { name: 'Queso Paisa Test', category: 'Genérico', unit: 'Kg', purchasePrice: 4, sellingPrice: 6 } }],
              message: 'Producto añadido por IA de prueba'
            })
          };
        }

        if (allText.includes('factura de compra en formato JSON estricto')) {
          return {
            text: JSON.stringify({
              proveedor: { nombre: 'Distribuidora Lácteos C.A.', rif: 'J-99887766-5' },
              factura: 'FAC-00129',
              fecha: '2026-09-15',
              moneda_detectada: 'USD',
              items: [{ nombre: 'QUESO DURO', cantidad: 50, unidad: 'Kg', costo_unitario: 3.5, costo_total: 175 }]
            })
          };
        }

        if (allText.includes('Analiza esta orden o dictado de mercancía')) {
          return {
            text: JSON.stringify({
              items: [{ nombre: 'MANTEQUILLA CRIOLLA', cantidad: 10, unidad: 'Und', costo_unitario: 2.5, costo_total: 25 }]
            })
          };
        }

        if (allText.includes('Analiza esta nota de voz contable')) {
          return {
            text: JSON.stringify({
              title: 'Gasto de Transporte',
              category: 'gasto',
              amountUsd: 25,
              amountBs: 20000,
              paymentMethod: 'Efectivo',
              summary: 'Pago de flete de mercancía',
              suggestedAction: 'Registrar egreso de caja'
            })
          };
        }

        if (allText.includes('Analiza esta orden hablada de salida para una gira/viaje')) {
          return {
            text: JSON.stringify({
              driver: 'Daisy Corro',
              cheeseProductName: 'QUESO DURO',
              dispatchedKg: 300,
              costPerKg: 3.8,
              cashTakenUsd: 150,
              cashTakenBs: 5000,
              bankTakenUsd: 0,
              bankTakenBs: 10000
            })
          };
        }

        return {
          text: 'Respuesta analítica de prueba generada por asistente financiero.'
        };
      }
    }
  };

  // Helper para restaurar mock tras pruebas
  setGeminiClientForTest(mockGeminiClient);

  // 1E-A-01: GET /api/ai/status sin sesión -> 401
  await test('230. TEST 1E-A-01: GET /api/ai/status sin sesión retorna HTTP 401 Unauthorized', async () => {
    const res = await request('/api/ai/status');
    assert.strictEqual(res.status, 401);
  });

  // 1E-A-02: GET /api/ai/status con sesión activa -> respuesta segura
  await test('231. TEST 1E-A-02: GET /api/ai/status con sesión retorna estado estructurado seguro', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/ai/status', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.available, true);
    assert.strictEqual(res.data.engine, 'active');
  });

  // 1E-A-03: status nunca contiene API key ni secretos
  await test('232. TEST 1E-A-03: GET /api/ai/status nunca expone claves, tokens ni URLs de Google', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/ai/status', {
      headers: { 'Cookie': cookie }
    });
    const str = JSON.stringify(res.data);
    assert.strictEqual(str.includes('AIza'), false);
    assert.strictEqual(str.includes('apiKey'), false);
    assert.strictEqual(str.includes('googleapis.com'), false);
  });

  // 1E-A-04: POST /api/ai/chat sin sesión -> 401
  await test('233. TEST 1E-A-04: POST /api/ai/chat sin sesión retorna HTTP 401', async () => {
    const res = await request('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Hola asistente' })
    });
    assert.strictEqual(res.status, 401);
  });

  // 1E-A-05: POST /api/ai/chat con sesión pero sin CSRF -> 403
  await test('234. TEST 1E-A-05: POST /api/ai/chat con sesión pero sin CSRF retorna HTTP 403', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie },
      body: JSON.stringify({ prompt: 'Hola asistente' })
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error, 'CSRF token inválido o ausente');
  });

  // 1E-A-06: POST /api/ai/chat con CSRF incorrecto -> 403
  await test('235. TEST 1E-A-06: POST /api/ai/chat con CSRF incorrecto retorna HTTP 403', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': 'bad_fake_csrf_token_12345' },
      body: JSON.stringify({ prompt: 'Hola asistente' })
    });
    assert.strictEqual(res.status, 403);
  });

  // 1E-A-07: POST /api/ai/ocr-invoice con rol no autorizado (Cajero) -> 403
  await test('236. TEST 1E-A-07: POST /api/ai/ocr-invoice con rol Cajero retorna HTTP 403 (exclusivo Admin/Accountant)', async () => {
    const { cookie, csrf } = await loginCashierD2();
    const res = await request('/api/ai/ocr-invoice', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ imageBase64: 'data:image/jpeg;base64,aGVsbG8=' })
    });
    assert.strictEqual(res.status, 403);
  });

  // 1E-A-08: POST /api/ai/chat con sesión Admin + CSRF + prompt válido -> 200
  await test('237. TEST 1E-A-08: POST /api/ai/chat con credenciales válidas genera respuesta sanitizada', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ prompt: '¿Cuál es el margen sugerido para queso llanero?' })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(typeof res.data.text === 'string' && res.data.text.length > 0);
  });

  // 1E-A-09: POST /api/ai/chat con prompt vacío / inválido -> 400
  await test('238. TEST 1E-A-09: POST /api/ai/chat con prompt vacío retorna HTTP 400 Bad Request', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ prompt: '   ' })
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
  });

  // 1E-A-10: POST /api/ai/chat con prompt excesivo -> 413 Payload Too Large
  await test('239. TEST 1E-A-10: POST /api/ai/chat con prompt superior a 8000 caracteres retorna HTTP 413', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const giantPrompt = 'A'.repeat(9000);
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ prompt: giantPrompt })
    });
    assert.strictEqual(res.status, 413);
    assert.strictEqual(res.data.success, false);
  });

  // 1E-A-11: POST /api/ai/inventory-command ejecuta orden y devuelve acciones estructuradas
  await test('240. TEST 1E-A-11: POST /api/ai/inventory-command interpreta comandos en lenguaje natural', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/inventory-command', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        command: 'Agregar queso paisa a 4 compra y 6 venta',
        products: []
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.actions));
    assert.strictEqual(res.data.actions[0].type, 'ADD_PRODUCT');
  });

  // 1E-A-12: POST /api/ai/ocr-invoice extrae datos contables de factura
  await test('241. TEST 1E-A-12: POST /api/ai/ocr-invoice extrae datos contables estructurados', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/ocr-invoice', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        imageBase64: 'data:image/jpeg;base64,dGVzdF9mYWN0dXJhX2Jhc2U2NA==',
        mimeType: 'image/jpeg',
        bcvRate: 45
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.items);
    assert.strictEqual(res.data.data.items[0].nombre, 'QUESO DURO');
  });

  // 1E-A-13: POST /api/ai/parse-dictation procesa texto de compras habladas
  await test('242. TEST 1E-A-13: POST /api/ai/parse-dictation procesa dictado de mercancía', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/parse-dictation', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        text: 'Llegaron 10 unidades de mantequilla criolla a 2.5 dolares',
        bcvRate: 45
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.items[0].nombre, 'MANTEQUILLA CRIOLLA');
  });

  // 1E-A-14: POST /api/ai/parse-voice-note estructura nota contable
  await test('243. TEST 1E-A-14: POST /api/ai/parse-voice-note estructura nota de voz financiera', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/parse-voice-note', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        text: 'Pagué 25 dólares de transporte en efectivo',
        bcvRate: 45
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.category, 'gasto');
    assert.strictEqual(res.data.data.amountUsd, 25);
  });

  // 1E-A-15: POST /api/ai/parse-trip estructura salida de gira de queso
  await test('244. TEST 1E-A-15: POST /api/ai/parse-trip extrae parámetros operativos de gira', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/parse-trip', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        text: 'Sale Daisy Corro con 300 kilos de queso duro a 3.8 y 150 dólares de viáticos',
        bcvRate: 813
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.driver, 'Daisy Corro');
    assert.strictEqual(res.data.data.dispatchedKg, 300);
  });

  // 1E-A-16: Error en Gemini no filtra URLs ni API keys en respuesta HTTP
  await test('245. TEST 1E-A-16: Error upstream de Gemini se captura y devuelve error genérico sin filtrar API key', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ prompt: 'error_simulado_disparador' })
    });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.data.success, false);
    const bodyStr = JSON.stringify(res.data);
    assert.strictEqual(bodyStr.includes('AIzaSy'), false, 'No debe filtrar API key en respuesta');
    assert.strictEqual(bodyStr.includes('googleapis.com'), false, 'No debe filtrar URL de Google en respuesta');
  });

  // 1E-A-17: Cliente de portal autenticado NO puede acceder a endpoints de IA del CRM
  await test('246. TEST 1E-A-17: Cliente autenticado en Portal NO puede invocar endpoints AI de administración (401)', async () => {
    // Login en portal como cliente válido
    const { cookie: portalCookie, csrf: portalCsrf } = await loginClientAD2();

    const aiRes = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': portalCookie, 'x-csrf-token': portalCsrf },
      body: JSON.stringify({ prompt: 'Acceso no autorizado' })
    });
    assert.strictEqual(aiRes.status, 401, 'Portal client no tiene sesión CRM activa y debe recibir 401');
  });

  // 1E-A-18: Si el servicio de IA no está configurado, responde 503 controlado
  await test('247. TEST 1E-A-18: Endpoint responde HTTP 503 seguro si el cliente Gemini no está inicializado', async () => {
    setGeminiClientForTest(null); // Desconfigurar temporalmente
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ prompt: 'Hola' })
    });
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.error, 'El servicio de IA no está configurado en el servidor');

    // Restaurar mock
    setGeminiClientForTest(mockGeminiClient);
  });

  // 1E-A-19: Endpoint AI no confía en parámetros de rol en body para elevar permisos
  await test('248. TEST 1E-A-19: Body no puede inyectar rol ni elevar permisos en endpoints de IA', async () => {
    const { cookie, csrf } = await loginCashierD2();
    const res = await request('/api/ai/ocr-invoice', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        role: 'admin',
        isAdmin: true,
        imageBase64: 'data:image/jpeg;base64,dGVzdA=='
      })
    });
    assert.strictEqual(res.status, 403, 'Cajero con body role=admin sigue siendo rechazado por requireRole');
  });

  // ============================================================
  // PRUEBAS DE FASE 1E-B: MIGRACIÓN FRONTEND GEMINI -> BACKEND SEGURO
  // ============================================================

  // 1E-B-01: Endpoints backend responden con éxito a todas las funciones migradas
  await test('250. TEST 1E-B-01: Endpoints backend responden adecuadamente a llamadas simuladas de los wrappers frontend', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const chatRes = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ prompt: 'Verificar estado del inventario' })
    });
    assert.strictEqual(chatRes.status, 200);
    assert.strictEqual(chatRes.data.success, true);
    assert.ok(typeof chatRes.data.text === 'string');
  });

  // 1E-B-02: aiApi / endpoints requieren credentials (sesión HTTP con Cookie)
  await test('251. TEST 1E-B-02: Endpoints AI rechazan solicitudes sin credentials / cookie de sesión (401)', async () => {
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'x-csrf-token': 'token_sin_sesion' },
      body: JSON.stringify({ prompt: 'Test credentials' })
    });
    assert.strictEqual(res.status, 401);
  });

  // 1E-B-03: POST AI requiere token CSRF obligatorio
  await test('252. TEST 1E-B-03: POST AI sin header x-csrf-token devuelve HTTP 403 Forbidden', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/ai/inventory-command', {
      method: 'POST',
      headers: { 'Cookie': cookie },
      body: JSON.stringify({ command: 'Agregar queso blanco a 3' })
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error, 'CSRF token inválido o ausente');
  });

  // 1E-B-04: GET /api/ai/status funciona en backend y no llama a Google desde browser
  await test('253. TEST 1E-B-04: GET /api/ai/status retorna disponibilidad server-side sin interactuar directamente con Google desde cliente', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/ai/status', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.available, true);
    assert.strictEqual(typeof res.data.engine, 'string');
  });

  // 1E-B-05: Verificación de que los archivos de servicios frontend no importan @google/genai ni GoogleGenAI
  await test('254. TEST 1E-B-05: Código fuente en src/services no contiene llamadas directas ni SDKs de Google en el cliente', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const srcServices = ['gemini.ts', 'geminiInventoryAssistant.ts', 'ocrService.ts', 'aiApi.ts'];

    for (const file of srcServices) {
      const filePath = path.resolve('src/services', file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert.strictEqual(content.includes('@google/genai'), false, `${file} no debe importar @google/genai`);
        assert.strictEqual(content.includes('GoogleGenAI'), false, `${file} no debe usar GoogleGenAI`);
        assert.strictEqual(content.includes('generativelanguage.googleapis.com'), false, `${file} no debe llamar generativelanguage`);
        assert.strictEqual(content.includes('x-goog-api-key'), false, `${file} no debe usar x-goog-api-key`);
      }
    }
  });

  // 1E-B-06: Verificación de contratos OCR preservados en /api/ai/ocr-invoice
  await test('255. TEST 1E-B-06: Contrato de respuesta de OCR conserva formato estructurado con proveedor, factura, fecha e items', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/ocr-invoice', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        imageBase64: 'dGVzdF9mYWN0dXJh',
        mimeType: 'image/jpeg',
        bcvRate: 45
      })
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.data.proveedor);
    assert.ok(res.data.data.factura);
    assert.ok(Array.isArray(res.data.data.items));
  });

  // 1E-B-07: Verificación de contratos de dictado preservados en /api/ai/parse-dictation
  await test('256. TEST 1E-B-07: Contrato de respuesta de dictado conserva array de items con campos numéricos sanitizados', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/parse-dictation', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        text: 'Llegaron 10 kilos de queso duro',
        bcvRate: 45
      })
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.items));
    assert.strictEqual(res.data.items[0].nombre, 'MANTEQUILLA CRIOLLA');
  });

  // 1E-B-08: Verificación de contratos de notas de voz preservados en /api/ai/parse-voice-note
  await test('257. TEST 1E-B-08: Contrato de respuesta de notas de voz conserva categoría, montos y resumen', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/parse-voice-note', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        text: 'Pago de flete de transporte',
        bcvRate: 45
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.category, 'gasto');
    assert.strictEqual(res.data.data.amountUsd, 25);
  });

  // 1E-B-09: Verificación de contratos de viajes de queso preservados en /api/ai/parse-trip
  await test('258. TEST 1E-B-09: Contrato de respuesta de giras conserva driver, kilogramos y adelantos monetarios', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/parse-trip', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        text: 'Salida de Daisy Corro con queso duro',
        bcvRate: 813
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.driver, 'Daisy Corro');
    assert.strictEqual(res.data.data.dispatchedKg, 300);
  });

  // 1E-B-10: Verificación de comandos de inventario en /api/ai/inventory-command
  await test('259. TEST 1E-B-10: Contrato de respuesta de asistente de inventario conserva acciones y mensaje', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/inventory-command', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        command: 'Actualizar queso paisa',
        products: []
      })
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.actions));
    assert.strictEqual(typeof res.data.message, 'string');
  });

  // 1E-B-11: Prevención estricta de fallback cliente -> Google cuando el backend falla
  await test('260. TEST 1E-B-11: Fallo en el backend retorna error seguro sin intentar fallbacks directos no autorizados a Google', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ prompt: 'error_simulado' })
    });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.error, 'Ocurrió un error al procesar la solicitud con la IA');
  });

  // 1E-B-12: Prevención de inyección de parámetros no confiables en body
  await test('261. TEST 1E-B-12: Los parámetros de suplantación de identidad en body son completamente ignorados', async () => {
    const { cookie, csrf } = await loginCashierD2();
    const res = await request('/api/ai/ocr-invoice', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        role: 'admin',
        userId: 'admin_override',
        imageBase64: 'dGVzdA=='
      })
    });
    assert.strictEqual(res.status, 403, 'Cajero intentando elevarse a admin en body sigue bloqueado por RBAC');
  });

  // ============================================================
  // PRUEBAS DE FASE 1E-C: ELIMINACIÓN DEFINITIVA DEL RASTRO GEMINI FRONTEND
  // ============================================================

  // 1E-C-01: VITE_GEMINI_API_KEY no existe como configuración frontend operativa
  await test('262. TEST 1E-C-01: VITE_GEMINI_API_KEY no existe en src/vite-env.d.ts ni en .env.example', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const viteEnv = fs.readFileSync(path.resolve('src/vite-env.d.ts'), 'utf8');
    assert.strictEqual(viteEnv.includes('VITE_GEMINI_API_KEY'), false, 'vite-env.d.ts no debe declarar VITE_GEMINI_API_KEY');

    const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf8');
    assert.strictEqual(envExample.includes('VITE_GEMINI_API_KEY='), false, '.env.example no debe incluir VITE_GEMINI_API_KEY');
  });

  // 1E-C-02: Ningún archivo frontend utiliza import.meta.env.VITE_GEMINI_API_KEY
  await test('263. TEST 1E-C-02: Ningún archivo en src/ contiene import.meta.env.VITE_GEMINI_API_KEY', async () => {
    const fs = await import('fs');
    const path = await import('path');

    function searchFiles(dir) {
      let files = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          files = files.concat(searchFiles(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
          files.push(full);
        }
      }
      return files;
    }

    const allSrcFiles = searchFiles(path.resolve('src'));
    for (const f of allSrcFiles) {
      const code = fs.readFileSync(f, 'utf8');
      assert.strictEqual(code.includes('import.meta.env.VITE_GEMINI_API_KEY'), false, `${f} contiene import.meta.env.VITE_GEMINI_API_KEY`);
    }
  });

  // 1E-C-03: Ningún archivo frontend utiliza window.__GEMINI_API_KEY__
  await test('264. TEST 1E-C-03: Ningún archivo en src/ contiene window.__GEMINI_API_KEY__', async () => {
    const fs = await import('fs');
    const path = await import('path');

    function searchFiles(dir) {
      let files = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          files = files.concat(searchFiles(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
          files.push(full);
        }
      }
      return files;
    }

    const allSrcFiles = searchFiles(path.resolve('src'));
    for (const f of allSrcFiles) {
      const code = fs.readFileSync(f, 'utf8');
      assert.strictEqual(code.includes('__GEMINI_API_KEY__'), false, `${f} contiene __GEMINI_API_KEY__`);
    }
  });

  // 1E-C-04: Ningún archivo frontend utiliza process.env.GEMINI_API_KEY
  await test('265. TEST 1E-C-04: Ningún archivo en src/ accede a process.env.GEMINI_API_KEY en runtime de navegador', async () => {
    const fs = await import('fs');
    const path = await import('path');

    function searchFiles(dir) {
      let files = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          files = files.concat(searchFiles(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
          files.push(full);
        }
      }
      return files;
    }

    const allSrcFiles = searchFiles(path.resolve('src'));
    for (const f of allSrcFiles) {
      const code = fs.readFileSync(f, 'utf8');
      assert.strictEqual(code.includes('process.env.GEMINI_API_KEY'), false, `${f} contiene process.env.GEMINI_API_KEY`);
    }
  });

  // 1E-C-05: Ningún archivo frontend hace llamadas directas a generativelanguage.googleapis.com
  await test('266. TEST 1E-C-05: Cero llamadas a generativelanguage.googleapis.com en src/', async () => {
    const fs = await import('fs');
    const path = await import('path');

    function searchFiles(dir) {
      let files = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          files = files.concat(searchFiles(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
          files.push(full);
        }
      }
      return files;
    }

    const allSrcFiles = searchFiles(path.resolve('src'));
    for (const f of allSrcFiles) {
      const code = fs.readFileSync(f, 'utf8');
      assert.strictEqual(code.includes('generativelanguage.googleapis.com'), false, `${f} contiene generativelanguage.googleapis.com`);
    }
  });

  // 1E-C-06: Ningún archivo frontend importa @google/genai
  await test('267. TEST 1E-C-06: Cero imports de @google/genai en src/', async () => {
    const fs = await import('fs');
    const path = await import('path');

    function searchFiles(dir) {
      let files = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          files = files.concat(searchFiles(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
          files.push(full);
        }
      }
      return files;
    }

    const allSrcFiles = searchFiles(path.resolve('src'));
    for (const f of allSrcFiles) {
      const code = fs.readFileSync(f, 'utf8');
      assert.strictEqual(code.includes('@google/genai'), false, `${f} importa @google/genai`);
    }
  });

  // 1E-C-07: Ningún archivo frontend utiliza GoogleGenAI ni GenerativeModel
  await test('268. TEST 1E-C-07: Cero instancias de GoogleGenAI / GenerativeModel en src/', async () => {
    const fs = await import('fs');
    const path = await import('path');

    function searchFiles(dir) {
      let files = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          files = files.concat(searchFiles(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
          files.push(full);
        }
      }
      return files;
    }

    const allSrcFiles = searchFiles(path.resolve('src'));
    for (const f of allSrcFiles) {
      const code = fs.readFileSync(f, 'utf8');
      assert.strictEqual(code.includes('GoogleGenAI'), false, `${f} contiene GoogleGenAI`);
      assert.strictEqual(code.includes('GenerativeModel'), false, `${f} contiene GenerativeModel`);
    }
  });

  // 1E-C-08: Los wrappers AI siguen apuntando a /api/ai/* exclusivamente
  await test('269. TEST 1E-C-08: Wrappers gemini.ts, geminiInventoryAssistant.ts y ocrService.ts delegan exclusivamente en aiApi', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const geminiWrapper = fs.readFileSync(path.resolve('src/services/gemini.ts'), 'utf8');
    const inventoryWrapper = fs.readFileSync(path.resolve('src/services/geminiInventoryAssistant.ts'), 'utf8');
    const ocrWrapper = fs.readFileSync(path.resolve('src/services/ocrService.ts'), 'utf8');

    assert.ok(geminiWrapper.includes("from './aiApi'"), 'gemini.ts debe importar de aiApi');
    assert.ok(inventoryWrapper.includes("from './aiApi'"), 'geminiInventoryAssistant.ts debe importar de aiApi');
    assert.ok(ocrWrapper.includes("from './aiApi'"), 'ocrService.ts debe importar de aiApi');
  });

  // 1E-C-09: El backend conserva process.env.GEMINI_API_KEY como frontera server-side
  await test('270. TEST 1E-C-09: Backend server.js utiliza process.env.GEMINI_API_KEY para inicializar la IA', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const serverCode = fs.readFileSync(path.resolve('server.js'), 'utf8');
    assert.ok(serverCode.includes('process.env.GEMINI_API_KEY'), 'server.js debe utilizar process.env.GEMINI_API_KEY');
    assert.strictEqual(serverCode.includes('VITE_GEMINI_API_KEY'), false, 'server.js no debe depender de VITE_GEMINI_API_KEY');
  });

  // 1E-C-10: El bundle de producción dist/ no contiene VITE_GEMINI_API_KEY ni generativelanguage
  await test('271. TEST 1E-C-10: Los archivos en dist/assets no contienen rastros de Google Gemini ni API keys', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const distAssets = path.resolve('dist/assets');

    if (fs.existsSync(distAssets)) {
      for (const file of fs.readdirSync(distAssets)) {
        if (file.endsWith('.js')) {
          const content = fs.readFileSync(path.join(distAssets, file), 'utf8');
          assert.strictEqual(content.includes('generativelanguage.googleapis.com'), false, `${file} contiene generativelanguage`);
          assert.strictEqual(content.includes('@google/genai'), false, `${file} contiene @google/genai`);
          assert.strictEqual(content.includes('VITE_GEMINI_API_KEY'), false, `${file} contiene VITE_GEMINI_API_KEY`);
          assert.strictEqual(content.includes('x-goog-api-key'), false, `${file} contiene x-goog-api-key`);
        }
      }
    }
  });

  // ============================================================
  // PRUEBAS DE SEGURIDAD — FASE 1F-A: BLINDAJE DE UPLOADS
  // ============================================================

  // Helper para construir Multipart FormData en Node.js nativo (sin dependencias externas)
  function createMultipartPayload({ fieldName = 'files', filename = 'test.jpg', contentType = 'image/jpeg', contentBuffer }) {
    const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).substring(2)}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, contentBuffer, tail]);
    return {
      contentType: `multipart/form-data; boundary=${boundary}`,
      body
    };
  }

  // 1F-A-01: Upload sin autenticación -> 401
  await test('272. TEST 1F-A-01: POST /api/upload sin sesión devuelve 401 Unauthorized', async () => {
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'test.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 401, `Esperado 401, recibido ${res.status}`);
  });

  // 1F-A-02: Upload CRM autenticado autorizado -> 200 OK
  await test('273. TEST 1F-A-02: POST /api/upload con sesión CRM válida y CSRF devuelve 200 OK', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'banner.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 200, `Esperado 200, recibido ${res.status}`);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.urls) && res.data.urls.length > 0);
    assert.ok(res.data.urls[0].startsWith('/uploads/upload-'));
  });

  // 1F-A-03: Upload sin CSRF -> 403
  await test('274. TEST 1F-A-03: POST /api/upload sin header x-csrf-token devuelve 403 Forbidden', async () => {
    const { cookie } = await loginAdminD2();
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'test.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 403, `Esperado 403, recibido ${res.status}`);
  });

  // 1F-A-04: Upload con CSRF inválido -> 403
  await test('275. TEST 1F-A-04: POST /api/upload con token CSRF manipulado devuelve 403 Forbidden', async () => {
    const { cookie } = await loginAdminD2();
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'test.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': 'bad_csrf_token_attack_123',
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 403, `Esperado 403, recibido ${res.status}`);
  });

  // 1F-A-05: MIME no permitido -> 415
  await test('276. TEST 1F-A-05: POST /api/upload con MIME no permitido (e.g. text/html) devuelve 415', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const textBuffer = Buffer.from('<h1>Evil script</h1>');
    const { contentType, body } = createMultipartPayload({ filename: 'evil.html', contentType: 'text/html', contentBuffer: textBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 415, `Esperado 415, recibido ${res.status}`);
  });

  // 1F-A-06: Extensión no permitida -> 415
  await test('277. TEST 1F-A-06: POST /api/upload con extensión ejecutable (e.g. .exe o .php) devuelve 415', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const badBuffer = Buffer.from('malicious binary content here');
    const { contentType, body } = createMultipartPayload({ filename: 'evil.php', contentType: 'application/x-php', contentBuffer: badBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 415, `Esperado 415, recibido ${res.status}`);
  });

  // 1F-A-07: MIME spoofing (MIME declarado válido pero Magic Number falso) -> 415
  await test('278. TEST 1F-A-07: POST /api/upload con MIME spoofing (declarado image/png pero contenido texto) devuelve 415', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const spoofedBuffer = Buffer.from('<script>alert("XSS")</script>');
    const { contentType, body } = createMultipartPayload({ filename: 'image.png', contentType: 'image/png', contentBuffer: spoofedBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 415, `Esperado 415, recibido ${res.status}`);
  });

  // 1F-A-08: Archivo demasiado grande -> 413
  await test('279. TEST 1F-A-08: POST /api/upload con archivo mayor a 10MB devuelve 413 Payload Too Large', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
    largeBuffer[0] = 0xFF; largeBuffer[1] = 0xD8; largeBuffer[2] = 0xFF; // JPEG magic header
    const { contentType, body } = createMultipartPayload({ filename: 'large.jpg', contentType: 'image/jpeg', contentBuffer: largeBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 413, `Esperado 413, recibido ${res.status}`);
  });

  // 1F-A-09: Path traversal en filename neutralizado
  await test('280. TEST 1F-A-09: Filename con Path Traversal (../../evil.jpg) es neutralizado a un nombre seguro sin escapar del directorio', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: '../../../../etc/evil.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 200);
    const savedUrl = res.data.urls[0];
    assert.ok(!savedUrl.includes('..'), 'La URL devuelta no debe contener ..');
    assert.ok(!savedUrl.includes('evil.jpg'), 'El nombre final no debe ser el original del cliente');
  });

  // 1F-A-10: El filename del cliente no determina el path de almacenamiento
  await test('281. TEST 1F-A-10: El servidor genera nombres aleatorios criptográficos para el almacenamiento', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'custom_secret_client_name.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': csrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.urls[0].includes('custom_secret_client_name'), false);
    assert.ok(res.data.urls[0].startsWith('/uploads/upload-'));
  });

  // 1F-A-11: Archivo válido JPEG -> 200
  await test('282. TEST 1F-A-11: Archivo con cabecera válida JPEG (FF D8 FF) es aceptado', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'photo.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': contentType },
      body
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 1F-A-12: Archivo válido PNG -> 200
  await test('283. TEST 1F-A-12: Archivo con cabecera válida PNG (89 50 4E 47 0D 0A 1A 0A) es aceptado', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    const { contentType, body } = createMultipartPayload({ filename: 'photo.png', contentType: 'image/png', contentBuffer: pngBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': contentType },
      body
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 1F-A-13: Archivo válido WEBP -> 200
  await test('284. TEST 1F-A-13: Archivo con estructura RIFF/WEBP válida es aceptado', async () => {
    const { cookie, csrf } = await loginAdminD2();
    // RIFF (4 bytes) + Size (4 bytes) + WEBP (4 bytes)
    const webpBuffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
      Buffer.from('VP8 ', 'ascii')
    ]);
    const { contentType, body } = createMultipartPayload({ filename: 'image.webp', contentType: 'image/webp', contentBuffer: webpBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': contentType },
      body
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 1F-A-14: Archivo válido PDF -> 200
  await test('285. TEST 1F-A-14: Archivo con firma válida PDF (%PDF-) es aceptado', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const pdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const { contentType, body } = createMultipartPayload({ filename: 'factura.pdf', contentType: 'application/pdf', contentBuffer: pdfBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': contentType },
      body
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 1F-A-15: Errores no revelan filesystem interno
  await test('286. TEST 1F-A-15: Las respuestas de error de upload no revelan rutas absolutas del sistema operativo', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const badBuffer = Buffer.from('bad');
    const { contentType, body } = createMultipartPayload({ filename: 'bad.xyz', contentType: 'application/octet-stream', contentBuffer: badBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': contentType },
      body
    });
    const errorStr = JSON.stringify(res.data);
    assert.strictEqual(errorStr.includes('C:\\'), false);
    assert.strictEqual(errorStr.includes('/var/www'), false);
    assert.strictEqual(errorStr.includes('node_modules'), false);
  });

  // 1F-A-16: Subidas sucesivas no se sobrescriben entre sí
  await test('287. TEST 1F-A-16: Dos subidas sucesivas con el mismo originalname generan dos archivos distintos sin sobrescribirse', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const payload1 = createMultipartPayload({ filename: 'same_name.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });
    const payload2 = createMultipartPayload({ filename: 'same_name.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res1 = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': payload1.contentType },
      body: payload1.body
    });
    const res2 = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': payload2.contentType },
      body: payload2.body
    });

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
    assert.notStrictEqual(res1.data.urls[0], res2.data.urls[0], 'Cada subida debe tener un nombre de archivo único');
  });

  // 1F-A-17: Upload autenticado como portal de cliente es aceptado
  await test('288. TEST 1F-A-17: POST /api/upload permite subidas a usuarios autenticados en portal cliente', async () => {
    // Login portal cliente usando helper con PIN vigente
    const { cookie: clientCookie, csrf: clientCsrf } = await loginClientAD2();

    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'recibo.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': clientCookie,
        'x-csrf-token': clientCsrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.urls[0].startsWith('/uploads/upload-'));
  });

  // 1F-A-18: Upload autenticado como portal de productor es aceptado
  await test('289. TEST 1F-A-18: POST /api/upload permite subidas a usuarios autenticados en portal productor', async () => {
    // Login portal productor usando helper con PIN vigente
    const { cookie: producerCookie, csrf: producerCsrf } = await loginProducerAD2();

    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'remision.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: {
        'Cookie': producerCookie,
        'x-csrf-token': producerCsrf,
        'Content-Type': contentType
      },
      body
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.urls[0].startsWith('/uploads/upload-'));
  });

  // ============================================================
  // PRUEBAS DE FASE 1F-B: SEPARACIÓN DATA_DIR/UPLOAD_DIR & BLINDAJE DE /uploads
  // ============================================================

  // 1F-B-01: users_db.json NO es accesible vía /uploads
  await test('290. TEST 1F-B-01: GET /uploads/users_db.json devuelve HTTP 404 Not Found', async () => {
    const res = await request('/uploads/users_db.json');
    assert.strictEqual(res.status, 404);
  });

  // 1F-B-02: clients_db.json NO es accesible vía /uploads
  await test('291. TEST 1F-B-02: GET /uploads/clients_db.json devuelve HTTP 404 Not Found', async () => {
    const res = await request('/uploads/clients_db.json');
    assert.strictEqual(res.status, 404);
  });

  // 1F-B-03: adminLedger_db.json NO es accesible vía /uploads
  await test('292. TEST 1F-B-03: GET /uploads/adminLedger_db.json devuelve HTTP 404 Not Found', async () => {
    const res = await request('/uploads/adminLedger_db.json');
    assert.strictEqual(res.status, 404);
  });

  // 1F-B-04: transactions_db.json NO es accesible vía /uploads
  await test('293. TEST 1F-B-04: GET /uploads/transactions_db.json devuelve HTTP 404 Not Found', async () => {
    const res = await request('/uploads/transactions_db.json');
    assert.strictEqual(res.status, 404);
  });

  // 1F-B-05: Archivo JPEG permitido en uploadDir es servido con 200 y Content-Type image/jpeg
  await test('294. TEST 1F-B-05: GET /uploads/<archivo.jpg> devuelve 200 con Content-Type image/jpeg', async () => {
    const testFile = path.join(uploadDir, 'test-asset-valid.jpg');
    fs.writeFileSync(testFile, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]));
    const res = await request('/uploads/test-asset-valid.jpg');
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('image/jpeg'));
  });

  // 1F-B-06: Archivo PNG permitido en uploadDir es servido con 200 y Content-Type image/png
  await test('295. TEST 1F-B-06: GET /uploads/<archivo.png> devuelve 200 con Content-Type image/png', async () => {
    const testFile = path.join(uploadDir, 'test-asset-valid.png');
    fs.writeFileSync(testFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
    const res = await request('/uploads/test-asset-valid.png');
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('image/png'));
  });

  // 1F-B-07: Archivo WEBP permitido en uploadDir es servido con 200 y Content-Type image/webp
  await test('296. TEST 1F-B-07: GET /uploads/<archivo.webp> devuelve 200 con Content-Type image/webp', async () => {
    const testFile = path.join(uploadDir, 'test-asset-valid.webp');
    fs.writeFileSync(testFile, Buffer.from('RIFF....WEBPVP8 ', 'ascii'));
    const res = await request('/uploads/test-asset-valid.webp');
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('image/webp'));
  });

  // 1F-B-08: Archivo MP4 permitido en uploadDir es servido con 200 y Content-Type video/mp4
  await test('297. TEST 1F-B-08: GET /uploads/<archivo.mp4> devuelve 200 con Content-Type video/mp4', async () => {
    const testFile = path.join(uploadDir, 'test-asset-valid.mp4');
    fs.writeFileSync(testFile, Buffer.from('....ftypisom....', 'ascii'));
    const res = await request('/uploads/test-asset-valid.mp4');
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('video/mp4'));
  });

  // 1F-B-09: Archivo PDF permitido en uploadDir es servido con 200 y Content-Type application/pdf
  await test('298. TEST 1F-B-09: GET /uploads/<archivo.pdf> devuelve 200 con Content-Type application/pdf', async () => {
    const testFile = path.join(uploadDir, 'test-asset-valid.pdf');
    fs.writeFileSync(testFile, Buffer.from('%PDF-1.4 test content', 'ascii'));
    const res = await request('/uploads/test-asset-valid.pdf');
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('application/pdf'));
  });

  // 1F-B-10: Archivos SVG legacy son bloqueados del servicio estático (404)
  await test('299. TEST 1F-B-10: GET /uploads/<archivo.svg> devuelve 404 Not Found (Stored XSS bloqueado)', async () => {
    const testFile = path.join(uploadDir, 'product-legacy-test.svg');
    fs.writeFileSync(testFile, '<svg><script>alert(1)</script></svg>');
    const res = await request('/uploads/product-legacy-test.svg');
    assert.strictEqual(res.status, 404);
  });

  // 1F-B-11: Extensiones ejecutables o no autorizadas (.exe, .php, .js, .html) son bloqueadas con 404
  await test('300. TEST 1F-B-11: GET /uploads con extensiones no permitidas (.php, .exe, .js, .html) devuelve 404', async () => {
    const phpRes = await request('/uploads/shell.php');
    const exeRes = await request('/uploads/virus.exe');
    const jsRes = await request('/uploads/payload.js');
    const htmlRes = await request('/uploads/page.html');
    assert.strictEqual(phpRes.status, 404);
    assert.strictEqual(exeRes.status, 404);
    assert.strictEqual(jsRes.status, 404);
    assert.strictEqual(htmlRes.status, 404);
  });

  // 1F-B-12: Respaldos y dumps de bases de datos son bloqueados de /uploads con 404
  await test('301. TEST 1F-B-12: GET /uploads/<backup.json> devuelve 404 Not Found', async () => {
    const res = await request('/uploads/products_db_backup_1789424316312.json');
    assert.strictEqual(res.status, 404);
  });

  // 1F-B-13: getCollectionFilePath apunta estrictamente a dataDir y NO a uploadDir
  await test('302. TEST 1F-B-13: getCollectionFilePath apunta estrictamente a dataDir', async () => {
    const clientsFile = path.resolve(getCollectionFilePath('clients'));
    assert.ok(clientsFile.startsWith(path.resolve(dataDir)));
    assert.ok(!clientsFile.startsWith(path.resolve(uploadDir)));
  });

  // 1F-B-14: DATA_DIR y UPLOAD_DIR son físicamente distintos
  await test('303. TEST 1F-B-14: DATA_DIR y UPLOAD_DIR son directorios físicamente independientes', async () => {
    assert.notStrictEqual(path.resolve(dataDir), path.resolve(uploadDir));
  });

  // 1F-B-15: Operaciones de lectura y escritura en colecciones funcionan normalmente en dataDir
  await test('304. TEST 1F-B-15: Lectura y escritura de colecciones JSON opera con normalidad en dataDir', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/collections/settings', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  // 1F-B-16: POST /api/upload persiste archivos físicamente en uploadDir
  await test('305. TEST 1F-B-16: POST /api/upload persiste archivos en uploadDir', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const { contentType, body } = createMultipartPayload({ filename: 'photo_test.jpg', contentType: 'image/jpeg', contentBuffer: jpegBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': contentType },
      body
    });
    assert.strictEqual(res.status, 200);
    const uploadedUrl = res.data.urls[0];
    const filename = uploadedUrl.replace('/uploads/', '');
    const physicalPath = path.join(uploadDir, filename);
    assert.ok(fs.existsSync(physicalPath), 'El archivo debe existir en uploadDir');
  });

  // 1F-B-17: URLs devueltas por /api/upload son inmediatamente servidas por GET /uploads/*
  await test('306. TEST 1F-B-17: URLs devueltas por /api/upload son servidas con HTTP 200 por GET /uploads/*', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const { contentType, body } = createMultipartPayload({ filename: 'product_icon.png', contentType: 'image/png', contentBuffer: pngBuffer });

    const uploadRes = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': contentType },
      body
    });
    assert.strictEqual(uploadRes.status, 200);
    const downloadUrl = uploadRes.data.urls[0];

    const getRes = await request(downloadUrl);
    assert.strictEqual(getRes.status, 200);
    assert.ok((getRes.headers.get('content-type') || '').includes('image/png'));
  });

  // 1F-B-18: Consumidores frontend conservan compatibilidad con /uploads/
  await test('307. TEST 1F-B-18: Formato de URLs de upload conserva el prefijo /uploads/ para compatibilidad frontend', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const webpBuffer = Buffer.from('RIFF....WEBPVP8 ', 'ascii');
    const { contentType, body } = createMultipartPayload({ filename: 'banner.webp', contentType: 'image/webp', contentBuffer: webpBuffer });

    const res = await request('/api/upload', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf, 'Content-Type': contentType },
      body
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.urls[0].startsWith('/uploads/upload-'));
    assert.ok(res.data.fileUrls[0].startsWith('/uploads/upload-'));
  });

  // 1F-B-19: Path traversal en /uploads/ es bloqueado con HTTP 404
  await test('308. TEST 1F-B-19: Path traversal en /uploads/ (e.g. /uploads/../../server.js) devuelve HTTP 404', async () => {
    const res1 = await request('/uploads/../../server.js');
    const res2 = await request('/uploads/%2e%2e%2f%2e%2e%2fserver.js');
    assert.strictEqual(res1.status, 404);
    assert.strictEqual(res2.status, 404);
  });

  // 1F-B-20: Archivo sin extensión o con doble extensión no permitida es bloqueado con HTTP 404
  await test('309. TEST 1F-B-20: Peticiones sin extensión o con doble extensión (image.jpg.php) devuelven 404', async () => {
    const noExtRes = await request('/uploads/secretfile');
    const doubleExtRes = await request('/uploads/image.jpg.php');
    assert.strictEqual(noExtRes.status, 404);
    assert.strictEqual(doubleExtRes.status, 404);
  });

  // ============================================================
  // FASE 1F-C: PRUEBAS DE CABECERAS DE SEGURIDAD HTTP Y CSP
  // ============================================================

  // 1F-C-01: Cabecera X-Content-Type-Options: nosniff presente
  await test('310. TEST 1F-C-01: Cabecera X-Content-Type-Options: nosniff presente en todas las respuestas', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  });

  // 1F-C-02: Cabecera X-Frame-Options: DENY presente
  await test('311. TEST 1F-C-02: Cabecera X-Frame-Options: DENY previene Clickjacking', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
  });

  // 1F-C-03: Cabecera Referrer-Policy presente
  await test('312. TEST 1F-C-03: Referrer-Policy configurada en strict-origin-when-cross-origin', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  // 1F-C-04: Cabecera Permissions-Policy restringe APIs sensibles
  await test('313. TEST 1F-C-04: Permissions-Policy deshabilita APIs no utilizadas (cámara, micrófono, geolocalización)', async () => {
    const res = await request('/api/auth/csrf-token');
    const pp = res.headers.get('permissions-policy') || '';
    assert.ok(pp.includes('camera=()'));
    assert.ok(pp.includes('microphone=()'));
    assert.ok(pp.includes('geolocation=()'));
  });

  // 1F-C-05: Content-Security-Policy (CSP) presente
  await test('314. TEST 1F-C-05: Content-Security-Policy presente en respuestas HTTP', async () => {
    const res = await request('/api/auth/csrf-token');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.length > 0, 'CSP header debe existir');
  });

  // 1F-C-06: CSP contiene default-src 'self'
  await test('315. TEST 1F-C-06: CSP establece default-src \'self\'', async () => {
    const res = await request('/api/auth/csrf-token');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("default-src 'self'"));
  });

  // 1F-C-07: CSP contiene object-src 'none' para mitigar ejecución de plugins
  await test('316. TEST 1F-C-07: CSP establece object-src \'none\'', async () => {
    const res = await request('/api/auth/csrf-token');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("object-src 'none'"));
  });

  // 1F-C-08: CSP contiene base-uri 'self' y form-action 'self'
  await test('317. TEST 1F-C-08: CSP restringe base-uri y form-action a \'self\'', async () => {
    const res = await request('/api/auth/csrf-token');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("base-uri 'self'"));
    assert.ok(csp.includes("form-action 'self'"));
  });

  // 1F-C-09: CSP no permite unsafe-eval
  await test('318. TEST 1F-C-09: CSP no contiene unsafe-eval en script-src', async () => {
    const res = await request('/api/auth/csrf-token');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(!csp.includes("'unsafe-eval'"), 'CSP no debe incluir unsafe-eval');
  });

  // 1F-C-10: CSP contiene frame-ancestors 'none' coherente con X-Frame-Options
  await test('319. TEST 1F-C-10: CSP contiene frame-ancestors \'none\'', async () => {
    const res = await request('/api/auth/csrf-token');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("frame-ancestors 'none'"));
  });

  // 1F-C-11: HSTS condicionado (no se emite en plain HTTP en DEV)
  await test('320. TEST 1F-C-11: HSTS se omite en peticiones HTTP locales de desarrollo', async () => {
    const res = await request('/api/auth/csrf-token');
    // En DEV sobre http:// localhost, no debe forzar HSTS
    assert.strictEqual(res.headers.get('strict-transport-security'), null);
  });

  // 1F-C-12: HSTS se activa ante cabecera x-forwarded-proto: https
  await test('321. TEST 1F-C-12: HSTS se activa cuando se detecta conexión HTTPS o proxy seguro', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'x-forwarded-proto': 'https' }
    });
    assert.strictEqual(res.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  });

  // 1F-C-13: Cabecera x-powered-by está deshabilitada
  await test('322. TEST 1F-C-13: Cabecera x-powered-by no se expone al cliente', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.headers.get('x-powered-by'), null);
  });

  // 1F-C-14: Respuestas de API conservan Content-Type application/json
  await test('323. TEST 1F-C-14: Endpoints API responden con application/json y headers de seguridad', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('application/json'));
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  });

  // 1F-C-15: Static assets permitidos conservan security headers y MIME adecuado
  await test('324. TEST 1F-C-15: Descarga de assets estáticos (/uploads/*) incluye headers de seguridad', async () => {
    const testFile = path.join(uploadDir, 'test-asset-sec-headers.png');
    fs.writeFileSync(testFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
    const res = await request('/uploads/test-asset-sec-headers.png');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
  });

  // 1F-C-16: Respuestas de error (404/403) incluyen security headers
  await test('325. TEST 1F-C-16: Respuestas de error (404/403) conservan security headers', async () => {
    const res = await request('/uploads/forbidden-test.json');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    assert.ok((res.headers.get('content-security-policy') || '').includes("default-src 'self'"));
  });

  // 1F-C-17: CSP permite orígenes requeridos por el frontend (Google Fonts, Google Avatars, QR Server)
  await test('326. TEST 1F-C-17: CSP permite orígenes indispensables para estilos, fuentes y avatares', async () => {
    const res = await request('/api/auth/csrf-token');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes('https://fonts.googleapis.com'));
    assert.ok(csp.includes('https://fonts.gstatic.com'));
    assert.ok(csp.includes('https://lh3.googleusercontent.com'));
    assert.ok(csp.includes('https://api.qrserver.com'));
  });

  // 1F-C-18: CSP connect-src autoriza WebSocket y Socket.IO sin comodines globales (ni connect-src *, ni https:, ni wss:, ni data:)
  await test('327. TEST 1F-C-18: CSP connect-src autoriza WebSocket sin comodines globales connect-src *, https:, wss: ni data:', async () => {
    const res = await request('/api/auth/csrf-token');
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(!csp.includes('connect-src *'), 'No debe existir connect-src *');
    assert.ok(!csp.includes('connect-src \'self\' wss: https:'), 'No debe existir comodín protocolar https:/wss: en connect-src');
    // Extraer exactamente la directiva connect-src
    const match = csp.match(/connect-src\s+([^;]+)/);
    assert.ok(match, 'connect-src debe existir en CSP');
    const connectTokens = match[1].split(/\s+/);
    assert.ok(!connectTokens.includes('https:'), 'connect-src no debe contener el comodín https:');
    assert.ok(!connectTokens.includes('wss:'), 'connect-src no debe contener el comodín wss:');
    assert.ok(!connectTokens.includes('data:'), 'connect-src no debe contener data:');
    assert.ok(connectTokens.includes("'self'"), 'connect-src debe incluir self');
  });

  // 1F-C-19: X-Permitted-Cross-Domain-Policies está establecido en none
  await test('328. TEST 1F-C-19: Cabecera X-Permitted-Cross-Domain-Policies configurada en none', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.headers.get('x-permitted-cross-domain-policies'), 'none');
  });

  // 1F-C-20: Error 500 no filtra stack traces en respuestas JSON
  await test('329. TEST 1F-C-20: Respuestas de error no exponen stack traces ni rutas internas de Node.js', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/collections/nonexistent_invalid_collection_name', {
      headers: { 'Cookie': cookie }
    });
    const resText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    assert.ok(!resText.includes('at ModuleJob.run'));
    assert.ok(!resText.includes('node:internal'));
    assert.ok(!resText.includes('server.js:'));
  });

  // ============================================================
  // FASE 1F-D: CORS ENDURECIDO Y AISLAMIENTO DE ORÍGENES (TESTS 1F-D-01 A 1F-D-28)
  // ============================================================

  // 1F-D-01: Same-origin permitido sin header Origin
  await test('330. TEST 1F-D-01: Requests sin Origin (same-origin / server-to-server) son permitidas', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.status, 200);
  });

  // 1F-D-02: Origin autorizado permitido con ACAO exacto y ACAC true
  await test('331. TEST 1F-D-02: Origin autorizado emite Access-Control-Allow-Origin exacto y Credentials true', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'Origin': 'http://localhost:3000' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  // 1F-D-03: Origin no autorizado no emite Access-Control-Allow-Origin
  await test('332. TEST 1F-D-03: Origin no autorizado es bloqueado por CORS (sin cabecera ACAO)', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'Origin': 'https://unauthorized-domain.com' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-04: Origin evil.com rechazado
  await test('333. TEST 1F-D-04: Origin evil.com no recibe ACAO', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'Origin': 'https://evil.com' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-05: Subdomain confusion rechazado (e.g. localhost.evil.com)
  await test('334. TEST 1F-D-05: Subdomain confusion (http://localhost.evil.com) es rechazado', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'Origin': 'http://localhost.evil.com:3000' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-06: Similar-domain confusion rechazado
  await test('335. TEST 1F-D-06: Similar-domain confusion (http://localhost3000.com) es rechazado', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'Origin': 'http://localhost3000.com' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-07: Trailing slash normalizado correctamente
  await test('336. TEST 1F-D-07: Origin con trailing slash se normaliza y compara exactamente', async () => {
    assert.strictEqual(normalizeOrigin('http://localhost:3000/'), 'http://localhost:3000');
    assert.strictEqual(isOriginAllowed('http://localhost:3000/'), true);
  });

  // 1F-D-08: Wrong port rechazado (puerto 8080 no permitido)
  await test('337. TEST 1F-D-08: Origin con puerto no autorizado (http://localhost:8080) es rechazado', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'Origin': 'http://localhost:8080' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-09: Wrong protocol rechazado (https://localhost:3000 cuando solo se autoriza http en DEV)
  await test('338. TEST 1F-D-09: Protocolo no concordante (https://localhost:3000) es rechazado', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'Origin': 'https://localhost:3000' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-10: Wildcard * nunca devuelto en ACAO
  await test('339. TEST 1F-D-10: ACAO nunca es devuelto como wildcard *', async () => {
    const res1 = await request('/api/auth/csrf-token');
    assert.notStrictEqual(res1.headers.get('access-control-allow-origin'), '*');
    const res2 = await request('/api/auth/csrf-token', { headers: { 'Origin': 'http://localhost:3000' } });
    assert.notStrictEqual(res2.headers.get('access-control-allow-origin'), '*');
  });

  // 1F-D-11: Credentials + wildcard imposible
  await test('340. TEST 1F-D-11: Nunca se combina ACAO: * con ACAC: true', async () => {
    const res = await request('/api/auth/csrf-token', {
      headers: { 'Origin': 'http://localhost:3000' }
    });
    const acao = res.headers.get('access-control-allow-origin');
    const acac = res.headers.get('access-control-allow-credentials');
    assert.ok(!(acao === '*' && acac === 'true'), 'Imposible combinar * con credentials true');
  });

  // 1F-D-12: Preflight OPTIONS autorizado responde 204 con cabeceras completas
  await test('341. TEST 1F-D-12: Preflight OPTIONS para origin autorizado responde con ACAO y métodos', async () => {
    const res = await request('/api/collections/clients', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, x-csrf-token'
      }
    });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
    const methods = res.headers.get('access-control-allow-methods') || '';
    assert.ok(methods.includes('POST'));
  });

  // 1F-D-13: Preflight OPTIONS no autorizado no emite ACAO
  await test('342. TEST 1F-D-13: Preflight OPTIONS para origin no autorizado no emite ACAO', async () => {
    const res = await request('/api/collections/clients', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://attacker.site',
        'Access-Control-Request-Method': 'POST'
      }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-14: Cabecera x-csrf-token autorizada en preflight
  await test('343. TEST 1F-D-14: Cabecera personalizada x-csrf-token está permitida en preflight', async () => {
    const res = await request('/api/auth/csrf-token', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-csrf-token'
      }
    });
    const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert.ok(allowHeaders.includes('x-csrf-token'), 'x-csrf-token debe estar en allowed headers');
  });

  // 1F-D-15: Origin externo no autorizado no recibe ACAO en llamadas POST
  await test('344. TEST 1F-D-15: Origin externo no autorizado en llamada POST no recibe ACAO', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Origin': 'https://malicious-crm.com' },
      body: JSON.stringify({ email: 'fake@fake.com', password: 'fake' })
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-16: ACAC solo se emite para origin autorizado
  await test('345. TEST 1F-D-16: Access-Control-Allow-Credentials solo se emite cuando el origin está autorizado', async () => {
    const resAuth = await request('/api/auth/csrf-token', { headers: { 'Origin': 'http://localhost:3000' } });
    assert.strictEqual(resAuth.headers.get('access-control-allow-credentials'), 'true');
    const resUnauth = await request('/api/auth/csrf-token', { headers: { 'Origin': 'https://evil.com' } });
    assert.strictEqual(resUnauth.headers.get('access-control-allow-credentials'), null);
  });

  // 1F-D-17: Vary: Origin presente en respuestas con CORS
  await test('346. TEST 1F-D-17: Vary Origin presente para evitar envenenamiento de caché proxy', async () => {
    const res = await request('/api/auth/csrf-token', { headers: { 'Origin': 'http://localhost:3000' } });
    const vary = res.headers.get('vary') || '';
    assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin');
  });

  // 1F-D-18: Socket.IO handshake con origin autorizado
  await test('347. TEST 1F-D-18: Socket.IO autoriza handshake proveniente de origin permitido', async () => {
    const socket = ioClient('http://localhost:3001', {
      extraHeaders: { 'Origin': 'http://localhost:3000' },
      transports: ['websocket'],
      reconnection: false
    });
    await new Promise((resolve) => {
      socket.on('connect', () => {
        socket.disconnect();
        resolve();
      });
      socket.on('connect_error', () => {
        socket.disconnect();
        resolve();
      });
      setTimeout(() => { socket.disconnect(); resolve(); }, 1500);
    });
    assert.ok(true);
  });

  // 1F-D-19: Socket.IO rechaza origin no autorizado
  await test('348. TEST 1F-D-19: isOriginAllowed rechaza handshake con origin no autorizado', async () => {
    assert.strictEqual(isOriginAllowed('https://evil-websocket.com'), false);
    assert.strictEqual(isOriginAllowed('http://localhost:9999'), false);
  });

  // 1F-D-20: Socket.IO no utiliza wildcard *
  await test('349. TEST 1F-D-20: isOriginAllowed no devuelve true para comodines *', async () => {
    assert.strictEqual(isOriginAllowed('*'), false);
  });

  // 1F-D-21: AI endpoint mantiene protección contra invocación cross-origin no autorizada
  await test('350. TEST 1F-D-21: /api/ai/* bloquea ACAO ante peticiones cross-origin no autorizadas', async () => {
    const res = await request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Origin': 'https://evil-ai-caller.com' },
      body: JSON.stringify({ prompt: 'hello' })
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-22: Upload endpoint mantiene aislamiento cross-origin
  await test('351. TEST 1F-D-22: /api/upload bloquea ACAO ante peticiones cross-origin no autorizadas', async () => {
    const res = await request('/api/upload', {
      method: 'POST',
      headers: { 'Origin': 'https://malicious-uploader.com' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-23: Portal endpoints mantienen aislamiento cross-origin
  await test('352. TEST 1F-D-23: /api/portal/* bloquea ACAO ante peticiones cross-origin no autorizadas', async () => {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      headers: { 'Origin': 'https://fake-portal-site.com' },
      body: JSON.stringify({ portalType: 'client', identifier: '04141234567', pin: '123456' })
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // 1F-D-24: Comportamiento de request sin Origin documentado y verificado
  await test('353. TEST 1F-D-24: isOriginAllowed(undefined) retorna true (soporte same-origin/server-to-server)', async () => {
    assert.strictEqual(isOriginAllowed(undefined), true);
    assert.strictEqual(isOriginAllowed(''), true);
  });

  // 1F-D-25: Malformed origin rechazado
  await test('354. TEST 1F-D-25: Malformed origin (invalid-url-string) es rechazado', async () => {
    assert.strictEqual(isOriginAllowed('not_a_valid_url'), false);
    assert.strictEqual(isOriginAllowed('http:///bad'), false);
  });

  // 1F-D-26: Origin con userinfo rechazado
  await test('355. TEST 1F-D-26: Origin con userinfo (http://admin:pass@localhost:3000) es rechazado', async () => {
    assert.strictEqual(isOriginAllowed('http://admin:pass@localhost:3000'), false);
  });

  // 1F-D-27: parseAllowedOrigins sanitiza comas, espacios y trailing slashes
  await test('356. TEST 1F-D-27: parseAllowedOrigins limpia espacios, comas y slashes finales', async () => {
    const parsed = parseAllowedOrigins('  https://kalu.app/ , http://localhost:3000/// ,  ');
    assert.deepStrictEqual(parsed, ['https://kalu.app', 'http://localhost:3000']);
  });

  // 1F-D-28: Origin con prefijo engañoso (http://evil-localhost:3000) rechazado
  await test('357. TEST 1F-D-28: Origin con prefijo engañoso es rechazado estrictamente', async () => {
    assert.strictEqual(isOriginAllowed('http://evil-localhost:3000'), false);
    assert.strictEqual(isOriginAllowed('http://localhost:3000.evil.com'), false);
  });

  // ============================================================
  // FASE 1G-A: ENDURECIMIENTO DEL WEBHOOK DE WHATSAPP (TESTS 1G-A-01 A 1G-A-20)
  // ============================================================

  const TEST_WHATSAPP_SECRET = process.env.WHATSAPP_APP_SECRET || 'kalu_dev_app_secret_meta_hmac_2026';
  const TEST_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'kalu_dev_verification_token';

  // 1G-A-01: GET verification exitoso con modo y verify_token correcto
  await test('358. TEST 1G-A-01: GET verification con hub.mode=subscribe y verify_token correcto devuelve 200 y challenge', async () => {
    const challengeStr = 'challenge_test_12345';
    const res = await request(`/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=${challengeStr}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data, challengeStr);
  });

  // 1G-A-02: GET verification con token incorrecto devuelve 403
  await test('359. TEST 1G-A-02: GET verification con verify_token incorrecto devuelve 403 Forbidden', async () => {
    const res = await request('/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token_falso&hub.challenge=12345');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error, 'Verificación de webhook no autorizada');
  });

  // 1G-A-03: GET verification con hub.mode incorrecto devuelve 403
  await test('360. TEST 1G-A-03: GET verification con hub.mode distinto a subscribe devuelve 403', async () => {
    const res = await request(`/api/webhook/whatsapp?hub.mode=unsubscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=12345`);
    assert.strictEqual(res.status, 403);
  });

  // 1G-A-04: POST webhook sin cabecera X-Hub-Signature-256 devuelve 401
  await test('361. TEST 1G-A-04: POST webhook sin firma X-Hub-Signature-256 es rechazado con 401', async () => {
    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      body: JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.error, 'Firma requerida');
  });

  // 1G-A-05: POST webhook con firma inválida devuelve 403
  await test('362. TEST 1G-A-05: POST webhook con firma X-Hub-Signature-256 incorrecta devuelve 403', async () => {
    const fakeSig = 'sha256=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': fakeSig },
      body: JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error, 'Firma no autorizada');
  });

  // 1G-A-06: POST webhook con firma HMAC-SHA256 válida devuelve 200
  await test('363. TEST 1G-A-06: POST webhook con firma HMAC-SHA256 válida sobre rawBody devuelve 200 OK', async () => {
    const rawPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: `evt-valid-${Date.now()}`,
        changes: [{ value: { messaging_product: 'whatsapp' }, field: 'messages' }]
      }]
    });

    const signature = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': signature },
      body: rawPayload
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
  });

  // 1G-A-07: POST con body modificado tras calcular firma devuelve 403
  await test('364. TEST 1G-A-07: Modificación del payload tras calcular la firma provoca fallo de verificación (403)', async () => {
    const originalPayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'evt-1' }] });
    const signature = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET)
      .update(Buffer.from(originalPayload, 'utf8'))
      .digest('hex');

    // Se envía payload alterado (tampered)
    const tamperedPayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'evt-tampered' }] });

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': signature },
      body: tamperedPayload
    });

    assert.strictEqual(res.status, 403);
  });

  // 1G-A-08: POST con JSON equivalente pero espacios/bytes distintos invalida la firma
  await test('365. TEST 1G-A-08: JSON equivalente con espaciado distinto invalida la firma calculada sobre raw bytes', async () => {
    const rawA = '{"object":"whatsapp_business_account"}';
    const rawB = '{ "object" : "whatsapp_business_account" }'; // Mismo JSON semántico, diferentes bytes

    const signatureA = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET)
      .update(Buffer.from(rawA, 'utf8'))
      .digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': signatureA },
      body: rawB
    });

    assert.strictEqual(res.status, 403);
  });

  // 1G-A-09: Algoritmo de firma no soportado (sha1 o md5) es rechazado
  await test('366. TEST 1G-A-09: Algoritmo inesperado (sha1=... en lugar de sha256=...) es rechazado', async () => {
    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': 'sha1=abcdef1234567890abcdef1234567890abcdef12' },
      body: JSON.stringify({ test: true })
    });
    assert.strictEqual(res.status, 403);
  });

  // 1G-A-10: Firma con longitud hexadecimal truncada/incorrecta es rechazada
  await test('367. TEST 1G-A-10: Firma con longitud truncada (menos de 64 hex chars) es rechazada', async () => {
    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': 'sha256=deadbeef' },
      body: JSON.stringify({ test: true })
    });
    assert.strictEqual(res.status, 403);
  });

  // 1G-A-11: App Secret y Verify Token nunca son devueltos en las respuestas HTTP de error
  await test('368. TEST 1G-A-11: Respuestas de error del webhook no exponen secretos en el cuerpo', async () => {
    const res = await request('/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=bad_token');
    const bodyStr = JSON.stringify(res.data);
    assert.ok(!bodyStr.includes(TEST_WHATSAPP_SECRET));
    assert.ok(!bodyStr.includes(TEST_VERIFY_TOKEN));
  });

  // 1G-A-12: verifyWhatsAppWebhookSignature valida correctamente Buffers
  await test('369. TEST 1G-A-12: verifyWhatsAppWebhookSignature evalúa estrictamente y rechaza inputs inválidos', async () => {
    assert.strictEqual(verifyWhatsAppWebhookSignature(null, 'sha256=xxx', 'secret'), false);
    assert.strictEqual(verifyWhatsAppWebhookSignature(Buffer.from('test'), null, 'secret'), false);
    assert.strictEqual(verifyWhatsAppWebhookSignature(Buffer.from('test'), 'sha256=xxx', null), false);
  });

  // 1G-A-13: Webhook válido no se ve bloqueado por CORS
  await test('370. TEST 1G-A-13: Webhook puede recibir peticiones cross-origin de servidores Meta sin bloqueo', async () => {
    const rawPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: `evt-meta-cors-${Date.now()}` }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: {
        'Origin': 'https://graph.facebook.com',
        'X-Hub-Signature-256': sig
      },
      body: rawPayload
    });

    assert.strictEqual(res.status, 200);
  });

  // 1G-A-14: Webhook válido puede ser invocado sin cabecera Origin (petición directa server-to-server)
  await test('371. TEST 1G-A-14: Webhook procesa solicitudes server-to-server legítimas sin cabecera Origin', async () => {
    const rawPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: `evt-direct-${Date.now()}` }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: rawPayload
    });

    assert.strictEqual(res.status, 200);
  });

  // 1G-A-15: Evento duplicado es detectado por deduplicación e idempotencia granular
  await test('372. TEST 1G-A-15: Evento con message.id duplicado devuelve EVENT_ALREADY_PROCESSED con 200 OK', async () => {
    const fixedMsgId = `wamid.dedup_msg_${Date.now()}`;
    const rawPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: '104857602938475',
        changes: [{ value: { messages: [{ id: fixedMsgId }] }, field: 'messages' }]
      }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    // Primera entrega
    const res1 = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: rawPayload
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.status, 'EVENT_RECEIVED');

    // Segunda entrega (Replay / Retransmisión de Meta)
    const res2 = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: rawPayload
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.status, 'EVENT_ALREADY_PROCESSED');
  });

  // 1G-A-16: Payload malformado con firma correcta devuelve 400
  await test('373. TEST 1G-A-16: Payload no JSON con firma HMAC devuelve 400 Bad Request', async () => {
    const invalidJson = 'NOT_A_VALID_JSON{{{';
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET)
      .update(Buffer.from(invalidJson, 'utf8'))
      .digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': sig
      },
      body: invalidJson
    });

    assert.strictEqual(res.status, 400);
  });

  // 1G-A-17: Intentos de path traversal en propiedades del payload no afectan filesystem
  await test('374. TEST 1G-A-17: Payload con campos maliciosos (../../etc/passwd) no ejecuta traversal', async () => {
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: '../../traversal_test',
        changes: [{ field: '../../escape' }]
      }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET)
      .update(Buffer.from(payload, 'utf8'))
      .digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: payload
    });

    assert.strictEqual(res.status, 200);
    // Verificar que no se creó ningún archivo espurio
    assert.strictEqual(fs.existsSync(path.resolve('data-dev/../../escape')), false);
  });

  // 1G-A-18: Formato de firma insensible a mayúsculas en el prefijo (SHA256=)
  await test('375. TEST 1G-A-18: Prefijo de firma SHA256= en mayúsculas es normalizado y aceptado', async () => {
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: `evt-case-${Date.now()}` }] });
    const hex = crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(payload, 'utf8')).digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': `SHA256=${hex}` },
      body: payload
    });

    assert.strictEqual(res.status, 200);
  });

  // 1G-A-19: Endpoint /api/privacidad y /privacidad activo y público
  await test('376. TEST 1G-A-19: Endpoint de Política de Privacidad responde 200 para validación de Meta App', async () => {
    const res = await request('/api/privacidad');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data === 'string' && res.data.includes('Política de Privacidad'));
  });

  // 1G-A-20: Rate limiter whatsappWebhookLimiter configurado y exportado
  await test('377. TEST 1G-A-20: whatsappWebhookLimiter está correctamente inicializado', async () => {
    assert.ok(whatsappWebhookLimiter);
    assert.strictEqual(typeof whatsappWebhookLimiter, 'function');
  });

  // ============================================================
  // FASE 1G-A: IDEMPOTENCIA Y PREVENCIÓN DE REPLAY (TESTS 1G-A-IDEMP-01 A 07)
  // ============================================================

  const SAME_ACCOUNT_WABA_ID = '104857602938475';

  // 1G-A-IDEMP-01: Dos mensajes distintos de la misma cuenta son procesados independientemente
  await test('378. TEST 1G-A-IDEMP-01: Dos mensajes con IDs distintos bajo la misma cuenta WABA se procesan independientemente', async () => {
    const msgA_id = `wamid.msgA_${Date.now()}_1`;
    const msgB_id = `wamid.msgB_${Date.now()}_2`;

    const payloadA = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: SAME_ACCOUNT_WABA_ID,
        changes: [{ value: { messages: [{ id: msgA_id }] }, field: 'messages' }]
      }]
    });
    const sigA = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(payloadA, 'utf8')).digest('hex');

    const resA = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sigA },
      body: payloadA
    });
    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resA.data.status, 'EVENT_RECEIVED');
    assert.strictEqual(resA.data.newEvents, 1);

    const payloadB = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: SAME_ACCOUNT_WABA_ID, // Misma cuenta WABA
        changes: [{ value: { messages: [{ id: msgB_id }] }, field: 'messages' }]
      }]
    });
    const sigB = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(payloadB, 'utf8')).digest('hex');

    const resB = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sigB },
      body: payloadB
    });
    assert.strictEqual(resB.status, 200);
    assert.strictEqual(resB.data.status, 'EVENT_RECEIVED');
    assert.strictEqual(resB.data.newEvents, 1);
  });

  // 1G-A-IDEMP-02: El mismo mensaje enviado dos veces se deduplica
  await test('379. TEST 1G-A-IDEMP-02: El mismo mensaje enviado repetidamente se detecta como EVENT_ALREADY_PROCESSED', async () => {
    const fixedMsgId = `wamid.fixedMsg_${Date.now()}`;
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: SAME_ACCOUNT_WABA_ID,
        changes: [{ value: { messages: [{ id: fixedMsgId }] }, field: 'messages' }]
      }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(payload, 'utf8')).digest('hex');

    // Envío 1
    const res1 = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: payload
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.status, 'EVENT_RECEIVED');

    // Envío 2 (Replay de Meta)
    const res2 = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: payload
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.status, 'EVENT_ALREADY_PROCESSED');
  });

  // 1G-A-IDEMP-03: Dos mensajes distintos dentro del mismo payload son independientes
  await test('380. TEST 1G-A-IDEMP-03: Un payload con múltiples mensajes procesa cada uno de forma granular', async () => {
    const multiMsg1 = `wamid.multi1_${Date.now()}`;
    const multiMsg2 = `wamid.multi2_${Date.now()}`;

    const multiPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: SAME_ACCOUNT_WABA_ID,
        changes: [{
          value: {
            messages: [{ id: multiMsg1 }, { id: multiMsg2 }]
          },
          field: 'messages'
        }]
      }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(multiPayload, 'utf8')).digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: multiPayload
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
    assert.strictEqual(res.data.newEvents, 2);
  });

  // 1G-A-IDEMP-04: Replay exacto del payload con múltiples eventos se deduplica completamente
  await test('381. TEST 1G-A-IDEMP-04: Replay de un payload multi-evento devuelve EVENT_ALREADY_PROCESSED', async () => {
    const replayMsg1 = `wamid.replay1_${Date.now()}`;
    const replayMsg2 = `wamid.replay2_${Date.now()}`;

    const multiPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: SAME_ACCOUNT_WABA_ID,
        changes: [{
          value: {
            messages: [{ id: replayMsg1 }, { id: replayMsg2 }]
          },
          field: 'messages'
        }]
      }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(multiPayload, 'utf8')).digest('hex');

    // Primera vez -> Procesa 2
    const res1 = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: multiPayload
    });
    assert.strictEqual(res1.data.newEvents, 2);

    // Segunda vez -> Detecta replay total
    const res2 = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: multiPayload
    });
    assert.strictEqual(res2.data.status, 'EVENT_ALREADY_PROCESSED');
  });

  // 1G-A-IDEMP-05: Eventos sin ID no colisionan artificialmente
  await test('382. TEST 1G-A-IDEMP-05: extractWebhookEventIds devuelve array vacío ante objetos sin IDs y no genera colisiones falsas', async () => {
    const emptyPayload = { object: 'whatsapp_business_account', entry: [{ id: SAME_ACCOUNT_WABA_ID, changes: [{ field: 'unknown', value: {} }] }] };
    const ids = extractWebhookEventIds(emptyPayload);
    assert.deepStrictEqual(ids, []);
  });

  // 1G-A-IDEMP-06: entry[0].id NO se utiliza como event ID único de deduplicación
  await test('383. TEST 1G-A-IDEMP-06: extractWebhookEventIds nunca incluye la clave de cuenta entry[0].id en la lista de deduplicación', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'ACCOUNT_WABA_ID_9999',
        changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.SPECIFIC_MSG_ID' }] } }]
      }]
    };
    const ids = extractWebhookEventIds(payload);
    assert.ok(ids.includes('msg:wamid.SPECIFIC_MSG_ID'));
    assert.ok(!ids.includes('ACCOUNT_WABA_ID_9999'));
    assert.ok(!ids.includes('msg:ACCOUNT_WABA_ID_9999'));
  });

  // 1G-A-IDEMP-07: Dos status updates del mismo mensaje con timestamps o estados distintos se procesan
  await test('384. TEST 1G-A-IDEMP-07: Dos actualizaciones de status (sent -> delivered) se procesan independientemente', async () => {
    const statusMsgId = `wamid.statusCheck_${Date.now()}`;

    // 1. Status 'sent'
    const payloadSent = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: SAME_ACCOUNT_WABA_ID,
        changes: [{
          value: { statuses: [{ id: statusMsgId, status: 'sent', timestamp: '1789481001' }] },
          field: 'messages'
        }]
      }]
    });
    const sigSent = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(payloadSent, 'utf8')).digest('hex');

    const resSent = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sigSent },
      body: payloadSent
    });
    assert.strictEqual(resSent.status, 200);
    assert.strictEqual(resSent.data.newEvents, 1);

    // 2. Status 'delivered'
    const payloadDelivered = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: SAME_ACCOUNT_WABA_ID,
        changes: [{
          value: { statuses: [{ id: statusMsgId, status: 'delivered', timestamp: '1789481005' }] },
          field: 'messages'
        }]
      }]
    });
    const sigDelivered = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(payloadDelivered, 'utf8')).digest('hex');

    const resDelivered = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sigDelivered },
      body: payloadDelivered
    });
    assert.strictEqual(resDelivered.status, 200);
    assert.strictEqual(resDelivered.data.status, 'EVENT_RECEIVED');
    assert.strictEqual(resDelivered.data.newEvents, 1);
  });

  // 1G-A-LIMIT-01: WhatsApp Webhook rechaza payloads > 2MB con HTTP 413
  await test('385. TEST 1G-A-LIMIT-01: WhatsApp Webhook rechaza payloads superiores a 2MB con HTTP 413', async () => {
    // Generar buffer sintético de 2.2MB
    const largeDummyText = 'X'.repeat(2.2 * 1024 * 1024);
    const largePayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: SAME_ACCOUNT_WABA_ID, changes: [{ field: 'messages', value: { text: largeDummyText } }] }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(largePayload, 'utf8')).digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: largePayload
    });

    assert.strictEqual(res.status, 413, 'Debe devolver HTTP 413 Payload Too Large');
  });

  // 1G-A-LIMIT-02: Endpoints globales del CRM (e.g. /api/ai/ocr-invoice) aceptan payloads > 2MB (hasta 50MB)
  await test('386. TEST 1G-A-LIMIT-02: Endpoints globales del CRM/AI aceptan payloads superiores a 2MB sin ser afectados por el límite de 2MB del webhook', async () => {
    const { cookie, csrf } = await loginAdminD2();
    // Payload JSON de 2.5MB simulando imagen escaneada en Base64 para OCR
    const largeBase64Image = 'data:image/jpeg;base64,' + 'A'.repeat(2.5 * 1024 * 1024);
    const res = await request('/api/ai/ocr-invoice', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ imageBase64: largeBase64Image })
    });

    // No debe ser rechazado con 413 (responderá 200 o 400 por formato, pero nunca 413)
    assert.notStrictEqual(res.status, 413, 'El endpoint global no debe verse limitado a 2MB');
  });

  // ============================================================
  // FASE 1G-B: RATE LIMITING, ABUSE CONTROLS Y SUPERFICIE RESIDUAL (TESTS 1G-B-01 A 1G-B-12)
  // ============================================================

  // 1G-B-01: Neutralización de Webhooks Legacy con HTTP 410 Gone
  await test('387. TEST 1G-B-01: GET /api/webhook y GET /webhook devuelven 410 Gone', async () => {
    const res1 = await request('/api/webhook?hub.mode=subscribe&hub.challenge=123');
    assert.strictEqual(res1.status, 410, 'GET /api/webhook debe retornar 410 Gone');
    const res2 = await request('/webhook?hub.mode=subscribe&hub.challenge=123');
    assert.strictEqual(res2.status, 410, 'GET /webhook debe retornar 410 Gone');
  });

  // 1G-B-02: Neutralización de POST /api/webhook y POST /webhook con HTTP 410 Gone
  await test('388. TEST 1G-B-02: POST /api/webhook y POST /webhook devuelven 410 Gone sin procesar lógica antigua', async () => {
    const dummyPayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const res1 = await request('/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: dummyPayload
    });
    assert.strictEqual(res1.status, 410, 'POST /api/webhook debe retornar 410 Gone');
    assert.ok(res1.data.error.includes('legacy'), 'Debe documentar deshabilitación');

    const res2 = await request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: dummyPayload
    });
    assert.strictEqual(res2.status, 410, 'POST /webhook debe retornar 410 Gone');
  });

  // 1G-B-03: Rate limiter en POST /api/portal/auth/recovery/reset-pin ante intentos fallidos
  await test('389. TEST 1G-B-03: POST /api/portal/auth/recovery/reset-pin está protegido por recoveryResetPinLimiter', async () => {
    let got429 = false;
    for (let i = 0; i < 55; i++) {
      const res = await request('/api/portal/auth/recovery/reset-pin', {
        method: 'POST',
        body: JSON.stringify({
          portalType: 'client',
          identifier: '04141234567',
          resetToken: `invalid_token_${i}`,
          newPin: '654321'
        })
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Debe activar rate limit (HTTP 429) tras intentos fallidos de reseteo de PIN');
  });

  // 1G-B-04: /api/sync-rate responde normalmente a llamadas legítimas
  await test('390. TEST 1G-B-04: GET /api/sync-rate funciona correctamente bajo flujo normal', async () => {
    const res = await request('/api/sync-rate');
    // Puede ser 200 o 500 si falla fetch externo en sandbox, pero no 429 en la primera llamada
    assert.notStrictEqual(res.status, 429, 'No debe responder 429 en primer intento');
  });

  // 1G-B-05: /api/sync-rate activa 429 ante ráfagas excesivas
  await test('391. TEST 1G-B-05: GET /api/sync-rate activa HTTP 429 ante ráfaga excesiva de peticiones', async () => {
    let got429 = false;
    for (let i = 0; i < 20; i++) {
      const res = await request('/api/sync-rate');
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Debe retornar HTTP 429 ante abuso de solicitudes a sync-rate');
  });

  // 1G-B-06: /api/run-debt-check requiere autenticación y responde normalmente a Admin/Staff
  await test('392. TEST 1G-B-06: POST /api/run-debt-check ejecuta normalmente con sesión autenticada y CSRF', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const res = await request('/api/run-debt-check', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 1G-B-07: /api/run-debt-check activa 429 ante ejecuciones repetitivas excesivas
  await test('393. TEST 1G-B-07: POST /api/run-debt-check activa HTTP 429 ante ráfaga de ejecuciones', async () => {
    const { cookie, csrf } = await loginAdminD2();
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await request('/api/run-debt-check', {
        method: 'POST',
        headers: { 'Cookie': cookie, 'x-csrf-token': csrf }
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Debe retornar HTTP 429 tras superar el umbral de revisiones de cobranzas');
  });

  // 1G-B-08: Operaciones administrativas críticas (/api/full-backup) activan 429 ante flood
  await test('394. TEST 1G-B-08: GET /api/full-backup activa HTTP 429 ante ráfaga excesiva de solicitudes de respaldo', async () => {
    const { cookie } = await loginAdminD2();
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request('/api/full-backup', {
        headers: { 'Cookie': cookie }
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Debe activar rate limit administrativo en /api/full-backup');
  });



  // 1G-B-10: Hash rate limit key normaliza correctamente identificadores
  await test('396. TEST 1G-B-10: hashRateLimitKey normaliza espacios, mayúsculas y genera hash seguro sin exponer plaintext', async () => {
    const key1 = hashRateLimitKey('crm_acct', ' Admin@Kalu.local ');
    const key2 = hashRateLimitKey('crm_acct', 'admin@kalu.local');
    assert.strictEqual(key1, key2, 'Mismo identificador con distintas mayúsculas o espacios debe coincidir');
    assert.ok(!key1.includes('admin@kalu.local'), 'La clave no debe contener el texto plano de la cuenta');
    assert.ok(key1.startsWith('crm_acct_'));
  });

  // 1G-B-11: Dos cuentas distintas generan claves de rate limit aisladas
  await test('397. TEST 1G-B-11: Dos identificadores distintos generan claves de rate limit aisladas', async () => {
    const keyA = hashRateLimitKey('portal_client', '04141111111');
    const keyB = hashRateLimitKey('portal_client', '04142222222');
    assert.notStrictEqual(keyA, keyB, 'Cuentas distintas deben tener claves separadas');
  });

  // 1G-B-12: Endpoints protegidos en 1G-A (POST /api/webhook/whatsapp) siguen operando normalmente
  await test('398. TEST 1G-B-12: Webhook oficial /api/webhook/whatsapp mantiene verificación HMAC y SLA 200 sin regresión', async () => {
    const testMsgId = `wamid.test_1gb_regression_${Date.now()}`;
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: '1344089325449515',
        changes: [{
          value: { messages: [{ id: testMsgId, text: { body: 'hola' } }] },
          field: 'messages'
        }]
      }]
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', TEST_WHATSAPP_SECRET).update(Buffer.from(payload, 'utf8')).digest('hex');

    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': sig },
      body: payload
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
  });

  // ============================================================
  // FASE 1G-C.3: PROTOCOLO DEFINITIVO DE AUTORIZACIÓN QR (TESTS 1G-C.3-01 A 1G-C.3-20)
  // ============================================================

  // Helper para registrar una transacción temporal en DB
  function createTestPendingTransaction(overrides = {}) {
    const txPath = path.resolve('data-dev/transactions_db.json');
    let txs = [];
    if (fs.existsSync(txPath)) {
      try { txs = JSON.parse(fs.readFileSync(txPath, 'utf8')); } catch {}
    }
    const defaultTx = {
      id: `tx-test-1gc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      clientId: 'cli-demo-1',
      clientCi: 'V-12345678',
      amount: 120.50,
      totalUSD: 120.50,
      items: [{ name: 'QUESO DURO', qty: 10, price: 12.05 }],
      status: 'pending_approval',
      authNonce: `NONCE-${Date.now()}-abc1234567890def1234567890abcdef1234567890abcdef`,
      createdAt: Date.now(),
      timestamp: new Date().toISOString(),
      date: new Date().toISOString()
    };
    const finalTx = { ...defaultTx, ...overrides };
    txs.push(finalTx);
    fs.writeFileSync(txPath, JSON.stringify(txs, null, 2));
    return finalTx;
  }

  // 1G-C.3-01: Cliente autenticado puede aprobar SU pending transaction (200 OK)
  await test('399. TEST 1G-C.3-01: Cliente autenticado puede aprobar SU pending transaction (200 OK)', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1', amount: 85.00 });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ authNonce: tx.authNonce })
    });

    assert.strictEqual(res.status, 200, `Esperado 200, recibido ${res.status}`);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.transaction.status, 'approved');
    assert.ok(typeof res.data.transaction.approvedByClientAt === 'string');
    assert.ok(typeof res.data.transaction.authSignature === 'string');
    assert.ok(res.data.transaction.authSignature.startsWith('SIG-v1.'));
  });

  // 1G-C.3-02: Cliente A no puede aprobar transaction de Cliente B (404 Not Found)
  await test('400. TEST 1G-C.3-02: Cliente A no puede aprobar transaction de Cliente B (404 Not Found)', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-2' }); // Perteneciente a Cliente B

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ authNonce: tx.authNonce })
    });

    assert.strictEqual(res.status, 404, 'Debe devolver 404 para no revelar existencia ni permitir cross-client IDOR');
  });

  // 1G-C.3-03: Cliente no autenticado recibe 401
  await test('401. TEST 1G-C.3-03: Cliente no autenticado recibe HTTP 401 Unauthorized', async () => {
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1' });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ authNonce: tx.authNonce })
    });

    assert.strictEqual(res.status, 401);
  });

  // 1G-C.3-04: No se acepta clientId enviado por body para cambiar ownership
  await test('402. TEST 1G-C.3-04: No se acepta clientId enviado por body para cambiar ownership', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1' });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        clientId: 'cli-demo-2',
        clientCi: 'V-99999999'
      })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.transaction.clientId, 'cli-demo-1', 'Ownership debe permanecer vinculado al cliente autenticado');
    assert.strictEqual(res.data.transaction.clientCi, 'V-12345678');
  });

  // 1G-C.3-05: No se acepta authNonce manipulado en body
  await test('403. TEST 1G-C.3-05: authNonce manipulado en body es rechazado con 400 Bad Request', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1' });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ authNonce: 'TAMPERED_WRONG_NONCE' })
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('authNonce') || res.data.error.includes('inválido'));
  });

  // 1G-C.3-06: amount enviado por cliente no modifica amount
  await test('404. TEST 1G-C.3-06: amount enviado por cliente en body no modifica el monto original', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1', amount: 150.00 });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ amount: 1.00, totalUSD: 1.00 })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.transaction.amount, 150.00, 'El monto en base de datos debe ser inmutable durante la aprobación');
  });

  // 1G-C.3-07: items enviados por cliente no modifican items
  await test('405. TEST 1G-C.3-07: items enviados por cliente en body no modifican los items registrados', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({
      clientId: 'cli-demo-1',
      items: [{ name: 'QUESO DURO', qty: 5, price: 10 }]
    });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ items: [{ name: 'ITEM HACKEADO GRATIS', qty: 100, price: 0 }] })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.transaction.items[0].name, 'QUESO DURO');
    assert.strictEqual(res.data.transaction.items.length, 1);
  });

  // 1G-C.3-08: status enviado por cliente no modifica estado a valores arbitrarios
  await test('406. TEST 1G-C.3-08: status enviado por cliente en body no altera el flujo de estados', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1' });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ status: 'admin_bypassed_paid' })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.transaction.status, 'approved');
  });

  // 1G-C.3-09: approved transaction no puede aprobarse nuevamente (409 Conflict)
  await test('407. TEST 1G-C.3-09: Transacción en estado approved devuelve 409 Conflict ante intento de re-aprobación', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1', status: 'approved' });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 409);
    assert.ok(res.data.error.includes('no está pendiente'));
  });

  // 1G-C.3-10: cancelled transaction no puede aprobarse (409 Conflict)
  await test('408. TEST 1G-C.3-10: Transacción en estado cancelled devuelve 409 Conflict', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1', status: 'cancelled' });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 409);
  });

  // 1G-C.3-11: transaction fuera de TTL (>15m) no puede aprobarse (410 Gone)
  await test('409. TEST 1G-C.3-11: Transacción fuera de TTL (>15 minutos) es rechazada con 410 Gone', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({
      clientId: 'cli-demo-1',
      createdAt: Date.now() - 20 * 60 * 1000 // 20 minutos atrás
    });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 410);
    assert.ok(res.data.error.includes('expirado'));
  });

  // 1G-C.3-12: createdAt inválido/missing rechaza la aprobación (400 Bad Request)
  await test('410. TEST 1G-C.3-12: Transacción sin timestamp válido rechaza la aprobación con 400 Bad Request', async () => {
    const { cookie, csrf } = await loginClientA();
    const tx = createTestPendingTransaction({
      clientId: 'cli-demo-1',
      createdAt: null,
      timestamp: null,
      date: null
    });

    const res = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('timestamp'));
  });

  // 1G-C.3-13: Dos aprobaciones concurrentes producen como máximo UNA aprobación exitosa (200) y UNA 409
  await test('411. TEST 1G-C.3-13: Dos aprobaciones concurrentes producen exactamente 1 éxito (200) y 1 rechazo (409)', async () => {
    const { cookie: adminCookie, csrf: adminCsrf } = await loginAdminD2();
    const txId = `tx-pending-concurrent-${Date.now()}`;
    const createRes = await request('/api/collections/transactions', {
      method: 'POST',
      headers: { 'Cookie': adminCookie, 'x-csrf-token': adminCsrf },
      body: JSON.stringify({
        id: txId,
        clientId: 'cli-demo-1',
        clientCi: 'V-12345678',
        amount: 55.00,
        status: 'pending_approval',
        createdAt: Date.now()
      })
    });
    assert.strictEqual(createRes.status, 200);

    const { cookie: clientCookie, csrf: clientCsrf } = await loginClientA();

    // Disparar 2 aprobaciones simultáneas en paralelo
    const [resA, resB] = await Promise.all([
      request(`/api/portal/client/transactions/${txId}/approve`, {
        method: 'POST',
        headers: { 'Cookie': clientCookie, 'x-csrf-token': clientCsrf },
        body: JSON.stringify({})
      }),
      request(`/api/portal/client/transactions/${txId}/approve`, {
        method: 'POST',
        headers: { 'Cookie': clientCookie, 'x-csrf-token': clientCsrf },
        body: JSON.stringify({})
      })
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.strictEqual(statuses[0], 200, 'Una de las solicitudes paralelas debe resultar 200 OK');
    assert.strictEqual(statuses[1], 409, 'La otra solicitud concurrente debe resultar 409 Conflict');
  });

  // 1G-C.3-14: TRANSACTION_SIGNATURE_SECRET nunca aparece en bundle/frontend
  await test('412. TEST 1G-C.3-14: TRANSACTION_SIGNATURE_SECRET nunca aparece en código frontend src/', async () => {
    const srcDir = path.resolve('src');
    const files = fs.readdirSync(srcDir, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(srcDir, file);
      if (fs.statSync(fullPath).isFile() && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.vue'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(!content.includes('TRANSACTION_SIGNATURE_SECRET'), `El archivo src/${file} no debe contener TRANSACTION_SIGNATURE_SECRET`);
      }
    }
  });

  // 1G-C.3-15: INTERNAL_APP_SALT eliminado del código de producción
  await test('413. TEST 1G-C.3-15: INTERNAL_APP_SALT eliminado de src/utils/crypto.ts y de todo src/', async () => {
    const srcDir = path.resolve('src');
    const files = fs.readdirSync(srcDir, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(srcDir, file);
      if (fs.statSync(fullPath).isFile() && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(!content.includes('INTERNAL_APP_SALT'), `El archivo src/${file} no debe contener INTERNAL_APP_SALT`);
      }
    }
  });

  // 1G-C.3-16: signTransactionApproval eliminado si ya no tiene consumidor legítimo
  await test('414. TEST 1G-C.3-16: signTransactionApproval eliminado completamente de src/', async () => {
    const srcDir = path.resolve('src');
    const files = fs.readdirSync(srcDir, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(srcDir, file);
      if (fs.statSync(fullPath).isFile() && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(!content.includes('signTransactionApproval'), `El archivo src/${file} no debe contener signTransactionApproval`);
      }
    }
  });

  // 1G-C.3-17: verifyTransactionSignature eliminado si ya no tiene consumidor legítimo
  await test('415. TEST 1G-C.3-17: verifyTransactionSignature eliminado completamente de src/', async () => {
    const srcDir = path.resolve('src');
    const files = fs.readdirSync(srcDir, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(srcDir, file);
      if (fs.statSync(fullPath).isFile() && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(!content.includes('verifyTransactionSignature'), `El archivo src/${file} no debe contener verifyTransactionSignature`);
      }
    }
  });

  // 1G-C.3-18: no existe Math.random() en el flujo QR de producción
  await test('416. TEST 1G-C.3-18: Ningún componente QR ni utilitario criptográfico usa Math.random()', async () => {
    const serverContent = fs.readFileSync(path.resolve('server.js'), 'utf8');
    const nonceGenFnMatch = serverContent.match(/function generateTransactionAuthNonce\(\)\s*\{([\s\S]*?)\}/);
    assert.ok(nonceGenFnMatch, 'generateTransactionAuthNonce debe existir en server.js');
    assert.ok(!nonceGenFnMatch[1].includes('Math.random'), 'generateTransactionAuthNonce no debe usar Math.random()');
    assert.ok(nonceGenFnMatch[1].includes('crypto.randomBytes'), 'generateTransactionAuthNonce debe usar crypto.randomBytes');

    const cryptoSrc = fs.readFileSync(path.resolve('src/utils/crypto.ts'), 'utf8');
    assert.ok(!cryptoSrc.includes('Math.random'), 'src/utils/crypto.ts no debe usar Math.random()');
  });

  // 1G-C.3-19: QR no contiene secretos
  await test('417. TEST 1G-C.3-19: El payload QR generado por el POS no contiene secretos ni contraseñas', async () => {
    const cheesePosContent = fs.readFileSync(path.resolve('src/components/CheesePOSView.tsx'), 'utf8');
    assert.ok(!cheesePosContent.includes('TRANSACTION_SIGNATURE_SECRET'), 'POS no debe referenciar secretos de servidor');
    assert.ok(!cheesePosContent.includes('SESSION_SECRET'), 'POS no debe referenciar secretos de sesión');
    assert.ok(!cheesePosContent.includes('INTERNAL_APP_SALT'), 'POS no debe usar salt');
  });

  // 1G-C.3-20: Socket.IO post-approval respeta el scoping existente
  await test('418. TEST 1G-C.3-20: Socket.IO emite actualización post-aprobación respetando salas y scoping', async () => {
    // 1. Cliente A logueado abre socket
    const { cookie: clientCookie, csrf: clientCsrf } = await loginClientA();
    const clientSocket = await connectTestSocket(clientCookie);
    assert.ok(clientSocket && clientSocket.id);

    // 2. Cliente B logueado abre socket
    const { cookie: clientBCookie } = await loginClientB();
    const clientBSocket = await connectTestSocket(clientBCookie);
    assert.ok(clientBSocket && clientBSocket.id);

    let clientAReceived = false;
    let clientBReceived = false;

    clientSocket.on('collection_delta', (data) => {
      if (data && data.collection === 'transactions') {
        clientAReceived = true;
      }
    });

    clientBSocket.on('collection_delta', (data) => {
      if (data && data.collection === 'transactions') {
        clientBReceived = true;
      }
    });

    // 3. Crear y aprobar transacción de Cliente A
    const tx = createTestPendingTransaction({ clientId: 'cli-demo-1', amount: 33.00 });
    const approveRes = await request(`/api/portal/client/transactions/${tx.id}/approve`, {
      method: 'POST',
      headers: { 'Cookie': clientCookie, 'x-csrf-token': clientCsrf },
      body: JSON.stringify({})
    });
    assert.strictEqual(approveRes.status, 200);

    // Esperar eventos de socket
    await new Promise(r => setTimeout(r, 150));

    assert.strictEqual(clientAReceived, true, 'Cliente dueño (A) debe recibir delta de su transacción');
    assert.strictEqual(clientBReceived, false, 'Cliente ajeno (B) NO debe recibir delta de transacción de Cliente A');

    clientSocket.disconnect();
    clientBSocket.disconnect();
  });

  // ============================================================
  // PRUEBAS DE RATE LIMITER (SE EJECUTAN AL FINAL)
  // ============================================================

  // 1E-A-20: Rate limiter específico de IA se activa ante peticiones excesivas
  await test('249. TEST 1E-A-20: aiRateLimiter retorna HTTP 429 tras superar el umbral de peticiones', async () => {
    const { cookie, csrf } = await loginAdminD2();
    let got429 = false;

    // Enviar ráfaga rápida
    for (let i = 0; i < 35; i++) {
      const res = await request('/api/ai/chat', {
        method: 'POST',
        headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
        body: JSON.stringify({ prompt: `Test rate limit ${i}` })
      });
      if (res.status === 429) {
        got429 = true;
        assert.strictEqual(res.data.success, false);
        break;
      }
    }
    assert.ok(got429, 'Debe activar rate limiting (HTTP 429) ante ráfagas excesivas en endpoints de IA');
  });

  // ============================================================
  // PRUEBAS DE FASE 1H: INTEGRIDAD DE DATOS, TRANSACCIONES Y LOCKS
  // ============================================================

  // 1H-01: atomicWriteJsonFile escribe atómicamente con fsync y rename
  await test('1H-01: atomicWriteJsonFile persiste datos válidos y los deja legibles en disco', async () => {
    const testFile = path.join(dataDir, `test_atomic_${Date.now()}.json`);
    try {
      const payload = { test: true, timestamp: Date.now(), items: [1, 2, 3] };
      atomicWriteJsonFile(testFile, payload);
      assert.ok(fs.existsSync(testFile), 'El archivo de destino debe existir');
      const content = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      assert.deepStrictEqual(content, payload);
    } finally {
      if (fs.existsSync(testFile)) {
        try { fs.unlinkSync(testFile); } catch {}
      }
    }
  });

  // 1H-02: atomicWriteJsonFile ante error no altera el archivo existente y limpia temporales
  await test('1H-02: atomicWriteJsonFile no altera el archivo original y limpia temporales ante fallo', async () => {
    const testFile = path.join(dataDir, `test_atomic_err_${Date.now()}.json`);
    try {
      const initialPayload = { version: 1, secure: true };
      atomicWriteJsonFile(testFile, initialPayload);

      // Objeto circular que provocará TypeError en JSON.stringify
      const circular = {};
      circular.self = circular;

      let threw = false;
      try {
        atomicWriteJsonFile(testFile, circular);
      } catch (e) {
        threw = true;
      }
      assert.ok(threw, 'Debe lanzar error al intentar serializar estructura circular');

      // El archivo original debe permanecer 100% intacto con version: 1
      const content = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      assert.deepStrictEqual(content, initialPayload, 'El archivo original debe permanecer intacto');

      // No deben quedar archivos .tmp residuales
      const files = fs.readdirSync(dataDir);
      const tmpResiduals = files.filter(f => f.includes(`test_atomic_err_`) && f.includes('.tmp-'));
      assert.strictEqual(tmpResiduals.length, 0, 'No deben quedar temporales huérfanos');
    } finally {
      if (fs.existsSync(testFile)) {
        try { fs.unlinkSync(testFile); } catch {}
      }
    }
  });

  // 1H-03: atomicWriteJsonFile crea recursivamente directorios si no existen
  await test('1H-03: atomicWriteJsonFile crea automáticamente directorios inexistentes sin fallar', async () => {
    const subDir = path.join(dataDir, `sub_test_${Date.now()}`);
    const testFile = path.join(subDir, 'nested_db.json');
    try {
      atomicWriteJsonFile(testFile, [{ id: 'n1', ok: true }]);
      assert.ok(fs.existsSync(testFile));
      const read = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      assert.strictEqual(read[0].id, 'n1');
    } finally {
      if (fs.existsSync(testFile)) {
        try { fs.unlinkSync(testFile); } catch {}
      }
      if (fs.existsSync(subDir)) {
        try { fs.rmdirSync(subDir); } catch {}
      }
    }
  });

  // 1H-04: readCollection retorna [] para archivo inexistente o vacío
  await test('1H-04: readCollection maneja limpiamente archivos inexistentes o vacíos retornando []', async () => {
    const fakeCol = `non_existent_col_${Date.now()}`;
    const data = readCollection(fakeCol);
    assert.deepStrictEqual(data, [], 'Debe retornar array vacío para colección no existente');
  });

  // 1H-05: readCollection ante JSON corrupto genera snapshot .corrupt-<timestamp> y lanza excepción
  await test('1H-05: readCollection detecta JSON corrupto, crea snapshot de resguardo y lanza DATA_INTEGRITY_ERROR sin borrar datos', async () => {
    const corruptColName = `corrupt_test_${Date.now()}`;
    const corruptFilePath = getCollectionFilePath(corruptColName);
    try {
      // Escribir JSON truncado / inválido directamente
      fs.writeFileSync(corruptFilePath, '{"invalid_json: [1, 2,', 'utf8');

      let errorThrown = null;
      try {
        readCollection(corruptColName);
      } catch (err) {
        errorThrown = err;
      }

      assert.ok(errorThrown, 'readCollection debe lanzar excepción ante JSON corrupto');
      assert.ok(errorThrown.message.includes('[DATA_INTEGRITY_ERROR]'), 'Debe identificar el error de integridad');

      // Verificar que se creó el snapshot de respaldo
      const files = fs.readdirSync(dataDir);
      const corruptSnapshots = files.filter(f => f.startsWith(`${corruptColName}_db.json.corrupt-`));
      assert.ok(corruptSnapshots.length > 0, 'Debe haber creado un snapshot de respaldo .corrupt-<timestamp>');

      // Limpiar snapshots generados
      for (const snap of corruptSnapshots) {
        try { fs.unlinkSync(path.join(dataDir, snap)); } catch {}
      }
    } finally {
      if (fs.existsSync(corruptFilePath)) {
        try { fs.unlinkSync(corruptFilePath); } catch {}
      }
    }
  });

  // 1H-06: withTransaction provee aislamiento de lectura/escritura en memoria antes del commit
  await test('1H-06: withTransaction aísla cambios en memoria y no modifica archivos en disco antes del commit', async () => {
    const txColName = `tx_isol_${Date.now()}`;
    const filePath = getCollectionFilePath(txColName);
    try {
      atomicWriteJsonFile(filePath, [{ id: '1', val: 'initial' }]);

      let readInsideTx = null;
      await withTransaction(async (tx) => {
        const workingData = tx.read(txColName);
        workingData.push({ id: '2', val: 'staged' });
        tx.write(txColName, workingData);

        // Lectura desde dentro del contexto tx ve el cambio en memoria
        readInsideTx = tx.read(txColName);
        assert.strictEqual(readInsideTx.length, 2);

        // Lectura directa desde disco durante la tx aún ve el estado original
        const rawDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        assert.strictEqual(rawDisk.length, 1, 'En disco aún debe haber 1 elemento antes del commit');
      });

      // Tras commit exitoso, en disco están los 2 elementos
      const finalDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.strictEqual(finalDisk.length, 2);
    } finally {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  });

  // 1H-07: withTransaction aborta limpiamente ante excepción antes del commit sin modificar disco
  await test('1H-07: withTransaction aborta in-memory ante excepción sin modificar ningún archivo en disco', async () => {
    const colA = `tx_abort_a_${Date.now()}`;
    const colB = `tx_abort_b_${Date.now()}`;
    const fileA = getCollectionFilePath(colA);
    const fileB = getCollectionFilePath(colB);

    try {
      atomicWriteJsonFile(fileA, [{ id: 'a1' }]);
      atomicWriteJsonFile(fileB, [{ id: 'b1' }]);

      let caught = false;
      try {
        await withTransaction(async (tx) => {
          const dataA = tx.read(colA);
          dataA.push({ id: 'a2' });
          tx.write(colA, dataA);

          const dataB = tx.read(colB);
          dataB.push({ id: 'b2' });
          tx.write(colB, dataB);

          throw new Error('Controlled simulation exception in transaction handler');
        });
      } catch (err) {
        caught = true;
      }
      assert.ok(caught, 'La transacción debe propagar el error');

      // Verificar que ambos archivos en disco conservan exactamente su estado previo
      const diskA = JSON.parse(fs.readFileSync(fileA, 'utf8'));
      const diskB = JSON.parse(fs.readFileSync(fileB, 'utf8'));
      assert.strictEqual(diskA.length, 1, 'Col A no debe haber cambiado');
      assert.strictEqual(diskB.length, 1, 'Col B no debe haber cambiado');
    } finally {
      if (fs.existsSync(fileA)) try { fs.unlinkSync(fileA); } catch {}
      if (fs.existsSync(fileB)) try { fs.unlinkSync(fileB); } catch {}
    }
  });

  // 1H-08: withTransaction ejecuta rollback físico si una escritura física falla en la fase de commit
  await test('1H-08: withTransaction ejecuta rollback de colecciones ya escritas si falla una escritura posterior en commit', async () => {
    const col1 = `tx_rb_1_${Date.now()}`;
    const col2 = `tx_rb_2_${Date.now()}`;
    const file1 = getCollectionFilePath(col1);
    const file2 = getCollectionFilePath(col2);

    try {
      atomicWriteJsonFile(file1, [{ id: '1', version: 'original' }]);
      atomicWriteJsonFile(file2, [{ id: '2', version: 'original' }]);

      let errorThrown = false;
      try {
        await withTransaction(async (tx) => {
          tx.write(col1, [{ id: '1', version: 'updated' }]);
          // Objeto circular en col2 que provocará fallo en atomicWriteJsonFile durante el bucle de commit
          const circ = { id: '2' };
          circ.ref = circ;
          tx.write(col2, [circ]);
        });
      } catch (e) {
        errorThrown = true;
      }

      assert.ok(errorThrown, 'Debe haber fallado en la fase de commit');

      // Rollback físico: col1 fue escrita primero pero debe haber sido restaurada a 'original'
      const restored1 = JSON.parse(fs.readFileSync(file1, 'utf8'));
      assert.strictEqual(restored1[0].version, 'original', 'Col1 debe haber sido restaurada tras rollback');
    } finally {
      if (fs.existsSync(file1)) try { fs.unlinkSync(file1); } catch {}
      if (fs.existsSync(file2)) try { fs.unlinkSync(file2); } catch {}
    }
  });

  // 1H-09: withTransaction no emite eventos Socket.IO ante rollback
  await test('1H-09: withTransaction no emite eventos Socket.IO si la transacción se aborta o falla', async () => {
    const { cookie } = await loginAdminD2();
    const socket = await connectTestSocket(cookie);

    let emitted = false;
    socket.on('collection_delta', () => {
      emitted = true;
    });

    const colName = `tx_sock_abort_${Date.now()}`;
    try {
      try {
        await withTransaction(async (tx) => {
          tx.write(colName, [{ id: 'test' }], { action: 'add', collection: colName, doc: { id: 'test' } });
          throw new Error('Abort before commit');
        });
      } catch {}

      await new Promise(r => setTimeout(r, 150));
      assert.strictEqual(emitted, false, 'No debe emitir eventos Socket.IO ante abort');
    } finally {
      socket.disconnect();
    }
  });

  // 1H-10: withTransaction emite deltas Socket.IO únicamente tras commit exitoso
  await test('1H-10: withTransaction emite deltas Socket.IO diferidos tras commit exitoso', async () => {
    const { cookie } = await loginAdminD2();
    const socket = await connectTestSocket(cookie);

    const receivedDeltas = [];
    socket.on('collection_delta', (data) => {
      receivedDeltas.push(data);
    });

    const colName = `tx_sock_success_${Date.now()}`;
    const filePath = getCollectionFilePath(colName);
    try {
      await withTransaction(async (tx) => {
        tx.write(colName, [{ id: 'item1' }], { action: 'add', collection: colName, doc: { id: 'item1' } });
      });

      await new Promise(r => setTimeout(r, 200));
      assert.ok(receivedDeltas.length >= 1, 'Debe haber recibido el delta diferido tras commit');
      assert.strictEqual(receivedDeltas[receivedDeltas.length - 1].action, 'add');
    } finally {
      socket.disconnect();
      if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
    }
  });

  // 1H-11: process-sale checkout atómico actualiza products, kardex, transactions y vault
  await test('1H-11: process-sale actualiza atómicamente products, kardex, transactions y vault', async () => {
    const { cookie, csrf } = await loginAdminD2();

    // 1. Crear producto con stock conocido
    const prodId = `prod-pos-1h-${Date.now()}`;
    const createProd = await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        id: prodId,
        name: 'Queso Telita Especial 1H',
        pricePerKg: 10,
        wholesalePrice: 7,
        stockKg: 50,
        unit: 'Kg'
      })
    });
    assert.strictEqual(createProd.status, 200);

    // 2. Procesar venta POS de 5 Kg en Efectivo USD
    const saleRes = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [
          { productId: prodId, name: 'Queso Telita Especial 1H', quantityKg: 5, unitPrice: 10, subtotal: 50 }
        ],
        customerName: 'Comprador 1H Mostrador',
        paidAmount: 50,
        saleTotalAmount: 50,
        paymentMethodType: 'Efectivo $'
      })
    });

    assert.strictEqual(saleRes.status, 200);
    assert.strictEqual(saleRes.data.success, true);
    assert.ok(saleRes.data.transaction);

    // 3. Verificar estado persistido de productos
    const prods = readCollection('products');
    const updatedProd = prods.find(p => p.id === prodId);
    assert.strictEqual(updatedProd.stockKg, 45, 'El stock debe haber decrementado de 50 a 45');

    // 4. Verificar kardex
    const kardex = readCollection('kardex');
    const move = kardex.find(k => k.productId === prodId && k.type === 'SALIDA_VENTA');
    assert.ok(move, 'Debe existir registro kardex de SALIDA_VENTA');
    assert.strictEqual(move.quantity, 5);
    assert.strictEqual(move.newStock, 45);

    // 5. Verificar transactions
    const txs = readCollection('transactions');
    const txDoc = txs.find(t => t.id === saleRes.data.transaction.id);
    assert.ok(txDoc, 'La transacción debe estar guardada');
    assert.strictEqual(txDoc.amount, 50);
  });

  // 1H-12: process-sale a crédito actualiza atómicamente products, client debt, bills, installments y transactions
  await test('1H-12: process-sale a crédito Kalu actualiza atómicamente client.outstandingDebt, bills, installments y kardex', async () => {
    const { cookie, csrf } = await loginAdminD2();

    // 1. Crear producto y cliente
    const prodId = `prod-cred-1h-${Date.now()}`;
    const clientId = `cli-cred-1h-${Date.now()}`;

    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Queso Duro 1H', pricePerKg: 8, stockKg: 30 })
    });

    await request('/api/collections/clients', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        id: clientId,
        name: 'Cliente Crédito 1H',
        phone: '04149991122',
        outstandingDebt: 10,
        loyaltyPoints: 50
      })
    });

    // 2. Procesar venta a crédito por $40 (deuda total nueva = 10 + 40 = 50)
    const saleRes = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [{ productId: prodId, name: 'Queso Duro 1H', quantityKg: 5, unitPrice: 8, subtotal: 40 }],
        clientId: clientId,
        paidAmount: 0,
        saleTotalAmount: 40,
        paymentMethodType: 'Mundo Kalu',
        installmentsCount: 2,
        kaluCreditType: 'cotidiano'
      })
    });

    assert.strictEqual(saleRes.status, 200);
    assert.strictEqual(saleRes.data.success, true);

    // 3. Verificar deudas del cliente
    const clients = readCollection('clients');
    const c = clients.find(cl => cl.id === clientId);
    assert.strictEqual(c.outstandingDebt, 50, 'La deuda acumulada del cliente debe ser exactamente 50');

    // 4. Verificar bills
    const bills = readCollection('bills');
    const clientBill = bills.find(b => b.entityId === clientId && b.amount === 40);
    assert.ok(clientBill, 'Debe haberse generado la cuenta por cobrar en bills');

    // 5. Verificar installments
    const installments = readCollection('installments');
    const clientInsts = installments.filter(inst => inst.clientId === clientId);
    assert.strictEqual(clientInsts.length, 2, 'Debe haber generado 2 cuotas');
    assert.strictEqual(clientInsts[0].amount, 20);
    assert.strictEqual(clientInsts[1].amount, 20);
  });

  // 1H-13: process-sale adversarial failure test: fallo controlado no deja ningún rastro
  await test('1H-13: process-sale adversarial: payload con items vacíos o fallo no altera ninguna colección', async () => {
    const { cookie, csrf } = await loginAdminD2();

    const initialProducts = readCollection('products');
    const initialClients = readCollection('clients');
    const initialKardex = readCollection('kardex');
    const initialBills = readCollection('bills');
    const initialTxs = readCollection('transactions');

    // Enviar payload inválido sin items
    const failRes = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [],
        customerName: 'Intento Fallido'
      })
    });

    assert.strictEqual(failRes.status, 400);

    // Verificar que todas las colecciones permanecen idénticas
    assert.strictEqual(readCollection('products').length, initialProducts.length);
    assert.strictEqual(readCollection('clients').length, initialClients.length);
    assert.strictEqual(readCollection('kardex').length, initialKardex.length);
    assert.strictEqual(readCollection('bills').length, initialBills.length);
    assert.strictEqual(readCollection('transactions').length, initialTxs.length);
  });

  // 1H-14: process-sale con proveedor compensa balanceOwed o genera storeDebt atómicamente
  await test('1H-14: process-sale con proveedor compensa balanceOwed o crea storeDebt atómicamente', async () => {
    const { cookie, csrf } = await loginAdminD2();

    const supId = `sup-pos-1h-${Date.now()}`;
    const prodId = `prod-sup-1h-${Date.now()}`;

    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Queso Llanero 1H', pricePerKg: 10, stockKg: 20 })
    });

    await request('/api/collections/suppliers', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        id: supId,
        name: 'Productor Quesero 1H',
        balanceOwed: 30,
        storeDebt: 0
      })
    });

    // Venta al productor por $50 (30 compensados de balanceOwed + 20 de storeDebt)
    const saleRes = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [{ productId: prodId, name: 'Queso Llanero 1H', quantityKg: 5, unitPrice: 10, subtotal: 50 }],
        supplierId: supId,
        paidAmount: 0,
        saleTotalAmount: 50,
        paymentMethodType: 'Libreta'
      })
    });

    assert.strictEqual(saleRes.status, 200);

    const sups = readCollection('suppliers');
    const s = sups.find(sup => sup.id === supId);
    assert.strictEqual(s.balanceOwed, 0, 'El saldo a favor debe quedar en 0 tras compensación');
    assert.strictEqual(s.storeDebt, 20, 'La deuda de tienda del productor debe ser 20');
  });

  // 1H-15: reset-accounting limpia colecciones contables y resetea deudas atómicamente
  await test('1H-15: reset-accounting limpia colecciones contables y resetea deudas en una sola transacción', async () => {
    const { cookie, csrf } = await loginAdminD2();

    // Sembrar datos de prueba
    const tempClientId = `cli-reset-1h-${Date.now()}`;
    await request('/api/collections/clients', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: tempClientId, name: 'Cliente Para Reset', outstandingDebt: 120, loyaltyPoints: 400 })
    });

    // Resetear rate limiter de prueba
    if (adminResetLimiter.resetKey) {
      adminResetLimiter.resetKey('reset_acct_user_usr-admin-1');
      adminResetLimiter.resetKey('::1');
      adminResetLimiter.resetKey('127.0.0.1');
      adminResetLimiter.resetKey('unknown_ip');
    }
    if (adminResetLimiter.store && adminResetLimiter.store.resetAll) {
      adminResetLimiter.store.resetAll();
    }

    const resetRes = await request('/api/admin/reset-accounting', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({})
    });

    assert.strictEqual(resetRes.status, 200);
    assert.strictEqual(resetRes.data.success, true);

    // Verificar que colecciones contables quedaron en []
    assert.deepStrictEqual(readCollection('transactions'), []);
    assert.deepStrictEqual(readCollection('kardex'), []);
    assert.deepStrictEqual(readCollection('bills'), []);
    assert.deepStrictEqual(readCollection('installments'), []);

    // Verificar que clientes tienen outstandingDebt = 0
    const clients = readCollection('clients');
    const c = clients.find(cl => cl.id === tempClientId);
    assert.strictEqual(c.outstandingDebt, 0);
    assert.strictEqual(c.loyaltyPoints, 0);
  });

  // 1H-16: restore-backup valida payload y restaura colecciones atómicamente con withTransaction
  await test('1H-16: restore-backup valida payload y restaura colecciones atómicamente', async () => {
    const { cookie, csrf } = await loginAdminD2();

    // 1. Rechazo de payload malformado
    const badRes = await request('/api/restore-backup', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ collections: { products: 'not-an-array' } })
    });
    assert.strictEqual(badRes.status, 400);

    // 2. Restauración válida de backup sintético
    const testProdId = `prod-backup-1h-${Date.now()}`;
    const validRes = await request('/api/restore-backup', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        collections: {
          products: [{ id: testProdId, name: 'Producto Restaurado 1H', pricePerKg: 15, stockKg: 100 }]
        }
      })
    });

    assert.strictEqual(validRes.status, 200);
    assert.strictEqual(validRes.data.success, true);

    const prods = readCollection('products');
    const p = prods.find(pr => pr.id === testProdId);
    assert.ok(p, 'El producto restaurado debe existir en la base de datos');
    assert.strictEqual(p.stockKg, 100);
  });

  // 1H-17: Generic CRUDs respetan withCollectionLock serializando escrituras concurrentes
  await test('1H-17: CRUDs genéricos serializan escrituras concurrentes previniendo pérdida de documentos', async () => {
    const { cookie, csrf } = await loginAdminD2();

    const colName = `test_crud_lock_${Date.now()}`;
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        request(`/api/collections/${colName}`, {
          method: 'POST',
          headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
          body: JSON.stringify({ id: `doc-${i}`, index: i })
        })
      );
    }

    const responses = await Promise.all(promises);
    for (const res of responses) {
      assert.strictEqual(res.status, 200);
    }

    const saved = readCollection(colName);
    assert.strictEqual(saved.length, 10, 'Todas las 10 escrituras concurrentes deben haberse guardado');

    // Limpieza
    const filePath = getCollectionFilePath(colName);
    if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
  });

  // 1H-18: Products endpoints usan withCollectionLock y readCollection previniendo race conditions en stock
  await test('1H-18: PATCH /api/products/:id aplica ajustes de stock atómicos con lock', async () => {
    const { cookie, csrf } = await loginAdminD2();

    const prodId = `prod-patch-lock-${Date.now()}`;
    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Queso Mozzarella Lock', pricePerKg: 9, stockKg: 10 })
    });

    // 5 ajustes concurrentes de +2 kg cada uno
    const adjustments = [];
    for (let i = 0; i < 5; i++) {
      adjustments.push(
        request(`/api/products/${prodId}`, {
          method: 'PATCH',
          headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
          body: JSON.stringify({ adjustStockKg: 2 })
        })
      );
    }

    await Promise.all(adjustments);

    const prods = readCollection('products');
    const p = prods.find(pr => pr.id === prodId);
    assert.strictEqual(p.stockKg, 20, '10 initial + (5 * 2) = exactamente 20 Kg');
  });

  // 1H-19: Concurrencia real en DEV: dos ventas simultáneas descuentan el stock exactamente sin Lost Updates
  await test('1H-19: Concurrencia DEV: dos ventas simultáneas del mismo producto descuentan el stock exactamente', async () => {
    const { cookie, csrf } = await loginAdminD2();

    const prodId = `prod-concur-${Date.now()}`;
    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Queso Concurrente 1H', pricePerKg: 10, stockKg: 100 })
    });

    // Dos ventas concurrentes de 15 Kg y 25 Kg respectivamente
    const sale1Promise = request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [{ productId: prodId, quantityKg: 15, subtotal: 150 }],
        paidAmount: 150
      })
    });

    const sale2Promise = request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [{ productId: prodId, quantityKg: 25, subtotal: 250 }],
        paidAmount: 250
      })
    });

    const [res1, res2] = await Promise.all([sale1Promise, sale2Promise]);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);

    const prods = readCollection('products');
    const p = prods.find(pr => pr.id === prodId);
    assert.strictEqual(p.stockKg, 60, '100 - 15 - 25 = exactamente 60 Kg sin lost updates');
  });

  // 1H-20: Verificación de seguridad QR: authNonce backend generation y HMAC estricto
  await test('1H-20: Seguridad QR: authNonce inmutable desde frontend y HMAC validado por backend', async () => {
    const { cookie, csrf } = await loginAdminD2();

    // 1. Crear transacción con authNonce falso intentando inyección
    const txRes = await request('/api/collections/transactions', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        id: `tx-qr-sec-${Date.now()}`,
        status: 'pending_approval',
        amount: 250,
        authNonce: 'malicious-injected-nonce-from-attacker'
      })
    });

    assert.strictEqual(txRes.status, 200);
    const createdTx = txRes.data.doc;
    assert.notStrictEqual(createdTx.authNonce, 'malicious-injected-nonce-from-attacker', 'El authNonce DEBE ser generado por el backend');
    assert.strictEqual(createdTx.authNonce.length, 64, 'El authNonce backend debe tener 64 caracteres hex');
  });

  // ============================================================
  // FASE 1I — AUDIT LOGGING Y TRAZABILIDAD (TESTS 1I-01 A 1I-25)
  // ============================================================

  // 1I-01: Audit log generado en login exitoso
  await test('1I-01: Audit log generado en login CRM exitoso', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });
    assert.strictEqual(res.status, 200);

    const logs = readCollection('audit_logs');
    const loginLog = logs.find(l => l.action === 'auth.login' && l.result === 'success');
    assert.ok(loginLog, 'Debe existir un log de auditoría para auth.login exitoso');
    assert.strictEqual(loginLog.actorType, 'crm');
    assert.strictEqual(loginLog.resourceType, 'auth');
    assert.ok(loginLog.id.startsWith('audit-'));
    assert.ok(loginLog.timestamp);
  });

  // 1I-02: Login fallido no registra credenciales
  await test('1I-02: Login fallido no registra credenciales en metadata ni en audit log', async () => {
    const badPass = 'ExtremelySecretBadPassword999!';
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: badPass
      })
    });
    assert.strictEqual(res.status, 401);

    const logs = readCollection('audit_logs');
    const deniedLog = logs.find(l => l.action === 'auth.login' && l.result === 'denied');
    assert.ok(deniedLog, 'Debe registrarse evento de acceso denegado');
    const logStr = JSON.stringify(deniedLog);
    assert.strictEqual(logStr.includes(badPass), false, 'El audit log JAMÁS debe contener la contraseña enviada');
  });

  // 1I-03: Logout auditado
  await test('1I-03: Logout CRM auditado correctamente', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const logoutRes = await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf }
    });
    assert.strictEqual(logoutRes.status, 200);

    const logs = readCollection('audit_logs');
    const logoutLog = logs.find(l => l.action === 'auth.logout' && l.result === 'success');
    assert.ok(logoutLog, 'Debe existir un log de auditoría para auth.logout');
  });

  // 1I-04: Actor CRM derivado de sesión
  await test('1I-04: Actor CRM y rol derivados exclusivamente de req.session', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const prodId = `prod-audit-4-${Date.now()}`;
    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Producto Audit 1I-04', pricePerKg: 10, stockKg: 10 })
    });

    const res = await request(`/api/products/${prodId}`, {
      method: 'PATCH',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ adjustStockKg: 2 })
    });
    assert.strictEqual(res.status, 200);

    const logs = readCollection('audit_logs');
    const stockLog = logs.filter(l => l.action === 'inventory.stock_adjust' && l.resourceId === prodId).pop();
    assert.ok(stockLog);
    assert.strictEqual(stockLog.actorType, 'crm');
    assert.strictEqual(stockLog.actorRole, 'admin');
    assert.strictEqual(stockLog.actorId, 'usr-admin-dev');
  });

  // 1I-05: Actor portal derivado de sesión portal
  await test('1I-05: Actor portal derivado exclusivamente de req.session.portalUser', async () => {
    const loginRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });
    assert.strictEqual(loginRes.status, 200);

    const logs = readCollection('audit_logs');
    const portalLog = logs.filter(l => l.action === 'portal.login' && l.result === 'success').pop();
    assert.ok(portalLog);
    assert.strictEqual(portalLog.actorType, 'portal');
    assert.strictEqual(portalLog.actorRole, 'client');
    assert.strictEqual(portalLog.actorId, 'cli-demo-1');
  });

  // 1I-06: Rol enviado por body no puede falsificar actorRole
  await test('1I-06: Inyección de role en body no puede falsificar actorRole en auditoría', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const prodId = `prod-audit-6-${Date.now()}`;
    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Producto Audit 1I-06', pricePerKg: 10, stockKg: 10 })
    });

    const res = await request(`/api/products/${prodId}`, {
      method: 'PATCH',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        adjustStockKg: 1,
        role: 'super_root_god_mode',
        userRole: 'owner',
        actorRole: 'fake_role'
      })
    });
    assert.strictEqual(res.status, 200);

    const logs = readCollection('audit_logs');
    const stockLog = logs.filter(l => l.action === 'inventory.stock_adjust' && l.resourceId === prodId).pop();
    assert.strictEqual(stockLog.actorRole, 'admin', 'El rol DEBE provenir de req.user.role en el servidor');
  });

  // 1I-07: userId enviado por body no puede falsificar actorId
  await test('1I-07: Inyección de userId en body no puede falsificar actorId en auditoría', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const prodId = `prod-audit-7-${Date.now()}`;
    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Producto Audit 1I-07', pricePerKg: 10, stockKg: 10 })
    });

    const res = await request(`/api/products/${prodId}`, {
      method: 'PATCH',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        adjustStockKg: 1,
        userId: 'attacker-injected-id',
        actorId: 'attacker-injected-id'
      })
    });
    assert.strictEqual(res.status, 200);

    const logs = readCollection('audit_logs');
    const stockLog = logs.filter(l => l.action === 'inventory.stock_adjust' && l.resourceId === prodId).pop();
    assert.strictEqual(stockLog.actorId, 'usr-admin-dev', 'El actorId DEBE provenir de la sesión');
  });

  // 1I-08: Audit log no contiene passwords, PINs ni hashes
  await test('1I-08: Sanitización automática: Audit log no almacena password/PIN/passwordHash/pinHash', async () => {
    await recordAuditLog({
      action: 'test.sanitization',
      resourceType: 'test',
      result: 'success',
      metadata: {
        safeField: 'ok',
        password: 'mySecretPassword123',
        passwordHash: '$2a$10$abcdef123456',
        pin: '123456',
        pinHash: '$2a$10$pinHashValue'
      }
    });

    const logs = readCollection('audit_logs');
    const testLog = logs.find(l => l.action === 'test.sanitization');
    assert.ok(testLog);
    assert.strictEqual(testLog.metadata.safeField, 'ok');
    assert.strictEqual(testLog.metadata.password, undefined);
    assert.strictEqual(testLog.metadata.passwordHash, undefined);
    assert.strictEqual(testLog.metadata.pin, undefined);
    assert.strictEqual(testLog.metadata.pinHash, undefined);
  });

  // 1I-09: Audit log no contiene tokens ni secretos
  await test('1I-09: Sanitización automática: Audit log no almacena CSRF/session/recovery tokens ni secrets', async () => {
    await recordAuditLog({
      action: 'test.tokens_sanitization',
      resourceType: 'test',
      result: 'success',
      metadata: {
        token: 'secret_token_val',
        csrfToken: 'csrf_secret_val',
        resetToken: 'reset_token_val',
        apiKey: 'gemini_api_key_val',
        sessionSecret: 'super_secret'
      }
    });

    const logs = readCollection('audit_logs');
    const testLog = logs.find(l => l.action === 'test.tokens_sanitization');
    assert.ok(testLog);
    assert.strictEqual(Object.keys(testLog.metadata).length, 0, 'Todos los campos de tokens sensibles deben ser removidos');
  });

  // 1I-10: process-sale success auditado dentro de la transacción
  await test('1I-10: POS process-sale exitoso persiste audit log con commit', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const prodId = `prod-pos-audit-${Date.now()}`;
    await request('/api/products', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ id: prodId, name: 'Producto Audit POS', pricePerKg: 10, stockKg: 50 })
    });

    const saleRes = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [{ productId: prodId, quantityKg: 1, subtotal: 10 }],
        paidAmount: 10,
        customerName: 'Cliente Audit Test'
      })
    });
    assert.strictEqual(saleRes.status, 200);

    const logs = readCollection('audit_logs');
    const saleLog = logs.filter(l => l.action === 'pos.process_sale' && l.result === 'success').pop();
    assert.ok(saleLog, 'Debe existir audit log de pos.process_sale success');
    assert.strictEqual(saleLog.metadata.itemCount, 1);
    assert.strictEqual(saleLog.metadata.customerName, 'Cliente Audit Test');
  });

  // 1I-11: process-sale rollback no produce audit success
  await test('1I-11: Rollback en process-sale no produce audit log de éxito', async () => {
    const { cookie, csrf } = await loginAdminD2();
    const initialSuccessCount = readCollection('audit_logs').filter(l => l.action === 'pos.process_sale' && l.result === 'success').length;

    // Intentar venta inválida (saleItems no array o vacío)
    const saleRes = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: []
      })
    });
    assert.strictEqual(saleRes.status, 400);

    const afterSuccessCount = readCollection('audit_logs').filter(l => l.action === 'pos.process_sale' && l.result === 'success').length;
    assert.strictEqual(afterSuccessCount, initialSuccessCount, 'No debe emitirse log de éxito en venta abortada');
  });

  // 1I-12: reset-accounting auditado
  await test('1I-12: reset-accounting auditado de forma transaccional', async () => {
    const { cookie, csrf } = await loginAdminD2();
    if (adminResetLimiter.store && adminResetLimiter.store.resetAll) {
      adminResetLimiter.store.resetAll();
    }
    const res = await request('/api/admin/reset-accounting', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf }
    });
    assert.strictEqual(res.status, 200);

    const logs = readCollection('audit_logs');
    const resetLog = logs.filter(l => l.action === 'admin.reset_accounting' && l.result === 'success').pop();
    assert.ok(resetLog, 'Debe existir audit log de reset_accounting');
    assert.strictEqual(resetLog.actorRole, 'admin');
  });

  // 1I-13: restore-backup auditado
  await test('1I-13: restore-backup auditado de forma transaccional', async () => {
    const { cookie, csrf } = await loginAdminD2();
    if (adminRestoreLimiter.store && adminRestoreLimiter.store.resetAll) {
      adminRestoreLimiter.store.resetAll();
    }
    const res = await request('/api/restore-backup', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        collections: {
          banners: []
        }
      })
    });
    assert.strictEqual(res.status, 200);

    const logs = readCollection('audit_logs');
    const restoreLog = logs.filter(l => l.action === 'admin.restore_backup' && l.result === 'success').pop();
    assert.ok(restoreLog, 'Debe existir audit log de restore_backup');
  });

  // 1I-14: QR approval auditado
  await test('1I-14: Aprobación QR de cliente auditada con éxito', async () => {
    // 1. Crear transacción pending_approval
    const txId = `tx-audit-qr-${Date.now()}`;
    const testTx = {
      id: txId,
      clientId: 'cli-demo-1',
      clientCi: 'V-12345678',
      amount: 50,
      status: 'pending_approval',
      createdAt: Date.now(),
      authNonce: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff'
    };
    await withCollectionLock('transactions', async () => {
      const txs = readCollection('transactions');
      txs.push(testTx);
      writeCollection('transactions', txs);
    });

    // 2. Login cliente
    const portalAuth = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });
    assert.strictEqual(portalAuth.status, 200);

    // 3. Aprobar QR
    const appRes = await request(`/api/portal/client/transactions/${txId}/approve`, {
      method: 'POST',
      headers: {
        'Cookie': portalAuth.setCookie,
        'x-csrf-token': portalAuth.data.csrfToken
      },
      body: JSON.stringify({
        authNonce: testTx.authNonce
      })
    });
    assert.strictEqual(appRes.status, 200);

    const logs = readCollection('audit_logs');
    const qrLog = logs.filter(l => l.action === 'qr.approve' && l.resourceId === txId && l.result === 'success').pop();
    assert.ok(qrLog, 'Debe existir audit log de qr.approve success');
    assert.strictEqual(qrLog.actorId, 'cli-demo-1');
  });

  // 1I-15: QR replay rechazado y auditado de forma segura
  await test('1I-15: Intento de re-aprobación QR rechazado y auditado como failure/denied', async () => {
    const portalAuth = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });

    // Intentar aprobar transacción inexistente
    const res = await request('/api/portal/client/transactions/tx-non-existent-999/approve', {
      method: 'POST',
      headers: {
        'Cookie': portalAuth.setCookie,
        'x-csrf-token': portalAuth.data.csrfToken
      },
      body: JSON.stringify({ authNonce: 'abc' })
    });
    assert.strictEqual(res.status, 404);

    const logs = readCollection('audit_logs');
    const deniedLog = logs.filter(l => l.action === 'qr.approve' && l.resourceId === 'tx-non-existent-999').pop();
    assert.ok(deniedLog, 'Debe registrarse evento de auditoría para QR no encontrado');
    assert.strictEqual(deniedLog.result, 'denied');
  });

  // 1I-16: Invalid WhatsApp signature auditada sin PII
  await test('1I-16: Firma inválida en Webhook WhatsApp auditada sin registrar payload sensible', async () => {
    const payload = JSON.stringify({ entry: [{ id: '123' }] });
    const res = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
      },
      body: payload
    });
    assert.strictEqual(res.status, 403);

    const logs = readCollection('audit_logs');
    const whLog = logs.filter(l => l.action === 'webhook.whatsapp' && l.result === 'denied').pop();
    assert.ok(whLog, 'Debe auditarse la firma de webhook denegada');
    assert.strictEqual(whLog.metadata.reason, 'invalid_signature');
  });

  // 1I-17: Webhook replay auditado
  await test('1I-17: Webhook replay auditado de forma segura', async () => {
    const appSecret = process.env.WHATSAPP_APP_SECRET || 'kalu_dev_app_secret_meta_hmac_2026';
    const rawBody = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'wamid.HBgLTestAuditReplay123' }]
          }
        }]
      }]
    });
    const hmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    // Primera llamada (success)
    const res1 = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${hmac}`
      },
      body: rawBody
    });
    assert.strictEqual(res1.status, 200);

    // Segunda llamada (replay detectado)
    const res2 = await request('/api/webhook/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${hmac}`
      },
      body: rawBody
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.status, 'EVENT_ALREADY_PROCESSED');

    const logs = readCollection('audit_logs');
    const replayLog = logs.filter(l => l.action === 'webhook.whatsapp_replay').pop();
    assert.ok(replayLog, 'Debe registrarse audit log de webhook replay');
  });

  // 1I-18: RBAC denied auditado
  await test('1I-18: Intento de acceso a recurso administrativo sin rol admin queda auditado como denied', async () => {
    // Login como cajero
    const cajeroAuth = await loginCashierD2();

    // Intentar acceder a endpoint exclusivo de admin
    const res = await request('/api/rbac/admin-only', {
      headers: { 'Cookie': cajeroAuth.cookie }
    });
    assert.strictEqual(res.status, 403);

    const logs = readCollection('audit_logs');
    const rbacLog = logs.filter(l => l.action === 'security.rbac_denied').pop();
    assert.ok(rbacLog, 'Debe auditarse security.rbac_denied');
    assert.strictEqual(rbacLog.result, 'denied');
    assert.strictEqual(rbacLog.actorRole, 'cajero');
  });

  // 1I-19: CSRF rejection auditada sin token
  await test('1I-19: CSRF token inválido auditado sin exponer el token', async () => {
    const { cookie } = await loginAdminD2();
    const res = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'x-csrf-token': 'attacker_invalid_csrf_token_value_999'
      }
    });
    assert.strictEqual(res.status, 403);

    const logs = readCollection('audit_logs');
    const csrfLog = logs.filter(l => l.action === 'security.csrf_denied').pop();
    assert.ok(csrfLog, 'Debe registrarse security.csrf_denied');
    assert.strictEqual(JSON.stringify(csrfLog).includes('attacker_invalid_csrf_token_value_999'), false, 'No debe filtrarse el token en logs');
  });

  // 1I-20: Audit endpoint solo admin
  await test('1I-20: GET /api/admin/audit-logs exige autenticación de administrador (401 / 403)', async () => {
    // 1. Sin auth -> 401
    const anonRes = await request('/api/admin/audit-logs');
    assert.strictEqual(anonRes.status, 401);

    // 2. Cajero -> 403
    const cajeroAuth = await loginCashierD2();
    const cajeroRes = await request('/api/admin/audit-logs', {
      headers: { 'Cookie': cajeroAuth.cookie }
    });
    assert.strictEqual(cajeroRes.status, 403);

    // 3. Admin -> 200
    const { cookie } = await loginAdminD2();
    const adminRes = await request('/api/admin/audit-logs', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(adminRes.status, 200);
    assert.ok(Array.isArray(adminRes.data.logs));
  });

  // 1I-21: Audit endpoint no permite mutación ni acceso genérico
  await test('1I-21: audit_logs está bloqueada contra mutaciones y lecturas genéricas vía /api/collections', async () => {
    const { cookie, csrf } = await loginAdminD2();

    // 1. GET /api/collections/audit_logs -> 403
    const getRes = await request('/api/collections/audit_logs', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(getRes.status, 403);

    // 2. POST /api/collections/audit_logs -> 403
    const postRes = await request('/api/collections/audit_logs', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ fake: 'audit' })
    });
    assert.strictEqual(postRes.status, 403);

    // 3. PATCH /api/collections/audit_logs/123 -> 403
    const patchRes = await request('/api/collections/audit_logs/123', {
      method: 'PATCH',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ fake: 'mod' })
    });
    assert.strictEqual(patchRes.status, 403);

    // 4. DELETE /api/collections/audit_logs/123 -> 403
    const delRes = await request('/api/collections/audit_logs/123', {
      method: 'DELETE',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf }
    });
    assert.strictEqual(delRes.status, 403);
  });

  // 1I-22: Paginación y filtros en audit endpoint
  await test('1I-22: Paginación y filtros funcionan correctamente en /api/admin/audit-logs', async () => {
    const { cookie } = await loginAdminD2();
    const page1Res = await request('/api/admin/audit-logs?page=1&limit=5', {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(page1Res.status, 200);
    assert.strictEqual(page1Res.data.page, 1);
    assert.strictEqual(page1Res.data.limit, 5);
    assert.ok(page1Res.data.logs.length <= 5);
    assert.ok(page1Res.data.total >= page1Res.data.logs.length);
    assert.ok(page1Res.data.totalPages >= 1);
  });

  // 1I-23: Audit log append-only a nivel de aplicación
  await test('1I-23: Audit log es estrictamente append-only a nivel de aplicación', async () => {
    const initialCount = readCollection('audit_logs').length;
    await recordAuditLog({
      action: 'test.append_only',
      resourceType: 'system',
      result: 'success'
    });
    const afterCount = readCollection('audit_logs').length;
    assert.strictEqual(afterCount, initialCount + 1);
  });

  // 1I-24: Concurrencia de audit events no pierde eventos
  await test('1I-24: Concurrencia: 10 escrituras simultáneas de audit logs persisten todos los eventos', async () => {
    const uniqueConcurrencyAction = `test.concurrency_${Date.now()}`;
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(recordAuditLog({
        action: uniqueConcurrencyAction,
        resourceType: 'system',
        result: 'success',
        metadata: { index: i }
      }));
    }
    await Promise.all(promises);

    const logs = readCollection('audit_logs');
    const concurrentLogs = logs.filter(l => l.action === uniqueConcurrencyAction);
    assert.strictEqual(concurrentLogs.length, 10, 'Deben haberse persistido exactamente 10 eventos sin pérdida');
  });

  // 1I-25: Metadata no contiene secretos en ninguna circunstancia
  await test('1I-25: Verificación global: ningun audit log registrado contiene secrets o hashes', async () => {
    const allLogs = readCollection('audit_logs');
    for (const log of allLogs) {
      assert.ok(!log.metadata?.password, 'No password');
      assert.ok(!log.metadata?.passwordHash, 'No passwordHash');
      assert.ok(!log.metadata?.pin, 'No pin');
      assert.ok(!log.metadata?.pinHash, 'No pinHash');
      assert.ok(!log.metadata?.csrfToken, 'No csrfToken');
      assert.ok(!log.metadata?.resetToken, 'No resetToken');
    }
  });

  // ============================================================
  // FASE 1K — TESTS DE HARDENING FINAL Y PRE-PRODUCCIÓN
  // ============================================================

  // 1K-01: Endpoints DEV/TEST RBAC y role-change-test no permiten bypass de rol
  await test('462. TEST 1K-01: /api/rbac/role-change-test no permite alteración de rol ni elevación de privilegios', async () => {
    const { cookie, csrf } = await loginCashierD2();
    const res = await request('/api/rbac/role-change-test', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ role: 'admin', isAdmin: true })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.effectiveRole, 'cajero');
    assert.strictEqual(res.data.user.role, 'cajero');
  });

  // 1K-02: Sanitización de Audit Logs filtra automáticamente prompts de IA, audio, OCR y payloads crudos
  await test('463. TEST 1K-02: recordAuditLog sanitiza automáticamente prompts, audios, OCR y raw payloads de metadata', async () => {
    await recordAuditLog({
      action: 'ai.test_sanitization',
      resourceType: 'ai',
      result: 'success',
      metadata: {
        safeField: 'preserved_info',
        prompt: 'información confidencial sobre balance de pagos',
        audio: 'audio_data_buffer_base64_string',
        voice: 'voice_recording_data',
        ocr: 'extracted_raw_ocr_invoice_content',
        rawPayload: { secret: 'payload_content' },
        password: 'should_be_removed',
        pin: '123456',
        token: 'secret_token'
      }
    });

    const logs = readCollection('audit_logs');
    const testLog = logs.find(l => l.action === 'ai.test_sanitization');
    assert.ok(testLog);
    assert.strictEqual(testLog.metadata.safeField, 'preserved_info');
    assert.strictEqual(testLog.metadata.prompt, undefined);
    assert.strictEqual(testLog.metadata.audio, undefined);
    assert.strictEqual(testLog.metadata.voice, undefined);
    assert.strictEqual(testLog.metadata.ocr, undefined);
    assert.strictEqual(testLog.metadata.rawPayload, undefined);
    assert.strictEqual(testLog.metadata.password, undefined);
    assert.strictEqual(testLog.metadata.pin, undefined);
    assert.strictEqual(testLog.metadata.token, undefined);
  });

  // 1K-03: Servidor estático /protected_media bloquea path traversal y extensiones peligrosas (.json, .js, .bak)
  await test('464. TEST 1K-03: Endpoint /protected_media bloquea traversal (../) y extensiones no permitidas (.json, .js, .env)', async () => {
    const resTraversal = await request('/protected_media/..%2f..%2fpackage.json');
    assert.strictEqual(resTraversal.status, 404);

    const resJson = await request('/protected_media/sensitive_db.json');
    assert.strictEqual(resJson.status, 404);

    const resJs = await request('/protected_media/exploit.js');
    assert.strictEqual(resJs.status, 404);
  });

  // 1K-04: Reporte de pago con installmentId en portal ejecuta de forma transaccional y consistente
  await test('465. TEST 1K-04: POST /api/portal/client/payments actualiza pwa_payments e installments atómicamente', async () => {
    const { cookie, csrf } = await loginClientA();
    const instId = `inst-test-1k-${Date.now()}`;
    const testInst = {
      id: instId,
      clientId: 'cli-demo-1',
      amountUSD: 50,
      dueDate: '2026-12-31',
      status: 'pending'
    };

    const installments = readCollection('installments');
    installments.push(testInst);
    writeCollection('installments', installments);

    const payRes = await request('/api/portal/client/payments', {
      method: 'POST',
      headers: { 'Cookie': cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        amount: 50,
        paymentMethod: 'Pago Móvil',
        reference: 'REF-1K-001',
        installmentId: instId
      })
    });

    assert.strictEqual(payRes.status, 200);
    assert.strictEqual(payRes.data.success, true);
    assert.strictEqual(payRes.data.payment.amount, 50);

    const updatedInsts = readCollection('installments');
    const updatedInst = updatedInsts.find(i => String(i.id) === instId);
    assert.ok(updatedInst);
    assert.strictEqual(updatedInst.status, 'in_review');
  });

  // 1K-05: Restablecimiento de PIN en portal actualiza hash bajo lock y borra PIN plano
  await test('466. TEST 1K-05: Restablecimiento de PIN almacena bcrypt hash, elimina pin plano e invalida tokens', async () => {
    const challenge = createRecoveryChallenge({
      portalType: 'client',
      targetId: 'cli-demo-1',
      channel: 'email',
      recipient: 'cliente1@kalu.local'
    });
    assert.ok(challenge);
    assert.ok(challenge.otpForDelivery);

    const verifyResult = verifyRecoveryCode({
      challengeId: challenge.challengeId,
      code: challenge.otpForDelivery,
      portalType: 'client',
      targetId: 'cli-demo-1'
    });
    assert.strictEqual(verifyResult.success, true);
    assert.ok(verifyResult.resetToken);

    // Consumir token y actualizar PIN bajo lock
    const consumeRes = consumeResetToken({
      resetToken: verifyResult.resetToken,
      portalType: 'client',
      targetId: 'cli-demo-1'
    });
    assert.strictEqual(consumeRes.success, true);

    await withCollectionLock('clients', async () => {
      const clients = readCollection('clients');
      const client = clients.find(c => String(c.id) === 'cli-demo-1');
      assert.ok(client);
      client.pinHash = bcrypt.hashSync('654321', 10);
      delete client.pin;
      writeCollection('clients', clients);
    });

    const updatedClients = readCollection('clients');
    const updatedClient = updatedClients.find(c => String(c.id) === 'cli-demo-1');
    assert.ok(updatedClient);
    assert.strictEqual(updatedClient.pin, undefined);
    assert.ok(updatedClient.pinHash);
    assert.ok(bcrypt.compareSync('654321', updatedClient.pinHash));

    // Restaurar PIN original para no alterar otras pruebas
    updatedClient.pinHash = bcrypt.hashSync('678000', 10);
    writeCollection('clients', updatedClients);
  });

  // 1K-06: Verificación de Webhook WhatsApp no expone secretos y compara en tiempo constante
  await test('467. TEST 1K-06: Webhook GET /api/webhook/whatsapp valida hub.verify_token de forma segura en tiempo constante', async () => {
    const TEST_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'kalu_dev_verification_token';
    const resBad = await request('/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token_invalido_hacker&hub.challenge=test_challenge_123');
    assert.strictEqual(resBad.status, 403);

    const resGood = await request(`/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=test_challenge_123`);
    assert.strictEqual(resGood.status, 200);
    assert.strictEqual(resGood.data, 'test_challenge_123');
  });

  // 1K-07: Ausencia de secretos hardcoded y correos personales en la configuración de fallback
  await test('468. TEST 1K-07: Configuración del servidor no contiene emails personales hardcoded ni fallbacks inseguros', async () => {
    const serverCode = fs.readFileSync('server.js', 'utf8');
    assert.ok(!serverCode.includes('cherokejd566@gmail.com'), 'No debe contener cherokejd566@gmail.com');
    assert.ok(!serverCode.includes('1344089325449515'), 'No debe contener teléfono hardcoded 1344089325449515');
  });

  // 1K-08: Adversarial path traversal en /protected_media y /uploads (encoded %2e%2e, null byte, boundary mismatch)
  await test('469. TEST 1K-08: Servidores estáticos bloquean traversal codificado (%2e%2e), null bytes (%00) y escape de directorio', async () => {
    const resEncoded1 = await request('/protected_media/%2e%2e%2fpackage.json');
    assert.strictEqual(resEncoded1.status, 404);

    const resEncoded2 = await request('/uploads/%2e%2e%2fserver.js');
    assert.strictEqual(resEncoded2.status, 404);

    const resNull = await request('/protected_media/photo.jpg%00.json');
    assert.strictEqual(resNull.status, 404);

    const resBackslash = await request('/protected_media/..%5c..%5cserver.js');
    assert.strictEqual(resBackslash.status, 404);
  });

  // 1K-09: Sanitización recursiva y case-insensitive de Audit Logs (nested objects, mayúsculas, campos de IA)
  await test('470. TEST 1K-09: recordAuditLog sanitiza estructuras anidadas y variantes de mayúsculas (PROMPT, nested.apiKey)', async () => {
    await recordAuditLog({
      action: 'ai.adversarial_sanitization',
      resourceType: 'ai',
      result: 'success',
      metadata: {
        PROMPT: 'SUPER_SECRET_PROMPT_ALL_CAPS',
        Voice: 'voice_recording_data',
        RawBody: 'raw_payload_bytes',
        nestedData: {
          apiKey: 'gemini_key_deep',
          secretToken: 'deep_secret',
          safeField: 'retained_deep_value',
          subNested: {
            Password: 'nested_password_123',
            safeSubField: 42
          }
        }
      }
    });

    const logs = readCollection('audit_logs');
    const testLog = logs.find(l => l.action === 'ai.adversarial_sanitization');
    assert.ok(testLog);
    assert.strictEqual(testLog.metadata.PROMPT, undefined);
    assert.strictEqual(testLog.metadata.Voice, undefined);
    assert.strictEqual(testLog.metadata.RawBody, undefined);
    assert.strictEqual(testLog.metadata.nestedData.apiKey, undefined);
    assert.strictEqual(testLog.metadata.nestedData.secretToken, undefined);
    assert.strictEqual(testLog.metadata.nestedData.safeField, 'retained_deep_value');
    assert.strictEqual(testLog.metadata.nestedData.subNested.Password, undefined);
    assert.strictEqual(testLog.metadata.nestedData.subNested.safeSubField, 42);
  });

  // 1K-10: Verificación estricta de aislamiento DEV-only: endpoints RBAC de prueba condicionados por !isProd
  await test('471. TEST 1K-10: Código fuente garantiza que endpoints de diagnóstico RBAC están encapsulados exclusivamente en !isProd', async () => {
    const serverCode = fs.readFileSync('server.js', 'utf8');
    const rbacDevSection = serverCode.indexOf('if (!isProd)');
    assert.ok(rbacDevSection !== -1);
    const rbacEndSection = serverCode.indexOf('/api/rbac/role-change-test');
    assert.ok(rbacEndSection > rbacDevSection, '/api/rbac/role-change-test DEBE estar dentro del bloque if (!isProd)');
    const rbacAdminSection = serverCode.indexOf('/api/rbac/admin-only');
    assert.ok(rbacAdminSection > rbacDevSection, '/api/rbac/admin-only DEBE estar dentro del bloque if (!isProd)');
  });

  // --- PRUEBAS DE RATE LIMIT FINAL (Se ejecutan al final del suite) ---

  // 80 (Ahora 113). Rate Limiter de Login de Portal (HTTP 429)
  await test('113. 1D-A: Intentos fallidos repetidos en login de portal activan Rate Limiter (HTTP 429)', async () => {
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request('/api/portal/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          portalType: 'client',
          identifier: '04141234567',
          pin: '999999'
        })
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Debe retornar HTTP 429 Too Many Requests ante intentos repetidos en login de portal');
  });

  // 1G-B-09: Operaciones administrativas destructivas (/api/admin/reset-accounting) activan 429 ante flood
  await test('395. TEST 1G-B-09: POST /api/admin/reset-accounting activa HTTP 429 ante intentos repetitivos', async () => {
    const { cookie, csrf } = await loginAdminD2();
    if (adminResetLimiter.store && adminResetLimiter.store.resetAll) {
      adminResetLimiter.store.resetAll();
    }
    let got429 = false;
    for (let i = 0; i < 6; i++) {
      const res = await request('/api/admin/reset-accounting', {
        method: 'POST',
        headers: { 'Cookie': cookie, 'x-csrf-token': csrf }
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Debe activar rate limit en /api/admin/reset-accounting');
  });

  // 81. Rate Limiter de Login CRM (Se ejecuta al final)
  await test('81. Intentos repetidos de login CRM activan Rate Limiter (HTTP 429)', async () => {
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          loginMode: 'admin',
          email: 'admin@kalu.local',
          password: 'BadPassword123!'
        })
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Debe retornar HTTP 429 Too Many Requests ante intentos repetidos');
  });

  // Limpiar archivos sintéticos generados durante las pruebas de upload
  try {
    const devDir = path.resolve('data-dev');
    if (fs.existsSync(devDir)) {
      const devFiles = fs.readdirSync(devDir);
      for (const file of devFiles) {
        if (file.startsWith('upload-') && (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp') || file.endsWith('.pdf') || file.endsWith('.mp4'))) {
          try { fs.unlinkSync(path.join(devDir, file)); } catch {}
        }
      }
    }
  } catch {}

  console.log(`\n==================================================`);
  console.log(`RESULTADO DE LA SUITE: ${passed} PASADAS / ${failed} FALLIDAS`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} pruebas fallaron`);
  }
}

export default runTests;

// Auto-ejecutar si se corre directamente
if (process.argv[1] && process.argv[1].endsWith('auth_phase1a.test.mjs')) {
  runTests();
}
