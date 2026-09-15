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
  console.log('🧪 Iniciando Suite de Pruebas Automatizadas — Fase 1A (20 Pruebas)\n');
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

  // 16. Logout exitoso
  await test('16. POST /api/auth/logout invalida la sesión en servidor', async () => {
    const resLogout = await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(resLogout.status, 200);
    assert.strictEqual(resLogout.data.success, true);
  });

  // 17. GET /api/auth/me después de logout -> 401
  await test('17. GET /api/auth/me después de logout devuelve 401 Unauthorized', async () => {
    const resMe = await request('/api/auth/me', {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(resMe.status, 401, `Esperado 401 después de logout, recibido ${resMe.status}`);
  });

  // 18. Sanitización de GET /api/collections/users (No expone hashes al cliente)
  await test('18. GET /api/collections/users no expone passwordHash ni pinHash', async () => {
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

  // 19. CSRF Token Endpoint
  await test('19. GET /api/auth/csrf-token emite token CSRF criptográfico', async () => {
    const res = await request('/api/auth/csrf-token');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.csrfToken && res.data.csrfToken.length >= 32, 'CSRF token debe tener al menos 32 caracteres');
  });

  // 20. Rate Limiter de Login
  await test('20. Intentos repetidos de login activan Rate Limiter (HTTP 429)', async () => {
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
