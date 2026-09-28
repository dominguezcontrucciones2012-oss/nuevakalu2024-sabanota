export const getUnitLabel = (product: any): string => {
  if (!product) return 'Und';
  const rawUnit = typeof product === 'string' ? product : (product?.unit || product?.unidad || '');
  if (typeof rawUnit === 'string' && rawUnit.trim() !== '') {
    const u = rawUnit.trim().toLowerCase();
    if (u === 'i' || u === 'item' || u === 'items' || u === 'und' || u === 'unidad' || u === 'unidades' || u === 'y' || u === 'u' || u === 'un' || u === 'ud' || u === 'uds' || u === 'pieza' || u === 'piezas' || u === 'pza' || u === 'pzas') {
      return 'Und';
    }
    if (u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'kilogramos' || u === 'k') {
      return 'Kg';
    }
    if (u === 'lt' || u === 'lts' || u === 'litro' || u === 'litros' || u === 'l') {
      return 'Lt';
    }
    if (u === 'bto' || u === 'btos' || u === 'bulto' || u === 'bultos' || u === 'b') {
      return 'Bto';
    }
    // Si la unidad guardada es válida estándar
    if (['Kg', 'Und', 'Lt', 'Bto'].includes(rawUnit.trim())) {
      return rawUnit.trim();
    }
  }

  const name = (product?.name || product?.productName || '').toLowerCase();
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
    name.includes('pesable') ||
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

/**
 * Función canónica para generar el PIN inicial de un cliente.
 * Semántica idéntica al backend (server.js): ÚLTIMOS 4 DÍGITOS DE LA CÉDULA/DOCUMENTO + "00" (Exactamente 6 dígitos numéricos).
 * Si la identificación no contiene al menos 4 dígitos válidos, devuelve null (FAIL CLOSED).
 */
export const getClientInitialPin = (clientOrCedula: any): string | null => {
  if (!clientOrCedula) return null;
  const rawId = typeof clientOrCedula === 'string'
    ? clientOrCedula
    : (clientOrCedula.cedula || clientOrCedula.ci || clientOrCedula.ciRif || clientOrCedula.idNumber || clientOrCedula.rfc || '');
  const digits = String(rawId).replace(/\D/g, '');
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  const pin = `${last4}00`;
  return /^\d{6}$/.test(pin) ? pin : null;
};

/**
 * Función canónica para generar el PIN inicial de un productor.
 * Semántica idéntica al backend (server.js): ÚLTIMOS 4 DÍGITOS DEL DOCUMENTO LEGAL + "00" (Exactamente 6 dígitos numéricos).
 */
export const getProducerInitialPin = (producerOrDoc: any): string | null => {
  if (!producerOrDoc) return null;
  const rawDoc = typeof producerOrDoc === 'string'
    ? producerOrDoc
    : (producerOrDoc.rif || producerOrDoc.cedula || producerOrDoc.rfc || producerOrDoc.ci || producerOrDoc.idNumber || '');
  const digits = String(rawDoc).replace(/\D/g, '');
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  const pin = `${last4}00`;
  return /^\d{6}$/.test(pin) ? pin : null;
};

