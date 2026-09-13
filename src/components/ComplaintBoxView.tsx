import React, { useState } from 'react';
import { CustomerComplaint } from '../types';
import { MessageSquare, Plus, CheckCircle, FileCheck } from 'lucide-react';

interface ComplaintBoxViewProps {
  complaints: CustomerComplaint[];
  onAddComplaint: (comp: Omit<CustomerComplaint, 'id' | 'status' | 'date'>) => void;
  onUpdateComplaintStatus: (id: string, newStatus: 'Pendiente' | 'Atendida' | 'Desestimada') => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
}

export default function ComplaintBoxView({
  complaints,
  onAddComplaint,
  onUpdateComplaintStatus,
  onAddNotification
}: ComplaintBoxViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<'Calidad' | 'Atención' | 'Precio' | 'Otros'>('Calidad');
  const [description, setDescription] = useState('');

  const handleCreateComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) return;
    onAddComplaint({
      clientName: clientName || 'Anónimo',
      phone,
      category,
      description
    });
    onAddNotification('Buzón de quejas actualizado. Se ha asignado un folio de atención.', 'success');
    setClientName('');
    setPhone('');
    setCategory('Calidad');
    setDescription('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center border-b border-editorial-border pb-4">
        <div>
          <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Buzón de Quejas y Sugerencias</h3>
          <p className="text-xs text-editorial-text-muted">Control interno de satisfacción, calidad de producto e incidencias de proveedores.</p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase flex items-center gap-1.5 hover:brightness-110 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Registrar Incidencia
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateComplaint} className="bg-editorial-card border border-editorial-border rounded p-6 space-y-4 max-w-2xl">
          <div className="pb-2 border-b border-editorial-border/40 flex justify-between items-center">
            <span className="font-serif text-md font-bold text-editorial-text-primary">Redactar Nueva Entrada del Buzón</span>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-xs font-mono text-rose-400 uppercase hover:underline">Cancelar</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-editorial-text-muted uppercase block font-medium">Nombre del Informante</label>
              <input
                type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ej: Don Chilo (Opcional)"
                className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-editorial-text-muted uppercase block font-medium">Teléfono de Enlace</label>
              <input
                type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ej: 341-112-9010"
                className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block font-medium">Categoría del Reporte</label>
            <select
              value={category} onChange={e => setCategory(e.target.value as any)}
              className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none cursor-pointer"
            >
              <option value="Calidad">Calidad (Queso agrio, salado, consistencia)</option>
              <option value="Atención">Servicio en Tienda / POS</option>
              <option value="Precio">Precio de venta</option>
              <option value="Otros">Otros Asuntos</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-editorial-text-muted uppercase block font-medium">Detalle / Relación de Hechos</label>
            <textarea
              required rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Escriba los pormenores de la queja..."
              className="w-full p-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full h-11 bg-amber-500 text-white font-serif font-bold text-xs uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer"
          >
            Depositar Queja en Buzón
          </button>
        </form>
      )}

      {/* List of complaints */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {complaints.map((c) => {
          const isPending = c.status === 'Pendiente';
          return (
            <div key={c.id} className={`bg-editorial-card border rounded p-6 flex flex-col justify-between transition-all duration-300 relative overflow-hidden ${
              isPending ? 'border-amber-500/30 font-medium' : 'border-editorial-border opacity-75'
            }`}>
              {/* Corner Watermark status */}
              <div className={`absolute top-0 right-0 border-b border-l px-3 py-1 text-[9px] font-mono font-bold uppercase ${
                c.status === 'Pendiente'
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  : 'bg-emerald-950/20 text-emerald-400 border-emerald-800/40'
              }`}>
                {c.status}
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-editorial-text-muted/60 block">FOLIO: {c.id} • {c.date}</span>
                  <span className="text-xs font-mono font-bold text-amber-500 uppercase">{c.category}</span>
                  <p className="font-sans text-xs text-editorial-text-primary italic pt-1 leading-relaxed">
                    "{c.description}"
                  </p>
                </div>

                <div className="text-[11px] font-sans text-editorial-text-muted/80 pt-2 border-t border-editorial-border/40">
                  <span className="font-mono text-[9px] uppercase text-editorial-text-muted/55 block">Reportado por:</span>
                  <span className="font-semibold text-editorial-text-primary">{c.clientName}</span> {c.phone && `• ${c.phone}`}
                </div>

                {c.resolutionNotes && (
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded text-[11px] font-sans text-editorial-text-primary">
                    <span className="text-[9px] font-mono font-bold text-emerald-400 block uppercase mb-1">Nota de Resolución:</span>
                    {c.resolutionNotes}
                  </div>
                )}
              </div>

              {isPending && (
                <div className="mt-5 pt-3 border-t border-editorial-border/60 flex justify-end gap-2.5">
                  <button
                    onClick={() => onUpdateComplaintStatus(c.id, 'Desestimada')}
                    className="px-2.5 py-1 text-[9px] font-mono border border-editorial-border hover:border-rose-500 hover:text-rose-500 rounded bg-editorial-bg transition-all cursor-pointer"
                  >
                    Archivar / Desestimar
                  </button>
                  <button
                    onClick={() => onUpdateComplaintStatus(c.id, 'Atendida')}
                    className="px-2.5 py-1 text-[9px] font-mono bg-emerald-500 hover:bg-emerald-600 text-white rounded cursor-pointer transition-all flex items-center gap-1"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Atendida
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
