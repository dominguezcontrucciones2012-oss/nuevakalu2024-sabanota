import { fetchCollection, getCsrfToken } from './localApi';

const isProd = import.meta.env.PROD;
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const BACKUP_API_URL = isProd ? `/api` : `http://${hostname}:3001/api`;

export const OPERATIONAL_COLLECTIONS = [
  'products',
  'clients',
  'suppliers',
  'transactions',
  'kardex',
  'adminLedger',
  'cheeseTrips',
  'settings',
  'cashClosings',
  'bills',
  'installments',
  'invoices',
  'users',
  'daily_drafts',
  'shift_transactions',
  'shift_sessions',
  'sales',
  'expenses',
  'payments',
  'mobileOrders',
  'business_debts',
  'photo_album',
  'voice_notes',
  'vehicle_trips',
  'purchases',
  'pwa_payments'
];

export interface BackupData {
  version?: string;
  timestamp: string;
  company?: string;
  collections: {
    [collectionName: string]: any[];
  };
  captures?: {
    [filename: string]: string;
  };
}

export async function fetchOperationalData(): Promise<BackupData> {
  // Intentar obtener respaldo completo atómico del backend
  try {
    const res = await fetch(`${BACKUP_API_URL}/full-backup`, {
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.collections) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Endpoint /api/full-backup no disponible, usando fallback por colección:', e);
  }

  // Fallback: consultar colección por colección
  const data: BackupData = {
    version: '2.0',
    timestamp: new Date().toISOString(),
    company: 'Mundo Kalu Sabanota',
    collections: {}
  };

  for (const colName of OPERATIONAL_COLLECTIONS) {
    try {
      const colData = await fetchCollection(colName);
      data.collections[colName] = Array.isArray(colData) ? colData : [];
    } catch (err) {
      console.warn(`Error leyendo colección ${colName} para respaldo:`, err);
      data.collections[colName] = [];
    }
  }

  return data;
}

export async function restoreFromData(data: BackupData): Promise<any> {
  if (!data || !data.collections || typeof data.collections !== 'object') {
    throw new Error('Formato de respaldo inválido: No se encontraron colecciones para restaurar.');
  }

  const csrf = await getCsrfToken();
  // Enviar al endpoint seguro de restauración en caliente del backend
  const res = await fetch(`${BACKUP_API_URL}/restore-backup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en el servidor al restaurar: ${errText}`);
  }

  return await res.json();
}

export async function createSnapshot(): Promise<void> {
  // Snapshot local / exportación directa
  await exportToJson();
}

export async function restoreSnapshot(): Promise<void> {
  throw new Error('Por favor utilice el botón "Importar Datos desde JSON Local" para seleccionar el archivo de respaldo.');
}

export async function downloadBackupBundle(): Promise<void> {
  const res = await fetch(`${BACKUP_API_URL}/full-backup?format=bundle`, {
    credentials: 'include'
  });
  if (!res.ok) {
    throw new Error('Error al descargar el paquete de respaldo del servidor.');
  }

  const blob = await res.blob();
  const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `kalu_respaldo_completo_${dateStr}.tar.gz`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportToJson(): Promise<void> {
  // Por defecto, descargamos el bundle escalable TAR.GZ con comprobantes
  await downloadBackupBundle();
}

export async function importFromJson(file: File): Promise<any> {
  if (file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz') || file.type.includes('gzip')) {
    // Es un bundle TAR.GZ
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    const base64 = btoa(binary);

    const csrf = await getCsrfToken();
    const res = await fetch(`${BACKUP_API_URL}/restore-backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf
      },
      credentials: 'include',
      body: JSON.stringify({ bundleBase64: base64 })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(err.error || err.details?.join?.('\n') || 'Error al restaurar paquete');
    }
    return await res.json();
  }

  // Fallback para archivo .json legacy
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data: BackupData = JSON.parse(content);
        if (!data.collections || typeof data.collections !== 'object') {
          throw new Error('Archivo JSON inválido: no contiene el bloque de colecciones.');
        }
        const result = await restoreFromData(data);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

export async function resetAccountingData(): Promise<void> {
  try {
    const { resetAccountingApi } = await import('./localApi');
    await resetAccountingApi();
  } catch (error) {
    console.error("Error resetting accounting:", error);
    throw error;
  }
}
