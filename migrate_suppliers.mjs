import { initializeApp } from 'firebase/app';
import { getFirestore, collection, setDoc, doc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

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
    const rawData = fs.readFileSync(path.join(process.cwd(), 'src', 'migrated_data.json'), 'utf-8');
    const data = JSON.parse(rawData);
    
    const suppliers = data.suppliers || [];
    console.log(`Migrando ${suppliers.length} proveedores a Firestore...`);
    
    for (const s of suppliers) {
      const supplierData = {
        id: s.id,
        name: s.name || '',
        contactName: s.contactName || s.contact || s.vendor || '',
        address: s.address || s.location || '',
        idCard: s.idCard || s.rfc || '',
        isCheeseProducer: s.isCheeseProducer === true || (s.name && s.name.toUpperCase().includes('CORCOVADO')),
        isWorker: s.isWorker || false,
        balanceOwed: Number(s.balanceOwed) || 0,
        storeDebt: Number(s.storeDebt) || 0,
        createdAt: new Date().toISOString()
      };
      
      console.log(`Migrando: ${supplierData.name} (Quesero: ${supplierData.isCheeseProducer})`);
      await setDoc(doc(db, 'suppliers', supplierData.id), supplierData, { merge: true });
    }
    console.log('Migración completada exitosamente.');
  } catch (error) {
    console.error("Error en migración:", error);
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
