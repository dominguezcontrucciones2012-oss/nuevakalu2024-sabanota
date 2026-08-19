import React, { useState, useRef } from 'react';
import { CheeseProduct, CheeseLedgerBatch, SupplierProfile } from '../types';
import StockPurchasesView, { PurchaseItem } from './StockPurchasesView';
import { getUnitLabel } from '../utils';
import {
  Package,
  Plus,
  ArrowUpRight,
  TrendingUp,
  FileSpreadsheet,
  Brain,
  History,
  AlertCircle,
  TrendingDown,
  Edit2,
  Trash2,
  Check,
  Activity,
  Upload,
  Download,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle
} from 'lucide-react';

interface CheeseInventoryViewProps {
  products: CheeseProduct[];
  batches: CheeseLedgerBatch[];
  suppliers: SupplierProfile[];
  exchangeRate: number;
  onAddProduct: (prod: Omit<CheeseProduct, 'id'>) => Promise<void>;
  onUpdateProduct: (id: string, updated: Partial<CheeseProduct>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onLoadPurchase: (purchase: {
    supplierId: string;
    items: PurchaseItem[];
    isCredit: boolean;
  }) => void;
  onUpdateBatchWeight: (batchId: string, currentWeight: number) => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
}

export default function CheeseInventoryView({
  products,
  batches,
  suppliers,
  exchangeRate,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onLoadPurchase,
  onUpdateBatchWeight,
  onAddNotification
}: CheeseInventoryViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'adjust' | 'purchase' | 'ledger' | 'ai' | 'excel'>('stock');

  // New Product States
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<'Fresco' | 'Semicurado' | 'Curado' | 'Azul' | 'Especial'>('Fresco');
  const [newStock, setNewStock] = useState(20);
  const [newPurchasePrice, setNewPurchasePrice] = useState(100);
  const [newSellingPrice, setNewSellingPrice] = useState(150);
  const [newAlert, setNewAlert] = useState(5);
  const [newOrigin, setNewOrigin] = useState('');
  const [newUnit, setNewUnit] = useState<'Kg' | 'Lt' | 'Und'>('Kg');
  
  const [adjustingBatchId, setAdjustingBatchId] = useState<string | null>(null);
  const [newBatchWeight, setNewBatchWeight] = useState(0);

  const handleBatchShrinkageAdjust = (batchId: string) => {
    // This function will be handled in a future update
    console.warn("Batch adjusting is disabled in this version.");
    setAdjustingBatchId(null);
  };

  // Edit Product States
  const [editingProduct, setEditingProduct] = useState<Partial<CheeseProduct> | null>(null);

  // Price Adjustment States (Bulk or Single)
  const [adjustType, setAdjustType] = useState<'bulk' | 'single'>('bulk');
  const [adjustCategory, setAdjustCategory] = useState<string>('Todos');
  const [adjustPercent, setAdjustPercent] = useState<number>(5);
  const [adjustSelectedProdId, setAdjustSelectedProdId] = useState<string>('');
  const [adjustNewPrice, setAdjustNewPrice] = useState<number>(0);


  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    onAddProduct({
      name: newName,
      category: newCategory,
      stockKg: newStock,
      purchasePrice: newPurchasePrice,
      sellingPrice: newSellingPrice,
      alertThreshold: newAlert,
      agingDays: newCategory === 'Curado' ? 90 : newCategory === 'Semicurado' ? 30 : 1,
      origin: newOrigin,
      unit: newUnit
    });
    onAddNotification(`Queso ${newName} registrado en el inventario activo.`, 'success');
    setShowAddForm(false);
    setNewName('');
  };

  const handleSaveInlineEdit = async () => {
    if (!editingProduct || !editingProduct.id) return;
    try {
      await onUpdateProduct(editingProduct.id, {
        purchasePrice: Number(editingProduct.purchasePrice || 0),
        sellingPrice: Number(editingProduct.sellingPrice || 0),
        stockKg: Number(editingProduct.stockKg || 0),
        unit: editingProduct.unit || 'Kg'
      });
      setEditingProduct(null);
      onAddNotification('Producto actualizado correctamente.', 'success');
    } catch (error) {
      console.error(error);
      onAddNotification('Fallo al guardar en la nube. Intente nuevamente.', 'warning');
    }
  };

  const handleApplyPriceAdjustment = async () => {
    if (adjustType === 'single') {
      if (!adjustSelectedProdId) {
        onAddNotification('Seleccione un producto para ajustar.', 'warning');
        return;
      }
      await onUpdateProduct(adjustSelectedProdId, { sellingPrice: adjustNewPrice });
      onAddNotification('Precio de venta ajustado con éxito.', 'success');
    } else {
      // Bulk adjustment
      products.forEach(p => {
        if (adjustCategory === 'Todos' || p.category === adjustCategory) {
          const multiplier = 1 + (adjustPercent / 100);
        const newP = parseFloat((Number(p.sellingPrice || 0) * multiplier).toFixed(2));
          onUpdateProduct(p.id, { sellingPrice: newP });
        }
      });
      onAddNotification(`Ajuste de precio masivo de ${adjustPercent}% aplicado a la categoría ${adjustCategory}.`, 'success');
    }
  };


  const handleExportCSV = () => {
    const headers = ['ID', 'Nombre', 'Categoria', 'Origen', 'StockKg', 'Costo', 'PrecioVenta', 'Alerta'];
    const rows = products.map(p => [
      p.id,
      `"${p.name}"`,
      p.category,
      `"${p.origin}"`,
      p.stockKg,
      p.purchasePrice,
      p.sellingPrice,
      p.alertThreshold
    ].join(','));
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventario_kalu_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onAddNotification('Archivo CSV exportado exitosamente.', 'success');
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target?.result as string;
      const lines = csv.split('\n');
      let added = 0;
      let updated = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
        if (values.length < 7) continue;
        
        const [id, name, category, origin, stockKg, cost, price, alert] = values;
        
        const parsedStock = parseFloat(stockKg) || 0;
        const parsedCost = parseFloat(cost) || 0;
        const parsedPrice = parseFloat(price) || 0;
        const parsedAlert = parseFloat(alert) || 0;

        const existing = products.find(p => p.id === id || p.name === name);
        if (existing) {
          onUpdateProduct(existing.id, {
            category: category as any,
            origin,
            stockKg: parsedStock,
            purchasePrice: parsedCost,
            sellingPrice: parsedPrice,
            alertThreshold: parsedAlert
          });
          updated++;
        } else {
          onAddProduct({
            name,
            category: category as any,
            stockKg: parsedStock,
            purchasePrice: parsedCost,
            sellingPrice: parsedPrice,
            alertThreshold: parsedAlert,
            agingDays: 1,
            origin
          });
          added++;
        }
      }
      onAddNotification(`Importación completada: ${added} nuevos, ${updated} actualizados.`, 'success');
      if (csvFileInputRef.current) csvFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Sub-Tabs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 border-b border-editorial-border/60 pb-4">
        {[
          { id: 'stock', label: 'Inventario Activo', icon: Package },
          { id: 'adjust', label: 'Ajuste de Precios', icon: TrendingUp },
          { id: 'purchase', label: 'Carga de Compras', icon: ArrowUpRight }
        ].map(tab => {
          const Icon = tab.icon;
          const isSelected = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center justify-center gap-2 p-3 text-[11px] font-mono font-bold uppercase tracking-wider rounded border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 border-amber-600 text-white shadow-md shadow-amber-500/10'
                  : 'bg-editorial-card border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary hover:border-editorial-text-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeSubTab === 'stock' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Stock Activo de KALU</h3>
              <p className="text-xs text-editorial-text-muted">Control de precio y costo de producto</p>
            </div>
            <div className="flex gap-2 mt-4 sm:mt-0">
              <button
                onClick={() => csvFileInputRef.current?.click()}
                className="px-4 py-2 bg-editorial-bg border border-editorial-border text-editorial-text-primary hover:text-emerald-400 font-serif font-bold text-[10px] tracking-wider uppercase flex items-center gap-1.5 transition-all cursor-pointer rounded"
              >
                <Upload className="w-3.5 h-3.5" />
                Importar CSV
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-editorial-bg border border-editorial-border text-editorial-text-primary hover:text-amber-500 font-serif font-bold text-[10px] tracking-wider uppercase flex items-center gap-1.5 transition-all cursor-pointer rounded"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-4 py-2 bg-amber-500 text-white font-serif font-bold text-[10px] tracking-wider uppercase flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all cursor-pointer rounded ml-1 sm:ml-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Nuevo Producto
              </button>
              <input type="file" ref={csvFileInputRef} accept=".csv" className="hidden" onChange={handleImportCSV} />
            </div>
          </div>

          {/* New product addition drawer form */}
          {showAddForm && (
            <form onSubmit={handleCreateProduct} className="bg-editorial-card border border-editorial-border rounded p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3 pb-2 border-b border-editorial-border/40 flex justify-between items-center">
                <span className="font-serif text-lg font-bold text-editorial-text-primary">Agregar Nuevo Catálogo</span>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-xs font-mono text-rose-400 uppercase hover:underline">Cancelar</button>
              </div>

              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Nombre Comercial del Queso</label>
                <input
                  type="text" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Queso Cotija Premium"
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Unidad de Medida</label>
                <select
                  value={newUnit} onChange={e => setNewUnit(e.target.value as any)}
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="Kg">Kilos (Kg)</option>
                  <option value="Lt">Litros (Lt)</option>
                  <option value="Und">Unidades (Und)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Categoría de Queso</label>
                <select
                  value={newCategory} onChange={e => setNewCategory(e.target.value as any)}
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="Fresco">Fresco (Suero suave)</option>
                  <option value="Semicurado">Semicurado (Corteza fina)</option>
                  <option value="Curado">Curado (Sabor maduro)</option>
                  <option value="Azul">Azul (Penicillium)</option>
                  <option value="Especial">Especial (Especias)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Stock Inicial ({newUnit})</label>
                <input
                  type="number" required value={newStock} onChange={e => setNewStock(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Costo de Compra ($/{newUnit})</label>
                <input
                  type="number" required value={newPurchasePrice} onChange={e => setNewPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Precio de Venta ($/{newUnit})</label>
                <input
                  type="number" required value={newSellingPrice} onChange={e => setNewSellingPrice(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Umbral de Alerta Stock ({newUnit})</label>
                <input
                  type="number" required value={newAlert} onChange={e => setNewAlert(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Origen / Productor Proveedor</label>
                <input
                  type="text" required value={newOrigin} onChange={e => setNewOrigin(e.target.value)} placeholder="Ej: Martín Niño"
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="md:col-span-3 pt-4 border-t border-editorial-border/40 flex justify-end">
                <button
                  type="submit"
                  className="px-6 h-10 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase hover:brightness-110 transition-all cursor-pointer"
                >
                  Confirmar Guardado de Queso
                </button>
              </div>
            </form>
          )}

          {/* Inventory active table */}
          <div className="bg-editorial-card border border-editorial-border rounded p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase tracking-wider">
                    <th className="py-3 px-4">Queso</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4">Origen / Rancho</th>
                    <th className="py-3 px-4 text-center">Stock / Existencia</th>
                    <th className="py-3 px-4 text-right">Costo ($)</th>
                    <th className="py-3 px-4 text-right">Venta ($)</th>
                    <th className="py-3 px-4 text-center">Alertas</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-editorial-border/60">
                  {products.map((p) => {
                    const isSoldOut = p.stockKg <= 0;
                    const isLowStock = p.stockKg > 0 && p.stockKg <= p.alertThreshold;
                    const isEditing = editingProduct?.id === p.id;

                    return (
                      <tr key={p.id} className="hover:bg-editorial-bg/30 transition-all">
                        <td className="py-4 px-4">
                          <div className="font-serif text-sm font-extrabold text-editorial-text-primary">{p.name || 'Sin nombre'}</div>
                          <span className="font-mono text-[9px] text-editorial-text-muted/60">ID: {p.id}</span>
                        </td>
                        <td className="py-4 px-4 font-sans text-editorial-text-muted">{p.category || '-'}</td>
                        <td className="py-4 px-4 font-sans text-editorial-text-muted">{p.origin || '-'}</td>
                        <td className="py-4 px-4 text-center">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={editingProduct.stockKg ?? ''}
                                onChange={e => setEditingProduct({ ...editingProduct, stockKg: parseFloat(e.target.value) || 0 })}
                                className="w-16 h-8 bg-editorial-bg border border-editorial-border rounded text-center text-xs font-mono"
                              />
                              <select
                                value={editingProduct.unit || 'Kg'}
                                onChange={e => setEditingProduct({ ...editingProduct, unit: e.target.value as any })}
                                className="h-8 bg-editorial-bg border border-editorial-border rounded text-xs font-sans text-editorial-text-primary px-1"
                              >
                                <option value="Kg">Kg</option>
                                <option value="Lt">Lt</option>
                                <option value="Und">Und</option>
                              </select>
                            </div>
                          ) : (
                            <div className={`text-sm font-bold ${isSoldOut ? 'text-rose-400' : isLowStock ? 'text-amber-500' : 'text-editorial-text-primary'}`}>
                              {Number(p.stockKg || 0).toFixed(1)} {getUnitLabel(p)}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-editorial-text-muted">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editingProduct.purchasePrice ?? ''}
                              onChange={e => setEditingProduct({ ...editingProduct, purchasePrice: parseFloat(e.target.value) || 0 })}
                              className="w-20 h-8 bg-editorial-bg border border-editorial-border rounded text-center text-xs font-mono"
                            />
                          ) : (
                            <span>${Number(p.purchasePrice || 0).toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-bold text-amber-500">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editingProduct.sellingPrice ?? ''}
                              onChange={e => setEditingProduct({ ...editingProduct, sellingPrice: parseFloat(e.target.value) || 0 })}
                              className="w-20 h-8 bg-editorial-bg border border-editorial-border rounded text-center text-xs font-mono"
                            />
                          ) : (
                            <span>${Number(p.sellingPrice || 0).toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {isSoldOut ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[8px] font-mono font-extrabold bg-rose-950/20 text-rose-400 border border-rose-800/40 uppercase">
                              Sin Existencia
                            </span>
                          ) : isLowStock ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[8px] font-mono font-extrabold bg-amber-950/20 text-amber-400 border border-amber-800/40 uppercase">
                              Reordenar
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[8px] font-mono font-bold bg-emerald-950/20 text-emerald-400 border border-emerald-800/40 uppercase">
                              Suficiente
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {isEditing ? (
                            <div className="flex justify-center gap-1.5">
                              <button
                                onClick={handleSaveInlineEdit}
                                className="p-1 border border-emerald-800 bg-emerald-950/20 text-emerald-400 rounded hover:bg-emerald-500 hover:text-white cursor-pointer"
                                title="Guardar"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingProduct(null)}
                                className="p-1 border border-editorial-border text-rose-400 rounded hover:bg-rose-500 hover:text-white cursor-pointer"
                                title="Cancelar"
                              >
                                X
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  console.log('Producto a editar:', p);
                                  setEditingProduct({ ...p, unit: getUnitLabel(p) as any });
                                }}
                                className="p-1.5 border border-editorial-border text-editorial-text-muted hover:text-amber-500 hover:border-amber-500 rounded bg-editorial-card transition-all cursor-pointer"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`¿Seguro que desea eliminar el producto ${p.name}?`)) {
                                    onDeleteProduct(p.id);
                                    onAddNotification(`Producto ${p.name} eliminado de la base de datos.`, 'info');
                                  }
                                }}
                                className="p-1.5 border border-editorial-border text-rose-400/80 hover:text-white hover:bg-rose-950/40 rounded transition-all cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'adjust' && (
        <div className="bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
          <div className="space-y-1">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Ajuste de Precios</h3>
            <p className="text-xs text-editorial-text-muted">Ajuste de margen de utilidad en volumen de forma instantánea.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-4 bg-editorial-bg border border-editorial-border rounded p-5 space-y-4">
              <span className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">Opciones del Ajuste</span>
              
              <div className="space-y-2">
                <label className="text-xs text-editorial-text-primary block font-medium">Método de Ajuste</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAdjustType('bulk')}
                    className={`py-2 text-[10px] font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                      adjustType === 'bulk' ? 'bg-amber-500 text-white border-amber-600' : 'bg-editorial-card text-editorial-text-muted border-editorial-border hover:text-editorial-text-primary'
                    }`}
                  >
                    Por Categoría (%)
                  </button>
                  <button
                    onClick={() => setAdjustType('single')}
                    className={`py-2 text-[10px] font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                      adjustType === 'single' ? 'bg-amber-500 text-white border-amber-600' : 'bg-editorial-card text-editorial-text-muted border-editorial-border hover:text-editorial-text-primary'
                    }`}
                  >
                    Individual ($)
                  </button>
                </div>
              </div>

              {adjustType === 'bulk' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-editorial-text-primary block font-medium">Seleccionar Categoría</label>
                    <select
                      value={adjustCategory} onChange={e => setAdjustCategory(e.target.value)}
                      className="w-full h-10 px-3 bg-editorial-card border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="Todos">Todas las Categorías</option>
                      <option value="Fresco">Frescos (Oaxaca, Panela, Martín Niño)</option>
                      <option value="Curado">Curados (Cotija, Manchego)</option>
                      <option value="Azul">Azules (Penicillium)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-editorial-text-primary block font-medium">Variación Porcentual</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number" value={adjustPercent} onChange={e => setAdjustPercent(parseFloat(e.target.value) || 0)}
                        className="w-24 h-10 px-3 bg-editorial-card border border-editorial-border rounded text-xs font-mono text-center focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-xs text-editorial-text-muted">% sobre precio actual</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-editorial-text-primary block font-medium">Seleccionar Queso</label>
                    <select
                      value={adjustSelectedProdId} onChange={e => {
                        setAdjustSelectedProdId(e.target.value);
                        const prod = products.find(p => p.id === e.target.value);
                        if (prod) setAdjustNewPrice(prod.sellingPrice);
                      }}
                      className="w-full h-10 px-3 bg-editorial-card border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="">Seleccione un queso...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Actual: ${Number(p.sellingPrice || 0).toFixed(2)})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-editorial-text-primary block font-medium">Nuevo Precio ($/Kg)</label>
                    <input
                      type="number" value={adjustNewPrice} onChange={e => setAdjustNewPrice(parseFloat(e.target.value) || 0)}
                      className="w-full h-10 px-3 bg-editorial-card border border-editorial-border rounded text-xs font-mono focus:outline-none"
                    />
                  </div>
                </>
              )}

              <button
                onClick={handleApplyPriceAdjustment}
                className="w-full py-2.5 bg-amber-500 hover:brightness-110 text-white font-serif font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Ejecutar Ajuste de Precio
              </button>
            </div>

            {/* Simulated Live Preview Card for Price Adjustment */}
            <div className="md:col-span-8 bg-editorial-bg border border-editorial-border rounded p-5 space-y-4">
              <span className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">Simulación de Impacto Comercial</span>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-editorial-border font-mono text-editorial-text-muted">
                      <th className="py-2 px-2">Producto</th>
                      <th className="py-2 px-2 text-right">Precio Actual</th>
                      <th className="py-2 px-2 text-right text-amber-500">Nuevo Ajustado</th>
                      <th className="py-2 px-2 text-right">Margen Neto (Est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      let shouldAdjust = false;
                      let multiplier = 1;
                      let finalP = p.sellingPrice;

                      if (adjustType === 'bulk') {
                        if (adjustCategory === 'Todos' || p.category === adjustCategory) {
                          shouldAdjust = true;
                          multiplier = 1 + (adjustPercent / 100);
                          finalP = parseFloat((Number(p.sellingPrice || 0) * multiplier).toFixed(2));
                        }
                      } else {
                        if (adjustSelectedProdId === p.id) {
                          shouldAdjust = true;
                          finalP = adjustNewPrice;
                        }
                      }

                      const margin = ((finalP - p.purchasePrice) / finalP) * 100;

                      return (
                        <tr key={p.id} className={`border-b border-editorial-border/40 ${shouldAdjust ? 'bg-amber-500/5 font-semibold' : ''}`}>
                          <td className="py-2 px-2">{p.name}</td>
                          <td className="py-2 px-2 text-right font-mono">${Number(p.sellingPrice || 0).toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono text-amber-500">
                            ${finalP.toFixed(2)}
                          </td>
                          <td className={`py-2 px-2 text-right font-mono ${margin > 40 ? 'text-emerald-400' : 'text-editorial-text-primary'}`}>
                            {margin.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'purchase' && (
        <StockPurchasesView
          products={products}
          suppliers={suppliers}
          exchangeRate={exchangeRate}
          onLoadPurchase={onLoadPurchase}
          onAddNotification={onAddNotification}
        />
      )}

      {activeSubTab === 'ledger' && (
        <div className="bg-editorial-card border border-editorial-border rounded p-6 space-y-6 animate-fade-in">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Libro Mayor de Lotes de Quesos</h3>
              <p className="text-xs text-editorial-text-muted">Trazabilidad de maduración y merma por deshidratación natural del queso.</p>
            </div>
            <span className="text-[10px] font-mono bg-editorial-bg border border-editorial-border px-3 py-1 rounded">
              LOTES ACTIVOS: {batches.filter(b => b.status === 'Listo').length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase">
                  <th className="py-3 px-3">ID Lote</th>
                  <th className="py-3 px-3">Queso</th>
                  <th className="py-3 px-3">Fecha de Ingreso</th>
                  <th className="py-3 px-3 text-right">Peso Inicial (Kg)</th>
                  <th className="py-3 px-3 text-right">Peso Actual (Kg)</th>
                  <th className="py-3 px-3 text-right text-rose-400">Merma (Deshidratación)</th>
                  <th className="py-3 px-3 text-center">Estado de Madurez</th>
                  <th className="py-3 px-3 text-center">Ajustar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-editorial-border/60">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-editorial-bg/30 transition-all">
                    <td className="py-3 px-3 font-mono font-bold">{b.id}</td>
                    <td className="py-3 px-3 font-serif font-extrabold text-editorial-text-primary">{b.productName}</td>
                    <td className="py-3 px-3 font-sans text-editorial-text-muted">{b.receivedDate}</td>
                    <td className="py-3 px-3 text-right font-mono">{Number(b.initialWeightKg || 0).toFixed(1)} {getUnitLabel(b)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-editorial-text-primary">
                      {adjustingBatchId === b.id ? (
                        <input
                          type="number" value={newBatchWeight} onChange={e => setNewBatchWeight(parseFloat(e.target.value) || 0)}
                          className="w-16 h-8 text-center bg-editorial-bg border border-editorial-border rounded text-xs font-mono font-bold"
                        />
                      ) : (
                        `${Number(b.currentWeightKg || 0).toFixed(1)} ${getUnitLabel(b)}`
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-rose-400">
                      -{Number(b.shrinkageKg || 0).toFixed(1)} {getUnitLabel(b)} ({((Number(b.shrinkageKg || 0) / (Number(b.initialWeightKg) || 1)) * 100).toFixed(1)}%)
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold border ${
                        b.status === 'Agotado'
                          ? 'bg-rose-950/20 text-rose-400 border-rose-800/40'
                          : b.status === 'Listo'
                          ? 'bg-emerald-950/20 text-emerald-400 border-emerald-800/40'
                          : 'bg-amber-950/20 text-amber-400 border-amber-800/40 animate-pulse'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {adjustingBatchId === b.id ? (
                        <button
                          onClick={() => handleBatchShrinkageAdjust(b.id)}
                          className="px-2 py-1 bg-emerald-500 text-white rounded font-mono text-[9px] cursor-pointer font-bold uppercase"
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setAdjustingBatchId(b.id);
                            setNewBatchWeight(b.currentWeightKg);
                          }}
                          disabled={b.status === 'Agotado'}
                          className="p-1.5 border border-editorial-border hover:border-amber-500 rounded hover:text-amber-500 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed text-editorial-text-muted"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
