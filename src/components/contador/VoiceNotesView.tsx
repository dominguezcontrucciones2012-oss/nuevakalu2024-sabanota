import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../../services/localApi';
import React, { useState, useEffect, useRef } from 'react';
import { structureVoiceNoteWithAI, StructuredVoiceNote } from '../../services/ocrService';
import { Mic, Square, ArrowLeft, Save, Loader2, Play, CheckCircle2, Sparkles, Tag, DollarSign, RefreshCw, Trash2, Calendar } from 'lucide-react';

interface VoiceNotesViewProps {
  onBack: () => void;
  exchangeRate?: number;
}

interface Draft {
  id: string;
  text: string;
  type: 'voice_note';
  date: string;
  createdAt: string;
  structured?: StructuredVoiceNote;
}

export default function VoiceNotesView({ onBack, exchangeRate = 45.00 }: VoiceNotesViewProps) {
  // Estado de Grabación y Audio
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  
  // Estado de IA y Estructuración
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [structuredData, setStructuredData] = useState<StructuredVoiceNote | null>(null);
  
  // Lista de Borradores
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const shouldKeepRecordingRef = useRef(false);
  const accumulatedTextRef = useRef('');
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Cargar borradores de hoy
  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        const res = await fetchCollection('daily_drafts');
        const draftsList = await res.json();
        const fetchedDrafts = draftsList.filter((d: any) => d.date === today && d.type === 'voice_note') as Draft[];
        
        fetchedDrafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setDrafts(fetchedDrafts);
      } catch (error) {
        console.error("Error fetching drafts:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDrafts();
  }, [today]);

  // 1. Alternancia (Toggle) de Grabación Manual
  const toggleRecording = async () => {
    if (isRecording) {
      // SEGUNDO TOQUE: Detener y Procesar con IA
      shouldKeepRecordingRef.current = false;
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      } catch (e) {}
      setIsRecording(false);
      setInterimTranscript('');

      // Obtener el texto que esté en transcript o en el ref
      const finalText = (transcript || accumulatedTextRef.current).trim();
      if (finalText) {
        setTranscript(finalText);
        await processWithAI(finalText);
      }
    } else {
      // PRIMER TOQUE: Iniciar Grabación Continua
      accumulatedTextRef.current = '';
      setTranscript('');
      setInterimTranscript('');
      setStructuredData(null);
      shouldKeepRecordingRef.current = true;
      setIsRecording(true);

      if (typeof window !== 'undefined') {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          try {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'es-419'; // Español Latinoamérica / Venezuela

            recognition.onresult = (event: any) => {
              let fullText = '';
              let interimText = '';

              for (let i = 0; i < event.results.length; ++i) {
                const part = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                  fullText += (fullText ? ' ' : '') + part.trim();
                } else {
                  interimText += (interimText ? ' ' : '') + part.trim();
                }
              }

              const combined = (fullText || interimText).trim();
              if (combined) {
                accumulatedTextRef.current = combined;
                setTranscript(combined);
              }
              setInterimTranscript(interimText);
            };

            recognition.onerror = (event: any) => {
              console.warn("Speech recognition notice:", event.error);
              if (event.error === 'not-allowed') {
                alert("Por favor permite el acceso al micrófono en el navegador para dictar.");
                setIsRecording(false);
                shouldKeepRecordingRef.current = false;
              }
            };

            recognition.onend = () => {
              if (shouldKeepRecordingRef.current) {
                try {
                  recognition.start();
                } catch (e) {
                  console.warn("Re-iniciando speech:", e);
                }
              } else {
                setIsRecording(false);
              }
            };

            recognitionRef.current = recognition;
            recognition.start();
          } catch (e) {
            console.error("Error al instanciar SpeechRecognition:", e);
          }
        } else {
          alert("Tu navegador no soporta dictado por voz nativo. Puedes escribir la nota en el cuadro de texto.");
          setIsRecording(false);
          shouldKeepRecordingRef.current = false;
        }
      }
    }
  };

  // 2. Procesamiento con IA (ocrService / Gemini)
  const processWithAI = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    setIsAnalyzingAI(true);
    try {
      const result = await structureVoiceNoteWithAI(cleanText, exchangeRate);
      setStructuredData(result);
    } catch (e) {
      console.error("Error al estructurar nota con IA:", e);
      // Fallback para no bloquear
      setStructuredData({
        title: 'Nota de Voz',
        category: 'nota_general',
        summary: cleanText,
        suggestedAction: 'Guardado manual'
      });
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  // 3. Guardado Manual por el Usuario
  const handleSaveDraft = async () => {
    const textToSave = (transcript || accumulatedTextRef.current).trim();
    if (!textToSave) {
      alert("Por favor dicta o escribe un texto para guardar la nota.");
      return;
    }
    
    setIsSaving(true);
    try {
      const newDraft: any = {
        text: textToSave,
        type: 'voice_note',
        date: today,
        createdAt: new Date().toISOString(),
        structured: structuredData || undefined
      };
      
      const docData = await addLocalDoc('daily_drafts', newDraft);
      const savedDraft = { id: docData.id, ...newDraft };
      
      setDrafts(prev => [savedDraft, ...prev]);
      setTranscript('');
      setInterimTranscript('');
      accumulatedTextRef.current = '';
      setStructuredData(null);
      alert("Nota de voz guardada exitosamente en borradores de hoy.");
    } catch (error) {
      console.error("Error guardando borrador:", error);
      alert("Error al guardar la nota.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    try {
      await deleteLocalDoc('daily_drafts', id);
      setDrafts(prev => prev.filter(d => d.id !== id));
    } catch (e) {
      console.error("Error eliminando borrador:", e);
    }
  };

  const hasContent = Boolean(transcript.trim() || accumulatedTextRef.current.trim());

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
              <Mic className="w-4 h-4 text-indigo-400" /> Notas de Voz IA
            </h2>
            <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">Dictado Continuo • Toggle Manual</p>
          </div>
        </div>

        {isRecording && (
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 px-3 py-1 rounded-full animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-[11px] font-mono font-bold text-rose-400 uppercase">Grabando Audio...</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full space-y-6 flex-1 flex flex-col">
          
          {/* Zona Principal de Grabación y Toggle */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 lg:p-8 flex flex-col items-center text-center relative overflow-hidden shrink-0 shadow-xl">
            {isRecording && (
              <div className="absolute inset-0 bg-indigo-500/10 animate-pulse pointer-events-none" />
            )}
            
            {/* BOTÓN TOGGLE PRINCIPAL */}
            <button
              onClick={toggleRecording}
              className={`w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 ${
                isRecording 
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/50 scale-110 ring-4 ring-rose-500/30 animate-pulse' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-105'
              } cursor-pointer z-10`}
              title={isRecording ? "Presiona para detener la grabación" : "Presiona para comenzar a grabar"}
            >
              {isRecording ? (
                <>
                  <Square className="w-8 h-8 fill-current mb-1" />
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider">Parar</span>
                </>
              ) : (
                <>
                  <Mic className="w-9 h-9 mb-1" />
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider">Grabar</span>
                </>
              )}
            </button>
            
            <p className="mt-4 text-xs font-mono uppercase tracking-widest text-zinc-400">
              {isRecording 
                ? '🟢 Grabación activa continua. Habla libremente y toca cuando termines.' 
                : 'Toca el botón para iniciar grabación continua o escribe abajo.'}
            </p>

            {/* Cuadro de Transcripción */}
            <div className="mt-6 w-full relative z-10">
              <textarea
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  accumulatedTextRef.current = e.target.value;
                }}
                placeholder="El texto dictado aparecerá aquí mientras hablas. También puedes tipear directamente..."
                className="w-full h-28 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none font-sans leading-relaxed"
              />
              {interimTranscript && isRecording && (
                <div className="text-[11px] font-mono text-zinc-500 text-left mt-1 px-1 truncate">
                  Capturando: <span className="text-indigo-400">{interimTranscript}</span>
                </div>
              )}
            </div>

            {/* Tarjeta de Análisis de IA Estructurado (Previsualización antes de guardar) */}
            {isAnalyzingAI && (
              <div className="mt-4 w-full p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center gap-3 text-indigo-300 text-xs font-mono z-10">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>La IA de Gemini está estructurando los datos de la nota...</span>
              </div>
            )}

            {structuredData && !isAnalyzingAI && (
              <div className="mt-4 w-full p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-left z-10 animate-fade-in space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 font-serif flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> {structuredData.title || 'Nota Estructurada'}
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold">
                    {structuredData.category}
                  </span>
                </div>
                
                <p className="text-xs text-zinc-300">{structuredData.summary}</p>

                {(structuredData.amountUsd || structuredData.amountBs) && (
                  <div className="flex gap-4 pt-2 border-t border-zinc-800/80 text-xs font-mono">
                    {structuredData.amountUsd ? (
                      <span className="text-emerald-400 font-bold">
                        Monto: ${structuredData.amountUsd.toFixed(2)} USD
                      </span>
                    ) : null}
                    {structuredData.amountBs ? (
                      <span className="text-zinc-400">
                        ({structuredData.amountBs.toLocaleString('es-MX')} Bs)
                      </span>
                    ) : null}
                    {structuredData.paymentMethod ? (
                      <span className="text-amber-500">
                        Vía: {structuredData.paymentMethod}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* BOTÓN DE GUARDADO MANUAL */}
            <div className="flex gap-3 w-full mt-4 z-10">
              <button
                onClick={() => {
                  const text = (transcript || accumulatedTextRef.current).trim();
                  if (text) processWithAI(text);
                }}
                disabled={!hasContent || isRecording || isAnalyzingAI}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold uppercase rounded-xl text-xs tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isAnalyzingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>{structuredData ? 'Re-Analizar IA' : 'Analizar IA'}</span>
              </button>
              
              <button
                onClick={handleSaveDraft}
                disabled={!hasContent || isSaving || isRecording}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase rounded-xl text-xs tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Nota
              </button>
            </div>
          </div>

          {/* Historial de Borradores Dictados Hoy */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3 ml-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Borradores de Hoy ({today})
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
                </div>
              ) : drafts.length === 0 ? (
                <div className="text-center p-8 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30">
                  <p className="text-sm text-zinc-500">No hay notas dictadas guardadas hoy.</p>
                </div>
              ) : (
                drafts.map(draft => (
                  <div key={draft.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3 shadow-sm hover:border-zinc-700 transition-colors justify-between items-start">
                    <div className="space-y-1.5 flex-1 pr-2">
                      {draft.structured?.title && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-amber-400">{draft.structured.title}</span>
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {draft.structured.category}
                          </span>
                        </div>
                      )}
                      <p className="text-sm text-zinc-200 leading-relaxed font-sans">{draft.text}</p>
                      
                      {draft.structured?.amountUsd && (
                        <p className="text-xs font-mono font-bold text-emerald-400">
                          Monto extraído: ${draft.structured.amountUsd.toFixed(2)} USD
                        </p>
                      )}

                      <p className="text-[10px] text-zinc-500 font-mono">
                        {new Date(draft.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </p>
                    </div>

                    <button 
                      onClick={() => handleDeleteDraft(draft.id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                      title="Eliminar borrador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
