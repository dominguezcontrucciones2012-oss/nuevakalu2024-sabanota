import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Heart, MapPin, ChevronRight, ArrowLeft, X, ShoppingCart, Percent, Tag, ShieldCheck, Package, Star } from 'lucide-react';
import { CheeseProduct } from '../types';

interface StoreTabProps {
  products: CheeseProduct[];
  onNavigateTab?: (tab: 'inicio' | 'tienda' | 'qr' | 'pagos' | 'perfil') => void;
}

import { onCollectionSnapshot } from '../services/localApi';

const STORE_BANNERS = [
  { id: 'b1', title: 'Queso Llanero Especial - Calidad Garantizada', image: 'bg-emerald-900', desc: 'Disfruta del mejor sabor criollo directo del productor. Calidad Kalu.' },
  { id: 'b2', title: 'Víveres y Alimentos a Crédito Kalu', image: 'bg-slate-900', desc: 'Llena tu despensa hoy y paga en cómodas cuotas con tu nivel Kalu.' },
  { id: 'b3', title: 'Gran Sorteo Activo en Mundo Kalu', image: 'bg-slate-800', desc: 'Participa por premios increíbles en cada compra superior a $10.' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Fresco:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Semicurado: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Curado:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Azul:       'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Especial:   'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'Repuestos y Ferretería': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  'Víveres y Agro':         'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

function catStyle(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-slate-700/40 text-slate-300 border-slate-600/40';
}

/** Tarjeta reutilizable — nunca se desmonta, no causa removeChild */
const PCard: React.FC<{ item: CheeseProduct }> = ({ item }) => {
  const price = Number(item.sellingPrice || (item as any).price || 0);
  const stock = Number(item.stockKg || (item as any).stock || 0);
  const ok = stock > 0;
  return (
    <div className={`bg-slate-900 border rounded-2xl overflow-hidden flex flex-col relative shadow-sm cursor-pointer ${ok ? 'border-slate-800 hover:border-emerald-500/30' : 'border-slate-800/50 opacity-60'}`}>
      {!ok && (
        <div className="absolute top-2 right-2 z-10 bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-black px-2 py-0.5 rounded uppercase">
          Agotado
        </div>
      )}
      <div className="h-24 w-full bg-slate-800 flex items-center justify-center relative overflow-hidden">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-300" />
        ) : (
          <ShoppingCart className="w-7 h-7 text-slate-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent pointer-events-none" />
        <span className={`absolute bottom-1.5 left-1.5 z-10 text-[8px] font-bold px-1.5 py-0.5 rounded border shadow-sm backdrop-blur-sm ${catStyle(item.category)}`}>
          {item.category}
        </span>
      </div>
      <div className="p-2.5 flex-1 flex flex-col justify-between gap-1">
        <h4 className="font-bold text-xs text-slate-200 line-clamp-2 leading-tight">{item.name}</h4>
        <div>
          <p className="font-black text-sm text-white">${price.toFixed(2)}</p>
          <p className="text-[9px] text-slate-500">Stock: {stock.toFixed(1)} {item.unit ?? 'kg'}</p>
          <div className="mt-1.5 inline-block px-1.5 py-0.5 bg-slate-800 text-emerald-400 text-[8px] font-bold uppercase rounded border border-emerald-500/20">
            A cuotas
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StoreTab({ products = [] }: StoreTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  const [bannerIdx, setBannerIdx] = useState(0);
  const [selBanner, setSelBanner] = useState<any | null>(null);
  const [liveBanners, setLiveBanners] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onCollectionSnapshot('banners', snap => {
      const arr = snap.filter((d: any) => d.active === true);
      setLiveBanners(arr);
    });
    return () => unsub();
  }, []);

  const activeBanners = liveBanners.length > 0 ? liveBanners : STORE_BANNERS;

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % activeBanners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeBanners.length]);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.targetTouches[0].clientX);
  const handleTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > 50) {
      setBannerIdx((prev) => (prev + 1) % activeBanners.length);
    } else if (distance < -50) {
      setBannerIdx((prev) => (prev === 0 ? activeBanners.length - 1 : prev - 1));
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const [searchQ, setSearchQ] = useState('');
  const [selCat, setSelCat] = useState('Todos');

  // Categorias unicas dinamicamente de Firebase
  const categories = useMemo(() => {
    const cs = Array.from(new Set(products.map(p => p.category)));
    return ['Todos', ...cs.sort()];
  }, [products]);

  // Filtrado completo sin limite
  const filtered = useMemo(() => {
    const lq = searchQ.toLowerCase().trim();
    return products.filter(p => {
      const ms = !lq ||
        (p.name || '').toLowerCase().includes(lq) ||
        (p.category || '').toLowerCase().includes(lq) ||
        (p.origin || '').toLowerCase().includes(lq);
      const mc = selCat === 'Todos' || p.category === selCat;
      return ms && mc;
    });
  }, [products, searchQ, selCat]);

  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setVisibleCount(12);
  }, [searchQ, selCat]);

  const isF = searchQ.trim() !== '' || selCat !== 'Todos';
  const discounts = useMemo(() => products.slice(0, 6), [products]);
  const newest = useMemo(() => [...products].reverse().slice(0, 6), [products]);

  // Autoplay banners
  useEffect(() => {
    if (selBanner || liveBanners.length === 0) return;
    const t = setInterval(() => setBannerIdx(p => (p + 1) % liveBanners.length), 5000);
    return () => clearInterval(t);
  }, [selBanner, liveBanners.length]);

  const clear = () => { setSearchQ(''); setSelCat('Todos'); };

  return (
    <div ref={containerRef} className="flex-1 bg-slate-950 flex flex-col relative pb-24 overflow-y-auto">

      {/* Cabecera fija — SIEMPRE VISIBLE */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md pt-5 pb-3 px-5 border-b border-slate-900 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-full h-12 flex items-center px-4 focus-within:border-emerald-500/60 transition-colors shadow-inner">
            <Search className="w-5 h-5 text-slate-500 shrink-0" />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Buscar por nombre o categoria..."
              className="bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-500 w-full ml-3"
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')} className="ml-2 text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-400 shrink-0">
            <Heart className="w-5 h-5" />
          </button>
        </div>

        {/* Pills de categorias — siempre montados */}
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setSelCat(c)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-all duration-200 ${
                  c === selCat
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-emerald-500/40 hover:text-emerald-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-500" />
            <p className="text-xs text-slate-300">Recibe con Envios Mundo Kalu</p>
          </div>
        </div>
      </div>

      {/* Cuerpo unico — mismo nodo padre siempre montado, sin ternario que desmonte */}
      <div className="p-5 space-y-8">

        {/* Carrusel de banners */}
        <div className={`relative ${isF ? 'hidden' : 'block'}`}>
          <div 
            className="overflow-hidden rounded-2xl shadow-2xl"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${bannerIdx * 100}%)` }}
            >
              {activeBanners.map(b => {
                const isVid = b.type && b.type.includes('video');
                const isMock = !b.url;

                return (
                  <div
                    key={b.id}
                    className={`w-full flex-shrink-0 aspect-[16/9] ${isMock ? b.image : 'bg-slate-900'} p-0 flex flex-col justify-end cursor-pointer relative overflow-hidden group`}
                    onClick={() => setSelBanner(b)}
                  >
                    {/* Media Background */}
                    {!isMock && (
                      <div className="absolute inset-0 w-full h-full">
                        {isVid ? (
                          <video
                            src={b.url}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        ) : (
                          <img src={b.url} alt={b.title} className="w-full h-full object-cover" />
                        )}
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent pointer-events-none" />
                    <div className={`relative z-10 p-6 pointer-events-none ${isMock ? 'pb-8' : ''}`}>
                      <span className="inline-block px-2 py-1 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-widest rounded mb-2">
                        Destacado
                      </span>
                      <h3 className="font-extrabold text-xl text-white leading-tight">{b.title}</h3>
                      {b.desc && <p className="text-xs text-slate-300 mt-1 line-clamp-1">{b.desc}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-center gap-2 mt-4">
            {activeBanners.map((_, i) => (
              <button
                key={i}
                onClick={() => setBannerIdx(i)}
                className={`h-1.5 rounded-full transition-all ${bannerIdx === i ? 'w-6 bg-emerald-500' : 'w-2 bg-slate-800'}`}
              />
            ))}
          </div>
        </div>

        {/* Seccion de resultados — siempre montada, visible/oculta via CSS */}
        <div className={isF ? 'block' : 'hidden'}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-mono text-slate-400">
              <span className="text-white font-bold">{filtered.length}</span>{' '}
              resultado{filtered.length !== 1 ? 's' : ''}
              {searchQ && <span> - &quot;{searchQ}&quot;</span>}
              {selCat !== 'Todos' && <span> - {selCat}</span>}
            </p>
            <button onClick={clear} className="text-[10px] text-rose-400 font-bold uppercase">
              Limpiar
            </button>
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Package className="w-12 h-12 text-slate-700 mb-4" />
              <p className="text-slate-400 font-bold">Sin resultados</p>
              <p className="text-xs text-slate-600">Intenta con otro termino o categoria</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {filtered.slice(0, visibleCount).map((item: CheeseProduct) => (
                  <PCard key={item.id} item={item} />
                ))}
              </div>
              {visibleCount < filtered.length && (
                <button
                  onClick={() => setVisibleCount(v => v + 12)}
                  className="w-full mt-6 py-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
                >
                  Cargar más productos
                </button>
              )}
            </>
          )}
        </div>

        {/* Secciones de exploracion — siempre montadas, visibles/ocultas via CSS */}
        <div className={`space-y-8 ${isF ? 'hidden' : 'block'}`}>

          {/* Descuentos */}
          {discounts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Percent className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h3 className="font-extrabold text-lg text-white">Descuentos</h3>
                </div>
                <button className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  Ver todos <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {discounts.map(item => {
                  const sp = Number(item.sellingPrice || (item as any).price || 0);
                  return (
                    <div key={`d-${item.id}`} className="min-w-[155px] max-w-[155px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden snap-start shrink-0 flex flex-col relative shadow-sm hover:border-emerald-500/30">
                      <div className="absolute top-2 left-2 z-10 bg-emerald-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-md">
                        -15%
                      </div>
                      <div className="h-28 w-full bg-slate-800 flex items-center justify-center relative overflow-hidden">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-300" />
                        ) : (
                          <ShoppingCart className="w-7 h-7 text-slate-700" />
                        )}
                      </div>
                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <h4 className="font-bold text-xs text-slate-200 line-clamp-2 leading-tight mb-1.5">{item.name}</h4>
                        <div>
                          <p className="text-[10px] text-slate-500 line-through">${(sp * 1.15).toFixed(2)}</p>
                          <p className="font-black text-base text-white">${sp.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-600 mt-0.5">
                            Stock: {Number(item.stockKg || 0).toFixed(1)} {item.unit ?? 'kg'}
                          </p>
                          <div className="mt-1.5 inline-block px-1.5 py-0.5 bg-slate-800 text-emerald-400 text-[8px] font-bold uppercase rounded border border-emerald-500/20">
                            A cuotas
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lo Nuevo */}
          {newest.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Tag className="w-4 h-4 text-blue-400" />
                  </div>
                  <h3 className="font-extrabold text-lg text-white">Lo nuevo</h3>
                </div>
                <button className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 hover:text-emerald-400">
                  Explorar <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {newest.map(item => {
                  const sp = Number(item.sellingPrice || (item as any).price || 0);
                  return (
                    <div key={`n-${item.id}`} className="min-w-[135px] max-w-[135px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden snap-start shrink-0 flex flex-col shadow-sm hover:border-blue-500/30">
                      <div className="h-24 w-full bg-slate-800 flex items-center justify-center relative overflow-hidden">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-300" />
                        ) : (
                          <Star className="w-7 h-7 text-slate-700" />
                        )}
                      </div>
                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                        <h4 className="font-bold text-xs text-slate-300 line-clamp-2 leading-tight mb-1.5">{item.name}</h4>
                        <div>
                          <p className="font-black text-sm text-white">${sp.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">
                            Inicial: <strong className="text-slate-300">${(sp * 0.2).toFixed(2)}</strong>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Catalogo completo — grid sin limite */}
          {products.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-700/40 flex items-center justify-center">
                    <Package className="w-4 h-4 text-slate-300" />
                  </div>
                  <h3 className="font-extrabold text-lg text-white">Todo el catalogo</h3>
                </div>
                <span className="text-[10px] font-mono text-slate-500">{products.length} productos</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {products.slice(0, visibleCount).map((item: CheeseProduct) => (
                  <PCard key={`c-${item.id}`} item={item} />
                ))}
              </div>
              {visibleCount < products.length && (
                <button
                  onClick={() => setVisibleCount(v => v + 12)}
                  className="w-full mt-6 py-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
                >
                  Cargar más productos
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Banner */}
      {selBanner && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col overflow-y-auto">
          <div className={`relative h-72 ${selBanner.image} w-full`}>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
            <div className="absolute top-0 inset-x-0 p-5 flex justify-between z-10">
              <button
                onClick={() => setSelBanner(null)}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSelBanner(null)}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="absolute bottom-6 inset-x-6 z-10">
              <span className="inline-block px-2 py-1 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase rounded mb-3">
                Promocion Destacada
              </span>
              <h2 className="font-black text-3xl text-white leading-tight">{selBanner.title}</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-slate-300 text-sm mb-8">{selBanner.desc}</p>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Beneficio Kalu</h4>
                  <p className="text-xs text-slate-400">Valido por tiempo limitado</p>
                </div>
              </div>
              <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 rounded-xl uppercase text-xs">
                Aprovechar Promocion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
