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
  
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada (VITE_GEMINI_API_KEY).');
  }

  // Convert file to base64
  const base64Data = await fileToBase64(file);
  const mimeType = file.type;

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
      "proveedor": { "nombre": "Nombre de la empresa", "rif": "J-12345678" },
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

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Gemini API Error:', errBody);
      throw new Error(`Error de Google (HTTP ${response.status}): Revisa la consola o tu VPN.`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates.length > 0) {
      let textResponse = data.candidates[0].content.parts[0].text;
      
      // Limpiar formato markdown (```json ... ```) si viene incluido
      textResponse = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
      
      const parsedJson = JSON.parse(textResponse) as InvoiceData;
      return parsedJson;
    } else {
      throw new Error('Respuesta de IA vacía o formato incorrecto.');
    }
  } catch (error: any) {
    console.error('Error procesando OCR:', error);
    throw new Error(error.message || 'Fallo al extraer los datos de la factura con IA.');
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
