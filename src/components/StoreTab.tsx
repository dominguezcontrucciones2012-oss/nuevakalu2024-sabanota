import React, { useState, useEffect } from 'react';
import { Search, Heart, MapPin, ChevronRight, ArrowLeft, X, ShoppingCart, Percent, Tag, ShieldCheck } from 'lucide-react';

interface StoreTabProps {
  onNavigateTab?: (tab: 'inicio' | 'tienda' | 'qr' | 'pagos' | 'perfil') => void;
}

// Mock Data
const MOCK_BANNERS = [
  { id: 'b1', title: 'Queso Llanero Especial - Calidad Garantizada', image: 'bg-emerald-900', desc: 'Disfruta del mejor sabor criollo directo del productor. Calidad Kalu.' },
  { id: 'b2', title: 'Combos de Víveres y Alimentos a Crédito', image: 'bg-blue-900', desc: 'Llena tu despensa hoy y paga en cómodas cuotas con tu nivel Kalu.' },
  { id: 'b3', title: 'Gran Sorteo / Rifa Activa en Mundo Kalu', image: 'bg-purple-900', desc: 'Participa por premios increíbles en cada compra superior a $10.' },
];

const MOCK_DISCOUNTS = [
  { id: 'd1', name: 'Combo Harina y Arroz', originalPrice: 15.00, price: 12.50, discount: '-15%', img: 'bg-slate-800' },
  { id: 'd2', name: 'Queso de Año Añejado', originalPrice: 8.00, price: 6.40, discount: '-20%', img: 'bg-slate-800' },
  { id: 'd3', name: 'Mantequilla Criolla', originalPrice: 5.50, price: 4.95, discount: '-10%', img: 'bg-slate-800' },
];

const MOCK_NEW_ARRIVALS = [
  { id: 'n1', name: 'Combo Limpieza Plus', price: 22.00, initialFee: 11.00, img: 'bg-slate-800' },
  { id: 'n2', name: 'Café Molido Premium', price: 9.50, initialFee: 4.75, img: 'bg-slate-800' },
  { id: 'n3', name: 'Kit Charcutería', price: 18.00, initialFee: 9.00, img: 'bg-slate-800' },
];

export default function StoreTab({ onNavigateTab }: StoreTabProps) {
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [selectedBanner, setSelectedBanner] = useState<typeof MOCK_BANNERS[0] | null>(null);

  // Autoplay for banners
  useEffect(() => {
    if (selectedBanner) return; // Pause if modal is open

    const interval = setInterval(() => {
      setActiveBannerIndex((prev) => (prev + 1) % MOCK_BANNERS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedBanner]);

  return (
    <div className="flex-1 bg-slate-950 flex flex-col relative animate-in fade-in pb-24 overflow-y-auto">
      
      {/* 1. Cabecera Fija y Buscador */}
      <div className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md pt-5 pb-4 px-5 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-full h-12 flex items-center px-4 focus-within:border-emerald-500/50 transition-colors shadow-inner">
            <Search className="w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              placeholder="¿Qué quieres comprar hoy?" 
              className="bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-500 w-full ml-3"
            />
          </div>
          <button className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-400 transition-colors shrink-0">
            <Heart className="w-5 h-5" />
          </button>
        </div>

        {/* Fila de entrega rápida */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-500" />
            <p className="text-xs text-slate-300">Recibe con Envíos Mundo Kalu</p>
          </div>
          <button className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest hover:text-emerald-300">
            Agregar dirección
          </button>
        </div>
      </div>

      <div className="p-5 space-y-8">
        
        {/* 2. Carrusel Principal de Novedades y Banners */}
        <div className="relative">
          <div className="overflow-hidden rounded-2xl relative shadow-lg">
            <div 
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${activeBannerIndex * 100}%)` }}
            >
              {MOCK_BANNERS.map((banner) => (
                <div 
                  key={banner.id}
                  className={`w-full flex-shrink-0 aspect-[16/9] ${banner.image} p-6 flex flex-col justify-end cursor-pointer relative overflow-hidden`}
                  onClick={() => setSelectedBanner(banner)}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent"></div>
                  <div className="relative z-10">
                    <span className="inline-block px-2 py-1 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-widest rounded mb-2">Destacado</span>
                    <h3 className="font-extrabold text-xl text-white leading-tight mb-1">{banner.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Indicadores (Dots) */}
          <div className="flex justify-center gap-2 mt-4">
            {MOCK_BANNERS.map((_, i) => (
              <button 
                key={i} 
                onClick={() => setActiveBannerIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${activeBannerIndex === i ? 'w-6 bg-emerald-500' : 'w-2 bg-slate-800'}`}
              />
            ))}
          </div>
        </div>

        {/* 3. Sección "Descuentos Mundo Kalu" */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Percent className="w-4 h-4 text-emerald-500" />
              </div>
              <h3 className="font-extrabold text-lg text-white">Descuentos</h3>
            </div>
            <button className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
              Explorar <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
            {MOCK_DISCOUNTS.map(item => (
              <div key={item.id} className="min-w-[160px] max-w-[160px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden snap-start shrink-0 flex flex-col relative shadow-sm">
                <div className="absolute top-2 left-2 z-10 bg-emerald-500 text-slate-950 font-black text-[10px] px-2 py-1 rounded-md">
                  {item.discount}
                </div>
                <div className={`h-32 w-full ${item.img} flex items-center justify-center`}>
                  <ShoppingCart className="w-8 h-8 text-slate-700" />
                </div>
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <h4 className="font-bold text-sm text-slate-200 line-clamp-2 leading-tight mb-2">{item.name}</h4>
                  <div>
                    <p className="text-xs text-slate-500 line-through">${Number(item.originalPrice || 0).toFixed(2)}</p>
                    <p className="font-black text-lg text-white">${Number(item.price || 0).toFixed(2)}</p>
                    <div className="mt-2 inline-block px-2 py-0.5 bg-slate-800 text-emerald-400 text-[9px] font-bold uppercase rounded border border-emerald-500/20">
                      A cuotas
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Sección "Lo nuevo en tienda" */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Tag className="w-4 h-4 text-blue-400" />
              </div>
              <h3 className="font-extrabold text-lg text-white">Lo nuevo</h3>
            </div>
            <button className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 hover:text-emerald-400 transition-colors">
              Explorar <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
            {MOCK_NEW_ARRIVALS.map(item => (
              <div key={item.id} className="min-w-[140px] max-w-[140px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden snap-start shrink-0 flex flex-col shadow-sm">
                <div className={`h-28 w-full ${item.img} flex items-center justify-center`}>
                  <ShoppingCart className="w-8 h-8 text-slate-700" />
                </div>
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <h4 className="font-bold text-sm text-slate-300 line-clamp-2 leading-tight mb-2">{item.name}</h4>
                  <div>
                    <p className="font-black text-base text-white">${Number(item.price || 0).toFixed(2)}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Inicial: <strong className="text-slate-300">${Number(item.initialFee || 0).toFixed(2)}</strong></p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Inmersivo de Banner */}
      {selectedBanner && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-bottom-2 duration-300">
          <div className={`relative h-72 ${selectedBanner.image} w-full`}>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent"></div>
            
            {/* Header / Controles */}
            <div className="absolute top-0 inset-x-0 p-5 flex justify-between items-center z-10">
              <button 
                onClick={() => setSelectedBanner(null)}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setSelectedBanner(null)}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Título en la imagen */}
            <div className="absolute bottom-6 inset-x-6 z-10">
              <span className="inline-block px-2 py-1 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-widest rounded mb-3">Promoción Destacada</span>
              <h2 className="font-black text-3xl text-white leading-tight drop-shadow-md">{selectedBanner.title}</h2>
            </div>
          </div>

          <div className="p-6 flex-1 flex flex-col">
            <p className="text-slate-300 text-sm leading-relaxed mb-8">{selectedBanner.desc}</p>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Beneficio Kalu</h4>
                  <p className="text-xs text-slate-400">Válido por tiempo limitado</p>
                </div>
              </div>
              <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 rounded-xl uppercase tracking-widest text-xs transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                Aprovechar Promoción
              </button>
            </div>
            
            <div className="mt-auto">
              {/* Controles para navegar entre promos en el modal */}
              <div className="flex justify-between items-center border-t border-slate-900 pt-6">
                <button 
                  className="text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest"
                  onClick={() => {
                    const idx = MOCK_BANNERS.findIndex(b => b.id === selectedBanner.id);
                    const prev = idx === 0 ? MOCK_BANNERS.length - 1 : idx - 1;
                    setSelectedBanner(MOCK_BANNERS[prev]);
                  }}
                >
                  &lt; Anterior
                </button>
                <div className="flex gap-2">
                  {MOCK_BANNERS.map((banner) => (
                    <div 
                      key={banner.id}
                      className={`h-1.5 rounded-full transition-all duration-300 ${banner.id === selectedBanner.id ? 'w-6 bg-emerald-500' : 'w-2 bg-slate-800'}`}
                    />
                  ))}
                </div>
                <button 
                  className="text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest"
                  onClick={() => {
                    const idx = MOCK_BANNERS.findIndex(b => b.id === selectedBanner.id);
                    const next = (idx + 1) % MOCK_BANNERS.length;
                    setSelectedBanner(MOCK_BANNERS[next]);
                  }}
                >
                  Siguiente &gt;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
