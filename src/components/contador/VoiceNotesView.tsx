import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Mic, Square, ArrowLeft, Save, Loader2, Play, CheckCircle2 } from 'lucide-react';

interface VoiceNotesViewProps {
  onBack: () => void;
}

interface Draft {
  id: string;
  text: string;
  type: 'voice_note';
  date: string;
  createdAt: string;
}

export default function VoiceNotesView({ onBack }: VoiceNotesViewProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Cargar borradores de hoy
  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        const q = query(
          collection(db, 'daily_drafts'), 
          where('date', '==', today),
          where('type', '==', 'voice_note')
        );
        const querySnapshot = await getDocs(q);
        const fetchedDrafts = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Draft[];
        
        // Ordenar localmente (Firestore requiere index para orderBy compuesto)
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

  // Inicializar Web Speech API
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'es-MX'; // Idioma configurado para México

        recognitionRef.current.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(prev => {
            // Un poco de lógica para no sobreescribir el texto si ya había algo tipeado
            const words = currentTranscript.trim();
            if (event.results[event.results.length - 1].isFinal) {
               return prev ? prev + ' ' + words : words;
            }
            return prev;
          });
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsRecording(false);
        };
      } else {
        console.warn("Speech Recognition API no está soportada en este navegador.");
      }
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      setTranscript('');
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  const handleSaveDraft = async () => {
    if (!transcript.trim()) return;
    
    setIsSaving(true);
    try {
      const newDraft = {
        text: transcript.trim(),
        type: 'voice_note',
        date: today,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'daily_drafts'), newDraft);
      
      setDrafts(prev => [{ id: docRef.id, ...newDraft as Draft }, ...prev]);
      setTranscript('');
    } catch (error) {
      console.error("Error guardando borrador:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <button 
          onClick={onBack}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-serif font-bold text-zinc-100 flex items-center gap-2">
            <Mic className="w-4 h-4 text-indigo-400" /> Notas de Voz
          </h2>
          <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">Dictado Inteligente</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full space-y-6 flex-1 flex flex-col">
          
          {/* Zona de Dictado */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 lg:p-8 flex flex-col items-center text-center relative overflow-hidden shrink-0 shadow-lg">
            {isRecording && (
              <div className="absolute inset-0 bg-indigo-500/5 animate-pulse pointer-events-none"></div>
            )}
            
            <button
              onClick={toggleRecording}
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${
                isRecording 
                  ? 'bg-rose-500 text-white shadow-rose-500/40 scale-110' 
                  : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:scale-105'
              } cursor-pointer z-10`}
            >
              {isRecording ? <Square className="w-8 h-8 fill-current" /> : <Mic className="w-8 h-8" />}
            </button>
            
            <p className="mt-4 text-xs font-mono uppercase tracking-widest text-zinc-400">
              {isRecording ? 'Escuchando... Toca para detener' : 'Toca para dictar una nota'}
            </p>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="El texto dictado aparecerá aquí. También puedes escribir manualmente..."
              className="mt-6 w-full h-32 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none z-10"
            />

            <button
              onClick={handleSaveDraft}
              disabled={!transcript.trim() || isSaving}
              className="mt-4 w-full py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold uppercase rounded-xl text-xs tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md z-10"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar en Borradores de Hoy
            </button>
          </div>

          {/* Lista de Borradores */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3 ml-1">Borradores ({today})</h3>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
                </div>
              ) : drafts.length === 0 ? (
                <div className="text-center p-8 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30">
                  <p className="text-sm text-zinc-500">No hay notas dictadas hoy.</p>
                </div>
              ) : (
                drafts.map(draft => (
                  <div key={draft.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3 shadow-sm hover:border-zinc-700 transition-colors">
                    <div className="shrink-0 mt-0.5">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <Play className="w-3 h-3 text-indigo-400 ml-0.5" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-200 leading-relaxed">{draft.text}</p>
                      <p className="text-[10px] text-zinc-500 font-mono mt-2">
                        {new Date(draft.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </p>
                    </div>
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
