export const getUnitLabel = (product: any): string => {
  if (product.unit && product.unit.trim() !== '') return product.unit;
  const cat = (product.category || '').toLowerCase();
  if (cat.includes('queso') || cat.includes('pesable') || cat.includes('charcuteria') || cat.includes('lacteo')) {
    return 'Kg';
  }
  return 'Und';
};
