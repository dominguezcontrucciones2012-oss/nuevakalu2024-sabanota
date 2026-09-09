export const getUnitLabel = (product: any): string => {
  const rawUnit = typeof product === 'string' ? product : (product?.unit || '');
  if (typeof rawUnit === 'string' && rawUnit.trim() !== '') {
    const u = rawUnit.trim().toLowerCase();
    if (u === 'i' || u === 'item' || u === 'items' || u === 'und' || u === 'unidad' || u === 'unidades' || u === 'y' || u === 'u' || u === 'un') {
      return 'Und';
    }
    if (u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'k') {
      return 'Kg';
    }
    if (u === 'lt' || u === 'litro' || u === 'litros' || u === 'l') {
      return 'Lt';
    }
    if (u === 'bto' || u === 'bulto' || u === 'bultos' || u === 'b') {
      return 'Bto';
    }
    // Si la unidad guardada es válida estándar
    if (['Kg', 'Und', 'Lt', 'Bto'].includes(rawUnit.trim())) {
      return rawUnit.trim();
    }
  }

  const name = (product?.name || '').toLowerCase();
  const cat = (product?.category || '').toLowerCase();

  // Queso, lácteos y productos pesables por kilo
  if (
    cat.includes('queso') ||
    name.includes('queso') ||
    name.includes('cuajada') ||
    name.includes('mozzarella') ||
    name.includes('suero') ||
    name.includes('por kilo') ||
    name.includes('por kg') ||
    name.includes('granel') ||
    name === 'papa' ||
    name === 'cebolla' ||
    name === 'tomate fresco' ||
    name === 'zanahoria' ||
    name === 'repollo' ||
    name === 'platano' ||
    name === 'ajo' ||
    name === 'caraotas negras' ||
    name === 'carne molida'
  ) {
    return 'Kg';
  }
  return 'Und';
};

export const parseSafeDecimal = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  
  let str = String(val).trim().replace(/[^0-9.,-]/g, '');
  if (!str) return 0;

  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

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
