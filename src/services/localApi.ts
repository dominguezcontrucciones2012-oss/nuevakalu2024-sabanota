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

// Generic Collection Hook/Subscriber
export const onCollectionSnapshot = (collectionName: string, callback: (data: any[]) => void) => {
  const currentSocket = initSocket();
  
  // Initial fetch
  fetchCollection(collectionName).then(callback);

  // Listen for updates
  const listener = (updatedCollection: string) => {
    if (updatedCollection === collectionName) {
      fetchCollection(collectionName).then(callback);
    }
  };

  currentSocket.on('collection_updated', listener);

  // Return unsubscribe function
  return () => {
    currentSocket.off('collection_updated', listener);
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
