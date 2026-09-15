// ============================================================
// KALU CRM OFICIAL — SABANOTA
// GEMINI SERVICE WRAPPER (FASE 1E-B)
// Re-routed through secure backend endpoints (src/services/aiApi.ts)
// ============================================================

import { askAIChatApi } from './aiApi';

/**
 * Asistente general / chat financiero vía backend
 */
export const askGemini = async (prompt: string, context: string = "Eres un asistente experto en finanzas y control de inventario."): Promise<string> => {
  try {
    return await askAIChatApi(prompt, context);
  } catch (error) {
    console.error("Error al consultar Asistente IA:", error);
    return "Ocurrió un error al procesar tu solicitud con la IA.";
  }
};

/**
 * Asistente multimodal con imagen vía backend
 */
export const askGeminiWithImage = async (prompt: string, base64Image: string, mimeType: string, context: string = "Eres un sistema contable OCR de la Quesería Kalu."): Promise<string> => {
  try {
    const rawData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    return await askAIChatApi(prompt, context, rawData, mimeType);
  } catch (error) {
    console.error("Error calling AI API (OCR):", error);
    return '{"error": "No se pudo procesar la imagen."}';
  }
};
