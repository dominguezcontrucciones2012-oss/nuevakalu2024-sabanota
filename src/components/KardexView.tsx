import React, { useState, useEffect, useCallback } from 'react';
import { KardexMovement } from '../types';
import { fetchCollectionQuery, onCollectionSignal } from '../services/localApi';
import { getUnitLabel } from '../utils';
import KaluLoader from './KaluLoader';
import {
  Search,
  Filter,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Edit3,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function KardexView() {
  // Helper para obtener fecha local YYYY-MM-DD
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState<string>(getTodayStr());
  const [endDate, setEndDate] = useState<string>(getTodayStr());
  const [appliedRange, setAppliedRange] = useState<{ start: string; end: string }>({
    start: getTodayStr(),
    end: getTodayStr()
  });

  const [movements, setMovements] = useState<KardexMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Paginación server-side
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const isTodayActive = appliedRange.start === getTodayStr() && appliedRange.end === getTodayStr();

  // Función de consulta server-side
  const loadKardexData = useCallback(async (targetPage = 1, customRange = appliedRange, term = searchTerm, tFilter = typeFilter) => {
    setLoading(true);
    try {
      const result = await fetchCollectionQuery<KardexMovement>('kardex', {
        startDate: customRange.start,
        endDate: customRange.end,
        page: targetPage,
        limit: pageSize,
        search: term || undefined,
        type: tFilter !== 'ALL' ? tFilter : undefined
      });

      setMovements(result.items || []);
      setPage(result.page || 1);
      setTotalPages(result.totalPages || 1);
      setTotalCount(result.total || 0);
    } catch (err) {
      console.error('[KardexView] Error cargando Kardex server-side:', err);
    } finally {
      setLoading(false);
    }
  }, [appliedRange, pageSize, searchTerm, typeFilter]);

  // Carga inicial (Hoy) y escucha en tiempo real de nuevas operaciones sin traer todo el histórico
  useEffect(() => {
    loadKardexData(1);

    // Escuchar señales de actualización para refrescar la página actual en tiempo real
    const unsubscribeSignal = onCollectionSignal('kardex', () => {
      loadKardexData(page);
    });

    return () => unsubscribeSignal();
  }, [loadKardexData, page]);

  // Aplicar filtro de fechas al hacer click en Buscar / Consultar
  const handleApplyFilter = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newRange = {
      start: startDate || getTodayStr(),
      end: endDate || getTodayStr()
    };
    setAppliedRange(newRange);
    setPage(1);
    loadKardexData(1, newRange, searchTerm, typeFilter);
  };

  // Botón rápido para volver a "HOY"
  const handleSetToday = () => {
    const today = getTodayStr();
    setStartDate(today);
    setEndDate(today);
    const newRange = { start: today, end: today };
    setAppliedRange(newRange);
    setPage(1);
    loadKardexData(1, newRange, searchTerm, typeFilter);
  };

  // Cambios de página
  const handlePrevPage = () => {
    if (page > 1) {
      const newPage = page - 1;
      setPage(newPage);
      loadKardexData(newPage);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages) {
      const newPage = page + 1;
      setPage(newPage);
      loadKardexData(newPage);
    }
  };

  // Buscar con debounce o enter
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadKardexData(1, appliedRange, searchTerm, typeFilter);
  };

  const getTypeStyle = (type: string) => {
    const t = String(type || '').toUpperCase();
    switch (t) {
      case 'ENTRADA_COMPRA': return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', icon: ArrowDownRight, label: 'Entrada / Compra' };
      case 'SALIDA_VENTA': return { bg: 'bg-rose-500/10', text: 'text-rose-500', icon: ArrowUpRight, label: 'Salida / Venta' };
      case 'MERMA_DANO': return { bg: 'bg-amber-500/10', text: 'text-amber-500', icon: AlertTriangle, label: 'Merma / Daño' };
      case 'AJUSTE_MANUAL': return { bg: 'bg-blue-500/10', text: 'text-blue-500', icon: Edit3, label: 'Ajuste Manual' };
      default: return { bg: 'bg-gray-500/10', text: 'text-gray-400', icon: BookOpen, label: type };
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
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
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-serif font-black text-editorial-text-primary tracking-tight uppercase flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-amber-500" />
              Libro Mayor Kardex
            </h1>
            {isTodayActive ? (
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold uppercase rounded tracking-wider">
                ● Mostrando Hoy
              </span>
            ) : (
              <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[10px] font-bold uppercase rounded tracking-wider">
                ● Rango: {appliedRange.start} al {appliedRange.end}
              </span>
            )}
          </div>
          <p className="text-sm text-editorial-text-muted mt-2 font-mono tracking-widest uppercase">
            Consulta histórica y auditoría de movimientos de inventario
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadKardexData(page)}
            disabled={loading}
            className="bg-editorial-surface border border-editorial-border text-editorial-text-primary px-4 py-2 text-xs font-bold uppercase tracking-widest hover:border-amber-500 hover:text-amber-500 transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Date Range Selector & Quick Actions */}
      <form onSubmit={handleApplyFilter} className="bg-editorial-card border border-editorial-border rounded p-4 flex flex-wrap items-end gap-4 shadow-md">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-editorial-text-muted uppercase flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            Desde
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:border-amber-500 outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-editorial-text-muted uppercase flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            Hasta
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:border-amber-500 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-9 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-black uppercase rounded tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow"
        >
          <Search className="w-3.5 h-3.5" />
          Consultar
        </button>

        <button
          type="button"
          onClick={handleSetToday}
          className={`h-9 px-4 text-xs font-mono font-bold uppercase rounded border transition-colors cursor-pointer ${
            isTodayActive
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : 'bg-editorial-surface text-editorial-text-muted border-editorial-border hover:text-emerald-400 hover:border-emerald-400'
          }`}
        >
          Ver Hoy
        </button>

        <div className="ml-auto flex items-center text-xs font-mono text-editorial-text-muted">
          <span>Total en período: <strong className="text-editorial-text-primary">{totalCount}</strong> movimientos</span>
        </div>
      </form>

      {/* Search & Type Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-editorial-surface/50 p-4 border border-editorial-border/50">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-editorial-text-muted" />
          <input
            type="text"
            placeholder="BUSCAR POR PRODUCTO, REF O NOTAS (PULSA ENTER)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-editorial-bg border border-editorial-border text-editorial-text-primary font-mono text-xs uppercase focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
          />
        </form>
        <div className="w-full md:w-64 flex gap-2">
          <div className="bg-editorial-bg border border-editorial-border px-3 py-2 flex items-center justify-center">
            <Filter className="w-4 h-4 text-editorial-text-muted" />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => {
              const val = e.target.value;
              setTypeFilter(val);
              setPage(1);
              loadKardexData(1, appliedRange, searchTerm, val);
            }}
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
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center bg-slate-950/50">
                  <KaluLoader message="MUNDO KALU" subMessage="CARGANDO MOVIMIENTOS DE KARDEX..." size="sm" />
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-editorial-text-muted">
                  <div className="max-w-md mx-auto space-y-2">
                    <BookOpen className="w-8 h-8 text-neutral-600 mx-auto" />
                    <p className="text-sm font-sans font-medium text-neutral-300">
                      Sin movimientos de Kardex en este período.
                    </p>
                    <p className="text-xs text-neutral-500 font-mono">
                      Selecciona un rango de fechas en el calendario superior para consultar el histórico.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              movements.map((m) => {
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
                      {m.previousStock} <span className="text-[10px] font-medium text-editorial-text-primary">{getUnitLabel(m)}</span>
                    </td>
                    <td className="px-4 py-3 align-top font-bold text-editorial-text-primary whitespace-nowrap">
                      {m.type === 'SALIDA_VENTA' || m.type === 'MERMA_DANO' ? '-' : '+'}{m.quantity} <span className="text-[10px] font-normal text-editorial-text-muted">{getUnitLabel(m)}</span>
                    </td>
                    <td className="px-4 py-3 align-top font-bold text-amber-500 whitespace-nowrap">
                      {m.newStock} <span className="text-[10px] font-medium">{getUnitLabel(m)}</span>
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
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-editorial-surface p-4 border border-editorial-border font-mono text-xs">
          <div className="text-editorial-text-muted">
            Página <strong className="text-editorial-text-primary">{page}</strong> de <strong className="text-editorial-text-primary">{totalPages}</strong> ({totalCount} registros en total)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 bg-editorial-bg border border-editorial-border rounded text-editorial-text-primary hover:border-amber-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="px-3 py-1.5 bg-editorial-card border border-editorial-border text-amber-500 font-bold rounded">
              {page}
            </span>
            <button
              onClick={handleNextPage}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 bg-editorial-bg border border-editorial-border rounded text-editorial-text-primary hover:border-amber-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors cursor-pointer"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


