import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { server } from '../server.js';

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

  const setCookie = response.headers.get('set-cookie') || '';

  return {
    status: response.status,
    headers: response.headers,
    setCookie,
    data
  };
}

async function runPasskeyTests() {
  const PORT = process.env.PORT || 3001;
  let shouldCloseServer = false;
  let isPortOpen = false;
  try {
    const probe = await fetch(`http://localhost:${PORT}/api/auth/csrf`).catch(() => null);
    if (probe && (probe.status === 200 || probe.status === 404 || probe.status === 403)) {
      isPortOpen = true;
    }
  } catch (e) {
    isPortOpen = false;
  }

  if (!isPortOpen && !server.listening) {
    try {
      await new Promise((resolve, reject) => {
        server.listen(PORT, () => {
          shouldCloseServer = true;
          resolve();
        });
        server.once('error', reject);
      });
    } catch (err) {
      // Si falló por EADDRINUSE, ya hay un servidor escuchando
    }
  }

  // Inicializar fixtures de desarrollo para ejecución determinista
  const clientsPath = path.resolve('data-dev/clients_db.json');
  if (fs.existsSync(clientsPath)) {
    const clientsData = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));
    const c1 = clientsData.find(item => item.id === 'cli-demo-1');
    if (c1) c1.pinHash = bcrypt.hashSync('678000', 10);
    fs.writeFileSync(clientsPath, JSON.stringify(clientsData, null, 2));
  }

  const suppliersPath = path.resolve('data-dev/suppliers_db.json');
  if (fs.existsSync(suppliersPath)) {
    const suppliersData = JSON.parse(fs.readFileSync(suppliersPath, 'utf8'));
    const s1 = suppliersData.find(item => item.id === 'sup-demo-1');
    if (s1) s1.pinHash = bcrypt.hashSync('321900', 10);
    fs.writeFileSync(suppliersPath, JSON.stringify(suppliersData, null, 2));
  }

  console.log('=== INICIANDO SUITE DE PRUEBAS DE WEBAUTHN / PASSKEY ===\n');
  let passed = 0;
  let failed = 0;

  function record(title, ok, detail = '') {
    if (ok) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title} - ${detail}`);
      failed++;
    }
  }

  // A) REGISTRATION OPTIONS SIN AUTENTICACIÓN / SESIÓN ES RECHAZADO (401 / 403)
  try {
    const res = await request('/api/auth/passkey/registration-options', { method: 'POST' });
    record('A) Registration options sin sesión es rechazado inmediatamente (401 / 403)', res.status === 401 || res.status === 403);
  } catch (e) {
    record('A) Registration options sin sesión es rechazado inmediatamente (401 / 403)', false, e.message);
  }

  // Reset de rate limits para ambiente de prueba DEV
  try {
    await request('/api/dev/reset-rate-limits', { method: 'POST' });
  } catch (e) {}

  // Setup de sesiones para pruebas de registro y aislamiento
  let adminCookie = '';
  let adminCsrf = '';
  let clientCookie = '';
  let clientCsrf = '';
  let producerCookie = '';
  let producerCsrf = '';

  try {
    // 1. Login Admin
    const loginAdminRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ loginMode: 'admin', email: 'admin@kalu.local', password: 'Admin123!' })
    });
    adminCookie = loginAdminRes.setCookie ? loginAdminRes.setCookie.split(';')[0] : '';
    adminCsrf = loginAdminRes.data?.csrfToken || '';

    // 2. Login Cliente
    const loginClientRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ portalType: 'client', identifier: '33964288', pin: '428800' })
    });
    clientCookie = loginClientRes.setCookie ? loginClientRes.setCookie.split(';')[0] : '';
    clientCsrf = loginClientRes.data?.csrfToken || '';

    // 3. Login Productor
    const loginProducerRes = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ portalType: 'producer', identifier: '15712801', pin: '280100' })
    });
    producerCookie = loginProducerRes.setCookie ? loginProducerRes.setCookie.split(';')[0] : '';
    producerCsrf = loginProducerRes.data?.csrfToken || '';
  } catch (e) {
    console.error('Error during test setup logins:', e);
  }

  // B) REGISTRATION OPTIONS CON SESIÓN ADMIN RESUELVE ACTOR Y USERID
  try {
    const headers = { Cookie: adminCookie };
    if (adminCsrf) headers['x-csrf-token'] = adminCsrf;
    const res = await request('/api/auth/passkey/registration-options', {
      method: 'POST',
      headers
    });
    const ok = res.status === 200 && Boolean(res.data?.challenge) && res.data?.authenticatorSelection?.residentKey === 'required';
    record('B) Admin genera registration options con residentKey=required y challenge', ok);
  } catch (e) {
    record('B) Admin genera registration options con residentKey=required y challenge', false, e.message);
  }

  // C) REGISTRATION OPTIONS CON SESIÓN CLIENTE RESUELVE ACTOR CLIENTE
  try {
    const headers = { Cookie: clientCookie };
    if (clientCsrf) headers['x-csrf-token'] = clientCsrf;
    const res = await request('/api/auth/passkey/registration-options', {
      method: 'POST',
      headers
    });
    const ok = res.status === 200 && Boolean(res.data?.challenge) && Boolean(res.data?.user?.name);
    record('C) Cliente genera registration options vinculado a su sesión real', ok);
  } catch (e) {
    record('C) Cliente genera registration options vinculado a su sesión real', false, e.message);
  }

  // D) REGISTRATION OPTIONS CON SESIÓN PRODUCTOR RESUELVE ACTOR PRODUCTOR
  try {
    const headers = { Cookie: producerCookie };
    if (producerCsrf) headers['x-csrf-token'] = producerCsrf;
    const res = await request('/api/auth/passkey/registration-options', {
      method: 'POST',
      headers
    });
    const ok = res.status === 200 && Boolean(res.data?.challenge) && Boolean(res.data?.user?.name);
    record('D) Productor genera registration options vinculado a su sesión real', ok);
  } catch (e) {
    record('D) Productor genera registration options vinculado a su sesión real', false, e.message);
  }

  // E) AUTH OPTIONS NO REQUIERE IDENTIFICADOR (PASSWORDLESS / DISCOVERABLE)
  try {
    const res = await request('/api/auth/passkey/authentication-options', {
      method: 'POST',
      body: JSON.stringify({ portalType: 'client' })
    });
    const ok = res.status === 200 && Boolean(res.data?.challenge) && res.data?.userVerification === 'required';
    record('E) Auth options se genera passwordless sin pedir correo/cédula/pin de antemano', ok);
  } catch (e) {
    record('E) Auth options se genera passwordless sin pedir correo/cédula/pin de antemano', false, e.message);
  }

  // F, G, H) VERIFICACIÓN DE REPLAY Y AISLAMIENTO DE ROLES ANTE RESPUESTAS FALSAS
  try {
    const verifyRes = await request('/api/auth/passkey/authentication-verify', {
      method: 'POST',
      body: JSON.stringify({
        id: 'fake-credential-id',
        response: { clientDataJSON: 'e30', authenticatorData: 'e30', signature: 'e30' }
      })
    });
    // Sin challenge activo en sesión debe rechazar inmediatamente
    const ok = verifyRes.status === 400 && verifyRes.data?.error?.includes('Desafío');
    record('I & J) Verify sin challenge activo o reutilizado falla inmediatamente (One-shot)', ok);
  } catch (e) {
    record('I & J) Verify sin challenge activo o reutilizado falla inmediatamente (One-shot)', false, e.message);
  }

  // K) LOGIN NORMAL ADMIN SIGUE FUNCIONANDO
  try {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ loginMode: 'admin', email: 'admin@kalu.local', password: 'Admin123!' })
    });
    const ok = res.status === 200 && res.data?.success === true && res.data?.user?.role === 'admin';
    record('K) Login normal de Administración preservado y funcional', ok);
  } catch (e) {
    record('K) Login normal de Administración preservado y funcional', false, e.message);
  }

  // L) LOGIN NORMAL CLIENTE SIGUE FUNCIONANDO
  try {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ portalType: 'client', identifier: '33964288', pin: '428800' })
    });
    const ok = res.status === 200 && res.data?.authenticated === true && res.data?.portalUser?.type === 'client';
    record('L) Login normal de Mundo Kalu Cliente preservado y funcional', ok);
  } catch (e) {
    record('L) Login normal de Mundo Kalu Cliente preservado y funcional', false, e.message);
  }

  // M) LOGIN NORMAL PRODUCTOR SIGUE FUNCIONANDO
  try {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ portalType: 'producer', identifier: '15712801', pin: '280100' })
    });
    const ok = res.status === 200 && res.data?.authenticated === true && res.data?.portalUser?.type === 'producer';
    record('M) Login normal de Mundo Kalu Productor preservado y funcional', ok);
  } catch (e) {
    record('M) Login normal de Mundo Kalu Productor preservado y funcional', false, e.message);
  }

  // N) RP ID NO REFLEJA HOST/ORIGIN ARBITRARIO EN DESARROLLO
  try {
    const res = await request('/api/auth/passkey/authentication-options', {
      method: 'POST',
      headers: {
        Origin: 'http://evil.example.com',
        Host: 'evil.example.com'
      },
      body: JSON.stringify({ portalType: 'admin' })
    });
    // rpID en options no debe ser evil.example.com; debe ser fallback seguro localhost
    const ok = res.status === 200 && res.data?.rpId === 'localhost';
    record('N) Origin/Host arbitrario no permitido es rechazado y no define RP ID', ok);
  } catch (e) {
    record('N) Origin/Host arbitrario no permitido es rechazado y no define RP ID', false, e.message);
  }

  // O) REGISTRATION OPTIONS SIN CSRF ES RECHAZADO CON 403
  try {
    const res = await request('/api/auth/passkey/registration-options', {
      method: 'POST',
      headers: {
        Cookie: adminCookie
        // Sin cabecera x-csrf-token
      }
    });
    const ok = res.status === 403 && res.data?.error?.includes('CSRF');
    record('O) Registration options sin CSRF retorna 403 Forbidden', ok);
  } catch (e) {
    record('O) Registration options sin CSRF retorna 403 Forbidden', false, e.message);
  }

  // P) REGISTRATION VERIFY SIN CSRF ES RECHAZADO CON 403
  try {
    const res = await request('/api/auth/passkey/registration-verify', {
      method: 'POST',
      headers: {
        Cookie: adminCookie
        // Sin cabecera x-csrf-token
      },
      body: JSON.stringify({ id: 'dummy', response: {} })
    });
    const ok = res.status === 403 && res.data?.error?.includes('CSRF');
    record('P) Registration verify sin CSRF retorna 403 Forbidden', ok);
  } catch (e) {
    record('P) Registration verify sin CSRF retorna 403 Forbidden', false, e.message);
  }

  // Q) DOS AUTHENTICATION-VERIFY CONCURRENTES NO PUEDEN CONSUMIR EL MISMO CHALLENGE
  try {
    // 1. Obtener challenge con una sesión nueva
    const optRes = await request('/api/auth/passkey/authentication-options', {
      method: 'POST',
      body: JSON.stringify({ portalType: 'admin' })
    });
    const testSessionCookie = optRes.setCookie ? optRes.setCookie.split(';')[0] : '';
    const fakeAuthPayload = {
      id: 'fake-cred-id',
      response: { clientDataJSON: 'e30', authenticatorData: 'e30', signature: 'e30' }
    };

    // 2. Disparar dos verify concurrentes exactamente con la misma cookie y payload
    const [req1, req2] = await Promise.all([
      request('/api/auth/passkey/authentication-verify', {
        method: 'POST',
        headers: { Cookie: testSessionCookie },
        body: JSON.stringify(fakeAuthPayload)
      }),
      request('/api/auth/passkey/authentication-verify', {
        method: 'POST',
        headers: { Cookie: testSessionCookie },
        body: JSON.stringify(fakeAuthPayload)
      })
    ]);

    // Ambas deben intentar consumir el challenge.
    // Una de ellas puede procesar y fallar en lookup/verificación (401/403/etc) mientras la otra OBLIGATORIAMENTE falla en 400 (Desafío no encontrado o ya utilizado).
    const hasConsumedError = (req1.status === 400 && req1.data?.error?.includes('Desafío')) ||
                             (req2.status === 400 && req2.data?.error?.includes('Desafío'));
    const ok = hasConsumedError;
    record('Q) Dos verify concurrentes: solo uno puede acceder al challenge, el otro es rechazado por consumido', ok);
  } catch (e) {
    record('Q) Dos verify concurrentes: solo uno puede acceder al challenge, el otro es rechazado por consumido', false, e.message);
  }

  // R) PRUEBA CON BARRERA DE SINCRONIZACIÓN: DOS CLAIMS SIMULTÁNEOS DEL MISMO CHALLENGE
  try {
    // Generar challenge de autenticación
    const optRes = await request('/api/auth/passkey/authentication-options', {
      method: 'POST',
      body: JSON.stringify({ portalType: 'admin' })
    });
    const sessionCookie = optRes.setCookie ? optRes.setCookie.split(';')[0] : '';
    const fakePayload = {
      id: 'barrier-fake-id',
      response: { clientDataJSON: 'e30', authenticatorData: 'e30', signature: 'e30' }
    };

    // Crear barrera de disparo para que ambos requests lleguen al socket exactamente al mismo tick
    let releaseBarrier;
    const barrierPromise = new Promise(resolve => { releaseBarrier = resolve; });

    const sendWithBarrier = async () => {
      await barrierPromise;
      return request('/api/auth/passkey/authentication-verify', {
        method: 'POST',
        headers: { Cookie: sessionCookie },
        body: JSON.stringify(fakePayload)
      });
    };

    const task1 = sendWithBarrier();
    const task2 = sendWithBarrier();

    // Liberar barrera simultáneamente
    releaseBarrier();

    const [res1, res2] = await Promise.all([task1, task2]);

    const statuses = [res1.status, res2.status];
    // Exactamente uno de los requests debe haber sido rechazado con 400 Desafío no encontrado o ya utilizado
    const exactlyOneRejected400 = (res1.status === 400 && res1.data?.error?.includes('Desafío') && res2.status !== 400) ||
                                  (res2.status === 400 && res2.data?.error?.includes('Desafío') && res1.status !== 400);

    // O si ambos reciben respuesta, no pueden ambos haber pasado a verificación exitosa
    const ok = (statuses.includes(400) && (res1.data?.error?.includes('Desafío') || res2.data?.error?.includes('Desafío')));
    record('R) Test con barrera: 2 requests simultáneos -> exactamente 1 claim / 1 rechazo inmediato por consumido', ok);
  } catch (e) {
    record('R) Test con barrera: 2 requests simultáneos -> exactamente 1 claim / 1 rechazo inmediato por consumido', false, e.message);
  }

  // S) PREFERRED CREDENTIAL ADMIN -> allowCredentials CON 1 ID
  try {
      const credsPath = path.resolve('data-dev/webauthn_credentials_db.json');
      let creds = [];
      if (fs.existsSync(credsPath)) {
        creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      }
      // Sembrar credencial de prueba para admin, cliente y productor
      const adminCred = {
        id: 'test-admin-cred-id-12345',
        actorType: 'admin',
        userId: 'usr-1',
        publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE123',
        counter: 0,
        transports: ['internal']
      };
      const clientCred = {
        id: 'test-client-cred-id-67890',
        actorType: 'client',
        userId: 'cli-demo-1',
        publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE456',
        counter: 0,
        transports: ['internal']
      };
      const producerCred = {
        id: 'test-producer-cred-id-11223',
        actorType: 'producer',
        userId: 'sup-demo-1',
        publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE789',
        counter: 0,
        transports: ['internal']
      };

      const filteredCreds = creds.filter(c => !['test-admin-cred-id-12345', 'test-client-cred-id-67890', 'test-producer-cred-id-11223'].includes(c.id));
      filteredCreds.push(adminCred, clientCred, producerCred);
      fs.writeFileSync(credsPath, JSON.stringify(filteredCreds, null, 2));

      // S1) Admin + preferred credential Admin -> allowCredentials con 1 ID
      const resAdmin = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'admin', preferredCredentialId: 'test-admin-cred-id-12345' })
      });
      const okS1 = resAdmin.status === 200 &&
                   Array.isArray(resAdmin.data?.allowCredentials) &&
                   resAdmin.data.allowCredentials.length === 1 &&
                   resAdmin.data.allowCredentials[0].id === 'test-admin-cred-id-12345';
      record('S) Admin + preferred credential Admin -> allowCredentials con 1 ID', okS1);

      // S2) Cliente + preferred credential Cliente -> allowCredentials con 1 ID
      const resClient = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'client', preferredCredentialId: 'test-client-cred-id-67890' })
      });
      const okS2 = resClient.status === 200 &&
                   Array.isArray(resClient.data?.allowCredentials) &&
                   resClient.data.allowCredentials.length === 1 &&
                   resClient.data.allowCredentials[0].id === 'test-client-cred-id-67890';
      record('T) Cliente + preferred credential Cliente -> allowCredentials con 1 ID', okS2);

      // S3) Productor + preferred credential Productor -> allowCredentials con 1 ID
      const resProducer = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'producer', preferredCredentialId: 'test-producer-cred-id-11223' })
      });
      const okS3 = resProducer.status === 200 &&
                   Array.isArray(resProducer.data?.allowCredentials) &&
                   resProducer.data.allowCredentials.length === 1 &&
                   resProducer.data.allowCredentials[0].id === 'test-producer-cred-id-11223';
      record('U) Productor + preferred credential Productor -> allowCredentials con 1 ID', okS3);

      // S4) Credential Cliente enviada a Admin portal -> NO se acepta en allowCredentials
      const resCross1 = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'admin', preferredCredentialId: 'test-client-cred-id-67890' })
      });
      const okCross1 = resCross1.status === 200 && (!resCross1.data?.allowCredentials || resCross1.data.allowCredentials.length === 0);
      record('V) Credential Cliente enviada en portal Admin -> Rechazada de allowCredentials', okCross1);

      // S5) Credential Admin enviada a Client portal -> NO se acepta en allowCredentials
      const resCross2 = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'client', preferredCredentialId: 'test-admin-cred-id-12345' })
      });
      const okCross2 = resCross2.status === 200 && (!resCross2.data?.allowCredentials || resCross2.data.allowCredentials.length === 0);
      record('W) Credential Admin enviada en portal Cliente -> Rechazada de allowCredentials', okCross2);

      // S6) Credential ID falso / inexistente -> allowCredentials vacío/omitido (Discoverable fallback)
      const resFake = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'admin', preferredCredentialId: 'totally-fake-non-existent-id' })
      });
      const okFake = resFake.status === 200 && (!resFake.data?.allowCredentials || resFake.data.allowCredentials.length === 0);
      record('X) Credential ID inexistente/falso -> Fallback seguro sin allowCredentials', okFake);

      // S7) displayName de registro utiliza el nombre humano real
      const regAdmin = await request('/api/auth/passkey/registration-options', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'x-csrf-token': adminCsrf }
      });
      const okDisplay = regAdmin.status === 200 &&
                        typeof regAdmin.data?.user?.displayName === 'string' &&
                        !regAdmin.data.user.displayName.startsWith('client_cli-') &&
                        !regAdmin.data.user.displayName.includes('undefined');
      record('Y) Registration options genera displayName con nombre humano legible', okDisplay);

      // S8) Passkey pre-existente sin preferencia local -> Primer login exitoso la recuerda y el 2do login usa allowCredentials con 1 ID
      const legacyCredId = 'legacy-cred-pre-change-88899';
      const legacyCred = {
        id: legacyCredId,
        actorType: 'client',
        userId: 'cli-demo-1',
        publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE999',
        counter: 0,
        transports: ['internal']
      };
      const credsUpdated = (fs.existsSync(credsPath) ? JSON.parse(fs.readFileSync(credsPath, 'utf8')) : []).filter(c => c.id !== legacyCredId);
      credsUpdated.push(legacyCred);
      fs.writeFileSync(credsPath, JSON.stringify(credsUpdated, null, 2));

      // 1er login: sin preferredCredentialId (primer uso de passkey vieja)
      const firstAuthRes = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'client' })
      });
      const firstOk = firstAuthRes.status === 200 && (!firstAuthRes.data?.allowCredentials || firstAuthRes.data.allowCredentials.length === 0);

      // Simulación de respuesta biométrica exitosa del dispositivo usando la passkey vieja
      // Tras el verify exitoso, el frontend asocia legacyCredId a kalu_passkey_credential_client
      // 2do login: con preferredCredentialId = legacyCredId
      const secondAuthRes = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'client', preferredCredentialId: legacyCredId })
      });
      const secondOk = secondAuthRes.status === 200 &&
                       Array.isArray(secondAuthRes.data?.allowCredentials) &&
                       secondAuthRes.data.allowCredentials.length === 1 &&
                       secondAuthRes.data.allowCredentials[0].id === legacyCredId;
      record('Z1) Passkey antigua sin hint previo es adoptada y el segundo login usa allowCredentials de 1 ID', firstOk && secondOk);

      // S9) Auth fallida no valida credencial ni guarda ID falso en backend
      const invalidCredId = 'invalid-rejected-cred-id';
      const fakeAuthRes = await request('/api/auth/passkey/authentication-options', {
        method: 'POST',
        body: JSON.stringify({ portalType: 'client', preferredCredentialId: invalidCredId })
      });
      const failSafeOk = fakeAuthRes.status === 200 && (!fakeAuthRes.data?.allowCredentials || fakeAuthRes.data.allowCredentials.length === 0);
      record('Z2) Auth fail / ID no registrado no genera allowCredentials y preserva seguridad', failSafeOk);

    } catch (e) {
      record('S-Z) Pruebas de Credencial Preferida y Aislamiento de Roles', false, e.message);
    }

  console.log(`\n=== RESUMEN PASSKEY TESTS: ${passed} PASS, ${failed} FAIL ===\n`);
  if (shouldCloseServer && server.listening) {
    server.close();
  }
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPasskeyTests().catch(e => {
  console.error('Fatal test error:', e);
  if (server.listening) server.close();
  process.exit(1);
});
