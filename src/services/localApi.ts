import { io, Socket } from 'socket.io-client';

// Use standard relative/absolute routing instead of hardcoding localhost if possible, 
// but since the server runs on 3001 locally, we stick to localhost:3001.
// In a true local network setup with phones, we should use window.location.hostname
const hostname = window.location.hostname;
const API_URL = `http://${hostname}:3001/api`;
const SOCKET_URL = `http://${hostname}:3001`;

// Global Socket Instance
let socket: Socket | null = null;

export const initSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL);
    socket.on('connect', () => {
      console.log('Connected to local WebSocket server', socket?.id);
    });
  }
  return socket;
};

// Generic Collection Hook/Subscriber with Delta Updates
export const onCollectionSnapshot = (collectionName: string, callback: (data: any[]) => void) => {
  const currentSocket = initSocket();
  let cachedData: any[] = [];
  
  // Initial fetch
  fetchCollection(collectionName).then(data => {
    const rawData = Array.isArray(data) ? data : [];
    // Deduplicate by ID
    const uniqueMap = new Map();
    rawData.forEach(item => uniqueMap.set(String(item.id), item));
    cachedData = Array.from(uniqueMap.values());
    callback([...cachedData]);
  });

  // Listen for full collection updates (Fallback)
  const fallbackListener = (updatedCollection: string) => {
    if (updatedCollection === collectionName) {
      fetchCollection(collectionName).then(data => {
        const rawData = Array.isArray(data) ? data : [];
        const uniqueMap = new Map();
        rawData.forEach(item => uniqueMap.set(String(item.id), item));
        cachedData = Array.from(uniqueMap.values());
        callback([...cachedData]);
      });
    }
  };

  // Listen for granular delta updates
  const deltaListener = (payload: { action: string, collection: string, doc: any }) => {
    if (payload.collection === collectionName) {
      if (payload.action === 'add') {
        const index = cachedData.findIndex(d => String(d.id) === String(payload.doc.id));
        if (index === -1) {
           // Because backend uses .push() (adds to end), we should append it to maintain order parity.
           // However, if the caller locally unshifts it (like App.tsx setTransactions([newTx, ...prev])), 
           // we must match the backend's source of truth which is .push(). 
           // Wait, App.tsx's onCollectionSnapshot handler reverses transactions and sorts them anyway! 
           // So we just add it to the array.
           cachedData = [...cachedData, payload.doc];
        } else {
           cachedData[index] = payload.doc;
        }
      } else if (payload.action === 'update') {
        const index = cachedData.findIndex(d => String(d.id) === String(payload.doc.id));
        if (index !== -1) {
           cachedData[index] = { ...cachedData[index], ...payload.doc };
           cachedData = [...cachedData];
        }
      } else if (payload.action === 'delete') {
        cachedData = cachedData.filter(d => String(d.id) !== String(payload.doc.id));
      } else if (payload.action === 'clear') {
        cachedData = [];
      }
      callback([...cachedData]); // Send new reference to trigger React render
    }
  };

  currentSocket.on('collection_updated', fallbackListener);
  currentSocket.on('collection_delta', deltaListener);

  // Return unsubscribe function
  return () => {
    currentSocket.off('collection_updated', fallbackListener);
    currentSocket.off('collection_delta', deltaListener);
  };
};

export const fetchCollection = async (collectionName: string) => {
  try {
    const res = await fetch(`${API_URL}/collections/${collectionName}`);
    if (!res.ok) throw new Error('Failed to fetch collection');
    return await res.json();
  } catch (error) {
    console.error(`Error fetching ${collectionName}:`, error);
    return [];
  }
};

export const addLocalDoc = async (collectionName: string, data: any) => {
  try {
    const res = await fetch(`${API_URL}/collections/${collectionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    return result.doc;
  } catch (error) {
    console.error(`Error adding doc to ${collectionName}:`, error);
    throw error;
  }
};

export const updateLocalDoc = async (collectionName: string, id: string, data: any) => {
  try {
    const res = await fetch(`${API_URL}/collections/${collectionName}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    return result.doc;
  } catch (error) {
    console.error(`Error updating doc in ${collectionName}:`, error);
    throw error;
  }
};

export const batchDeleteLocalDocs = async (collectionName: string, ids: string[]) => {
  if (isFirebaseMode) return;
  const res = await fetch(`${API_BASE_URL}/api/collections/${collectionName}/batchDelete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  if (!res.ok) throw new Error('Error en batch delete local');
  return res.json();
};

export const deleteLocalDoc = async (collectionName: string, id: string) => {
  try {
    await fetch(`${API_URL}/collections/${collectionName}/${id}`, {
      method: 'DELETE'
    });
    return true;
  } catch (error) {
    console.error(`Error deleting doc from ${collectionName}:`, error);
    throw error;
  }
};

export const clearCollection = async (collectionName: string) => {
  const res = await fetch(`/api/collections/${collectionName}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to clear ${collectionName}`);
  return await res.json();
};
