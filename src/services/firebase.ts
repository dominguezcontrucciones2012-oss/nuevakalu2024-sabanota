import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Reemplazar con las credenciales reales provistas por el usuario
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDzBNbtHgQsFdLaPMmPgPozcrQ69fQUJYo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sistemekalu.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sistemekalu",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sistemekalu.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "924429764977",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:924429764977:web:6e300555e2850618f74ed0",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-1PYQG9B27V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service with persistent local cache
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

// Use emulator in local development
if (import.meta.env.DEV) {
  console.log("Conectando al emulador local de Firestore...");
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Initialize Cloud Storage and get a reference to the service
export const storage = getStorage(app);

