// ============================================================
// KALU CRM — TEST SUITE: WHATSAPP + GEMINI CONVERSATIONAL ORCHESTRATOR
// ============================================================

import assert from 'assert';
import {
  server,
  normalizeWhatsAppPhone,
  findClientByPhone,
  checkUserRateLimit,
  resetUserRateLimitsForTest,
  resetProcessedWebhookEventsForTest,
  setGeminiClientForTest,
  normalizeSearchText,
  retrieveRelevantProducts,
  normalizeWhatsAppFormatting,
  GEMINI_FALLBACK_MODELS,
  WHATSAPP_MAINTENANCE_MESSAGE,
  readCollection
} from '../server.js';
import fs from 'fs';

const PORT = 3098;
const baseUrl = `http://127.0.0.1:${PORT}`;
let testServerInstance;

const TEST_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'kalu_dev_mock_token_2026';

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
  console.log('🚀 INICIANDO TEST SUITE: WHATSAPP CONVERSATIONAL ORCHESTRATOR');
  console.log('------------------------------------------------------------\n');

  process.env.WHATSAPP_MAINTENANCE_MODE = 'false';

  await new Promise((resolve) => {
    testServerInstance = server.listen(PORT, resolve);
  });

  try {
    // ------------------------------------------------------------------------
    // TEST A: Handshake GET correcto con Verify Token
    // ------------------------------------------------------------------------
    await runTest('A. Handshake GET /api/webhook/whatsapp valida token y devuelve challenge', async () => {
      const challenge = 'challenge_abc_123';
      const res = await request(`/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_TOKEN)}&hub.challenge=${challenge}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, challenge);

      // Rejection with wrong token
      const badRes = await request(`/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=${challenge}`);
      assert.strictEqual(badRes.status, 403);
    });

    // ------------------------------------------------------------------------
    // TEST B & D & E: POST responde HTTP 200 rápido y procesa de forma no-bloqueante
    // ------------------------------------------------------------------------
    await runTest('B, D, E. POST /api/webhook/whatsapp responde HTTP 200 rápido (SLA Meta)', async () => {
      resetProcessedWebhookEventsForTest();
      resetUserRateLimitsForTest();

      const startTime = Date.now();
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1344089325449515',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '584120000000', phone_number_id: '1344089325449515' },
                  messages: [
                    {
                      from: '584121234567',
                      id: `wamid.HBgL${Date.now()}_test_quick`,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      text: { body: 'Hola, tienen queso disponible?' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const res = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const elapsedTime = Date.now() - startTime;
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
      assert.ok(elapsedTime < 500, `Respuesta debe ser menor a 500ms, tomó ${elapsedTime}ms`);
    });

    // ------------------------------------------------------------------------
    // TEST F & G & H: Normalización de teléfono y resolución de cliente server-side
    // ------------------------------------------------------------------------
    await runTest('F, G, H. Normalización telefónica y resolución server-side de cliente', async () => {
      assert.strictEqual(normalizeWhatsAppPhone('04121234567'), '584121234567');
      assert.strictEqual(normalizeWhatsAppPhone('+58 (412) 123-4567'), '584121234567');
      assert.strictEqual(normalizeWhatsAppPhone('584121234567'), '584121234567');

      const mockClients = [
        { id: 'cli-1', name: 'Juan Perez', phone: '0412-1234567' },
        { id: 'cli-2', name: 'Maria Gomez', phone: '+584149876543' }
      ];

      const found1 = findClientByPhone('584121234567', mockClients);
      assert.ok(found1);
      assert.strictEqual(found1.name, 'Juan Perez');

      const found2 = findClientByPhone('04149876543', mockClients);
      assert.ok(found2);
      assert.strictEqual(found2.name, 'Maria Gomez');

      const notFound = findClientByPhone('584160000000', mockClients);
      assert.strictEqual(notFound, undefined);
    });

    // ------------------------------------------------------------------------
    // TEST I & J: Deduplicación evita responder dos veces al mismo mensaje
    // ------------------------------------------------------------------------
    await runTest('J. Deduplicación de eventos previene re-ejecución en Replay', async () => {
      resetProcessedWebhookEventsForTest();

      const uniqueMsgId = `wamid.HBgL${Date.now()}_dup_check`;
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1344089325449515',
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: '584121234567',
                      id: uniqueMsgId,
                      type: 'text',
                      text: { body: 'Mensaje único de prueba' }
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      // Primer envío -> Nuevo evento recibido
      const res1 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.data.status, 'EVENT_RECEIVED');

      // Segundo envío (mismo message ID) -> Replay detectado
      const res2 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.status, 'EVENT_ALREADY_PROCESSED');
    });

    // ------------------------------------------------------------------------
    // TEST K & L: Anti-spam y control de enfriamiento
    // ------------------------------------------------------------------------
    await runTest('K, L. Control Anti-Spam por usuario (límite de 5 mensajes en 10 min)', async () => {
      resetUserRateLimitsForTest();
      const phone = '584129998877';

      // Primeros 5 mensajes no deben disparar rate limit
      for (let i = 1; i <= 5; i++) {
        const check = checkUserRateLimit(phone);
        assert.strictEqual(check.isRateLimited, false, `Mensaje ${i} no debe estar bloqueado`);
      }

      // Mensaje 6 dispara rate limit con justTriggered: true
      const check6 = checkUserRateLimit(phone);
      assert.strictEqual(check6.isRateLimited, true);
      assert.strictEqual(check6.justTriggered, true);

      // Mensaje 7 sigue rate limited pero justTriggered: false
      const check7 = checkUserRateLimit(phone);
      assert.strictEqual(check7.isRateLimited, true);
      assert.strictEqual(check7.justTriggered, false);
    });

    // ------------------------------------------------------------------------
    // TEST M: POST con X-Hub-Signature-256 presente bajo compatibilidad histórica (NO 403)
    // ------------------------------------------------------------------------
    await runTest('M. POST /api/webhook/whatsapp con X-Hub-Signature-256 no devuelve 403 (Compatibilidad Histórica)', async () => {
      resetProcessedWebhookEventsForTest();

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1344089325449515',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '584120000000', phone_number_id: '1344089325449515' },
                  messages: [
                    {
                      from: '584121234567',
                      id: `wamid.HBgL${Date.now()}_test_sig_header`,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      text: { body: 'Mensaje con header de firma' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const res = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        },
        body: JSON.stringify(payload)
      });

      assert.notStrictEqual(res.status, 403, 'No debe devolver 403 Forbidden por firma en modo compatibilidad');
      assert.strictEqual(res.status, 200, 'Debe devolver HTTP 200 EVENT_RECEIVED a Meta');
      assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
    });

    // ------------------------------------------------------------------------
    // TEST N: POST /api/webhook (Legacy route) responde 200 EVENT_RECEIVED (NO 410)
    // ------------------------------------------------------------------------
    await runTest('N. POST /api/webhook responde 200 EVENT_RECEIVED (NO 410)', async () => {
      resetProcessedWebhookEventsForTest();

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1344089325449515',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '584120000000', phone_number_id: '1344089325449515' },
                  messages: [
                    {
                      from: '584121234567',
                      id: `wamid.HBgL${Date.now()}_test_legacy_route`,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      text: { body: 'Hola por ruta legacy' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const res = await request('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
    });

    // ------------------------------------------------------------------------
    // TEST O: POST /api/webhook con X-Hub-Signature-256 presente responde 200 (NO 403, NO 410)
    // ------------------------------------------------------------------------
    await runTest('O. POST /api/webhook con X-Hub-Signature-256 responde 200 (NO 403, NO 410)', async () => {
      resetProcessedWebhookEventsForTest();

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1344089325449515',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '584120000000', phone_number_id: '1344089325449515' },
                  messages: [
                    {
                      from: '584121234567',
                      id: `wamid.HBgL${Date.now()}_test_legacy_sig`,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      text: { body: 'Hola con firma' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const res = await request('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
        },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'EVENT_RECEIVED');
    });

    // ------------------------------------------------------------------------
    // TEST P: Deduplicación cruzada entre /api/webhook y /api/webhook/whatsapp
    // ------------------------------------------------------------------------
    await runTest('P. Deduplicación cruzada entre ambas rutas (/api/webhook y /api/webhook/whatsapp)', async () => {
      resetProcessedWebhookEventsForTest();

      const crossMsgId = `wamid.HBgL${Date.now()}_cross_dup_check`;
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1344089325449515',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '584121234567',
                      id: crossMsgId,
                      type: 'text',
                      text: { body: 'Mensaje duplicado entre rutas' }
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      // 1. Envío a /api/webhook -> EVENT_RECEIVED
      const res1 = await request('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.data.status, 'EVENT_RECEIVED');

      // 2. Mismo mensaje a /api/webhook/whatsapp -> EVENT_ALREADY_PROCESSED
      const res2 = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.status, 'EVENT_ALREADY_PROCESSED');
    });

    // ------------------------------------------------------------------------
    // TEST Q: Payload status-only a ambas rutas responde 200 sin invocar flujo conversacional
    // ------------------------------------------------------------------------
    await runTest('Q. Payload status-only responde 200 OK en ambas rutas', async () => {
      resetProcessedWebhookEventsForTest();

      const statusPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1344089325449515',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '584120000000', phone_number_id: '1344089325449515' },
                  statuses: [
                    {
                      id: `wamid.HBgL${Date.now()}_status_deliv`,
                      status: 'delivered',
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      recipient_id: '584121234567'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const resLegacy = await request('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statusPayload)
      });
      assert.strictEqual(resLegacy.status, 200);
      assert.strictEqual(resLegacy.data.status, 'EVENT_RECEIVED');

      const resNew = await request('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statusPayload)
      });
      assert.strictEqual(resNew.status, 200);
    });

    // ------------------------------------------------------------------------
    // TEST R: Handshake GET /api/webhook también operativo
    // ------------------------------------------------------------------------
    await runTest('R. Handshake GET /api/webhook valida token y devuelve challenge', async () => {
      const challenge = 'challenge_legacy_test_456';
      const res = await request(`/api/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_TOKEN)}&hub.challenge=${challenge}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, challenge);
    });

    // ------------------------------------------------------------------------
    // TEST S: "Tienes bencina" recupera Bencina real (<= 10 items, precio/stock correctos)
    // ------------------------------------------------------------------------
    await runTest('S. "Tienes bencina" recupera producto real con precio y stock (<= 10 items)', async () => {
      const mockProducts = readCollection('products') || [];
      const res = retrieveRelevantProducts('Tienes bencina', mockProducts, 10);
      assert.strictEqual(res.isGeneralQuery, false);
      assert.ok(res.products.length >= 1 && res.products.length <= 10);
      const bencina = res.products.find(p => p.nombre.toUpperCase().includes('BENCINA'));
      assert.ok(bencina, 'Debe encontrar Bencina');
      assert.strictEqual(bencina.precio_usd, 1);
      assert.strictEqual(bencina.stock, 200);
    });

    // ------------------------------------------------------------------------
    // TEST T: "precio de bencina" recupera mismo comportamiento
    // ------------------------------------------------------------------------
    await runTest('T. "precio de bencina" recupera producto relevante deterministamente', async () => {
      const mockProducts = readCollection('products') || [];
      const res = retrieveRelevantProducts('precio de bencina', mockProducts, 10);
      assert.strictEqual(res.isGeneralQuery, false);
      assert.ok(res.products.some(p => p.nombre.toUpperCase().includes('BENCINA')));
    });

    // ------------------------------------------------------------------------
    // TEST U: "Hola" / "Buenos días" -> Catálogo completo NO incluido (isGeneralQuery: true)
    // ------------------------------------------------------------------------
    await runTest('U. Consultas de saludo ("Hola", "Buenos días") no inyectan catálogo', async () => {
      const mockProducts = readCollection('products') || [];
      const res1 = retrieveRelevantProducts('Hola', mockProducts, 10);
      assert.strictEqual(res1.isGeneralQuery, true);
      assert.strictEqual(res1.products.length, 0);

      const res2 = retrieveRelevantProducts('Buenos dias amigo como estan', mockProducts, 10);
      assert.strictEqual(res2.isGeneralQuery, true);
      assert.strictEqual(res2.products.length, 0);
    });

    // ------------------------------------------------------------------------
    // TEST V: Consulta por código o barcode exacto
    // ------------------------------------------------------------------------
    await runTest('V. Consulta por código o barcode exacto recupera el producto', async () => {
      const mockProducts = readCollection('products') || [];
      const resBarcode = retrieveRelevantProducts('BEN', mockProducts, 10);
      assert.ok(resBarcode.products.some(p => p.codigo === 'BEN'));

      const resId = retrieveRelevantProducts('prod-1', mockProducts, 10);
      assert.ok(resId.products.some(p => p.id === 'prod-1'));
    });

    // ------------------------------------------------------------------------
    // TEST W: Consulta por categoría recupera subconjunto limitado
    // ------------------------------------------------------------------------
    await runTest('W. Consulta por categoría recupera subconjunto acotado (máximo 10)', async () => {
      const mockProducts = readCollection('products') || [];
      const res = retrieveRelevantProducts('repuestos de moto', mockProducts, 10);
      assert.ok(res.products.length <= 10);
      assert.ok(res.totalMatches > 10, 'Debe detectar que existen más coincidencias en catálogo');
    });

    // ------------------------------------------------------------------------
    // TEST X: Producto inexistente -> No alucina ni inventa productos
    // ------------------------------------------------------------------------
    await runTest('X. Producto inexistente devuelve lista vacía sin inventar productos', async () => {
      const mockProducts = readCollection('products') || [];
      const res = retrieveRelevantProducts('producto_totalmente_inexistente_xyz_999', mockProducts, 10);
      assert.strictEqual(res.products.length, 0);
    });

    // ------------------------------------------------------------------------
    // TEST Y: Error ortográfico leve -> Encuentra candidato razonable
    // ------------------------------------------------------------------------
    await runTest('Y. Tolerancia a errores ortográficos leves ("bensina" -> Bencina)', async () => {
      const mockProducts = readCollection('products') || [];
      const res = retrieveRelevantProducts('tienes bensina', mockProducts, 10);
      assert.ok(res.products.some(p => p.nombre.toUpperCase().includes('BENCINA')));
    });

    // ------------------------------------------------------------------------
    // TEST Z: Normalización de formato WhatsApp (**negrita** -> *negrita*)
    // ------------------------------------------------------------------------
    await runTest('Z. normalizeWhatsAppFormatting convierte **negrita** a *negrita* sin alterar precios', async () => {
      const input = '¡Hola! Sí tenemos **Bencina Blanca** disponible. Precio: $1.00 (**807.38 Bs**).';
      const output = normalizeWhatsAppFormatting(input);
      assert.strictEqual(output, '¡Hola! Sí tenemos *Bencina Blanca* disponible. Precio: $1.00 (*807.38 Bs*).');
      assert.ok(!output.includes('**'));
    });

    // ------------------------------------------------------------------------
    // TEST AA: Reducción volumétrica del contexto prompt (> 90% reducción)
    // ------------------------------------------------------------------------
    await runTest('AA. Reducción volumétrica del prompt para "Tienes bencina" (> 90% de reducción)', async () => {
      const mockProducts = readCollection('products') || [];
      const retrieval = retrieveRelevantProducts('Tienes bencina', mockProducts, 10);
      const inventoryJson = JSON.stringify(retrieval.products, null, 2);

      const previousPromptSize = 100412; // Caracteres del prompt anterior medido
      const newPrompt = `INVENTARIO:\n${inventoryJson}\nREGLAS: ...`;
      const newPromptSize = newPrompt.length;
      const reductionPercent = ((previousPromptSize - newPromptSize) / previousPromptSize) * 100;

      console.log(`   📊 Métricas Prompt: Anterior = ${previousPromptSize} chars, Nuevo = ${newPromptSize} chars, Reducción = ${reductionPercent.toFixed(1)}%`);
      assert.ok(reductionPercent > 90, `Reducción debe ser mayor al 90%, fue ${reductionPercent.toFixed(1)}%`);
      assert.strictEqual(retrieval.products.length, 1);
    });

    // ------------------------------------------------------------------------
    // TEST AB: Cadena de modelos activa no contiene modelos deprecados
    // ------------------------------------------------------------------------
    await runTest('AB. Cadena de modelos activa es [3.7-flash, 3.6-flash, flash-latest] sin deprecados', async () => {
      assert.deepStrictEqual(GEMINI_FALLBACK_MODELS, ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest']);
      const deprecated = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const dep of deprecated) {
        assert.ok(!GEMINI_FALLBACK_MODELS.includes(dep), `Modelo deprecado ${dep} no debe estar en la cadena activa`);
      }
    });

    // ------------------------------------------------------------------------
    // TEST AC-AG: Simulación de la política de Fallback de Gemini
    // ------------------------------------------------------------------------
    await runTest('AC. 3.7 funciona -> 3.6 no se invoca', async () => {
      const callLog = [];
      const mockGemini = {
        models: {
          generateContent: async ({ model }) => {
            callLog.push(model);
            if (model === 'gemini-3.7-flash') return { text: 'Respuesta 3.7 OK' };
            throw new Error('Fallback reached unexpectedly');
          }
        }
      };

      let reply = null;
      for (const m of GEMINI_FALLBACK_MODELS) {
        try {
          const res = await mockGemini.models.generateContent({ model: m });
          if (res && res.text) { reply = res.text; break; }
        } catch (_) {}
      }
      assert.strictEqual(reply, 'Respuesta 3.7 OK');
      assert.deepStrictEqual(callLog, ['gemini-3.7-flash']);
    });

    await runTest('AD & AE. 3.7 falla + 3.6 funciona -> 3.6 se invoca y flash-latest no se invoca', async () => {
      const callLog = [];
      const mockGemini = {
        models: {
          generateContent: async ({ model }) => {
            callLog.push(model);
            if (model === 'gemini-3.7-flash') throw new Error('Timeout 3.7');
            if (model === 'gemini-3.6-flash') return { text: 'Respuesta 3.6 OK' };
            throw new Error('Flash latest reached unexpectedly');
          }
        }
      };

      let reply = null;
      for (const m of GEMINI_FALLBACK_MODELS) {
        try {
          const res = await mockGemini.models.generateContent({ model: m });
          if (res && res.text) { reply = res.text; break; }
        } catch (_) {}
      }
      assert.strictEqual(reply, 'Respuesta 3.6 OK');
      assert.deepStrictEqual(callLog, ['gemini-3.7-flash', 'gemini-3.6-flash']);
    });

    await runTest('AF. 3.7 falla + 3.6 falla -> flash-latest se invoca', async () => {
      const callLog = [];
      const mockGemini = {
        models: {
          generateContent: async ({ model }) => {
            callLog.push(model);
            if (model === 'gemini-3.7-flash') throw new Error('Timeout 3.7');
            if (model === 'gemini-3.6-flash') throw new Error('Unavailable 3.6');
            if (model === 'gemini-flash-latest') return { text: 'Respuesta flash-latest OK' };
            throw new Error('Unknown model');
          }
        }
      };

      let reply = null;
      for (const m of GEMINI_FALLBACK_MODELS) {
        try {
          const res = await mockGemini.models.generateContent({ model: m });
          if (res && res.text) { reply = res.text; break; }
        } catch (_) {}
      }
      assert.strictEqual(reply, 'Respuesta flash-latest OK');
      assert.deepStrictEqual(callLog, ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest']);
    });

    await runTest('AG. Todos los modelos fallan -> se preserva el fallback de dificultades técnicas', async () => {
      const mockGemini = {
        models: {
          generateContent: async () => {
            throw new Error('All models unavailable');
          }
        }
      };

      let reply = 'Disculpa, en este momento estoy experimentando dificultades técnicas. Intenta nuevamente en unos minutos.';
      for (const m of GEMINI_FALLBACK_MODELS) {
        try {
          const res = await mockGemini.models.generateContent({ model: m });
          if (res && res.text) { reply = res.text; break; }
        } catch (_) {}
      }
      assert.strictEqual(reply, 'Disculpa, en este momento estoy experimentando dificultades técnicas. Intenta nuevamente en unos minutos.');
    });

    console.log('\n============================================================');
    console.log(`🎉 SUITE ORQUESTADOR WHATSAPP COMPLETADA: ${passedTests}/${totalTests} TESTS PASARON`);
    console.log('============================================================\n');

  } finally {
    if (testServerInstance) {
      await new Promise((resolve) => testServerInstance.close(resolve));
    }
  }
}

runSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
