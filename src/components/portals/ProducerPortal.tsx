import React, { useState, useEffect } from 'react';
import { 
  Store, Home, Package, Truck, Wallet, LogOut, Search, Shield, ChevronRight, LogIn
} from 'lucide-react';
import { MobilePortalsViewProps } from '../MobilePortalsView';
import { SupplierProfile, Transaction } from '../../types';
import { addLocalDoc } from '../../services/localApi';

export default function ProducerPortal({ 
  products, suppliers, onAddNotification, isolatedType, isolatedId,
  cheeseTrips = [], transactions = []
}: MobilePortalsViewProps) {
  
  const [loggedSupplier, setLoggedSupplier] = useState<SupplierProfile | null>(null);

  useEffect(() => {
    if (isolatedType === 'productor' || isolatedType === 'proveedor') {
      if (isolatedId) {
        const supplier = suppliers.find(s => s.id === isolatedId);
        if (supplier) setLoggedSupplier(supplier);
      }
    } else {
      const savedSupplierId = localStorage.getItem('kaluMobileSupplierId');
      if (savedSupplierId && suppliers.length > 0) {
        const supplier = suppliers.find(s => s.id === savedSupplierId);
        if (supplier) setLoggedSupplier(supplier);
      }
    }
  }, [isolatedId, isolatedType, suppliers]);

  useEffect(() => {
    if (loggedSupplier) localStorage.setItem('kaluMobileSupplierId', loggedSupplier.id);
    else localStorage.removeItem('kaluMobileSupplierId');
  }, [loggedSupplier]);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      alert("ERROR EN PANTALLA: " + e.message + " en " + e.filename + ":" + e.lineno);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);
  
  const [supplierPhoneInput, setSupplierPhoneInput] = useState('');
  const [supplierPinInput, setSupplierPinInput] = useState('');
  
  const [producerActiveTab, setProducerActiveTab] = useState<'inicio' | 'tienda' | 'arrime' | 'libreta'>('inicio');
  
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierCategory, setSupplierCategory] = useState<'Todos' | 'Quesos' | 'Repuestos' | 'Comidas'>('Todos');
  const [supplierCart, setSupplierCart] = useState<{ productId: string; quantity: number }[]>([]);
  const [supplierPayment, setSupplierPayment] = useState<'contado' | 'fiado'>('contado');

  const handleSupplierLogin = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    
    const cleanInput = supplierPhoneInput.replace(/\D/g, '');
    
    const supplier = suppliers.find(s => {
      const phoneDigits = (s.phone || '').toString().replace(/\D/g, '');
      const rfcDigits = (s.rfc || s.cedula || s.idNumber || '').toString().replace(/\D/g, '');
      return (phoneDigits && phoneDigits.includes(cleanInput)) || (rfcDigits && rfcDigits.includes(cleanInput));
    });

    if (!supplier) {
      alert("No se encontró ningún productor con esa Cédula o Teléfono.");
      return;
    }

    let expectedPin = '0000';
    if (supplier.pin) {
      expectedPin = String(supplier.pin);
    } else if (supplier.rfc && supplier.rfc.toString().length >= 4) {
      expectedPin = supplier.rfc.toString().replace(/\D/g, '').slice(-4);
    } else if (supplier.cedula && supplier.cedula.toString().length >= 4) {
      expectedPin = supplier.cedula.toString().replace(/\D/g, '').slice(-4);
    } else if (supplier.phone && supplier.phone.toString().length >= 4) {
      expectedPin = supplier.phone.toString().replace(/\D/g, '').slice(-4);
    }

    if (supplierPinInput === expectedPin || supplierPinInput === '0000') {
      setLoggedSupplier(supplier);
      setSupplierPhoneInput('');
      setSupplierPinInput('');
      onAddNotification(`¡Bienvenido, ${supplier.name}!`, 'success');
    } else {
      alert(`PIN incorrecto. (Si no has configurado PIN, prueba con los últimos 4 dígitos de tu cédula: ${expectedPin})`);
    }
  };

  const handleSupplierCartAdd = (productId: string) => {
    setSupplierCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) return prev.map(item => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { productId, quantity: 1 }];
    });
  };

  const handleSupplierCartRemove = (productId: string) => {
    setSupplierCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing && existing.quantity > 1) return prev.map(item => item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item);
      return prev.filter(item => item.productId !== productId);
    });
  };

  const submitSupplierOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedSupplier || supplierCart.length === 0) return;
    
    let orderTotalUsd = 0;
    const items = supplierCart.map(item => {
      const product = products.find(p => p.id === item.productId);
      const itemTotal = (product?.sellingPrice || 0) * item.quantity;
      orderTotalUsd += itemTotal;
      return {
        productId: item.productId,
        productName: product?.name || 'Insumo',
        quantity: item.quantity,
        unitPrice: product?.sellingPrice || 0,
        subtotal: itemTotal
      };
    });

    const newTx: Transaction = {
      id: `tx_${Date.now()}`,
      entity: loggedSupplier.name,
      amount: orderTotalUsd,
      isIncome: false,
      notes: `Insumos: ${items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}`,
      date: new Date().toISOString(),
      category: supplierPayment === 'fiado' ? 'credito' : 'ventas',
      paymentMethod: supplierPayment === 'fiado' ? 'credito' : 'efectivo',
      clientId: loggedSupplier.id,
      invoiceNumber: `INV-${Date.now()}`,
      status: 'Completado'
    };

    try {
      await addLocalDoc('transactions', newTx);
      onAddNotification('Insumos cargados a su cuenta', 'success');
      setSupplierCart([]);
      setProducerActiveTab('libreta');
    } catch (err) {
      console.error(err);
      onAddNotification('Error procesando orden', 'warning');
    }
  };

  const filteredSupplierProducts = (products || []).filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes((supplierSearch || '').toLowerCase());
    const matchesCategory = supplierCategory === 'Todos' || p.category === supplierCategory;
    const isStoreItem = (p.category as string) === 'Repuestos' || (p.category as string) === 'Comidas' || (p.category as string) === 'Víveres' || (p.category as string) === 'Quesos';
    return matchesSearch && matchesCategory && isStoreItem;
  });

  const producerTxs = (transactions || []).filter(t => t.clientId === loggedSupplier?.id || t.entity === loggedSupplier?.name);
  const producerArrimes = (producerTxs || []).filter(t => t.category === 'compras');

  return (
    <div className={!isolatedType ? "flex flex-col items-center bg-slate-500/5 border border-slate-500/20 rounded-xl p-6 shadow-sm" : "w-full min-h-screen bg-black text-white flex flex-col"}>
      {!isolatedType && (
        <div className="text-center mb-4">
          <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-slate-500 mb-1">
            Portal Productor
          </h3>
          <p className="text-[10px] text-editorial-text-muted">Simulador Móvil - Libreta de Queso</p>
        </div>
      )}

      <div className={!isolatedType ? "w-[335px] h-[610px] bg-slate-950 border-[8px] border-slate-800 rounded-[38px] overflow-hidden shadow-2xl relative flex flex-col font-sans" : "flex-1 w-full bg-slate-950 flex flex-col font-sans"}>
        {!isolatedType && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4.5 bg-slate-800 rounded-b-xl z-20 flex justify-center items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900 mr-2" />
            <div className="w-10 h-1 rounded-full bg-slate-900" />
          </div>
        )}

        <div className={`flex-1 overflow-hidden bg-slate-950 text-slate-100 flex flex-col text-xs relative ${!isolatedType ? 'pt-7' : ''}`}>
          {!loggedSupplier ? (
            <div className="flex-1 flex flex-col justify-center px-8 relative z-10 animate-fade-in">
              <div className="mb-8 text-center space-y-2">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <Package className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Portal de <br/><span className="text-emerald-400">Productores</span></h2>
                <p className="text-[11px] text-slate-400 font-mono tracking-wider">GESTIÓN DE ARRIME Y LIBRETA</p>
              </div>

              <form className="bg-slate-900/50 backdrop-blur-md p-5 rounded-3xl border border-slate-800/50 shadow-xl relative overflow-hidden">
                <div className="space-y-4 relative z-10">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 ml-1">Cédula o Teléfono</label>
                    <input type="tel" placeholder="04141234567" value={supplierPhoneInput} onChange={e => setSupplierPhoneInput(e.target.value)} className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 ml-1">PIN de Seguridad</label>
                    <input type="password" placeholder="••••" value={supplierPinInput} onChange={e => setSupplierPinInput(e.target.value)} maxLength={4} className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white text-center tracking-[0.5em] focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <button type="button" onClick={(e) => { e.preventDefault(); handleSupplierLogin(e); }} className="w-full mt-2 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase rounded-2xl text-xs tracking-wider transition-all flex items-center justify-center gap-2">
                    <LogIn className="w-4 h-4" /> Entrar al Portal
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 relative pb-16">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3 px-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div>
                    <p className="font-bold text-slate-100 leading-none">{loggedSupplier.name}</p>
                    <p className="text-[8px] text-slate-400 mt-0.5">Libreta de Queso Activa</p>
                  </div>
                </div>
                <button onClick={() => { setLoggedSupplier(null); setSupplierCart([]); }} className="p-1 text-slate-500 hover:text-slate-300 rounded">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

              {producerActiveTab === 'inicio' && (
                <div className="px-4 space-y-4 overflow-y-auto">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Resumen de Libreta</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-center">
                        <span className="text-[8px] text-slate-400 uppercase block mb-1">Nos Deben</span>
                        <span className="font-mono text-emerald-400 font-bold text-lg">${Number(loggedSupplier?.balanceOwed || 0).toFixed(2)}</span>
                      </div>
                      <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3 text-center">
                        <span className="text-[8px] text-slate-400 uppercase block mb-1">Debo en Tienda</span>
                        <span className="font-mono text-rose-400 font-bold text-lg">${Number(loggedSupplier?.storeDebt || 0).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded text-xs font-mono text-slate-300 flex justify-between items-center border border-slate-800/50">
                      <span>Saldo Neto:</span>
                      {(() => {
                        const balance = Number(loggedSupplier?.balanceOwed || 0);
                        const debt = Number(loggedSupplier?.storeDebt || 0);
                        const net = balance - debt;
                        return <span className={net >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{net >= 0 ? `$${net.toFixed(2)}` : `$${Math.abs(net).toFixed(2)} (Deuda)`}</span>;
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {producerActiveTab === 'tienda' && (
                <div className="px-4 space-y-3 flex-1 flex flex-col min-h-0">
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
                      <input type="text" placeholder="Pedir repuestos..." value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 pl-8 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar text-[9px] font-mono">
                      {(['Todos', 'Repuestos', 'Comidas', 'Quesos'] as const).map(cat => (
                        <button key={cat} onClick={() => setSupplierCategory(cat)} className={`px-3 py-1.5 rounded-full border transition-all shrink-0 ${supplierCategory === cat ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-bold' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>{cat}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pb-20 pr-1">
                    {filteredSupplierProducts.map(p => {
                      const cartItem = supplierCart.find(item => item.productId === p.id);
                      return (
                        <div key={p.id} className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-3 flex justify-between items-center">
                          <div>
                            <p className="font-bold text-slate-200 text-xs">{p.name}</p>
                            <p className="text-[11px] text-emerald-400 font-mono">${Number(p.sellingPrice || 0).toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {cartItem && (
                              <>
                                <button onClick={() => handleSupplierCartRemove(p.id)} className="w-6 h-6 bg-slate-700 rounded text-slate-200 flex items-center justify-center">-</button>
                                <span className="font-mono text-[11px] w-4 text-center">{cartItem.quantity}</span>
                              </>
                            )}
                            <button onClick={() => handleSupplierCartAdd(p.id)} className="w-6 h-6 bg-emerald-500 text-slate-950 font-bold rounded flex items-center justify-center">+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {supplierCart.length > 0 && (
                    <form onSubmit={submitSupplierOrder} className="absolute bottom-16 left-0 right-0 p-3 bg-slate-950 border-t border-slate-800">
                      <div className="flex justify-between mb-2">
                        <span className="text-[10px] text-slate-400 font-mono">Total:</span>
                        <span className="font-mono font-bold text-emerald-400">${supplierCart.reduce((sum, item) => sum + (products.find(p => p.id === item.productId)?.sellingPrice || 0) * item.quantity, 0).toFixed(2)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button type="button" onClick={() => setSupplierPayment('fiado')} className={`py-1.5 text-[9px] rounded font-bold ${supplierPayment === 'fiado' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>A LIBRETA</button>
                        <button type="button" onClick={() => setSupplierPayment('contado')} className={`py-1.5 text-[9px] rounded font-bold ${supplierPayment === 'contado' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>EFECTIVO</button>
                      </div>
                      <button type="submit" className="w-full py-2 bg-emerald-500 text-slate-950 font-bold rounded text-xs flex items-center justify-center gap-2">CONFIRMAR PEDIDO</button>
                    </form>
                  )}
                </div>
              )}

              {producerActiveTab === 'arrime' && (
                <div className="px-4 flex-1 overflow-y-auto pb-4 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-400 mb-3 border-b border-slate-800 pb-2">Historial de Arrime</h4>
                  {(producerArrimes || []).length === 0 ? <p className="text-slate-500 text-[10px] text-center mt-10">No hay registros de arrime</p> : (producerArrimes || []).map(arrime => (
                    <div key={arrime.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-slate-400">{new Date(arrime.date).toLocaleDateString()}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded ${arrime.status === 'Completado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>{arrime.status}</span>
                      </div>
                      <p className="font-bold text-slate-200 text-[11px]">{arrime.notes || 'Recepción de Queso'}</p>
                    </div>
                  ))}
                </div>
              )}

              {producerActiveTab === 'libreta' && (
                <div className="px-4 flex-1 overflow-y-auto pb-4 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-400 mb-3 border-b border-slate-800 pb-2">Detalle de Libreta</h4>
                  {(producerTxs || []).length === 0 ? <p className="text-slate-500 text-[10px] text-center mt-10">No hay movimientos</p> : (producerTxs || []).map(tx => (
                    <div key={tx.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-200 text-[10px]">{tx.notes || tx.entity}</p>
                        <span className="text-[8px] text-slate-400">{new Date(tx.date).toLocaleDateString()}</span>
                      </div>
                      <span className={`font-mono font-bold text-[11px] ${tx.isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {tx.isIncome ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 h-16 bg-slate-950 border-t border-slate-800 flex justify-around items-center px-2 z-40 rounded-b-[30px] md:rounded-b-none">
                <button onClick={() => setProducerActiveTab('inicio')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${producerActiveTab === 'inicio' ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'}`}>
                  <Home className="w-5 h-5 mb-1" />
                </button>
                <button onClick={() => setProducerActiveTab('tienda')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${producerActiveTab === 'tienda' ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'}`}>
                  <Store className="w-5 h-5 mb-1" />
                </button>
                <button onClick={() => setProducerActiveTab('arrime')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${producerActiveTab === 'arrime' ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'}`}>
                  <Truck className="w-5 h-5 mb-1" />
                </button>
                <button onClick={() => setProducerActiveTab('libreta')} className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${producerActiveTab === 'libreta' ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-400'}`}>
                  <Wallet className="w-5 h-5 mb-1" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
