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
    socket = io(SOCKET_URL, {
      withCredentials: true
    });
    socket.on('connect', () => {
      console.log('Connected to local WebSocket server', socket?.id);
    });
    socket.on('disconnect', (_reason) => {
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};

export const reconnectSocket = () => {
  disconnectSocket();
  return initSocket();
};

// Generic Collection Hook/Subscriber with Delta Updates
export const onCollectionSnapshot = (collectionName: string, callback: (data: any[]) => void) => {
  const currentSocket = initSocket();
  const cacheMap = new Map<string, any>();

  const notifyCallback = (_source: string) => {
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
    notifyCallback('initial_fetch');
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
        notifyCallback('fallback_refetch');
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
      notifyCallback('delta');
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
    throw new Error(errData.error || 'Error al aprobar transacción');
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
