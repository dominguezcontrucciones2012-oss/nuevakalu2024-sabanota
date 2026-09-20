/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ViewType } from '../types';
import { Bell, RefreshCw, Cpu, Activity, Menu, Smartphone, HardDrive, Radio, Loader2 } from 'lucide-react';
import { onCollectionSnapshot } from '../services/localApi';
import { getPendingMundoKaluPaymentCount } from '../utils/pendingPayments';

interface HeaderProps {
  currentView: ViewType;
  notificationCount: number;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  exchangeRate?: number;
  onNavigate?: (view: ViewType) => void;
}

export default function Header({ currentView, notificationCount, isSidebarOpen = true, onToggleSidebar, exchangeRate = 0, onNavigate }: HeaderProps) {
  const [pendingMundoKaluCount, setPendingMundoKaluCount] = useState<number>(0);
  const [isOnlineMode, setIsOnlineMode] = useState(true);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const handleSetLocalMode = async () => {
    setIsSwitchingNetwork(true);
    setTimeout(() => {
      setIsOnlineMode(false);
      setIsSwitchingNetwork(false);
    }, 500);
  };

  const handleSetOnlineMode = async () => {
    setIsSwitchingNetwork(true);
    setTimeout(() => {
      setIsOnlineMode(true);
      setIsSwitchingNetwork(false);
    }, 500);
  };

  useEffect(() => {
    // Suscripción reactiva en tiempo real a pagos PWA (Fase 3C)
    const unsub = onCollectionSnapshot('pwa_payments', (data) => {
      const count = getPendingMundoKaluPaymentCount(data);
      setPendingMundoKaluCount(count);
    });

    return () => {
      unsub();
    };
  }, []);

  const getViewMeta = () => {
    switch (currentView) {
      case 'portal-dashboard':
        return { index: '01', title: 'PORTAL DE CONTROL', sub: 'Resumen de balance institucional y libro mayor' };
      case 'pos-terminal':
        return { index: '02', title: 'PUNTO DE VENTA', sub: 'Terminal de facturación rápida y recibos' };
      case 'inventory':
        return { index: '03', title: 'CONTROL DE INVENTARIO', sub: 'Carga de compras, stock general y escáner IA' };
      case 'clients':
        return { index: '04', title: 'CLIENTES Y CRÉDITO', sub: 'Directorio de cuentas por cobrar y puntos de lealtad' };
      case 'suppliers':
        return { index: '05', title: 'PROVEEDORES Y DEUDAS', sub: 'Directorio de productores y cuentas por pagar' };
      case 'finances':
        return { index: '06', title: 'FINANZAS Y ANÁLISIS', sub: 'Flujo de caja, gastos operativos y ROI publicitario' };
      case 'support':
        return { index: '07', title: 'BUZÓN DE QUEJAS', sub: 'Gestión interna de calidad de quesos y atención' };
      case 'settings':
        return { index: '08', title: 'ADMINISTRACIÓN GENERAL', sub: 'Gestión de usuarios, respaldos y herramientas de mantenimiento' };
      case 'collections':
        return { index: '09', title: 'CENTRO DE COBRANZAS', sub: 'Revisión y conciliación de comprobantes PWA' };
      default:
        return { index: '01', title: 'PORTAL KALU', sub: 'Control integral de la quesería' };
    }
  };

  const meta = getViewMeta();

  return (
    <header className="h-20 border-b border-editorial-border bg-editorial-bg sticky top-0 z-40 px-10 flex items-center justify-between select-none">
      {/* Left Area: Editorial Index & Breadcrumb */}
      <div className="flex items-center gap-6">
        <button
          onClick={onToggleSidebar}
          className="text-editorial-text-muted hover:text-editorial-text-primary transition-colors cursor-pointer mr-2"
          aria-label="Toggle Sidebar"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-3xl font-bold tracking-tight text-brand-accent">
            {meta.index}
          </span>
          <div className="h-6 w-[1px] bg-editorial-border mx-1" />
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold tracking-widest text-editorial-text-primary uppercase">
              {meta.title}
            </span>
            <span className="text-[10px] text-editorial-text-muted hidden md:inline">
              {meta.sub}
            </span>
          </div>
        </div>
      </div>

      {/* Right Area: Exchange Rate, Network Controls & Pagos Mundo Kalu Alertador */}
      <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-end">
        {/* Exchange Rate Box (Always visible) */}
        <div className={`flex items-center gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded border w-fit animate-in fade-in duration-500 ${
          exchangeRate > 0 
            ? 'bg-amber-500/10 border-amber-500/30' 
            : 'bg-rose-500/10 border-rose-500/30'
        }`}>
          <span className={`text-[10px] md:text-xs font-bold tracking-widest font-mono ${
            exchangeRate > 0 ? 'text-amber-500' : 'text-rose-500'
          }`}>
            <span className="hidden md:inline">TASA BCV: </span>
            {exchangeRate > 0 ? `Bs. ${exchangeRate.toFixed(2)}` : 'NO SYNC (0.00)'}
          </span>
        </div>
        
        {/* Network Toggle Controls */}
        <div className="flex bg-editorial-card border border-editorial-border rounded overflow-hidden h-[28px] md:h-[34px]">
          <button
            onClick={handleSetLocalMode}
            disabled={isSwitchingNetwork}
            className={`flex items-center gap-1 md:gap-2 px-2 md:px-3 transition-all ${!isOnlineMode ? 'bg-editorial-bg border-b-2 border-amber-500' : 'hover:bg-editorial-bg/50 opacity-50'}`}
          >
            {isSwitchingNetwork && !isOnlineMode ? <Loader2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-500 animate-spin" /> : <HardDrive className={`w-3 h-3 md:w-3.5 md:h-3.5 ${!isOnlineMode ? 'text-amber-500' : 'text-editorial-text-muted'}`} />}
            <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-wider ${!isOnlineMode ? 'text-amber-500' : 'text-editorial-text-muted'}`}>Local</span>
          </button>
          
          <div className="w-px bg-editorial-border" />
          
          <button
            onClick={handleSetOnlineMode}
            disabled={isSwitchingNetwork}
            className={`flex items-center gap-1 md:gap-2 px-2 md:px-3 transition-all ${isOnlineMode ? 'bg-black border-b-2 border-emerald-500' : 'hover:bg-editorial-bg/50 opacity-50'}`}
          >
            {isSwitchingNetwork && isOnlineMode ? <Loader2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-500 animate-spin" /> : <Radio className={`w-3 h-3 md:w-3.5 md:h-3.5 ${isOnlineMode ? 'text-emerald-500' : 'text-editorial-text-muted'}`} />}
            <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-wider ${isOnlineMode ? 'text-emerald-500' : 'text-editorial-text-muted'}`}>En Vivo</span>
          </button>
        </div>

        {/* Alertador en Tiempo Real: PAGOS MUNDO KALU (Alerta Roja Parpadeante con Pendientes) */}
        <button
          type="button"
          onClick={() => onNavigate && onNavigate('collections')}
          aria-live="polite"
          title={pendingMundoKaluCount > 0 ? `¡ALERTA! ${pendingMundoKaluCount} pago(s) pendiente(s) por conciliar en Mundo Kalu` : 'Centro de Cobranzas Mundo Kalu (Sin pagos pendientes)'}
          className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 rounded border transition-all duration-300 h-[28px] md:h-[34px] cursor-pointer select-none ${
            pendingMundoKaluCount > 0
              ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.5)] animate-pulse hover:bg-rose-500/30'
              : 'bg-black/40 border-white/10 hover:bg-black/60 opacity-85 text-white'
          }`}
        >
          <div className="relative flex items-center justify-center">
            {pendingMundoKaluCount > 0 && (
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-rose-400 opacity-75"></span>
            )}
            <div
              className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${
                pendingMundoKaluCount > 0
                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]'
                  : 'bg-emerald-500 opacity-60'
              }`}
            />
          </div>
          <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider leading-none flex items-center gap-1">
            <span className="hidden sm:inline">PAGOS </span>MUNDO KALU
            {pendingMundoKaluCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[9px] md:text-[10px] font-mono font-black bg-rose-600 text-white rounded-full leading-none shadow-sm animate-bounce">
                [{pendingMundoKaluCount}]
              </span>
            )}
          </span>
        </button>
      </div>
    </header>
  );
}
