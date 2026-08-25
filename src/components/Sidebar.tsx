/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewType } from '../types';
import {
  LayoutDashboard,
  Users,
  LogOut,
  Receipt,
  Package,
  Contact,
  Truck,
  TrendingUp,
  MessageSquare,
  Settings,
  Smartphone,
  BrainCircuit,
  QrCode,
  BookOpen,
  RotateCw,
  ShieldCheck
} from 'lucide-react';
import { useState } from 'react';
import { fetchOfficialBcvRate } from '../services/exchangeRateService';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  isAdmin: boolean;
  userRole?: string;
  userName?: string;
  isOpen?: boolean;
  exchangeRate?: number;
  lastRateSync?: string;
  onSyncRate?: (rate: number, syncDate: string) => void;
}

export default function Sidebar({ currentView, onViewChange, onLogout, isAdmin, userRole = 'cajero', userName = 'Invitado', isOpen = true, exchangeRate = 0, lastRateSync, onSyncRate }: SidebarProps) {
  const [isSyncingRate, setIsSyncingRate] = useState(false);

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  const handleSyncRate = async () => {
    setIsSyncingRate(true);
    try {
      const { rate, timestamp } = await fetchOfficialBcvRate();
      onSyncRate?.(rate, timestamp);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncingRate(false);
    }
  };

  const allMenuItems = [
    {
      id: 'portal-dashboard' as ViewType,
      num: '01',
      label: 'Panel General',
      icon: LayoutDashboard,
      description: 'Métricas clave y avisos del negocio'
    },
    {
      id: 'pos-terminal' as ViewType,
      num: '02',
      label: 'Punto de Venta',
      icon: Receipt,
      description: 'Ventas, historial y cierre de caja'
    },
    {
      id: 'inventory' as ViewType,
      num: '03',
      label: 'Inventario & IA',
      icon: Package,
      description: 'Stock, precios, loteador y escáner IA'
    },
    {
      id: 'kardex' as ViewType,
      num: '03B',
      label: 'Kardex General',
      icon: BookOpen,
      description: 'Auditoría de todos los movimientos'
    },
    {
      id: 'clients' as ViewType,
      num: '04',
      label: 'Clientes & Crédito',
      icon: Contact,
      description: 'Directorio y cuentas por cobrar'
    },
    {
      id: 'suppliers' as ViewType,
      num: '05',
      label: 'Proveedores',
      icon: Truck,
      description: 'Martín Niño, deudas y compras'
    },
    {
      id: 'finances' as ViewType,
      num: '06',
      label: 'Finanzas & Análisis',
      icon: TrendingUp,
      description: 'Flujo de caja, gastos y rentabilidad'
    },
    {
      id: 'collections' as ViewType,
      num: '07',
      label: 'Centro de Cobranzas',
      icon: Receipt,
      description: 'Robot de conciliación y pagos PWA'
    },
    {
      id: 'mobile-portals' as ViewType,
      num: '08',
      label: 'Portales Móviles',
      icon: Smartphone,
      description: 'Portal de Productores & Clientes'
    },
    {
      id: 'settings' as ViewType,
      num: '09',
      label: 'Administración',
      icon: Settings,
      description: 'Ajustes, usuarios y copias de seguridad'
    },
    {
      id: 'access-control' as ViewType,
      num: '10',
      label: 'Portales Externos (QRs)',
      icon: QrCode,
      description: 'QRs para Cliente, Productor y Contador'
    },
    {
      id: 'contador-ia' as ViewType,
      num: '11',
      label: 'Portal Contador (IA)',
      icon: BrainCircuit,
      description: 'Dictado por voz y balances contables'
    }
  ];

  const menuItems = userRole === 'cajero' 
    ? allMenuItems.filter(item => item.id === 'pos-terminal')
    : allMenuItems;

  return (
    <aside className={`transition-all duration-300 ease-in-out border-r border-editorial-border bg-editorial-bg flex flex-col py-8 min-h-screen sticky top-0 shrink-0 h-screen select-none overflow-y-auto overflow-x-hidden ${
      isOpen ? 'w-80 px-8 opacity-100' : 'w-0 px-0 opacity-0 border-r-0'
    }`}>
      {/* Top Branding Section */}
      <div className="flex flex-col gap-8 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-6 h-6 rounded-full bg-amber-500 animate-pulse" />
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tighter leading-none text-editorial-text-primary">
              KALU
            </h1>
            <span className="text-[10px] tracking-[0.25em] font-mono text-editorial-text-muted uppercase">
              Control de Quesos
            </span>
          </div>
        </div>

        <div className="h-px bg-editorial-border w-full" />
      </div>

      {/* Navigation List */}
      <nav className="flex flex-col gap-4 my-6 shrink-0">
        <span className="text-[10px] tracking-[0.2em] font-mono text-editorial-text-muted uppercase mb-1">
          MENÚ OPERATIVO
        </span>

        {menuItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`group flex items-start gap-3 text-left p-2.5 rounded transition-all duration-300 border border-transparent ${
                isActive
                  ? 'bg-editorial-card border-editorial-border shadow-lg'
                  : 'hover:bg-editorial-card/45 hover:border-editorial-border/30'
              }`}
            >
              <span
                className={`font-serif text-xl italic leading-none transition-colors duration-300 ${
                  isActive ? 'text-amber-500' : 'text-editorial-text-muted group-hover:text-editorial-text-primary'
                }`}
              >
                {item.num}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-500' : 'text-editorial-text-muted'}`} />
                  <span
                    className={`font-sans font-medium text-xs tracking-tight transition-colors duration-300 ${
                      isActive ? 'text-editorial-text-primary' : 'text-editorial-text-muted group-hover:text-editorial-text-primary'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
                <p className="text-[10px] text-editorial-text-muted/60 mt-0.5 truncate">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </nav>

      {/* BCV Widget */}
      <div className="flex flex-col gap-4 mt-auto mb-6 shrink-0">
        <div className="bg-editorial-card border border-editorial-border rounded p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] tracking-widest font-mono text-editorial-text-muted uppercase">TASA BCV</span>
            <div className="flex items-center gap-2">
              <div className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span className="text-[8px] font-bold uppercase tracking-wider">Sincronizada</span>
              </div>
              <button onClick={handleSyncRate} disabled={isSyncingRate} className="text-editorial-text-muted hover:text-amber-500 transition-colors disabled:opacity-50">
                <RotateCw className={`w-3.5 h-3.5 ${isSyncingRate ? 'animate-spin text-amber-500' : ''}`} />
              </button>
            </div>
          </div>
          <div className="text-xl font-bold font-serif text-amber-500 text-center mb-2">
            {exchangeRate?.toFixed(2)} <span className="text-xs text-editorial-text-muted font-sans">BS/USD</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-[9px] text-editorial-text-muted font-mono uppercase tracking-wider">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            En vivo · BCV Oficial
          </div>
          {lastRateSync && (
            <div className="text-center text-[8px] text-editorial-text-muted/60 mt-1">
              {new Date(lastRateSync).toLocaleString('es-VE')}
            </div>
          )}
        </div>
      </div>

      {/* Footer Profile & Logout */}
      <div className="flex flex-col gap-6 shrink-0">
        <div className="h-px bg-editorial-border w-full" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-editorial-card border border-editorial-border flex items-center justify-center font-serif text-md font-bold text-amber-500 overflow-hidden shrink-0">
              <span className="text-sm font-sans font-bold">{getInitials(userName)}</span>
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-medium text-editorial-text-primary truncate" title={userName}>
                {userName}
              </div>
              <span className="text-[9px] font-mono tracking-wider text-amber-500 uppercase">
                {userRole === 'admin' ? 'Administrador' : userRole === 'auditor' ? 'Auditor' : 'Cajero'}
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            title="Cerrar sesión del sistema"
            className="p-2 rounded border border-editorial-border text-editorial-text-muted hover:text-amber-500 hover:bg-editorial-card transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-[8px] font-mono text-editorial-text-muted/40 text-center uppercase tracking-widest">
          ©2026 Kalu Queserías
        </div>
      </div>
    </aside>
  );
}
