import { io, Socket } from 'socket.io-client';

// Use standard relative/absolute routing instead of hardcoding localhost if possible,
// but since the server runs on 3001 locally, we stick to localhost:3001.
// In a true local network setup with phones, we should use window.location.hostname
const isProd = import.meta.env.PROD;
const hostname = window.location.hostname;
const API_URL = isProd ? `/api` : `http://${hostname}:3001/api`;
const SOCKET_URL = isProd ? `/` : `http://${hostname}:3001`;

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
  const cacheMap = new Map<string, any>();

  const notifyCallback = () => {
    callback(Array.from(cacheMap.values()));
  };

  // Initial fetch
  fetchCollection(collectionName).then(data => {
    const rawData = Array.isArray(data) ? data : [];
    cacheMap.clear();
    rawData.forEach(item => {
      if (item && item.id) {
        cacheMap.set(String(item.id), item);
      }
    });
    notifyCallback();
  });

  // Listen for full collection updates (Fallback)
  const fallbackListener = (updatedCollection: string) => {
    if (updatedCollection === collectionName) {
      fetchCollection(collectionName).then(data => {
        const rawData = Array.isArray(data) ? data : [];
        cacheMap.clear();
        rawData.forEach(item => {
          if (item && item.id) {
            cacheMap.set(String(item.id), item);
          }
        });
        notifyCallback();
      });
    }
  };

  // Listen for granular delta updates
  const deltaListener = (payload: { action: string, collection: string, doc: any }) => {
    if (payload.collection === collectionName && payload.doc) {
      const docId = String(payload.doc.id);
      if (payload.action === 'add' || payload.action === 'update') {
        const existing = cacheMap.get(docId) || {};
        cacheMap.set(docId, { ...existing, ...payload.doc });
      } else if (payload.action === 'delete') {
        cacheMap.delete(docId);
      } else if (payload.action === 'clear') {
        cacheMap.clear();
      }
      notifyCallback();
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
    const res = await fetch(`${API_URL}/collections/${collectionName}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch collection');
    return await res.json();
  } catch (error) {
    console.error(`Error fetching ${collectionName}:`, error);
    return [];
  }
};

export const addLocalDoc = async (collectionName: string, data: any) => {
  try {
    const csrf = await getCsrfToken();
    const res = await fetch(`${API_URL}/collections/${collectionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf
      },
      credentials: 'include',
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
    const csrf = await getCsrfToken();
    const res = await fetch(`${API_URL}/collections/${collectionName}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    const result = await res.json();
    return result.doc;
  } catch (error) {
    console.error(`Error updating doc in ${collectionName}:`, error);
    throw error;
  }
};

export const processSaleAtomic = async (salePayload: any) => {
  try {
    const csrf = await getCsrfToken();
    const res = await fetch(`${API_URL}/pos/process-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf
      },
      credentials: 'include',
      body: JSON.stringify(salePayload)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error en servidor procesando venta');
    }
    return await res.json();
  } catch (error) {
    console.error('Error in processSaleAtomic:', error);
    throw error;
  }
};

export const batchDeleteLocalDocs = async (collectionName: string, ids: string[]) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/collections/${collectionName}/batchDelete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify({ ids })
  });
  if (!res.ok) throw new Error('Error en batch delete local');
  return res.json();
};

export const deleteLocalDoc = async (collectionName: string, id: string) => {
  try {
    const csrf = await getCsrfToken();
    await fetch(`${API_URL}/collections/${collectionName}/${id}`, {
      method: 'DELETE',
      headers: {
        'x-csrf-token': csrf
      },
      credentials: 'include'
    });
    return true;
  } catch (error) {
    console.error(`Error deleting doc from ${collectionName}:`, error);
    throw error;
  }
};

export const resetAccountingApi = async () => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/admin/reset-accounting`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al restablecer datos contables');
  }
  return await res.json();
};

export const callSyncRate = async () => {
  const res = await fetch(`${API_URL}/sync-rate`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to sync rate from backend');
  }
  return await res.json();
};

// --- AUTHENTICATION API (FASE 1A) ---

let cachedCsrfToken = '';

export const getCsrfToken = async (): Promise<string> => {
  if (cachedCsrfToken) return cachedCsrfToken;
  try {
    const res = await fetch(`${API_URL}/auth/csrf-token`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      cachedCsrfToken = data.csrfToken || '';
    }
  } catch (e) {
    console.warn('Failed to fetch CSRF token:', e);
  }
  return cachedCsrfToken;
};

export const loginApi = async (credentials: {
  loginMode: 'admin' | 'cajero';
  email?: string;
  cedula?: string;
  password?: string;
  pin?: string;
}) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(credentials)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Credenciales inválidas o no autorizadas');
  }
  if (data.csrfToken) {
    cachedCsrfToken = data.csrfToken;
  }
  return data;
};

export const logoutApi = async () => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });
  cachedCsrfToken = '';
  return await res.json();
};

export const fetchCurrentUserApi = async () => {
  const res = await fetch(`${API_URL}/auth/me`, {
    credentials: 'include'
  });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  if (data.csrfToken) {
    cachedCsrfToken = data.csrfToken;
  }
  return data.user || null;
};

