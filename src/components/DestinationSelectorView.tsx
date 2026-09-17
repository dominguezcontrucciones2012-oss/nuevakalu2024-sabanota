import React from 'react';
import { Users, Building2, Calculator, LogOut } from 'lucide-react';
import { UserIdentity } from '../types';

interface DestinationSelectorViewProps {
  user: UserIdentity;
  onSelectApp: (app: 'crm' | 'contador') => void;
  onLogout?: () => void;
}

export default function DestinationSelectorView({
  user,
  onSelectApp,
  onLogout
}: DestinationSelectorViewProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-editorial-bg select-none">
      {/* Background Editorial Accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-brand-accent/[0.03] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-accent/[0.02] rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">

        {/* Left Hand: Value Proposition & Brand Manifesto */}
        <div className="hidden lg:flex lg:col-span-6 flex-col space-y-6">
          <span className="text-[10px] font-mono tracking-[0.4em] text-brand-accent uppercase">
            PILA DE NÚCLEO SEGURA v2.4.0
          </span>
          <h1 className="font-serif text-5xl sm:text-6xl font-black tracking-tight text-editorial-text-primary uppercase leading-[0.9]">
            Seguridad<br />de nivel <span className="text-brand-accent italic font-normal tracking-wide lowercase">institucional</span><br />para activos digitales.
          </h1>
          <p className="font-sans text-sm text-editorial-text-muted leading-relaxed max-w-md pt-2">
            Sesión validada exitosamente. Seleccione el entorno operativo al que desea acceder.
          </p>

          <div className="flex items-center gap-4 pt-6">
            <div className="flex -space-x-4">
              <img
                className="w-10 h-10 rounded-full border-2 border-editorial-bg object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB574bwhiJd0AFBsqLVznR5uA7JCtfFgK2sJ-PaaTnV99Oh9KLGzF4Z-HQ2XCnKC6CC2py6rw3O_yGHt3xEjXKKvQqniwH08tBz4k2sJ5_FsJIASgF4EBzlWugb04sMBdEILxIi6u3Rb5eesAoOSjlJf2dZ_1lGycHGHph1JMnXgrBtlIQlfKIZx3k31qaqR45Z5Fd_iEhA_4ERYs5Iua6S0Yr0Ch13_c4VAJLbk43NtCWx6XnNG3RYR-Z9XPpBFfQ3lbzPIy2DfQI"
                alt="Professional Male Executive"
              />
              <img
                className="w-10 h-10 rounded-full border-2 border-editorial-bg object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB-Vq_COEESacajraPbKN69wW3OtQKwPeukqFmzg0GAZDRh3REMJBrGB3g8crf4JC7rSnie3Qu2G9Tw53xOcma82GhOYMhpM1QMGe9QXix6cU0xZIaqOh6Md5xfZ5I84FWmmp7kgFdRYYcCYxFjxctRCnlExzqipyS1hWKDlYejwoIwcMPjOZyo3ny3RqR0GnNsrdTtB7psQX2qoJc7xc5Jr2SuJIt_AwFN3UvKRTuKEl28Cf6Cq6NeRefv4hXLBS29W9q64QZzjIc"
                alt="Female Analyst"
              />
              <img
                className="w-10 h-10 rounded-full border-2 border-editorial-bg object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuARFhIxbUiAnYkdhV1GxJOVnq9m2qdbMof-TBCarU2Qt0GWykUGzcHf3U6clGKtERJuDbJLhHlqFDPSVzcUYp84IfTxIbzXYbXhMdLgbKulDtrH0hrujS6dC9fJQPTnYV7IOdfIMJ-Ox1tr0SF9QwOte5QU-02VuVOXoQPqkFdJUWgsCbxppBznC6KV2CCixTdUMmvD9G76M0O0wR8XIF-uW5U9qqFS30Vdgg7G0dBUgXd9kHWzyKm7E_ldDyXIhJOmr5chliWqheg"
                alt="Sharp Suit Professional"
              />
            </div>
            <span className="text-[11px] font-mono text-editorial-text-muted">
              RESPALDADO POR MÁS DE 10,000 EMPRESAS GLOBALES
            </span>
          </div>
        </div>

        {/* Right Hand: Dual-Design App Selector Card */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div className="w-full max-w-[450px] bg-editorial-card border border-editorial-border rounded p-8 sm:p-10 shadow-2xl flex flex-col gap-6 relative">
            <div className="animate-fade-in flex flex-col gap-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-brand-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-brand-accent" />
                </div>
                <h2 className="font-serif text-2xl font-bold text-editorial-text-primary">
                  Selecciona tu Destino
                </h2>
                <p className="text-xs text-editorial-text-muted">
                  Has iniciado sesión como <strong>{user?.name}</strong> ({user?.role}). ¿Qué módulo deseas utilizar hoy?
                </p>
              </div>

              <div className="space-y-4 mt-2">
                <button
                  id="btn-select-crm"
                  type="button"
                  onClick={() => onSelectApp('crm')}
                  className="w-full p-4 border-2 border-editorial-border hover:border-brand-accent bg-editorial-bg hover:bg-brand-accent/5 rounded-xl transition-all cursor-pointer flex items-center gap-4 group text-left"
                >
                  <div className="w-12 h-12 rounded-lg bg-editorial-card border border-editorial-border flex items-center justify-center group-hover:bg-brand-accent group-hover:text-white transition-colors shrink-0">
                    <Building2 className="w-6 h-6 text-editorial-text-muted group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-editorial-text-primary group-hover:text-brand-accent transition-colors">
                      🏢 Administradora CRM
                    </h3>
                    <p className="text-[10px] text-editorial-text-muted leading-tight mt-1">
                      Acceso completo a inventario, finanzas, ventas y portal maestro.
                    </p>
                  </div>
                </button>

                <button
                  id="btn-select-contador"
                  type="button"
                  onClick={() => onSelectApp('contador')}
                  className="w-full p-4 border-2 border-editorial-border hover:border-emerald-500 bg-editorial-bg hover:bg-emerald-500/5 rounded-xl transition-all cursor-pointer flex items-center gap-4 group text-left"
                >
                  <div className="w-12 h-12 rounded-lg bg-editorial-card border border-editorial-border flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors shrink-0">
                    <Calculator className="w-6 h-6 text-editorial-text-muted group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-editorial-text-primary group-hover:text-emerald-500 transition-colors">
                      📊 Mini-App Contador IA
                    </h3>
                    <p className="text-[10px] text-editorial-text-muted leading-tight mt-1">
                      Carga rápida de facturas, notas de voz y control de presupuesto en campo.
                    </p>
                  </div>
                </button>
              </div>

              {onLogout && (
                <div className="pt-2 text-center border-t border-editorial-border/40">
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center gap-1.5 text-xs text-editorial-text-muted hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Floating System Status Meta */}
      <div className="fixed bottom-6 left-6 hidden lg:flex flex-col gap-1 text-[10px] font-mono tracking-widest text-editorial-text-muted/30 pointer-events-none">
        <div>RUTA DE DATOS ENCRIPTADA // PROTOCOLO SEGURO</div>
        <div>ID_TERMINAL: XP-204-Q</div>
      </div>
    </div>
  );
}
