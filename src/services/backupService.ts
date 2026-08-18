import { collection, getDocs, writeBatch, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const OPERATIONAL_COLLECTIONS = ['products', 'clients', 'suppliers', 'transactions', 'kardex'];

export interface BackupData {
  timestamp: string;
  collections: {
    [collectionName: string]: any[];
  };
}

/**
 * Reads all operational collections and builds a BackupData object.
 */
export async function fetchOperationalData(): Promise<BackupData> {
  const data: BackupData = {
    timestamp: new Date().toISOString(),
    collections: {}
  };

  for (const colName of OPERATIONAL_COLLECTIONS) {
    const snapshot = await getDocs(collection(db, colName));
    const docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
    data.collections[colName] = docs;
  }

  return data;
}

/**
 * Restores the database from a BackupData object using a WriteBatch.
 * This function clears existing operational collections before inserting.
 */
export async function restoreFromData(data: BackupData): Promise<void> {
  let batch = writeBatch(db);
  let operationCount = 0;

  const commitBatchIfNeeded = async () => {
    if (operationCount >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      operationCount = 0;
    }
  };

  // 1. Delete all current documents in operational collections
  for (const colName of OPERATIONAL_COLLECTIONS) {
    const snapshot = await getDocs(collection(db, colName));
    for (const docSnap of snapshot.docs) {
      batch.delete(docSnap.ref);
      operationCount++;
      await commitBatchIfNeeded();
    }
  }

  // 2. Insert documents from the backup data
  for (const colName of OPERATIONAL_COLLECTIONS) {
    const docs = data.collections[colName] || [];
    for (const docData of docs) {
      const { id, ...rest } = docData;
      if (!id) continue;
      const ref = doc(db, colName, id);
      batch.set(ref, docData);
      operationCount++;
      await commitBatchIfNeeded();
    }
  }

  // Commit any remaining operations
  if (operationCount > 0) {
    await batch.commit();
  }
}

/**
 * Creates a Snapshot point in Firestore at snapshots/RESTORE_POINT
 */
export async function createSnapshot(): Promise<void> {
  const data = await fetchOperationalData();
  const snapshotRef = doc(db, 'snapshots', 'RESTORE_POINT');
  await setDoc(snapshotRef, { 
    payload: JSON.stringify(data),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Restores from the snapshot point in Firestore.
 */
export async function restoreSnapshot(): Promise<void> {
  const snapshotRef = doc(db, 'snapshots', 'RESTORE_POINT');
  const snap = await getDoc(snapshotRef);
  if (!snap.exists()) {
    throw new Error('No existe un punto de restauración guardado.');
  }
  
  const payloadStr = snap.data().payload;
  if (!payloadStr) throw new Error('El punto de restauración está vacío.');

  const data: BackupData = JSON.parse(payloadStr);
  await restoreFromData(data);
}

/**
 * Triggers a browser download of the BackupData as a JSON file.
 */
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

/**
 * Reads a JSON file from the browser and restores the DB.
 */
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
