import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDzBNbtHgQsFdLaPMmPgPozcrQ69fQUJYo",
  authDomain: "sistemekalu.firebaseapp.com",
  projectId: "sistemekalu",
  storageBucket: "sistemekalu.firebasestorage.app",
  messagingSenderId: "924429764977",
  appId: "1:924429764977:web:6e300555e2850618f74ed0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function wipe() {
  console.log("Borrando transacciones y reseteando contabilidad en Firebase...");
  
  const txs = await getDocs(collection(db, 'transactions'));
  let i = 0;
  for (const doc of txs.docs) {
    await deleteDoc(doc.ref);
    i++;
  }
  console.log(`Borradas ${i} transacciones del historial.`);

  console.log("Reseteando deudas de proveedores...");
  const sups = await getDocs(collection(db, 'suppliers'));
  let s = 0;
  for (const doc of sups.docs) {
    await updateDoc(doc.ref, { balanceOwed: 0, storeDebt: 0 });
    s++;
  }
  console.log(`Reseteados ${s} proveedores a cero.`);

  console.log("Reseteando deudas de clientes...");
  const clis = await getDocs(collection(db, 'clients'));
  let c = 0;
  for (const doc of clis.docs) {
    await updateDoc(doc.ref, { outstandingDebt: 0, loyaltyPoints: 0 });
    c++;
  }
  console.log(`Reseteados ${c} clientes a cero.`);

  console.log("¡CONTABILIDAD LIMPIADA COMPLETAMENTE!");
  process.exit(0);
}

wipe().catch(err => {
  console.error("Error al limpiar:", err);
  process.exit(1);
});
