import { GoogleGenAI } from '@google/genai';

// Instanciar el cliente usando la nueva SDK
// Es mandatorio usar variables de entorno para la API Key
const ai = new GoogleGenAI({ 
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" 
});

export const askGemini = async (prompt: string, context: string = "Eres un asistente experto en finanzas y control de inventario."): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [
        { role: 'user', parts: [{ text: `${context}\n\nPregunta: ${prompt}` }] }
      ],
      config: {
        temperature: 0.3, // Respuestas más deterministas para análisis financiero
      }
    });

    return response.text || "No pude generar una respuesta clara.";
  } catch (error) {
    console.error("Error al consultar Gemini:", error);
    return "Ocurrió un error al procesar tu solicitud con la IA.";
  }
};

export const askGeminiWithImage = async (prompt: string, base64Image: string, mimeType: string, context: string = "Eres un sistema contable OCR de la Quesería Kalu."): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
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
