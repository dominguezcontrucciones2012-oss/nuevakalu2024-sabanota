import { fetchCollection } from './localApi';

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
}

export async function fetchOperationalData(): Promise<BackupData> {
  // Intentar obtener respaldo completo atómico del backend
  try {
    const res = await fetch(`${BACKUP_API_URL}/full-backup`);
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

  // Enviar al endpoint seguro de restauración en caliente del backend
  const res = await fetch(`${BACKUP_API_URL}/restore-backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function exportToJson(): Promise<void> {
  const data = await fetchOperationalData();
  const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `kalu_copia_seguridad_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importFromJson(file: File): Promise<any> {
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
    const { clearCollection, fetchCollection, updateLocalDoc } = await import('./localApi');
    const collectionsToClear = [
      'transactions',
      'invoices',
      'shift_transactions',
      'shift_sessions',
      'cashClosings',
      'sales',
      'expenses',
      'payments',
      'bills',
      'installments',
      'kardex'
    ];
    for (const c of collectionsToClear) {
      try {
        await clearCollection(c);
      } catch (e) {
        console.warn(`Could not clear ${c}:`, e);
      }
    }

    // Reset all clients debts in local database
    const clis = await fetchCollection('clients');
    if (Array.isArray(clis)) {
      for (const d of clis) {
        await updateLocalDoc('clients', d.id, { outstandingDebt: 0, loyaltyPoints: 0 });
      }
    }

    // Reset all suppliers debts in local database
    const sups = await fetchCollection('suppliers');
    if (Array.isArray(sups)) {
      for (const d of sups) {
        await updateLocalDoc('suppliers', d.id, { balanceOwed: 0, storeDebt: 0 });
      }
    }
  } catch (error) {
    console.error("Error resetting accounting:", error);
    throw error;
  }
}
