import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
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

const rawData = fs.readFileSync('db_transactions.json', 'utf8');
const data = JSON.parse(rawData);

async function migrateData() {
  console.log('Iniciando migración de historial a Firebase...');

  const transactions = [];

  const ventas = data.ventas || [];
  for (const v of ventas) {
    transactions.push({
      id: `tx-v-${v.id}`,
      entity: `Venta #${v.id}`,
      category: 'ventas',
      date: v.fecha || new Date().toISOString(),
      invoiceNumber: `V-${v.id}`,
      amount: parseFloat(v.total_usd) || 0,
      isIncome: true,
      status: v.pagada ? 'Completado' : 'Pendiente',
      paymentMethod: v.es_fiado ? 'Fiado' : 'Múltiple'
    });
  }

  const compras = data.compras || [];
  for (const c of compras) {
    transactions.push({
      id: `tx-c-${c.id}`,
      entity: `Compra #${c.id}`,
      category: 'compras',
      date: c.fecha || new Date().toISOString(),
      invoiceNumber: c.numero_factura || `C-${c.id}`,
      amount: parseFloat(c.total_usd) || 0,
      isIncome: false,
      status: c.estado === 'Pagada' ? 'Completado' : 'Pendiente',
      paymentMethod: c.metodo_pago || 'N/A'
    });
  }

  const movs = data.movimientos_caja || [];
  for (const m of movs) {
    transactions.push({
      id: `tx-m-${m.id}`,
      entity: m.descripcion || 'Movimiento de Caja',
      category: m.tipo_movimiento === 'Ingreso' ? 'ventas' : 'gastos',
      date: m.fecha || new Date().toISOString(),
      invoiceNumber: `M-${m.id}`,
      amount: parseFloat(m.monto) || 0,
      isIncome: m.tipo_movimiento === 'Ingreso',
      status: 'Completado',
      paymentMethod: m.tipo_caja || 'N/A'
    });
  }

  console.log(`Migrando ${transactions.length} transacciones...`);
  
  let batch = writeBatch(db);
  let opCount = 0;
  let batchesDone = 0;

  for (const t of transactions) {
    const docRef = doc(db, 'transactions', t.id);
    batch.set(docRef, t);
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batchesDone++;
      console.log(`Lote ${batchesDone} completado.`);
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  console.log('¡Migración de transacciones completada exitosamente!');
  process.exit(0);
}

migrateData().catch(console.error);
