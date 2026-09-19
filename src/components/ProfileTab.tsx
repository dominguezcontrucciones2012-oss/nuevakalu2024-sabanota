import React, { useState } from 'react';
import { User, ShoppingBag, HelpCircle, Gift, ShieldCheck, Info, LogOut, ChevronRight, ChevronDown, ArrowLeft, MapPin, Calendar, Wind, Sparkles, Lock, Key, MessageCircle, MessageSquare, Mail, Trash2, Award, Zap, CheckCircle2, Clock, AlertTriangle, XCircle, Package, Receipt, CreditCard } from 'lucide-react';
import { ClientProfile, DebtInstallment, Transaction } from '../types';
import { getVIPLevelInfo, VIP_LEVELS_MATRIX } from '../config/vipMatrix';
import { portalRecoveryRequestApi, portalRecoveryVerifyApi, portalRecoveryResetPinApi } from '../services/localApi';
import { buildClientPurchaseHistory, ClientPurchaseRecord } from '../utils/clientPurchases';
import { formatDisplayDate } from '../utils/debtGrouping';

interface ProfileTabProps {
  clientData: ClientProfile | null;
  clubLevel: number;
  kaluPoints: number;
  activeInstallments?: DebtInstallment[];
  allTransactions?: Transaction[];
  paymentHistory?: any[];
  onLogout: () => void;
  onNavigateSubView?: (view: string) => void;
  onNavigateTab?: (tab: 'inicio' | 'tienda' | 'qr' | 'pagos' | 'perfil') => void;
  onAddNotification?: (message: string, type?: 'info' | 'success' | 'warning') => void;
}

type SubViewType = 'main' | 'mis_datos' | 'info_personal' | 'mis_direcciones' | 'mis_compras' | 'mis_recompensas' | 'seguridad' | 'seguridad_codigo' | 'sobre_kalu' | 'mundo_kalu';
type FilterTabType = 'por_pagar' | 'pagadas' | 'canceladas';
type RewardTabType = 'disponibles' | 'utilizadas' | 'vencidas';

export default function ProfileTab({
  clientData,
  clubLevel,
  kaluPoints,
  activeInstallments = [],
  allTransactions = [],
  paymentHistory = [],
  onLogout,
  onNavigateSubView,
  onNavigateTab,
  onAddNotification
}: ProfileTabProps) {
  const [activeSubView, setActiveSubView] = useState<SubViewType>('main');
  const [filterTab, setFilterTab] = useState<FilterTabType>('por_pagar');
  const [rewardTab, setRewardTab] = useState<RewardTabType>('disponibles');
  const [expandedPurchases, setExpandedPurchases] = useState<Record<string, boolean>>({});

  const togglePurchaseExpand = (purchaseId: string) => {
    setExpandedPurchases(prev => ({
      ...prev,
      [purchaseId]: !prev[purchaseId]
    }));
  };

  // Seguridad States
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);

  // Server-Side Recovery Flow States (Fase 1D-C.3)
  const [recoveryStep, setRecoveryStep] = useState<'channel_select' | 'code_verify' | 'new_pin'>('channel_select');
  const [sendingRecoveryEmail, setSendingRecoveryEmail] = useState(false);
  const [sendingRecoveryWhatsapp, setSendingRecoveryWhatsapp] = useState(false);
  const [verifyingRecoveryCode, setVerifyingRecoveryCode] = useState(false);
  const [resettingPin, setResettingPin] = useState(false);

  const [recoverySentVia, setRecoverySentVia] = useState<'email' | 'whatsapp'>('whatsapp');
  const [recoveryRecipientMasked, setRecoveryRecipientMasked] = useState('');
  const [recoveryChallengeId, setRecoveryChallengeId] = useState('');
  const [recoveryResetToken, setRecoveryResetToken] = useState('');

  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [recoveryErrorMsg, setRecoveryErrorMsg] = useState('');

  const resetRecoveryFlow = () => {
    setRecoveryStep('channel_select');
    setSendingRecoveryEmail(false);
    setSendingRecoveryWhatsapp(false);
    setVerifyingRecoveryCode(false);
    setResettingPin(false);
    setRecoveryChallengeId('');
    setRecoveryResetToken('');
    setRecoveryRecipientMasked('');
    setRecoveryCodeInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setRecoveryErrorMsg('');
  };

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

  // Fase 3D: Mis Compras con Helper Puro buildClientPurchaseHistory
  const renderMisCompras = () => {
    // Filtrar transacciones del cliente actual
    const clientFilteredTxs = allTransactions.filter(
      (t: any) => !clientData?.id || t.clientId === clientData.id || String(t.clientId) === String(clientData.id)
    );

    const purchaseOverview = buildClientPurchaseHistory({
      transactions: clientFilteredTxs,
      installments: activeInstallments,
      payments: paymentHistory
    });

    const currentList =
      filterTab === 'por_pagar'
        ? purchaseOverview.porPagar
        : filterTab === 'pagadas'
        ? purchaseOverview.pagadas
        : purchaseOverview.canceladas;

    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 flex items-center gap-3">
          <button
            onClick={() => setActiveSubView('main')}
            className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-black text-white">Mis compras</h2>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Banner de Acceso a Pagos */}
          <div
            onClick={() => {
              setActiveSubView('main');
              if (onNavigateTab) onNavigateTab('pagos');
            }}
            className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex justify-between items-center cursor-pointer active:scale-[0.99] transition-transform shadow-md"
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

          {/* Selector de Pestañas: Por pagar / Pagadas / Canceladas */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setFilterTab('por_pagar')}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${
                filterTab === 'por_pagar'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              Por pagar {purchaseOverview.porPagar.length > 0 ? `(${purchaseOverview.porPagar.length})` : ''}
            </button>
            <button
              onClick={() => setFilterTab('pagadas')}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${
                filterTab === 'pagadas'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              Pagadas {purchaseOverview.pagadas.length > 0 ? `(${purchaseOverview.pagadas.length})` : ''}
            </button>
            <button
              onClick={() => setFilterTab('canceladas')}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${
                filterTab === 'canceladas'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              Canceladas {purchaseOverview.canceladas.length > 0 ? `(${purchaseOverview.canceladas.length})` : ''}
            </button>
          </div>

          {/* Listado de Compras */}
          <div className="space-y-3">
            {currentList.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center animate-in fade-in">
                {filterTab === 'por_pagar' && (
                  <>
                    <Wind className="w-12 h-12 text-slate-700 mb-4" />
                    <p className="text-sm font-bold text-slate-400">No tienes compras pendientes.</p>
                  </>
                )}
                {filterTab === 'pagadas' && (
                  <>
                    <ShoppingBag className="w-12 h-12 text-slate-700 mb-4" />
                    <p className="text-sm font-bold text-slate-400">Aún no tienes compras pagadas.</p>
                  </>
                )}
                {filterTab === 'canceladas' && (
                  <>
                    <XCircle className="w-12 h-12 text-slate-700 mb-4" />
                    <p className="text-sm font-bold text-slate-400">No tienes compras canceladas.</p>
                  </>
                )}
              </div>
            ) : (
              currentList.map((purchase: ClientPurchaseRecord) => {
                const isExpanded = !!expandedPurchases[purchase.purchaseId];

                // Badge de estado
                let statusBadge = (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                    Pagada
                  </span>
                );

                if (purchase.status === 'cancelled') {
                  statusBadge = (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20">
                      Cancelada
                    </span>
                  );
                } else if (purchase.status === 'in_review') {
                  statusBadge = (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                      Pago en revisión
                    </span>
                  );
                } else if (purchase.status === 'overdue') {
                  statusBadge = (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20">
                      Vencida
                    </span>
                  );
                } else if (purchase.remainingAmount > 0) {
                  statusBadge = (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                      Pendiente
                    </span>
                  );
                }

                return (
                  <div
                    key={purchase.purchaseId}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all"
                  >
                    {/* Encabezado Compacto / Acordeón */}
                    <div
                      onClick={() => togglePurchaseExpand(purchase.purchaseId)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 transition-colors select-none"
                    >
                      <div className="space-y-1 pr-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-100">{purchase.invoiceNumber}</h4>
                          {statusBadge}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{purchase.purchaseDate}</span>
                          <span>•</span>
                          <span>{purchase.paymentMethod}</span>
                        </div>
                        {purchase.nextDueDate && purchase.remainingAmount > 0 && (
                          <p className="text-[10px] text-slate-400">
                            Próx. vencimiento: <span className="text-slate-300 font-medium">{formatDisplayDate(purchase.nextDueDate)}</span>
                          </p>
                        )}
                      </div>

                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className="font-black text-white text-base sm:text-lg">
                            ${purchase.saleTotal.toFixed(2)}
                          </p>
                          {purchase.remainingAmount > 0 && purchase.status !== 'cancelled' && (
                            <p className="text-[11px] font-bold text-amber-400">
                              Por pagar: ${purchase.remainingAmount.toFixed(2)}
                            </p>
                          )}
                          {purchase.status === 'paid' && (
                            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                              Liquidada
                            </p>
                          )}
                        </div>
                        <div className="text-slate-500">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acordeón Abierto */}
                    {isExpanded && (
                      <div className="border-t border-slate-800/80 bg-slate-950/60 p-4 space-y-4 text-xs animate-in fade-in duration-200">
                        {/* Resumen Financiero de la Compra */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl">
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Venta</span>
                            <span className="text-sm font-bold text-slate-200">${purchase.saleTotal.toFixed(2)}</span>
                          </div>
                          {purchase.financedAmount > 0 && (
                            <div>
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">Financiado</span>
                              <span className="text-sm font-bold text-slate-200">${purchase.financedAmount.toFixed(2)}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">Abonado</span>
                            <span className="text-sm font-bold text-emerald-400">${purchase.paidAmount.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">Restante</span>
                            <span className={`text-sm font-bold ${purchase.remainingAmount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                              ${purchase.remainingAmount.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Productos / Items */}
                        {purchase.items.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="font-bold text-slate-300 flex items-center gap-1.5 text-xs">
                              <Package className="w-3.5 h-3.5 text-emerald-500" />
                              Productos ({purchase.items.length})
                            </h5>
                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl divide-y divide-slate-800/50">
                              {purchase.items.map((item, iIdx) => (
                                <div key={iIdx} className="p-2.5 flex justify-between items-center text-xs">
                                  <div className="pr-2">
                                    <span className="font-semibold text-slate-200 block">{item.name}</span>
                                    <span className="text-[10px] text-slate-400">
                                      Cant: {item.quantity} {item.unitPrice != null ? `× $${item.unitPrice.toFixed(2)}` : ''}
                                    </span>
                                  </div>
                                  <span className="font-bold text-slate-300 whitespace-nowrap">
                                    ${item.subtotal.toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Cuotas si es venta financiada */}
                        {purchase.installments.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="font-bold text-slate-300 flex items-center gap-1.5 text-xs">
                              <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                              Plan de Cuotas ({purchase.installments.length})
                            </h5>

                            {/* Compra Mixta: separar visualmente si tiene cotidiano y otros */}
                            {purchase.foodInstallments.length > 0 && purchase.otherInstallments.length > 0 ? (
                              <div className="space-y-3">
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Víveres y Alimentos
                                  </span>
                                  <div className="space-y-1.5">
                                    {purchase.foodInstallments.map((inst, fIdx) => renderInstallmentRow(inst, fIdx, purchase.foodInstallments.length))}
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Repuestos / Otros
                                  </span>
                                  <div className="space-y-1.5">
                                    {purchase.otherInstallments.map((inst, oIdx) => renderInstallmentRow(inst, oIdx, purchase.otherInstallments.length))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {purchase.installments.map((inst, idx) => renderInstallmentRow(inst, idx, purchase.installments.length))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Historial de Pagos de esta compra */}
                        {purchase.payments.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="font-bold text-slate-300 flex items-center gap-1.5 text-xs">
                              <Receipt className="w-3.5 h-3.5 text-emerald-500" />
                              Historial de Pagos ({purchase.payments.length})
                            </h5>
                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl divide-y divide-slate-800/50">
                              {purchase.payments.map((p, pIdx) => {
                                const pAmount = Number(p.amount || p.amountUSD || 0);
                                const pDate = formatDisplayDate(p.date || p.timestamp || p.createdAt);
                                const pMethod = p.paymentMethod || p.method || 'Pago Móvil';
                                const pRef = p.reference ? `Ref: ${p.reference}` : '';

                                let pStatusLabel = (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                                    Aprobado
                                  </span>
                                );
                                if (p.status === 'pending' || p.status === 'pending_approval' || p.status === 'in_review') {
                                  pStatusLabel = (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                                      En revisión
                                    </span>
                                  );
                                } else if (p.status === 'rejected' || p.status === 'rechazado') {
                                  pStatusLabel = (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20">
                                      Rechazado
                                    </span>
                                  );
                                }

                                return (
                                  <div key={p.id || pIdx} className="p-2.5 flex justify-between items-center text-xs">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-200">${pAmount.toFixed(2)}</span>
                                        {pStatusLabel}
                                      </div>
                                      <p className="text-[10px] text-slate-400 mt-0.5">
                                        {pDate} • {pMethod} {pRef ? `• ${pRef}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Botón de Acción si está pendiente */}
                        {purchase.remainingAmount > 0 && purchase.status !== 'cancelled' && (
                          <div className="pt-2">
                            <button
                              onClick={() => {
                                setActiveSubView('main');
                                if (onNavigateTab) onNavigateTab('pagos');
                              }}
                              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase rounded-xl text-xs tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
                            >
                              Reportar pago en Pagos &gt;
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderInstallmentRow = (inst: any, idx: number, total: number) => {
    const instNum = inst.installmentNumber || (idx + 1);
    const totalInsts = inst.totalInstallments || total;
    const instAmount = Number(inst.amountUSD || inst.amount || 0);
    const instPaid = Number(inst.paidAmount || 0);
    const instRemaining = Math.max(0, Math.round((instAmount - instPaid) * 100) / 100);
    const dueStr = inst.dueDate ? formatDisplayDate(inst.dueDate) : 'Próximamente';

    let instBadge = (
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
        Pagada
      </span>
    );

    if (inst.status === 'in_review') {
      instBadge = (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
          En revisión
        </span>
      );
    } else if (instRemaining > 0 && inst.status === 'overdue') {
      instBadge = (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20">
          Vencida
        </span>
      );
    } else if (instRemaining > 0) {
      instBadge = (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
          Pendiente
        </span>
      );
    }

    return (
      <div
        key={inst.id || idx}
        className="bg-slate-900/60 border border-slate-800/80 p-2.5 rounded-xl flex justify-between items-center text-xs"
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200">
              Cuota {instNum} de {totalInsts}
            </span>
            {instBadge}
          </div>
          <p className="text-[10px] text-slate-400">
            Vence: {dueStr} {instPaid > 0 ? `• Abonado: $${instPaid.toFixed(2)}` : ''}
          </p>
        </div>
        <div className="text-right">
          <span className="font-bold text-white block">${instAmount.toFixed(2)}</span>
          {instRemaining > 0 && instRemaining !== instAmount && (
            <span className="text-[10px] text-amber-400 block">Resta: ${instRemaining.toFixed(2)}</span>
          )}
        </div>
      </div>
    );
  };

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
          if (recoveryStep === 'code_verify') {
            setRecoveryStep('channel_select');
            setRecoveryCodeInput('');
            setRecoveryErrorMsg('');
          } else if (recoveryStep === 'new_pin') {
            resetRecoveryFlow();
            setActiveSubView('seguridad');
          } else {
            resetRecoveryFlow();
            setActiveSubView('seguridad');
          }
        }} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-white">Seguridad de la Cuenta</h2>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {recoveryStep === 'channel_select' && (
          <>
            <h3 className="text-2xl font-extrabold text-slate-100 mt-4 leading-tight">Te enviaremos un código de recuperación</h3>
            <p className="text-sm text-slate-400 mt-1 mb-6">Elige dónde quieres recibirlo.</p>

            {recoveryErrorMsg && (
              <div className="bg-rose-500/20 border border-rose-500/50 rounded-lg p-3 mb-4">
                <p className="text-rose-500 text-xs font-bold text-center">{recoveryErrorMsg}</p>
              </div>
            )}

            {/* WhatsApp Option */}
            <div
              onClick={async () => {
                if (sendingRecoveryWhatsapp || sendingRecoveryEmail) return;
                setSendingRecoveryWhatsapp(true);
                setRecoveryErrorMsg('');
                const identifier = clientData?.phone || (clientData as any)?.telefono || clientData?.id || '';

                try {
                  const res = await portalRecoveryRequestApi({
                    portalType: 'client',
                    identifier,
                    channel: 'whatsapp'
                  });
                  setRecoverySentVia('whatsapp');
                  setRecoveryChallengeId(res.challengeId || '');
                  setRecoveryRecipientMasked(res.recipientMasked || `+58***${String(clientData?.phone || (clientData as any)?.telefono || '2054').slice(-4)}`);
                  setRecoveryStep('code_verify');
                  setRecoveryCodeInput('');
                } catch (e: any) {
                  setRecoveryErrorMsg(e.message || 'Error al solicitar código por WhatsApp');
                  onAddNotification?.(e.message || 'Error al solicitar código', 'warning');
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
                setRecoveryErrorMsg('');
                const identifier = clientData?.email || (clientData as any)?.correo || clientData?.phone || clientData?.id || '';

                try {
                  const res = await portalRecoveryRequestApi({
                    portalType: 'client',
                    identifier,
                    channel: 'email'
                  });
                  setRecoverySentVia('email');
                  setRecoveryChallengeId(res.challengeId || '');
                  setRecoveryRecipientMasked(res.recipientMasked || clientData?.email || '');
                  setRecoveryStep('code_verify');
                  setRecoveryCodeInput('');
                } catch (e: any) {
                  setRecoveryErrorMsg(e.message || 'Error al solicitar código por correo');
                  onAddNotification?.(e.message || 'Error al solicitar código', 'warning');
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
                  <p className="text-[11px] text-slate-400 mt-0.5">Enviar a {clientData?.email || 'correo registrado'}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
          </>
        )}

        {recoveryStep === 'code_verify' && (
          <div className="space-y-4 animate-in fade-in flex-1">
            <h3 className="text-2xl font-extrabold text-slate-100 mt-4 leading-tight">Ingresa el código</h3>
            <p className="text-sm text-slate-400 mt-1 mb-6">
              {recoverySentVia === 'whatsapp'
                ? `Escribe el código de 6 dígitos que enviamos a tu WhatsApp (${recoveryRecipientMasked || 'tu número'}).`
                : `Escribe el código de 6 dígitos que enviamos a tu correo (${recoveryRecipientMasked || 'tu correo'}).`}
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
              disabled={verifyingRecoveryCode || recoveryCodeInput.length !== 6}
              onClick={async () => {
                if (verifyingRecoveryCode || recoveryCodeInput.length !== 6) return;
                setVerifyingRecoveryCode(true);
                setRecoveryErrorMsg('');
                const identifier = clientData?.phone || (clientData as any)?.telefono || clientData?.email || clientData?.id || '';

                try {
                  const res = await portalRecoveryVerifyApi({
                    portalType: 'client',
                    identifier,
                    challengeId: recoveryChallengeId,
                    code: recoveryCodeInput
                  });

                  if (res.resetToken) {
                    setRecoveryResetToken(res.resetToken);
                    setRecoveryStep('new_pin');
                    setRecoveryErrorMsg('');
                    onAddNotification?.('Código verificado con éxito. Establece tu nuevo PIN.', 'success');
                  } else {
                    setRecoveryErrorMsg('Código de verificación inválido o expirado.');
                  }
                } catch (e: any) {
                  setRecoveryErrorMsg(e.message || 'Código incorrecto o expirado.');
                } finally {
                  setVerifyingRecoveryCode(false);
                }
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black uppercase tracking-widest text-sm rounded-xl py-4 transition-colors"
            >
              {verifyingRecoveryCode ? 'Verificando...' : 'Verificar Código'}
            </button>
          </div>
        )}

        {recoveryStep === 'new_pin' && (
          <div className="space-y-4 animate-in fade-in flex-1">
            <h3 className="text-2xl font-extrabold text-slate-100 mt-4 leading-tight">Crea tu nuevo PIN</h3>
            <p className="text-sm text-slate-400 mt-1 mb-4">
              Ingresa un código de seguridad numérico de exactamente 6 dígitos para acceder a tu cuenta.
            </p>

            {recoveryErrorMsg && (
              <div className="bg-rose-500/20 border border-rose-500/50 rounded-lg p-3">
                <p className="text-rose-500 text-xs font-bold text-center">{recoveryErrorMsg}</p>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Nuevo PIN (6 dígitos)</label>
              <input
                type="password"
                placeholder="••••••"
                value={newPinInput}
                onChange={e => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3.5 text-lg text-white text-center tracking-[0.5em] focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Confirmar Nuevo PIN</label>
              <input
                type="password"
                placeholder="••••••"
                value={confirmPinInput}
                onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3.5 text-lg text-white text-center tracking-[0.5em] focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <button
              disabled={resettingPin || newPinInput.length !== 6 || confirmPinInput.length !== 6}
              onClick={async () => {
                if (newPinInput !== confirmPinInput) {
                  setRecoveryErrorMsg('Los PINs ingresados no coinciden.');
                  return;
                }
                if (newPinInput.length !== 6) {
                  setRecoveryErrorMsg('El PIN debe contener exactamente 6 dígitos numéricos.');
                  return;
                }

                setResettingPin(true);
                setRecoveryErrorMsg('');
                const identifier = clientData?.phone || (clientData as any)?.telefono || clientData?.email || clientData?.id || '';

                try {
                  await portalRecoveryResetPinApi({
                    portalType: 'client',
                    identifier,
                    resetToken: recoveryResetToken,
                    newPin: newPinInput
                  });

                  onAddNotification?.('¡PIN actualizado con éxito! Tu clave ha sido restablecida.', 'success');
                  resetRecoveryFlow();
                  setActiveSubView('main');
                } catch (e: any) {
                  setRecoveryErrorMsg(e.message || 'Error al actualizar el PIN.');
                } finally {
                  setResettingPin(false);
                }
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black uppercase tracking-widest text-sm rounded-xl py-4 transition-colors mt-2"
            >
              {resettingPin ? 'Actualizando PIN...' : 'Guardar Nuevo PIN'}
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
