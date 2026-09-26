import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn
} from '@simplewebauthn/browser';
import { API_URL, getCsrfToken } from './localApi';

export type PasskeyActorType = 'admin' | 'client' | 'producer';

const HINT_KEY_PREFIX = 'kalu_passkey_enabled_';

/**
 * Comprueba si el navegador actual soporta WebAuthn / Passkeys nativas.
 */
export function browserSupportsPasskeys(): boolean {
  try {
    return typeof window !== 'undefined' && browserSupportsWebAuthn();
  } catch (e) {
    return false;
  }
}

/**
 * Consulta el hint visual guardado en localStorage para decidir la experiencia de entrada.
 * NOTA: Solo decide la interfaz visual. NUNCA decide autorización.
 */
export function hasLocalPasskeyHint(actorType: PasskeyActorType): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`${HINT_KEY_PREFIX}${actorType}`) === 'true';
  } catch (e) {
    return false;
  }
}

/**
 * Guarda el hint en localStorage indicando que este dispositivo tiene passkey registrada.
 */
export function setLocalPasskeyHint(actorType: PasskeyActorType): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${HINT_KEY_PREFIX}${actorType}`, 'true');
  } catch (e) {
    console.warn('[Passkey] Error saving local passkey hint:', e);
  }
}

/**
 * Limpia el hint de localStorage si el usuario o error lo requiere.
 */
export function clearLocalPasskeyHint(actorType: PasskeyActorType): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${HINT_KEY_PREFIX}${actorType}`);
  } catch (e) {
    console.warn('[Passkey] Error clearing local passkey hint:', e);
  }
}

/**
 * Inicia el proceso de registro de una nueva Passkey / Huella en el dispositivo actual.
 * Requiere que el usuario ya tenga una sesión activa en el backend.
 */
export async function registerPasskey(actorType: PasskeyActorType): Promise<{ success: boolean; credentialId?: string }> {
  if (!browserSupportsPasskeys()) {
    throw new Error('Tu navegador o dispositivo no soporta autenticación biométrica WebAuthn.');
  }

  const csrf = await getCsrfToken();

  // 1. Obtener opciones de registro desde el backend
  const optionsRes = await fetch(`${API_URL}/auth/passkey/registration-options`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include'
  });

  if (!optionsRes.ok) {
    const errData = await optionsRes.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al iniciar el registro de biometría en el servidor.');
  }

  const creationOptions = await optionsRes.json();

  // 2. Invocar el diálogo nativo del sistema operativo / Windows Hello / Sensor biométrico
  let registrationResponse;
  try {
    registrationResponse = await startRegistration({ optionsJSON: creationOptions });
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.message?.includes('cancelled') || err.message?.includes('abort')) {
      throw new Error('Operación biométrica cancelada por el usuario.');
    }
    throw new Error(err.message || 'Error al capturar la credencial biométrica en el dispositivo.');
  }

  // 3. Enviar la credencial pública al backend para verificación y almacenamiento
  const verifyRes = await fetch(`${API_URL}/auth/passkey/registration-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf
    },
    credentials: 'include',
    body: JSON.stringify(registrationResponse)
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.verified) {
    throw new Error(verifyData.error || 'No se pudo verificar la credencial biométrica en el servidor.');
  }

  // Guardar hint local tras registro exitoso
  setLocalPasskeyHint(actorType);

  return {
    success: true,
    credentialId: verifyData.credentialId
  };
}

/**
 * Autentica al usuario mediante Passkey / Biometría (Discoverable Credential / Passwordless).
 * No requiere que el usuario ingrese correo, cédula ni PIN de antemano.
 */
export async function authenticateWithPasskey(actorType: PasskeyActorType): Promise<{
  success: boolean;
  actorType: PasskeyActorType;
  user?: any;
  portalUser?: any;
  csrfToken?: string;
}> {
  if (!browserSupportsPasskeys()) {
    throw new Error('Tu dispositivo no soporta autenticación biométrica.');
  }

  // 1. Obtener opciones de autenticación
  const optionsRes = await fetch(`${API_URL}/auth/passkey/authentication-options`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ portalType: actorType })
  });

  if (!optionsRes.ok) {
    const errData = await optionsRes.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al obtener opciones de autenticación biométrica.');
  }

  const requestOptions = await optionsRes.json();

  // 2. Invocar el diálogo nativo de biometría del sistema operativo
  let authResponse;
  try {
    authResponse = await startAuthentication({ optionsJSON: requestOptions });
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.message?.includes('cancelled') || err.message?.includes('abort')) {
      throw new Error('Autenticación biométrica cancelada.');
    }
    // Si la credencial ya no existe en el dispositivo o no hay credenciales
    if (err.name === 'InvalidStateError' || err.message?.includes('no credentials')) {
      clearLocalPasskeyHint(actorType);
    }
    throw new Error(err.message || 'Error durante la lectura biométrica.');
  }

  // 3. Verificar en backend y establecer sesión real
  const verifyRes = await fetch(`${API_URL}/auth/passkey/authentication-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(authResponse)
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.authenticated) {
    // Si el servidor confirma que la credencial no existe en base de datos
    if (verifyRes.status === 401 && verifyData.error?.includes('no encontrada')) {
      clearLocalPasskeyHint(actorType);
    }
    throw new Error(verifyData.error || 'Fallo de autenticación biométrica.');
  }

  // Actualizar hint local por seguridad
  setLocalPasskeyHint(actorType);

  return verifyData;
}
