export const fetchLocalProducts = async () => {
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error('Error fetching local products');
  return res.json();
};

export const updateLocalProduct = async (id: string, updates: any) => {
  const res = await fetch(`/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Error updating product');
  return res.json();
};

export const addLocalProduct = async (product: any) => {
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });
  if (!res.ok) throw new Error('Error adding product');
  return res.json();
};

export const deleteLocalProduct = async (id: string) => {
  const res = await fetch(`/api/products/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error deleting product');
  return res.json();
};
