import { GoogleGenAI } from '@google/genai';

// Instanciar el cliente usando la nueva SDK
// Es altamente recomendable usar variables de entorno para la API Key
const ai = new GoogleGenAI({ 
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || "AIzaSy_REPLACE_WITH_GEMINI_KEY" 
});

export const askGemini = async (prompt: string, context: string = "Eres un asistente experto en finanzas y control de inventario."): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${context}\n\nPregunta: ${prompt}` }] }
      ],
      config: {
        temperature: 0.3, // Respuestas más deterministas para análisis financiero
      }
    });

    return response.text || "No se pudo generar una respuesta.";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Error al conectar con el Asistente IA. Por favor, verifica tu conexión o clave de API.";
  }
};

export const askGeminiWithImage = async (prompt: string, base64Image: string, mimeType: string, context: string = "Eres un sistema contable OCR de la Quesería Kalu."): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { 
          role: 'user', 
          parts: [
            { text: `${context}\n\nInstrucción: ${prompt}` },
            { inlineData: { data: base64Image, mimeType: mimeType } }
          ] 
        }
      ],
      config: {
        temperature: 0.1, // Para OCR queremos máxima precisión
        responseMimeType: "application/json", // Forzar respuesta estructurada si el prompt lo pide
      }
    });

    return response.text || "{}";
  } catch (error) {
    console.error("Error calling Gemini API (OCR):", error);
    return '{"error": "No se pudo procesar la imagen."}';
  }
};
