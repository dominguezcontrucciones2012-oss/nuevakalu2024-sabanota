import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  updateDoc, 
  addDoc,
  deleteDoc,
  getDoc,
  serverTimestamp,
  increment,
  onSnapshot,
  getDocFromServer, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentSingleTabManager, 
  limit, 
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { db, isMock, storage } from './firebase';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Helper para mapear la billetera del cliente según la tienda activa
export const mapClientWallet = (clientData: any, storeId?: string) => {
  if (!clientData) return clientData;
  const sid = storeId || getActiveStoreId();
  const wallet = clientData.wallets?.[sid] || { saldo_usd: clientData.saldo_usd || 0, puntos: clientData.puntos || 0 };
  return { ...clientData, saldo_usd: wallet.saldo_usd, puntos: wallet.puntos };
};

const uploadBase64IfPresent = async (dataObj: any) => {
  if (isMock) return dataObj;
  const newData = { ...dataObj };
  try {
    if (typeof newData.capture_base64 === 'string' && newData.capture_base64.startsWith('data:image')) {
      const filename = `captures/cap_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      const storageRef = ref(storage, filename);
      const metadata = { contentType: 'image/jpeg' };
      await uploadString(storageRef, newData.capture_base64, 'data_url', metadata);
      newData.capture_base64 = await getDownloadURL(storageRef);
      console.log('✅ capture_base64 subido a Storage:', newData.capture_base64.substring(0, 80));
    }
    if (Array.isArray(newData.captures_pago)) {
      const newCaptures: string[] = [];
      for (let i = 0; i < newData.captures_pago.length; i++) {
        const item = newData.captures_pago[i];
        if (typeof item === 'string' && item.startsWith('data:image')) {
          const filename = `captures/cap_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.jpg`;
          const storageRef = ref(storage, filename);
          const metadata = { contentType: 'image/jpeg' };
          await uploadString(storageRef, item, 'data_url', metadata);
          const url = await getDownloadURL(storageRef);
          console.log('✅ captures_pago[' + i + '] subido a Storage:', url.substring(0, 80));
          newCaptures.push(url);
        } else {
          newCaptures.push(item);
        }
      }
      newData.captures_pago = newCaptures;
    }
  } catch (e: any) {
    console.error('❌ Error subiendo imagen a Storage:', e?.code || e?.message || e);
  }
  return newData;
};
import { MOCK_PRODUCTS, MOCK_CLIENTS, MOCK_SALES } from '../data/mockData';

// Local storage keys
const LS_KEYS = {
  products: 'kalu_products',
  clients: 'kalu_clients',
  sales: 'kalu_sales',
  users: 'kalu_users'
};

// Local storage helpers
const getLS = (key: string) => JSON.parse(localStorage.getItem(key) || 'null');
const setLS = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

// Initialize local storage if empty
if (typeof window !== 'undefined' && !localStorage.getItem(LS_KEYS.products)) {
  setLS(LS_KEYS.products, MOCK_PRODUCTS);
  setLS(LS_KEYS.clients, MOCK_CLIENTS);
  setLS(LS_KEYS.sales, MOCK_SALES);
  setLS(LS_KEYS.users, []);
  setLS('kalu_tasas_bcv', [{
    fecha: new Date().toISOString().split('T')[0],
    valor: 40.50,
    fuente: 'Manual / Interna',
    estatus: 'Manual',
    sincronizadoEn: new Date().toISOString()
  }]);
}


/**
 * Función para sembrar los datos mock en Firestore.
 * Solo debe usarse una vez para inicializar la base de datos.
 */
export async function seedDatabase() {
  console.log("Iniciando sembrado de datos...");

  // Sembrar Productos
  for (const product of MOCK_PRODUCTS) {
    await setDoc(doc(db, 'products', product.id), {
      ...product,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  // Sembrar Clientes
  for (const client of MOCK_CLIENTS) {
    await setDoc(doc(db, 'clients', client.id), {
      ...client,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  // Sembrar Ventas (Opcional, para historial)
  for (const sale of MOCK_SALES) {
    await setDoc(doc(db, 'sales', sale.id), {
      ...sale,
      createdAt: serverTimestamp()
    });
  }

  console.log("Sembrado completado con éxito.");
}

/**
 * Helpers genéricos para Firestore
 */

export const getActiveStoreId = () => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const storeParam = params.get('store');
    if (storeParam) {
      localStorage.setItem('activeStoreId', storeParam);
      return storeParam;
    }
    const savedStore = localStorage.getItem('activeStoreId');
    if (savedStore) {
      params.set('store', savedStore);
      const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
      return savedStore;
    }
    
    // Si no hay parámetro ni caché, fijamos la tienda principal por defecto
    localStorage.setItem('activeStoreId', 'kalu-queso-sanjuan');
    params.set('store', 'kalu-queso-sanjuan');
    const newUrlFallback = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, '', newUrlFallback);
    return 'kalu-queso-sanjuan';
  }
  return 'kalu-queso-sanjuan';
};

export const withStore = (data: any) => {
  if (!data.storeId) {
    return { ...data, storeId: getActiveStoreId() };
  }
  return data;
};

export const subscribeToCollection = (collectionName: string, callback: (data: any[]) => void) => {
  if (isMock) {
    const fetchCollection = () => {
      fetch(`/api/db/${collectionName}`)
        .then(r => {
          if (!r.ok) throw new Error("Error fetching collection");
          return r.json();
        })
        .then(data => callback(data))
        .catch(e => console.error(`Error in subscribeToCollection for ${collectionName}:`, e));
    };

    fetchCollection();
    
    // Poll the dev server for multi-device sync with optimized intervals
    const intervalTime = collectionName === 'sales' ? 8000 : 4000;
    const interval = setInterval(fetchCollection, intervalTime);
    return () => clearInterval(interval);
  }

  let unsub = () => {};
  let retryCount = 0;

  const setupListener = () => {
    const storeId = getActiveStoreId();
    let q;
    const collectionsToFilter = ['products', 'sales', 'ventas_pausadas', 'cierres_caja', 'movimientos_productores', 'asientos', 'inventory_audit', 'gastos', 'compras_mercancia', 'providers', 'mensajes', 'sorteos_activos'];
    if (collectionsToFilter.includes(collectionName)) {
      q = query(collection(db, collectionName), where('storeId', '==', storeId));
    } else {
      q = query(collection(db, collectionName));
    }

    unsub = onSnapshot(q, 
      (snapshot) => {
        retryCount = 0; // reset on success
        const data = snapshot.docs.map(doc => {
           let docData = { ...doc.data(), id: doc.id };
           if (collectionName === 'clients') docData = mapClientWallet(docData);
           return docData;
        });
        // Si viene del caché y está vacío, ignoramos para no borrar la UI mientras conecta (especialmente útil si la red es lenta)
        if (snapshot.metadata.fromCache && data.length === 0) {
          console.log(`Cache vacío para ${collectionName}, esperando red...`);
          return;
        }
        callback(data);
      },
      (error) => {
        console.error(`Firebase error en subscribeToCollection (${collectionName}):`, error);
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
        
        // NO llamamos a callback([]) aquí. Si Firebase falla en conectar (ej. CANTV bloqueando WebSockets), 
        // simplemente dejamos que el caché local (IndexedDB) mantenga la UI viva con los últimos datos conocidos.
        
        setTimeout(() => {
          unsub();
          setupListener();
        }, delay);
      }
    );
  };

  setupListener();
  return () => unsub();
};

export const subscribeToDocument = (collectionName: string, id: string, callback: (data: any) => void) => {
  if (!id) {
    callback(null);
    return () => {};
  }
  if (isMock) {
    const fetchDoc = () => {
      fetch(`/api/db/${collectionName}/${id}`)
        .then(r => {
          if (!r.ok) throw new Error("Error fetching doc");
          return r.json();
        })
        .then(data => callback(data))
        .catch(e => {
          console.error(`Error in subscribeToDocument:`, e);
          callback(null);
        });
    };
    fetchDoc();
    const interval = setInterval(fetchDoc, 5000);
    return () => clearInterval(interval);
  }

  return onSnapshot(doc(db, collectionName, id), (snapshot) => {
    if (snapshot.exists()) {
      let docData = { id: snapshot.id, ...snapshot.data() };
      if (collectionName === 'clients') docData = mapClientWallet(docData);
      callback(docData);
    } else {
      callback(null);
    }
  });
};

export const subscribeToUserSales = (clientIds: string[], callback: (data: any[]) => void) => {
  if (!clientIds || clientIds.length === 0) {
    callback([]);
    return () => {};
  }
  if (isMock) {
    const fetchSales = () => {
      fetch(`/api/db/sales`)
        .then(r => r.json())
        .then(data => {
          const filtered = data.filter((s: any) => clientIds.includes(s.cliente_id));
          callback(filtered);
        })
        .catch(e => console.error(e));
    };
    fetchSales();
    const interval = setInterval(fetchSales, 8000);
    return () => clearInterval(interval);
  }

  const q = query(collection(db, 'sales'), where('cliente_id', 'in', clientIds));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    callback(data);
  });
};

export const subscribeToUserMessages = (clientIds: string[], callback: (data: any[]) => void) => {
  if (isMock) {
    const fetchMsgs = () => {
      fetch(`/api/db/mensajes`)
        .then(r => r.json())
        .then(data => {
          const filtered = data.filter((m: any) => 
            clientIds.includes(m.cliente_id) || 
            m.cliente_id === 'todos' ||
            m.cliente_id === 'global' ||
            !m.cliente_id
          );
          callback(filtered);
        })
        .catch(e => console.error(e));
    };
    fetchMsgs();
    const interval = setInterval(fetchMsgs, 8000);
    return () => clearInterval(interval);
  }

  const idsToSearch = Array.from(new Set([...clientIds, 'todos', 'global']));
  if (idsToSearch.length > 10) idsToSearch.length = 10; // Firebase 'in' limit
  
  const q = query(collection(db, 'mensajes'), where('cliente_id', 'in', idsToSearch));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    callback(data);
  });
};



export const updateStock = async (productId: string, quantity: number, motivo: string = 'VENTA', userId: string = 'current-user', piezaId?: string) => {
  if (isMock) {
    try {
      const getRes = await fetch(`/api/db/products/${productId}`);
      if (getRes.ok) {
        const product = await getRes.json();
        product.stock -= quantity;
        await fetch(`/api/db/products/${productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(product)
        });
      }
    } catch (e) {
      console.error("Error updating stock in mock mode:", e);
    }
  } else {
    const productRef = doc(db, 'products', productId);
    
    if (piezaId) {
      // Si estamos descontando una pieza específica, usar TRANSACCIÓN para evitar venta doble
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(productRef);
        if (!docSnap.exists()) {
          throw new Error("El producto no existe");
        }
        
        const productData = docSnap.data();
        if (piezaId && Array.isArray(productData.piezas)) {
          const pieza = productData.piezas.find((p: any) => p.id === piezaId);
          if (pieza && pieza.vendida) {
            throw new Error("PIECE_ALREADY_SOLD");
          }
          
          const updatedPiezas = productData.piezas.map((p: any) => 
            p.id === piezaId ? { ...p, vendida: true } : p
          );
          
          // No descontamos de 'stock' maestro para evitar que quede en negativo y Firebase lo bloquee.
          // El stock de productos con piezas se calcula dinámicamente en la UI sumando los pesos.
          transaction.update(productRef, {
            piezas: updatedPiezas,
            updatedAt: serverTimestamp()
          });
        }
      });
    } else {
      // Flujo normal para productos genéricos
      try {
        await updateDoc(productRef, {
          stock: increment(-quantity),
          updatedAt: serverTimestamp()
        });
      } catch (e: any) {
        throw new Error('updateDoc_products: ' + e.message);
      }
    }
  }

  // Auditoría automática según el modelo AuditoriaInventario
  try {
    await addDocument('auditoria_inventario', {
      producto_id: productId,
      usuario_id: userId,
      tipo_movimiento: quantity > 0 ? 'SALIDA' : 'ENTRADA',
      cantidad: Math.abs(quantity),
      motivo: motivo,
      fecha: new Date().toISOString()
    });
  } catch (e: any) {
    throw new Error('addDoc_auditoria: ' + e.message);
  }
};

/**
 * Configuración de Empresa
 */
export const getAppConfig = async () => {
  if (isMock) return null;
  const storeId = getActiveStoreId();
  let configRef = doc(db, 'configuracion', storeId);
  let snap = await getDoc(configRef);
  
  if (!snap.exists() && storeId === 'kalu-queso-sanjuan') {
    configRef = doc(db, 'configuracion', 'global');
    snap = await getDoc(configRef);
  }
  
  return snap.exists() ? snap.data() : null;
};

export const updateAppConfig = async (config: any) => {
  const { id, ...configData } = config;
  return setDoc(doc(db, 'configuracion', getActiveStoreId()), {
    ...configData,
    updatedAt: serverTimestamp()
  });
};


export const createClient = async (clientData: any, authUid?: string) => {
  if (isMock) {
    try {
      const clientsRes = await fetch('/api/db/clients');
      const clients = await clientsRes.json();
      const newId = authUid || `c${clients.length + 1}`;
      
      const newClient = { 
        id: newId,
        nombre: clientData.nombre,
        cedula: clientData.cedula,
        telefono: clientData.telefono || '',
        direccion: clientData.direccion || '',
        saldo_usd: clientData.saldo_usd || 0, 
        puntos: clientData.puntos || 0 
      };

      // Guardar el nuevo cliente
      await fetch(`/api/db/clients/${newId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient)
      });
      
      // Guardar el nuevo usuario del portal
      const lastFour = clientData.cedula.slice(-4);
      const newUser = { 
        id: newId,
        username: clientData.nombre, 
        role: 'cliente', 
        pin: clientData.pin || lastFour,
        email: clientData.email || null,
        cedula: clientData.cedula,
        telefono: clientData.telefono || '',
        clientId: newId
      };
      
      await fetch(`/api/db/users/${newId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      
      return newId;
    } catch (e) {
      console.error("Error creating client in mock mode:", e);
      throw e;
    }
  }

  // 1. Crear el registro de cliente para el negocio
  let docId = authUid;
  const storeId = getActiveStoreId();
  
  const clientDataToSave = {
    nombre: clientData.nombre,
    cedula: clientData.cedula,
    email: clientData.email || null,
    telefono: clientData.telefono || '',
    direccion: clientData.direccion || '',
    wallets: {
      [storeId]: {
        saldo_usd: clientData.saldo_usd || 0,
        puntos: clientData.puntos || 0
      }
    },
    origen_store_id: storeId
  };
  
  const clientRef = collection(db, 'clients');
  
  if (docId) {
    await setDoc(doc(db, 'clients', docId), clientDataToSave);
  } else {
    const docRef = await addDoc(clientRef, clientDataToSave);
    docId = docRef.id;
  }

  // 2. Crear el usuario para el Portal del Cliente
  const lastFour = clientData.cedula.slice(-4);
  
  await setDoc(doc(db, 'users', docId), {
    username: clientData.nombre,
    nombre: clientData.nombre,
    role: 'cliente',
    pin: clientData.pin || lastFour,
    cedula: clientData.cedula,
    email: clientData.email || null,
    telefono: clientData.telefono || '',
    direccion: clientData.direccion || '',
    clientId: docId,
    requirePinChange: clientData.pin ? false : true,
    createdAt: serverTimestamp()
  });

  return docId;
};

export const ensureClientExistsForStore = async (user: any) => {
  return user.clientId || user.id;
};

export const checkPinUnique = async (pin: string): Promise<boolean> => {
  if (isMock) {
    try {
      const res = await fetch('/api/db/users');
      if (res.ok) {
        const users = await res.json();
        return !users.some((u: any) => u.pin === pin);
      }
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('pin', '==', pin));
  const snap = await getDocs(q);
  return snap.empty;
};

export const resetClientPin = async (clientId: string, newPin: string) => {
  if (isMock) {
    try {
      await fetch(`/api/db/users/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin })
      });
    } catch(e) {
      console.error(e);
    }
    return;
  }
  
  const userRef = doc(db, 'users', clientId);
  await setDoc(userRef, {
    pin: newPin,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

// AUTO-CANCELACIÓN DE PEDIDOS WEB EXPIRADOS (12 HORAS)
export const autoCancelExpiredOrders = async () => {
  console.log("Ejecutando limpieza de pedidos web expirados...");
  if (isMock) {
    try {
      const res = await fetch('/api/db/sales');
      if (res.ok) {
        const sales = await res.json();
        const now = Date.now();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        
        for (const sale of sales) {
          if (sale.origen === 'web' && sale.status_pedido === 'pendiente') {
            const saleDate = new Date(sale.fecha || 0).getTime();
            if (now - saleDate > twelveHoursMs) {
              console.log(`Cancelando pedido expirado: ${sale.id}`);
              // Actualizar estado
              sale.status_pedido = 'cancelado';
              await fetch(`/api/db/sales/${sale.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sale)
              });
              // Restaurar inventario
              for (const item of (sale.detalles || [])) {
                await updateStock(item.producto_id, -item.cantidad, 'CANCELACION_AUTOMATICA', 'sistema');
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
    return;
  }

  // Lógica para Firebase Real
  try {
    const q = query(collection(db, 'sales'), where('storeId', '==', getActiveStoreId()), where('origen', '==', 'web'), where('status_pedido', '==', 'pendiente'));
    const snapshot = await getDocs(q);
    const now = Date.now();
    const twelveHoursMs = 12 * 60 * 60 * 1000;

    const batchToCancel = [];
    for (const docSnap of snapshot.docs) {
      const sale = docSnap.data();
      const saleDate = new Date(sale.fecha || 0).getTime();
      if (now - saleDate > twelveHoursMs) {
        batchToCancel.push({ id: docSnap.id, ...sale });
      }
    }

    for (const sale of batchToCancel) {
      console.log(`Cancelando pedido expirado: ${sale.id}`);
      await updateDoc(doc(db, 'sales', sale.id), { status_pedido: 'cancelado' });
      for (const item of (sale.detalles || [])) {
        await updateStock(item.producto_id, -item.cantidad, 'CANCELACION_AUTOMATICA', 'sistema');
      }
    }
  } catch (e) {
    console.error("Error cancelando pedidos web expirados:", e);
  }
};

export const createSale = async (saleData: any) => {
  const codigo_pedido = saleData.codigo_pedido || Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits numeric ID

  if (isMock) {
    try {
      const salesRes = await fetch('/api/db/sales');
      const sales = await salesRes.json();
      const nextNum = sales.length + 1001;
      const newId = String(nextNum);
      const newSale = { ...saleData, codigo_pedido, id: newId, createdAt: new Date().toISOString() };
      
      await fetch(`/api/db/sales/${newId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSale)
      });
      return newId;
    } catch (e) {
      console.error("Error creating sale in mock mode:", e);
      throw e;
    }
  }

  const salesRef = collection(db, 'sales');
  const finalSaleData = withStore(saleData);
  const dataWithImage = await uploadBase64IfPresent(finalSaleData);
  const docRef = await addDoc(salesRef, {
    ...dataWithImage,
    codigo_pedido,
    createdAt: serverTimestamp()
  });

  // Si no es un abono, generar ticket para el sorteo semanal automáticamente
  if (saleData.tipo_transaccion !== 'abono') {
    try {
      const sorteosRef = collection(db, 'sorteos_activos');
      
      // Censurar apellido para el panel público
      const nombreSplit = (saleData.nombre_cliente || 'Consumidor Final').trim().split(' ');
      const nombreCensurado = nombreSplit.length > 1 
        ? `${nombreSplit[0]} ${nombreSplit[1].charAt(0)}.` 
        : nombreSplit[0];

      await addDoc(sorteosRef, {
        codigo_pedido,
        sale_id: docRef.id,
        cliente_id: saleData.cliente_id || null,
        cliente_nombre_censurado: nombreCensurado,
        fecha: new Date().toISOString(),
        storeId: getActiveStoreId()
      });
    } catch (err) {
      console.error("Error creando ticket de sorteo:", err);
    }
  }

  // Notificar a n8n si es un pedido web y hay URL configurada
  if (saleData.origen === 'web') {
    try {
      const config = await getAppConfig();
      if (config && config.n8n_webhook_url) {
        fetch(config.n8n_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'new_order', orderId: docRef.id, ...saleData })
        }).catch(err => console.error("Error notifying n8n:", err));
      }
    } catch (e) {
      console.error("Error fetching config for n8n:", e);
    }
  }

  return docRef.id;
};


/**
 * Operaciones Genéricas CRUD
 */

export const addDocument = async (collectionName: string, data: any) => {
  if (isMock) {
    const response = await fetch(`/api/db/${collectionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error al añadir documento');
    return await response.json();
  }
  
  const finalData = withStore(data);
  const dataWithImage = await uploadBase64IfPresent(finalData);
  const { id, ...saveData } = dataWithImage;
  const docRef = await addDoc(collection(db, collectionName), {
    ...saveData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
};


export const getDocument = async (collectionName: string, id: string) => {
  if (isMock) {
    try {
      const res = await fetch(`/api/db/${collectionName}/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }

  const docRef = doc(db, collectionName, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    let docData = { id: docSnap.id, ...docSnap.data() };
    if (collectionName === 'clients') docData = mapClientWallet(docData);
    return docData;
  }
  return null;
};


export const updateDocument = async (collectionName: string, docId: string, data: any) => {
  if (isMock) {
    try {
      const getRes = await fetch(`/api/db/${collectionName}/${docId}`);
      let current = {};
      if (getRes.ok) {
        current = await getRes.json();
      }
      const updated = { ...current, ...data, id: docId, updatedAt: new Date().toISOString() };
      
      await fetch(`/api/db/${collectionName}/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error("Error updating document in mock:", e);
    }
    return;
  }

  const docRef = doc(db, collectionName, docId);
  const finalData = collectionName === 'clients' ? data : withStore(data);
  const dataWithImage = await uploadBase64IfPresent(finalData);
  const { id: _, ...updateData } = dataWithImage;
  
  if (collectionName === 'clients') {
    const storeId = getActiveStoreId();
    const currentSnap = await getDoc(docRef);
    const currentData = currentSnap.exists() ? currentSnap.data() : {};
    const wallets = currentData.wallets || {};
    
    const existingWallet = wallets[storeId] || { saldo_usd: currentData.saldo_usd || 0, puntos: currentData.puntos || 0 };
    wallets[storeId] = {
      saldo_usd: updateData.saldo_usd !== undefined ? updateData.saldo_usd : existingWallet.saldo_usd,
      puntos: updateData.puntos !== undefined ? updateData.puntos : existingWallet.puntos
    };
    
    updateData.wallets = wallets;
    delete updateData.saldo_usd;
    delete updateData.puntos;
  }
  
  await updateDoc(docRef, {
    ...updateData,
    updatedAt: serverTimestamp()
  });
};


export const deleteDocument = async (collectionName: string, id: string) => {
  if (isMock) {
    try {
      await fetch(`/api/db/${collectionName}/${id}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.error(e);
    }
    return;
  }

  const docRef = doc(db, collectionName, id);
  await deleteDoc(docRef);
};


/**
 * Tasa BCV
 */
export const getLatestTasa = async () => {
  try {
    if (isMock) {
      const res = await fetch('/api/db/tasas_bcv');
      if (res.ok) {
        const tasas = await res.json();
        if (tasas.length > 0) {
          const sorted = tasas.sort((a: any, b: any) => {
            const timeA = a.sincronizadoEn?.seconds ? a.sincronizadoEn.seconds * 1000 : (typeof a.sincronizadoEn === 'string' ? new Date(a.sincronizadoEn).getTime() : 0);
            const timeB = b.sincronizadoEn?.seconds ? b.sincronizadoEn.seconds * 1000 : (typeof b.sincronizadoEn === 'string' ? new Date(b.sincronizadoEn).getTime() : 0);
            return timeB - timeA;
          });
          return sorted[0].valor;
        }
      }
      return 40.50;
    }
    
    const projectId = 'kalu-queso-sanjuam';
    
    const fetchDirect = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/tasas_bcv?pageSize=50&orderBy=fecha+desc`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (json.documents && json.documents.length > 0) {
          const sorted = json.documents
            .map((d: any) => ({
              fecha: d.fields?.fecha?.stringValue || '',
              valor: parseFloat(d.fields?.valor?.doubleValue ?? d.fields?.valor?.integerValue ?? 0)
            }))
            .filter((d: any) => d.valor > 100)
            .sort((a: any, b: any) => b.fecha.localeCompare(a.fecha));
          if (sorted.length > 0) return sorted[0].valor;
        }
        throw new Error('No docs');
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const fetchProxy = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch('/api/bcv-rate?force=false', { signal: controller.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (json.rate && json.rate > 100) return Number(json.rate);
        throw new Error('No valid rate');
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const val = await Promise.any([fetchDirect(), fetchProxy()]).catch(() => null);
    if (val) return val;

    // Fallback final a SDK si las dos REST fallan (muy poco probable)
    const tasasRef = collection(db, 'tasas_bcv');
    const allTasas = await getDocs(tasasRef);
    if (!allTasas.empty) {
      const tasasData = allTasas.docs.map(d => ({ id: d.id, ...d.data() }) as any);
      const sorted = tasasData.sort((a: any, b: any) => {
        const dateA = a.fecha || a.id || '';
        const dateB = b.fecha || b.id || '';
        if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
        const timeA = a.sincronizadoEn?.seconds ? a.sincronizadoEn.seconds * 1000 : 0;
        const timeB = b.sincronizadoEn?.seconds ? b.sincronizadoEn.seconds * 1000 : 0;
        return timeB - timeA;
      });
      return Number(sorted[0].valor) || 737.88;
    }
  } catch (e) {
    console.error("Error getting latest tasa:", e);
  }
  return 737.88; // Última tasa conocida segura en duro
};

export const syncLatestTasa = async () => {
  console.log("Sincronizando tasa oficial BCV...");

  const today = new Date().toISOString().split('T')[0];
  let officialRate: number | null = null;

  try {
    // Llamar por la ruta del mismo dominio (sin CORS, sin bloqueos de CANTV)
    const apiUrl = `/api/bcv-rate?cb=${Date.now()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // El proxy devuelve: { rate: number, fecha: string, fuente: string }
    officialRate = json.rate ?? null;
  } catch (e) {
    console.warn("No se pudo obtener la tasa BCV online:", e);
  }


  if (!officialRate || officialRate <= 0) {
    throw new Error("No se pudo obtener una tasa válida del BCV. Verifica tu conexión a internet.");
  }

  const tasaData = {
    id: `tasa-${today}`,
    fecha: today,
    valor: parseFloat(officialRate.toFixed(4)),
    fuente: 'BCV (Oficial) — ve.dolarapi.com',
    estatus: 'Sincronizada',
    sincronizadoEn: new Date().toISOString()
  };

  if (isMock) {
    try {
      // 1. Borrar cualquier entrada previa del mismo día para evitar duplicados
      const existing = await fetch('/api/db/tasas_bcv');
      if (existing.ok) {
        const all = await existing.json();
        for (const t of all) {
          if (t.fecha === today && t.id && t.id !== tasaData.id) {
            await fetch(`/api/db/tasas_bcv/${t.id}`, { method: 'DELETE' });
          }
          // También eliminar entradas sin id que sean del mismo día
          if (t.fecha === today && !t.id) {
            // No se pueden borrar por id, las sobreescribimos con una actualizacion forzada
          }
        }
      }
      // 2. Guardar la nueva entrada
      await fetch(`/api/db/tasas_bcv/${tasaData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasaData)
      });
      return tasaData;
    } catch (e) {
      console.error(e);
    }
    return tasaData;
  }
  
  // La Cloud Function (getBcvRate) ya guarda el resultado en Firestore, 
  // usando admin-SDK que evade las reglas de seguridad. 
  // Así que el frontend no necesita (ni tiene permisos como anónimo) para guardarlo.
  return tasaData;
};

export const updateManualTasa = async (nuevoValor: number) => {
  const today = new Date().toISOString().split('T')[0];
  const tasaData = {
    id: `tasa-${today}`,
    fecha: today,
    valor: nuevoValor,
    fuente: 'Manual / Interna',
    estatus: 'Manual',
    sincronizadoEn: new Date().toISOString()
  };
  
  if (isMock) {
    try {
      await fetch(`/api/db/tasas_bcv/${tasaData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasaData)
      });
    } catch (e) {
      console.error(e);
    }
    return tasaData;
  }

  await setDoc(doc(db, 'tasas_bcv', today), {
    ...tasaData,
    sincronizadoEn: serverTimestamp()
  });
  return tasaData;
};

/**
 * Ventas Pausadas
 */
export const pauseSale = async (saleData: any) => {
  return addDocument('ventas_pausadas', saleData);
};

export const deletePausedSale = async (id: string) => {
  return deleteDocument('ventas_pausadas', id);
};

/**
 * Cierres de Caja
 */
export const saveClosure = async (closureData: any) => {
  return addDocument('cierres_caja', closureData);
};

export const getTodaySales = async () => {
  if (isMock) {
    try {
      const salesRes = await fetch('/api/db/sales');
      const sales = await salesRes.json();
      const closuresRes = await fetch('/api/db/cierres_caja');
      const closures = await closuresRes.json();
      
      let lastClosureTime = 0;
      if (closures.length > 0) {
        const sortedClosures = closures.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
        lastClosureTime = new Date(sortedClosures[0].createdAt).getTime();
      }
      
      const todayStr = new Date().toISOString().split('T')[0];
      
      return sales.filter((s: any) => {
        if (!s.fecha) return false;
        const saleTime = new Date(s.fecha).getTime();
        return String(s.fecha || '').startsWith(todayStr) && saleTime > lastClosureTime;
      });
    } catch (e) {
      console.error(e);
      return [];
    }
  }
  
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const salesRef = collection(db, 'sales');
  const q = query(salesRef, where('storeId', '==', getActiveStoreId()), where('createdAt', '>=', startOfDay));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
};

export const getClosures = async () => {
  if (isMock) {
    try {
      const res = await fetch('/api/db/cierres_caja');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  }
  const q = query(
    collection(db, 'cierres_caja'),
    where('storeId', '==', getActiveStoreId()),
    orderBy('fecha', 'desc'),
    limit(30)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
};

/**
 * Movimientos de Productores
 */
export const addProductorMovement = async (mov: any) => {
  return addDocument('movimientos_productores', mov);
};

export const getProductorMovements = (productorId: string) => {
  if (isMock) {
    try {
      const res = fetch('/api/db/movimientos_productores').then(r => r.json());
      return res.then((movs: any) => movs.filter((m: any) => m.proveedor_id === productorId));
    } catch (e) {
      console.error(e);
    }
    return Promise.resolve([]);
  }
  const colRef = collection(db, 'movimientos_productores');
  const q = query(
    colRef,
    where('storeId', '==', getActiveStoreId()),
    where('proveedor_id', '==', productorId),
    orderBy('fecha', 'asc')
  );
  return getDocs(q).then(snapshot => snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
};
