import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../services/localApi';

export const db = {};
export const collection = (dbInstance: any, path: string) => ({ path });
export const doc = (dbOrCollection: any, path?: string, id?: string) => {
  if (!path) {
    const autoId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    return { path: dbOrCollection.path ? `${dbOrCollection.path}/${autoId}` : autoId, id: autoId };
  }
  if (id) return { path: `${path}/${id}`, id };
  const derivedId = path.split('/').pop() || path;
  return { path: dbOrCollection.path ? `${dbOrCollection.path}/${path}` : path, id: derivedId };
};
export const increment = (val: number) => ({ type: 'increment', _operand: val });

export type Query<T = any> = any;
export type CollectionReference<T = any> = any;
export type DocumentReference<T = any> = any;
export type WithFieldValue<T = any> = any;
export type UpdateData<T = any> = any;
export const getDocs = async (query: any) => ({ docs: [] });
export const getDoc = async (docRef: any) => ({ exists: () => false, data: () => ({}) });



class FirebaseGuardian {
  private requestTimestamps: number[] = [];
  private readonly UMBRAL_PETICIONES = 40;
  private readonly VENTANA_TIEMPO_MS = 10000; // 10 segundos
  private readonly TIEMPO_BLOQUEO_MS = 30000; // 30 segundos
  private blockUntil: number = 0;

  private recordRequest() {
    const now = Date.now();
    
    // Si estamos bloqueados, lanzamos error
    if (now < this.blockUntil) {
      throw new Error(`[FIREBASE GUARDIAN] Petición bloqueada. Por favor espera ${Math.ceil((this.blockUntil - now)/1000)}s.`);
    }

    // Agregar nuevo timestamp
    this.requestTimestamps.push(now);

    // Limpiar timestamps viejos (fuera de la ventana de 10s)
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t <= this.VENTANA_TIEMPO_MS);

    // Revisar si superamos el umbral
    if (this.requestTimestamps.length > this.UMBRAL_PETICIONES) {
      this.blockUntil = now + this.TIEMPO_BLOQUEO_MS;
      console.error(`[FIREBASE GUARDIAN] ⚠️ ¡Bucle infinito detectado! Se ha bloqueado Firebase por 30 segundos. Más de ${this.UMBRAL_PETICIONES} peticiones en ${this.VENTANA_TIEMPO_MS/1000}s.`);
      
      // Emitir evento global para la UI
      window.dispatchEvent(new CustomEvent('FIREBASE_LOOP_DETECTED', { 
        detail: { 
          message: '⚠️ Alerta de Seguridad: Se ha detectado un bucle de peticiones repetitivas. Peticiones pausadas para proteger la cuota.',
          blockDurationMs: this.TIEMPO_BLOQUEO_MS
        } 
      }));
      
      throw new Error('[FIREBASE GUARDIAN] Bucle detectado. Bloqueando peticiones.');
    }
  }

  public async guardianGetDocs<T>(query: Query<T> | CollectionReference<T>) {
    this.recordRequest();
    return await getDocs(query);
  }

  public async guardianGetDoc<T>(docRef: DocumentReference<T>) {
    this.recordRequest();
    return await getDoc(docRef);
  }

  public async guardianSetDoc<T>(docRef: DocumentReference<T>, data: WithFieldValue<T>, options?: any) {
    if (docRef.path.startsWith('products/')) {
      const id = docRef.path.split('/')[1];
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    }
    this.recordRequest();
    if (options) {
      const parts = docRef.path.split('/');
    if (parts.length >= 2) {
       return await updateLocalDoc(parts[0], parts[1], data);
    }
    return await addLocalDoc(docRef.path, data);
    }
    const parts = docRef.path.split('/');
    if (parts.length >= 2) {
       return await updateLocalDoc(parts[0], parts[1], data);
    }
    return await addLocalDoc(docRef.path, data);
  }

  // @ts-ignore
  public async guardianUpdateDoc<T>(docRef: DocumentReference<T>, data: UpdateData<T>) {
    if (docRef.path.startsWith('products/')) {
      const id = docRef.path.split('/')[1];
      // Manejar increment()
      let parsedData = { ...data };
      for (const key of Object.keys(parsedData)) {
        if (parsedData[key] && typeof parsedData[key] === 'object' && parsedData[key].type === 'increment') {
           // Si logramos identificar increment, aunque lo ideal es enviarlo como _increment
           parsedData[key] = parsedData[key]._operand;
           parsedData[`adjust${key.charAt(0).toUpperCase() + key.slice(1)}`] = parsedData[key];
           delete parsedData[key];
        }
      }
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedData),
      });
      return res.json();
    }
    this.recordRequest();
    // @ts-ignore
    const parts = docRef.path.split('/');
    if (parts.length >= 2) {
       return await updateLocalDoc(parts[0], parts[1], data);
    }
  }

  public async guardianAddDoc<T>(collectionRef: CollectionReference<T>, data: WithFieldValue<T>) {
    if (collectionRef.path === 'products') {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    }
    this.recordRequest();
    return await addLocalDoc(collectionRef.path, data);
  }

  public async guardianDeleteDoc<T>(docRef: DocumentReference<T>) {
    if (docRef.path.startsWith('products/')) {
      const id = docRef.path.split('/')[1];
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE'
      });
      return res.json();
    }
    this.recordRequest();
    const parts = docRef.path.split('/');
    if (parts.length >= 2) {
       return await deleteLocalDoc(parts[0], parts[1]);
    }
  }
}

export const firebaseGuardian = new FirebaseGuardian();

export const guardianGetDocs = firebaseGuardian.guardianGetDocs.bind(firebaseGuardian);
export const guardianGetDoc = firebaseGuardian.guardianGetDoc.bind(firebaseGuardian);
export const guardianSetDoc = firebaseGuardian.guardianSetDoc.bind(firebaseGuardian);
export const guardianUpdateDoc = firebaseGuardian.guardianUpdateDoc.bind(firebaseGuardian);
export const guardianAddDoc = firebaseGuardian.guardianAddDoc.bind(firebaseGuardian);
export const guardianDeleteDoc = firebaseGuardian.guardianDeleteDoc.bind(firebaseGuardian);
