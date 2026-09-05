import { fetchCollection } from './localApi';

const OPERATIONAL_COLLECTIONS = ['products', 'clients', 'suppliers', 'transactions', 'kardex'];

export interface BackupData {
  timestamp: string;
  collections: {
    [collectionName: string]: any[];
  };
}

export async function fetchOperationalData(): Promise<BackupData> {
  const data: BackupData = {
    timestamp: new Date().toISOString(),
    collections: {}
  };

  for (const colName of OPERATIONAL_COLLECTIONS) {
    const colData = await fetchCollection(colName);
    data.collections[colName] = colData;
  }

  return data;
}

export async function restoreFromData(data: BackupData): Promise<void> {
  throw new Error('Restore not supported in local mode directly yet. Please replace the .json files manually.');
}

export async function createSnapshot(): Promise<void> {
  throw new Error('Snapshots not supported in local mode.');
}

export async function restoreSnapshot(): Promise<void> {
  throw new Error('Snapshots not supported in local mode.');
}

export async function exportToJson(): Promise<void> {
  const data = await fetchOperationalData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `kalu_respaldo_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importFromJson(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data: BackupData = JSON.parse(content);
        if (!data.collections) throw new Error('Archivo JSON inválido.');
        await restoreFromData(data);
        resolve();
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
