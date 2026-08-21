import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';

// Fallback config if env not found in Node context
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDmvrR4PyCeITbDccIW0sx_wAwVh_vPgNc",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "sistema-kalu-crm.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "sistema-kalu-crm",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "sistema-kalu-crm.appspot.com",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "620606132717",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:620606132717:web:8c5b058c42f0687d90d75c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    console.log(`Migrando proveedores para añadir cedula y PIN...`);
    const suppliersSnapshot = await getDocs(collection(db, 'suppliers'));
    for (const docSnap of suppliersSnapshot.docs) {
      const s = docSnap.data();
      const ced = s.cedula || s.rfc || s.idCard || '';
      const ced4 = ced.length >= 4 ? ced.slice(-4) : '';
      const ph = s.phone ? s.phone.replace(/\D/g, '') : '';
      const ph4 = ph.length >= 4 ? ph.slice(-4) : '0000';
      const pin = s.pin || (ced ? ced4 : ph4);
      
      const updates = {
        cedula: ced,
        rfc: ced,
        pin: pin
      };
      console.log(`Proveedor: ${s.name} - Cédula: ${ced} - PIN: ${pin}`);
      await setDoc(doc(db, 'suppliers', docSnap.id), updates, { merge: true });
    }
    
    console.log(`Migrando clientes para añadir cedula y PIN...`);
    const clientsSnapshot = await getDocs(collection(db, 'clients'));
    for (const docSnap of clientsSnapshot.docs) {
      const c = docSnap.data();
      const ced = c.cedula || c.rfc || c.idCard || '';
      const ced4 = ced.length >= 4 ? ced.slice(-4) : '';
      const ph = c.phone ? c.phone.replace(/\D/g, '') : '';
      const ph4 = ph.length >= 4 ? ph.slice(-4) : '0000';
      const pin = c.pin || (ced ? ced4 : ph4);
      
      const updates = {
        cedula: ced,
        rfc: ced,
        pin: pin
      };
      console.log(`Cliente: ${c.name} - Cédula: ${ced} - PIN: ${pin}`);
      await setDoc(doc(db, 'clients', docSnap.id), updates, { merge: true });
    }
    
    console.log('Migración completada exitosamente.');
  } catch (error) {
    console.error("Error en migración:", error);
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
