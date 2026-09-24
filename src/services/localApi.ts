import { io, Socket } from 'socket.io-client';

// Use standard relative/absolute routing instead of hardcoding localhost if possible,
// but since the server runs on 3001 locally, we stick to localhost:3001.
// In a true local network setup with phones, we should use window.location.hostname
const isProd = typeof import.meta !== 'undefined' && import.meta.env ? Boolean(import.meta.env.PROD) : false;
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
export const API_URL = isProd ? `/api` : (typeof process !== 'undefined' && process.env?.KALU_API_URL ? process.env.KALU_API_URL : `http://${hostname}:3001/api`);
export const SOCKET_URL = isProd ? `/` : (typeof process !== 'undefined' && process.env?.KALU_SOCKET_URL ? process.env.KALU_SOCKET_URL : `http://${hostname}:3001`);

// Global Socket Instance and Centralized Real-time Subscription Manager
let socket: Socket | null = null;

// Registry of active subscribers per collection: collectionName -> Set<(data: any[]) => void>
const collectionSubscribers = new Map<string, Set<(data: any[]) => void>>();

// In-memory cache map per collection: collectionName -> Map<string (id), doc>
const collectionCache = new Map<string, Map<string, any>>();

// In-flight fetch deduplication promises: collectionName -> Promise<any[]>
const inFlightFetches = new Map<string, Promise<any[]>>();

// Notify all subscribers for a given collection
const notifySubscribers = (collectionName: string) => {
  const subs = collectionSubscribers.get(collectionName);
  if (!subs || subs.size === 0) return;
  const cacheMap = collectionCache.get(collectionName);
  const data = cacheMap ? Array.from(cacheMap.values()) : [];
  subs.forEach((cb) => {
    try {
      cb(data);
    } catch (err) {
      console.error(`[Realtime Sync] Error notifying subscriber for ${collectionName}:`, err);
    }
  });
};

// Central fetch and update cache
export const refreshCollectionCache = async (collectionName: string): Promise<any[]> => {
  if (inFlightFetches.has(collectionName)) {
    return inFlightFetches.get(collectionName)!;
  }

  const fetchPromise = (async () => {
    try {
      const rawData = await fetchCollection(collectionName);
      const data = Array.isArray(rawData) ? rawData : [];
      let cacheMap = collectionCache.get(collectionName);
      if (!cacheMap) {
        cacheMap = new Map<string, any>();
        collectionCache.set(collectionName, cacheMap);
      }
      cacheMap.clear();
      data.forEach((item) => {
        if (item && item.id !== undefined && item.id !== null) {
          cacheMap!.set(String(item.id), item);
        }
      });
      notifySubscribers(collectionName);
      return data;
    } catch (err) {
      console.warn(`[Realtime Sync] Error fetching ${collectionName}:`, err);
      return [];
    } finally {
      inFlightFetches.delete(collectionName);
    }
  })();

  inFlightFetches.set(collectionName, fetchPromise);
  return fetchPromise;
};

// Central Socket Event Handlers
const handleSocketConnect = () => {
  console.log('[Realtime Sync] Connected to WebSocket server:', socket?.id);
  // Re-sync all actively subscribed collections on connect / reconnect
  for (const collectionName of collectionSubscribers.keys()) {
    if ((collectionSubscribers.get(collectionName)?.size || 0) > 0) {
      refreshCollectionCache(collectionName).catch((e) =>
        console.warn(`[Realtime Sync] Error refreshing ${collectionName} on reconnect:`, e)
      );
    }
  }
};

const handleCollectionUpdated = (updatedCollection: string) => {
  if (collectionSubscribers.has(updatedCollection) && (collectionSubscribers.get(updatedCollection)?.size || 0) > 0) {
    refreshCollectionCache(updatedCollection).catch((e) =>
      console.warn(`[Realtime Sync] Error refetching ${updatedCollection}:`, e)
    );
  }
};

const handleCollectionDelta = (payload: {
  action?: string;
  collection?: string;
  doc?: any;
  docs?: any[];
  id?: string | number;
}) => {
  if (!payload || !payload.collection) return;
  const colName = payload.collection;
  const subs = collectionSubscribers.get(colName);
  if (!subs || subs.size === 0) return;

  let cacheMap = collectionCache.get(colName);
  if (!cacheMap) {
    cacheMap = new Map<string, any>();
    collectionCache.set(colName, cacheMap);
  }

  const action = payload.action;
  const doc = payload.doc;
  const docId = doc?.id !== undefined ? String(doc.id) : (payload.id !== undefined ? String(payload.id) : null);

  if ((action === 'add' || action === 'update') && doc && docId) {
    const existing = cacheMap.get(docId) || {};
    cacheMap.set(docId, { ...existing, ...doc });
    notifySubscribers(colName);
  } else if (action === 'delete' && docId) {
    cacheMap.delete(docId);
    notifySubscribers(colName);
  } else if (action === 'clear') {
    cacheMap.clear();
    notifySubscribers(colName);
  } else if ((action === 'batchAdd' || action === 'batchUpdate') && Array.isArray(payload.docs) && payload.docs.length > 0) {
    payload.docs.forEach((d) => {
      if (d && d.id !== undefined) {
        const idStr = String(d.id);
        const existing = cacheMap!.get(idStr) || {};
        cacheMap!.set(idStr, { ...existing, ...d });
      }
    });
    notifySubscribers(colName);
  } else {
    // Fallback: for batch operations or unknown actions without direct docs payload, refetch fresh collection
    refreshCollectionCache(colName).catch((e) =>
      console.warn(`[Realtime Sync] Fallback refetch failed for ${colName}:`, e)
    );
  }
};

function attachSocketListeners(s: Socket) {
  s.off('connect', handleSocketConnect);
  s.off('collection_updated', handleCollectionUpdated);
  s.off('collection_delta', handleCollectionDelta);

  s.on('connect', handleSocketConnect);
  s.on('collection_updated', handleCollectionUpdated);
  s.on('collection_delta', handleCollectionDelta);
}

export const initSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true
    });
    attachSocketListeners(socket);
  }
  return socket;
};

export const clearRealtimeCacheForAuthBoundary = () => {
  collectionCache.clear();
  inFlightFetches.clear();
};

export const disconnectSocket = () => {
  if (socket) {
    socket.off('connect', handleSocketConnect);
    socket.off('collection_updated', handleCollectionUpdated);
    socket.off('collection_delta', handleCollectionDelta);
    socket.disconnect();
    socket = null;
  }
};

export const reconnectSocket = () => {
  disconnectSocket();
  const newSocket = initSocket();
  return newSocket;
};

// Generic Collection Hook/Subscriber with Delta Updates and Persistent Registry
export const onCollectionSnapshot = (collectionName: string, callback: (data: any[]) => void) => {
  initSocket();

  if (!collectionSubscribers.has(collectionName)) {
    collectionSubscribers.set(collectionName, new Set());
  }
  const subs = collectionSubscribers.get(collectionName)!;
  subs.add(callback);

  // If we already have cached data, immediately deliver it to the subscriber
  const cacheMap = collectionCache.get(collectionName);
  if (cacheMap && cacheMap.size > 0) {
    callback(Array.from(cacheMap.values()));
  }

  // Always trigger or queue a refresh if not fetched or on mount
  refreshCollectionCache(collectionName).catch((err) => {
    console.warn(`[Realtime Sync] Initial fetch failed for ${collectionName}:`, err);
  });

  // Return unsubscribe function
  return () => {
    subs.delete(callback);
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

export const parseClosingTimestamp = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object' && value.seconds) return Number(value.seconds) * 1000;
  const num = Number(value);
  if (!isNaN(num) && num > 0) return num;
  const parsed = Date.parse(String(value));
  return !isNaN(parsed) ? parsed : 0;
};

export const isPosHeldSale = (draft: any): boolean => {
  if (!draft || typeof draft !== 'object') return false;
  if (draft.draftKind === 'pos_held_sale' || draft.source === 'pos') {
    return draft.status === 'on_hold' || draft.status === 'claimed' || !draft.status;
  }
  if (draft.status === 'on_hold' || draft.status === 'claimed') {
    return draft.customerType !== undefined ||
           draft.totalAmount !== undefined ||
           draft.total !== undefined ||
           draft.paymentMethod !== undefined ||
           Array.isArray(draft.addedPayments);
  }
  return false;
};

export const closeShiftApi = async (payload: {
  startingCashUsd?: number;
  startingCashBs?: number;
  actualCashUsd?: number;
  actualCashBs?: number;
}) => {
  try {
    const csrf = await getCsrfToken();
    const res = await fetch(`${API_URL}/pos/close-shift`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Error al procesar cierre de turno');
    }
    return result;
  } catch (error) {
    console.error('Error in closeShiftApi:', error);
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
    const res = await fetch(`${API_URL}/collections/${collectionName}/${id}`, {
      method: 'DELETE',
      headers: {
        'x-csrf-token': csrf
      },
      credentials: 'include'
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al eliminar documento');
    }
    return true;
  } catch (error) {
    console.error(`Error deleting doc from ${collectionName}:`, error);
    throw error;
  }
};

export const resumeHeldSaleApi = async (draftId: string) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/pos/resume-held-sale/${draftId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const error: any = new Error(errData.error || 'Error al reanudar venta congelada');
    error.status = res.status;
    throw error;
  }
  return await res.json();
};

export const consumeHeldSaleApi = async (draftId: string) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/pos/consume-held-sale/${draftId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const error: any = new Error(errData.error || 'Error al eliminar venta reanudada');
    error.status = res.status;
    throw error;
  }
  return await res.json();
};

export const discardHeldSaleApi = async (draftId: string) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/pos/discard-held-sale/${draftId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const error: any = new Error(errData.error || 'Error al descartar venta en espera');
    error.status = res.status;
    throw error;
  }
  return await res.json();
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
  // Purga estricta de caché previa para evitar fugas entre sesiones y roles
  clearRealtimeCacheForAuthBoundary();
  // Reconectar socket con la nueva sesión HTTP (Fase 1D-D.3)
  reconnectSocket();
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
  // Purga estricta de caché privada al cerrar sesión
  clearRealtimeCacheForAuthBoundary();
  // Desconectar socket localmente tras destruir sesión HTTP (Fase 1D-D.3)
  disconnectSocket();
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


// --- PORTAL AUTHENTICATION API (FASE 1D-A) ---

export const portalLoginApi = async (credentials: {
  portalType: 'client' | 'producer';
  identifier: string;
  pin: string;
}) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/portal/auth/login`, {
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
    throw new Error(data.error || 'Identificador o PIN incorrecto');
  }
  if (data.csrfToken) {
    cachedCsrfToken = data.csrfToken;
  }
  // Purga estricta de caché previa para evitar fugas entre sesiones de portal
  clearRealtimeCacheForAuthBoundary();
  // Reconectar socket con la nueva sesión de portal (Fase 1D-D.3)
  reconnectSocket();
  return data;
};

export const portalLogoutApi = async () => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/portal/auth/logout`, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });
  // Purga estricta de caché privada al cerrar sesión de portal
  clearRealtimeCacheForAuthBoundary();
  // Reconectar socket para reevaluar sesión (o quedar anónimo) (Fase 1D-D.3)
  reconnectSocket();
  return await res.json();
};

export const fetchCurrentPortalUserApi = async () => {
  try {
    const res = await fetch(`${API_URL}/portal/auth/me`, {
      credentials: 'include'
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.portalUser || null;
  } catch (e) {
    return null;
  }
};

export const portalChangePinApi = async (payload: { currentPin: string; newPin: string }) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/portal/auth/change-pin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Error al cambiar el PIN de seguridad');
  }
  return data;
};

// --- PORTAL RECOVERY API HELPERS (FASE 1D-C.3) ---

export const portalRecoveryRequestApi = async (payload: {
  portalType: 'client' | 'producer';
  identifier: string;
  channel: 'email' | 'whatsapp';
}) => {
  const res = await fetch(`${API_URL}/portal/auth/recovery/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      portalType: payload.portalType,
      identifier: payload.identifier,
      channel: payload.channel
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Error al procesar la solicitud de recuperación');
  }
  return data;
};

export const portalRecoveryVerifyApi = async (payload: {
  portalType: 'client' | 'producer';
  identifier: string;
  challengeId: string;
  code: string;
}) => {
  const res = await fetch(`${API_URL}/portal/auth/recovery/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      portalType: payload.portalType,
      identifier: payload.identifier,
      challengeId: payload.challengeId,
      code: payload.code
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Código de recuperación inválido o expirado');
  }
  return data;
};

export const portalRecoveryResetPinApi = async (payload: {
  portalType: 'client' | 'producer';
  identifier: string;
  resetToken: string;
  newPin: string;
}) => {
  const res = await fetch(`${API_URL}/portal/auth/recovery/reset-pin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      portalType: payload.portalType,
      identifier: payload.identifier,
      resetToken: payload.resetToken,
      newPin: payload.newPin
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Error al restablecer el PIN de seguridad');
  }
  return data;
};

// --- PORTAL SCOPED & PUBLIC API HELPERS (FASE 1D-B) ---

// 1. Configuración Pública de Portal
export const fetchPortalPublicConfigApi = async () => {
  try {
    const res = await fetch(`${API_URL}/portal/public-config`, { credentials: 'include' });
    if (!res.ok) throw new Error('Error al obtener configuración pública');
    return await res.json();
  } catch (e) {
    console.error('fetchPortalPublicConfigApi error:', e);
    return { exchangeRate: 807.38, banners: [] };
  }
};

// 2. Catálogo Público de Productos
export const fetchPortalPublicCatalogApi = async () => {
  try {
    const res = await fetch(`${API_URL}/portal/public-catalog`, { credentials: 'include' });
    if (!res.ok) throw new Error('Error al obtener catálogo público');
    return await res.json();
  } catch (e) {
    console.error('fetchPortalPublicCatalogApi error:', e);
    return [];
  }
};

// 3. Perfil del Cliente Autenticado
export const fetchPortalClientProfileApi = async () => {
  const res = await fetch(`${API_URL}/portal/client/profile`, { credentials: 'include' });
  if (!res.ok) return null;
  return await res.json();
};

// 4. Finanzas y Cuotas del Cliente Autenticado
export const fetchPortalClientFinancesApi = async () => {
  const res = await fetch(`${API_URL}/portal/client/finances`, { credentials: 'include' });
  if (!res.ok) return null;
  return await res.json();
};

// 5. Historial de Transacciones del Cliente
export const fetchPortalClientTransactionsApi = async () => {
  const res = await fetch(`${API_URL}/portal/client/transactions`, { credentials: 'include' });
  if (!res.ok) return [];
  return await res.json();
};

// 6. Pagos Reportados del Cliente
export const fetchPortalClientPaymentsApi = async () => {
  const res = await fetch(`${API_URL}/portal/client/payments`, { credentials: 'include' });
  if (!res.ok) return [];
  return await res.json();
};

// 7. Reportar Pago PWA de Cliente
export const submitPortalClientPaymentApi = async (paymentPayload: any) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/portal/client/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(paymentPayload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al reportar pago');
  }
  return await res.json();
};

// 8. Actualizar Estatus de Cuota por Reporte de Pago
export const reportPortalInstallmentPaymentApi = async (installmentId: string) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/portal/client/installments/${installmentId}/report-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al actualizar estatus de cuota');
  }
  return await res.json();
};

// 9. Pedidos de Cliente
export const fetchPortalClientOrdersApi = async () => {
  const res = await fetch(`${API_URL}/portal/client/orders`, { credentials: 'include' });
  if (!res.ok) return [];
  return await res.json();
};

// 10. Crear Pedido de Cliente
export const submitPortalClientOrderApi = async (orderPayload: any) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/portal/client/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(orderPayload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al enviar pedido');
  }
  return await res.json();
};

// 11. Aprobar Transacción QR por Cliente (Fase 1G-C.3: Autorización Server-Side)
export const approvePortalClientTransactionApi = async (txId: string, approvalData?: { authNonce?: string }) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/portal/client/transactions/${txId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(approvalData || {})
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const error: any = new Error(errData.error || 'Error al aprobar transacción');
    error.status = res.status;
    error.code = errData.code;
    throw error;
  }
  return await res.json();
};

// 12. Perfil del Productor Autenticado
export const fetchPortalProducerProfileApi = async () => {
  const res = await fetch(`${API_URL}/portal/producer/profile`, { credentials: 'include' });
  if (!res.ok) return null;
  return await res.json();
};

// 13. Viajes de Queso del Productor Autenticado
export const fetchPortalProducerTripsApi = async () => {
  const res = await fetch(`${API_URL}/portal/producer/trips`, { credentials: 'include' });
  if (!res.ok) return [];
  return await res.json();
};

// 14. Transacciones del Productor Autenticado
export const fetchPortalProducerTransactionsApi = async () => {
  const res = await fetch(`${API_URL}/portal/producer/transactions`, { credentials: 'include' });
  if (!res.ok) return [];
  return await res.json();
};

// 15. Pedidos de Insumos del Productor
export const fetchPortalProducerOrdersApi = async () => {
  const res = await fetch(`${API_URL}/portal/producer/orders`, { credentials: 'include' });
  if (!res.ok) return [];
  return await res.json();
};

// 16. Crear Pedido de Insumos de Productor
export const submitPortalProducerOrderApi = async (orderPayload: any) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/portal/producer/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(orderPayload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al enviar pedido de insumos');
  }
  return await res.json();
};

// 17. Subida Segura de Archivos (Fase 1F-A)
export const uploadFilesApi = async (files: File[] | Blob[], customFileName?: string): Promise<{ success: boolean; urls: string[]; fileUrls?: string[] }> => {
  const csrf = await getCsrfToken();
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (customFileName && files.length === 1) {
      formData.append('files', file, customFileName);
    } else {
      formData.append('files', file);
    }
  }

  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Error al subir archivo (${res.status})`);
  }
  return {
    success: true,
    urls: data.urls || [],
    fileUrls: data.urls || []
  };
};

// 18. Bootstrap Atómico de Colecciones de CRM (Consolidación de arranque)
export const fetchBootstrapDataApi = async () => {
  const collectionNames = ['products', 'transactions', 'clients', 'suppliers', 'settings', 'users', 'mobileOrders', 'cheeseTrips'];
  const results = await Promise.all(
    collectionNames.map(async (name) => {
      try {
        const data = await fetchCollection(name);
        return [name, Array.isArray(data) ? data : (data ? [data] : [])];
      } catch (err) {
        console.warn(`[Bootstrap] Error precargando colección ${name}:`, err);
        return [name, []];
      }
    })
  );
  return Object.fromEntries(results);
};

// 19. Aprobación Atómica e Idempotente de Pago PWA (Fase 2D)
export const approvePwaPaymentApi = async (paymentId: string) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/pwa-payments/${encodeURIComponent(paymentId)}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status} aprobando pago PWA`);
  }
  return data;
};

// 20. Rechazo Atómico de Pago PWA (Fase 2D)
export const rejectPwaPaymentApi = async (paymentId: string) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`${API_URL}/pwa-payments/${encodeURIComponent(paymentId)}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status} rechazando pago PWA`);
  }
  return data;
};
