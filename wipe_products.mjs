import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

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
    const snapshot = await getDocs(collection(db, 'products'));
    console.log(`Borrando ${snapshot.size} productos en Firestore...`);
    for (const document of snapshot.docs) {
      console.log(`Eliminando ID: ${document.id} - ${document.data().name || 'Sin nombre'}`);
      await deleteDoc(doc(db, 'products', document.id));
    }
    console.log('Colección products 100% vacía en la nube.');
  } catch (error) {
    console.error("Error al borrar:", error);
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
