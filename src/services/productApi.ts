import { getCsrfToken } from './localApi';

export const fetchLocalProducts = async () => {
  const res = await fetch('/api/products', {
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Error fetching local products');
  return res.json();
};

export const updateLocalProduct = async (id: string, updates: any) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/products/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Error updating product');
  return res.json();
};

export const addLocalProduct = async (product: any) => {
  const csrf = await getCsrfToken();
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(product),
  });
  if (!res.ok) throw new Error('Error adding product');
  return res.json();
};

export const deleteLocalProduct = async (id: string) => {
  const csrf = await getCsrfToken();
  const res = await fetch(`/api/products/${id}`, {
    method: 'DELETE',
    headers: {
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Error deleting product');
  return res.json();
};
