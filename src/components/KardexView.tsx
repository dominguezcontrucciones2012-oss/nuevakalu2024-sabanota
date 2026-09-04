import React, { useState, useEffect } from 'react';
import { KardexMovement } from '../types';
import { fetchCollection, onCollectionSnapshot } from '../services/localApi';
import KaluLoader from './KaluLoader';
import { Search, Filter, BookOpen, ArrowUpRight, ArrowDownRight, AlertTriangle, Edit3, RefreshCw, DownloadCloud } from 'lucide-react';

const CACHE_KEY = 'kalu_kardex_cache';

export default function KardexView() {
  const [movements, setMovements] = useState<KardexMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  useEffect(() => {
    const unsubscribe = onCollectionSnapshot('kardex', (data) => {
      // Sort descending by date
      data.sort((a, b) => {
        const getMs = (item: any) => {
          if (item.timestamp && typeof item.timestamp.toMillis === 'function') return item.timestamp.toMillis();
          if (item.timestamp && typeof item.timestamp === 'number') return item.timestamp;
          if (item.id) {
            const parts = item.id.split('-');
            for (const part of parts) {
              if (part.length >= 12 && !isNaN(Number(part))) return parseInt(part, 10);
            }
          }
          return new Date(item.date).getTime() || 0;
        };
        return getMs(b) - getMs(a);
      });
      setMovements(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadKardex = async () => {
    // Handled by snapshot now
  };

  const loadOlder = async () => {
    // Handled by snapshot now
  };

  const filteredMovements = movements.filter(m => {
    const matchesSearch = (m.productName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (m.referenceId || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'ALL' || m.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'ENTRADA_COMPRA': return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', icon: ArrowDownRight, label: 'Entrada / Compra' };
      case 'SALIDA_VENTA': return { bg: 'bg-rose-500/10', text: 'text-rose-500', icon: ArrowUpRight, label: 'Salida / Venta' };
      case 'MERMA_DANO': return { bg: 'bg-amber-500/10', text: 'text-amber-500', icon: AlertTriangle, label: 'Merma / Daño' };
      case 'AJUSTE_MANUAL': return { bg: 'bg-blue-500/10', text: 'text-blue-500', icon: Edit3, label: 'Ajuste Manual' };
      default: return { bg: 'bg-gray-500/10', text: 'text-gray-400', icon: BookOpen, label: type };
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto space-y-6 animate-fade-in pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-editorial-border pb-6">
        <div>
          <h1 className="text-4xl font-serif font-black text-editorial-text-primary tracking-tight uppercase flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-amber-500" />
            Libro Mayor Kardex
          </h1>
          <p className="text-sm text-editorial-text-muted mt-2 font-mono tracking-widest uppercase">
            Registro universal de movimientos de inventario
          </p>
        </div>
        <button
          onClick={loadKardex}
          disabled={loading}
          className="bg-editorial-surface border border-editorial-border text-editorial-text-primary px-4 py-2 text-xs font-bold uppercase tracking-widest hover:border-amber-500 hover:text-amber-500 transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar Novedades
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-editorial-surface/50 p-4 border border-editorial-border/50">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-editorial-text-muted" />
          <input
            type="text"
            placeholder="BUSCAR POR PRODUCTO O REFERENCIA (EJ. TX-1234)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-editorial-bg border border-editorial-border text-editorial-text-primary font-mono text-xs uppercase focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
          />
        </div>
        <div className="w-full md:w-64 flex gap-2">
          <div className="bg-editorial-bg border border-editorial-border px-3 py-2 flex items-center justify-center">
            <Filter className="w-4 h-4 text-editorial-text-muted" />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 bg-editorial-bg border border-editorial-border text-editorial-text-primary font-mono text-xs uppercase px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">TODOS LOS MOVIMIENTOS</option>
            <option value="ENTRADA_COMPRA">ENTRADAS / COMPRAS</option>
            <option value="SALIDA_VENTA">SALIDAS / VENTAS</option>
            <option value="MERMA_DANO">MERMAS / DAÑOS</option>
            <option value="AJUSTE_MANUAL">AJUSTES MANUALES</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 border border-editorial-border bg-editorial-surface/30 overflow-x-auto shadow-2xl relative">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-editorial-border bg-editorial-surface/80">
              <th className="px-4 py-4 text-xs font-bold text-editorial-text-primary uppercase tracking-widest whitespace-nowrap">Fecha / Ref</th>
              <th className="px-4 py-4 text-xs font-bold text-editorial-text-primary uppercase tracking-widest whitespace-nowrap">Tipo</th>
              <th className="px-4 py-4 text-xs font-bold text-editorial-text-primary uppercase tracking-widest">Producto</th>
              <th className="px-4 py-4 text-xs font-bold text-editorial-text-primary uppercase tracking-widest whitespace-nowrap">Stock Previo</th>
              <th className="px-4 py-4 text-xs font-bold text-editorial-text-primary uppercase tracking-widest whitespace-nowrap">Cant.</th>
              <th className="px-4 py-4 text-xs font-bold text-editorial-text-primary uppercase tracking-widest whitespace-nowrap">Nuevo Stock</th>
              <th className="px-4 py-4 text-xs font-bold text-editorial-text-primary uppercase tracking-widest text-right whitespace-nowrap">Costo Unit.</th>
              <th className="px-4 py-4 text-xs font-bold text-editorial-text-primary uppercase tracking-widest text-right whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm">
            {movements.length === 0 && loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center bg-slate-950/50">
                  <KaluLoader message="MUNDO KALU" subMessage="CARGANDO KARDEX..." size="sm" />
                </td>
              </tr>
            ) : filteredMovements.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-editorial-text-muted">NO SE ENCONTRARON MOVIMIENTOS</td>
              </tr>
            ) : (
              filteredMovements.map((m) => {
                const style = getTypeStyle(m.type);
                const Icon = style.icon;
                return (
                  <tr key={m.id} className="border-b border-editorial-border/30 hover:bg-editorial-surface/50 transition-colors">
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <div className="text-xs text-editorial-text-primary">{formatDate(m.date)}</div>
                      <div className="text-[10px] text-editorial-text-muted mt-1 uppercase tracking-widest">REF: {m.referenceId || m.id.slice(-6)}</div>
                      {m.userOrCashier && <div className="text-[10px] text-amber-500/70 mt-0.5">USR: {m.userOrCashier}</div>}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-sm ${style.bg} ${style.text}`}>
                        <Icon className="w-3 h-3" />
                        <span className="text-[10px] font-bold tracking-widest uppercase">{style.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top min-w-[200px]">
                      <div className="text-editorial-text-primary font-medium uppercase">{m.productName}</div>
                      {m.notes && <div className="text-xs text-editorial-text-muted mt-1 truncate max-w-xs">{m.notes}</div>}
                    </td>
                    <td className="px-4 py-3 align-top text-editorial-text-muted whitespace-nowrap">
                      {m.previousStock} <span className="text-[10px]">{m.unit}</span>
                    </td>
                    <td className="px-4 py-3 align-top font-bold text-editorial-text-primary whitespace-nowrap">
                      {m.type === 'SALIDA_VENTA' || m.type === 'MERMA_DANO' ? '-' : '+'}{m.quantity} <span className="text-[10px] font-normal text-editorial-text-muted">{m.unit}</span>
                    </td>
                    <td className="px-4 py-3 align-top font-bold text-amber-500 whitespace-nowrap">
                      {m.newStock} <span className="text-[10px] font-normal">{m.unit}</span>
                    </td>
                    <td className="px-4 py-3 align-top text-right text-editorial-text-muted whitespace-nowrap">
                      ${(m.unitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 align-top text-right text-editorial-text-primary font-medium whitespace-nowrap">
                      ${(m.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        
        {/* Pagination/Load Older is now handled entirely by local realtime sync */}
      </div>
    </div>
  );
}

