import { callSyncRate } from './localApi';

export async function fetchOfficialBcvRate(): Promise<{ rate: number; timestamp: string }> {
  try {
    const data = await callSyncRate();
    if (data && data.rate > 0) {
      // Save to localStorage immediately upon valid fetch
      localStorage.setItem('kalu_bcv_rate', String(data.rate));
      return { rate: data.rate, timestamp: data.timestamp || new Date().toISOString() };
    }
    throw new Error('Backend returned invalid rate');
  } catch (error) {
    console.warn("Failed to sync rate from backend, falling back to localStorage", error);
    const cached = localStorage.getItem('kalu_bcv_rate');
    if (cached) {
      const parsed = parseFloat(cached);
      if (!isNaN(parsed) && parsed > 0) {
        return { rate: parsed, timestamp: new Date().toISOString() };
      }
    }
    throw new Error("Unable to obtain BCV rate from API or cache");
  }
}
