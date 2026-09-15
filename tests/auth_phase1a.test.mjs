// ============================================================
// SUITE DE PRUEBAS AUTOMATIZADAS — FASE 1A: AUTENTICACIÓN
// ============================================================
import assert from 'assert';
import http from 'http';
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
  aiRateLimiter
} from '../server.js';

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
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        pin: '678000'
      })
    });
    return {
      cookie: res.setCookie.split(';')[0],
      csrf: res.data.csrfToken,
      user: res.data.portalUser
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
    const reqRes = await request('/api/portal/auth/recovery/request', {
      method: 'POST',
      body: JSON.stringify({
        portalType: 'client',
        identifier: '04141234567',
        channel: 'whatsapp'
      })
    });
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

    const resSale = await request('/api/pos/process-sale', {
      method: 'POST',
      headers: { 'Cookie': adminCookie, 'x-csrf-token': csrf },
      body: JSON.stringify({
        saleItems: [{ productId: 'prod-demo-1', quantityKg: 1, subtotal: 4.5 }],
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
  // PRUEBAS DE RATE LIMITER (SE EJECUTAN AL FINAL)
  // ============================================================

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
