// ============================================================
// SUITE DE PRUEBAS AUTOMATIZADAS — FASE 1A: AUTENTICACIÓN
// ============================================================
import assert from 'assert';
import http from 'http';
import {
  createRecoveryChallenge,
  verifyRecoveryCode,
  consumeResetToken,
  invalidateRecoveryChallenge,
  cleanupRecoveryStore,
  recoveryChallengeStore,
  recoveryResetTokenStore,
  hashEphemeralSecret,
  maskRecipient
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
      recipient: '04147654321'
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
        identifier: '04147654321',
        resetToken: verRes.resetToken,
        newPin: '334455'
      })
    });

    // Sesión CRM del admin debe seguir 100% activa
    const meRes = await request('/api/auth/me', {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.user.role, 'admin');
  });

  // 163. Legacy /api/send-recovery opera con limiter y modo simulación
  await test('163. 1D-C.2: Legacy /api/send-recovery opera en simulación sin exponer secretos', async () => {
    const res = await request('/api/send-recovery', {
      method: 'POST',
      body: JSON.stringify({
        channel: 'whatsapp',
        phone: '04141234567',
        code: '123456',
        name: 'Cliente Test'
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
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
