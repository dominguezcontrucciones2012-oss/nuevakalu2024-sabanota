/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ViewType } from '../types';
import { Bell, RefreshCw, Cpu, Activity, Menu, Smartphone, HardDrive, Radio, Loader2 } from 'lucide-react';
import { doc, onSnapshot, disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../services/firebase';

interface HeaderProps {
  currentView: ViewType;
  onSimulateSale: () => void;
  notificationCount: number;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  exchangeRate?: number;
}

export default function Header({ currentView, onSimulateSale, notificationCount, isSidebarOpen = true, onToggleSidebar, exchangeRate = 0 }: HeaderProps) {
  const [gatewayStatus, setGatewayStatus] = useState<{ isOnline: boolean, battery: number, lastSeenMs: number }>({ isOnline: false, battery: 0, lastSeenMs: 0 });
  const [isOnlineMode, setIsOnlineMode] = useState(true);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const handleSetLocalMode = async () => {
    setIsSwitchingNetwork(true);
    try {
      await disableNetwork(db);
      setIsOnlineMode(false);
    } catch (error) {
      console.error("Error disabling network:", error);
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const handleSetOnlineMode = async () => {
    setIsSwitchingNetwork(true);
    try {
      await enableNetwork(db);
      setIsOnlineMode(true);
    } catch (error) {
      console.error("Error enabling network:", error);
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'stores', 'kaluqueso'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const gatewayStatusData = data.gateway_status;

        if (gatewayStatusData) {
          const pingField = gatewayStatusData.last_ping || gatewayStatusData.lastSeen;
          if (pingField) {
            const lastSeenMs = pingField.toMillis ? pingField.toMillis() : pingField;
            const isOnline = (Date.now() - lastSeenMs) < 120000 && gatewayStatusData.online !== false;
            setGatewayStatus({ isOnline, battery: gatewayStatusData.battery || 0, lastSeenMs });
          } else {
            setGatewayStatus({ isOnline: false, battery: 0, lastSeenMs: 0 });
          }
        } else {
          setGatewayStatus({ isOnline: false, battery: 0, lastSeenMs: 0 });
        }
      } else {
        setGatewayStatus({ isOnline: false, battery: 0, lastSeenMs: 0 });
      }
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
      default:
        return { index: '01', title: 'PORTAL KALU', sub: 'Control integral de la quesería' };
    }
  };

  const meta = getViewMeta();

  return (
    <header className="h-20 border-b border-editorial-border bg-editorial-bg sticky top-0 z-30 px-10 flex items-center justify-between select-none">
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

      {/* Right Area: Exchange Rate, Network Controls & Gateway Status */}
      <div className="flex items-center gap-4">
        {exchangeRate > 0 && (
          <div className="flex items-center gap-2 bg-amber-500/10 px-3 py-2 rounded border border-amber-500/30 w-fit animate-in fade-in duration-500">
            <span className="text-xs font-bold text-amber-500 tracking-widest font-mono">
              TASA BCV: Bs. {exchangeRate.toFixed(2)} / $
            </span>
          </div>
        )}
        
        {/* Network Toggle Controls */}
        <div className="flex bg-editorial-card border border-editorial-border rounded overflow-hidden h-[34px]">
          <button
            onClick={handleSetLocalMode}
            disabled={isSwitchingNetwork}
            className={`flex items-center gap-2 px-3 transition-all ${!isOnlineMode ? 'bg-editorial-bg border-b-2 border-amber-500' : 'hover:bg-editorial-bg/50 opacity-50'}`}
          >
            {isSwitchingNetwork && !isOnlineMode ? <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" /> : <HardDrive className={`w-3.5 h-3.5 ${!isOnlineMode ? 'text-amber-500' : 'text-editorial-text-muted'}`} />}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${!isOnlineMode ? 'text-amber-500' : 'text-editorial-text-muted'}`}>Local</span>
          </button>
          
          <div className="w-px bg-editorial-border" />
          
          <button
            onClick={handleSetOnlineMode}
            disabled={isSwitchingNetwork}
            className={`flex items-center gap-2 px-3 transition-all ${isOnlineMode ? 'bg-black border-b-2 border-emerald-500' : 'hover:bg-editorial-bg/50 opacity-50'}`}
          >
            {isSwitchingNetwork && isOnlineMode ? <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" /> : <Radio className={`w-3.5 h-3.5 ${isOnlineMode ? 'text-emerald-500' : 'text-editorial-text-muted'}`} />}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isOnlineMode ? 'text-emerald-500' : 'text-editorial-text-muted'}`}>En Vivo</span>
          </button>
        </div>

        <div className="flex items-center gap-2 bg-black/40 p-2 rounded border border-white/10 w-fit h-[34px]">
          <div className={`w-3 h-3 rounded-full ${gatewayStatus.isOnline ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)] animate-pulse' : 'bg-red-500 opacity-50'}`} />
          <span className="text-xs font-bold text-white/80 uppercase tracking-wider leading-none">Gateway Android: {gatewayStatus.isOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </div>
    </header>
  );
}
