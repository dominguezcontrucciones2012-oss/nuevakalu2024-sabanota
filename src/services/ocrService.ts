// ============================================================
// KALU CRM OFICIAL — SABANOTA
// OCR & VOICE NOTES SERVICE (FASE 1E-B)
// Re-routed through secure backend endpoints (src/services/aiApi.ts)
// ============================================================

import {
  extractInvoiceDataApi,
  extractDictationDataApi,
  structureVoiceNoteApi,
  parseTripDepartureApi,
  getAIStatusApi,
  ExtractedInvoiceItem,
  InvoiceData,
  StructuredVoiceNote,
  ParsedTripDeparture
} from './aiApi';

export type {
  ExtractedInvoiceItem,
  InvoiceData,
  StructuredVoiceNote,
  ParsedTripDeparture
};

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

/**
 * Extracción OCR de Facturas de compra mediante backend
 */
export async function extractInvoiceData(file: File, bcvRate: number, inventoryNames: string[] = []): Promise<InvoiceData> {
  const base64Data = await fileToBase64(file);
  const mimeType = file.type || 'image/jpeg';
  const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  return await extractInvoiceDataApi(rawBase64, mimeType, bcvRate, inventoryNames);
}

/**
 * Extracción de Dictado de Mercancía mediante backend
 */
export async function extractDictationData(text: string, bcvRate: number = 45, inventoryNames: string[] = []): Promise<ExtractedInvoiceItem[]> {
  if (!text || !text.trim()) return [];
  try {
    return await extractDictationDataApi(text.trim(), bcvRate, inventoryNames);
  } catch (e) {
    console.warn('[Dictation Engine] Fallo en servicio backend:', e);
    return [];
  }
}

/**
 * Estructuración de Notas de Voz Contables mediante backend
 */
export async function structureVoiceNoteWithAI(text: string, bcvRate: number = 45): Promise<StructuredVoiceNote> {
  if (!text || !text.trim()) {
    return {
      title: 'Nota de Voz',
      category: 'nota_general',
      summary: '',
      suggestedAction: 'Revisión manual'
    };
  }
  try {
    return await structureVoiceNoteApi(text.trim(), bcvRate);
  } catch (e) {
    console.warn('[VoiceNote Engine] Fallo en servicio backend:', e);
    return {
      title: 'Nota de Voz',
      category: 'nota_general',
      summary: text,
      suggestedAction: 'Revisión manual (IA no disponible)'
    };
  }
}

/**
 * Comprobación de estado de disponibilidad de IA (Server-side)
 */
export async function pingGeminiAPI(): Promise<{ ok: boolean; message: string }> {
  try {
    const status = await getAIStatusApi();
    if (status.available) {
      return { ok: true, message: 'Conexión con Gemini IA activa en el servidor.' };
    }
    return { ok: false, message: 'Servicio de IA no disponible o desconfigurado en el servidor.' };
  } catch (err: any) {
    return { ok: false, message: `Error de conexión con el backend: ${err.message || 'Desconocido'}` };
  }
}

/**
 * Parseo de Órdenes de Salida de Giras de Queso mediante backend
 */
export async function parseTripDepartureWithAI(text: string, bcvRate: number = 813, productNames: string[] = []): Promise<ParsedTripDeparture> {
  if (!text || !text.trim()) return {};
  try {
    return await parseTripDepartureApi(text.trim(), bcvRate, productNames);
  } catch (e) {
    console.warn('[Trip Voice Assistant] Fallo en servicio backend:', e);
    return {};
  }
}
