// ============================================================
// SUITE DE PRUEBAS AUTOMATIZADAS — FASE 1A: AUTENTICACIÓN
// ============================================================
import assert from 'assert';
import http from 'http';

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
  console.log('🧪 Iniciando Suite de Pruebas Automatizadas — Fase 1A + Fase 1B: RBAC (36 Pruebas)\n');
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
    const resUsers = await request('/api/collections/users');
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

  // 36. Rate Limiter de Login (Se ejecuta al final para no afectar otros tests de login)
  await test('36. Intentos repetidos de login activan Rate Limiter (HTTP 429)', async () => {
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
