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

export async function extractInvoiceData(file: File, bcvRate: number, inventoryNames: string[] = []): Promise<InvoiceData> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey || apiKey.includes('REPLACE_WITH_GEMINI_KEY')) {
    throw new Error('API Key de Gemini no configurada en el archivo .env (VITE_GEMINI_API_KEY).');
  }

  // Convert file to base64
  const base64Data = await fileToBase64(file);
  const mimeType = file.type || 'image/jpeg';

  const promptText = `
    Eres un asistente experto en contabilidad. Extrae los datos de esta factura de compra en formato JSON estricto.
    
    REGLAS ESTRICTAS:
    1. Responde ÚNICAMENTE con un objeto JSON válido, sin bloques de código markdown ni texto adicional.
    2. UNIDADES: Normaliza estrictamente las cantidades a 'Und', 'Lt', 'Kg' o 'Bulto'. Si la factura dice "Cajas", "Paquetes" o "Bultos", pon 'Bulto'.
    3. MONEDA Y CONVERSIÓN: Detecta si la factura está en USD o BS. 
       La tasa de cambio actual es: ${bcvRate} Bs/$. 
       Si los precios originales están en BS, debes calcular el equivalente en USD dividiendo entre ${bcvRate} y devolver el "costo_unitario" y "costo_total" en USD.
       Si ya está en USD, devuélvelos tal cual.
    4. NOMBRES DE PRODUCTOS: Empareja inteligentemente los productos de la factura con nuestro catálogo.
       CATÁLOGO ACTUAL: ${inventoryNames.length > 0 ? inventoryNames.join(", ") : "Vacío"}.
       Si el nombre de la factura tiene errores ortográficos o variaciones (ej. 'Kary' por 'Cali', 'Mavesa 25' por 'Mavesa 250G'), debes devolver EXACTAMENTE el nombre de nuestro catálogo que corresponda.
       Si el producto definitivamente no existe en el catálogo, devuelve el nombre original tal como viene en la factura.
    
    ESTRUCTURA JSON REQUERIDA:
    {
      "proveedor": { "nombre": "Nombre de la empresa o persona", "rif": "J-12345678" },
      "factura": "Número de factura o control",
      "fecha": "YYYY-MM-DD",
      "moneda_detectada": "USD" o "BS",
      "items": [
        { "nombre": "Producto", "cantidad": 0, "unidad": "Und", "costo_unitario": 0, "costo_total": 0 }
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

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Intentos 0 y 1: gemini-2.5-flash. Intento 2 (respaldo): gemini-2.5-pro
      const model = attempt < 2 ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Gemini API Error (Intento ${attempt + 1} con ${model}):`, errBody);
        
        if (response.status === 503 || response.status === 429 || response.status >= 500) {
          throw new Error(`RETRY_ERROR_${response.status}`);
        }
        throw new Error(`FATAL: Error de Google (HTTP ${response.status}): Revisa tu conexión o API Key.`);
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates.length > 0) {
        let textResponse = data.candidates[0].content.parts[0].text;
        
        textResponse = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
        
        const parsedJson = JSON.parse(textResponse) as InvoiceData;
        return parsedJson;
      } else {
        throw new Error('Respuesta de IA vacía o formato incorrecto.');
      }
    } catch (error: any) {
      if (error.message && error.message.startsWith('FATAL:')) {
        throw new Error(error.message.replace('FATAL: ', ''));
      }
      
      attempt++;
      if (attempt >= maxRetries) {
        console.error('Error procesando OCR tras varios intentos:', error);
        throw new Error('Fallo al extraer los datos de la factura con IA tras múltiples reintentos.');
      }
      
      const pauseMs = attempt === 1 ? 1500 : 3000;
      console.warn(`Reintentando OCR en ${pauseMs}ms... (Intento ${attempt + 1}/${maxRetries}). Error previo: ${error.message}`);
      await new Promise(res => setTimeout(res, pauseMs));
    }
  }
  
  throw new Error('Fallo inesperado en el flujo de OCR.');
}

export async function extractDictationData(text: string, bcvRate: number = 45, inventoryNames: string[] = []): Promise<ExtractedInvoiceItem[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey || apiKey.includes('REPLACE_WITH_GEMINI_KEY')) {
    throw new Error('API Key de Gemini no configurada en el archivo .env (VITE_GEMINI_API_KEY).');
  }

  const promptText = `
    Analiza este texto dictado de una compra/factura: "${text}".
    Extrae los artículos comprados, cantidades y precios/costos en formato JSON estricto.

    REGLAS:
    1. Responde ÚNICAMENTE con un JSON válido.
    2. UNIDADES: Normaliza a 'Und', 'Kg' o 'Bulto'.
    3. MONEDA: Si el dictado menciona Bolívares o Bs, convierte a USD dividiendo entre ${bcvRate}.
    4. CATÁLOGO ACTUAL: ${inventoryNames.length > 0 ? inventoryNames.join(", ") : "Vacío"}.
       Empareja con el catálogo si coincide.
    
    ESTRUCTURA JSON:
    {
      "items": [
        { "nombre": "Nombre del producto", "cantidad": 0, "unidad": "Und", "costo_unitario": 0, "costo_total": 0 }
      ]
    }
  `;

  const payload = {
    contents: [
      {
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json"
    }
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Error en API de Gemini: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates.length > 0) {
    let textResponse = data.candidates[0].content.parts[0].text;
    textResponse = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(textResponse);
    return parsed.items || [];
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
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
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

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return {
        title: 'Nota de Voz',
        category: 'nota_general',
        summary: text,
        suggestedAction: 'Sin conexión IA'
      };
    }

    const data = await response.json();
    if (data.candidates && data.candidates.length > 0) {
      let textResponse = data.candidates[0].content.parts[0].text;
      textResponse = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
      const parsed = JSON.parse(textResponse);
      return parsed;
    }
  } catch (e) {
    console.error("Error estructurando nota con IA:", e);
  }

  return {
    title: 'Nota de Voz',
    category: 'nota_general',
    summary: text,
    suggestedAction: 'Revisión manual'
  };
}

export async function pingGeminiAPI(): Promise<{ ok: boolean; message: string }> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('REPLACE_WITH_GEMINI_KEY')) {
    return { ok: false, message: 'Falta configurar VITE_GEMINI_API_KEY en el archivo .env' };
  }

  try {
    const payload = {
      contents: [{ parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 5 }
    };
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, message: `Error de API (HTTP ${response.status}): ${errText.slice(0, 100)}` };
    }

    return { ok: true, message: 'Conexión con Gemini IA activa y verificada.' };
  } catch (err: any) {
    return { ok: false, message: `Error de red o conexión: ${err.message}` };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}
