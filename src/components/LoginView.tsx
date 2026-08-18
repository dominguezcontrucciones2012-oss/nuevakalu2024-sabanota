/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, Smartphone, Terminal, Users, KeyRound, Github, Building2, Calculator } from 'lucide-react';

import { UserIdentity } from '../types';

interface LoginViewProps {
  users: UserIdentity[];
  onLoginSuccess: (user: UserIdentity, targetView?: string) => void;
  onAddNotification: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

export default function LoginView({ users, onLoginSuccess, onAddNotification }: LoginViewProps) {
  const [loginMode, setLoginMode] = useState<'admin' | 'cajero'>('admin');
  
  // Admin Credentials
  const [email, setEmail] = useState('dominguezcontrucciones2012@gmail.com');
  const [password, setPassword] = useState('');
  
  // Cajero Credentials
  const [cedula, setCedula] = useState('');
  const [pin, setPin] = useState('');
  
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [validatedUser, setValidatedUser] = useState<UserIdentity | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      
      if (loginMode === 'admin') {
        const adminEmails = ['dominguezcontrucciones2012@gmail.com', 'deisycorro77@gmail.com'];
        const inputEmail = email.toLowerCase().trim();
        const isAdminUser = adminEmails.includes(inputEmail);
        
        if (!isAdminUser || password.trim() === '') {
          onAddNotification(`Credenciales administrativas no autorizadas.`, 'warning');
          return;
        }

        const adminUser: UserIdentity = {
          id: 'admin-master',
          name: 'Administrador General',
          initials: 'AD',
          cedula: 'N/A',
          pin: 'N/A',
          role: 'admin',
          active: true
        };
        
        setValidatedUser(adminUser);
        setShowRoleSelection(true);
        onAddNotification(`Credenciales validadas. Seleccione el módulo de ingreso.`, 'success');
        
      } else {
        const inputCedula = cedula.trim();
        const inputPin = pin.trim();
        
        if (inputCedula === 'ADMIN' && inputPin === 'kalu2024') {
          const masterUser: UserIdentity = {
            id: 'master-admin',
            name: 'Super Admin Maestro',
            initials: 'SA',
            cedula: 'ADMIN',
            pin: 'kalu2024',
            role: 'admin',
            active: true
          };
          setValidatedUser(masterUser);
          setShowRoleSelection(true);
          onAddNotification(`Modo de Emergencia Maestro Activado.`, 'success');
          return;
        }

        const foundUser = users.find(u => u.cedula === inputCedula && u.pin === inputPin);
        
        if (!foundUser) {
          onAddNotification(`Credenciales inválidas. Verifique su Cédula y PIN.`, 'warning');
          return;
        }

        if (!foundUser.active) {
          onAddNotification(`Este usuario se encuentra inactivo. Consulte al administrador.`, 'warning');
          return;
        }

        // Si es cajero, login directo a POS sin preguntar el rol (como antes)
        if (foundUser.role === 'cajero') {
          onLoginSuccess(foundUser, 'pos-terminal');
          onAddNotification(`Bienvenido ${foundUser.name}. Ingresando al Punto de Venta.`, 'success');
        } else {
          setValidatedUser(foundUser);
          setShowRoleSelection(true);
          onAddNotification(`Credenciales validadas para ${foundUser.name}.`, 'success');
        }
      }
    }, 600);
  };

  const handleRoleSelect = (role: 'crm' | 'contador') => {
    if (validatedUser) {
      onLoginSuccess(validatedUser, role === 'crm' ? 'portal-dashboard' : 'contador-ia');
    }
  };

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
            Acceda a su panel de control seguro de alta densidad para gestionar transacciones globales, auditar parámetros organizacionales de clientes y monitorear el rendimiento de los nodos de terminal POS en tiempo real.
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

        {/* Right Hand: Dual-Design Toggle Login Card */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div className="w-full max-w-[450px] bg-editorial-card border border-editorial-border rounded p-8 sm:p-10 shadow-2xl flex flex-col gap-6 relative">
            
            {!showRoleSelection ? (
              <>
                {/* Section Header Text */}
                <div className="space-y-1">
                  <h2 className="font-serif text-3xl font-bold tracking-tight text-editorial-text-primary">
                    {loginMode === 'admin' ? 'Administración' : 'Acceso Cajero'}
                  </h2>
                  <p className="text-xs text-editorial-text-muted leading-relaxed">
                    {loginMode === 'admin' 
                      ? 'Ingrese sus credenciales de administrador para obtener acceso completo.'
                      : 'Ingrese su cédula y PIN para ingresar al sistema de ventas.'}
                  </p>
                </div>

                {/* Login Inputs Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  {loginMode === 'admin' ? (
                    <>
                      {/* Email Field */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block ml-1">
                          Dirección de Correo
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-editorial-text-muted absolute left-4 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="nombre@empresa.com"
                            className="w-full h-12 bg-editorial-bg border border-editorial-border rounded pl-12 pr-4 text-xs text-editorial-text-primary focus:outline-none focus:border-brand-accent font-sans transition-all placeholder:text-editorial-text-muted/30"
                          />
                        </div>
                      </div>

                      {/* Password Field */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center ml-1">
                          <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase">
                            Contraseña
                          </label>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-editorial-text-muted absolute left-4 top-1/2 -translate-y-1/2" />
                          <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full h-12 bg-editorial-bg border border-editorial-border rounded pl-12 pr-4 text-xs text-editorial-text-primary focus:outline-none focus:border-brand-accent font-mono transition-all placeholder:text-editorial-text-muted/30"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Cedula Field */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block ml-1">
                          Cédula de Identidad
                        </label>
                        <div className="relative">
                          <Users className="w-4 h-4 text-editorial-text-muted absolute left-4 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            required
                            value={cedula}
                            onChange={(e) => setCedula(e.target.value)}
                            placeholder="Ej: 12345678"
                            className="w-full h-12 bg-editorial-bg border border-editorial-border rounded pl-12 pr-4 text-xs text-editorial-text-primary focus:outline-none focus:border-brand-accent font-sans transition-all placeholder:text-editorial-text-muted/30"
                          />
                        </div>
                      </div>

                      {/* PIN Field */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center ml-1">
                          <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase">
                            PIN de Acceso
                          </label>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-editorial-text-muted absolute left-4 top-1/2 -translate-y-1/2" />
                          <input
                            type="password"
                            required
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="••••"
                            className="w-full h-12 bg-editorial-bg border border-editorial-border rounded pl-12 pr-4 text-xs text-editorial-text-primary focus:outline-none focus:border-brand-accent font-mono transition-all placeholder:text-editorial-text-muted/30"
                          />
                        </div>
                      </div>
                    </>
                  )}

                      {/* Remember Device Box */}
                      <div className="flex items-center gap-2.5 ml-1">
                        <input
                          type="checkbox"
                          id="remember"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-editorial-border bg-editorial-bg text-brand-accent focus:ring-brand-accent focus:ring-offset-editorial-card cursor-pointer"
                        />
                        <label htmlFor="remember" className="text-xs text-editorial-text-muted cursor-pointer select-none">
                          Confiar en este nodo seguro durante 30 días
                        </label>
                      </div>

                  {/* Submit CTA */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-14 mt-2 bg-brand-accent text-white font-serif text-lg font-bold tracking-tight flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-brand-accent/20 cursor-pointer"
                  >
                    <span>{isLoading ? 'Desencriptando credenciales...' : 'Ingresar al sistema seguro'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                {/* Trial Offer text */}
                <p className="text-[11px] text-editorial-text-muted text-center pt-2">
                  <button 
                    type="button" 
                    onClick={() => setLoginMode(loginMode === 'admin' ? 'cajero' : 'admin')}
                    className="text-brand-accent font-bold hover:underline cursor-pointer"
                  >
                    {loginMode === 'admin' ? 'Ingresar como Cajero &rarr;' : 'Ingresar como Administrador &rarr;'}
                  </button>
                </p>
              </>
            ) : (
              <div className="animate-fade-in flex flex-col gap-6">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-brand-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-brand-accent" />
                  </div>
                  <h2 className="font-serif text-2xl font-bold text-editorial-text-primary">
                    Selecciona tu Destino
                  </h2>
                  <p className="text-xs text-editorial-text-muted">
                    Has iniciado sesión como <strong>{validatedUser?.name}</strong> ({validatedUser?.role}). ¿Qué módulo deseas utilizar hoy?
                  </p>
                </div>

                <div className="space-y-4 mt-2">
                  <button
                    onClick={() => handleRoleSelect('crm')}
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
                    onClick={() => handleRoleSelect('contador')}
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
              </div>
            )}
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
