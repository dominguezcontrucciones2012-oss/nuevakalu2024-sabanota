export interface AIAction {
  type: 'ADD_PRODUCT' | 'UPDATE_PRODUCT' | 'NOTIFY' | 'ERROR';
  payload?: any;
  message?: string;
}

export interface AIResponse {
  actions: AIAction[];
  message: string;
}

export async function processInventoryCommand(command: string, products: any[]): Promise<AIResponse> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada.');
  }

  const catalogSummary = products.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    purchasePrice: p.purchasePrice,
    sellingPrice: p.sellingPrice,
  }));

  const promptText = `
    Eres un asistente virtual avanzado integrado en un sistema CRM de gestión de inventario.
    Tu tarea es interpretar la orden del usuario y devolver una respuesta en JSON puro con las acciones a ejecutar.
    
    CATÁLOGO ACTUAL (Solo lectura/referencia):
    ${JSON.stringify(catalogSummary)}
    
    ORDEN DEL USUARIO:
    "${command}"
    
    INSTRUCCIONES Y REGLAS ESTRICTAS:
    1. DEBES responder SIEMPRE con un único objeto JSON (nada de Markdown \`\`\`json, ni texto antes ni después).
    2. El JSON debe tener la siguiente estructura estricta:
       {
         "actions": [
           {
             "type": "ADD_PRODUCT" | "UPDATE_PRODUCT" | "NOTIFY" | "ERROR",
             "payload": { ... } // Los datos requeridos según la acción
           }
         ],
         "message": "Un mensaje amigable y breve en lenguaje natural sobre lo que vas a hacer (para mostrar al usuario)"
       }
    3. Para ADD_PRODUCT, el payload debe incluir: name, category (SOLO puedes usar: Repuestos, Charcutería, Víveres, Genérico), unit (Kg, Lt, Und), purchasePrice, sellingPrice, stockKg (por defecto 0).
    4. Para UPDATE_PRODUCT, el payload debe incluir: id (DEBE coincidir con el ID del catálogo actual) y los campos a actualizar (name, category, unit, purchasePrice, sellingPrice).
    5. Para NOTIFY o ERROR, el payload puede estar vacío o tener un mensaje.
    6. No puedes realizar borrado de productos (es destructivo). Si te piden borrar, usa NOTIFY indicando que debes hacerlo manualmente.
    7. Sé inteligente con la orden: si el usuario pide actualizar un producto por nombre, búscalo en el catálogo actual para obtener su ID. Si no lo encuentras, usa NOTIFY.
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates.length > 0) {
      let textResponse = data.candidates[0].content.parts[0].text;
      textResponse = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
      const parsedJson = JSON.parse(textResponse) as AIResponse;
      return parsedJson;
    } else {
      throw new Error('Respuesta de IA vacía o formato incorrecto.');
    }
  } catch (error: any) {
    console.error('Error en Asistente IA:', error);
    throw new Error(error.message || 'Fallo de comunicación con la IA.');
  }
}
