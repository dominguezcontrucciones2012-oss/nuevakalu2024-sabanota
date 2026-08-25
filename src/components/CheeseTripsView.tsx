import React, { useState } from 'react';
import { CheeseTrip, CheeseProduct, ClientProfile, TripInvoice, Transaction } from '../types';
import { 
  Truck, Plus, Search, Trash2, Banknote
} from 'lucide-react';
import { formatCurrency } from '../utils';

interface CheeseTripsViewProps {
  cheeseTrips: CheeseTrip[];
  cheeseProducts: CheeseProduct[];
  clients: ClientProfile[];
  exchangeRate: number;
  onCreateTrip: (trip: Omit<CheeseTrip, 'id'>) => Promise<void>;
  onUpdateTrip: (id: string, updates: Partial<CheeseTrip>) => Promise<void>;
  onSettleTrip: (id: string, settlementData: Partial<CheeseTrip>) => Promise<void>;
  onAddNotification: (msg: string, type: 'success'|'info'|'warning') => void;
  onNavigateToModule?: (moduleId: string, params?: any) => void;
  onAddTransaction?: (tx: Partial<Transaction>) => void;
}

export default function CheeseTripsView({
  cheeseTrips,
  cheeseProducts,
  clients,
  exchangeRate,
  onCreateTrip,
  onUpdateTrip,
  onSettleTrip,
  onAddNotification,
  onNavigateToModule,
  onAddTransaction
}: CheeseTripsViewProps) {
  const [activeTab, setActiveTab] = useState<'en_ruta' | 'liquidados'>('en_ruta');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<CheeseTrip | null>(null);

  // New Trip Form State
  const [clientId, setClientId] = useState(''); // Will store the selected fixed responsible
  const [driver, setDriver] = useState('Daisy Corro'); // Default responsible
  const [cheeseSearch, setCheeseSearch] = useState('');
  const [cheeseId, setCheeseId] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);
  const [dispatchedKg, setDispatchedKg] = useState(0);
  const [costPerKg, setCostPerKg] = useState(0);
  
  const [cashTakenUsd, setCashTakenUsd] = useState(0);
  const [cashTakenBs, setCashTakenBs] = useState(0);

  // Settlement Form State
  const [cashUsd, setCashUsd] = useState(0);
  const [cashBs, setCashBs] = useState(0);
  const [bankBs, setBankBs] = useState(0);
  const [bankUsd, setBankUsd] = useState(0);
  
  // Facturas de Víveres
  const [invoiceItems, setInvoiceItems] = useState<{description: string, quantity: number, totalCostUsd: number}[]>([]);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemCost, setNewItemCost] = useState(0);

  const filteredTrips = cheeseTrips.filter(t => 
    activeTab === 'en_ruta' ? t.status === 'en_ruta' : t.status === 'liquidado'
  );

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = cheeseProducts.find(p => p.id === cheeseId);
    
    // Validación de Bolsa Combinada: Al menos Queso > 0 o Efectivo > 0
    if ((!prod || dispatchedKg <= 0) && cashTakenUsd <= 0 && cashTakenBs <= 0) {
      onAddNotification('Debe despachar queso o registrar retiro de efectivo para iniciar el viaje.', 'warning');
      return;
    }

    let client = clients.find(c => c.name.toLowerCase() === driver.toLowerCase());
    
    const dispatchedCostValue = (prod && dispatchedKg > 0) ? (dispatchedKg * costPerKg) : 0;
    const totalCashValueUsd = cashTakenUsd + (cashTakenBs / exchangeRate);
    const totalBagValueUsd = dispatchedCostValue + totalCashValueUsd;

    // Registrar Transacciones de Efectivo en Bóveda si aplica
    if (totalCashValueUsd > 0 && onAddTransaction) {
      if (cashTakenUsd > 0) {
        onAddTransaction({
          category: 'gastos',
          amount: cashTakenUsd,
          isIncome: false,
          notes: `Adelanto / Fondeo Gira San Juan (USD) - Responsable: ${driver}`,
          paymentMethod: 'Efectivo USD',
          entity: driver
        });
      }
      if (cashTakenBs > 0) {
        onAddTransaction({
          category: 'gastos',
          amount: cashTakenBs,
          isIncome: false,
          notes: `Adelanto / Fondeo Gira San Juan (BS) - Responsable: ${driver}`,
          paymentMethod: 'Efectivo BS',
          entity: driver
        });
      }
    }

    await onCreateTrip({
      tripNumber: cheeseTrips.length + 1,
      date: new Date().toISOString(),
      destination: 'San Juan',
      clientId: client?.id || driver, // Si no existe, usamos el nombre como ID para que no reviente
      clientName: driver,
      driverOrResponsible: driver,
      status: 'en_ruta',
      cheeseProductId: prod ? prod.id : '',
      cheeseProductName: prod ? prod.name : 'Viaje Solo Efectivo',
      dispatchedKg,
      costPerKgUsd: costPerKg,
      dispatchedCostValue,
      cashTakenUsd,
      cashTakenBs,
      totalBagValueUsd,
      invoices: [],
      totalInvoicesValueUsd: 0,
      cashReturnedUsd: 0,
      cashReturnedBs: 0,
      bankReturnedBs: 0,
      bankReturnedUsd: 0,
      bcvRateAtSettlement: exchangeRate,
      totalSettlementValueUsd: 0,
      netProfitUsd: 0,
      createdAt: new Date().toISOString()
    });
    
    // Reset Form
    setCheeseId('');
    setCheeseSearch('');
    setDispatchedKg(0);
    setCostPerKg(0);
    setCashTakenUsd(0);
    setCashTakenBs(0);
    setShowCreateModal(false);
  };

  const handleAddInvoiceItem = () => {
    if (!newItemDesc.trim() || newItemCost <= 0 || newItemQty <= 0) return;
    setInvoiceItems([...invoiceItems, { description: newItemDesc, quantity: newItemQty, totalCostUsd: newItemCost }]);
    setNewItemDesc('');
    setNewItemQty(1);
    setNewItemCost(0);
  };

  const handleRemoveInvoiceItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrip) return;

    // En la nueva lógica, ya no se registran facturas ni caja fuerte desde aquí.
    // Solo se asienta el balance reportado para cerrar el viaje.
    const totalLiquidado = cashUsd + (cashBs / exchangeRate) + (bankBs / exchangeRate) + bankUsd + invoiceItems.reduce((sum, item) => sum + item.totalCostUsd, 0); 
    const totalViveres = invoiceItems.reduce((sum, item) => sum + item.totalCostUsd, 0);
    const netProfit = totalLiquidado - selectedTrip.dispatchedCostValue;

    onSettleTrip(selectedTrip.id, {
      totalInvoicesValueUsd: totalViveres,
      cashReturnedUsd: cashUsd,
      cashReturnedBs: cashBs,
      bankReturnedBs: bankBs,
      bankReturnedUsd: bankUsd,
      bcvRateAtSettlement: exchangeRate,
      totalSettlementValueUsd: totalLiquidado,
      netProfitUsd: netProfit
    });
    setSelectedTrip(null);
    setCashUsd(0);
    setCashBs(0);
    setBankBs(0);
    setBankUsd(0);
    setInvoiceItems([]);
  };

  const searchedProducts = cheeseProducts.filter(p => 
    p.stockKg > 0 && p.name.toLowerCase().includes(cheeseSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-editorial-text-primary tracking-tight">
            Giras &amp; Viajes San Juan
          </h1>
          <p className="text-xs text-editorial-text-muted mt-1 font-mono uppercase tracking-wider">
            Control de despacho, gastos y liquidación
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Registrar Salida
        </button>
      </div>

      <div className="flex gap-4 border-b border-editorial-border/60">
        <button
          onClick={() => setActiveTab('en_ruta')}
          className={`pb-3 px-2 text-sm font-semibold tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'en_ruta' ? 'border-amber-500 text-amber-500' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          EN RUTA ({cheeseTrips.filter(t => t.status === 'en_ruta').length})
        </button>
        <button
          onClick={() => setActiveTab('liquidados')}
          className={`pb-3 px-2 text-sm font-semibold tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'liquidados' ? 'border-emerald-500 text-emerald-500' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          LIQUIDADOS ({cheeseTrips.filter(t => t.status === 'liquidado').length})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTrips.map((trip) => (
          <div key={trip.id} className="bg-editorial-card border border-editorial-border rounded p-5 space-y-4 hover:border-editorial-text-muted transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <span className={`text-[9px] px-2 py-0.5 rounded font-mono uppercase font-bold tracking-widest ${
                  trip.status === 'en_ruta' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
                }`}>
                  {trip.status === 'en_ruta' ? 'En Ruta' : 'Liquidado'}
                </span>
                <h3 className="font-serif text-lg font-bold text-editorial-text-primary mt-2">
                  Viaje #{trip.tripNumber}
                </h3>
              </div>
              <Truck className={`w-6 h-6 ${trip.status === 'en_ruta' ? 'text-amber-500' : 'text-emerald-500'}`} />
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between mb-2">
                <span className="text-editorial-text-muted">Responsable:</span>
                <span className="text-editorial-text-primary font-bold">{trip.clientName}</span>
              </div>
              
              {(trip.dispatchedKg > 0 || trip.dispatchedCostValue > 0) && (
                <div className="flex justify-between border-t border-editorial-border/30 pt-1">
                  <span className="text-editorial-text-muted">Queso ({trip.dispatchedKg}Kg):</span>
                  <span className="text-editorial-text-primary">{formatCurrency(trip.dispatchedCostValue)}</span>
                </div>
              )}
              
              {((trip.cashTakenUsd || 0) > 0 || (trip.cashTakenBs || 0) > 0) && (
                <div className="flex justify-between border-t border-editorial-border/30 pt-1">
                  <span className="text-editorial-text-muted">Efectivo Bóveda:</span>
                  <span className="text-editorial-text-primary">
                    {formatCurrency((trip.cashTakenUsd || 0) + ((trip.cashTakenBs || 0) / exchangeRate))}
                  </span>
                </div>
              )}

              <div className="flex justify-between border-t border-editorial-border pt-2 mt-2">
                <span className="text-editorial-text-muted">Bolsa Total:</span>
                <span className="text-amber-500 font-bold text-sm">{formatCurrency(trip.totalBagValueUsd || trip.dispatchedCostValue)}</span>
              </div>
            </div>

            {trip.status === 'en_ruta' ? (
              <div className="mt-4 pt-4 border-t border-editorial-border space-y-2">
                <button
                  onClick={() => onNavigateToModule && onNavigateToModule('invoice-upload', { tripId: trip.id })}
                  className="w-full mt-2 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Cerrar & Liquidar Viaje
                </button>
              </div>
            ) : (
              <div className="mt-4 pt-4 border-t border-editorial-border space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-editorial-text-muted">Retorno Neto:</span>
                  <span className="text-emerald-500 font-bold">{formatCurrency(trip.totalSettlementValueUsd)}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-editorial-text-muted">Balance:</span>
                  <span className={`font-bold ${trip.netProfitUsd >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {formatCurrency(trip.netProfitUsd)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
        {filteredTrips.length === 0 && (
          <div className="col-span-full py-12 text-center border border-dashed border-editorial-border rounded">
            <p className="text-editorial-text-muted font-mono text-sm uppercase">No hay viajes en esta sección.</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-editorial-card border border-editorial-border p-6 rounded shadow-xl w-full max-w-lg">
            <h2 className="font-serif text-2xl font-bold text-editorial-text-primary mb-4">Nueva Salida de Viaje</h2>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Responsable Fijo</label>
                <select required value={driver} onChange={e => setDriver(e.target.value)} className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-editorial-text-primary">
                  <option value="Daisy Corro">Daisy Corro</option>
                  <option value="Juan Carlos Domínguez">Juan Carlos Domínguez</option>
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Producto a Despachar (Opcional)</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-editorial-text-muted" />
                    <input 
                      type="text" 
                      placeholder="Escriba para buscar..."
                      value={cheeseSearch} 
                      onChange={e => {
                        setCheeseSearch(e.target.value);
                        setShowProductResults(true);
                        setCheeseId('');
                      }} 
                      onFocus={() => setShowProductResults(true)}
                      className="w-full pl-9 pr-3 py-2 bg-editorial-bg border border-editorial-border rounded text-sm text-editorial-text-primary" 
                    />
                  </div>
                  {showProductResults && cheeseSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-editorial-card border border-editorial-border rounded shadow-lg max-h-48 overflow-y-auto">
                      {searchedProducts.map(p => (
                        <div 
                          key={p.id}
                          onClick={() => {
                            setCheeseId(p.id);
                            setCheeseSearch(p.name);
                            setShowProductResults(false);
                          }}
                          className="p-2 text-sm hover:bg-editorial-bg cursor-pointer flex justify-between items-center"
                        >
                          <span className="font-medium text-white">{p.name}</span>
                          <span className="text-xs text-amber-500 font-mono">Disp: {p.stockKg}Kg</span>
                        </div>
                      ))}
                      {searchedProducts.length === 0 && (
                        <div className="p-3 text-xs text-editorial-text-muted text-center">No se encontraron productos con stock</div>
                      )}
                    </div>
                  )}
                  {cheeseId && (
                    <div className="mt-2 text-xs text-emerald-500 font-mono flex items-center gap-1">
                      ✓ Producto seleccionado correctamente
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Kg Despachados</label>
                  <input type="number" step="0.1" value={dispatchedKg} onChange={e => setDispatchedKg(Number(e.target.value))} className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-editorial-text-primary" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Costo Acordado ($/Kg)</label>
                <input type="number" step="0.01" value={costPerKg} onChange={e => setCostPerKg(Number(e.target.value))} className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-editorial-text-primary" />
              </div>

              <div className="border-t border-editorial-border/50 pt-4 mt-2">
                <h3 className="text-sm font-bold font-serif text-editorial-text-primary mb-3 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-500" /> Adelanto Efectivo (Bóveda Central)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Entregar USD</label>
                    <input type="number" step="0.01" min="0" value={cashTakenUsd} onChange={e => setCashTakenUsd(Number(e.target.value))} className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-emerald-400 font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-editorial-text-muted mb-1">Entregar Bs</label>
                    <input type="number" step="0.01" min="0" value={cashTakenBs} onChange={e => setCashTakenBs(Number(e.target.value))} className="w-full bg-editorial-bg border border-editorial-border rounded p-2 text-sm text-emerald-400 font-bold" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-editorial-border">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-xs font-bold font-mono uppercase text-editorial-text-muted hover:text-editorial-text-primary transition-colors cursor-pointer">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer">Registrar Salida</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
