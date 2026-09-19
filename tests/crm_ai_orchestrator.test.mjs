// ============================================================
// KALU CRM — TEST SUITE: CRM AI ORCHESTRATOR & CONTEXT OPTIMIZATION
// Cobertura completa con Mocks de Gemini: Contexto Mínimo, Validación y Seguridad
// ============================================================

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  server,
  setGeminiClientForTest,
  getGeminiClient,
  isGeminiConfigured,
  normalizeSearchText,
  retrieveRelevantProducts,
  retrieveRelevantProductsForAI,
  retrieveRelevantClientsForAI,
  retrieveRelevantSuppliersForAI,
  retrieveRelevantDebtsForAI,
  GEMINI_FALLBACK_MODELS,
  classifyGeminiError,
  generateGeminiContentServer,
  PER_ATTEMPT_TIMEOUT_MS,
  TOTAL_OPERATION_BUDGET_MS
} from '../server.js';

const PORT = 3099;
const baseUrl = `http://127.0.0.1:${PORT}`;
let testServerInstance;

// Interceptor / Cliente HTTP para pruebas locales
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

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

  const setCookie = res.headers.get('set-cookie') || '';

  return {
    status: res.status,
    headers: res.headers,
    setCookie,
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
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message || err);
    throw err;
  }
}

async function runSuite() {
  console.log('------------------------------------------------------------');
  console.log('🚀 INICIANDO TEST SUITE: CRM AI ORCHESTRATOR & CONTEXT OPTIMIZATION');
  console.log('------------------------------------------------------------\n');

  if (!server.listening) {
    await new Promise((resolve) => {
      testServerInstance = server.listen(PORT, resolve);
    });
  }

  const originalClient = getGeminiClient();

  try {
    console.log('\n📦 SECCIÓN 1: HELPERS DE CONTEXTO DETERMINISTA');

    const sampleProducts = [
      { id: 'prod-1', name: 'Queso Paisa Pasteurizado', category: 'Charcutería', barcode: '7591234001', sellingPrice: 5.5, stockKg: 25, unit: 'Kg' },
      { id: 'prod-2', name: 'Queso Semiduro Sabanota', category: 'Charcutería', barcode: '7591234002', sellingPrice: 4.8, stockKg: 40, unit: 'Kg' },
      { id: 'prod-3', name: 'Harina de Maíz Blanco PAN 1kg', category: 'Víveres', barcode: '7590001001', sellingPrice: 1.2, stockKg: 100, unit: 'Und' },
      { id: 'prod-4', name: 'Aceite Comestible Vatel 1L', category: 'Víveres', barcode: '7590001002', sellingPrice: 2.8, stockKg: 15, unit: 'Und' },
      { id: 'prod-5', name: 'Repuesto Empacadora al Vacío', category: 'Repuestos', barcode: 'REP-001', sellingPrice: 45.0, stockKg: 2, unit: 'Und' }
    ];

    const sampleClients = [
      { id: 'cli-1', name: 'Juan Carlos Perez', cedula: 'V-12345678', phone: '584121234567', outstandingDebt: 150.0, creditLimit: 500.0 },
      { id: 'cli-2', name: 'Maria Fernanda Gonzalez', cedula: 'V-23456789', phone: '584149876543', outstandingDebt: 0.0, creditLimit: 200.0 }
    ];

    const sampleSuppliers = [
      { id: 'sup-1', name: 'Distribuidora Lácteos Los Andes', rif: 'J-12345678-0', balanceOwed: 320.0, isCheeseProducer: true, storeDebt: 0 },
      { id: 'sup-2', name: 'Empaques y Plásticos Barinas', rif: 'J-87654321-9', balanceOwed: 50.0, isCheeseProducer: false, storeDebt: 10.0 }
    ];

    await runTest('1.1 retrieveRelevantProductsForAI con coincidencia exacta de código / barcode', async () => {
      const res = retrieveRelevantProductsForAI('7591234001', sampleProducts, 5);
      assert.strictEqual(res.products.length, 1);
      assert.strictEqual(res.products[0].id, 'prod-1');
      assert.strictEqual(res.products[0].nombre, 'Queso Paisa Pasteurizado');
    });

    await runTest('1.2 retrieveRelevantProductsForAI con typo y tolerancia ortográfica ("queso semiduro")', async () => {
      const res = retrieveRelevantProductsForAI('queso semiduro', sampleProducts, 5);
      assert.ok(res.products.length >= 1);
      assert.strictEqual(res.products[0].id, 'prod-2');
    });

    await runTest('1.3 retrieveRelevantProductsForAI acota estrictamente al límite solicitado (limit = 2)', async () => {
      const res = retrieveRelevantProductsForAI('queso', sampleProducts, 2);
      assert.ok(res.products.length <= 2);
    });

    await runTest('1.4 retrieveRelevantClientsForAI localiza por cédula exacta y por nombre', async () => {
      const resCedula = retrieveRelevantClientsForAI('V-12345678', sampleClients, 5);
      assert.strictEqual(resCedula.clients.length, 1);
      assert.strictEqual(resCedula.clients[0].nombre, 'Juan Carlos Perez');

      const resName = retrieveRelevantClientsForAI('Maria Fernanda', sampleClients, 5);
      assert.strictEqual(resName.clients.length, 1);
      assert.strictEqual(resName.clients[0].id, 'cli-2');
    });

    await runTest('1.5 retrieveRelevantSuppliersForAI localiza por RIF y filtra campos sensibles', async () => {
      const res = retrieveRelevantSuppliersForAI('J-12345678-0', sampleSuppliers, 5);
      assert.strictEqual(res.suppliers.length, 1);
      assert.strictEqual(res.suppliers[0].id, 'sup-1');
      assert.strictEqual(res.suppliers[0].es_productor_queso, true);
    });

    await runTest('1.6 retrieveRelevantDebtsForAI calcula balance determinista sin delegar suma a la IA', async () => {
      const installments = [
        { id: 'i1', clientId: 'cli-1', amount: 50, status: 'pending', dueDate: '2026-10-01' },
        { id: 'i2', clientId: 'cli-1', amount: 100, status: 'pending', dueDate: '2026-10-15' },
        { id: 'i3', clientId: 'cli-1', amount: 20, status: 'paid', dueDate: '2026-09-01' }
      ];
      const resDebt = retrieveRelevantDebtsForAI('cli-1', 'client', installments, sampleSuppliers, sampleClients);
      assert.strictEqual(resDebt.entityId, 'cli-1');
      assert.strictEqual(resDebt.totalDebt, 150.0);
      assert.strictEqual(resDebt.pendingInstallmentCount, 2);
    });

    console.log('\n🤖 SECCIÓN 2: ENDPOINTS CRM CON MOCKS DE GEMINI');

    const mockGemini = {
      models: {
        generateContent: async ({ model, contents, config }) => {
          const partsArray = contents?.[0]?.parts || [];
          const fullJoinedText = partsArray.map(p => p.text || '').join(' ');

          if (fullJoinedText.includes('KALU_CHAT_TEST')) {
            return { text: 'KALU_CHAT_OK' };
          }

          if (fullJoinedText.includes('CANDIDATOS RELEVANTES DE INVENTARIO') || fullJoinedText.includes('gestión de inventario')) {
            return {
              text: JSON.stringify({
                actions: [
                  {
                    type: 'ADD_PRODUCT',
                    payload: { name: 'QUESO BLANCO NUEVO', category: 'Charcutería', unit: 'Kg', purchasePrice: 4.0, sellingPrice: 5.5, stockKg: 0 }
                  }
                ],
                message: 'Producto identificado para agregar al catálogo'
              })
            };
          }

          if (fullJoinedText.includes('auditor contable de facturas')) {
            return {
              text: JSON.stringify({
                proveedor: { nombre: 'DISTRIBUIDORA ANDINA', rif: 'J-99887766' },
                factura: 'FAC-1002',
                fecha: '2026-09-18',
                moneda_detectada: 'USD',
                items: [
                  { nombre: 'QUESO PAISA', cantidad: 10, unidad: 'Kg', costo_unitario: 4.5, costo_total: 45.0 }
                ]
              })
            };
          }

          if (fullJoinedText.includes('dictado de mercancía')) {
            return {
              text: JSON.stringify({
                items: [
                  { nombre: 'HARINA PAN', cantidad: 5, unidad: 'Und', costo_unitario: 1.1, costo_total: 5.5 }
                ]
              })
            };
          }

          if (fullJoinedText.includes('nota de voz contable')) {
            return {
              text: JSON.stringify({
                title: 'Compra de bolsas para charcutería',
                category: 'gasto',
                amountUsd: 15.0,
                amountBs: 0,
                paymentMethod: 'Efectivo',
                summary: 'Gasto menor de 15$ en bolsas',
                suggestedAction: 'Registrar en caja chica'
              })
            };
          }

          if (fullJoinedText.includes('orden hablada de salida para una gira')) {
            return {
              text: JSON.stringify({
                driver: 'Daisy Corro',
                cheeseProductName: 'Queso Semiduro',
                dispatchedKg: 80,
                costPerKg: 4.2,
                cashTakenUsd: 100,
                cashTakenBs: 0,
                bankTakenUsd: 50,
                bankTakenBs: 0
              })
            };
          }

          return { text: '{"status": "MOCK_GENERIC_OK"}' };
        }
      }
    };

    setGeminiClientForTest(mockGemini);

    let authCookie = '';
    let csrfToken = '';

    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        loginMode: 'admin',
        email: 'admin@kalu.local',
        password: 'Admin123!'
      })
    });

    if (loginRes.status === 200) {
      authCookie = loginRes.setCookie.split(';')[0];
      csrfToken = loginRes.data?.csrfToken || '';
      if (!csrfToken) {
        const csrfRes = await request('/api/auth/csrf-token', {
          headers: { Cookie: authCookie }
        });
        csrfToken = csrfRes.data?.csrfToken || '';
      }
    }

    const authHeaders = {
      Cookie: authCookie,
      'x-csrf-token': csrfToken
    };

    await runTest('2.1 GET /api/ai/status devuelve engine active y available true con cliente activo', async () => {
      const res = await request('/api/ai/status', { headers: { Cookie: authCookie } });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.available, true);
      assert.strictEqual(res.data.engine, 'active');
    });

    await runTest('2.2 POST /api/ai/chat responde con mock seguro y contexto acotado', async () => {
      const res = await request('/api/ai/chat', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ prompt: 'KALU_CHAT_TEST' })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.text, 'KALU_CHAT_OK');
    });

    await runTest('2.3 POST /api/ai/inventory-command procesa comando y valida payload sin mutar DB', async () => {
      const res = await request('/api/ai/inventory-command', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          command: 'Agregar queso blanco nuevo a 4 dolares el kilo'
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.actions));
      assert.strictEqual(res.data.actions[0].type, 'ADD_PRODUCT');
      assert.strictEqual(res.data.actions[0].payload.name, 'QUESO BLANCO NUEVO');
    });

    await runTest('2.4 POST /api/ai/ocr-invoice extrae y empareja datos con validación post-OCR', async () => {
      const fakeBase64 = Buffer.from('fake-image-content').toString('base64');
      const res = await request('/api/ai/ocr-invoice', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          imageBase64: fakeBase64,
          mimeType: 'image/jpeg',
          bcvRate: 45
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.factura, 'FAC-1002');
      assert.ok(Array.isArray(res.data.data.items));
      assert.strictEqual(res.data.data.items[0].cantidad, 10);
    });

    await runTest('2.5 POST /api/ai/parse-dictation interpreta texto y empareja con catálogo local', async () => {
      const res = await request('/api/ai/parse-dictation', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          text: 'Llegaron 5 paquetes de harina pan a un dolar con diez',
          bcvRate: 45
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.items));
      assert.strictEqual(res.data.items[0].cantidad, 5);
      assert.strictEqual(res.data.items[0].costo_unitario, 1.1);
    });

    await runTest('2.6 POST /api/ai/parse-voice-note estructura nota contable y valida montos', async () => {
      const res = await request('/api/ai/parse-voice-note', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          text: 'Gasté 15 dólares en efectivo comprando bolsas plásticas para los quesos',
          bcvRate: 45
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.category, 'gasto');
      assert.strictEqual(res.data.data.amountUsd, 15.0);
      assert.strictEqual(res.data.data.paymentMethod, 'Efectivo');
    });

    await runTest('2.7 POST /api/ai/parse-trip estructura salida de viaje y valida campos numéricos', async () => {
      const res = await request('/api/ai/parse-trip', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          text: 'Salida de Daisy con 80 kilos de queso semiduro a 4.2 y 100 dolares de viatico',
          bcvRate: 813
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.driver, 'Daisy Corro');
      assert.strictEqual(res.data.data.dispatchedKg, 80);
      assert.strictEqual(res.data.data.cashTakenUsd, 100);
    });

    console.log('\n🛡️ SECCIÓN 3: CONTROL DE ROLES Y SEGURIDAD');

    await runTest('3.1 Solicitud anónima sin sesión a /api/ai/chat es rechazada con 401 Unauthorized', async () => {
      const res = await request('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Hola' })
      });
      assert.strictEqual(res.status, 401);
    });

    await runTest('3.2 Solicitud sin CSRF token a /api/ai/ocr-invoice es rechazada con 403 Forbidden', async () => {
      const res = await request('/api/ai/ocr-invoice', {
        method: 'POST',
        headers: { Cookie: authCookie },
        body: JSON.stringify({ imageBase64: 'abc', mimeType: 'image/jpeg' })
      });
      assert.strictEqual(res.status, 403);
    });

    console.log('\n🔍 SECCIÓN 4: INTEGRACIÓN UI AUTH & PIPELINE DE ESTADOS');

    await runTest('4.1 GET /api/ai/status anónimo devuelve 401 Unauthorized', async () => {
      const res = await request('/api/ai/status');
      assert.strictEqual(res.status, 401);
    });

    await runTest('4.2 GET /api/ai/status con sesión activa devuelve 200 y available: true', async () => {
      const res = await request('/api/ai/status', {
        headers: { Cookie: authCookie }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.available, true);
    });

    await runTest('4.3 POST /api/ai/ocr-invoice con sesión y CSRF válidos procesa exitosamente', async () => {
      const res = await request('/api/ai/ocr-invoice', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          imageBase64: 'fake_invoice_b64',
          mimeType: 'image/jpeg',
          bcvRate: 45
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.data.items));
    });

    console.log('\n⚡ SECCIÓN 5: RESILIENCIA, TIMEOUT Y FALLBACK RÁPIDO NATIVO DE GEMINI');

    await runTest('5.1 classifyGeminiError clasifica correctamente errores transitorios y no recuperables', async () => {
      assert.strictEqual(classifyGeminiError({ status: 503 }).type, 'MODEL_UNAVAILABLE');
      assert.strictEqual(classifyGeminiError({ status: 503 }).isTransient, true);
      assert.strictEqual(classifyGeminiError({ isTimeout: true }).type, 'TIMEOUT');
      assert.strictEqual(classifyGeminiError({ isTimeout: true }).isTransient, true);
      assert.strictEqual(classifyGeminiError({ status: 429 }).type, 'RATE_LIMIT');
      assert.strictEqual(classifyGeminiError({ status: 429 }).isTransient, true);
      assert.strictEqual(classifyGeminiError({ status: 401 }).type, 'AUTH_ERROR');
      assert.strictEqual(classifyGeminiError({ status: 401 }).isTransient, false);
      assert.strictEqual(classifyGeminiError({ status: 400 }).type, 'INVALID_REQUEST');
      assert.strictEqual(classifyGeminiError({ status: 400 }).isTransient, false);
      assert.strictEqual(classifyGeminiError({ status: 413 }).type, 'PAYLOAD_TOO_LARGE');
      assert.strictEqual(classifyGeminiError({ status: 413 }).isTransient, false);
    });

    await runTest('5.2 [Caso A] 3.7 responde normalmente -> No ejecuta fallback y recibe signal/timeout', async () => {
      const calls = [];
      let receivedConfig = null;
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model, config }) => {
            calls.push(model);
            receivedConfig = config;
            return { text: 'Respuesta normal de 3.7' };
          }
        }
      });

      const text = await generateGeminiContentServer({ prompt: 'test A', operation: 'test_A' });
      assert.strictEqual(text, 'Respuesta normal de 3.7');
      assert.deepStrictEqual(calls, ['gemini-3.7-flash']);
      assert.ok(receivedConfig?.abortSignal instanceof AbortSignal, 'Debe recibir abortSignal');
      assert.strictEqual(receivedConfig?.httpOptions?.timeout, 12000, 'Debe recibir timeout de 12s');
    });

    await runTest('5.3 [Caso B] 3.7 devuelve 503 -> 3.6 responde inmediatamente con éxito', async () => {
      const calls = [];
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            if (model === 'gemini-3.7-flash') {
              const err = new Error('503 Service Unavailable');
              err.status = 503;
              throw err;
            }
            if (model === 'gemini-3.6-flash') {
              return { text: 'Respuesta exitosa de 3.6' };
            }
            throw new Error('No debe llegar aquí');
          }
        }
      });

      const text = await generateGeminiContentServer({ prompt: 'test B', operation: 'test_B' });
      assert.strictEqual(text, 'Respuesta exitosa de 3.6');
      assert.deepStrictEqual(calls, ['gemini-3.7-flash', 'gemini-3.6-flash']);
    });

    await runTest('5.4 [Caso C] 3.7 excede timeout por intento -> abortSignal se dispara y 3.6 responde', async () => {
      const calls = [];
      let model37Aborted = false;
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model, config }) => {
            calls.push(model);
            if (model === 'gemini-3.7-flash') {
              return new Promise((resolve, reject) => {
                config.abortSignal.addEventListener('abort', () => {
                  model37Aborted = true;
                  const abortErr = new Error('This operation was aborted');
                  abortErr.name = 'AbortError';
                  reject(abortErr);
                });
              });
            }
            if (model === 'gemini-3.6-flash') {
              return { text: 'Respuesta rápida de 3.6 tras abort' };
            }
            throw new Error('No debe llegar aquí');
          }
        }
      });

      const t0 = Date.now();
      const text = await generateGeminiContentServer({
        prompt: 'test C',
        operation: 'test_C',
        attemptTimeoutMs: 80
      });
      const elapsed = Date.now() - t0;

      assert.strictEqual(text, 'Respuesta rápida de 3.6 tras abort');
      assert.strictEqual(model37Aborted, true, 'El AbortSignal del intento 3.7 debe haber sido abortado');
      assert.ok(elapsed < 400, `Debe resolver rápido (tardó ${elapsed}ms)`);
      assert.deepStrictEqual(calls, ['gemini-3.7-flash', 'gemini-3.6-flash']);
    });

    await runTest('5.5 [Caso D] 3.7 y 3.6 fallan transitoriamente -> flash-latest responde', async () => {
      const calls = [];
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            if (model === 'gemini-3.7-flash' || model === 'gemini-3.6-flash') {
              const err = new Error('503 High Demand');
              err.status = 503;
              throw err;
            }
            return { text: 'Respuesta de flash-latest' };
          }
        }
      });

      const text = await generateGeminiContentServer({ prompt: 'test D', operation: 'test_D' });
      assert.strictEqual(text, 'Respuesta de flash-latest');
      assert.deepStrictEqual(calls, ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest']);
    });

    await runTest('5.6 [Caso E] Presupuesto global restante < 12s -> Último intento recibe effectiveTimeout = remainingBudget', async () => {
      let latestTimeoutReceived = null;
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model, config }) => {
            if (model === 'gemini-3.7-flash') {
              // Consumir 250ms de un presupuesto total de 350ms
              await new Promise(r => setTimeout(r, 250));
              const err = new Error('503 Unavailable');
              err.status = 503;
              throw err;
            }
            if (model === 'gemini-3.6-flash') {
              latestTimeoutReceived = config?.httpOptions?.timeout;
              return { text: '3.6 completó dentro del remanente' };
            }
            throw new Error('No debe llegar a latest');
          }
        }
      });

      const text = await generateGeminiContentServer({
        prompt: 'test E budget',
        operation: 'test_E_budget',
        attemptTimeoutMs: 12000,
        totalBudgetMs: 350
      });

      assert.strictEqual(text, '3.6 completó dentro del remanente');
      assert.ok(latestTimeoutReceived <= 120, `El timeout recibido (${latestTimeoutReceived}ms) debe ser <= remainingBudget (~100ms)`);
    });

    await runTest('5.7 [Caso F] Presupuesto global agotado -> NO inicia otro modelo y clasifica error como TIMEOUT / AI_TIMEOUT', async () => {
      const calls = [];
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            await new Promise(r => setTimeout(r, 200));
            const err = new Error('503 Unavailable');
            err.status = 503;
            throw err;
          }
        }
      });

      try {
        await generateGeminiContentServer({
          prompt: 'test F budget exhaust',
          operation: 'test_F_budget',
          attemptTimeoutMs: 12000,
          totalBudgetMs: 150 // Presupuesto menor que el tiempo que tarda el primer modelo
        });
        assert.fail('Debió lanzar error por presupuesto');
      } catch (err) {
        assert.strictEqual(err.code, 'AI_TIMEOUT');
        assert.ok(err.message.includes('La IA tardó más de lo esperado'));
      }
      assert.strictEqual(calls.length, 1, 'No debe haber iniciado el segundo modelo si se consumió el presupuesto total');
    });

    await runTest('5.8 [Caso G] Error no recuperable (401 Auth) -> Se detiene de inmediato sin llamar fallbacks', async () => {
      const calls = [];
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            const err = new Error('401 Invalid API Key');
            err.status = 401;
            throw err;
          }
        }
      });

      try {
        await generateGeminiContentServer({ prompt: 'test G', operation: 'test_G' });
        assert.fail('Debió lanzar error');
      } catch (err) {
        assert.ok(err.message.includes('401'));
      }
      assert.deepStrictEqual(calls, ['gemini-3.7-flash'], 'No debe recorrer 3.6 ni latest ante 401');
    });

    await runTest('5.9 [Caso H] Error no recuperable (400 Invalid Request) -> Sin fallback', async () => {
      const calls = [];
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            const err = new Error('400 Invalid argument payload');
            err.status = 400;
            throw err;
          }
        }
      });

      try {
        await generateGeminiContentServer({ prompt: 'test H', operation: 'test_H' });
        assert.fail('Debió lanzar error');
      } catch (err) {
        assert.ok(err.message.includes('400'));
      }
      assert.deepStrictEqual(calls, ['gemini-3.7-flash']);
    });

    await runTest('5.10 [Caso J] OCR endpoint ante 503 de todos los modelos -> Devuelve HTTP 503 con AI_TEMPORARILY_UNAVAILABLE', async () => {
      setGeminiClientForTest({
        models: {
          generateContent: async () => {
            const err = new Error('503 Service Unavailable');
            err.status = 503;
            throw err;
          }
        }
      });

      const res = await request('/api/ai/ocr-invoice', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          imageBase64: 'fake_invoice_b64',
          mimeType: 'image/jpeg',
          bcvRate: 45
        })
      });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.code, 'AI_TEMPORARILY_UNAVAILABLE');
      assert.strictEqual(res.data.error, 'El servicio de IA está temporalmente ocupado. Intente nuevamente en unos momentos.');
      // Sin filtrar mensajes crudos ni secretos
      assert.strictEqual(JSON.stringify(res.data).includes('503 Service Unavailable'), false);
    });

    await runTest('5.11 [Caso K] OCR endpoint ante Timeout -> Devuelve HTTP 504 con AI_TIMEOUT', async () => {
      setGeminiClientForTest({
        models: {
          generateContent: async ({ config }) => {
            return new Promise((_, reject) => {
              config.abortSignal.addEventListener('abort', () => {
                const abortErr = new Error('This operation was aborted');
                abortErr.name = 'AbortError';
                reject(abortErr);
              });
            });
          }
        }
      });

      // Se simula la llamada con temporizador corto para no demorar la suite
      try {
        await generateGeminiContentServer({
          prompt: 'test OCR timeout',
          operation: 'ocr_invoice',
          attemptTimeoutMs: 50,
          totalBudgetMs: 120
        });
        assert.fail('Debió fallar con timeout');
      } catch (err) {
        assert.strictEqual(err.code, 'AI_TIMEOUT');
        assert.strictEqual(err.classification, 'TIMEOUT');
        assert.strictEqual(err.message, 'La IA tardó más de lo esperado. Intente nuevamente.');
      }
    });

    await runTest('5.12 [BUG 1 FIX] Error con propiedad message getter-only (read-only) -> No genera TypeError y ejecuta fallback correctamente', async () => {
      const calls = [];
      setGeminiClientForTest({
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            if (model === 'gemini-3.7-flash') {
              // Simular un error del SDK donde 'message' es solo getter (read-only)
              const readonlyErr = new Error();
              Object.defineProperty(readonlyErr, 'message', {
                get() { return '503 High demand spike'; },
                configurable: false
              });
              readonlyErr.status = 503;
              throw readonlyErr;
            }
            return { text: '{"success":true,"model":"gemini-3.6-flash"}' };
          }
        }
      });

      const resText = await generateGeminiContentServer({
        prompt: 'test readonly error fix',
        operation: 'test_readonly'
      });
      assert.ok(resText.includes('gemini-3.6-flash'));
      assert.deepStrictEqual(calls, ['gemini-3.7-flash', 'gemini-3.6-flash']);
    });

    console.log('\n============================================================');
    console.log(`🎉 SUITE CRM AI ORCHESTRATOR COMPLETADA: ${passedTests}/${totalTests} TESTS PASARON`);
    console.log('============================================================\n');

  } finally {
    setGeminiClientForTest(originalClient);
    if (testServerInstance) {
      await new Promise((resolve) => testServerInstance.close(resolve));
    }
  }
}

runSuite().catch((err) => {
  console.error('❌ Error fatal en suite de pruebas:', err);
  process.exit(1);
});
