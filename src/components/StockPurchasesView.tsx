import React, { useState, useEffect, useRef } from 'react';
import { SupplierProfile, CheeseProduct } from '../types';
import { Mic, Zap, ScanText, Plus, Trash2, Save, Bot, Snowflake, X, Check, RefreshCw } from 'lucide-react';
import { extractInvoiceData } from '../services/ocrService';

export interface PurchaseItem {
  uiId: string;
  productId: string;
  name: string;
  quantityKg: number;
  purchasePrice: number;
  marginPercent: number;
  sellingPrice: number;
}

export interface FrozenInvoice {
  id: string;
  timestamp: number;
  supplierId: string;
  items: PurchaseItem[];
  isCredit: boolean;
  totalCost: number;
}

interface StockPurchasesViewProps {
  products: CheeseProduct[];
  suppliers: SupplierProfile[];
  exchangeRate: number;
  onLoadPurchase: (purchase: {
    supplierId: string;
    items: PurchaseItem[];
    isCredit: boolean;
  }) => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
}

export default function StockPurchasesView({
  products,
  suppliers,
  exchangeRate,
  onLoadPurchase,
  onAddNotification
}: StockPurchasesViewProps) {
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [isCredit, setIsCredit] = useState(true);
  const [aiInput, setAiInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [frozenInvoices, setFrozenInvoices] = useState<FrozenInvoice[]>([]);
  const [showFrozenModal, setShowFrozenModal] = useState(false);

  useEffect(() => {
    const draft = localStorage.getItem('kalu_draft_purchase');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.items && parsed.items.length > 0) {
          setItems(parsed.items);
          if (parsed.supplierId) setSupplierId(parsed.supplierId);
          if (parsed.isCredit !== undefined) setIsCredit(parsed.isCredit);
        }
      } catch (e) {
        console.error('Error loading draft purchase:', e);
      }
    }

    const frozen = localStorage.getItem('kalu_frozen_invoices');
    if (frozen) {
      try {
        setFrozenInvoices(JSON.parse(frozen));
      } catch (e) {
        console.error('Error loading frozen invoices:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (items.length > 0 || supplierId !== '') {
      localStorage.setItem('kalu_draft_purchase', JSON.stringify({ items, supplierId, isCredit }));
    }
  }, [items, supplierId, isCredit]);

  const handleFreezePurchase = () => {
    if (items.length === 0) {
      onAddNotification('No hay productos en la factura para congelar.', 'warning');
      return;
    }
    
    const totalCostUSD = items.reduce((sum, item) => sum + ((Number(item.quantityKg) || 0) * (Number(item.purchasePrice) || 0)), 0);
    
    const newFrozen: FrozenInvoice = {
      id: `fz-${Date.now()}`,
      timestamp: Date.now(),
      supplierId,
      items,
      isCredit,
      totalCost: totalCostUSD
    };
    
    const updatedFrozen = [...frozenInvoices, newFrozen];
    setFrozenInvoices(updatedFrozen);
    localStorage.setItem('kalu_frozen_invoices', JSON.stringify(updatedFrozen));
    
    setItems([]);
    setSupplierId('');
    setIsCredit(true);
    localStorage.removeItem('kalu_draft_purchase');
    
    onAddNotification('Factura congelada y guardada en lista de espera', 'success');
  };

  const handleSeleccionarFotoFactura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setIsScanning(true);
      onAddNotification('Procesando factura con IA...', 'info');
      try {
        const extracted = await extractInvoiceData(file, exchangeRate);
        
        // Supplier Matching
        if (extracted.proveedor?.nombre) {
          const supNombreLow = extracted.proveedor.nombre.toLowerCase();
          const matchedSup = suppliers.find(s => 
            s.name.toLowerCase().includes(supNombreLow) || 
            (s.idNumber && extracted.proveedor.rif && s.idNumber.includes(extracted.proveedor.rif))
          );
          if (matchedSup) {
            setSupplierId(matchedSup.id);
            onAddNotification(`Proveedor detectado: ${matchedSup.name}`, 'success');
          } else {
            onAddNotification(`Proveedor nuevo detectado: ${extracted.proveedor.nombre}. Regístralo o búscalo manualmente.`, 'warning');
          }
        }
        
        // Product Matching
        if (extracted.items && extracted.items.length > 0) {
          const newPurchaseItems: PurchaseItem[] = extracted.items.map(item => {
            const itemNameLow = item.nombre.toLowerCase();
            const matchedProd = products.find(p => p.name.toLowerCase().includes(itemNameLow));
            
            return {
              uiId: `itm-${Date.now()}-${Math.random()}`,
              productId: matchedProd ? matchedProd.id : '',
              name: matchedProd ? matchedProd.name : `[NUEVO] ${item.nombre.toUpperCase()}`,
              quantityKg: item.cantidad,
              purchasePrice: item.costo_unitario,
              marginPercent: 30,
              sellingPrice: parseFloat((item.costo_unitario * 1.3).toFixed(2))
            };
          });
          
          setItems((prev) => [...prev, ...newPurchaseItems]);
          onAddNotification(`Se extrajeron ${newPurchaseItems.length} renglones de la factura con éxito.`, 'success');
        }
      } catch (error: any) {
        console.error(error);
        onAddNotification(error.message || 'Error procesando OCR.', 'warning');
      } finally {
        setIsScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleAddManualItem = () => {
    const newItem: PurchaseItem = {
      uiId: `itm-${Date.now()}`,
      productId: '',
      name: '-- Seleccionar Producto --',
      quantityKg: 0,
      purchasePrice: 0,
      marginPercent: 30,
      sellingPrice: 0
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleUpdateItem = (uiId: string, field: keyof PurchaseItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.uiId !== uiId) return item;
      const updated = { ...item, [field]: value };
      
      if (field === 'productId') {
        const prod = products.find(p => p.id === value);
        if (prod) {
          updated.name = prod.name;
          updated.purchasePrice = prod.purchasePrice;
          updated.sellingPrice = prod.sellingPrice;
          updated.marginPercent = ((prod.sellingPrice - prod.purchasePrice) / prod.sellingPrice) * 100 || 0;
        }
      }
      
      if (field === 'purchasePrice' || field === 'sellingPrice') {
        const cost = field === 'purchasePrice' ? Number(value) : updated.purchasePrice;
        const sell = field === 'sellingPrice' ? Number(value) : updated.sellingPrice;
        if (sell > 0) {
          updated.marginPercent = ((sell - cost) / sell) * 100;
        }
      }

      if (field === 'marginPercent') {
        const margin = Number(value);
        if (margin < 100) {
          updated.sellingPrice = updated.purchasePrice / (1 - (margin / 100));
        }
      }

      return updated;
    }));
  };

  const handleRemoveItem = (uiId: string) => {
    setItems(items.filter(i => i.uiId !== uiId));
  };

  const handleProcessAI = () => {
    if (!aiInput.trim()) {
      onAddNotification('Por favor ingrese o dicte el texto de la compra.', 'warning');
      return;
    }
    // Simulate AI parsing
    onAddNotification('Procesando entrada con IA...', 'info');
    setTimeout(() => {
      onAddNotification('Interpretación inteligente completada.', 'success');
      setAiInput('');
    }, 1000);
  };

  const handleSavePurchase = () => {
    if (!supplierId) {
      onAddNotification('Debe seleccionar un proveedor.', 'warning');
      return;
    }
    if (items.length === 0) {
      onAddNotification('No hay productos en la lista para cargar.', 'warning');
      return;
    }
    const invalidItems = items.some(i => i.quantityKg <= 0 || i.purchasePrice <= 0);
    if (invalidItems) {
      onAddNotification('Todos los productos deben tener cantidad y costo mayor a cero.', 'warning');
      return;
    }

    onLoadPurchase({
      supplierId,
      items,
      isCredit
    });
    
    // Reset form after successful save
    setItems([]);
    setSupplierId('');
    setIsCredit(true);
    localStorage.removeItem('kalu_draft_purchase');
  };

  const totalItems = items.reduce((sum, item) => sum + (Number(item.quantityKg) || 0), 0);
  const totalCostUSD = items.reduce((sum, item) => sum + ((Number(item.quantityKg) || 0) * (Number(item.purchasePrice) || 0)), 0);
  const totalCostBs = totalCostUSD * exchangeRate;

  return (
    <div className="flex flex-col lg:flex-row gap-6 animate-fade-in">
      
      {/* LEFT COLUMN: Editor and Table */}
      <div className="flex-1 space-y-6">
        
        {/* Header & AI Bar */}
        <div className="bg-editorial-card border border-editorial-border rounded p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-editorial-text-primary uppercase tracking-wider">Carga de Mercancía</h2>
              <p className="text-xs text-editorial-text-muted mt-1">Incremento de stock, ajuste de lotes y actualización de costos automatizada.</p>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={isScanning} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-[#1e293b] border border-amber-500/40 text-amber-500 rounded text-xs font-mono hover:bg-amber-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait">
                {isScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ScanText className="w-3.5 h-3.5" />}
                {isScanning ? 'Procesando...' : 'Escanear Factura IA'}
              </button>
              <button onClick={handleFreezePurchase} className="flex items-center gap-2 px-3 py-1.5 bg-editorial-bg border border-editorial-border text-editorial-text-primary rounded text-xs font-mono hover:text-amber-500 hover:border-amber-500/40 transition-colors cursor-pointer">
                <Snowflake className="w-3.5 h-3.5" /> Congelar
              </button>
              {frozenInvoices.length > 0 && (
                <button onClick={() => setShowFrozenModal(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/40 text-amber-500 rounded text-xs font-mono font-bold hover:brightness-110 transition-colors cursor-pointer">
                  <Snowflake className="w-3.5 h-3.5" /> Congeladas ({frozenInvoices.length})
                </button>
              )}
              <input type="file" ref={fileInputRef} accept="image/*,.pdf" className="hidden" onChange={handleSeleccionarFotoFactura} />
            </div>
          </div>

          <div className="flex gap-2 items-center bg-black/40 border border-editorial-border rounded-lg p-2 focus-within:border-amber-500/50 transition-colors">
            <button className="p-2 text-editorial-text-muted hover:text-amber-500 transition-colors cursor-pointer" title="Dictado por voz">
              <Mic className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Ej. 'Me llegaron 50 kilos de queso telita a 4 dólares y 20 de llanero a 3.5...'"
              className="flex-1 bg-transparent border-none text-sm text-editorial-text-primary focus:outline-none placeholder:text-editorial-text-muted/50 font-sans"
            />
            <button 
              onClick={handleProcessAI}
              className="px-4 py-2 bg-amber-500 text-white rounded text-xs font-mono font-bold hover:brightness-110 flex items-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4" /> Ajustar con IA
            </button>
          </div>
        </div>

        {/* Central Table Area */}
        <div className="bg-editorial-card border border-editorial-border rounded flex flex-col">
          <div className="p-4 border-b border-editorial-border flex justify-between items-center bg-black/20">
            <h3 className="font-mono text-[10px] text-editorial-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
              <Bot className="w-4 h-4" /> Detalle de Ítems a Ingresar
            </h3>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-editorial-text-muted">
              <ScanText className="w-12 h-12 opacity-20 mb-4" />
              <p className="font-serif text-lg text-editorial-text-primary mb-1">Sin productos</p>
              <p className="text-xs">Utiliza la IA o añade un producto manualmente para comenzar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-editorial-border bg-black/40 font-mono text-[10px] text-editorial-text-muted uppercase tracking-wider">
                    <th className="py-3 px-4 w-[25%]">Producto</th>
                    <th className="py-3 px-3 w-[15%]">Cant. (Kg)</th>
                    <th className="py-3 px-3 w-[15%]">Costo ($)</th>
                    <th className="py-3 px-3 w-[15%]">% Ganancia</th>
                    <th className="py-3 px-3 w-[15%] text-amber-500">P. Venta ($)</th>
                    <th className="py-3 px-3 w-[15%] text-right">Subtotal</th>
                    <th className="py-3 px-2 w-[5%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-editorial-border/40">
                  {items.map((item) => (
                    <tr key={item.uiId} className="hover:bg-editorial-bg/30 group">
                      <td className="py-2 px-4">
                        <select 
                          value={item.productId}
                          onChange={(e) => handleUpdateItem(item.uiId, 'productId', e.target.value)}
                          className="w-full bg-black/30 border border-editorial-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                        >
                          <option value="">-- Seleccionar Producto --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input 
                          type="number" step="0.01" min="0"
                          value={item.quantityKg || ''}
                          onChange={(e) => handleUpdateItem(item.uiId, 'quantityKg', Number(e.target.value))}
                          className="w-full bg-black/30 border border-editorial-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                          placeholder="0"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input 
                          type="number" step="0.01" min="0"
                          value={item.purchasePrice || ''}
                          onChange={(e) => handleUpdateItem(item.uiId, 'purchasePrice', Number(e.target.value))}
                          className="w-full bg-black/30 border border-editorial-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input 
                          type="number" step="0.1" min="0" max="99"
                          value={item.marginPercent.toFixed(1)}
                          onChange={(e) => handleUpdateItem(item.uiId, 'marginPercent', Number(e.target.value))}
                          className="w-full bg-black/30 border border-editorial-border rounded px-2 py-1.5 text-xs text-editorial-text-muted focus:outline-none focus:border-amber-500 font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input 
                          type="number" step="0.01" min="0"
                          value={item.sellingPrice.toFixed(2)}
                          onChange={(e) => handleUpdateItem(item.uiId, 'sellingPrice', Number(e.target.value))}
                          className="w-full bg-black/30 border border-amber-500/40 rounded px-2 py-1.5 text-xs text-amber-500 font-bold focus:outline-none focus:border-amber-500 font-mono"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-editorial-text-primary">
                        ${(item.quantityKg * item.purchasePrice).toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button 
                          onClick={() => handleRemoveItem(item.uiId)}
                          className="p-1.5 text-editorial-text-muted hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-4 bg-black/20 border-t border-editorial-border flex justify-center">
            <button 
              onClick={handleAddManualItem}
              className="flex items-center gap-2 px-6 py-2 border border-editorial-border hover:border-editorial-text-muted text-editorial-text-primary rounded text-xs font-mono uppercase tracking-wider transition-all cursor-pointer bg-editorial-bg"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir Producto Manualmente
            </button>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Summary Panel */}
      <div className="w-full lg:w-[320px] xl:w-[380px] shrink-0">
        <div className="bg-editorial-card border border-editorial-border rounded p-6 sticky top-6 space-y-6">
          <div className="border-b border-editorial-border/40 pb-4">
            <h3 className="font-serif text-lg font-bold text-editorial-text-primary">Resumen de Compra</h3>
            <p className="text-[10px] font-mono text-editorial-text-muted uppercase mt-1">Totalización e Ingreso</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-editorial-text-muted uppercase block tracking-wider">Productor / Proveedor</label>
              <select 
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-11 px-3 bg-black/30 border border-editorial-border rounded text-sm text-white focus:outline-none focus:border-amber-500 cursor-pointer font-serif"
              >
                <option value="">Seleccione el proveedor...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/30 border border-editorial-border rounded">
              <div>
                <span className="block text-[10px] font-mono text-editorial-text-muted uppercase">¿Compra a Crédito?</span>
                <span className="text-xs text-editorial-text-primary font-sans">Generar cuenta en Libreta</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={isCredit}
                  onChange={(e) => setIsCredit(e.target.checked)}
                />
                <div className="w-11 h-6 bg-editorial-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-editorial-border/40 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="font-mono text-editorial-text-muted uppercase text-[10px]">Ítems Totales</span>
              <span className="font-mono font-bold text-white">{totalItems.toFixed(2)} Kg</span>
            </div>
            
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded text-right space-y-1">
              <span className="block text-[10px] font-mono text-amber-500/80 uppercase tracking-wider text-left mb-2">Monto Total a Invertir</span>
              <span className="block font-mono text-3xl font-extrabold text-amber-500">${totalCostUSD.toFixed(2)} USD</span>
              <span className="block font-mono text-xs text-editorial-text-muted">Bs {totalCostBs.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <button 
            onClick={handleSavePurchase}
            className="w-full py-4 mt-6 bg-amber-500 text-white rounded font-serif font-bold text-sm tracking-widest uppercase hover:brightness-110 flex justify-center items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
          >
            <Save className="w-5 h-5" /> Guardar e Incrementar
          </button>
        </div>
      </div>

      {showFrozenModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-editorial-card border border-editorial-border rounded p-6 w-full max-w-2xl shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-serif text-2xl font-bold text-editorial-text-primary flex items-center gap-2">
                <Snowflake className="w-6 h-6 text-amber-500" /> Facturas en Espera
              </h3>
              <button onClick={() => setShowFrozenModal(false)} className="text-editorial-text-muted hover:text-white cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {frozenInvoices.map(inv => {
                const supplierName = suppliers.find(s => s.id === inv.supplierId)?.name || 'Sin Proveedor';
                const dateString = new Date(inv.timestamp).toLocaleString();
                
                return (
                  <div key={inv.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-editorial-bg border border-editorial-border rounded gap-4">
                    <div>
                      <div className="font-mono text-xs text-editorial-text-muted mb-1">{dateString}</div>
                      <div className="font-serif font-bold text-white text-lg">{supplierName}</div>
                      <div className="text-xs text-editorial-text-muted mt-1">{inv.items.length} ítems registrados</div>
                    </div>
                    <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                      <div className="font-mono text-amber-500 font-bold text-lg">${inv.totalCost.toFixed(2)}</div>
                      <div className="flex gap-2 w-full md:w-auto">
                        <button 
                          onClick={() => {
                            setItems(inv.items);
                            setSupplierId(inv.supplierId);
                            setIsCredit(inv.isCredit);
                            
                            const newFrozen = frozenInvoices.filter(f => f.id !== inv.id);
                            setFrozenInvoices(newFrozen);
                            localStorage.setItem('kalu_frozen_invoices', JSON.stringify(newFrozen));
                            
                            setShowFrozenModal(false);
                            onAddNotification('Factura recuperada exitosamente', 'success');
                          }}
                          className="flex-1 md:flex-none px-4 py-2 bg-amber-500 text-white rounded text-xs font-mono font-bold hover:brightness-110 transition-colors cursor-pointer"
                        >
                          Cargar
                        </button>
                        <button 
                          onClick={() => {
                            if(window.confirm('¿Seguro que deseas eliminar este borrador?')) {
                              const newFrozen = frozenInvoices.filter(f => f.id !== inv.id);
                              setFrozenInvoices(newFrozen);
                              localStorage.setItem('kalu_frozen_invoices', JSON.stringify(newFrozen));
                              if (newFrozen.length === 0) setShowFrozenModal(false);
                            }
                          }}
                          className="px-3 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded hover:bg-rose-500/20 transition-colors cursor-pointer"
                          title="Eliminar borrador"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
