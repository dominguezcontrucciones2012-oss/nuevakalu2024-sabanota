import React, { useState } from 'react';
import { Fingerprint, KeyRound, ShieldCheck, AlertCircle, Sparkles, X } from 'lucide-react';
import {
  PasskeyActorType,
  hasLocalPasskeyHint,
  browserSupportsPasskeys,
  authenticateWithPasskey
} from '../services/passkeyService';

interface BiometricLoginPanelProps {
  actorType: PasskeyActorType;
  onSuccess: (data: any) => void;
  onFallbackToNormal: () => void;
  onErrorNotification?: (msg: string) => void;
}

export default function BiometricLoginPanel({
  actorType,
  onSuccess,
  onFallbackToNormal,
  onErrorNotification
}: BiometricLoginPanelProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);

  const getPortalInfo = () => {
    switch (actorType) {
      case 'admin':
        return {
          title: 'Kalu Administración',
          subtitle: 'Acceso Biométrico Rápido',
          badge: 'Administración'
        };
      case 'client':
        return {
          title: 'Mundo Kalu Cliente',
          subtitle: 'Acceso Biométrico Rápido',
          badge: 'Portal Cliente'
        };
      case 'producer':
        return {
          title: 'Mundo Kalu Productor',
          subtitle: 'Acceso Biométrico Rápido',
          badge: 'Portal Productor'
        };
    }
  };

  const info = getPortalInfo();

  const handleBiometricClick = async () => {
    setErrorMessage(null);
    setIsAuthenticating(true);

    try {
      const result = await authenticateWithPasskey(actorType);
      if (result.success) {
        setFailCount(0);
        onSuccess(result);
      }
    } catch (err: any) {
      const nextFail = failCount + 1;
      setFailCount(nextFail);
      const msg = err.message || 'Error al autenticar con biometría.';

      if (nextFail >= 3) {
        if (onErrorNotification) {
          onErrorNotification('Usa tu método de acceso habitual');
        }
        onFallbackToNormal();
      } else {
        setErrorMessage(msg);
        if (onErrorNotification) {
          onErrorNotification(msg);
        }
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-300">
      
      {/* Badge Superior */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-xs font-semibold uppercase tracking-wider mb-6">
        <Sparkles size={12} className="text-brand-accent" />
        <span>{info.badge}</span>
      </div>

      {/* Titulares */}
      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 font-display">
        {info.title}
      </h2>
      <p className="text-slate-400 text-sm mb-8">
        {info.subtitle}
      </p>

      {/* Botón Central de Huella / Biometría */}
      <div className="relative group my-2">
        {/* Glow animado */}
        <div className="absolute -inset-2 bg-gradient-to-r from-brand-accent to-emerald-500 rounded-full blur-xl opacity-30 group-hover:opacity-60 transition duration-500 animate-pulse" />
        
        <button
          type="button"
          onClick={handleBiometricClick}
          disabled={isAuthenticating}
          className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-900/90 border-2 border-brand-accent/50 group-hover:border-brand-accent hover:scale-105 active:scale-95 transition-all duration-300 flex flex-col items-center justify-center cursor-pointer shadow-lg shadow-brand-accent/10 disabled:opacity-50"
          aria-label="Autenticar con huella o biometría"
        >
          <Fingerprint
            size={56}
            className={`text-brand-accent group-hover:text-emerald-400 transition-colors duration-300 ${
              isAuthenticating ? 'animate-bounce' : ''
            }`}
          />
          <span className="text-[10px] font-semibold text-slate-300 mt-1 uppercase tracking-wider">
            {isAuthenticating ? 'Verificando...' : 'Tocar'}
          </span>
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-4 mb-6">
        Toca el sensor para entrar con tu huella, rostro o Windows Hello
      </p>

      {/* Mensaje de error si falla */}
      {errorMessage && (
        <div className="w-full flex items-start gap-2 p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-left animate-in fade-in">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Enlace Discreto para revelar login normal como recuperación */}
      <div className="w-full pt-4 border-t border-white/5 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onFallbackToNormal}
          className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-white/5"
        >
          <KeyRound size={14} />
          <span>Usar otro método (Contraseña / PIN)</span>
        </button>
      </div>

    </div>
  );
}

/**
 * Modal interactivo para configurar el acceso biométrico por primera vez desde el botón de huella
 */
interface PasskeyInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  actorType: PasskeyActorType;
  onAuthSuccess: (loginResult: any) => void;
  onAddNotification?: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export function PasskeyInfoModal({
  isOpen,
  onClose,
  actorType,
  onAuthSuccess,
  onAddNotification
}: PasskeyInfoModalProps) {
  // Pasos: 'intro' | 'credentials' | 'registering' | 'failed' | 'success'
  const [step, setStep] = useState<'intro' | 'credentials' | 'registering' | 'failed' | 'success'>('intro');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Campos para Admin
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Campos para Portales (Cliente / Productor)
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');

  // Reset del estado al abrir/cerrar
  React.useEffect(() => {
    if (isOpen) {
      setStep('intro');
      setErrorMsg(null);
      setIsLoading(false);
      setEmail('');
      setPassword('');
      setIdentifier('');
      setPin('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartSetup = () => {
    setErrorMsg(null);
    setStep('credentials');
  };

  const handleCancel = () => {
    setErrorMsg(null);
    setIsLoading(false);
    onClose();
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      let authResponse: any = null;

      // 1. Validar credenciales según la puerta usando los métodos oficiales
      if (actorType === 'admin') {
        const { loginApi } = await import('../services/localApi');
        authResponse = await loginApi({
          loginMode: 'admin',
          email: email.trim(),
          password: password.trim()
        });
      } else {
        const { portalLoginApi } = await import('../services/localApi');
        authResponse = await portalLoginApi({
          portalType: actorType,
          identifier: identifier.trim(),
          pin: pin.trim()
        });
      }

      // 2. Si las credenciales fueron correctas, pasar inmediatamente a registro biométrico
      setStep('registering');
      setIsLoading(false);

      const { registerPasskey } = await import('../services/passkeyService');
      const regRes = await registerPasskey(actorType);

      if (regRes && regRes.success) {
        setStep('success');
        if (onAddNotification) {
          onAddNotification('Acceso biométrico configurado correctamente', 'success');
        }
        setTimeout(() => {
          onClose();
          onAuthSuccess(authResponse);
        }, 1200);
      } else {
        throw new Error('No se pudo verificar el registro biométrico.');
      }
    } catch (err: any) {
      console.warn('[Passkey Setup Error]:', err);
      const isBiometricStep = step === 'registering';
      if (isBiometricStep) {
        setStep('failed');
        setErrorMsg(err.message || 'No se pudo configurar el acceso biométrico.');
      } else {
        setErrorMsg(err.message || 'Credenciales inválidas. Por favor verifique sus datos.');
      }
      setIsLoading(false);
    }
  };

  const handleRetryBiometrics = async () => {
    setErrorMsg(null);
    setStep('registering');
    try {
      const { registerPasskey } = await import('../services/passkeyService');
      const regRes = await registerPasskey(actorType);

      if (regRes && regRes.success) {
        setStep('success');
        if (onAddNotification) {
          onAddNotification('Acceso biométrico configurado correctamente', 'success');
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        throw new Error('No se pudo verificar el registro biométrico.');
      }
    } catch (err: any) {
      setStep('failed');
      setErrorMsg(err.message || 'No se pudo configurar el acceso biométrico.');
    }
  };

  const getPortalLabel = () => {
    switch (actorType) {
      case 'admin':
        return 'Administración';
      case 'client':
        return 'Mundo Kalu Cliente';
      case 'producer':
        return 'Mundo Kalu Productor';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700/80 p-6 sm:p-8 shadow-2xl text-center relative animate-in zoom-in-95">
        
        {/* Botón X de Cierre */}
        <button
          type="button"
          onClick={handleCancel}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>

        {/* Icono de Huella */}
        <div className="w-16 h-16 rounded-2xl bg-brand-accent/10 border border-brand-accent/20 mx-auto flex items-center justify-center mb-4 text-brand-accent shadow-lg shadow-brand-accent/5">
          <Fingerprint size={32} className={step === 'registering' ? 'animate-pulse text-emerald-400' : ''} />
        </div>

        {/* PASO 1: INTRODUCCIÓN CON EXPLICACIÓN Y DOS ACCIONES */}
        {step === 'intro' && (
          <>
            <h3 className="text-xl font-bold text-white mb-2 font-display">
              Acceso Biométrico
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
              Inicia sesión una vez con tus datos para vincular la huella o biometría de este dispositivo a tu cuenta de <strong className="text-white">{getPortalLabel()}</strong>.
            </p>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleStartSetup}
                className="w-full py-3 px-4 rounded-xl bg-brand-accent hover:brightness-110 text-slate-950 font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Fingerprint size={16} />
                <span>Configurar Huella</span>
              </button>

              <button
                type="button"
                onClick={handleCancel}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-semibold text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {/* PASO 2: FORMULARIO DE CREDENCIALES SEGÚN LA PUERTA */}
        {step === 'credentials' && (
          <form onSubmit={handleCredentialSubmit} className="text-left space-y-4">
            <div className="text-center mb-2">
              <h3 className="text-lg font-bold text-white font-display">
                Validar Identidad
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Ingresa tus credenciales habituales de {getPortalLabel()}
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
                <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {actorType === 'admin' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block ml-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@empresa.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-brand-accent font-sans placeholder:text-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block ml-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-brand-accent font-mono placeholder:text-slate-600"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block ml-1">
                    Cédula, Celular o Identificador
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isLoading}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Ingresa tu identificación"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-brand-accent font-sans placeholder:text-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block ml-1">
                    PIN de Acceso
                  </label>
                  <input
                    type="password"
                    required
                    disabled={isLoading}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-brand-accent font-mono placeholder:text-slate-600"
                  />
                </div>
              </>
            )}

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-brand-accent hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isLoading ? 'Verificando...' : 'Verificar e Iniciar Registro'}</span>
              </button>

              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                className="w-full py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-semibold text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* PASO 3: REGISTRANDO BIOMETRÍA EN EL DISPOSITIVO */}
        {step === 'registering' && (
          <div className="space-y-4 py-4">
            <h3 className="text-lg font-bold text-white font-display">
              Escanea tu Huella
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              Usa el sensor biométrico, lector de huellas o Windows Hello de tu dispositivo para vincular esta clave.
            </p>
            <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto my-4" />
            <p className="text-[11px] text-slate-400 font-mono">Esperando confirmación del dispositivo...</p>
          </div>
        )}

        {/* PASO 4: FALLO EN WINDOWS HELLO / REGISTRO PASSKEY */}
        {step === 'failed' && (
          <div className="space-y-4 py-2">
            <h3 className="text-lg font-bold text-rose-400 font-display">
              No se pudo configurar el acceso biométrico
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              {errorMsg || 'La captura biométrica fue cancelada o no se completó en este dispositivo.'}
            </p>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleRetryBiometrics}
                className="w-full py-3 px-4 rounded-xl bg-brand-accent hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <Fingerprint size={16} />
                <span>Intentar de nuevo</span>
              </button>

              <button
                type="button"
                onClick={handleCancel}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-semibold text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* PASO 5: ÉXITO */}
        {step === 'success' && (
          <div className="space-y-4 py-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <ShieldCheck size={28} />
            </div>
            <h3 className="text-lg font-bold text-emerald-400 font-display">
              Acceso biométrico configurado correctamente
            </h3>
            <p className="text-slate-300 text-xs">
              Ingresando a tu cuenta...
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

/**
 * Banner no invasivo post-login para invitar al usuario a registrar su passkey si su navegador lo soporta
 */
interface PasskeyRegisterPromptProps {
  actorType: PasskeyActorType;
  onRegistered?: () => void;
  onDismiss?: () => void;
}

export function PasskeyRegisterPrompt({
  actorType,
  onRegistered,
  onDismiss
}: PasskeyRegisterPromptProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done || hasLocalPasskeyHint(actorType) || !browserSupportsPasskeys()) {
    return null;
  }

  const handleRegister = async () => {
    setIsRegistering(true);
    setError(null);
    try {
      const { registerPasskey } = await import('../services/passkeyService');
      const res = await registerPasskey(actorType);
      if (res.success) {
        setDone(true);
        if (onRegistered) onRegistered();
      }
    } catch (err: any) {
      setError(err.message || 'Error al registrar biometría');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="w-full p-4 mb-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-slate-900/80 border border-emerald-500/30 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
          <Fingerprint size={22} />
        </div>
        <div className="text-left">
          <h4 className="text-sm font-semibold text-white">¿Activar acceso con huella?</h4>
          <p className="text-xs text-slate-400">Inicia sesión más rápido y seguro en este dispositivo la próxima vez.</p>
          {error && <span className="text-[11px] text-rose-400 block mt-0.5">{error}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            Ahora no
          </button>
        )}
        <button
          type="button"
          onClick={handleRegister}
          disabled={isRegistering}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          <Fingerprint size={14} />
          <span>{isRegistering ? 'Registrando...' : 'Activar huella'}</span>
        </button>
      </div>
    </div>
  );
}
