export async function fetchOfficialBcvRate(): Promise<{ rate: number; timestamp: string }> {
  try {
    const controller1 = new AbortController();
    const timeoutId1 = setTimeout(() => controller1.abort(), 4000);
    const fallbackRes = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv', { signal: controller1.signal });
    clearTimeout(timeoutId1);

    if (!fallbackRes.ok) throw new Error('Network error from pydolarvenezuela');
    const fallbackData = await fallbackRes.json();
    if (fallbackData && fallbackData.monitors && fallbackData.monitors.usd && fallbackData.monitors.usd.price) {
       const rate = fallbackData.monitors.usd.price;
       if (!rate || isNaN(rate) || rate <= 0) throw new Error('Tasa inválida');
       return { rate, timestamp: new Date().toISOString() };
    }
  } catch (error) {
    console.warn("Failed primary BCV API, trying fallback...", error);
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 4000);
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: controller2.signal });
      clearTimeout(timeoutId2);

      if (!res.ok) throw new Error('Network error from dolarapi');
      const data = await res.json();
      if (data && typeof data.promedio === 'number') {
        const rate = data.promedio;
        if (!rate || isNaN(rate) || rate <= 0) throw new Error('Tasa inválida');
        return { rate, timestamp: new Date().toISOString() };
      }
    } catch (fallbackError) {
      console.error("All BCV APIs failed", fallbackError);
      throw fallbackError;
    }
  }
  throw new Error("Unable to parse BCV rate from API responses");
}
