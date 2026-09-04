import React, { useState } from 'react';
import { User, ShoppingBag, HelpCircle, Gift, ShieldCheck, Info, LogOut, ChevronRight, ArrowLeft, MapPin, Calendar, Wind, Sparkles, Lock, Key, MessageCircle, MessageSquare, Mail, Trash2, Award, Zap } from 'lucide-react';
import { ClientProfile } from '../types';
import { getVIPLevelInfo, VIP_LEVELS_MATRIX } from '../config/vipMatrix';

interface ProfileTabProps {
  clientData: ClientProfile | null;
  clubLevel: number;
  kaluPoints: number;
  onLogout: () => void;
  onNavigateSubView?: (view: string) => void;
  onNavigateTab?: (tab: 'inicio' | 'tienda' | 'qr' | 'pagos' | 'perfil') => void;
}

type SubViewType = 'main' | 'mis_datos' | 'info_personal' | 'mis_direcciones' | 'mis_compras' | 'mis_recompensas' | 'seguridad' | 'seguridad_codigo' | 'sobre_kalu' | 'mundo_kalu';
type FilterTabType = 'por_pagar' | 'pagadas' | 'canceladas';
type RewardTabType = 'disponibles' | 'utilizadas' | 'vencidas';

// Mock data for purchases
const MOCK_COMPRAS = {
  por_pagar: [],
  pagadas: [
    { id: 'c-1', concept: 'Supermercado Kalu', date: '15 Ago 2026', amountUSD: 155.82, type: 'Compra Online' },
    { id: 'c-2', concept: 'Tiendas Daka', date: '02 Ago 2026', amountUSD: 45.00, type: 'Compra con QR' }
  ],
  canceladas: [
    { id: 'c-3', concept: 'Repuestos Moto', date: '28 Jul 2026', amountUSD: 12.50, type: 'Compra Online' }
  ]
};

export default function ProfileTab({
  clientData,
  clubLevel,
  kaluPoints,
  onLogout,
  onNavigateSubView,
  onNavigateTab
}: ProfileTabProps) {
  const [activeSubView, setActiveSubView] = useState<SubViewType>('main');
  const [filterTab, setFilterTab] = useState<FilterTabType>('por_pagar');
  const [rewardTab, setRewardTab] = useState<RewardTabType>('disponibles');

  // Seguridad States
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);

  // Recovery Dispatch States (Connected to dual backend robot)
  const [sendingRecoveryEmail, setSendingRecoveryEmail] = useState(false);
  const [sendingRecoveryWhatsapp, setSendingRecoveryWhatsapp] = useState(false);
  const [recoverySentVia, setRecoverySentVia] = useState<'email' | 'whatsapp'>('email');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [recoveryErrorMsg, setRecoveryErrorMsg] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const renderMainView = () => (
    <>
      {/* 1. Cabecera y Accesos Rápidos */}
      <div className="p-5 pb-6 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-900">
        <div className="mb-6">
          <p className="text-sm text-slate-400">Hola,</p>
          <h2 className="font-extrabold text-2xl text-slate-100 break-words leading-tight">
            {clientData?.name || 'Cliente'}
          </h2>
        </div>

        <div className="flex justify-between px-2 gap-4">
          <button
            onClick={() => setActiveSubView('mis_datos')}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 group-hover:text-emerald-400 group-hover:border-emerald-500/50 transition-colors shadow-sm">
              <User className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Tus datos</span>
          </button>

          <button
            onClick={() => setActiveSubView('mis_compras')}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 group-hover:text-emerald-400 group-hover:border-emerald-500/50 transition-colors shadow-sm">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Tus compras</span>
          </button>

          <button
            onClick={() => onNavigateSubView && onNavigateSubView('ayuda')}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 group-hover:text-emerald-400 group-hover:border-emerald-500/50 transition-colors shadow-sm">
              <HelpCircle className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Centro ayuda</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">

        {/* 2. Tarjeta de Nivel Mundo Kalu */}
        {(() => {
          const vip = getVIPLevelInfo(kaluPoints);
          return (
            <div 
              onClick={() => setActiveSubView('mundo_kalu')}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex justify-between items-center shadow-lg relative overflow-hidden cursor-pointer hover:border-emerald-500/40 transition-colors"
            >
              <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-emerald-500/10 blur-2xl rounded-full"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-black text-lg text-white">{vip.name}</h3>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {vip.code}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-bold">
                  {Number(kaluPoints || 0)} pts ⭐ • Inicial {Math.round(vip.initialPct * 100)}%
                </p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSubView('mundo_kalu');
                }}
                className="relative z-10 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-emerald-500/30 transition-colors"
              >
                Mundo Kalu
              </button>
            </div>
          );
        })()}

        {/* 3. Sección "Información" */}
        <div>
          <h3 className="text-sm font-bold text-white mb-3">Información</h3>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => setActiveSubView('mis_recompensas')}
              className="w-full flex items-center justify-between p-4 border-b border-slate-800/80 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Gift className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-bold text-slate-200">Tus recompensas</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={() => setActiveSubView('seguridad')}
              className="w-full flex items-center justify-between p-4 border-b border-slate-800/80 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-bold text-slate-200">Seguridad de tu cuenta</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={() => setActiveSubView('sobre_kalu')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Info className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-bold text-slate-200">Sobre Mundo Kalu</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* 4. Banner de Puntos e Invitar */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800 rounded-2xl p-4 flex justify-between items-center cursor-pointer hover:border-emerald-500/50 transition-all shadow-md">
          <div>
            <h4 className="font-bold text-sm text-white mb-1">Invita y suma puntos</h4>
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
              Gana hasta 200 ⭐ <ChevronRight className="w-3 h-3" />
            </p>
          </div>
          <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30">
            <Gift className="w-5 h-5 text-emerald-500" />
          </div>
        </div>

      </div>

      {/* 5. Cierre de Sesión & Versión */}
      <div className="mt-auto p-5 space-y-4">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-between bg-slate-900/30 hover:bg-slate-900 border border-slate-800/50 hover:border-slate-800 p-4 rounded-2xl transition-all group"
        >
          <span className="text-slate-300 font-semibold text-sm group-hover:text-white transition-colors">Cerrar sesión</span>
          <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-400 transition-colors" />
        </button>

        <p className="text-center text-[10px] text-slate-600 font-mono tracking-widest uppercase">
          Versión 3.2.0
        </p>
      </div>
    </>
  );

  const renderMisDatos = () => (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => setActiveSubView('main')} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-white">Mis datos</h2>
      </div>

      <div className="p-5">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
          <button onClick={() => setActiveSubView('info_personal')} className="w-full flex items-center justify-between p-4 border-b border-slate-800/80 hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-bold text-slate-200">Información personal</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={() => setActiveSubView('mis_direcciones')} className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-bold text-slate-200">Mis direcciones</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderInfoPersonal = () => (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => setActiveSubView('mis_datos')} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-white">Información personal</h2>
      </div>

      <div className="p-5 space-y-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex justify-between items-center">
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Email</p>
            <p className="text-sm text-slate-200">{clientData?.email || 'Sin registrar'}</p>
          </div>
          <button className="text-xs font-bold text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg bg-emerald-500/10">
            Actualizar
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex justify-between items-center">
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Número de celular</p>
            <p className="text-sm text-slate-200">{clientData?.phone || 'Sin registrar'}</p>
          </div>
          <button className="text-xs font-bold text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg bg-emerald-500/10">
            Actualizar
          </button>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Nombre y apellido</p>
          <p className="text-sm text-slate-400">{clientData?.name || 'No especificado'}</p>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Cédula</p>
          <p className="text-sm text-slate-400">{clientData?.cedula || clientData?.rfc || 'No especificada'}</p>
        </div>
      </div>
    </div>
  );

  const renderMisDirecciones = () => (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => setActiveSubView('mis_datos')} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-white">Mis direcciones</h2>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-24 h-24 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center mb-6 shadow-inner relative">
          <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-xl"></div>
          <MapPin className="w-10 h-10 text-emerald-500 relative z-10" />
        </div>
        <h3 className="text-lg font-black text-white mb-2 leading-tight">Ingresa tu dirección y recibe sin preocupaciones</h3>
        <p className="text-xs text-slate-400 max-w-[250px] mx-auto leading-relaxed">
          Agrega un domicilio para ver costos y tiempos de entrega, y recibir tus compras con la mayor comodidad.
        </p>
      </div>

      <div className="p-5 mt-auto bg-slate-950 border-t border-slate-900">
        <button className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase rounded-2xl text-sm tracking-widest transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]">
          Agregar domicilio
        </button>
      </div>
    </div>
  );

  const renderMisCompras = () => (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => setActiveSubView('main')} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-white">Mis compras</h2>
      </div>

      <div className="p-5 space-y-6">
        <div
          onClick={() => {
            setActiveSubView('main');
            if (onNavigateTab) onNavigateTab('pagos');
          }}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center cursor-pointer active:scale-[0.99] transition-transform shadow-md"
        >
          <div>
            <h4 className="font-bold text-sm text-white mb-1">Consulta y paga desde un mismo lugar</h4>
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
              Ir a Pagos <ChevronRight className="w-3 h-3" />
            </p>
          </div>
          <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center border border-slate-700/50">
            <Calendar className="w-5 h-5 text-emerald-500" />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setFilterTab('por_pagar')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${filterTab === 'por_pagar' ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
          >
            Por pagar
          </button>
          <button
            onClick={() => setFilterTab('pagadas')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${filterTab === 'pagadas' ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
          >
            Pagadas
          </button>
          <button
            onClick={() => setFilterTab('canceladas')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${filterTab === 'canceladas' ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
          >
            Canceladas
          </button>
        </div>

        <div className="space-y-3">
          {filterTab === 'por_pagar' && (
            MOCK_COMPRAS.por_pagar.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center animate-in fade-in">
                <Wind className="w-12 h-12 text-slate-700 mb-4" />
                <p className="text-sm font-bold text-slate-400">Respira, no tienes pagos pendientes.</p>
              </div>
            ) : (
              MOCK_COMPRAS.por_pagar.map((compra: any) => (
                <div key={compra.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center shadow-sm">
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">{compra.concept}</h4>
                    <p className="text-[10px] text-slate-400 mt-1">{compra.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-white text-lg">${Number(compra.amountUSD || 0).toFixed(2)}</p>
                    <button className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mt-1">Pagar &gt;</button>
                  </div>
                </div>
              ))
            )
          )}

          {filterTab === 'pagadas' && (
            MOCK_COMPRAS.pagadas.map((compra: any) => (
              <div key={compra.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex justify-between items-center animate-in fade-in shadow-sm">
                <div>
                  <h4 className="font-bold text-sm text-slate-100">{compra.concept}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">{compra.type}</span>
                    <span className="text-[10px] text-slate-500">{compra.date}</span>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="font-black text-white text-lg">${Number(compra.amountUSD || 0).toFixed(2)}</p>
                    <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Finalizada</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
              </div>
            ))
          )}

          {filterTab === 'canceladas' && (
            MOCK_COMPRAS.canceladas.map((compra: any) => (
              <div key={compra.id} className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 flex justify-between items-center animate-in fade-in opacity-80">
                <div>
                  <h4 className="font-bold text-sm text-slate-300">{compra.concept}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] px-2 py-0.5 rounded bg-slate-800/50 text-slate-400">{compra.type}</span>
                    <span className="text-[10px] text-slate-600">{compra.date}</span>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="font-black text-slate-400 text-lg line-through decoration-slate-600 decoration-2 opacity-80">${Number(compra.amountUSD || 0).toFixed(2)}</p>
                    <p className="text-[9px] font-bold text-rose-400/80 uppercase tracking-widest">Cancelada</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-700" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderMisRecompensas = () => (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveSubView('main')} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-black text-white">Mis recompensas</h2>
        </div>
        <button className="w-8 h-8 rounded-full bg-slate-900/50 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {/* Segmentador / Filtro Superior */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide mb-2">
          <button
            onClick={() => setRewardTab('disponibles')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${rewardTab === 'disponibles' ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
          >
            Disponibles
          </button>
          <button
            onClick={() => setRewardTab('utilizadas')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${rewardTab === 'utilizadas' ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
          >
            Utilizadas
          </button>
          <button
            onClick={() => setRewardTab('vencidas')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${rewardTab === 'vencidas' ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
          >
            Vencidas
          </button>
        </div>

        {/* Contenido según Filtro */}
        {rewardTab === 'disponibles' && (
          <div className="flex flex-col flex-1 animate-in fade-in">
            <p className="text-sm text-slate-400 mb-8 leading-relaxed">Estas recompensas están listas para que las aproveches al máximo.</p>

            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center mb-6 shadow-inner relative">
                <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-xl"></div>
                <Sparkles className="w-8 h-8 text-emerald-500 relative z-10" />
              </div>
              <h3 className="text-lg font-black text-white mb-2">Aún no tienes ninguna</h3>
              <p className="text-xs text-slate-400 max-w-[250px] mx-auto leading-relaxed">
                Sigue sumando puntos y canjéalos por beneficios increíbles en Mundo Kalu.
              </p>
            </div>

            <button className="w-full mt-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3.5 rounded-xl uppercase tracking-widest text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              Usar mis puntos
            </button>
          </div>
        )}

        {rewardTab === 'utilizadas' && (
          <div className="flex flex-col flex-1 animate-in fade-in">
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">Estas son las recompensas que ya aprovechaste hasta el momento.</p>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center shadow-sm">
              <div>
                <h4 className="font-bold text-sm text-slate-100">2 cuotas en Tiendas Kalu</h4>
                <p className="text-[10px] text-emerald-500 mt-1 uppercase tracking-widest font-bold">Utilizado el 01/07/2026</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700/50 border-dashed">
                  <Gift className="w-5 h-5 text-slate-500" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </div>
            </div>
          </div>
        )}

        {rewardTab === 'vencidas' && (
          <div className="flex flex-col flex-1 animate-in fade-in">
            <p className="text-sm text-slate-400 mb-8 leading-relaxed">Estas recompensas ya no están activas, pero hay más esperando por ti.</p>

            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center mb-6 shadow-inner relative opacity-50">
                <Wind className="w-8 h-8 text-slate-500 relative z-10" />
              </div>
              <h3 className="text-lg font-black text-white mb-2">Nada por aquí</h3>
              <p className="text-xs text-slate-400 max-w-[250px] mx-auto leading-relaxed">
                ¡Bien hecho! No dejaste que se te escapara ninguna recompensa.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderSeguridad = () => (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => setActiveSubView('main')} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-white">Seguridad</h2>
      </div>

      <div className="p-5">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowIdentityModal(true)}
            className="w-full flex items-center justify-between p-4 border-b border-slate-800/80 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-bold text-slate-200">Cambiar clave de seguridad</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>

          <div className="w-full flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <div className="text-left">
                <p className="text-sm font-bold text-slate-200">Usar datos biométricos</p>
                <p className="text-[10px] text-slate-400">Aumenta la seguridad de la app</p>
              </div>
            </div>
            {/* Custom Toggle Switch */}
            <div
              onClick={() => setUseBiometrics(!useBiometrics)}
              className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 ease-in-out flex items-center ${useBiometrics ? 'bg-emerald-500' : 'bg-slate-800'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${useBiometrics ? 'translate-x-6' : 'translate-x-0'}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSeguridadCodigo = () => (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => {
          if (isVerifyingCode) {
            setIsVerifyingCode(false);
          } else {
            setActiveSubView('seguridad');
          }
        }} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-white">Seguridad</h2>
      </div>

      <div className="p-5 flex-1">
        {!isVerifyingCode ? (
          <>
            <h3 className="text-2xl font-extrabold text-slate-100 mt-4 leading-tight">Te enviaremos un código de recuperación</h3>
            <p className="text-sm text-slate-400 mt-1 mb-6">Elige dónde quieres recibirlo.</p>

            {/* WhatsApp Option */}
            <div 
              onClick={async () => {
                if (sendingRecoveryWhatsapp || sendingRecoveryEmail) return;
                setSendingRecoveryWhatsapp(true);
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                setRecoveryCode(code);
                const targetPhone = clientData?.phone || (clientData as any)?.telefono || '04140000000';
                const hostname = window.location.hostname || 'localhost';

                try {
                  const res = await fetch(`http://${hostname}:3001/api/send-recovery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      channel: 'whatsapp',
                      phone: targetPhone,
                      code,
                      name: clientData?.name || 'Cliente'
                    })
                  });
                  if (res.ok) {
                    setRecoverySentVia('whatsapp');
                    setIsVerifyingCode(true);
                    setRecoveryCodeInput('');
                    setRecoveryErrorMsg('');
                  } else {
                    const errData = await res.json().catch(() => ({}));
                    alert(`Error en WhatsApp: ${errData.details || errData.error || 'No se pudo enviar'}`);
                  }
                } catch (e: any) {
                  console.error(e);
                  alert(`Error de conexión al enviar WhatsApp (${e.message})`);
                } finally {
                  setSendingRecoveryWhatsapp(false);
                }
              }}
              className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-slate-700 active:scale-[0.99] transition-all mb-3 ${sendingRecoveryWhatsapp ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                  {sendingRecoveryWhatsapp ? <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div> : <MessageCircle className="w-5 h-5 text-[#25D366]" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-200">{sendingRecoveryWhatsapp ? 'Enviando WhatsApp...' : 'WhatsApp'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Enviar a +58***{String(clientData?.phone || (clientData as any)?.telefono || '2054').slice(-4)}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>

            {/* Mail Option */}
            <div 
              onClick={async () => {
                if (sendingRecoveryEmail || sendingRecoveryWhatsapp) return;
                setSendingRecoveryEmail(true);
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                setRecoveryCode(code);
                const targetEmail = clientData?.email || (clientData as any)?.correo || 'cherokejd566@gmail.com';
                const hostname = window.location.hostname || 'localhost';

                try {
                  const res = await fetch(`http://${hostname}:3001/api/send-recovery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      channel: 'email',
                      email: targetEmail,
                      code,
                      name: clientData?.name || 'Cliente'
                    })
                  });
                  if (res.ok) {
                    setRecoverySentVia('email');
                    setIsVerifyingCode(true);
                    setRecoveryCodeInput('');
                    setRecoveryErrorMsg('');
                  } else {
                    const errData = await res.json().catch(() => ({}));
                    alert(`Error en Correo: ${errData.details || errData.error || 'No se pudo enviar'}`);
                  }
                } catch (e: any) {
                  console.error(e);
                  alert(`Error de conexión al enviar correo (${e.message})`);
                } finally {
                  setSendingRecoveryEmail(false);
                }
              }}
              className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-slate-700 active:scale-[0.99] transition-all mb-3 ${sendingRecoveryEmail ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                  {sendingRecoveryEmail ? <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-100 rounded-full animate-spin"></div> : <Mail className="w-5 h-5 text-slate-300" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-200">{sendingRecoveryEmail ? 'Enviando Correo...' : 'Correo'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Enviar a {clientData?.email || 'cherokejd566@gmail.com'}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
          </>
        ) : (
          <div className="space-y-4 animate-in fade-in">
            <h3 className="text-2xl font-extrabold text-slate-100 mt-4 leading-tight">Ingresa el código</h3>
            <p className="text-sm text-slate-400 mt-1 mb-6">
              {recoverySentVia === 'whatsapp' 
                ? 'Escribe el código de 6 dígitos que enviamos a tu WhatsApp.' 
                : 'Escribe el código de 6 dígitos que enviamos a tu correo.'}
            </p>

            {recoveryErrorMsg && (
              <div className="bg-rose-500/20 border border-rose-500/50 rounded-lg p-3">
                <p className="text-rose-500 text-xs font-bold text-center">{recoveryErrorMsg}</p>
              </div>
            )}

            <input 
              type="text" 
              placeholder="••••••" 
              value={recoveryCodeInput} 
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setRecoveryCodeInput(val);
              }} 
              maxLength={6} 
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-4 text-xl text-white text-center tracking-[0.75em] focus:outline-none focus:border-emerald-500 transition-colors" 
            />

            <button 
              onClick={() => {
                if (recoveryCodeInput === recoveryCode) {
                  alert('¡Código Verificado con éxito! Ahora puedes cambiar tu clave.');
                  setIsVerifyingCode(false);
                  setActiveSubView('main');
                } else {
                  setRecoveryErrorMsg('El código ingresado es incorrecto.');
                }
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-widest text-sm rounded-xl py-4 transition-colors"
            >
              Verificar Código
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderSobreKalu = () => (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => setActiveSubView('main')} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-white">Sobre Mundo Kalu</h2>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {/* Preferencias de datos */}
        <h3 className="text-sm font-bold text-white mb-3">Preferencias de datos</h3>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden mb-6">
          <button className="w-full flex items-center justify-between p-4 border-b border-slate-800/80 hover:bg-slate-800/50 transition-colors">
            <span className="text-sm font-bold text-slate-200">Privacidad</span>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors">
            <span className="text-sm font-bold text-slate-200">Cookies</span>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Información legal */}
        <h3 className="text-sm font-bold text-white mb-3">Información legal</h3>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden mb-8">
          <button className="w-full flex items-center justify-between p-4 border-b border-slate-800/80 hover:bg-slate-800/50 transition-colors text-left">
            <span className="text-sm font-bold text-slate-200">Términos y condiciones</span>
            <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0 ml-4" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors text-left">
            <span className="text-sm font-bold text-slate-200">Términos y condiciones de Envíos</span>
            <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0 ml-4" />
          </button>
        </div>

        {/* Eliminar cuenta */}
        <div className="mt-auto pt-6 flex justify-center">
          <button className="flex items-center gap-2 group">
            <Trash2 className="w-4 h-4 text-rose-500/70 group-hover:text-rose-500 transition-colors" />
            <span className="text-xs font-bold text-rose-500/70 group-hover:text-rose-500 underline underline-offset-4 transition-colors">
              Eliminar cuenta de Mundo Kalu
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderMundoKalu = () => {
    const currentVip = getVIPLevelInfo(kaluPoints);
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveSubView('main')} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-black text-white">Club Kalu Más</h2>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Matriz de Categorías VIP</p>
            </div>
          </div>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
            <span className="text-xs font-black text-emerald-400">{currentVip.code}</span>
          </div>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Tarjeta de Nivel Actual */}
          <div className="bg-gradient-to-br from-zinc-900 via-slate-900 to-emerald-950/50 border border-emerald-500/40 rounded-3xl p-5 relative overflow-hidden shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full">
                  Nivel {currentVip.level} Actual
                </span>
                <h3 className="text-2xl font-black text-white mt-2">{currentVip.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{currentVip.description}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                <span className="text-slate-950 font-black text-xl">{currentVip.code}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-800 text-center">
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-[8px] text-slate-400 uppercase font-bold block mb-0.5">Inicial</span>
                <span className="text-sm font-black text-emerald-400">{Math.round(currentVip.initialPct * 100)}%</span>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-[8px] text-slate-400 uppercase font-bold block mb-0.5">Línea Ppal</span>
                <span className="text-sm font-black text-white">${currentVip.mainCreditLimit}</span>
                <span className="text-[8px] text-slate-500 block">Máx {currentVip.mainMaxInstallments}c</span>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-[8px] text-slate-400 uppercase font-bold block mb-0.5">Cotidiana</span>
                <span className="text-sm font-black text-white">${currentVip.dailyCreditLimit}</span>
                <span className="text-[8px] text-slate-500 block">15 días</span>
              </div>
            </div>
          </div>

          {/* Lista Completa de Niveles */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Escalafón Oficial Club Kalu</h4>
            <div className="space-y-3">
              {VIP_LEVELS_MATRIX.map((tier) => {
                const isSelected = tier.level === currentVip.level;
                return (
                  <div 
                    key={tier.level}
                    className={`p-4 rounded-2xl border transition-all ${isSelected ? 'bg-slate-900 border-emerald-500/70 ring-1 ring-emerald-500/40' : 'bg-slate-900/40 border-slate-800/80'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">{tier.name}</span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">{tier.code}</span>
                        {isSelected && (
                          <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 uppercase">
                            Activo
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {tier.level < 6 ? `${tier.minPoints} - ${tier.maxPoints} pts` : '5000+ pts'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60 text-center text-xs">
                      <div className="bg-slate-950/60 p-2 rounded-lg">
                        <span className="text-[8px] text-slate-500 block uppercase font-bold">Inicial</span>
                        <span className="font-bold text-emerald-400">{Math.round(tier.initialPct * 100)}%</span>
                      </div>
                      <div className="bg-slate-950/60 p-2 rounded-lg">
                        <span className="text-[8px] text-slate-500 block uppercase font-bold">Línea Ppal</span>
                        <span className="font-bold text-slate-200">${tier.mainCreditLimit} ({tier.mainMaxInstallments}c)</span>
                      </div>
                      <div className="bg-slate-950/60 p-2 rounded-lg">
                        <span className="text-[8px] text-slate-500 block uppercase font-bold">Cotidiana</span>
                        <span className="font-bold text-slate-200">${tier.dailyCreditLimit} (15d)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                setActiveSubView('main');
                if (onNavigateTab) onNavigateTab('tienda');
              }}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-xs tracking-wider rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              Comprar en Tienda con mi Línea
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-slate-950 flex flex-col relative animate-fade-in text-slate-100 pb-20 overflow-y-auto">
      {/* Main flow routing */}
      {renderMainView()}

      {activeSubView === 'mis_datos' && renderMisDatos()}
      {activeSubView === 'info_personal' && renderInfoPersonal()}
      {activeSubView === 'mis_direcciones' && renderMisDirecciones()}
      {activeSubView === 'mis_compras' && renderMisCompras()}
      {activeSubView === 'mis_recompensas' && renderMisRecompensas()}
      {activeSubView === 'seguridad' && renderSeguridad()}
      {activeSubView === 'seguridad_codigo' && renderSeguridadCodigo()}
      {activeSubView === 'sobre_kalu' && renderSobreKalu()}
      {activeSubView === 'mundo_kalu' && renderMundoKalu()}

      {/* Modal de Identidad */}
      {showIdentityModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end animate-in fade-in duration-200">
          <div
            className="w-full max-w-md mx-auto bg-slate-900 border-t border-slate-800 rounded-t-3xl p-6 text-center animate-in slide-in-from-bottom-full duration-300"
            onClick={(e) => e.stopPropagation()} // Prevent clicking inside modal from closing it if we added an overlay click handler
          >
            <div className="w-12 h-1.5 bg-slate-800 rounded-full mx-auto mb-6"></div>

            <div className="w-16 h-16 bg-emerald-500/10 rounded-full border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Key className="w-8 h-8 text-emerald-500" />
            </div>

            <h3 className="text-xl font-bold text-slate-100">Validemos tu identidad</h3>
            <p className="text-sm text-slate-400 mt-2 mb-8">
              Necesitamos verificar que seas tú. Este paso no te llevará mucho tiempo.
            </p>

            <button
              onClick={() => {
                setShowIdentityModal(false);
                setActiveSubView('seguridad_codigo');
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-xl uppercase tracking-widest text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              Comenzar
            </button>
            <button
              onClick={() => setShowIdentityModal(false)}
              className="w-full mt-3 text-slate-400 hover:text-white font-bold py-3 text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
