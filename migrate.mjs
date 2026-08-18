import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const rawData = fs.readFileSync('db_dump.json', 'utf8');
const data = JSON.parse(rawData);

async function migrateData() {
  console.log('Iniciando migración masiva a Firebase...');

  // 1. Migrar Productos
  const products = data.productos || [];
  console.log(`Migrando ${products.length} productos...`);
  
  // Use batching (Firestore limit is 500 ops per batch)
  let batch = writeBatch(db);
  let opCount = 0;

  for (const p of products) {
    const docRef = doc(db, 'products', `prod-${p.id}`);
    const productData = {
      id: `prod-${p.id}`,
      name: p.nombre || 'Sin Nombre',
      category: p.categoria || 'Fresco',
      stockKg: parseFloat(p.stock) || 0,
      purchasePrice: parseFloat(p.costo_usd) || 0,
      sellingPrice: parseFloat(p.precio_normal_usd) || 0,
      alertThreshold: parseFloat(p.stock_minimo) || 10,
      agingDays: 0,
      origin: 'Sistema Anterior',
      sku: p.codigo || ''
    };
    batch.set(docRef, productData);
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  // 2. Migrar Clientes
  const clients = data.clientes || [];
  console.log(`Migrando ${clients.length} clientes...`);
  for (const c of clients) {
    const docRef = doc(db, 'clients', `cli-${c.id}`);
    const clientData = {
      id: `cli-${c.id}`,
      name: c.nombre || 'Cliente Desconocido',
      email: '',
      phone: c.telefono || '',
      loyaltyPoints: parseInt(c.puntos) || 0,
      outstandingDebt: parseFloat(c.saldo_usd) || 0,
      rfc: c.cedula || '',
      tier: 'Bronce'
    };
    batch.set(docRef, clientData);
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  // 3. Migrar Proveedores
  const suppliers = data.proveedores || [];
  console.log(`Migrando ${suppliers.length} proveedores...`);
  for (const s of suppliers) {
    const docRef = doc(db, 'suppliers', `sup-${s.id}`);
    const supplierData = {
      id: `sup-${s.id}`,
      name: s.nombre || 'Proveedor Desconocido',
      contact: s.vendedor_nombre || '',
      phone: s.telefono || '',
      email: '',
      balanceOwed: parseFloat(s.saldo_pendiente_usd) || 0,
      storeDebt: 0,
      contactName: s.vendedor_nombre || '',
      address: s.direccion || '',
      productsSupplied: [],
      isCheeseProducer: s.es_productor === 1,
      isEmployee: s.es_obrero === 1,
      rfc: s.rif || ''
    };
    batch.set(docRef, supplierData);
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  console.log('¡Migración completada exitosamente!');
  process.exit(0);
}

migrateData().catch(console.error);
