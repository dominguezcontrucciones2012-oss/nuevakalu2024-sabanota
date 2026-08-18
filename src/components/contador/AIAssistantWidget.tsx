import React, { useState } from 'react';
import { Bot, Send, Loader2, Sparkles, X } from 'lucide-react';
import { askGemini } from '../../services/gemini';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '¡Hola Daisy! Soy tu asistente financiero. Puedo ayudarte a calcular márgenes, validar costos o sugerir precios de venta. ¿En qué te ayudo hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userText = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setInput('');
    setIsLoading(true);

    const context = `
      Eres un asistente experto en finanzas para la Quesería Kalu. 
      Ayudas a calcular márgenes de ganancia (generalmente 30%), 
      validar si los precios de costo de proveedores son correctos,
      y dar sugerencias rápidas y concisas. Mantén tus respuestas breves y amigables.
    `;

    const aiResponse = await askGemini(userText, context);
    
    setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    setIsLoading(false);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-brand-accent hover:bg-amber-400 text-zinc-950 rounded-full flex items-center justify-center shadow-lg shadow-brand-accent/20 transition-transform hover:scale-105 z-50 cursor-pointer"
      >
        <Sparkles className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[340px] h-[450px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden font-sans">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-brand-accent" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-zinc-100">Asistente Kalu</h4>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] text-zinc-400 font-mono uppercase">En línea (Gemini 2.5)</span>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-zinc-500 hover:text-zinc-300 p-1 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950/50">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-brand-accent text-zinc-950 rounded-br-sm font-medium' 
                  : 'bg-zinc-800 text-zinc-200 border border-zinc-700/50 rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 border border-zinc-700/50 rounded-2xl rounded-bl-sm px-4 py-2 flex items-center gap-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-bounce"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0">
        <div className="relative flex items-center">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta sobre costos, márgenes..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-full pl-4 pr-10 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-brand-accent transition-colors"
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="absolute right-1.5 w-7 h-7 bg-brand-accent hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-brand-accent text-zinc-950 rounded-full flex items-center justify-center cursor-pointer transition-colors"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
