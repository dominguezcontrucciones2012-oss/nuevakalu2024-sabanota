export async function fetchOfficialBcvRate(): Promise<{ rate: number; timestamp: string }> {
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!res.ok) throw new Error('Network error from dolarapi');
    const data = await res.json();
    if (data && typeof data.promedio === 'number') {
      return { rate: data.promedio, timestamp: new Date().toISOString() };
    }
  } catch (error) {
    console.warn("Failed primary BCV API, trying fallback...", error);
    try {
      const fallbackRes = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv');
      if (!fallbackRes.ok) throw new Error('Network error from pydolarvenezuela');
      const fallbackData = await fallbackRes.json();
      if (fallbackData && fallbackData.monitors && fallbackData.monitors.usd && fallbackData.monitors.usd.price) {
         return { rate: fallbackData.monitors.usd.price, timestamp: new Date().toISOString() };
      }
    } catch (fallbackError) {
      console.error("All BCV APIs failed", fallbackError);
      throw fallbackError;
    }
  }
  throw new Error("Unable to parse BCV rate from API responses");
}
