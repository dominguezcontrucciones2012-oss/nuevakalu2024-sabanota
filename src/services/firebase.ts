import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Reemplazar con las credenciales reales provistas por el usuario
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDmvrR4PyCeITbDccIW0sx_wAwVh_vPgNc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sistema-kalu-crm.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sistema-kalu-crm",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sistema-kalu-crm.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "640256708568",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:640256708568:web:2ca6de7fe49e6dc2fcecad"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service with persistent local cache
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

// Use emulator in local development (COMENTADO POR SEGURIDAD)
// if (import.meta.env.DEV) {
//   console.log("Conectando al emulador local de Firestore...");
//   connectFirestoreEmulator(db, '127.0.0.1', 8080);
// }

// Initialize Cloud Storage and get a reference to the service
export const storage = getStorage(app);

