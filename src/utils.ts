export const getUnitLabel = (product: any): string => {
  if (product && typeof product.unit === 'string' && product.unit.trim() !== '') return product.unit;
  const cat = (product?.category || '').toLowerCase();
  if (cat.includes('queso') || cat.includes('pesable') || cat.includes('charcuteria') || cat.includes('lacteo')) {
    return 'Kg';
  }
  return 'Und';
};

export const parseSafeDecimal = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  const str = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export const formatCurrency = (val: number, currency: '$' | 'Bs' = '$'): string => {
  const safe = isNaN(val) ? 0 : val;
  return `${currency} ${safe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatQuantity = (qty: number, unit: string = 'Kg'): string => {
  const safe = isNaN(qty) ? 0 : qty;
  const decimals = (unit.toLowerCase() === 'und' || unit.toLowerCase() === 'unidad') ? 0 : 3;
  return `${safe.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: decimals })} ${unit}`;
};
