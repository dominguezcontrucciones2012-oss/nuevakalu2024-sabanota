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
    
    const products = data.products || [];
    console.log(`Migrando ${products.length} productos a Firestore...`);
    
    for (const p of products) {
      const productData = {
        id: p.id || `PROD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        code: p.code || p.id || '',
        name: String(p.name || '').toUpperCase().trim(),
        category: p.category || 'General',
        purchasePrice: Number(p.purchasePrice || p.cost || 0),
        sellingPrice: Number(p.sellingPrice || p.price || 0),
        stockKg: Number(p.stockKg || p.stock || 0),
        unit: p.unit || 'Kg',
        alertThreshold: Number(p.alertThreshold || 10),
        createdAt: new Date().toISOString()
      };
      
      console.log(`Migrando producto: ${productData.name} - Stock: ${productData.stockKg} ${productData.unit}`);
      await setDoc(doc(db, 'products', productData.id), productData, { merge: true });
    }
    console.log('Migración de productos completada exitosamente.');
  } catch (error) {
    console.error("Error en migración de productos:", error);
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
