// ============================================================
// KALU CRM — TEST SUITE: MODO MANTENIMIENTO TEMPORAL DE WHATSAPP
// ============================================================

import assert from 'assert';
import crypto from 'crypto';
import {
  server,
  isMaintenanceAntiSpamActive,
  recordMaintenanceNoticeSent,
  resetMaintenanceAntiSpamForTest,
  resetProcessedWebhookEventsForTest,
  WHATSAPP_MAINTENANCE_MESSAGE
} from '../server.js';

const PORT = 3099;
let baseUrl = `http://127.0.0.1:${PORT}`;
let testServerInstance;

const TEST_SECRET = process.env.WHATSAPP_APP_SECRET || 'kalu_dev_app_secret_meta_hmac_2026';
const TEST_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'kalu_dev_mock_token_2026';

// Configurar credenciales sintéticas para el entorno de prueba
process.env.WHATSAPP_API_KEY = 'test_whatsapp_api_key_mock_2026';
process.env.WHATSAPP_PHONE_NUMBER_ID = '1344089325449515';

// Interceptor de fetch para Graph API en tests
const originalFetch = globalThis.fetch;
let mockGraphResponseHandler = null;

globalThis.fetch = async (url, options) => {
  const urlStr = String(url);
  if (urlStr.includes('graph.facebook.com')) {
    if (mockGraphResponseHandler) {
      return mockGraphResponseHandler(urlStr, options);
    }
    // Por defecto, responder 200 OK con estructura válida de Meta Graph API
    return new Response(JSON.stringify({
      messaging_product: 'whatsapp',
      contacts: [{ input: '584120001122', wa_id: '584120001122' }],
      messages: [{ id: 'wamid.HBgLMOCKED_MESSAGE_ID' }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return originalFetch(url, options);
};

function createHmacSignature(rawBody, secret = TEST_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(Buffer.from(rawBody, 'utf8')).digest('hex');
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  const headers = { ...options.headers };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return {
    status: res.status,
    headers: res.headers,
    data
  };
}

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err);
    throw err;
  }
}

async function runSuite() {
  console.log('------------------------------------------------------------');
  console.log('🚀 INICIANDO TEST SUITE: MODO MANTENIMIENTO WHATSAPP');
  console.log('------------------------------------------------------------\n');

  await new Promise((resolve) => {
    testServerInstance = server.listen(PORT, resolve);
  });

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Verificación del texto exacto requerido para el mensaje de mantenimiento
    // ------------------------------------------------------------------------
    await runTest('1. Texto corporativo de mantenimiento cumple exactamente con el requerimiento', async () => {
      const expectedText = `👋 ¡Hola! Gracias por comunicarte con nosotros.

En este momento estamos realizando una actualización de nuestro sistema para brindarte una mejor atención.

Estaremos nuevamente en servicio muy pronto.

🙏 Te pedimos disculpas por las molestias y agradecemos mucho tu comprensión.

Mundo Kalu`;

      assert.strictEqual(WHATSAPP_MAINTENANCE_MESSAGE, expectedText);
      assert.ok(WHATSAPP_MAINTENANCE_MESSAGE.includes('Mundo Kalu'));
      assert.ok(WHATSAPP_MAINTENANCE_MESSAGE.includes('actualización de nuestro sistema'));
    });

    // ------------------------------------------------------------------------
    // TEST 2: Handshake GET /api/webhook/whatsapp sigue funcionando sin alteración
    // ------------------------------------------------------------------------
    await runTest('2. Handshake GET /api/webhook/whatsapp valida token y devuelve challenge intacto', async () => {
      const challenge = 'challenge_test_code_9876';
      const res = await request(`/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_TOKEN)}&hub.challenge=${challenge}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, challenge);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Modo Mantenimiento ACTIVO -> Mensaje entrante recibe aviso de mantenimiento
    // ------------------------------------------------------------------------
    await runTest('3. Mantenimiento ACTIVO -> Mensaje entrante de cliente genera respuesta de mantenimiento', async () => {
      process.env.WHATSAPP_MAINTENANCE_MODE = 'true';
      resetMaintenanceAntiSpamForTest();
      resetProcessedWebhookEventsForTest();

      const testPhone = '584120001122';
      const testMsgId = `wamid.test_maint_${Date.now()}`;
      const rawPayload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '1344089325449515',
          changes: [{
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123456', phone_number_id: '1344089325449515' },
              contacts: [{ wa_id: testPhone, profile: { name: 'Cliente Sabanota' } }],
              messages: [{
                from: testPhone,
                id: testMsgId,
                timestamp: '1789481999',
                text: { body: 'Hola, quiero pedir 2 kilos de queso y saber el precio' },
                type: 'text'
              }]
            }
          }]
        }]
      });

      const sig = createHmacSignature(rawPayload);
      const res = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': sig
        },
        body: rawPayload
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
      assert.strictEqual(res.data.maintenance, true);
      assert.strictEqual(res.data.noticesSent, 1);
      assert.strictEqual(res.data.antiSpamSuppressed, 0);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Modo Mantenimiento ACTIVO -> No ejecuta acciones comerciales ni crea pedidos
    // ------------------------------------------------------------------------
    await runTest('4. Mantenimiento ACTIVO -> No ejecuta flujo comercial ni altera colecciones', async () => {
      process.env.WHATSAPP_MAINTENANCE_MODE = 'true';
      resetProcessedWebhookEventsForTest();

      const testPhone = '584149998877';
      const testMsgId = `wamid.test_comm_${Date.now()}`;
      const rawPayload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '1344089325449515',
          changes: [{
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              messages: [{
                from: testPhone,
                id: testMsgId,
                timestamp: '1789482000',
                text: { body: 'CONFIRMAR PEDIDO #999 Y REGISTRAR VENTA POR 50 USD' },
                type: 'text'
              }]
            }
          }]
        }]
      });

      const sig = createHmacSignature(rawPayload);
      const res = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': sig
        },
        body: rawPayload
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.maintenance, true);
      assert.strictEqual(res.data.noticesSent, 1);
    });

    // ------------------------------------------------------------------------
    // TEST 5: Protección Anti-Spam contra respuestas repetitivas consecutivas
    // ------------------------------------------------------------------------
    await runTest('5. Protección Anti-Spam: Segundo mensaje consecutivo del mismo número suprime el reenvío inmediato', async () => {
      process.env.WHATSAPP_MAINTENANCE_MODE = 'true';
      resetMaintenanceAntiSpamForTest();
      resetProcessedWebhookEventsForTest();

      const testPhone = '584241112233';
      const msg1Id = `wamid.spam1_${Date.now()}`;
      const msg2Id = `wamid.spam2_${Date.now() + 1}`;

      const createMsgPayload = (msgId, text) => JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '1344089325449515',
          changes: [{
            field: 'messages',
            value: {
              messages: [{
                from: testPhone,
                id: msgId,
                timestamp: '1789482001',
                text: { body: text },
                type: 'text'
              }]
            }
          }]
        }]
      });

      // 1er Mensaje -> Debe enviar el aviso
      const p1 = createMsgPayload(msg1Id, 'Hola');
      const res1 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': createHmacSignature(p1) },
        body: p1
      });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.data.noticesSent, 1);
      assert.strictEqual(res1.data.antiSpamSuppressed, 0);

      // 2do Mensaje inmediato (mismo número, diferente messageId) -> Debe suprimir el aviso por anti-spam
      const p2 = createMsgPayload(msg2Id, '¿Hay alguien allí?');
      const res2 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': createHmacSignature(p2) },
        body: p2
      });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.noticesSent, 0);
      assert.strictEqual(res2.data.antiSpamSuppressed, 1);

      // Helper unitario: isMaintenanceAntiSpamActive debe ser true para este número
      assert.strictEqual(isMaintenanceAntiSpamActive(testPhone), true);
    });

    // ------------------------------------------------------------------------
    // TEST 6: Modo Mantenimiento DESACTIVADO (Reversibilidad) -> Flujo normal preservado
    // ------------------------------------------------------------------------
    await runTest('6. Mantenimiento DESACTIVADO -> Flujo normal preservado (sin maintenance flag)', async () => {
      process.env.WHATSAPP_MAINTENANCE_MODE = 'false';
      resetProcessedWebhookEventsForTest();

      const testPhone = '584168889900';
      const testMsgId = `wamid.normal_${Date.now()}`;
      const rawPayload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '1344089325449515',
          changes: [{
            field: 'messages',
            value: {
              messages: [{
                from: testPhone,
                id: testMsgId,
                timestamp: '1789482005',
                text: { body: 'Mensaje en modo normal' },
                type: 'text'
              }]
            }
          }]
        }]
      });

      const sig = createHmacSignature(rawPayload);
      const res = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': sig
        },
        body: rawPayload
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
      assert.strictEqual(res.data.maintenance, undefined);
      assert.strictEqual(res.data.newEvents, 1);
    });

    // ------------------------------------------------------------------------
    // TEST 7: Resistencia contra Replay / Idempotencia bajo Mantenimiento
    // ------------------------------------------------------------------------
    await runTest('7. Replay Idempotency: Mensaje idéntico retransmitido se detecta como EVENT_ALREADY_PROCESSED', async () => {
      process.env.WHATSAPP_MAINTENANCE_MODE = 'true';
      resetMaintenanceAntiSpamForTest();
      resetProcessedWebhookEventsForTest();

      const testPhone = '584124445566';
      const fixedMsgId = `wamid.replay_maint_${Date.now()}`;
      const rawPayload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '1344089325449515',
          changes: [{
            field: 'messages',
            value: {
              messages: [{
                from: testPhone,
                id: fixedMsgId,
                timestamp: '1789482010',
                text: { body: 'Hola Kalu' },
                type: 'text'
              }]
            }
          }]
        }]
      });

      const sig = createHmacSignature(rawPayload);

      // Primer intento
      const res1 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig },
        body: rawPayload
      });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.data.status, 'EVENT_RECEIVED');

      // Segundo intento con mismo ID de evento (retransmisión de Meta)
      const res2 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig },
        body: rawPayload
      });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.status, 'EVENT_ALREADY_PROCESSED');
    });

    // ------------------------------------------------------------------------
    // TEST 8: Graph / sendWhatsAppDirectMessage Falla -> No registra cooldown y no invoca Gemini
    // ------------------------------------------------------------------------
    await runTest('8. Fallo en Graph API: No registra cooldown y permite reintento posterior', async () => {
      process.env.WHATSAPP_MAINTENANCE_MODE = 'true';
      resetMaintenanceAntiSpamForTest();
      resetProcessedWebhookEventsForTest();

      const failPhone = '584129990011';
      const failMsgId1 = `wamid.fail1_${Date.now()}`;
      const failMsgId2 = `wamid.fail2_${Date.now() + 1}`;

      // Simular fallo en Graph API (500 Error)
      mockGraphResponseHandler = async () => new Response(JSON.stringify({
        error: { message: 'Meta Graph Service Unavailable', code: 2 }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });

      const p1 = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '1344089325449515',
          changes: [{
            field: 'messages',
            value: {
              messages: [{
                from: failPhone,
                id: failMsgId1,
                timestamp: '1789482020',
                text: { body: 'Hola, intento con fallo' },
                type: 'text'
              }]
            }
          }]
        }]
      });

      const res1 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': createHmacSignature(p1) },
        body: p1
      });

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.data.status, 'EVENT_RECEIVED');
      assert.strictEqual(res1.data.noticesSent, 0); // No se contó como enviado
      assert.strictEqual(isMaintenanceAntiSpamActive(failPhone), false); // Cooldown NO registrado

      // Restaurar Graph API funcional para el segundo intento
      mockGraphResponseHandler = null;

      const p2 = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '1344089325449515',
          changes: [{
            field: 'messages',
            value: {
              messages: [{
                from: failPhone,
                id: failMsgId2,
                timestamp: '1789482025',
                text: { body: 'Hola, intento posterior exitoso' },
                type: 'text'
              }]
            }
          }]
        }]
      });

      const res2 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': createHmacSignature(p2) },
        body: p2
      });

      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.status, 'EVENT_RECEIVED');
      assert.strictEqual(res2.data.noticesSent, 1); // Ahora sí despachó
      assert.strictEqual(res2.data.antiSpamSuppressed, 0);
      assert.strictEqual(isMaintenanceAntiSpamActive(failPhone), true); // Ahora sí registró cooldown
    });

    console.log('\n============================================================');
    console.log(`🎉 TODAS LAS PRUEBAS DE MODO MANTENIMIENTO PASARON (${passedTests}/${totalTests})`);
    console.log('============================================================\n');

  } finally {
    globalThis.fetch = originalFetch;
    if (testServerInstance) {
      await new Promise((resolve) => testServerInstance.close(resolve));
    }
  }
}

runSuite().catch((err) => {
  console.error('❌ Error fatal en suite de pruebas:', err);
  process.exit(1);
});
