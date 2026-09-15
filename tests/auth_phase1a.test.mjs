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

  // 80. Rate Limiter de Login de Portal (HTTP 429)
  await test('80. 1D-A: Intentos fallidos repetidos en login de portal activan Rate Limiter (HTTP 429)', async () => {
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
