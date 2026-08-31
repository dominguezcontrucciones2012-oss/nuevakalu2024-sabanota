import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../../services/localApi';
import React, { useState, useEffect, useRef } from 'react';



import { askGemini } from '../../services/gemini';
import { Camera, Image as ImageIcon, ArrowLeft, UploadCloud, Loader2, Calendar, CheckCircle, Sparkles } from 'lucide-react';

interface PhotoAlbumViewProps {
  onBack: () => void;
}

interface Draft {
  id: string;
  type: 'photo' | 'voice_note';
  text?: string;
  url?: string;
  date: string;
  createdAt: string;
}

export default function PhotoAlbumView({ onBack }: PhotoAlbumViewProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchDrafts();
  }, [today]);

  const fetchDrafts = async () => {
    setIsLoading(true);
    try {
      const res = await fetchCollection('daily_drafts');
      const drafts = await res.json();
      const fetchedDrafts = drafts.filter((d: any) => d.date === today) as Draft[];
      
      fetchedDrafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDrafts(fetchedDrafts);
    } catch (error) {
      console.error("Error fetching drafts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('files', file);

      const hostname = window.location.hostname;
      const res = await fetch(`http://${hostname}:3001/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      const downloadURL = `http://${hostname}:3001${data.fileUrls[0]}`;

      const newDraft = {
        type: 'photo' as const,
        url: downloadURL,
        date: today,
        createdAt: new Date().toISOString()
      };
      
      await addLocalDoc('daily_drafts', newDraft);
      fetchDrafts();
      setIsUploading(false);
    } catch (error) {
      console.error("Error initiating upload:", error);
      setIsUploading(false);
    }
  };

  const handleProcessDay = async () => {
    if (drafts.length === 0) return;
    setIsProcessing(true);
    setAiResult(null);

    try {
      // Recopilar textos de notas de voz
      const voiceNotes = drafts.filter(d => d.type === 'voice_note').map(d => d.text).join('\n- ');
      
      const prompt = `
        Aquí tienes las notas de voz dictadas hoy por el usuario sobre compras e inventario:
        - ${voiceNotes}
        
        Por favor, analiza estos textos y extrae una lista estructurada de los productos comprados, la cantidad y el precio.
        Devuelve el resultado en un formato de lista claro. Si no hay notas de voz útiles, indícalo.
      `;

      const response = await askGemini(prompt, "Eres el procesador contable nocturno de la Quesería Kalu.");
      setAiResult(response);
    } catch (error) {
      console.error("Error procesando con IA:", error);
      setAiResult("Ocurrió un error al procesar el día.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-serif font-bold text-zinc-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" /> Álbum Diario
            </h2>
            <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">{today}</p>
          </div>
        </div>
        
        <button
          onClick={handleProcessDay}
          disabled={isProcessing || drafts.length === 0}
          className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-mono uppercase font-bold tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
        >
          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Procesar Día
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* AI Result Banner */}
          {aiResult && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 lg:p-6 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Sparkles className="w-24 h-24 text-emerald-500" />
              </div>
              <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" /> Resumen Generado por IA
              </h3>
              <div className="text-sm text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed relative z-10">
                {aiResult}
              </div>
              <div className="mt-4 flex justify-end relative z-10">
                <button 
                  onClick={() => setAiResult(null)}
                  className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  Cerrar Resumen
                </button>
              </div>
            </div>
          )}

          {/* Upload Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Camera className="w-6 h-6 text-emerald-400" />
              </div>
              <span className="text-xs font-bold text-zinc-300">Tomar Foto</span>
            </button>

            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-zinc-400" />
              </div>
              <span className="text-xs font-bold text-zinc-300">Subir de Galería</span>
            </button>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex justify-between text-xs mb-2 text-zinc-400">
                <span>Subiendo archivo...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Timeline Diario */}
          <div className="pt-4">
            <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4 ml-1 flex items-center gap-2">
              Línea de Tiempo del Día
              <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-[9px]">{drafts.length} registros</span>
            </h3>

            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-center p-10 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30">
                <UploadCloud className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 font-medium">Aún no hay actividad hoy</p>
                <p className="text-[10px] text-zinc-600 mt-1">Toma fotos de recibos o dicta notas para llenar tu día.</p>
              </div>
            ) : (
              <div className="relative border-l border-zinc-800 ml-3 space-y-6 pb-4">
                {drafts.map((draft, idx) => (
                  <div key={draft.id} className="relative pl-6">
                    {/* Timeline Node */}
                    <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-zinc-950 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                    
                    <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 shadow-sm hover:border-zinc-700 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                          draft.type === 'photo' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          {draft.type === 'photo' ? 'Recibo / Factura' : 'Nota de Voz'}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(draft.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      
                      {draft.type === 'photo' && draft.url && (
                        <div className="mt-2 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 aspect-[4/3] relative group">
                          <img 
                            src={draft.url} 
                            alt="Recibo" 
                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                          />
                        </div>
                      )}

                      {draft.type === 'voice_note' && draft.text && (
                        <p className="text-sm text-zinc-300 leading-relaxed mt-1">
                          "{draft.text}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
