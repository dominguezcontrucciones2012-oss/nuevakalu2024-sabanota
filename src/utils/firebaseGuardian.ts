import { getDocs, getDoc, setDoc, updateDoc, addDoc, DocumentReference, CollectionReference, Query, UpdateData, WithFieldValue, DocumentData } from 'firebase/firestore';

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
    this.recordRequest();
    if (options) {
      return await setDoc(docRef, data, options);
    }
    return await setDoc(docRef, data);
  }

  // @ts-ignore
  public async guardianUpdateDoc<T>(docRef: DocumentReference<T>, data: UpdateData<T>) {
    this.recordRequest();
    // @ts-ignore
    return await updateDoc(docRef, data);
  }

  public async guardianAddDoc<T>(collectionRef: CollectionReference<T>, data: WithFieldValue<T>) {
    this.recordRequest();
    return await addDoc(collectionRef, data);
  }
}

export const firebaseGuardian = new FirebaseGuardian();

export const guardianGetDocs = firebaseGuardian.guardianGetDocs.bind(firebaseGuardian);
export const guardianGetDoc = firebaseGuardian.guardianGetDoc.bind(firebaseGuardian);
export const guardianSetDoc = firebaseGuardian.guardianSetDoc.bind(firebaseGuardian);
export const guardianUpdateDoc = firebaseGuardian.guardianUpdateDoc.bind(firebaseGuardian);
export const guardianAddDoc = firebaseGuardian.guardianAddDoc.bind(firebaseGuardian);
