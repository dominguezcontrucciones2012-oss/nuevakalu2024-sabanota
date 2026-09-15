// ============================================================
// KALU CRM OFICIAL — SABANOTA
// GEMINI INVENTORY ASSISTANT WRAPPER (FASE 1E-B)
// Re-routed through secure backend endpoints (src/services/aiApi.ts)
// ============================================================

import { processInventoryCommandApi, AIAction, AIInventoryCommandResponse } from './aiApi';

export type { AIAction };

export interface AIResponse {
  actions: AIAction[];
  message: string;
}

export async function processInventoryCommand(command: string, products: any[]): Promise<AIResponse> {
  return await processInventoryCommandApi(command, products);
}
