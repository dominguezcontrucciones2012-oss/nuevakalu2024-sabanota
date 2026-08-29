import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

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
    // 1. Cargar el JSON agrupado
    console.log('Leyendo productos_agrupados.json...');
    const groupedData = JSON.parse(fs.readFileSync('C:\\Users\\domin\\.gemini\\antigravity-ide\\brain\\25e1cb83-98cc-4336-9c80-ebe89a2f0e28\\productos_agrupados.json', 'utf8'));
    
    // Crear mapa rápido para actualización
    const updateMap = new Map();
    for (const p of groupedData.bloque1_repuestos_ferreteria) {
      updateMap.set(p.id, { imageUrl: p.imagen, category: p.categoria, nombre: p.nombre });
    }
    for (const p of groupedData.bloque2_viveres_agro) {
      updateMap.set(p.id, { imageUrl: p.imagen, category: p.categoria, nombre: p.nombre });
    }

    console.log(`Se encontraron ${updateMap.size} productos mapeados en el JSON local.`);

    // 2. Conectar a Firestore y respaldar colección
    const snapshot = await getDocs(collection(db, 'products'));
    console.log(`Encontrados ${snapshot.size} productos en Firestore (collection: 'products').`);
    
    const backup = [];
    let updatedCount = 0;

    for (const document of snapshot.docs) {
      const data = document.data();
      backup.push({ id: document.id, ...data });

      // Verificamos si tenemos la actualización en nuestro map
      const updateData = updateMap.get(document.id);
      if (updateData) {
        // Ejecutamos MERGE
        await setDoc(doc(db, 'products', document.id), updateData, { merge: true });
        updatedCount++;
      } else {
         // Si por alguna razón el ID de firestore no está en el mapa, intentamos buscar por nombre
         // ya que 'db_dump.json' podría haber tenido los ids en las keys o no.
         const fallback = Array.from(updateMap.values()).find(x => data.name && x.nombre === data.name);
         if(fallback){
            await setDoc(doc(db, 'products', document.id), { imageUrl: fallback.imageUrl, category: fallback.category }, { merge: true });
            updatedCount++;
         }
      }
    }

    fs.writeFileSync('C:\\Users\\domin\\.gemini\\antigravity-ide\\brain\\25e1cb83-98cc-4336-9c80-ebe89a2f0e28\\backup_products_pre_migration.json', JSON.stringify(backup, null, 2));
    console.log(`Backup guardado exitosamente: backup_products_pre_migration.json`);
    console.log(`Migración completada. ${updatedCount} productos actualizados con imágenes y categoría.`);

  } catch (error) {
    console.error("Error durante la migración:", error);
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
