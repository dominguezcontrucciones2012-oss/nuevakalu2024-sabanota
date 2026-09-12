export interface ExtractedInvoiceItem {
  nombre: string;
  cantidad: number;
  unidad: 'Kg' | 'Lt' | 'Und' | 'Bulto';
  costo_unitario: number;
  costo_total: number;
}

export interface InvoiceData {
  proveedor: {
    nombre: string;
    rif: string;
  };
  factura: string;
  fecha: string;
  moneda_detectada: 'USD' | 'BS';
  items: ExtractedInvoiceItem[];
}

export function getGeminiApiKey(): string {
  const env = (import.meta as any).env || {};
  return env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || (typeof window !== 'undefined' && (window as any).__GEMINI_API_KEY__) || '';
}

export function normalizeTextForMatching(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .replace(/[^a-z0-9\s]/g, ' ')   // remove special chars
    .replace(/\s+/g, ' ')            // collapse multiple spaces
    .trim();
}

export async function extractInvoiceData(file: File, bcvRate: number, inventoryNames: string[] = []): Promise<InvoiceData> {
  const apiKey = getGeminiApiKey();
  
  if (!apiKey || apiKey.includes('REPLACE_WITH_GEMINI_KEY')) {
    throw new Error('API Key de Gemini no configurada en el archivo .env (VITE_GEMINI_API_KEY).');
  }

  // Convert file to base64
  const base64Data = await fileToBase64(file);
  const mimeType = file.type || 'image/jpeg';

  const promptText = `
    Eres un asistente experto en contabilidad y auditoría de inventarios para comercios.
    Extrae los datos de esta factura de compra en formato JSON estricto.
    
    REGLAS DE ORO:
    1. Responde ÚNICAMENTE con un objeto JSON válido (sin bloques markdown ni explicaciones adicionales).
    2. UNIDADES Y BULTOS:
       - Si la factura menciona "Bulto", "Caja", "Fardo", "Saco", "Paquete" o abreviaciones como "BTO", "CJ", "PQ", clasifícalo como 'Bulto'.
       - Si es por peso o volumen: 'Kg' o 'Lt'.
       - Para unidades sueltas: 'Und'.
    3. MONEDA Y CONVERSIÓN:
       - Tasa de cambio BCV oficial: ${bcvRate} Bs/$.
       - Si la factura o renglón está en Bolívares (Bs), conviértelo a USD dividiendo entre ${bcvRate}.
       - Si está en USD o dólares ($), mantén los montos en USD.
       - "costo_unitario" y "costo_total" DEBEN ser números en USD mayores a 0.
    4. EMPAREJAMIENTO CON CATÁLOGO EXISTENTE (Evitar duplicados):
       - CATÁLOGO ACTUAL: ${inventoryNames.length > 0 ? inventoryNames.join(", ") : "Vacío"}.
       - Si un ítem de la factura corresponde a un producto del catálogo (incluso con variaciones ortográficas, sinónimos o abreviaciones como 'Arroz Prim' -> 'Arroz Primo'), devuelve EXACTAMENTE el nombre que aparece en el catálogo.
       - Si definitivamente es un producto nuevo que no está en el catálogo, devuelve su nombre comercial limpio en mayúsculas.
    
    ESTRUCTURA JSON REQUERIDA:
    {
      "proveedor": { "nombre": "Nombre de la empresa o proveedor", "rif": "J-12345678" },
      "factura": "Número de factura o control",
      "fecha": "YYYY-MM-DD",
      "moneda_detectada": "USD" | "BS",
      "items": [
        { "nombre": "Nombre Canónico o Nuevo", "cantidad": 0, "unidad": "Und" | "Kg" | "Lt" | "Bulto", "costo_unitario": 0, "costo_total": 0 }
      ]
    }
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data.split(',')[1] // remove 'data:image/jpeg;base64,' prefix
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json"
    }
  };

  const modelsToTry = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn(`[OCR Engine] Falló modelo ${model} (HTTP ${response.status})`);
        lastError = new Error(`Error en modelo ${model} (HTTP ${response.status})`);
        continue; // Try next model immediately
      }

      const data = await response.json();
      if (data.candidates && data.candidates.length > 0) {
        let textResponse = data.candidates[0].content?.parts?.[0]?.text || '';
        textResponse = textResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
        
        const parsedJson = JSON.parse(textResponse) as InvoiceData;
        if (parsedJson && parsedJson.items) {
          // Sanitizar y asegurar valores numéricos
          parsedJson.items = parsedJson.items.map(it => ({
            ...it,
            cantidad: Math.max(0.01, Number(it.cantidad) || 1),
            costo_unitario: Math.max(0, Number(it.costo_unitario) || 0),
            costo_total: Math.max(0, Number(it.costo_total) || 0)
          }));
          return parsedJson;
        }
      }
    } catch (err: any) {
      console.warn(`[OCR Engine] Error intentando modelo ${model}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('No fue posible procesar la factura con la IA.');
}

export async function extractDictationData(text: string, bcvRate: number = 45, inventoryNames: string[] = []): Promise<ExtractedInvoiceItem[]> {
  const apiKey = getGeminiApiKey();
  
  if (!apiKey || apiKey.includes('REPLACE_WITH_GEMINI_KEY')) {
    throw new Error('API Key de Gemini no configurada en el archivo .env (VITE_GEMINI_API_KEY).');
  }

  const promptText = `
    Eres un asistente contable y de compras de alta precisión.
    Analiza esta orden o dictado de mercancía: "${text}".
    Tasa BCV de referencia: ${bcvRate} Bs/$.
    
    CATÁLOGO ACTUAL DE PRODUCTOS:
    ${inventoryNames.length > 0 ? inventoryNames.join(", ") : "Vacío"}

    REGLAS DE EXTRACCIÓN:
    1. Devuelve ÚNICAMENTE un JSON válido.
    2. UNIDADES: Clasifica en 'Und', 'Kg', 'Lt' o 'Bulto' (si dice bultos, sacos, paquetes o cajas).
    3. MONEDA: Si el dictado menciona precios en Bolívares o Bs, convierte a USD dividiendo entre ${bcvRate}.
    4. PRECIOS/COSTOS: Si solo se menciona el total del producto, calcula el costo unitario (total / cantidad).
    5. EMPAREJAMIENTO: Empareja cada ítem con el nombre exacto del catálogo si existe, corrigiendo nombres hablados.
    
    ESTRUCTURA JSON:
    {
      "items": [
        { "nombre": "Nombre Exacto o Nuevo", "cantidad": 1, "unidad": "Und" | "Kg" | "Lt" | "Bulto", "costo_unitario": 0, "costo_total": 0 }
      ]
    }
  `;

  const payload = {
    contents: [
      { parts: [{ text: promptText }] }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json"
    }
  };

  const modelsToTry = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (data.candidates && data.candidates.length > 0) {
        let textResponse = data.candidates[0].content?.parts?.[0]?.text || '';
        textResponse = textResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
        const parsed = JSON.parse(textResponse);
        if (parsed.items && Array.isArray(parsed.items)) {
          return parsed.items.map((it: any) => ({
            ...it,
            cantidad: Math.max(0.01, Number(it.cantidad) || 1),
            costo_unitario: Math.max(0, Number(it.costo_unitario) || 0),
            costo_total: Math.max(0, Number(it.costo_total) || 0)
          }));
        }
      }
    } catch (e) {
      console.warn(`[Dictation Engine] Falló modelo ${model}:`, e);
    }
  }

  return [];
}

export interface StructuredVoiceNote {
  title: string;
  category: 'gasto' | 'ingreso' | 'compra' | 'deuda' | 'nota_general';
  amountUsd?: number;
  amountBs?: number;
  paymentMethod?: 'Efectivo' | 'Transferencia' | 'Pago Móvil' | 'Punto' | 'Dólares';
  summary: string;
  suggestedAction?: string;
}

export async function structureVoiceNoteWithAI(text: string, bcvRate: number = 45): Promise<StructuredVoiceNote> {
  const apiKey = getGeminiApiKey();
  
  if (!apiKey || apiKey.includes('REPLACE_WITH_GEMINI_KEY')) {
    return {
      title: 'Nota de Voz',
      category: 'nota_general',
      summary: text,
      suggestedAction: 'Revisar manualmente'
    };
  }

  const promptText = `
    Analiza esta nota de voz contable de la Quesería Kalu: "${text}".
    Tasa BCV de referencia: ${bcvRate} Bs/$.

    Tu tarea es estructurar y categorizar la nota en JSON estricto.
    
    REGLAS:
    1. Si menciona compras o gastos, extrae el monto. Si está en Bs, calcula el aproximado en USD.
    2. Categorías permitidas: 'gasto', 'ingreso', 'compra', 'deuda', 'nota_general'.
    3. Si menciona método de pago ('efectivo', 'pago móvil', 'transferencia', 'dólares'), identifícalo.
    4. Genera un título corto y un resumen claro de 1 línea.

    ESTRUCTURA JSON REQUERIDA:
    {
      "title": "Título corto y descriptivo",
      "category": "gasto" | "ingreso" | "compra" | "deuda" | "nota_general",
      "amountUsd": 0,
      "amountBs": 0,
      "paymentMethod": "Efectivo" | "Transferencia" | "Pago Móvil" | "Punto" | "Dólares",
      "summary": "Resumen ejecutivo de la operación",
      "suggestedAction": "Acción recomendada para el CRM"
    }
  `;

  const payload = {
    contents: [
      { parts: [{ text: promptText }] }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json"
    }
  };

  for (const model of ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest']) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (data.candidates && data.candidates.length > 0) {
        let textResponse = data.candidates[0].content.parts[0].text;
        textResponse = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
        const parsed = JSON.parse(textResponse);
        return parsed;
      }
    } catch (e) {
      console.warn("[VoiceNote Engine] Error:", e);
    }
  }

  return {
    title: 'Nota de Voz',
    category: 'nota_general',
    summary: text,
    suggestedAction: 'Revisión manual'
  };
}

export async function pingGeminiAPI(): Promise<{ ok: boolean; message: string }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey || apiKey.includes('REPLACE_WITH_GEMINI_KEY')) {
    return { ok: false, message: 'Falta configurar VITE_GEMINI_API_KEY en el archivo .env' };
  }

  const models = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
  let lastErr = '';

  for (const m of models) {
    try {
      const payload = {
        contents: [{ parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 5 }
      };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return { ok: true, message: `Conexión con Gemini IA activa (${m}).` };
      }
      const errText = await response.text();
      lastErr = `HTTP ${response.status}: ${errText.slice(0, 80)}`;
    } catch (err: any) {
      lastErr = err.message;
    }
  }

  return { ok: false, message: `Error de conexión: ${lastErr}` };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

export interface ParsedTripDeparture {
  driver?: string;
  cheeseProductName?: string;
  dispatchedKg?: number;
  costPerKg?: number;
  cashTakenUsd?: number;
  cashTakenBs?: number;
  bankTakenUsd?: number;
  bankTakenBs?: number;
}

export async function parseTripDepartureWithAI(text: string, bcvRate: number = 813, productNames: string[] = []): Promise<ParsedTripDeparture> {
  const apiKey = getGeminiApiKey();
  if (!apiKey || apiKey.includes('REPLACE_WITH_GEMINI_KEY')) {
    throw new Error('API Key de Gemini no configurada.');
  }

  const promptText = `
    Eres el asistente operativo de la Quesería Kalu.
    Analiza esta orden hablada de salida para una gira/viaje a San Juan: "${text}".
    Tasa BCV actual: ${bcvRate} Bs/$.
    
    CATÁLOGO DISPONIBLE DE PRODUCTOS DE QUESO:
    ${productNames.length > 0 ? productNames.join(', ') : 'QUESO DURO, QUESO SEMIDURO, QUESO BLANCO, QUESO PAISA'}
    
    RESPONSABLES POSIBLES:
    - Daisy Corro
    - Juan Carlos Domínguez

    INSTRUCCIONES DE EXTRACCIÓN:
    1. Devuelve ÚNICAMENTE un JSON válido sin markdown.
    2. Identifica si menciona un responsable (Daisy o Juan Carlos). Si no menciona ninguno, omite el campo.
    3. Extrae la cantidad en kilogramos (dispatchedKg) y el tipo de queso. Empareja con el catálogo más cercano.
    4. Si menciona costo por kilo ($/Kg), extráelo en costPerKg.
    5. Extrae el efectivo en dólares adelantado (cashTakenUsd).
    6. Extrae el efectivo en bolívares adelantado (cashTakenBs).
    7. Extrae fondos adelantados desde Banco / Pago Móvil / Transferencia en Bolívares (bankTakenBs) o en Dólares (bankTakenUsd).
    
    ESTRUCTURA JSON:
    {
      "driver": "Daisy Corro" | "Juan Carlos Domínguez",
      "cheeseProductName": "Nombre del Producto del Catálogo",
      "dispatchedKg": 0,
      "costPerKg": 0,
      "cashTakenUsd": 0,
      "cashTakenBs": 0,
      "bankTakenUsd": 0,
      "bankTakenBs": 0
    }
  `;

  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json"
    }
  };

  const models = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
  for (const m of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data.candidates && data.candidates.length > 0) {
        let textResponse = data.candidates[0].content.parts[0].text;
        textResponse = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
        return JSON.parse(textResponse) as ParsedTripDeparture;
      }
    } catch (e) {
      console.warn(`[Trip Voice Assistant] Error en modelo ${m}:`, e);
    }
  }

  return {};
}
