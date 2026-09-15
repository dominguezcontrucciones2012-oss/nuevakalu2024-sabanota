// ============================================================
// KALU CRM OFICIAL — SABANOTA
// AI API CLIENT (FASE 1E-B)
// Server-side Gemini AI Client with Session Auth and CSRF
// ============================================================

import { getCsrfToken } from './localApi';

const isProd = import.meta.env.PROD;
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const API_URL = isProd ? `/api` : `http://${hostname}:3001/api`;

export interface AIStatusResponse {
  available: boolean;
  engine: string;
}

export interface AIChatResponse {
  success: boolean;
  text: string;
  error?: string;
}

export interface AIAction {
  type: 'ADD_PRODUCT' | 'UPDATE_PRODUCT' | 'NOTIFY' | 'ERROR';
  payload?: any;
  message?: string;
}

export interface AIInventoryCommandResponse {
  success: boolean;
  actions: AIAction[];
  message: string;
  error?: string;
}

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

export interface StructuredVoiceNote {
  title: string;
  category: 'gasto' | 'ingreso' | 'compra' | 'deuda' | 'nota_general';
  amountUsd?: number;
  amountBs?: number;
  paymentMethod?: 'Efectivo' | 'Transferencia' | 'Pago Móvil' | 'Punto' | 'Dólares';
  summary: string;
  suggestedAction?: string;
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

/**
 * 1. Consultar estado de disponibilidad de IA en el servidor
 */
export async function getAIStatusApi(): Promise<AIStatusResponse> {
  const res = await fetch(`${API_URL}/ai/status`, {
    method: 'GET',
    credentials: 'include'
  });
  if (!res.ok) {
    return { available: false, engine: 'unavailable' };
  }
  return await res.json();
}

/**
 * 2. Asistente General / Chat Financiero
 */
export async function askAIChatApi(prompt: string, context?: string, imageBase64?: string, mimeType?: string): Promise<string> {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify({ prompt, context, imageBase64, mimeType })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Ocurrió un error al procesar tu solicitud con la IA.');
  }
  return data.text || 'No pude generar una respuesta clara.';
}

/**
 * 3. Comandos de Lenguaje Natural de Inventario
 */
export async function processInventoryCommandApi(command: string, products: any[]): Promise<{ actions: AIAction[]; message: string }> {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/ai/inventory-command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify({ command, products })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Fallo de comunicación con la IA.');
  }
  return {
    actions: Array.isArray(data.actions) ? data.actions : [],
    message: data.message || 'Comando procesado correctamente'
  };
}

/**
 * 4. Extracción OCR de Facturas de Compra
 */
export async function extractInvoiceDataApi(imageBase64: string, mimeType: string, bcvRate: number, inventoryNames: string[] = []): Promise<InvoiceData> {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/ai/ocr-invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify({ imageBase64, mimeType, bcvRate, inventoryNames })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'No fue posible procesar la factura con la IA.');
  }
  return data.data as InvoiceData;
}

/**
 * 5. Extracción de Dictado de Mercancía / Compras
 */
export async function extractDictationDataApi(text: string, bcvRate: number = 45, inventoryNames: string[] = []): Promise<ExtractedInvoiceItem[]> {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/ai/parse-dictation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify({ text, bcvRate, inventoryNames })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error procesando el dictado con la IA');
  }
  return (Array.isArray(data.items) ? data.items : []) as ExtractedInvoiceItem[];
}

/**
 * 6. Estructuración de Notas de Voz Contables
 */
export async function structureVoiceNoteApi(text: string, bcvRate: number = 45): Promise<StructuredVoiceNote> {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/ai/parse-voice-note`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify({ text, bcvRate })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al estructurar nota de voz con IA');
  }
  return data.data as StructuredVoiceNote;
}

/**
 * 7. Parseo de Giras y Despachos de Queso
 */
export async function parseTripDepartureApi(text: string, bcvRate: number = 813, productNames: string[] = []): Promise<ParsedTripDeparture> {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/ai/parse-trip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify({ text, bcvRate, productNames })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error procesando salida de gira con IA');
  }
  return data.data as ParsedTripDeparture;
}
