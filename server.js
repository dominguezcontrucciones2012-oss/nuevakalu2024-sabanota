import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno con prioridad para desarrollo seguro
const isProd = process.env.NODE_ENV === 'production';
const envFiles = isProd
  ? [path.join(__dirname, '.env')]
  : [
      path.join(__dirname, '.env.development.local'),
      path.join(__dirname, '.env.local'),
      path.join(__dirname, '.env.development'),
      path.join(__dirname, '.env')
    ];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
}
dotenv.config(); // Cargar también fallback general

// Inicializar cliente de Google Gemini para el Backend / Robot Kalu (Fase 1E-A)
// Solo usa process.env.GEMINI_API_KEY (Server-side exclusivo, nunca del cliente)
let geminiApiKey = process.env.GEMINI_API_KEY || '';
let ai = (geminiApiKey && !geminiApiKey.startsWith('mock') && !geminiApiKey.startsWith('dummy') && !geminiApiKey.startsWith('test'))
  ? new GoogleGenAI({ apiKey: geminiApiKey })
  : null;

// Helper para pruebas y mocking controlado del cliente Gemini backend
function setGeminiClientForTest(customAiClient) {
  ai = customAiClient;
}

function getGeminiClient() {
  return ai;
}

function isGeminiConfigured() {
  return Boolean(ai);
}

const isDevEnv = process.env.NODE_ENV === 'development' || !isProd;
const mailMode = process.env.MAIL_MODE || (isDevEnv ? 'development' : 'production');
const waMode = process.env.WHATSAPP_MODE || (isDevEnv ? 'simulation' : 'production');

// ============================================================
// CONFIGURACIÓN DE DIRECTORIOS Y ALMACENAMIENTO SEGURO (FASE 1F-B)
// ============================================================

// 1. DATA_DIR: Directorio privado donde residen las bases de datos JSON (NO expuesto por Express)
const defaultDataDir = isDevEnv ? path.join(__dirname, 'data-dev') : path.join(__dirname, 'data');
const dataDir = process.env.DATA_DIR || defaultDataDir;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 2. UPLOAD_DIR: Directorio exclusivo para assets estáticos públicos (imágenes, banners, etc.)
const defaultUploadDir = isDevEnv ? path.join(__dirname, 'data-dev', 'uploads') : path.join(__dirname, 'uploads');
const uploadDir = process.env.UPLOAD_DIR || defaultUploadDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 3. BACKUP_DIR: Directorio privado para copias de seguridad de colecciones
const backupsDir = process.env.BACKUP_DIR || path.join(dataDir, 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// Validación de seguridad estricta: DATA_DIR y UPLOAD_DIR NUNCA deben coincidir
if (path.resolve(dataDir) === path.resolve(uploadDir)) {
  const securityError = new Error('[FATAL SECURITY MISCONFIGURATION] DATA_DIR y UPLOAD_DIR no pueden ser el mismo directorio. Esto expondría las bases de datos en la web pública.');
  console.error(securityError.message);
  throw securityError;
}

console.log('----------------------------------------------------');
console.log(`🌐 ENTORNO: ${isDevEnv ? 'DESARROLLO LOCAL (KALU-DEV)' : 'PRODUCCIÓN'}`);
console.log('🤖 ESTADO DEL ROBOT DE COMUNICACIONES:');
console.log('📧 Correo Emisor:', mailMode === 'development' ? 'MODO SIMULACIÓN (DEV - Solo consola)' : (process.env.EMAIL_USER ? `SÍ (${process.env.EMAIL_USER})` : 'SÍ (Fallback: cherokejd566@gmail.com)'));
console.log('🔑 Contraseña Correo (.env):', mailMode === 'development' ? 'PROTEGIDA (Simulación DEV activa)' : (process.env.EMAIL_PASS ? 'SÍ (Presente)' : '❌ NO DETECTADA'));
console.log('📱 WhatsApp API:', waMode === 'simulation' ? 'MODO SIMULACIÓN (DEV - Solo consola)' : (process.env.WHATSAPP_API_URL || process.env.WHATSAPP_API_KEY ? 'SÍ (Producción)' : 'Modo Simulación / Local'));
console.log('📂 Directorio de Datos / DB (Privado):', dataDir);
console.log('🖼️  Directorio de Uploads / Assets (Público):', uploadDir);
console.log('----------------------------------------------------');

// --- CONFIGURACIÓN DE CORS Y ORIGINS PERMITIDOS (FASE 1D-D.2) ---
const rawAllowedOrigins = process.env.SOCKET_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '';
const configuredOrigins = rawAllowedOrigins
  ? rawAllowedOrigins.split(',').map(s => s.trim()).filter(Boolean)
  : [];

// Origins de desarrollo locales permitidos por defecto cuando !isProd
const defaultDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

function isOriginAllowed(origin) {
  // Peticiones locales o server-to-server sin cabecera origin (curl, apps móviles nativas, testing)
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;
  if (!isProd && defaultDevOrigins.includes(origin)) return true;
  return false;
}

const PORT = process.env.PORT || 3001;

const app = express();

// ============================================================
// BASELINE DE CABECERAS DE SEGURIDAD HTTP — FASE 1F-C
// ============================================================

// Deshabilitar cabecera que expone la tecnología subyacente
app.disable('x-powered-by');

// Middleware global de Security Headers (CSP, HSTS, X-Content-Type-Options, etc.)
app.use((req, res, next) => {
  // 1. Prevención estricta de MIME-Sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 2. Control de Clickjacking y embedding en frames
  res.setHeader('X-Frame-Options', 'DENY');

  // 3. Política de Referrer segura y compatible
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 4. Permissions-Policy (restringe APIs sensibles del navegador que no usa la app)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()');

  // 5. Cross-Origin Resource & Embedder Policies seguras
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // 6. Strict-Transport-Security (HSTS)
  // Solo se emite cuando la conexión es efectivamente HTTPS o se está en producción estricta
  if (isProd || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 7. Content-Security-Policy (CSP) personalizada para el ecosistema Kalu CRM
  // Directivas adaptadas a React, Socket.IO, Google Fonts, y almacenamiento de assets
  // connect-src estrictamente delimitado a orígenes autorizados (sin comodines globales https: ni wss:)
  const devConnectOrigins = [
    "'self'",
    'ws://localhost:3000',
    'ws://127.0.0.1:3000',
    'ws://localhost:3001',
    'ws://127.0.0.1:3001',
    'ws://localhost:5173',
    'ws://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];

  const connectSrcDirective = isProd
    ? (configuredOrigins.length > 0
        ? `connect-src 'self' ${configuredOrigins.join(' ')} ${configuredOrigins.map(o => o.replace(/^http/, 'ws')).join(' ')}`
        : "connect-src 'self'")
    : `connect-src ${devConnectOrigins.join(' ')}${configuredOrigins.length > 0 ? ' ' + configuredOrigins.join(' ') : ''}`;

  const cspDirectives = [
    "default-src 'self'",
    // Scripts: origen propio y ejecución SPA
    "script-src 'self'",
    // Estilos: origen propio, Google Fonts y estilos dinámicos de Tailwind/React
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Fuentes: origen propio, data URIs y Google Fonts (gstatic)
    "font-src 'self' data: https://fonts.gstatic.com",
    // Imágenes: origen propio, datos, blobs, assets de Google (Login) y QR Generator
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://api.qrserver.com",
    // Medios (Audio/Video/PDF): origen propio, data y blob
    "media-src 'self' data: blob:",
    // Conexiones: API propia y Socket.IO sin wildcard de protocolo
    connectSrcDirective,
    // Workers / Manifest
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // Bloqueo estricto de plugins/objetos ejecutables y embedding
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin no permitido por política CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

app.use(cors({
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origin no permitido por política CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

const SESSION_SECRET = process.env.SESSION_SECRET || 'kalu_dev_session_secret_2026_super_safe_and_random';

// Configuración de sesiones server-side (MemoryStore para DEV, modular para SQLite/Redis en producción)
const sessionMiddleware = session({
  name: '__kalu_sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas de vigencia
  }
});

app.use(sessionMiddleware);

// Compartir la sesión Express con Socket.IO para autenticación en handshake (Fase 1D-D.1)
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, (err) => {
    if (err) return next(err);
    next();
  });
});

// Middleware de autenticación e identidad de Socket.IO (Fase 1D-D.1)
io.use((socket, next) => {
  const session = socket.request.session;
  const identity = {
    isAnonymous: true,
    crm: null,
    portal: null
  };

  if (!session) {
    socket.data.identity = identity;
    return next();
  }

  // 1. Validar identidad CRM si existe en sesión
  if (session.userId) {
    const users = readCollection('users');
    const user = users.find(u => String(u.id) === String(session.userId));
    if (user && user.active) {
      identity.crm = {
        userId: String(user.id),
        role: String(user.role).toLowerCase(),
        name: user.name || ''
      };
      identity.isAnonymous = false;
    }
  }

  // 2. Validar identidad Portal si existe en sesión
  if (session.portalUser && session.portalUser.id) {
    const portalType = String(session.portalUser.type || '').toLowerCase();
    const portalId = String(session.portalUser.id);

    if (portalType === 'client') {
      const clients = readCollection('clients');
      const client = clients.find(c => String(c.id) === portalId);
      if (client && (!client.status || client.status === 'active')) {
        identity.portal = {
          type: 'client',
          id: String(client.id),
          name: client.name || ''
        };
        identity.isAnonymous = false;
      }
    } else if (portalType === 'producer' || portalType === 'supplier') {
      const suppliers = readCollection('suppliers');
      const supplier = suppliers.find(s => String(s.id) === portalId);
      if (supplier && (!supplier.status || supplier.status === 'active')) {
        identity.portal = {
          type: 'producer',
          id: String(supplier.id),
          name: supplier.name || ''
        };
        identity.isAnonymous = false;
      }
    }
  }

  // Guardar contexto sanitizado en socket.data.identity (Inmutable por el cliente)
  socket.data.identity = identity;
  next();
});

// ============================================================
// REGISTRO Y GESTIÓN DE CICLO DE VIDA DE SOCKETS (FASE 1D-D.3)
// ============================================================

// Registro efímero en memoria de sockets activos indexados por sessionId
// sessionId -> Set<Socket>
const activeSessionSockets = new Map();

function registerSocketSession(socket) {
  const sessionId = socket.request?.session?.id || socket.request?.sessionID;
  if (!sessionId) return;

  if (!activeSessionSockets.has(sessionId)) {
    activeSessionSockets.set(sessionId, new Set());
  }
  activeSessionSockets.get(sessionId).add(socket);
}

function unregisterSocketSession(socket) {
  const sessionId = socket.request?.session?.id || socket.request?.sessionID;
  if (!sessionId) return;

  const socketSet = activeSessionSockets.get(sessionId);
  if (socketSet) {
    socketSet.delete(socket);
    if (socketSet.size === 0) {
      activeSessionSockets.delete(sessionId);
    }
  }
}

/**
 * Invalida todos los sockets asociados a una sesión destruida o cerrada (CRM logout)
 */
function invalidateSessionSockets(sessionId) {
  if (!sessionId) return;
  const socketSet = activeSessionSockets.get(sessionId);
  if (socketSet && socketSet.size > 0) {
    for (const s of socketSet) {
      try {
        s.disconnect(true);
      } catch (err) {
        console.error('[Socket Lifecycle] Error desconectando socket:', err);
      }
    }
    activeSessionSockets.delete(sessionId);
  }
}

/**
 * Remueve privilegios y rooms de portal de todos los sockets de una sesión (Portal logout)
 * Si la sesión coexiste con CRM, no desconecta el socket ni altera rooms CRM.
 * Si la sesión era exclusiva de portal, desconecta los sockets.
 */
function purgePortalSocketPrivileges(sessionId, isCoexistingWithCrm = false) {
  if (!sessionId) return;
  const socketSet = activeSessionSockets.get(sessionId);
  if (socketSet && socketSet.size > 0) {
    for (const s of socketSet) {
      try {
        if (isCoexistingWithCrm) {
          // Remover exclusivamente rooms de portal
          const portalRooms = Array.from(s.rooms || []).filter(r => r.startsWith('room:portal:'));
          for (const pr of portalRooms) {
            s.leave(pr);
          }
          if (s.data && s.data.identity) {
            s.data.identity.portal = null;
          }
        } else {
          // Sesión exclusiva de portal: desconectar limpiamente
          s.disconnect(true);
        }
      } catch (err) {
        console.error('[Socket Lifecycle] Error purgando privilegios de portal:', err);
      }
    }
    if (!isCoexistingWithCrm) {
      activeSessionSockets.delete(sessionId);
    }
  }
}

// Handler de conexión de Socket.IO con asignación automática de rooms según identidad (Fases 1D-D.1, 1D-D.2 y 1D-D.3)
io.on('connection', (socket) => {
  const identity = socket.data?.identity || { isAnonymous: true, crm: null, portal: null };

  // Registrar socket en el registry de sesiones activas
  registerSocketSession(socket);

  // 1. Unirse siempre a la room pública base
  socket.join('room:public');

  // 2. Unirse a rooms correspondientes de CRM
  if (identity.crm) {
    const role = String(identity.crm.role || '').toLowerCase();
    socket.join('room:crm:staff');
    if (role === 'admin') {
      socket.join('room:crm:admin');
    }
  }

  // 3. Unirse a rooms correspondientes de Portal
  if (identity.portal) {
    const portalType = String(identity.portal.type || '').toLowerCase();
    const portalId = String(identity.portal.id || '');
    if (portalType === 'client' && portalId) {
      socket.join(`room:portal:client:${portalId}`);
    } else if (portalType === 'producer' && portalId) {
      socket.join(`room:portal:producer:${portalId}`);
    }
  }

  // Limpieza al desconectarse
  socket.on('disconnect', () => {
    unregisterSocketSession(socket);
  });
});

// Rate limiter específico para Login (10 intentos fallidos por cada ventana de 15 minutos)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de autenticación fallidos. Por favor espere 15 minutos antes de intentar de nuevo.'
  }
});

// Middleware para asegurar la existencia del token CSRF en la sesión
app.use((req, res, next) => {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Verificación segura de credenciales con bcrypt
function verifyCredential(input, hash) {
  if (!input || !hash) return false;
  try {
    return bcrypt.compareSync(String(input), String(hash));
  } catch (e) {
    return false;
  }
}

// ============================================================
// MIDDLEWARES DE AUTORIZACIÓN SERVER-SIDE (RBAC) (FASE 1B)
// ============================================================

/**
 * Middleware requireAuth:
 * Verifica que exista una sesión activa en el servidor.
 * Obtiene la identidad directamente de req.session (NUNCA de headers/body del cliente).
 * Si no está autenticado, devuelve 401 Unauthorized.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const users = readCollection('users');
  const user = users.find(u => String(u.id) === String(req.session.userId));

  if (!user || !user.active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Sesión inválida o usuario inactivo' });
  }

  // Adjuntar la identidad sanitizada en req.user para los siguientes middlewares/handlers
  req.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    cedula: user.cedula,
    initials: user.initials || (user.name ? user.name.slice(0, 2).toUpperCase() : 'US')
  };

  next();
}

/**
 * Middleware requireRole(...allowedRoles):
 * Valida que el rol del usuario autenticado coincida con alguno de los roles permitidos.
 * Debe ejecutarse tras requireAuth.
 * Si el usuario no tiene el rol permitido, devuelve 403 Forbidden.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Autenticación requerida' });
    }

    const userRole = String(req.user.role).toLowerCase();
    const hasRole = allowedRoles.some(r => String(r).toLowerCase() === userRole);

    if (!hasRole) {
      return res.status(403).json({
        error: 'Acceso denegado: permisos insuficientes para esta operación',
        requiredRoles: allowedRoles
      });
    }

    next();
  };
}

// Rate limiter específico para Login de Portal (10 intentos fallidos por cada 15 minutos)
const portalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de acceso al portal. Por favor espere 15 minutos.'
  }
});

// ============================================================
// RECOVERY CORE MODULE — FASE 1D-C.1 (SERVER-SIDE CORE)
// ============================================================
/**
 * RECOVERY STORE (DEV/TEST IN-MEMORY STORE)
 * NOTE: DEV/TEST ONLY — production requires a persistent/shared recovery store (e.g. Redis/Encrypted DB).
 *
 * Estructura de un challenge:
 * challengeId -> {
 *   challengeId: string,
 *   portalType: 'client' | 'producer',
 *   targetId: string,
 *   targetName: string,
 *   channel: 'email' | 'whatsapp',
 *   recipientMasked: string,
 *   codeHash: string,
 *   expiresAt: number,
 *   attempts: number,
 *   maxAttempts: number,
 *   consumed: boolean,
 *   createdAt: number
 * }
 *
 * Estructura de un reset token:
 * resetToken -> {
 *   token: string,
 *   tokenHash: string,
 *   portalType: 'client' | 'producer',
 *   targetId: string,
 *   expiresAt: number,
 *   consumed: boolean,
 *   createdAt: number
 * }
 */
const recoveryChallengeStore = new Map();
const recoveryResetTokenStore = new Map();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_OTP_ATTEMPTS = 3;

/**
 * Helper criptográfico para hash seguro de secreto efímero (OTP / Reset Token)
 * Utiliza SHA-256 con salt interno derivado del SESSION_SECRET.
 */
function hashEphemeralSecret(secret, saltKey = '') {
  const secretKey = process.env.SESSION_SECRET || 'kalu_secure_session_secret_default_2026';
  return crypto.createHmac('sha256', secretKey)
    .update(`${saltKey}:${String(secret)}`)
    .digest('hex');
}

/**
 * Helper de comparación segura en tiempo constante contra timing attacks
 */
function safeTimingCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Limpieza periódica de challenges y tokens expirados en memoria
 */
function cleanupRecoveryStore() {
  const now = Date.now();
  for (const [id, ch] of recoveryChallengeStore.entries()) {
    if (now > ch.expiresAt || ch.consumed || ch.attempts >= ch.maxAttempts) {
      recoveryChallengeStore.delete(id);
    }
  }
  for (const [tok, rt] of recoveryResetTokenStore.entries()) {
    if (now > rt.expiresAt || rt.consumed) {
      recoveryResetTokenStore.delete(tok);
    }
  }
}

// Ejecutar limpieza cada 5 minutos
setInterval(cleanupRecoveryStore, 5 * 60 * 1000).unref();

/**
 * Helper para enmascarar teléfonos (+58***1234) o correos (u***@domain.com)
 */
function maskRecipient(channel, recipient) {
  if (!recipient) return '';
  const str = String(recipient).trim();
  if (channel === 'email') {
    const parts = str.split('@');
    if (parts.length !== 2) return '***@***';
    const name = parts[0];
    const domain = parts[1];
    const visibleStart = name.length > 2 ? name.slice(0, 2) : name.slice(0, 1);
    return `${visibleStart}***@${domain}`;
  } else {
    // Phone
    const digits = str.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `+58***${last4}`;
  }
}

/**
 * 1. createRecoveryChallenge({ portalType, targetId, targetName, channel, recipient })
 * Genera un OTP criptográficamente seguro (CSPRNG), almacena su hash con TTL y binding de identidad.
 * Retorna { challengeId, recipientMasked, expiresAt, otpForDelivery }
 * NOTA: otpForDelivery se entrega exclusivamente al caller interno para el despacho por pasarela/simulación.
 */
function createRecoveryChallenge({ portalType, targetId, targetName, channel, recipient }) {
  if (!['client', 'producer'].includes(portalType)) {
    throw new Error('Tipo de portal no válido para recuperación');
  }
  if (!targetId || !channel || !recipient) {
    throw new Error('Parámetros de challenge incompletos');
  }

  // Generar OTP de 6 dígitos numéricos usando CSPRNG nativo
  const otpNumber = crypto.randomInt(100000, 1000000);
  const otpPlain = String(otpNumber);

  const challengeId = `rec-ch-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
  const codeHash = hashEphemeralSecret(otpPlain, `${challengeId}:${portalType}:${targetId}`);
  const now = Date.now();
  const expiresAt = now + OTP_TTL_MS;

  const challengeDoc = {
    challengeId,
    portalType,
    targetId: String(targetId),
    targetName: String(targetName || ''),
    channel,
    recipient: String(recipient),
    recipientMasked: maskRecipient(channel, recipient),
    codeHash,
    expiresAt,
    attempts: 0,
    maxAttempts: MAX_OTP_ATTEMPTS,
    consumed: false,
    createdAt: now
  };

  recoveryChallengeStore.set(challengeId, challengeDoc);

  return {
    challengeId,
    recipientMasked: challengeDoc.recipientMasked,
    expiresAt,
    otpForDelivery: otpPlain // Se devuelve SOLO para que el transportador interno lo envíe
  };
}

/**
 * 2. verifyRecoveryCode({ challengeId, portalType, targetId, code })
 * Valida un código OTP contra el challenge almacenado.
 * Si es válido: invalida el challenge (single-use) y genera un resetToken temporal.
 * Si es inválido: incrementa intentos (invalida al 3er fallo) y rechaza.
 */
function verifyRecoveryCode({ challengeId, portalType, targetId, code }) {
  const challenge = recoveryChallengeStore.get(challengeId);
  if (!challenge) {
    return { success: false, error: 'Challenge no encontrado o expirado', code: 'CHALLENGE_NOT_FOUND' };
  }

  const now = Date.now();
  if (now > challenge.expiresAt) {
    recoveryChallengeStore.delete(challengeId);
    return { success: false, error: 'Código de recuperación expirado', code: 'EXPIRED' };
  }

  if (challenge.consumed) {
    recoveryChallengeStore.delete(challengeId);
    return { success: false, error: 'Código ya utilizado previamente', code: 'ALREADY_CONSUMED' };
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    recoveryChallengeStore.delete(challengeId);
    return { success: false, error: 'Límite de intentos superado', code: 'MAX_ATTEMPTS_EXCEEDED' };
  }

  // Comprobar coincidencia estricta de tipo de portal y targetId
  if (challenge.portalType !== portalType || String(challenge.targetId) !== String(targetId)) {
    return { success: false, error: 'Identidad no coincide con el challenge', code: 'IDENTITY_MISMATCH' };
  }

  const inputHash = hashEphemeralSecret(String(code || '').trim(), `${challengeId}:${portalType}:${targetId}`);
  const isMatch = safeTimingCompare(inputHash, challenge.codeHash);

  if (!isMatch) {
    challenge.attempts += 1;
    if (challenge.attempts >= challenge.maxAttempts) {
      challenge.consumed = true;
      recoveryChallengeStore.delete(challengeId);
      return { success: false, error: 'Demasiados intentos incorrectos. Challenge invalidado.', code: 'LOCKED', attempts: challenge.attempts };
    }
    return { success: false, error: 'Código de verificación incorrecto', code: 'INVALID_CODE', attemptsRemaining: challenge.maxAttempts - challenge.attempts };
  }

  // Código correcto: invalidar inmediatamente el challenge (single-use)
  challenge.consumed = true;
  recoveryChallengeStore.delete(challengeId);

  // Generar reset token efímero vinculado a la identidad
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashEphemeralSecret(rawToken, `reset:${portalType}:${targetId}`);
  const tokenExpiresAt = now + RESET_TOKEN_TTL_MS;

  const resetDoc = {
    token: rawToken,
    tokenHash,
    portalType,
    targetId: String(targetId),
    expiresAt: tokenExpiresAt,
    consumed: false,
    createdAt: now
  };

  recoveryResetTokenStore.set(rawToken, resetDoc);

  return {
    success: true,
    resetToken: rawToken,
    expiresAt: tokenExpiresAt,
    portalType,
    targetId: challenge.targetId
  };
}

/**
 * 3. consumeResetToken({ resetToken, portalType, targetId })
 * Valida que un resetToken sea válido, esté dentro del TTL, coincida con la identidad y no haya sido consumido.
 * Lo marca como consumido inmediatamente.
 */
function consumeResetToken({ resetToken, portalType, targetId }) {
  cleanupRecoveryStore();

  if (!resetToken || typeof resetToken !== 'string') {
    return { success: false, error: 'Token de reseteo inválido', code: 'INVALID_TOKEN' };
  }

  const resetDoc = recoveryResetTokenStore.get(resetToken);
  if (!resetDoc) {
    return { success: false, error: 'Token de reseteo no encontrado o expirado', code: 'TOKEN_NOT_FOUND' };
  }

  const now = Date.now();
  if (now > resetDoc.expiresAt) {
    recoveryResetTokenStore.delete(resetToken);
    return { success: false, error: 'Token de reseteo expirado', code: 'EXPIRED' };
  }

  if (resetDoc.consumed) {
    recoveryResetTokenStore.delete(resetToken);
    return { success: false, error: 'Token de reseteo ya utilizado', code: 'ALREADY_CONSUMED' };
  }

  if (resetDoc.portalType !== portalType || String(resetDoc.targetId) !== String(targetId)) {
    return { success: false, error: 'Token no coincide con la identidad especificada', code: 'IDENTITY_MISMATCH' };
  }

  // Consumir token
  resetDoc.consumed = true;
  recoveryResetTokenStore.delete(resetToken);

  return {
    success: true,
    portalType: resetDoc.portalType,
    targetId: resetDoc.targetId
  };
}

/**
 * 4. invalidateRecoveryChallenge(challengeId)
 * Permite invalidar explícitamente un challenge activo
 */
function invalidateRecoveryChallenge(challengeId) {
  if (challengeId && recoveryChallengeStore.has(challengeId)) {
    recoveryChallengeStore.delete(challengeId);
    return true;
  }
  return false;
}

// Rate Limiters dedicados para el subsistema de recuperación
const recoveryRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Máximo 5 solicitudes fallidas por IP en 15 minutos
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas solicitudes de recuperación. Por favor espere 15 minutos.'
  }
});

const recoveryVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Máximo 10 intentos de verificación fallidos por IP en 15 minutos
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de verificación. Por favor espere 15 minutos.'
  }
});

/**
 * Middleware requirePortalAuth (Fase 1D-A):
 * Verifica que exista una identidad portal activa en req.session.portalUser.
 * Valida la existencia y estado activo del cliente o productor.
 * Adjunta la identidad sanitizada en req.portalUser.
 */
function requirePortalAuth(req, res, next) {
  if (!req.session || !req.session.portalUser || !req.session.portalUser.id) {
    return res.status(401).json({ error: 'No autenticado en portal' });
  }

  const { type, id } = req.session.portalUser;
  if (type === 'client') {
    const clients = readCollection('clients');
    const client = clients.find(c => String(c.id) === String(id));
    if (!client || (client.status && client.status !== 'active')) {
      delete req.session.portalUser;
      return res.status(401).json({ error: 'Sesión de portal inválida o cliente inactivo' });
    }
    req.portalUser = {
      type: 'client',
      id: client.id,
      name: client.name
    };
  } else if (type === 'producer' || type === 'supplier') {
    const suppliers = readCollection('suppliers');
    const supplier = suppliers.find(s => String(s.id) === String(id));
    if (!supplier || (supplier.status && supplier.status !== 'active')) {
      delete req.session.portalUser;
      return res.status(401).json({ error: 'Sesión de portal inválida o productor inactivo' });
    }
    req.portalUser = {
      type: 'producer',
      id: supplier.id,
      name: supplier.name
    };
  } else {
    delete req.session.portalUser;
    return res.status(401).json({ error: 'Tipo de portal inválido' });
  }

  next();
}

function requirePortalType(...allowedTypes) {
  return (req, res, next) => {
    if (!req.portalUser || !req.portalUser.type) {
      return res.status(401).json({ error: 'Autenticación de portal requerida' });
    }
    const currentType = String(req.portalUser.type).toLowerCase();
    const isAllowed = allowedTypes.some(t => String(t).toLowerCase() === currentType);
    if (!isAllowed) {
      return res.status(403).json({
        error: `Acceso denegado: tipo de portal '${currentType}' no autorizado para este recurso`
      });
    }
    next();
  };
}

// Políticas de Acceso a Colecciones (Fase 1C / 1D-D.2)
const ADMIN_ONLY_COLLECTIONS = new Set(['adminLedger', 'business_debts', 'settings', 'vehicle_trips', 'users', 'accounting']);
const SENSITIVE_CORE_COLLECTIONS = new Set(['users', 'clients', 'transactions', 'installments', 'bills', 'settings', 'adminLedger', 'business_debts', 'products', 'kardex', 'suppliers']);
const ALLOWED_DELETION_COLLECTIONS = new Set(['banners', 'daily_drafts', 'photo_album', 'voice_notes', 'mobileOrders', 'admin_voice_pending']);

function requireCollectionRead(req, res, next) {
  const collectionName = req.params.name;
  const userRole = String(req.user?.role || '').toLowerCase();

  // Colecciones estrictamente administrativas y financieras
  if (ADMIN_ONLY_COLLECTIONS.has(collectionName)) {
    if (userRole !== 'admin' && userRole !== 'accountant') {
      return res.status(403).json({
        error: `Acceso denegado: la colección '${collectionName}' es exclusiva de administración.`
      });
    }
  }

  next();
}

function requireCollectionWrite(req, res, next) {
  const collectionName = req.params.name;
  const userRole = String(req.user?.role || '').toLowerCase();

  // Colecciones estrictamente administrativas
  if (ADMIN_ONLY_COLLECTIONS.has(collectionName)) {
    if (userRole !== 'admin' && userRole !== 'accountant') {
      return res.status(403).json({
        error: `Acceso denegado: escritura en '${collectionName}' restringida a administración.`
      });
    }
  }

  // Colección de usuarios: solo admin puede crear o modificar registros
  if (collectionName === 'users') {
    if (userRole !== 'admin') {
      return res.status(403).json({
        error: 'Acceso denegado: la gestión de usuarios es exclusiva de administradores.'
      });
    }
  }

  // Protección de saldos y deudas contra manipulación genérica no autorizada
  if (userRole === 'cajero') {
    const updates = req.body || {};
    if (collectionName === 'clients' && (updates.outstandingDebt !== undefined || updates.creditLimit !== undefined)) {
      return res.status(403).json({
        error: 'Acceso denegado: los cajeros no pueden alterar deudas ni límites de crédito directamente.'
      });
    }
    if (collectionName === 'suppliers' && (updates.balanceOwed !== undefined || updates.storeDebt !== undefined)) {
      return res.status(403).json({
        error: 'Acceso denegado: los cajeros no pueden alterar saldos de proveedores directamente.'
      });
    }
  }

  next();
}

// ============================================================
// ENDPOINTS DE AUTENTICACIÓN SEGURA (FASE 1A / 1B)
// ============================================================

// 1. Obtener Token CSRF activo para el cliente
app.get('/api/auth/csrf-token', (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.json({ csrfToken: req.session.csrfToken });
});

// Endpoint seguro de diagnóstico / test de rooms Socket.IO (Solo habilitado en desarrollo / pruebas)
if (!isProd) {
  app.get('/api/test-socket-info/:socketId', (req, res) => {
    const targetSocket = io.sockets.sockets.get(req.params.socketId);
    if (!targetSocket) {
      return res.status(404).json({ error: 'Socket no encontrado' });
    }
    const rooms = Array.from(targetSocket.rooms || []);
    const identity = targetSocket.data?.identity || { isAnonymous: true, crm: null, portal: null };
    const sessionIdPresent = Boolean(targetSocket.request?.session?.id || targetSocket.request?.sessionID);
    res.json({
      socketId: targetSocket.id,
      rooms,
      identity,
      sessionIdPresent
    });
  });
}

// 2. Login con verificación en backend y rotación de sesión
app.post('/api/auth/login', loginLimiter, (req, res) => {
  try {
    const { loginMode = 'admin', email, cedula, password, pin } = req.body;

    const users = readCollection('users');
    let matchedUser = null;

    if (loginMode === 'admin') {
      const inputEmail = (email || '').trim().toLowerCase();
      if (!inputEmail || !password) {
        return res.status(400).json({ error: 'Debe ingresar correo y contraseña' });
      }

      matchedUser = users.find(u =>
        (u.email && u.email.toLowerCase() === inputEmail) ||
        (u.username && u.username.toLowerCase() === inputEmail) ||
        (u.cedula && u.cedula.toLowerCase() === inputEmail)
      );

      if (!matchedUser || !matchedUser.active || !verifyCredential(password, matchedUser.passwordHash)) {
        return res.status(401).json({ error: 'Credenciales inválidas o cuenta no autorizada' });
      }
    } else {
      // Modo cajero / terminal con Cédula y PIN
      const inputCedula = (cedula || '').trim();
      const inputPin = (pin || '').trim();

      if (!inputCedula || !inputPin) {
        return res.status(400).json({ error: 'Debe ingresar cédula y PIN de acceso' });
      }

      matchedUser = users.find(u => String(u.cedula).trim() === inputCedula);

      if (!matchedUser || !matchedUser.active || !verifyCredential(inputPin, matchedUser.pinHash)) {
        return res.status(401).json({ error: 'Credenciales inválidas o cuenta no autorizada' });
      }
    }

    // Regenerar ID de sesión para prevenir Session Fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('[Auth Error] Error regenerando sesión:', err);
        return res.status(500).json({ error: 'Error interno de autenticación' });
      }

      req.session.userId = matchedUser.id;
      req.session.userRole = matchedUser.role;
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');

      const safeUser = {
        id: matchedUser.id,
        name: matchedUser.name,
        role: matchedUser.role,
        cedula: matchedUser.cedula,
        initials: matchedUser.initials || (matchedUser.name ? matchedUser.name.slice(0, 2).toUpperCase() : 'US')
      };

      res.json({
        success: true,
        user: safeUser,
        csrfToken: req.session.csrfToken
      });
    });
  } catch (error) {
    console.error('[Auth Exception]:', error);
    res.status(500).json({ error: 'Error procesando autenticación' });
  }
});

// 3. Obtener sesión activa del usuario autenticado (Protegido por requireAuth)
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    csrfToken: req.session.csrfToken
  });
});

// --- ENDPOINTS DE PRUEBA Y VALIDACIÓN RBAC (FASE 1B) ---

// Endpoint exclusivo para Administradores
app.get('/api/rbac/admin-only', requireAuth, requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    message: 'Operación administrativa autorizada',
    user: req.user
  });
});

// Endpoint accesible por Administradores y Cajeros
app.get('/api/rbac/cashier-allowed', requireAuth, requireRole('admin', 'cajero'), (req, res) => {
  res.json({
    success: true,
    message: 'Operación de caja autorizada',
    user: req.user
  });
});

// Endpoint de prueba que demuestra que el body no puede sobreescribir el rol de sesión
app.post('/api/rbac/role-change-test', requireAuth, (req, res) => {
  res.json({
    success: true,
    effectiveRole: req.user.role,
    user: req.user
  });
});

// Middleware de validación CSRF para operaciones mutadoras
function verifyCsrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const clientToken = req.headers['x-csrf-token'] || req.body?.csrfToken;
  const sessionToken = req.session?.csrfToken;

  if (!clientToken || !sessionToken || clientToken !== sessionToken) {
    return res.status(403).json({ error: 'CSRF token inválido o ausente' });
  }
  next();
}

// 4. Logout e invalidación de sesión server-side (Protegido con verificación CSRF)
app.post('/api/auth/logout', verifyCsrf, (req, res) => {
  const sessionId = req.session?.id || req.sessionID;
  if (sessionId) {
    invalidateSessionSockets(sessionId);
  }
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth Error] Error destruyendo sesión:', err);
    }
    res.clearCookie('__kalu_sid');
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  });
});

// ============================================================
// ENDPOINTS DE AUTENTICACIÓN SERVER-SIDE DE PORTALES (FASE 1D-A)
// ============================================================

// 1. Login de portal para cliente o productor
app.post('/api/portal/auth/login', portalLoginLimiter, (req, res) => {
  try {
    const { portalType, identifier, pin } = req.body || {};

    if (!portalType || !['client', 'producer'].includes(portalType) || !identifier || !pin) {
      return res.status(400).json({ error: 'Debe ingresar identificador y PIN de acceso' });
    }

    const genericAuthError = () => res.status(401).json({ error: 'Identificador o PIN incorrecto' });
    const cleanId = String(identifier).trim().toLowerCase();
    const cleanDigits = String(identifier).replace(/\D/g, '');
    const inputPin = String(pin).trim();

    let matchedEntity = null;

    if (portalType === 'client') {
      const clients = readCollection('clients');
      matchedEntity = clients.find(c => {
        if (c.status && c.status !== 'active') return false;
        const phoneDigits = String(c.phone || c.telefono || '').replace(/\D/g, '');
        const cedulaDigits = String(c.cedula || c.ci || c.ciRif || c.idNumber || '').replace(/\D/g, '');
        const emailMatch = c.email && c.email.trim().toLowerCase() === cleanId;
        const idMatch = c.id && String(c.id).trim().toLowerCase() === cleanId;
        const nameMatch = c.name && c.name.trim().toLowerCase() === cleanId;

        if (emailMatch || idMatch || nameMatch) return true;
        if (cleanDigits.length >= 4 && phoneDigits.length >= 4 && phoneDigits.endsWith(cleanDigits)) return true;
        if (cleanDigits.length >= 4 && cedulaDigits.length >= 4 && cedulaDigits.endsWith(cleanDigits)) return true;
        return false;
      });

      if (!matchedEntity) {
        return genericAuthError();
      }

      let pinValid = false;
      if (matchedEntity.pinHash) {
        pinValid = verifyCredential(inputPin, matchedEntity.pinHash);
      } else if (matchedEntity.pin) {
        pinValid = verifyCredential(inputPin, matchedEntity.pin) || String(matchedEntity.pin) === inputPin;
      } else {
        const base = matchedEntity.cedula || matchedEntity.ci || matchedEntity.ciRif || matchedEntity.idNumber || matchedEntity.phone || '000000';
        const expectedPin = String(base).replace(/\D/g, '').slice(-4).padEnd(6, '0');
        pinValid = inputPin === expectedPin;
      }

      if (!pinValid) {
        return genericAuthError();
      }
    } else {
      // Productor
      const suppliers = readCollection('suppliers');
      matchedEntity = suppliers.find(s => {
        if (s.status && s.status !== 'active') return false;
        const phoneDigits = String(s.phone || s.telefono || '').replace(/\D/g, '');
        const rifDigits = String(s.rif || s.cedula || s.ci || '').replace(/\D/g, '');
        const emailMatch = s.email && s.email.trim().toLowerCase() === cleanId;
        const idMatch = s.id && String(s.id).trim().toLowerCase() === cleanId;
        const nameMatch = s.name && s.name.trim().toLowerCase() === cleanId;

        if (emailMatch || idMatch || nameMatch) return true;
        if (cleanDigits.length >= 4 && phoneDigits.length >= 4 && phoneDigits.endsWith(cleanDigits)) return true;
        if (cleanDigits.length >= 4 && rifDigits.length >= 4 && rifDigits.endsWith(cleanDigits)) return true;
        return false;
      });

      if (!matchedEntity) {
        return genericAuthError();
      }

      let pinValid = false;
      if (matchedEntity.pinHash) {
        pinValid = verifyCredential(inputPin, matchedEntity.pinHash);
      } else if (matchedEntity.pin) {
        pinValid = verifyCredential(inputPin, matchedEntity.pin) || String(matchedEntity.pin) === inputPin;
      } else {
        const base = matchedEntity.rif || matchedEntity.cedula || matchedEntity.ci || matchedEntity.phone || '000000';
        const expectedPin = String(base).replace(/\D/g, '').slice(-4).padEnd(6, '0');
        pinValid = inputPin === expectedPin;
      }

      if (!pinValid) {
        return genericAuthError();
      }
    }

    const safePortalUser = {
      type: portalType,
      id: matchedEntity.id,
      name: matchedEntity.name
    };

    // Preservar identidad CRM si existiera en la misma sesión
    const existingUserId = req.session?.userId;
    const existingUserRole = req.session?.userRole;

    req.session.regenerate((err) => {
      if (err) {
        console.error('[Portal Auth Error] Error regenerando sesión:', err);
        return res.status(500).json({ error: 'Error interno de autenticación' });
      }

      if (existingUserId) {
        req.session.userId = existingUserId;
        req.session.userRole = existingUserRole;
      }
      req.session.portalUser = safePortalUser;
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[Portal Auth Error] Error guardando sesión:', saveErr);
          return res.status(500).json({ error: 'Error interno de sesión' });
        }
        res.json({
          success: true,
          authenticated: true,
          portalUser: safePortalUser,
          csrfToken: req.session.csrfToken
        });
      });
    });
  } catch (error) {
    console.error('[Portal Auth Exception]:', error);
    res.status(500).json({ error: 'Error procesando autenticación de portal' });
  }
});

// 2. Obtener sesión activa del portal (Protegido por requirePortalAuth)
app.get('/api/portal/auth/me', requirePortalAuth, (req, res) => {
  res.json({
    authenticated: true,
    portalUser: req.portalUser,
    csrfToken: req.session.csrfToken
  });
});

// 3. Logout del portal (Protegido con verificación CSRF)
app.post('/api/portal/auth/logout', verifyCsrf, (req, res) => {
  if (req.session) {
    const sessionId = req.session?.id || req.sessionID;
    const isCoexisting = Boolean(req.session.userId);

    delete req.session.portalUser;

    // Purgar privilegios de portal de sockets en memoria server-side
    if (sessionId) {
      purgePortalSocketPrivileges(sessionId, isCoexisting);
    }

    // Si no hay sesión CRM activa, destruir la sesión y limpiar cookie
    if (!req.session.userId) {
      req.session.destroy((err) => {
        if (err) console.error('[Portal Logout Error]:', err);
        res.clearCookie('__kalu_sid');
        return res.json({ success: true, message: 'Sesión de portal cerrada' });
      });
      return;
    }
    // Si hay sesión CRM activa, guardar la sesión sin portalUser preservando la sesión CRM
    req.session.save((err) => {
      if (err) console.error('[Portal Logout Save Error]:', err);
      return res.json({ success: true, message: 'Sesión de portal cerrada' });
    });
  } else {
    res.json({ success: true, message: 'Sesión de portal cerrada' });
  }
});

// ============================================================
// ENDPOINTS SERVER-SIDE DE RECOVERY DE PORTAL (FASE 1D-C.2)
// ============================================================

/**
 * 4. Solicitar recuperación de acceso (Request Challenge)
 * POST /api/portal/auth/recovery/request
 * Payload: { portalType: 'client'|'producer', identifier: string, channel: 'email'|'whatsapp' }
 * Anti-enumeration: Devuelve respuesta genérica idéntica tanto si la entidad existe como si no.
 */
app.post('/api/portal/auth/recovery/request', recoveryRequestLimiter, async (req, res) => {
  try {
    const { portalType, identifier, channel } = req.body || {};

    if (!portalType || !['client', 'producer'].includes(portalType) || !identifier || !channel || !['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ error: 'Parámetros de solicitud de recuperación inválidos' });
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const cleanDigits = String(identifier).replace(/\D/g, '');

    let matchedEntity = null;

    if (portalType === 'client') {
      const clients = readCollection('clients');
      matchedEntity = clients.find(c => {
        if (c.status && c.status !== 'active') return false;
        const phoneDigits = String(c.phone || c.telefono || '').replace(/\D/g, '');
        const cedulaDigits = String(c.cedula || c.ci || c.ciRif || c.idNumber || '').replace(/\D/g, '');
        const emailMatch = c.email && c.email.trim().toLowerCase() === cleanId;
        const idMatch = c.id && String(c.id).trim().toLowerCase() === cleanId;
        const nameMatch = c.name && c.name.trim().toLowerCase() === cleanId;

        if (emailMatch || idMatch || nameMatch) return true;
        if (cleanDigits.length >= 4 && phoneDigits.length >= 4 && phoneDigits.endsWith(cleanDigits)) return true;
        if (cleanDigits.length >= 4 && cedulaDigits.length >= 4 && cedulaDigits.endsWith(cleanDigits)) return true;
        return false;
      });
    } else {
      const suppliers = readCollection('suppliers');
      matchedEntity = suppliers.find(s => {
        if (s.status && s.status !== 'active') return false;
        const phoneDigits = String(s.phone || s.telefono || '').replace(/\D/g, '');
        const rifDigits = String(s.rif || s.cedula || s.ci || '').replace(/\D/g, '');
        const emailMatch = s.email && s.email.trim().toLowerCase() === cleanId;
        const idMatch = s.id && String(s.id).trim().toLowerCase() === cleanId;
        const nameMatch = s.name && s.name.trim().toLowerCase() === cleanId;

        if (emailMatch || idMatch || nameMatch) return true;
        if (cleanDigits.length >= 4 && phoneDigits.length >= 4 && phoneDigits.endsWith(cleanDigits)) return true;
        if (cleanDigits.length >= 4 && rifDigits.length >= 4 && rifDigits.endsWith(cleanDigits)) return true;
        return false;
      });
    }

    // Respuesta genérica uniforme para anti-enumeración
    const genericSuccessResponse = {
      success: true,
      message: 'Si los datos corresponden a una cuenta activa, recibirás un código de recuperación.'
    };

    if (!matchedEntity) {
      return res.json(genericSuccessResponse);
    }

    // Obtener contacto registrado en el servidor según el canal
    let recipient = null;
    if (channel === 'email') {
      recipient = matchedEntity.email ? String(matchedEntity.email).trim() : null;
    } else if (channel === 'whatsapp') {
      recipient = matchedEntity.phone || matchedEntity.telefono ? String(matchedEntity.phone || matchedEntity.telefono).trim() : null;
    }

    if (!recipient) {
      return res.json(genericSuccessResponse);
    }

    // Crear reto seguro en el Recovery Core
    const challenge = createRecoveryChallenge({
      portalType,
      targetId: matchedEntity.id,
      targetName: matchedEntity.name,
      channel,
      recipient
    });

    // Despachar OTP mediante la pasarela segura
    try {
      await dispatchRecoveryOtp({
        channel,
        recipient,
        code: challenge.otpForDelivery,
        name: matchedEntity.name
      });
    } catch (dispatchErr) {
      console.error('[Recovery Dispatch Error]:', dispatchErr.message);
    }

    // Respuesta segura: Retorna challengeId para que el cliente pueda enviarlo en verify
    return res.json({
      success: true,
      challengeId: challenge.challengeId,
      recipientMasked: challenge.recipientMasked,
      expiresAt: challenge.expiresAt,
      message: 'Código de recuperación despachado al contacto registrado.'
    });
  } catch (error) {
    console.error('[Recovery Request Exception]:', error);
    res.status(500).json({ error: 'Error procesando solicitud de recuperación' });
  }
});

/**
 * 5. Verificar código OTP y emitir reset token
 * POST /api/portal/auth/recovery/verify
 * Payload: { portalType: 'client'|'producer', identifier: string, challengeId: string, code: string }
 */
app.post('/api/portal/auth/recovery/verify', recoveryVerifyLimiter, (req, res) => {
  try {
    const { portalType, identifier, challengeId, code } = req.body || {};

    if (!portalType || !['client', 'producer'].includes(portalType) || !identifier || !challengeId || !code) {
      return res.status(400).json({ error: 'Parámetros de verificación incompletos' });
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const cleanDigits = String(identifier).replace(/\D/g, '');

    let matchedEntity = null;

    if (portalType === 'client') {
      const clients = readCollection('clients');
      matchedEntity = clients.find(c => {
        if (c.status && c.status !== 'active') return false;
        const phoneDigits = String(c.phone || c.telefono || '').replace(/\D/g, '');
        const cedulaDigits = String(c.cedula || c.ci || c.ciRif || c.idNumber || '').replace(/\D/g, '');
        const emailMatch = c.email && c.email.trim().toLowerCase() === cleanId;
        const idMatch = c.id && String(c.id).trim().toLowerCase() === cleanId;
        const nameMatch = c.name && c.name.trim().toLowerCase() === cleanId;

        if (emailMatch || idMatch || nameMatch) return true;
        if (cleanDigits.length >= 4 && phoneDigits.length >= 4 && phoneDigits.endsWith(cleanDigits)) return true;
        if (cleanDigits.length >= 4 && cedulaDigits.length >= 4 && cedulaDigits.endsWith(cleanDigits)) return true;
        return false;
      });
    } else {
      const suppliers = readCollection('suppliers');
      matchedEntity = suppliers.find(s => {
        if (s.status && s.status !== 'active') return false;
        const phoneDigits = String(s.phone || s.telefono || '').replace(/\D/g, '');
        const rifDigits = String(s.rif || s.cedula || s.ci || '').replace(/\D/g, '');
        const emailMatch = s.email && s.email.trim().toLowerCase() === cleanId;
        const idMatch = s.id && String(s.id).trim().toLowerCase() === cleanId;
        const nameMatch = s.name && s.name.trim().toLowerCase() === cleanId;

        if (emailMatch || idMatch || nameMatch) return true;
        if (cleanDigits.length >= 4 && phoneDigits.length >= 4 && phoneDigits.endsWith(cleanDigits)) return true;
        if (cleanDigits.length >= 4 && rifDigits.length >= 4 && rifDigits.endsWith(cleanDigits)) return true;
        return false;
      });
    }

    if (!matchedEntity) {
      return res.status(400).json({ error: 'Código de recuperación inválido o expirado' });
    }

    const verifyResult = verifyRecoveryCode({
      challengeId,
      portalType,
      targetId: matchedEntity.id,
      code
    });

    if (!verifyResult.success) {
      if (verifyResult.code === 'LOCKED' || verifyResult.code === 'MAX_ATTEMPTS_EXCEEDED') {
        return res.status(429).json({ error: 'Límite de intentos superado. Solicite un nuevo código.' });
      }
      return res.status(400).json({ error: 'Código de recuperación inválido o expirado' });
    }

    return res.json({
      success: true,
      resetToken: verifyResult.resetToken,
      expiresAt: verifyResult.expiresAt,
      message: 'Código verificado con éxito'
    });
  } catch (error) {
    console.error('[Recovery Verify Exception]:', error);
    res.status(500).json({ error: 'Error verificando código de recuperación' });
  }
});

/**
 * 6. Restablecer PIN con resetToken verificado
 * POST /api/portal/auth/recovery/reset-pin
 * Payload: { portalType: 'client'|'producer', identifier: string, resetToken: string, newPin: string }
 */
app.post('/api/portal/auth/recovery/reset-pin', (req, res) => {
  try {
    const { portalType, identifier, resetToken, newPin } = req.body || {};

    if (!portalType || !['client', 'producer'].includes(portalType) || !identifier || !resetToken || !newPin) {
      return res.status(400).json({ error: 'Parámetros de restablecimiento incompletos' });
    }

    // Validar formato estricto del nuevo PIN (exactamente 6 dígitos numéricos)
    const pinStr = String(newPin).trim();
    if (!/^\d{6}$/.test(pinStr)) {
      return res.status(400).json({ error: 'El PIN debe contener exactamente 6 dígitos numéricos' });
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const cleanDigits = String(identifier).replace(/\D/g, '');

    let matchedEntity = null;

    if (portalType === 'client') {
      const clients = readCollection('clients');
      matchedEntity = clients.find(c => {
        if (c.status && c.status !== 'active') return false;
        const phoneDigits = String(c.phone || c.telefono || '').replace(/\D/g, '');
        const cedulaDigits = String(c.cedula || c.ci || c.ciRif || c.idNumber || '').replace(/\D/g, '');
        const emailMatch = c.email && c.email.trim().toLowerCase() === cleanId;
        const idMatch = c.id && String(c.id).trim().toLowerCase() === cleanId;
        const nameMatch = c.name && c.name.trim().toLowerCase() === cleanId;

        if (emailMatch || idMatch || nameMatch) return true;
        if (cleanDigits.length >= 4 && phoneDigits.length >= 4 && phoneDigits.endsWith(cleanDigits)) return true;
        if (cleanDigits.length >= 4 && cedulaDigits.length >= 4 && cedulaDigits.endsWith(cleanDigits)) return true;
        return false;
      });
    } else {
      const suppliers = readCollection('suppliers');
      matchedEntity = suppliers.find(s => {
        if (s.status && s.status !== 'active') return false;
        const phoneDigits = String(s.phone || s.telefono || '').replace(/\D/g, '');
        const rifDigits = String(s.rif || s.cedula || s.ci || '').replace(/\D/g, '');
        const emailMatch = s.email && s.email.trim().toLowerCase() === cleanId;
        const idMatch = s.id && String(s.id).trim().toLowerCase() === cleanId;
        const nameMatch = s.name && s.name.trim().toLowerCase() === cleanId;

        if (emailMatch || idMatch || nameMatch) return true;
        if (cleanDigits.length >= 4 && phoneDigits.length >= 4 && phoneDigits.endsWith(cleanDigits)) return true;
        if (cleanDigits.length >= 4 && rifDigits.length >= 4 && rifDigits.endsWith(cleanDigits)) return true;
        return false;
      });
    }

    if (!matchedEntity) {
      return res.status(400).json({ error: 'Token de restablecimiento inválido o expirado' });
    }

    // Consumir resetToken validando binding estricto de identidad
    const consumeRes = consumeResetToken({
      resetToken,
      portalType,
      targetId: matchedEntity.id
    });

    if (!consumeRes.success) {
      return res.status(400).json({ error: 'Token de restablecimiento inválido o expirado' });
    }

    // Hashear nuevo PIN usando bcrypt con salt rounds estándar (10)
    const newPinHash = bcrypt.hashSync(pinStr, 10);

    // Actualizar entidad mediante persistencia segura y controlada (whitelist estricta)
    if (portalType === 'client') {
      const clients = readCollection('clients');
      const idx = clients.findIndex(c => String(c.id) === String(matchedEntity.id));
      if (idx !== -1) {
        clients[idx].pinHash = newPinHash;
        delete clients[idx].pin; // Eliminar PIN plano si existía
        writeCollection('clients', clients);
      }
    } else {
      const suppliers = readCollection('suppliers');
      const idx = suppliers.findIndex(s => String(s.id) === String(matchedEntity.id));
      if (idx !== -1) {
        suppliers[idx].pinHash = newPinHash;
        delete suppliers[idx].pin; // Eliminar PIN plano si existía
        writeCollection('suppliers', suppliers);
      }
    }

    // Invalidar sesión portal activa si coincide con el cliente/productor que cambió PIN
    if (req.session && req.session.portalUser && String(req.session.portalUser.id) === String(matchedEntity.id)) {
      delete req.session.portalUser;
      if (!req.session.userId) {
        req.session.destroy(() => {});
        res.clearCookie('__kalu_sid');
      } else {
        req.session.save(() => {});
      }
    }

    return res.json({
      success: true,
      message: 'PIN restablecido exitosamente. Ya puede iniciar sesión con su nueva clave.'
    });
  } catch (error) {
    console.error('[Recovery Reset-PIN Exception]:', error);
    res.status(500).json({ error: 'Error procesando el restablecimiento del PIN' });
  }
});

// ============================================================
// ENDPOINTS SCOPED Y PÚBLICOS DE PORTALES (FASE 1D-B)
// ============================================================

// 1. Configuración Pública de Portal (Solo tasa BCV y banners; sin bóveda ni credenciales)
app.get('/api/portal/public-config', (req, res) => {
  try {
    const settings = readCollection('settings');
    const general = Array.isArray(settings) ? (settings.find(s => s.id === 'general') || {}) : (settings || {});
    const banners = readCollection('banners');
    res.json({
      exchangeRate: Number(general.exchangeRate || general.bcvRate || 807.38),
      lastRateSync: general.lastRateSync || new Date().toISOString(),
      banners: Array.isArray(banners) ? banners : []
    });
  } catch (err) {
    console.error('[Portal Public Config Error]:', err);
    res.status(500).json({ error: 'Error obteniendo configuración pública' });
  }
});

// 2. Catálogo Público de Productos (Sanitizado; sin wholesalePrice ni costos)
app.get('/api/portal/public-catalog', (req, res) => {
  try {
    const products = readCollection('products');
    const sanitized = (Array.isArray(products) ? products : []).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category || 'Víveres',
      pricePerKg: Number(p.pricePerKg || p.sellingPrice || p.price || 0),
      sellingPrice: Number(p.sellingPrice || p.pricePerKg || p.price || 0),
      stockKg: Number(p.stockKg ?? p.stock ?? 0),
      stock: Number(p.stock ?? p.stockKg ?? 0),
      unit: p.unit || 'Und',
      imageUrl: p.imageUrl || p.image || '',
      image: p.image || p.imageUrl || '',
      description: p.description || ''
    }));
    res.json(sanitized);
  } catch (err) {
    console.error('[Portal Public Catalog Error]:', err);
    res.status(500).json({ error: 'Error obteniendo catálogo público' });
  }
});

// --- PORTAL CLIENTE: ENDPOINTS SCOPED (requirePortalAuth + requirePortalType('client')) ---

// 3. Perfil del Cliente Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/client/profile', requirePortalAuth, requirePortalType('client'), (req, res) => {
  try {
    const clients = readCollection('clients');
    const client = clients.find(c => String(c.id) === String(req.portalUser.id));
    if (!client || (client.status && client.status !== 'active')) {
      return res.status(404).json({ error: 'Cliente no encontrado o inactivo' });
    }
    const safeProfile = {
      id: client.id,
      name: client.name,
      phone: client.phone || client.telefono || '',
      email: client.email || '',
      cedula: client.cedula || client.ci || client.ciRif || client.idNumber || '',
      address: client.address || client.direccion || '',
      creditLimitUsd: Number(client.creditLimitUsd || client.creditLimit || 0),
      currentDebtUsd: Number(client.currentDebtUsd || client.outstandingDebt || 0),
      outstandingDebt: Number(client.outstandingDebt || client.currentDebtUsd || 0),
      loyaltyPoints: Number(client.loyaltyPoints || client.points || 0),
      points: Number(client.loyaltyPoints || client.points || 0),
      tier: client.tier || 'K1',
      status: client.status || 'active'
    };
    res.json(safeProfile);
  } catch (err) {
    console.error('[Portal Client Profile Error]:', err);
    res.status(500).json({ error: 'Error obteniendo perfil del cliente' });
  }
});

// 4. Finanzas y Cuotas del Cliente Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/client/finances', requirePortalAuth, requirePortalType('client'), (req, res) => {
  try {
    const clients = readCollection('clients');
    const client = clients.find(c => String(c.id) === String(req.portalUser.id));
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const allInstallments = readCollection('installments');
    const myInstallments = allInstallments
      .filter(i => String(i.clientId) === String(req.portalUser.id) || String(i.client_id) === String(req.portalUser.id))
      .map(i => ({
        id: i.id,
        clientId: req.portalUser.id,
        amount: Number(i.amount || i.amountUSD || 0),
        amountUSD: Number(i.amountUSD || i.amount || 0),
        dueDate: i.dueDate,
        status: i.status || 'pending',
        installmentNumber: i.installmentNumber || 1,
        totalInstallments: i.totalInstallments || 1,
        pointsEarned: i.pointsEarned || 0,
        createdAt: i.createdAt,
        type: i.type || 'cotidiano'
      }));

    res.json({
      outstandingDebt: Number(client.outstandingDebt || client.currentDebtUsd || 0),
      creditLimitUsd: Number(client.creditLimitUsd || client.creditLimit || 0),
      loyaltyPoints: Number(client.loyaltyPoints || client.points || 0),
      tier: client.tier || 'K1',
      installments: myInstallments
    });
  } catch (err) {
    console.error('[Portal Client Finances Error]:', err);
    res.status(500).json({ error: 'Error obteniendo finanzas del cliente' });
  }
});

// 5. Historial de Transacciones del Cliente Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/client/transactions', requirePortalAuth, requirePortalType('client'), (req, res) => {
  try {
    const allTxs = readCollection('transactions');
    const myTxs = allTxs
      .filter(t => String(t.clientId) === String(req.portalUser.id))
      .map(t => ({
        id: t.id,
        entity: t.entity || req.portalUser.name,
        clientId: req.portalUser.id,
        date: t.date,
        createdAt: t.createdAt,
        invoiceNumber: t.invoiceNumber,
        amount: Number(t.amount || 0),
        debtAmount: Number(t.debtAmount || 0),
        isIncome: Boolean(t.isIncome),
        status: t.status,
        paymentMethod: t.paymentMethod,
        category: t.category,
        items: t.items || [],
        addedPayments: t.addedPayments || [],
        changeAmount: t.changeAmount,
        changeCurrency: t.changeCurrency,
        bcvRateAtSettlement: t.bcvRateAtSettlement
      }));
    res.json(myTxs);
  } catch (err) {
    console.error('[Portal Client Txs Error]:', err);
    res.status(500).json({ error: 'Error obteniendo transacciones del cliente' });
  }
});

// 6. Pagos Reportados por el Cliente Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/client/payments', requirePortalAuth, requirePortalType('client'), (req, res) => {
  try {
    const allPayments = readCollection('pwa_payments');
    const myPayments = allPayments.filter(p => String(p.entityId) === String(req.portalUser.id) || String(p.clientId) === String(req.portalUser.id));
    res.json(myPayments);
  } catch (err) {
    console.error('[Portal Client Payments GET Error]:', err);
    res.status(500).json({ error: 'Error obteniendo pagos del cliente' });
  }
});

// 7. Reportar Pago PWA por el Cliente (Ownership forzado por req.portalUser.id + CSRF)
app.post('/api/portal/client/payments', requirePortalAuth, requirePortalType('client'), verifyCsrf, async (req, res) => {
  try {
    const { amount, paymentMethod, reference, bank, receiptImageUrl, notes, installmentId, date } = req.body || {};
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Monto de pago requerido y debe ser mayor a cero' });
    }

    const newPayment = {
      id: `pwa-pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      entityId: req.portalUser.id,
      clientId: req.portalUser.id,
      entityName: req.portalUser.name,
      amount: Number(amount),
      paymentMethod: String(paymentMethod || 'Pago Móvil'),
      reference: String(reference || ''),
      bank: String(bank || ''),
      receiptImageUrl: receiptImageUrl || '',
      receiptImage: receiptImageUrl || '',
      notes: String(notes || ''),
      installmentId: installmentId ? String(installmentId) : null,
      date: date || new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await withCollectionLock('pwa_payments', async () => {
      const pwaPayments = readCollection('pwa_payments');
      pwaPayments.push(newPayment);
      writeCollection('pwa_payments', pwaPayments, { action: 'add', collection: 'pwa_payments', doc: newPayment });
    });

    if (installmentId) {
      await withCollectionLock('installments', async () => {
        const installments = readCollection('installments');
        const inst = installments.find(i => String(i.id) === String(installmentId) && (String(i.clientId) === String(req.portalUser.id) || String(i.client_id) === String(req.portalUser.id)));
        if (inst && inst.status === 'pending') {
          inst.status = 'in_review';
          writeCollection('installments', installments, { action: 'update', collection: 'installments', doc: inst });
        }
      });
    }

    res.json({ success: true, payment: newPayment });
  } catch (err) {
    console.error('[Portal Client Payment POST Error]:', err);
    res.status(500).json({ error: 'Error registrando reporte de pago' });
  }
});

// 8. Actualizar Estatus de Cuota por Reporte de Pago (Ownership verificado en backend)
app.post('/api/portal/client/installments/:id/report-payment', requirePortalAuth, requirePortalType('client'), verifyCsrf, async (req, res) => {
  try {
    const installmentId = req.params.id;
    let updatedDoc = null;
    await withCollectionLock('installments', async () => {
      const installments = readCollection('installments');
      const inst = installments.find(i => String(i.id) === String(installmentId) && (String(i.clientId) === String(req.portalUser.id) || String(i.client_id) === String(req.portalUser.id)));
      if (!inst) {
        return;
      }
      inst.status = 'in_review';
      writeCollection('installments', installments, { action: 'update', collection: 'installments', doc: inst });
      updatedDoc = inst;
    });

    if (!updatedDoc) {
      return res.status(404).json({ error: 'Cuota no encontrada o no pertenece al cliente' });
    }
    res.json({ success: true, installment: updatedDoc });
  } catch (err) {
    console.error('[Portal Report Installment Error]:', err);
    res.status(500).json({ error: 'Error actualizando estatus de cuota' });
  }
});

// 9. Pedidos Remotos del Cliente Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/client/orders', requirePortalAuth, requirePortalType('client'), (req, res) => {
  try {
    const orders = readCollection('mobileOrders');
    const myOrders = orders.filter(o => String(o.clientId) === String(req.portalUser.id) || String(o.entityId) === String(req.portalUser.id));
    res.json(myOrders);
  } catch (err) {
    console.error('[Portal Client Orders GET Error]:', err);
    res.status(500).json({ error: 'Error obteniendo pedidos del cliente' });
  }
});

// 10. Crear Pedido Remoto de Cliente (Ownership forzado por req.portalUser.id + CSRF)
app.post('/api/portal/client/orders', requirePortalAuth, requirePortalType('client'), verifyCsrf, async (req, res) => {
  try {
    const { items, totalAmount, total, paymentMethod, notes } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El pedido debe contener al menos un producto (items)' });
    }

    const sanitizedItems = items.map(it => ({
      productId: String(it.productId || it.id || ''),
      name: String(it.name || it.productName || 'Producto'),
      quantity: Number(it.quantity || it.quantityKg || 1),
      price: Number(it.price || it.unitPrice || 0),
      subtotal: Number(it.subtotal || (Number(it.price || 0) * Number(it.quantity || 1))),
      unit: it.unit || 'Und'
    }));

    const finalTotal = Number(totalAmount ?? total ?? sanitizedItems.reduce((acc, it) => acc + it.subtotal, 0));

    const newOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      clientId: req.portalUser.id,
      entityId: req.portalUser.id,
      clientName: req.portalUser.name,
      entityName: req.portalUser.name,
      items: sanitizedItems,
      totalAmount: finalTotal,
      total: finalTotal,
      paymentMethod: String(paymentMethod || 'contado'),
      notes: String(notes || ''),
      status: 'Pendiente',
      createdAt: new Date().toISOString()
    };

    await withCollectionLock('mobileOrders', async () => {
      const orders = readCollection('mobileOrders');
      orders.push(newOrder);
      writeCollection('mobileOrders', orders, { action: 'add', collection: 'mobileOrders', doc: newOrder });
    });

    res.json({ success: true, order: newOrder });
  } catch (err) {
    console.error('[Portal Client Order POST Error]:', err);
    res.status(500).json({ error: 'Error registrando pedido del cliente' });
  }
});

// 11. Aprobar Transacción con QR por el Cliente (Ownership verificado en backend)
app.post('/api/portal/client/transactions/:id/approve', requirePortalAuth, requirePortalType('client'), verifyCsrf, async (req, res) => {
  try {
    const txId = req.params.id;
    const { authNonce, authSignature } = req.body || {};
    let updatedTx = null;

    await withCollectionLock('transactions', async () => {
      const txs = readCollection('transactions');
      const tx = txs.find(t => String(t.id) === String(txId) && String(t.clientId) === String(req.portalUser.id));
      if (!tx) return;

      tx.status = 'approved';
      tx.authNonce = authNonce || '';
      tx.authSignature = authSignature || '';
      tx.approvedByClientAt = Date.now();
      writeCollection('transactions', txs, { action: 'update', collection: 'transactions', doc: tx });
      updatedTx = tx;
    });

    if (!updatedTx) {
      return res.status(404).json({ error: 'Transacción no encontrada o no pertenece al cliente' });
    }
    res.json({ success: true, transaction: updatedTx });
  } catch (err) {
    console.error('[Portal Client Tx Approve Error]:', err);
    res.status(500).json({ error: 'Error aprobando transacción' });
  }
});

// --- PORTAL PRODUCTOR: ENDPOINTS SCOPED (requirePortalAuth + requirePortalType('producer')) ---

// 12. Perfil del Productor Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/producer/profile', requirePortalAuth, requirePortalType('producer'), (req, res) => {
  try {
    const suppliers = readCollection('suppliers');
    const supplier = suppliers.find(s => String(s.id) === String(req.portalUser.id));
    if (!supplier || (supplier.status && supplier.status !== 'active')) {
      return res.status(404).json({ error: 'Productor no encontrado o inactivo' });
    }
    const safeProfile = {
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact || '',
      phone: supplier.phone || supplier.telefono || '',
      email: supplier.email || '',
      rif: supplier.rif || supplier.cedula || supplier.ci || '',
      type: supplier.type || 'producer',
      balanceUsd: Number(supplier.balanceUsd || supplier.balanceOwed || 0),
      balanceOwed: Number(supplier.balanceOwed || 0),
      storeDebt: Number(supplier.storeDebt || 0),
      status: supplier.status || 'active'
    };
    res.json(safeProfile);
  } catch (err) {
    console.error('[Portal Producer Profile Error]:', err);
    res.status(500).json({ error: 'Error obteniendo perfil del productor' });
  }
});

// 13. Viajes de Queso del Productor Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/producer/trips', requirePortalAuth, requirePortalType('producer'), (req, res) => {
  try {
    const trips = readCollection('cheeseTrips');
    const myTrips = trips
      .filter(t => String(t.supplierId) === String(req.portalUser.id) || String(t.producerId) === String(req.portalUser.id))
      .map(t => ({
        id: t.id,
        supplierId: req.portalUser.id,
        supplierName: t.supplierName || req.portalUser.name,
        date: t.date,
        createdAt: t.createdAt,
        kilos: Number(t.kilos || t.totalKg || 0),
        pricePerKg: Number(t.pricePerKg || t.price || 0),
        totalUsd: Number(t.totalUsd || t.total || 0),
        status: t.status || 'Completado',
        notes: t.notes || ''
      }));
    res.json(myTrips);
  } catch (err) {
    console.error('[Portal Producer Trips Error]:', err);
    res.status(500).json({ error: 'Error obteniendo viajes del productor' });
  }
});

// 14. Transacciones y Compras en Tienda del Productor Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/producer/transactions', requirePortalAuth, requirePortalType('producer'), (req, res) => {
  try {
    const txs = readCollection('transactions');
    const myTxs = txs
      .filter(t => String(t.supplierId) === String(req.portalUser.id))
      .map(t => ({
        id: t.id,
        entity: t.entity || req.portalUser.name,
        supplierId: req.portalUser.id,
        date: t.date,
        createdAt: t.createdAt,
        invoiceNumber: t.invoiceNumber,
        amount: Number(t.amount || 0),
        debtAmount: Number(t.debtAmount || 0),
        isIncome: Boolean(t.isIncome),
        status: t.status,
        paymentMethod: t.paymentMethod,
        category: t.category,
        items: t.items || [],
        bcvRateAtSettlement: t.bcvRateAtSettlement
      }));
    res.json(myTxs);
  } catch (err) {
    console.error('[Portal Producer Txs Error]:', err);
    res.status(500).json({ error: 'Error obteniendo transacciones del productor' });
  }
});

// 15. Pedidos de Insumos del Productor Autenticado (Scoped a req.portalUser.id)
app.get('/api/portal/producer/orders', requirePortalAuth, requirePortalType('producer'), (req, res) => {
  try {
    const orders = readCollection('mobileOrders');
    const myOrders = orders.filter(o => String(o.entityId) === String(req.portalUser.id) || String(o.supplierId) === String(req.portalUser.id));
    res.json(myOrders);
  } catch (err) {
    console.error('[Portal Producer Orders GET Error]:', err);
    res.status(500).json({ error: 'Error obteniendo pedidos del productor' });
  }
});

// 16. Crear Pedido de Insumos de Productor (Ownership forzado por req.portalUser.id + CSRF)
app.post('/api/portal/producer/orders', requirePortalAuth, requirePortalType('producer'), verifyCsrf, async (req, res) => {
  try {
    const { items, total, totalAmount, paymentMethod, notes } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El pedido debe contener al menos un producto (items)' });
    }

    const sanitizedItems = items.map(it => ({
      productId: String(it.productId || it.id || ''),
      name: String(it.name || it.productName || 'Producto'),
      quantity: Number(it.quantity || it.quantityKg || 1),
      price: Number(it.price || it.unitPrice || 0),
      subtotal: Number(it.subtotal || (Number(it.price || 0) * Number(it.quantity || 1))),
      unit: it.unit || 'Und'
    }));

    const finalTotal = Number(total ?? totalAmount ?? sanitizedItems.reduce((acc, it) => acc + it.subtotal, 0));

    const newOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      entityId: req.portalUser.id,
      supplierId: req.portalUser.id,
      entityName: req.portalUser.name,
      supplierName: req.portalUser.name,
      items: sanitizedItems,
      total: finalTotal,
      totalAmount: finalTotal,
      paymentMethod: String(paymentMethod || 'fiado'),
      notes: String(notes || ''),
      status: 'Pendiente',
      date: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await withCollectionLock('mobileOrders', async () => {
      const orders = readCollection('mobileOrders');
      orders.push(newOrder);
      writeCollection('mobileOrders', orders, { action: 'add', collection: 'mobileOrders', doc: newOrder });
    });

    res.json({ success: true, order: newOrder });
  } catch (err) {
    console.error('[Portal Producer Order POST Error]:', err);
    res.status(500).json({ error: 'Error registrando pedido del productor' });
  }
});

// Servir la build estática de producción de Vite si existe la carpeta dist
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

io.on('connection', (socket) => {
  const identity = socket.data.identity || { isAnonymous: true, crm: null, portal: null };

  // 1. Toda conexión pertenece a la room pública
  socket.join('room:public');

  // 2. Asignar rooms de CRM si tiene sesión CRM activa y válida
  if (identity.crm) {
    socket.join('room:crm:staff');
    if (identity.crm.role === 'admin') {
      socket.join('room:crm:admin');
    }
  }

  // 3. Asignar room de Portal si tiene sesión Portal activa y válida
  if (identity.portal) {
    if (identity.portal.type === 'client') {
      socket.join(`room:portal:client:${identity.portal.id}`);
    } else if (identity.portal.type === 'producer') {
      socket.join(`room:portal:producer:${identity.portal.id}`);
    }
  }

  console.log(`[Socket.IO] Client connected: ${socket.id} | Anonymous: ${identity.isAnonymous} | CRM: ${identity.crm ? identity.crm.role : 'none'} | Portal: ${identity.portal ? identity.portal.type : 'none'}`);

  socket.on('disconnect', () => {
    // Desconexión limpia
  });
});


// ============================================================
// SUBSISTEMA DE UPLOADS SEGURO — FASES 1F-A & 1F-B
// ============================================================

// Allowlists estrictas de tipos de archivo (Fase 1F-A)
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.mp4'
]);

/**
 * Validador criptográfico/estructural de Magic Numbers (Signatures de archivo)
 * No confía en el header mimetype ni en el filename provisto por el cliente.
 */
function validateFileBufferSignature(buffer, declaredMime, extension) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  // JPEG: FF D8 FF
  if (declaredMime === 'image/jpeg' || extension === '.jpg' || extension === '.jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (declaredMime === 'image/png' || extension === '.png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
    );
  }

  // WEBP: RIFF....WEBP (0..3 = 'RIFF', 8..11 = 'WEBP')
  if (declaredMime === 'image/webp' || extension === '.webp') {
    if (buffer.length < 12) return false;
    const isRiff = buffer.subarray(0, 4).toString('ascii') === 'RIFF';
    const isWebp = buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    return isRiff && isWebp;
  }

  // PDF: %PDF- (25 50 44 46)
  if (declaredMime === 'application/pdf' || extension === '.pdf') {
    if (buffer.length < 5) return false;
    return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  // MP4 Video: ftyp box (bytes 4..7 = 'ftyp')
  if (declaredMime === 'video/mp4' || extension === '.mp4') {
    if (buffer.length < 8) return false;
    const isFtyp = buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    return isFtyp;
  }

  return false;
}

// Multer memory storage para inspección de magic numbers previa a la persistencia
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // Máximo 10 MB por archivo
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const rawMime = String(file.mimetype || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(rawMime)) {
      const err = new Error('TIPO_NO_PERMITIDO');
      err.code = 'LIMIT_UNEXPECTED_MIME';
      return cb(err);
    }
    cb(null, true);
  }
});

// Middleware de autenticación para subida de archivos (CRM o Portales)
function requireUploadAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return requireAuth(req, res, next);
  }
  if (req.session && req.session.portalUser && req.session.portalUser.id) {
    return requirePortalAuth(req, res, next);
  }
  return res.status(401).json({ error: 'Autenticación requerida para subida de archivos' });
}

// Middleware de manejo de errores de Multer (Size, MIME, etc.)
function handleMulterUpload(req, res, next) {
  uploadMemory.array('files', 10)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'El archivo excede el tamaño máximo permitido (10MB).' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_MIME' || err.message === 'TIPO_NO_PERMITIDO') {
        return res.status(415).json({ error: 'Tipo de archivo no permitido. Solo se admiten JPEG, PNG, WEBP, PDF y MP4.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Se superó el número máximo de archivos simultáneos (10).' });
      }
      return res.status(400).json({ error: 'Error procesando la subida de archivos.' });
    }
    next();
  });
}

// Allowlists estrictas de tipos de archivo y extensiones permitidas para servicio estático (Fase 1F-B)
const ALLOWED_STATIC_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.mp4'
]);

// Guardián de seguridad para servicio estático de /uploads (Fase 1F-B)
// Bloquea categóricamente cualquier intento de acceso a .json, .svg, .html, .js, .bak, .db, etc.
app.use('/uploads', (req, res, next) => {
  const ext = path.extname(req.path || '').toLowerCase();
  if (!ext || !ALLOWED_STATIC_EXTENSIONS.has(ext)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  // Sanitizar path para evitar traversal hacia archivos fuera de uploadDir
  const normalizedPath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, '');
  const resolvedTarget = path.resolve(uploadDir, '.' + normalizedPath);
  if (!resolvedTarget.startsWith(path.resolve(uploadDir))) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  next();
});

// Servir la carpeta de subidas de forma estática únicamente tras pasar el guardián
app.use('/uploads', express.static(uploadDir, {
  dotfiles: 'ignore',
  etag: true,
  lastModified: true
}));

const protectedMediaDir = path.join(__dirname, 'protected_media');
app.use('/protected_media', express.static(protectedMediaDir));

const productsDbFile = path.join(dataDir, 'products_db.json');

// Leer productos locales (Protegido por requireAuth)
app.get('/api/products', requireAuth, (req, res) => {
  try {
    if (fs.existsSync(productsDbFile)) {
      const data = fs.readFileSync(productsDbFile, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error leyendo productos' });
  }
});

// Actualizar producto local (Admin: total | Cajero: estrictamente ajuste de stock)
app.patch('/api/products/:id', requireAuth, requireRole('admin', 'cajero'), verifyCsrf, (req, res) => {
  try {
    if (!fs.existsSync(productsDbFile)) {
      return res.status(404).json({ error: 'DB no encontrada' });
    }
    const data = JSON.parse(fs.readFileSync(productsDbFile, 'utf8'));
    const index = data.findIndex(p => String(p.id) === String(req.params.id));

    if (index === -1) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const current = data[index];
    const previousDoc = { ...data[index] };
    const updates = req.body || {};
    const userRole = String(req.user.role).toLowerCase();

    if (userRole === 'cajero') {
      // Whitelist estricta para cajeros: solo ajuste de inventario
      const allowedCajeroFields = ['adjustStockKg', 'adjustStock', 'csrfToken'];
      const forbiddenKeys = Object.keys(updates).filter(k => !allowedCajeroFields.includes(k));

      if (forbiddenKeys.length > 0 || (updates.adjustStockKg === undefined && updates.adjustStock === undefined)) {
        return res.status(403).json({
          error: 'Acceso denegado: los cajeros solo tienen autorización para ajustes de inventario (stock).'
        });
      }

      if (updates.adjustStockKg !== undefined) {
        current.stockKg = Math.max(0, Math.round((Number(current.stockKg || 0) + Number(updates.adjustStockKg)) * 100) / 100);
      }
      if (updates.adjustStock !== undefined) {
        current.stock = Math.max(0, Number(current.stock || 0) + Number(updates.adjustStock));
      }
      data[index] = current;
    } else {
      // Rol Admin: aplicar cambios administrativos
      if (updates.adjustStockKg) {
        current.stockKg = (Number(current.stockKg || 0) + Number(updates.adjustStockKg));
        delete updates.adjustStockKg;
      }
      if (updates.adjustStock) {
        current.stock = (Number(current.stock || 0) + Number(updates.adjustStock));
        delete updates.adjustStock;
      }
      data[index] = { ...current, ...updates };
    }

    writeCollection('products', data, { action: 'update', collection: 'products', doc: data[index] }, previousDoc);
    res.json({ success: true, product: data[index] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

// Crear producto local (Solo Admin + CSRF + validación de payload)
app.post('/api/products', requireAuth, requireRole('admin'), verifyCsrf, (req, res) => {
  try {
    const { name, pricePerKg, wholesalePrice } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nombre de producto requerido' });
    }

    let data = [];
    if (fs.existsSync(productsDbFile)) {
      data = JSON.parse(fs.readFileSync(productsDbFile, 'utf8'));
    }
    const newProduct = { id: req.body.id || Date.now().toString(), ...req.body };
    data.push(newProduct);
    writeCollection('products', data, { action: 'add', collection: 'products', doc: newProduct });
    res.json({ success: true, product: newProduct });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error agregando producto' });
  }
});

// Eliminar producto local (Solo Admin + CSRF)
app.delete('/api/products/:id', requireAuth, requireRole('admin'), verifyCsrf, (req, res) => {
  try {
    if (!fs.existsSync(productsDbFile)) {
      return res.status(404).json({ error: 'DB no encontrada' });
    }
    const data = JSON.parse(fs.readFileSync(productsDbFile, 'utf8'));
    const previousDoc = data.find(p => String(p.id) === String(req.params.id));
    const filtered = data.filter(p => String(p.id) !== String(req.params.id));
    writeCollection('products', filtered, { action: 'delete', collection: 'products', doc: { id: req.params.id } }, previousDoc);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error eliminando producto' });
  }
});

// Endpoint seguro para recibir videos/imágenes/documentos (Fase 1F-A)
// Blindado con: requireUploadAuth + verifyCsrf + handleMulterUpload + magic numbers validation + random filenames
app.post('/api/upload', requireUploadAuth, verifyCsrf, handleMulterUpload, (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se enviaron archivos para subir.' });
    }

    const savedUrls = [];

    for (const file of req.files) {
      const rawExt = path.extname(file.originalname || '').toLowerCase();
      const declaredMime = String(file.mimetype || '').toLowerCase().trim();

      // Resolver extensión normalizada segura
      let safeExt = rawExt;
      if (!ALLOWED_EXTENSIONS.has(safeExt)) {
        if (declaredMime === 'image/jpeg') safeExt = '.jpg';
        else if (declaredMime === 'image/png') safeExt = '.png';
        else if (declaredMime === 'image/webp') safeExt = '.webp';
        else if (declaredMime === 'application/pdf') safeExt = '.pdf';
        else if (declaredMime === 'video/mp4') safeExt = '.mp4';
        else {
          return res.status(415).json({ error: 'Extensión de archivo no permitida.' });
        }
      }

      // Validar Magic Numbers en el buffer en memoria
      const isSignatureValid = validateFileBufferSignature(file.buffer, declaredMime, safeExt);
      if (!isSignatureValid) {
        return res.status(415).json({
          error: 'El contenido del archivo no coincide con un formato válido o fue manipulado.'
        });
      }

      // Generar nombre aleatorio criptográficamente seguro (Inmune a path traversal y colisiones)
      const randomId = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now();
      const safeFilename = `upload-${timestamp}-${randomId}${safeExt}`;
      const destinationPath = path.join(uploadDir, safeFilename);

      // Persistir de forma segura
      fs.writeFileSync(destinationPath, file.buffer);
      savedUrls.push(`/uploads/${safeFilename}`);
    }

    // Retornar urls y fileUrls para máxima compatibilidad con los consumidores frontend
    res.json({
      success: true,
      urls: savedUrls,
      fileUrls: savedUrls
    });
  } catch (error) {
    console.error('[Upload Security Error]:', error.message || error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la subida.' });
  }
});



// Configuración de Nodemailer (Email de Recuperación)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'cherokejd566@gmail.com',
    pass: process.env.EMAIL_PASS // ¡La contraseña de aplicación que pondrá el usuario en el .env!
  }
});

/**
 * Helper de despacho de OTP (WhatsApp / Email)
 * Se reutiliza tanto por el nuevo endpoint server-side /request como por simulación y legacy
 */
async function dispatchRecoveryOtp({ channel = 'email', recipient, code, name }) {
  if (!code) throw new Error('Falta el código de recuperación');
  if (!recipient) throw new Error('Falta el destinatario para despacho');

  if (channel === 'whatsapp') {
    let cleanPhone = String(recipient).replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '58' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('58') && cleanPhone.length === 10) {
      cleanPhone = '58' + cleanPhone;
    }

    const messageText = `🔒 *Mundo Kalu - Seguridad*\n\nHola *${name || 'Usuario'}*,\nTu código de verificación para restablecer tu PIN es:\n\n👉 *${code}*\n\n_Por seguridad, no compartas este código con nadie._`;

    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1344089325449515';
    const waApiKey = process.env.WHATSAPP_API_KEY || process.env.API_KEY || process.env.WHATSAPP_TOKEN;
    const waApiUrl = process.env.WHATSAPP_API_URL || (phoneId ? `https://graph.facebook.com/v20.0/${phoneId}/messages` : null);

    if (waApiUrl && waApiKey) {
      try {
        console.log(`[Robot WhatsApp] Despachando PIN a ${cleanPhone} vía Meta Cloud API...`);
        const isMetaCloudApi = waApiUrl.includes('graph.facebook.com');
        const payload = isMetaCloudApi ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: messageText
          }
        } : {
          phone: cleanPhone,
          to: cleanPhone,
          message: messageText,
          body: messageText,
          text: messageText
        };

        const response = await fetch(waApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${waApiKey}`,
            'x-api-key': waApiKey
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('[Robot WhatsApp] Error en pasarela Meta/Proveedor:', response.status, errText);
          return { success: false, channel: 'whatsapp', recipient: cleanPhone, error: errText };
        }

        const data = await response.json().catch(() => ({ success: true }));
        return { success: true, channel: 'whatsapp', recipient: cleanPhone, data };
      } catch (error) {
        console.error('[Robot WhatsApp] Error de conexión:', error.message);
        return { success: false, channel: 'whatsapp', recipient: cleanPhone, error: error.message };
      }
    } else {
      // Modo simulación local / DEV
      console.log(`[Robot WhatsApp] (Modo Simulación) Despacho simulado a ${cleanPhone}`);
      return { success: true, channel: 'whatsapp', simulated: true, recipient: cleanPhone };
    }
  }

  // Email
  const emailUser = process.env.EMAIL_USER || 'cherokejd566@gmail.com';
  const emailPass = process.env.EMAIL_PASS;

  if (!emailPass) {
    console.log(`[Robot Correo] (Modo Simulación/DEV) EMAIL_PASS no configurado. Simulación a ${recipient}`);
    return { success: true, channel: 'email', simulated: true, recipient };
  }

  const dynamicTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });

  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #020617; color: #f8fafc; border-radius: 20px; overflow: hidden; border: 1px solid #1e293b;">
      <div style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 2px solid #10b981;">
        <h1 style="color: #10b981; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px;">MUNDO KALU</h1>
      </div>
      <div style="padding: 40px 30px; text-align: center;">
        <h2 style="margin-top: 0; color: #e2e8f0;">Recuperación de Acceso</h2>
        <p style="color: #94a3b8; font-size: 16px; line-height: 1.5;">
          Hola ${name || 'Usuario'},<br><br>
          Has solicitado restablecer tu PIN de seguridad. Utiliza el siguiente código de 6 dígitos para validar tu identidad y crear una nueva clave en tu dispositivo:
        </p>
        <div style="margin: 30px auto; background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; width: fit-content;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #10b981;">${code}</span>
        </div>
        <p style="color: #ef4444; font-size: 14px; font-weight: bold; margin-bottom: 0;">
          NO COMPARTAS ESTE CÓDIGO CON NADIE.
        </p>
        <p style="color: #64748b; font-size: 13px; margin-top: 5px;">
          Nadie del equipo de Mundo Kalu te pedirá este código.
        </p>
      </div>
      <div style="background-color: #020617; padding: 20px; text-align: center; border-top: 1px solid #1e293b;">
        <p style="margin: 0; color: #475569; font-size: 12px;">© ${new Date().getFullYear()} Mundo Kalu. Todos los derechos reservados.</p>
      </div>
    </div>
  `;

  try {
    await dynamicTransporter.sendMail({
      from: `"Mundo Kalu Seguridad" <${emailUser}>`,
      to: recipient,
      subject: 'Tu código de recuperación de Mundo Kalu',
      html: htmlTemplate
    });
    console.log(`[Robot Correo] Correo despachado exitosamente a ${recipient}`);
    return { success: true, channel: 'email', recipient };
  } catch (error) {
    console.error('[Robot Correo] Error enviando correo:', error);
    return { success: false, channel: 'email', recipient, error: error.message };
  }
}


// --- WHATSAPP BUSINESS WEBHOOK ENDPOINTS ---

// 1. Verificación del Webhook por Meta (GET)
app.get(['/api/webhook', '/webhook'], (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'kalu_sabanota_secure_token_2026';

  console.log(`[WhatsApp Webhook GET] Verificando: mode=${mode}, token=${token}, challenge=${challenge}`);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] ✅ Handshake de verificación completado con Meta.');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(String(challenge));
  } else {
    console.warn('[WhatsApp Webhook] ❌ Token o modo inválido:', { mode, token, expectedToken: VERIFY_TOKEN });
    return res.status(403).send('Verification token mismatch');
  }
});

// Funciones auxiliares del Robot Kalu para WhatsApp
function normalizeWhatsAppPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = '58' + cleaned.substring(1);
  }
  return cleaned;
}

function findClientByPhone(phone, clientsList) {
  const normalizedInput = normalizeWhatsAppPhone(phone);
  return clientsList.find(client => {
    const clientPhone = normalizeWhatsAppPhone(client.phone || client.telefono || '');
    return clientPhone === normalizedInput || clientPhone.endsWith(normalizedInput.slice(-10));
  });
}

async function sendWhatsAppDirectMessage(toPhone, messageBody) {
  const isDev = process.env.NODE_ENV === 'development' || process.env.WHATSAPP_MODE === 'simulation';
  const token = process.env.WHATSAPP_API_KEY;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1344089325449515';

  if (isDev || !token || !phoneId) {
    console.log(`[Robot Kalu WhatsApp (DEV/Simulado)] A: ${toPhone}\nMensaje:\n${messageBody}\n-----------------------------`);
    return { success: true, simulated: true, recipient: toPhone };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body: messageBody }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[Robot Kalu WhatsApp] Error enviando respuesta:', data);
    } else {
      console.log(`[Robot Kalu WhatsApp] ✅ Respuesta despachada con éxito a ${toPhone}`);
    }
    return data;
  } catch (error) {
    console.error('[Robot Kalu WhatsApp] Excepción al enviar mensaje:', error.message);
  }
}

async function downloadMetaMediaAsBase64(mediaId) {
  const token = process.env.WHATSAPP_API_KEY;
  if (!token || !mediaId) return null;

  try {
    // 1. Obtener la URL temporal de descarga del medio desde Meta Graph API
    console.log(`[Robot Kalu Audio] 🔍 Consultando URL de descarga para mediaId: ${mediaId}...`);
    const mediaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!mediaRes.ok) {
      console.error('[Robot Kalu Audio] Error obteniendo URL de audio de Meta:', mediaRes.status);
      return null;
    }
    const mediaData = await mediaRes.json();
    const directUrl = mediaData.url;

    if (!directUrl) {
      console.error('[Robot Kalu Audio] No se encontró URL directa en la respuesta de Meta.');
      return null;
    }

    // 2. Descargar el archivo binario del audio
    console.log(`[Robot Kalu Audio] 📥 Descargando archivo binario de audio...`);
    const fileRes = await fetch(directUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!fileRes.ok) {
      console.error('[Robot Kalu Audio] Error descargando archivo de audio:', fileRes.status);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    console.log(`[Robot Kalu Audio] ✅ Audio descargado y convertido a Base64 (${base64Audio.length} caracteres).`);
    return {
      base64Audio,
      mimeType: mediaData.mime_type || 'audio/ogg'
    };
  } catch (error) {
    console.error('[Robot Kalu Audio] Excepción descargando audio:', error.message);
    return null;
  }
}

// --- CONTROL ANTI-SPAM Y ENFRIAMIENTO (BOT KALU) ---
const userMessageHistory = new Map(); // phone -> Array de timestamps en ms
const userCooldownMap = new Map();    // phone -> timestamp límite de enfriamiento

function checkUserRateLimit(phone) {
  const now = Date.now();
  const TEN_MINUTES = 10 * 60 * 1000;

  // 1. Si el usuario está en periodo de enfriamiento activo
  if (userCooldownMap.has(phone)) {
    const cooldownExpires = userCooldownMap.get(phone);
    if (now < cooldownExpires) {
      return { isRateLimited: true, inCooldown: true };
    } else {
      userCooldownMap.delete(phone);
    }
  }

  // 2. Filtrar mensajes de los últimos 10 minutos
  const timestamps = (userMessageHistory.get(phone) || []).filter(t => now - t < TEN_MINUTES);
  timestamps.push(now);
  userMessageHistory.set(phone, timestamps);

  // 3. Activar enfriamiento si supera los 5 mensajes en menos de 10 minutos
  if (timestamps.length > 5) {
    const cooldownDuration = 15 * 60 * 1000; // 15 minutos de pausa
    userCooldownMap.set(phone, now + cooldownDuration);
    return { isRateLimited: true, justTriggered: true };
  }

  return { isRateLimited: false };
}

// 2. Recepción y Procesamiento de Mensajes Entrantes de WhatsApp (POST)
app.post(['/api/webhook', '/webhook'], async (req, res) => {
  console.log('\n====================================================');
  console.log('⚡ [WEBHOOK ENTRANTE] Meta acaba de tocar POST /api/webhook a las', new Date().toISOString());
  console.log('📦 PAYLOAD COMPLETO RECIBIDO:\n', JSON.stringify(req.body, null, 2));
  console.log('====================================================\n');
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account' || body.object) {
      // Responder 200 OK de inmediato a Meta para cumplir el SLA
      res.status(200).send('EVENT_RECEIVED');

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value && value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const fromPhone = message.from;
            const messageType = message.type;

            console.log(`[Robot Kalu] 📩 Mensaje recibido de ${fromPhone} (Tipo: ${messageType})`);

            // 1. FILTRO DE MULTIMEDIA (IMÁGENES / CAPTURES / COMPROBANTES)
            if (messageType === 'image' || messageType === 'document') {
              const replyText = `¡Hola! 👋 Hemos recibido tu comprobante de pago con éxito.\n\nPara validar tu abono de forma inmediata en el sistema, por favor regístralo a través de tu portal oficial:\n👉 https://sistemakalu.com/?portal=cliente\n\nAllí podrás verificar tu saldo actualizado y el historial de tus facturas al instante.`;
              await sendWhatsAppDirectMessage(fromPhone, replyText);
              continue;
            }

            // 2. CONTROL ANTI-SPAM / ENFRIAMIENTO (MÁXIMO 5 MENSAJES EN 10 MINUTOS)
            const rateLimit = checkUserRateLimit(fromPhone);
            if (rateLimit.isRateLimited) {
              if (rateLimit.justTriggered) {
                const cooldownNotice = `Hemos detectado múltiples mensajes continuos. Por tu comodidad y para brindarte una atención personalizada, hemos transferido tu conversación a la bandeja de un asesor humano de nuestro equipo. En breve un operador se comunicará contigo. ¡Muchas gracias por tu paciencia!`;
                await sendWhatsAppDirectMessage(fromPhone, cooldownNotice);
              }
              console.log(`[Robot Kalu Anti-Spam] Mensaje de ${fromPhone} silenciado por periodo de enfriamiento.`);
              continue;
            }

            // 3. PROCESAMIENTO DE MENSAJES DE TEXTO Y NOTAS DE VOZ (AUDIO/OGG)
            if (messageType === 'text' || messageType === 'audio' || messageType === 'voice') {
              let userText = '';
              let audioData = null;

              if (messageType === 'text') {
                userText = message.text?.body || '';
              } else if (messageType === 'audio' || messageType === 'voice') {
                const mediaId = message.audio?.id || message.voice?.id;
                console.log(`[Robot Kalu] 🎙️ Procesando nota de voz recibida (Media ID: ${mediaId})...`);
                audioData = await downloadMetaMediaAsBase64(mediaId);
              }

              // Cargar colecciones vivas del sistema
              const clients = readCollection('clients');
              const installments = readCollection('installments');
              const products = readCollection('products');
              const settings = readCollection('settings');
              const generalSettings = Array.isArray(settings) ? (settings.find(s => s.id === 'general') || {}) : settings;

              const client = findClientByPhone(fromPhone, clients);

              if (!client) {
                const unregisteredReply = `¡Hola! Gracias por escribirnos a Mundo Kalu. No logramos asociar tu número de teléfono con nuestros registros del sistema. Si ya eres cliente, por favor indícanos tu número de cédula o razón social para ayudarte.`;
                await sendWhatsAppDirectMessage(fromPhone, unregisteredReply);
                continue;
              }

              const clientId = client.id || client._id;
              const pendingInstallments = installments.filter(inst => (String(inst.clientId) === String(clientId) || String(inst.client_id) === String(clientId)) && inst.status === 'pending');
              const exchangeRate = Number(generalSettings.exchangeRate || generalSettings.bcvRate || 807.38);

              // Contexto enriquecido para el motor de Inteligencia Artificial (Ventas Directas)
              const systemPrompt = `
              Eres Kalu, el asesor de ventas y asistente virtual inteligente oficial de Mundo Kalu Sabanota.
              Estás atendiendo al cliente: ${client.name || client.nombre || 'Cliente'}.
              Tasa oficial BCV actual: ${exchangeRate} VES/USD.

              ESTADO DE CUENTA Y CUOTAS PENDIENTES DEL CLIENTE:
              ${JSON.stringify(pendingInstallments, null, 2)}

              INVENTARIO DISPONIBLE (PRECIOS Y EXISTENCIAS):
              ${JSON.stringify(products.map(p => ({
                id: p.id,
                nombre: p.name,
                categoria: p.category,
                precio_usd: p.sellingPrice || p.price || 0,
                stock: p.stockKg ?? p.stock ?? 0,
                unidad: p.unit || 'Und'
              })), null, 2)}

              REGLAS ESTRICTAS DE VENTAS DIRECTAS Y ATENCIÓN (CERO RODEOS):
              1. RESPUESTAS INMEDIATAS DE EXISTENCIA Y PRECIOS:
                 - Si el cliente pregunta por la disponibilidad o precio de cualquier producto (ej: "embobinado cuatro cables", repuestos, víveres, quesos), responde DE INMEDIATO en tu primer mensaje confirmando la existencia y desglosando de una vez las opciones disponibles con sus precios respectivos.
                 - Si existen variaciones o calidades (ej: calidad 100% cobre a $X vs opción económica a $Y, o diferentes marcas/presentaciones), preséntalas de forma clara, directa y con sus precios en USD y en Bolívares a la tasa BCV (${exchangeRate} Bs/$).
                 - ESTÁ ESTRICTAMENTE PROHIBIDO dar rodeos, vueltas o hacer esperar al cliente antes de brindar los precios y la disponibilidad.

              2. ENLACES A PORTALES OFICIALES:
                 - Si el cliente pregunta cómo pagar, reportar un abono o ver sus recibos, envíale de inmediato el enlace oficial del Portal de Clientes:
                   👉 https://sistemakalu.com/?portal=cliente
                 - Si el usuario solicita acceso como productor, entrega de queso o área de arrime, envíale de inmediato el enlace oficial del Portal de Productores:
                   👉 https://sistemakalu.com/?portal=productor

              3. DEUDAS Y CONSULTAS DE SALDO:
                 - Si consulta su saldo o cuotas pendientes, indica el monto exacto en USD y en Bolívares calculados a la tasa BCV (${exchangeRate} Bs/$).

              4. TONO COMERCIAL Y CONCISO:
                 - Responde de forma amable, directa, ejecutiva y enfocada en cerrar la venta o resolver la inquietud rápidamente. Usa formato WhatsApp legible con negritas (*) y viñetas limpias.
              `;

              let botReply = "Disculpa, en este momento estoy experimentando dificultades técnicas. Intenta nuevamente en unos minutos.";

              if (ai) {
                try {
                  const parts = [{ text: systemPrompt }];

                  if (audioData) {
                    // Inyectar el audio en base64 para transcripción y respuesta multimodal directa con Gemini
                    parts.push({
                      inlineData: {
                        mimeType: audioData.mimeType,
                        data: audioData.base64Audio
                      }
                    });
                    parts.push({ text: "Escucha la nota de voz del cliente arriba y responde a su consulta siguiendo las reglas estrictas de ventas directas." });
                  } else {
                    parts.push({ text: "Mensaje del cliente: " + userText });
                  }

                  let aiResponse = null;
                  const modelsToTry = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
                  for (const m of modelsToTry) {
                    try {
                      aiResponse = await ai.models.generateContent({
                        model: m,
                        contents: [{ role: 'user', parts }]
                      });
                      if (aiResponse && aiResponse.text) break;
                    } catch (mErr) {
                      console.warn(`[Robot Kalu AI] Reintentando con modelo alternativo tras fallo en ${m}...`);
                    }
                  }
                  if (aiResponse && aiResponse.text) {
                    botReply = aiResponse.text;
                  }
                } catch (aiErr) {
                  console.error('[Robot Kalu AI] Error generando respuesta con Gemini:', aiErr.message);
                }
              }

              await sendWhatsAppDirectMessage(fromPhone, botReply);
            }
          }
        }
      }
      return;
    }

    res.sendStatus(404);
  } catch (error) {
    console.error('[Robot Kalu Webhook] Error en procesamiento:', error);
    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
});

// ============================================================
// SUBSISTEMA SERVER-SIDE DE IA / GOOGLE GEMINI (FASE 1E-A)
// ============================================================

// Rate limiter específico para consumo de IA (Máximo 30 peticiones por minuto por sesión/IP)
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Clave por ID de usuario autenticado si existe, fallback a IP
    if (req.user?.id) return `user_${req.user.id}`;
    if (req.session?.userId) return `session_user_${req.session.userId}`;
    return req.ip || 'unknown_ip';
  },
  message: {
    success: false,
    error: 'Demasiadas solicitudes al servicio de Inteligencia Artificial. Por favor espere un momento.'
  }
});

// Helper de ejecución resiliente con modelos Gemini server-side
async function generateGeminiContentServer({ prompt, systemInstruction, imageBase64, mimeType, responseJson = false, maxOutputTokens, temperature = 0.2 }) {
  if (!ai) {
    throw new Error('Servicio de IA no configurado en el servidor');
  }

  const parts = [];
  if (systemInstruction) {
    parts.push({ text: String(systemInstruction) });
  }
  if (prompt) {
    parts.push({ text: String(prompt) });
  }
  if (imageBase64 && mimeType) {
    parts.push({
      inlineData: {
        data: imageBase64,
        mimeType: mimeType
      }
    });
  }

  const config = {
    temperature
  };
  if (responseJson) {
    config.responseMimeType = 'application/json';
  }
  if (maxOutputTokens) {
    config.maxOutputTokens = maxOutputTokens;
  }

  const models = ['gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
  let lastError = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err) {
      lastError = err;
      // Si el error fue disparado en testing o es un error terminal, propagar
      if (err.message && err.message.includes('Google AI upstream error')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta de la IA');
}

// 1. Estado de disponibilidad de IA (GET /api/ai/status)
// Requiere sesión CRM activa. No revela keys ni configuraciones internas sensibles.
app.get('/api/ai/status', requireAuth, (req, res) => {
  res.json({
    available: isGeminiConfigured(),
    engine: isGeminiConfigured() ? 'active' : 'unavailable'
  });
});

// 2. Chat / Asistente Financiero General (POST /api/ai/chat)
// Accesible para roles CRM (admin, accountant, cajero).
app.post('/api/ai/chat', requireAuth, requireRole('admin', 'accountant', 'cajero'), verifyCsrf, aiRateLimiter, async (req, res) => {
  try {
    const { prompt, context, imageBase64, mimeType } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'El prompt es requerido y debe ser texto' });
    }

    if (prompt.length > 8000) {
      return res.status(413).json({ success: false, error: 'El prompt excede el tamaño máximo permitido (8000 caracteres)' });
    }

    if (context && typeof context !== 'string') {
      return res.status(400).json({ success: false, error: 'El contexto debe ser texto' });
    }

    if (imageBase64) {
      if (typeof imageBase64 !== 'string' || imageBase64.length > 7 * 1024 * 1024) {
        return res.status(413).json({ success: false, error: 'La imagen excede el límite máximo de 5MB' });
      }
      if (!mimeType || !['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(mimeType)) {
        return res.status(400).json({ success: false, error: 'Formato de imagen no soportado' });
      }
    }

    if (!isGeminiConfigured()) {
      return res.status(503).json({ success: false, error: 'El servicio de IA no está configurado en el servidor' });
    }

    const systemContext = context || 'Eres un asistente experto en finanzas y control de inventario de la Quesería Kalu.';
    const textResponse = await generateGeminiContentServer({
      prompt,
      systemInstruction: systemContext,
      imageBase64: imageBase64 || undefined,
      mimeType: mimeType || undefined,
      temperature: 0.3
    });

    res.json({
      success: true,
      text: textResponse || 'No se pudo generar una respuesta clara.'
    });
  } catch (error) {
    console.error('[AI Chat Error]:', error.message || 'Error en comunicación con IA');
    res.status(500).json({ success: false, error: 'Ocurrió un error al procesar la solicitud con la IA' });
  }
});

// 3. Comandos de Lenguaje Natural de Inventario (POST /api/ai/inventory-command)
// Exclusivo para personal administrativo y cajeros con gestión de stock.
app.post('/api/ai/inventory-command', requireAuth, requireRole('admin', 'accountant', 'cajero'), verifyCsrf, aiRateLimiter, async (req, res) => {
  try {
    const { command, products } = req.body || {};

    if (!command || typeof command !== 'string' || !command.trim()) {
      return res.status(400).json({ success: false, error: 'El comando es requerido y debe ser texto' });
    }

    if (command.length > 2000) {
      return res.status(413).json({ success: false, error: 'El comando excede la longitud permitida' });
    }

    if (products && !Array.isArray(products)) {
      return res.status(400).json({ success: false, error: 'El catálogo de productos debe ser un arreglo' });
    }

    if (!isGeminiConfigured()) {
      return res.status(503).json({ success: false, error: 'El servicio de IA no está configurado en el servidor' });
    }

    const catalogSummary = (Array.isArray(products) ? products : []).slice(0, 300).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      unit: p.unit,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
    }));

    const promptText = `
      Eres un asistente virtual avanzado integrado en un sistema CRM de gestión de inventario.
      Tu tarea es interpretar la orden del usuario y devolver una respuesta en JSON puro con las acciones a ejecutar.

      CATÁLOGO ACTUAL (Solo lectura/referencia):
      ${JSON.stringify(catalogSummary)}

      ORDEN DEL USUARIO:
      "${command}"

      INSTRUCCIONES Y REGLAS ESTRICTAS:
      1. DEBES responder SIEMPRE con un único objeto JSON (nada de Markdown \`\`\`json, ni texto antes ni después).
      2. El JSON debe tener la siguiente estructura estricta:
         {
           "actions": [
             {
               "type": "ADD_PRODUCT" | "UPDATE_PRODUCT" | "NOTIFY" | "ERROR",
               "payload": { ... } // Los datos requeridos según la acción
             }
           ],
           "message": "Un mensaje amigable y breve en lenguaje natural sobre lo que vas a hacer (para mostrar al usuario)"
         }
      3. Para ADD_PRODUCT, el payload debe incluir: name, category (SOLO puedes usar: Repuestos, Charcutería, Víveres, Genérico), unit (Kg, Lt, Und), purchasePrice, sellingPrice, stockKg (por defecto 0).
      4. Para UPDATE_PRODUCT, el payload debe incluir: id (DEBE coincidir con el ID del catálogo actual) y los campos a actualizar (name, category, unit, purchasePrice, sellingPrice).
      5. Para NOTIFY o ERROR, el payload puede estar vacío o tener un mensaje.
      6. No puedes realizar borrado de productos (es destructivo). Si te piden borrar, usa NOTIFY indicando que debes hacerlo manualmente.
      7. Sé inteligente con la orden: si el usuario pide actualizar un producto por nombre, búscalo en el catálogo actual para obtener su ID. Si no lo encuentras, usa NOTIFY.
    `;

    const rawResult = await generateGeminiContentServer({
      prompt: promptText,
      responseJson: true,
      temperature: 0.1
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(cleanText || '{}');

    res.json({
      success: true,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      message: parsed.message || 'Comando procesado correctamente'
    });
  } catch (error) {
    console.error('[AI Inventory Command Error]:', error.message || 'Error en IA');
    res.status(500).json({ success: false, error: 'Fallo de comunicación con la IA' });
  }
});

// 4. OCR y Extracción de Facturas (POST /api/ai/ocr-invoice)
// Exclusivo para Administrador y Contador.
app.post('/api/ai/ocr-invoice', requireAuth, requireRole('admin', 'accountant'), verifyCsrf, aiRateLimiter, async (req, res) => {
  try {
    const { imageBase64, mimeType, bcvRate = 45, inventoryNames = [] } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'La imagen de la factura es obligatoria (Base64)' });
    }

    if (imageBase64.length > 10 * 1024 * 1024) { // ~7.5MB raw
      return res.status(413).json({ success: false, error: 'La imagen excede el límite de tamaño permitido' });
    }

    const cleanMime = mimeType || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'].includes(cleanMime)) {
      return res.status(400).json({ success: false, error: 'Tipo de archivo no compatible para OCR' });
    }

    if (!isGeminiConfigured()) {
      return res.status(503).json({ success: false, error: 'El servicio de IA no está configurado en el servidor' });
    }

    const safeRate = Number(bcvRate) > 0 ? Number(bcvRate) : 45;
    const safeNames = Array.isArray(inventoryNames) ? inventoryNames.slice(0, 500) : [];

    const promptText = `
      Eres un asistente experto en contabilidad y auditoría de inventarios para comercios.
      Extrae los datos de esta factura de compra en formato JSON estricto.

      REGLAS DE ORO:
      1. Responde ÚNICAMENTE con un objeto JSON válido (sin bloques markdown ni explicaciones adicionales).
      2. UNIDADES Y BULTOS:
         - Si la factura menciona "Bulto", "Caja", "Fardo", "Saco", "Paquete" o abreviaciones como "BTO", "CJ", "PQ", clasifícalo como 'Bulto'.
         - Si es por peso o volumen: 'Kg' o 'Lt'.
         - Para unidades sueltas: 'Und'.
      3. MONEDA Y CONVERSIÓN:
         - Tasa de cambio BCV oficial: ${safeRate} Bs/$.
         - Si la factura o renglón está en Bolívares (Bs), conviértelo a USD dividiendo entre ${safeRate}.
         - Si está en USD o dólares ($), mantén los montos en USD.
         - "costo_unitario" y "costo_total" DEBEN ser números en USD mayores a 0.
      4. EMPAREJAMIENTO CON CATÁLOGO EXISTENTE (Evitar duplicados):
         - CATÁLOGO ACTUAL: ${safeNames.length > 0 ? safeNames.join(", ") : "Vacío"}.
         - Si un ítem de la factura corresponde a un producto del catálogo (incluso con variaciones ortográficas, sinónimos o abreviaciones como 'Arroz Prim' -> 'Arroz Primo'), devuelve EXACTAMENTE el nombre que aparece en el catálogo.
         - Si definitivamente es un producto nuevo que no está en el catálogo, devuelve su nombre comercial limpio en mayúsculas.

      ESTRUCTURA JSON REQUERIDA:
      {
        "proveedor": { "nombre": "Nombre de la empresa o proveedor", "rif": "J-12345678" },
        "factura": "Número de factura o control",
        "fecha": "YYYY-MM-DD",
        "moneda_detectada": "USD" | "BS",
        "items": [
          { "nombre": "Nombre Canónico o Nuevo", "cantidad": 0, "unidad": "Und" | "Kg" | "Lt" | "Bulto", "costo_unitario": 0, "costo_total": 0 }
        ]
      }
    `;

    const rawData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const rawResult = await generateGeminiContentServer({
      prompt: promptText,
      imageBase64: rawData,
      mimeType: cleanMime,
      responseJson: true,
      temperature: 0.1
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(cleanText || '{}');

    if (parsed && parsed.items && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map(it => ({
        ...it,
        cantidad: Math.max(0.01, Number(it.cantidad) || 1),
        costo_unitario: Math.max(0, Number(it.costo_unitario) || 0),
        costo_total: Math.max(0, Number(it.costo_total) || 0)
      }));
    }

    res.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('[AI OCR Invoice Error]:', error.message || 'Error en OCR');
    res.status(500).json({ success: false, error: 'No fue posible procesar la factura con la IA' });
  }
});

// 5. Dictado de Compras (POST /api/ai/parse-dictation)
// Accesible para administradores y cajeros.
app.post('/api/ai/parse-dictation', requireAuth, requireRole('admin', 'accountant', 'cajero'), verifyCsrf, aiRateLimiter, async (req, res) => {
  try {
    const { text, bcvRate = 45, inventoryNames = [] } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'El texto del dictado es requerido' });
    }

    if (text.length > 5000) {
      return res.status(413).json({ success: false, error: 'El texto del dictado excede la longitud máxima permitida' });
    }

    if (!isGeminiConfigured()) {
      return res.status(503).json({ success: false, error: 'El servicio de IA no está configurado en el servidor' });
    }

    const safeRate = Number(bcvRate) > 0 ? Number(bcvRate) : 45;
    const safeNames = Array.isArray(inventoryNames) ? inventoryNames.slice(0, 500) : [];

    const promptText = `
      Eres un asistente contable y de compras de alta precisión.
      Analiza esta orden o dictado de mercancía: "${text}".
      Tasa BCV de referencia: ${safeRate} Bs/$.

      CATÁLOGO ACTUAL DE PRODUCTOS:
      ${safeNames.length > 0 ? safeNames.join(", ") : "Vacío"}

      REGLAS DE EXTRACCIÓN:
      1. Devuelve ÚNICAMENTE un JSON válido.
      2. UNIDADES: Clasifica en 'Und', 'Kg', 'Lt' o 'Bulto' (si dice bultos, sacos, paquetes o cajas).
      3. MONEDA: Si el dictado menciona precios en Bolívares o Bs, convierte a USD dividiendo entre ${safeRate}.
      4. PRECIOS/COSTOS: Si solo se menciona el total del producto, calcula el costo unitario (total / cantidad).
      5. EMPAREJAMIENTO: Empareja cada ítem con el nombre exacto del catálogo si existe, corrigiendo nombres hablados.

      ESTRUCTURA JSON:
      {
        "items": [
          { "nombre": "Nombre Exacto o Nuevo", "cantidad": 1, "unidad": "Und" | "Kg" | "Lt" | "Bulto", "costo_unitario": 0, "costo_total": 0 }
        ]
      }
    `;

    const rawResult = await generateGeminiContentServer({
      prompt: promptText,
      responseJson: true,
      temperature: 0.1
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(cleanText || '{}');

    let items = [];
    if (parsed.items && Array.isArray(parsed.items)) {
      items = parsed.items.map(it => ({
        ...it,
        cantidad: Math.max(0.01, Number(it.cantidad) || 1),
        costo_unitario: Math.max(0, Number(it.costo_unitario) || 0),
        costo_total: Math.max(0, Number(it.costo_total) || 0)
      }));
    }

    res.json({
      success: true,
      items
    });
  } catch (error) {
    console.error('[AI Parse Dictation Error]:', error.message || 'Error interpretando dictado');
    res.status(500).json({ success: false, error: 'Error procesando el dictado con la IA' });
  }
});

// 6. Estructuración de Notas de Voz Contables (POST /api/ai/parse-voice-note)
// Exclusivo para Administrador y Contador.
app.post('/api/ai/parse-voice-note', requireAuth, requireRole('admin', 'accountant'), verifyCsrf, aiRateLimiter, async (req, res) => {
  try {
    const { text, bcvRate = 45 } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'El texto de la nota de voz es requerido' });
    }

    if (text.length > 5000) {
      return res.status(413).json({ success: false, error: 'El texto de la nota de voz excede la longitud máxima' });
    }

    if (!isGeminiConfigured()) {
      return res.json({
        success: true,
        data: {
          title: 'Nota de Voz',
          category: 'nota_general',
          summary: text,
          suggestedAction: 'Revisar manualmente (IA no disponible)'
        }
      });
    }

    const safeRate = Number(bcvRate) > 0 ? Number(bcvRate) : 45;
    const promptText = `
      Analiza esta nota de voz contable de la Quesería Kalu: "${text}".
      Tasa BCV de referencia: ${safeRate} Bs/$.

      Tu tarea es estructurar y categorizar la nota en JSON estricto.

      REGLAS:
      1. Si menciona compras o gastos, extrae el monto. Si está en Bs, calcula el aproximado en USD.
      2. Categorías permitidas: 'gasto', 'ingreso', 'compra', 'deuda', 'nota_general'.
      3. Si menciona método de pago ('efectivo', 'pago móvil', 'transferencia', 'dólares'), identifícalo.
      4. Genera un título corto y un resumen claro de 1 línea.

      ESTRUCTURA JSON REQUERIDA:
      {
        "title": "Título corto y descriptivo",
        "category": "gasto" | "ingreso" | "compra" | "deuda" | "nota_general",
        "amountUsd": 0,
        "amountBs": 0,
        "paymentMethod": "Efectivo" | "Transferencia" | "Pago Móvil" | "Punto" | "Dólares",
        "summary": "Resumen ejecutivo de la operación",
        "suggestedAction": "Acción recomendada para el CRM"
      }
    `;

    const rawResult = await generateGeminiContentServer({
      prompt: promptText,
      responseJson: true,
      temperature: 0.1
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(cleanText || '{}');

    res.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('[AI Parse Voice Note Error]:', error.message || 'Error en nota de voz');
    res.status(500).json({ success: false, error: 'Error al estructurar nota de voz con IA' });
  }
});

// 7. Parseo de Giras y Despachos de Queso (POST /api/ai/parse-trip)
// Exclusivo para Administrador y Contador.
app.post('/api/ai/parse-trip', requireAuth, requireRole('admin', 'accountant'), verifyCsrf, aiRateLimiter, async (req, res) => {
  try {
    const { text, bcvRate = 813, productNames = [] } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'El texto de la orden de viaje es requerido' });
    }

    if (text.length > 5000) {
      return res.status(413).json({ success: false, error: 'El texto excede el límite permitido' });
    }

    if (!isGeminiConfigured()) {
      return res.status(503).json({ success: false, error: 'El servicio de IA no está configurado en el servidor' });
    }

    const safeRate = Number(bcvRate) > 0 ? Number(bcvRate) : 813;
    const safeProducts = Array.isArray(productNames) && productNames.length > 0
      ? productNames.slice(0, 100).join(', ')
      : 'QUESO DURO, QUESO SEMIDURO, QUESO BLANCO, QUESO PAISA';

    const promptText = `
      Eres el asistente operativo de la Quesería Kalu.
      Analiza esta orden hablada de salida para una gira/viaje a San Juan: "${text}".
      Tasa BCV actual: ${safeRate} Bs/$.

      CATÁLOGO DISPONIBLE DE PRODUCTOS DE QUESO:
      ${safeProducts}

      RESPONSABLES POSIBLES:
      - Daisy Corro
      - Juan Carlos Domínguez

      INSTRUCCIONES DE EXTRACCIÓN:
      1. Devuelve ÚNICAMENTE un JSON válido sin markdown.
      2. Identifica si menciona un responsable (Daisy o Juan Carlos). Si no menciona ninguno, omite el campo.
      3. Extrae la cantidad en kilogramos (dispatchedKg) y el tipo de queso. Empareja con el catálogo más cercano.
      4. Si menciona costo por kilo ($/Kg), extráelo en costPerKg.
      5. Extrae el efectivo en dólares adelantado (cashTakenUsd).
      6. Extrae el efectivo en bolívares adelantado (cashTakenBs).
      7. Extrae fondos adelantados desde Banco / Pago Móvil / Transferencia en Bolívares (bankTakenBs) o en Dólares (bankTakenUsd).

      ESTRUCTURA JSON:
      {
        "driver": "Daisy Corro" | "Juan Carlos Domínguez",
        "cheeseProductName": "Nombre del Producto del Catálogo",
        "dispatchedKg": 0,
        "costPerKg": 0,
        "cashTakenUsd": 0,
        "cashTakenBs": 0,
        "bankTakenUsd": 0,
        "bankTakenBs": 0
      }
    `;

    const rawResult = await generateGeminiContentServer({
      prompt: promptText,
      responseJson: true,
      temperature: 0.1
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(cleanText || '{}');

    res.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('[AI Parse Trip Error]:', error.message || 'Error en parseo de gira');
    res.status(500).json({ success: false, error: 'Error procesando salida de gira con IA' });
  }
});

// --- GENERIC COLLECTIONS API WITH ASYNC MUTEX LOCK ---

const getCollectionFilePath = (name) => path.join(dataDir, `${name}_db.json`);

// Async Mutex Queue per collection to prevent race conditions & file corruption
const collectionLocks = new Map();

const withCollectionLock = (name, fn) => {
  if (!collectionLocks.has(name)) {
    collectionLocks.set(name, Promise.resolve());
  }
  const currentPromise = collectionLocks.get(name);
  const nextPromise = currentPromise.then(async () => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[CollectionLock Error] (${name}):`, err);
      throw err;
    }
  });
  collectionLocks.set(name, nextPromise.catch(() => {}));
  return nextPromise;
};

const readCollection = (name) => {
  const filePath = getCollectionFilePath(name);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error(`Error parsing JSON for collection ${name}:`, e);
      return [];
    }
  }
  return [];
};

// ============================================================
// SISTEMA CENTRAL DE EMISIÓN SOCKET.IO DIRIGIDA (FASE 1D-D.2)
// ============================================================

/**
 * Sanitizar documento para consumo público (Catálogo de productos / banners)
 * Remueve campos confidenciales: costos, wholesalePrice, márgenes, notas internas.
 */
function sanitizePublicProduct(doc) {
  if (!doc || typeof doc !== 'object') return null;
  return {
    id: doc.id,
    name: doc.name,
    category: doc.category || 'Víveres',
    pricePerKg: Number(doc.pricePerKg || doc.sellingPrice || doc.price || 0),
    sellingPrice: Number(doc.sellingPrice || doc.pricePerKg || doc.price || 0),
    stockKg: Number(doc.stockKg ?? doc.stock ?? 0),
    stock: Number(doc.stock ?? doc.stockKg ?? 0),
    unit: doc.unit || 'Und',
    imageUrl: doc.imageUrl || doc.image || '',
    image: doc.image || doc.imageUrl || '',
    description: doc.description || ''
  };
}

/**
 * Sanitizar payload de colección para Portal Cliente
 * Remueve información sensible interna de otros usuarios/clientes y credenciales.
 */
function sanitizeClientPayload(collection, doc) {
  if (!doc || typeof doc !== 'object') return null;
  const { password, pin, passwordHash, pinHash, wholesalePrice, unitCost, totalCost, adminNotes, ...safe } = doc;
  return safe;
}

/**
 * Sanitizar payload de colección para Portal Productor
 * Remueve información sensible interna, márgenes ajenos y credenciales.
 */
function sanitizeProducerPayload(collection, doc) {
  if (!doc || typeof doc !== 'object') return null;
  const { password, pin, passwordHash, pinHash, wholesalePrice, adminNotes, ...safe } = doc;
  return safe;
}

/**
 * Extraer ID de cliente propietario de un documento
 */
function extractClientId(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.clientId) return String(doc.clientId);
  if (doc.client_id) return String(doc.client_id);
  if (doc.entityId && (doc.type === 'receivable' || doc.entityType === 'client' || doc.clientName)) {
    return String(doc.entityId);
  }
  return null;
}

/**
 * Extraer ID de proveedor/productor propietario de un documento
 */
function extractSupplierId(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.supplierId) return String(doc.supplierId);
  if (doc.supplier_id) return String(doc.supplier_id);
  if (doc.producerId) return String(doc.producerId);
  if (doc.entityId && (doc.type === 'payable' || doc.entityType === 'producer' || doc.supplierName)) {
    return String(doc.entityId);
  }
  return null;
}

/**
 * Función central y única de emisión segura para 'collection_delta'
 * Aplica reglas estrictas de room scoping y DTOs sanitizados según el destinatario.
 * @param {Object} delta - { action, collection, doc, id, count }
 * @param {Object} [previousDoc=null] - Documento previo en updates/deletes para tracking de ownership
 */
function emitCollectionDeltaScoped(delta, previousDoc = null) {
  if (!delta || !delta.collection) return;
  const { collection, action } = delta;
  const doc = delta.doc || (delta.id ? { id: delta.id } : null);

  // 1. Destinatarios CRM (Staff / Admin)
  if (ADMIN_ONLY_COLLECTIONS.has(collection)) {
    // Colecciones estrictamente administrativas: ÚNICAMENTE room:crm:admin
    io.to('room:crm:admin').emit('collection_delta', delta);
  } else {
    // Colecciones operativas generales del CRM: room:crm:staff (incluye a administradores y cajeros)
    io.to('room:crm:staff').emit('collection_delta', delta);
  }

  // 2. Destinatarios Portal Cliente
  const CLIENT_PORTAL_COLLECTIONS = new Set(['transactions', 'installments', 'pwa_payments', 'mobileOrders']);
  if (CLIENT_PORTAL_COLLECTIONS.has(collection)) {
    const currentClientId = extractClientId(doc);
    const prevClientId = extractClientId(previousDoc);

    if (currentClientId) {
      const sanitizedDoc = sanitizeClientPayload(collection, doc);
      const clientDelta = { ...delta, doc: sanitizedDoc };
      io.to(`room:portal:client:${currentClientId}`).emit('collection_delta', clientDelta);
    }

    // Si hubo cambio de propietario (ej. clientId A -> clientId B), notificar al propietario anterior la remoción
    if (prevClientId && prevClientId !== currentClientId) {
      const removalDelta = {
        action: 'delete',
        collection,
        doc: { id: doc?.id || delta.id || previousDoc.id }
      };
      io.to(`room:portal:client:${prevClientId}`).emit('collection_delta', removalDelta);
    }
  }

  // 3. Destinatarios Portal Productor
  const PRODUCER_PORTAL_COLLECTIONS = new Set(['cheeseTrips', 'transactions', 'mobileOrders']);
  if (PRODUCER_PORTAL_COLLECTIONS.has(collection)) {
    const currentSupplierId = extractSupplierId(doc);
    const prevSupplierId = extractSupplierId(previousDoc);

    if (currentSupplierId) {
      const sanitizedDoc = sanitizeProducerPayload(collection, doc);
      const producerDelta = { ...delta, doc: sanitizedDoc };
      io.to(`room:portal:producer:${currentSupplierId}`).emit('collection_delta', producerDelta);
    }

    // Si hubo cambio de propietario (ej. supplierId A -> supplierId B), notificar al propietario anterior la remoción
    if (prevSupplierId && prevSupplierId !== currentSupplierId) {
      const removalDelta = {
        action: 'delete',
        collection,
        doc: { id: doc?.id || delta.id || previousDoc.id }
      };
      io.to(`room:portal:producer:${prevSupplierId}`).emit('collection_delta', removalDelta);
    }
  }

  // 4. Destinatarios Públicos (room:public)
  if (collection === 'banners') {
    io.to('room:public').emit('collection_delta', delta);
  } else if (collection === 'products') {
    const publicDoc = sanitizePublicProduct(doc);
    const publicDelta = { ...delta, doc: publicDoc };
    io.to('room:public').emit('collection_delta', publicDelta);
  }
}

/**
 * Función central de emisión segura para 'collection_updated'
 * Emite la señal de recarga ÚNICAMENTE a las rooms autorizadas para esa colección.
 */
function emitCollectionUpdatedScoped(collectionName) {
  if (!collectionName) return;

  // CRM
  if (ADMIN_ONLY_COLLECTIONS.has(collectionName)) {
    io.to('room:crm:admin').emit('collection_updated', collectionName);
  } else {
    io.to('room:crm:staff').emit('collection_updated', collectionName);
  }

  // Público (solo banners)
  if (collectionName === 'banners') {
    io.to('room:public').emit('collection_updated', collectionName);
  }
}

const writeCollection = (name, data, delta = null, previousDoc = null) => {
  const filePath = getCollectionFilePath(name);
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  if (delta) {
    emitCollectionDeltaScoped(delta, previousDoc);
  } else {
    emitCollectionUpdatedScoped(name); // Scoped signal for full reload
  }
};

// --- ATOMIC POS SALE CHECKOUT ENDPOINT (Protegido con RBAC y CSRF) ---
app.post('/api/pos/process-sale', requireAuth, requireRole('admin', 'cajero'), verifyCsrf, async (req, res) => {
  try {
    const {
      saleItems,
      clientId,
      customerName,
      supplierId,
      paidAmount,
      saleTotalAmount,
      addedPayments,
      changeAmount,
      changeCurrency,
      changeReference,
      mixedChange,
      changeBs,
      bcvRateAtSettlement,
      paymentMethodType
    } = req.body || {};

    if (!Array.isArray(saleItems) || saleItems.length === 0) {
      return res.status(400).json({ error: 'La venta debe contener al menos un producto (saleItems).' });
    }

    const saleTotal = Number(saleTotalAmount !== undefined ? saleTotalAmount : (saleItems || []).reduce((sum, it) => sum + (it.subtotal || 0), 0));
    const amountPaid = Number(paidAmount !== undefined ? paidAmount : saleTotal);
    const debtAmount = Math.max(0, Math.round((saleTotal - amountPaid) * 100) / 100);

    // Global Lock for atomic transaction across collections
    const result = await withCollectionLock('GLOBAL_TRANSACTION', async () => {
      // 1. PRODUCTS & KARDEX
      const productsData = readCollection('products');
      const kardexData = readCollection('kardex');
      const updatedProducts = [];

      for (const item of (saleItems || [])) {
        const pIndex = productsData.findIndex(p => String(p.id) === String(item.productId));
        if (pIndex !== -1) {
          const p = productsData[pIndex];
          const newStock = Math.max(0, Math.round((Number(p.stockKg || 0) - Number(item.quantityKg || 0)) * 100) / 100);
          productsData[pIndex] = { ...p, stockKg: newStock };
          updatedProducts.push(productsData[pIndex]);

          // Kardex Entry
          const kardexMovement = {
            id: `kardex-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
            timestamp: Date.now(),
            productId: p.id,
            productName: p.name,
            unit: p.unit || 'Und',
            type: 'SALIDA_VENTA',
            quantity: Number(item.quantityKg || 0),
            previousStock: p.stockKg,
            newStock: newStock,
            unitCost: p.wholesalePrice || p.pricePerKg || 0,
            totalCost: Number(item.quantityKg || 0) * (p.wholesalePrice || p.pricePerKg || 0),
            totalValue: item.subtotal,
            referenceId: `POS-${Date.now()}`,
            notes: 'Venta registrada desde el POS'
          };
          kardexData.push(kardexMovement);
          emitCollectionDeltaScoped({ action: 'add', collection: 'kardex', doc: kardexMovement });
        }
      }
      writeCollection('products', productsData);
      // writeCollection sin delta emitiría collection_updated; pasamos { action: 'batchAdd', collection: 'kardex' } o guardamos el archivo
      const kardexPath = getCollectionFilePath('kardex');
      try {
        fs.writeFileSync(kardexPath, JSON.stringify(kardexData, null, 2), 'utf8');
      } catch (err) {
        fs.writeFileSync(kardexPath, JSON.stringify(kardexData, null, 2), 'utf8');
      }

      // 2. CLIENT / SUPPLIER
      let updatedClient = null;
      let updatedSupplier = null;
      let finalCustomerName = customerName || 'Cliente de Mostrador';

      if (clientId) {
        const clientsData = readCollection('clients');
        const cIndex = clientsData.findIndex(c => String(c.id) === String(clientId));
        if (cIndex !== -1) {
          const c = clientsData[cIndex];
          finalCustomerName = c.name;
          const addedPoints = Math.round(Number(amountPaid || 0));
          const newDebt = Math.round((Number(c.outstandingDebt || 0) + debtAmount) * 100) / 100;
          const newPoints = Number(c.loyaltyPoints || 0) + addedPoints;

          function getVIPCode(p = 0) {
            if (p >= 1200) return 'K6';
            if (p >= 750) return 'K5';
            if (p >= 450) return 'K4';
            if (p >= 250) return 'K3';
            if (p >= 120) return 'K2';
            return 'K1';
          }

          updatedClient = {
            ...c,
            outstandingDebt: newDebt,
            loyaltyPoints: newPoints,
            tier: getVIPCode(newPoints)
          };
          clientsData[cIndex] = updatedClient;
          writeCollection('clients', clientsData, { action: 'update', collection: 'clients', doc: updatedClient });
        }
      } else if (supplierId) {
        const suppliersData = readCollection('suppliers');
        const sIndex = suppliersData.findIndex(s => String(s.id) === String(supplierId));
        if (sIndex !== -1) {
          const s = suppliersData[sIndex];
          finalCustomerName = `${s.name} (Productor)`;
          const currentBalanceOwed = Number(s.balanceOwed || 0);
          let newBalanceOwed = currentBalanceOwed;
          let newStoreDebt = Number(s.storeDebt || 0);

          if (currentBalanceOwed > 0) {
            if (currentBalanceOwed >= debtAmount) {
              newBalanceOwed = Math.round((currentBalanceOwed - debtAmount) * 100) / 100;
            } else {
              newStoreDebt = Math.round((newStoreDebt + (debtAmount - currentBalanceOwed)) * 100) / 100;
              newBalanceOwed = 0;
            }
          } else {
            newStoreDebt = Math.round((newStoreDebt + debtAmount) * 100) / 100;
          }

          updatedSupplier = {
            ...s,
            storeDebt: newStoreDebt,
            balanceOwed: newBalanceOwed
          };
          suppliersData[sIndex] = updatedSupplier;
          writeCollection('suppliers', suppliersData, { action: 'update', collection: 'suppliers', doc: updatedSupplier });
        }
      }

      // 3. BILLS / RECEIVABLES & KALU INSTALLMENTS
      if (debtAmount > 0) {
        const billsData = readCollection('bills');
        const newBill = {
          id: `bill-rcv-${Date.now()}`,
          type: 'receivable',
          entityId: clientId || supplierId,
          entityName: finalCustomerName,
          amount: debtAmount,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          status: 'Pendiente',
          notes: `Consumo de tienda (${supplierId ? 'Libreta de Queso' : 'Crédito'})`
        };
        billsData.push(newBill);
        writeCollection('bills', billsData, { action: 'add', collection: 'bills', doc: newBill });

        // Atomic Installments generation for Kalu Credit
        const hasKaluMethod = (addedPayments || []).some(p => p.method === 'Mundo Kalu') || paymentMethodType === 'Mundo Kalu';
        if (hasKaluMethod && clientId) {
          const installmentsData = readCollection('installments');
          const kaluItem = (addedPayments || []).find(p => p.method === 'Mundo Kalu');
          const financedAmount = kaluItem ? Number(kaluItem.amount || debtAmount) : debtAmount;
          const installmentsCount = Number(req.body.installmentsCount || 3);
          const cuotaVal = Math.round((financedAmount / installmentsCount) * 100) / 100;
          let nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 15);

          for (let i = 0; i < installmentsCount; i++) {
            const installmentDoc = {
              id: `inst-${Date.now()}-${i + 1}`,
              clientId: clientId,
              transactionId: `TX-${Date.now()}`,
              amount: cuotaVal,
              dueDate: nextDate.toISOString().split('T')[0],
              status: 'pending',
              installmentNumber: i + 1,
              totalInstallments: installmentsCount,
              pointsEarned: Math.round(cuotaVal),
              pointsAwarded: false,
              createdAt: new Date().toISOString(),
              type: req.body.kaluCreditType || 'cotidiano'
            };
            installmentsData.push(installmentDoc);
            emitCollectionDeltaScoped({ action: 'add', collection: 'installments', doc: installmentDoc });
            nextDate.setDate(nextDate.getDate() + 15);
          }
          const installmentsPath = getCollectionFilePath('installments');
          try {
            fs.writeFileSync(installmentsPath, JSON.stringify(installmentsData, null, 2), 'utf8');
          } catch (err) {
            fs.writeFileSync(installmentsPath, JSON.stringify(installmentsData, null, 2), 'utf8');
          }
        }
      }

      // 4. CENTRAL VAULT BALANCE (BÓVEDA)
      const settingsData = readCollection('settings');
      let generalSettingsIndex = settingsData.findIndex(d => String(d.id) === 'general');
      let generalSettings = generalSettingsIndex !== -1 ? settingsData[generalSettingsIndex] : { id: 'general' };
      const currentVault = generalSettings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };

      let deltaUsd = 0;
      let deltaBs = 0;
      let deltaBankBs = 0;
      let deltaBankUsd = 0;
      const rate = bcvRateAtSettlement || generalSettings.exchangeRate || 42.5;

      if (addedPayments && Array.isArray(addedPayments) && addedPayments.length > 0) {
        addedPayments.forEach((p) => {
          const m = (p.method || '').toLowerCase().trim();
          const amt = Number(p.amount) || 0;
          const orig = Number(p.originalAmount) || 0;

          if (m.includes('efectivo') && (m.includes('$') || m.includes('usd') || (!m.includes('bs') && !m.includes('ves')))) {
            deltaUsd += amt;
          } else if (m.includes('efectivo') && (m.includes('bs') || m.includes('ves'))) {
            deltaBs += orig || (amt * rate);
          } else if (m.includes('movil') || m.includes('móvil') || m.includes('transfer') || m.includes('tarjeta') || m.includes('punto') || m.includes('bio') || m.includes('banco bs') || p.currency === 'Bs' || p.currency === 'VES') {
            deltaBankBs += orig || (amt * rate);
          } else if (m.includes('zelle') || m.includes('banco usd') || m.includes('binance') || m.includes('dolar') || m.includes('usd') || p.currency === 'USD') {
            deltaBankUsd += amt;
          } else {
            deltaBankBs += orig || (amt * rate);
          }
        });
      } else {
        const pm = (paymentMethodType || 'Efectivo').toLowerCase().trim();
        if (pm.includes('efectivo') && (pm.includes('$') || pm.includes('usd') || (!pm.includes('bs') && !pm.includes('ves')))) {
          deltaUsd += amountPaid;
        } else if (pm.includes('efectivo') && (pm.includes('bs') || pm.includes('ves'))) {
          deltaBs += amountPaid * rate;
        } else if (pm.includes('movil') || pm.includes('móvil') || pm.includes('transfer') || pm.includes('tarjeta') || pm.includes('punto') || pm.includes('bio')) {
          deltaBankBs += amountPaid * rate;
        } else if (pm.includes('zelle') || pm.includes('banco usd') || pm.includes('binance')) {
          deltaBankUsd += amountPaid;
        } else if (!pm.includes('crédito') && !pm.includes('fiado') && !pm.includes('libreta')) {
          deltaUsd += amountPaid;
        }
      }

      if (changeAmount && changeAmount > 0) {
        if (changeCurrency === 'USD') {
          deltaUsd -= changeAmount;
        } else if (changeCurrency === 'BS' || changeCurrency === 'PAGO_MOVIL') {
          deltaBs -= (changeBs || (changeAmount * rate));
        } else if (changeCurrency === 'MIXED' && mixedChange) {
          deltaUsd -= (Number(mixedChange.usd) || 0);
          deltaBs -= (Number(mixedChange.bs) || 0);
          deltaBankBs -= (Number(mixedChange.mobile) || 0);
        } else {
          deltaUsd -= changeAmount;
        }
      }

      const updatedVault = {
        usd: Math.round((currentVault.usd + deltaUsd) * 100) / 100,
        bs: Math.round((currentVault.bs + deltaBs) * 100) / 100,
        bankBs: Math.round((currentVault.bankBs + deltaBankBs) * 100) / 100,
        bankUsd: Math.round((currentVault.bankUsd + deltaBankUsd) * 100) / 100
      };
      generalSettings.centralVaultBalance = updatedVault;
      if (generalSettingsIndex !== -1) {
        settingsData[generalSettingsIndex] = generalSettings;
      } else {
        settingsData.push(generalSettings);
      }
      writeCollection('settings', settingsData, { action: 'update', collection: 'settings', doc: generalSettings });

      // 5. MAIN TRANSACTION RECORD
      let finalPaymentMethod = paymentMethodType || 'Efectivo';
      if (debtAmount > 0 && paidAmount === 0) {
        finalPaymentMethod = supplierId ? 'Libreta Quesero' : 'Crédito / Fiado';
      } else if (debtAmount > 0 && paidAmount > 0) {
        finalPaymentMethod = `Multipago (Efectivo + ${supplierId ? 'Libreta' : 'Crédito'})`;
      }

      const txsData = readCollection('transactions');
      const nowMs = Date.now();
      const newTx = {
        id: `TX-${nowMs}`,
        entity: finalCustomerName,
        clientId: clientId || null,
        supplierId: supplierId || null,
        debtAmount: debtAmount,
        createdAt: nowMs,
        category: 'ventas',
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        invoiceNumber: `F-${Math.floor(Math.random() * 9000 + 1000)}`,
        amount: saleTotal,
        isIncome: true,
        status: 'Completado',
        paymentMethod: finalPaymentMethod,
        items: saleItems || [],
        addedPayments: addedPayments || [],
        changeAmount: changeAmount || 0,
        changeCurrency: changeCurrency || 'USD',
        changeReference: changeReference || '',
        mixedChange: mixedChange || null,
        changeBs: changeBs || 0,
        bcvRateAtSettlement: rate
      };

      txsData.push(newTx);
      writeCollection('transactions', txsData, { action: 'add', collection: 'transactions', doc: newTx });

      return {
        transaction: newTx,
        client: updatedClient,
        supplier: updatedSupplier,
        products: updatedProducts,
        vault: updatedVault
      };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[POST /api/pos/process-sale] Error crítico procesando venta atómica:', error);
    res.status(500).json({ error: 'Error procesando venta atómica', details: error.message });
  }
});

app.get('/api/sync-rate', async (req, res) => {
  try {
    let rate = 0;

    // First provider
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        if (data && typeof data.promedio === 'number' && data.promedio > 0) {
          rate = data.promedio;
        }
      }
    } catch(e) {
      console.warn("dolarapi failed", e.message);
    }

    // Second provider fallback
    if (rate <= 0) {
      try {
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 4000);
        const resp2 = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv', { signal: controller2.signal });
        clearTimeout(timeout2);
        if (resp2.ok) {
          const data2 = await resp2.json();
          if (data2 && data2.monitors && data2.monitors.usd && data2.monitors.usd.price > 0) {
            rate = data2.monitors.usd.price;
          }
        }
      } catch(e2) {
        console.warn("pydolarve failed", e2.message);
      }
    }

    if (rate > 0) {
      // Update DB
      const data = readCollection('settings');
      let index = data.findIndex(d => String(d.id) === 'general');
      const timestamp = new Date().toISOString();
      if (index !== -1) {
        data[index] = { ...data[index], exchangeRate: rate, lastRateSync: timestamp };
        writeCollection('settings', data, { action: 'update', collection: 'settings', doc: data[index] });
      } else {
        const newDoc = { id: 'general', exchangeRate: rate, lastRateSync: timestamp };
        data.push(newDoc);
        writeCollection('settings', data, { action: 'add', collection: 'settings', doc: newDoc });
      }
      return res.json({ success: true, rate, timestamp });
    } else {
      return res.status(500).json({ error: 'Failed to fetch valid rate from any provider' });
    }
  } catch(error) {
    console.error("Error in sync-rate", error);
    res.status(500).json({ error: 'Internal server error during sync' });
  }
});

// 1. Leer colección genérica (Protegido con requireAuth y filtro por rol/colección)
app.get('/api/collections/:name', requireAuth, requireCollectionRead, (req, res) => {
  try {
    const data = readCollection(req.params.name);
    // Sanitizar colección de usuarios para jamás exponer contraseñas, PINs ni hashes
    if (req.params.name === 'users' && Array.isArray(data)) {
      const sanitized = data.map(u => {
        const { password, pin, passwordHash, pinHash, ...safe } = u;
        return safe;
      });
      return res.json(sanitized);
    }
    res.json(data);
  } catch (error) {
    console.error(`Error reading ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error reading collection' });
  }
});

// 2. Crear / Sobrescribir documento en colección (Protegido con requireAuth, validación de colección y CSRF)
app.post('/api/collections/:name', requireAuth, requireCollectionWrite, verifyCsrf, (req, res) => {
  try {
    const data = readCollection(req.params.name);
    const newDoc = { id: req.body.id || Date.now().toString(), ...req.body };
    const index = data.findIndex(d => String(d.id) === String(newDoc.id));

    if (index !== -1) {
      // Overwrite if it already exists to prevent duplication
      const previousDoc = { ...data[index] };
      data[index] = newDoc;
      writeCollection(req.params.name, data, { action: 'update', collection: req.params.name, doc: newDoc }, previousDoc);
    } else {
      data.push(newDoc);
      writeCollection(req.params.name, data, { action: 'add', collection: req.params.name, doc: newDoc });
    }
    res.json({ success: true, doc: newDoc });
  } catch (error) {
    console.error(`Error writing ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error writing collection' });
  }
});

// 3. Modificar / Upsert documento en colección (Protegido con requireAuth, validación de colección y CSRF)
app.patch('/api/collections/:name/:id', requireAuth, requireCollectionWrite, verifyCsrf, (req, res) => {
  try {
    const data = readCollection(req.params.name);
    const index = data.findIndex(d => String(d.id) === String(req.params.id));
    if (index !== -1) {
      const previousDoc = { ...data[index] };
      data[index] = { ...data[index], ...req.body };
      writeCollection(req.params.name, data, { action: 'update', collection: req.params.name, doc: data[index] }, previousDoc);
      res.json({ success: true, doc: data[index] });
    } else {
      // UPSERT: Create document if it does not exist
      const newDoc = { id: req.params.id, ...req.body };
      data.push(newDoc);
      writeCollection(req.params.name, data, { action: 'add', collection: req.params.name, doc: newDoc });
      res.json({ success: true, doc: newDoc });
    }
  } catch (error) {
    console.error(`Error updating ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error updating collection' });
  }
});

// 4. Borrado masivo (batchDelete) en colección (Solo Admin + Allowlist estricta + CSRF)
app.post('/api/collections/:name/batchDelete', requireAuth, requireRole('admin'), verifyCsrf, (req, res) => {
  try {
    const collectionName = req.params.name;
    // Validar allowlist de colecciones borrables
    if (SENSITIVE_CORE_COLLECTIONS.has(collectionName) || !ALLOWED_DELETION_COLLECTIONS.has(collectionName)) {
      return res.status(403).json({
        error: `Operación denegada: borrado masivo prohibido en la colección protegida '${collectionName}'.`
      });
    }

    const data = readCollection(collectionName);
    const idsToDelete = req.body.ids || [];
    const filtered = data.filter(d => !idsToDelete.includes(String(d.id)));
    writeCollection(collectionName, filtered, { action: 'batchDelete', collection: collectionName, count: idsToDelete.length });
    res.json({ success: true });
  } catch (error) {
    console.error(`Error batch deleting ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error batch deleting documents' });
  }
});

// 5. Borrado individual de documento (Solo Admin + Allowlist estricta + CSRF)
app.delete('/api/collections/:name/:id', requireAuth, requireRole('admin'), verifyCsrf, (req, res) => {
  try {
    const collectionName = req.params.name;
    // Validar allowlist de colecciones con borrado individual permitido
    if (SENSITIVE_CORE_COLLECTIONS.has(collectionName) && !ALLOWED_DELETION_COLLECTIONS.has(collectionName)) {
      return res.status(403).json({
        error: `Operación denegada: borrado individual prohibido en la colección protegida '${collectionName}'.`
      });
    }

    const data = readCollection(collectionName);
    const previousDoc = data.find(d => String(d.id) === String(req.params.id));
    const filtered = data.filter(d => String(d.id) !== String(req.params.id));
    writeCollection(collectionName, filtered, { action: 'delete', collection: collectionName, doc: { id: req.params.id } }, previousDoc);
    res.json({ success: true });
  } catch (error) {
    console.error(`Error deleting ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error deleting document' });
  }
});

// 6. Endpoint Administrativo Oficial para Restablecimiento Contable (Fase 1C)
// Sustituye al peligroso DELETE /api/collections/:name de wipe genérico
app.post('/api/admin/reset-accounting', requireAuth, requireRole('admin'), verifyCsrf, async (req, res) => {
  try {
    const ACCOUNTING_COLLECTIONS = [
      'transactions',
      'invoices',
      'shift_transactions',
      'shift_sessions',
      'cashClosings',
      'sales',
      'expenses',
      'payments',
      'bills',
      'installments',
      'kardex'
    ];

    await withCollectionLock('GLOBAL_TRANSACTION', async () => {
      // 1. Limpiar colecciones contables fijas a []
      for (const coll of ACCOUNTING_COLLECTIONS) {
        writeCollection(coll, [], { action: 'clear', collection: coll });
      }

      // 2. Resetear deudas de clientes a cero
      const clients = readCollection('clients');
      if (Array.isArray(clients)) {
        const updatedClients = clients.map(c => ({
          ...c,
          outstandingDebt: 0,
          loyaltyPoints: 0
        }));
        writeCollection('clients', updatedClients, { action: 'update_all', collection: 'clients' });
      }

      // 3. Resetear deudas y saldos de proveedores a cero
      const suppliers = readCollection('suppliers');
      if (Array.isArray(suppliers)) {
        const updatedSuppliers = suppliers.map(s => ({
          ...s,
          balanceOwed: 0,
          storeDebt: 0
        }));
        writeCollection('suppliers', updatedSuppliers, { action: 'update_all', collection: 'suppliers' });
      }
    });

    console.log('[Sistema Kalu] ✅ Restablecimiento contable administrativo ejecutado con éxito por admin.');
    io.emit('database_restored', { timestamp: new Date().toISOString(), type: 'accounting_reset' });

    res.json({ success: true, message: 'Datos contables restablecidos exitosamente.' });
  } catch (error) {
    console.error('Error en /api/admin/reset-accounting:', error);
    res.status(500).json({ error: 'Error durante el restablecimiento contable', details: error.message });
  }
});

// --- SISTEMA DE COPIAS DE SEGURIDAD TOTAL (BACKUP & RESTORE) ---
const BACKUP_COLLECTIONS = [
  'products',
  'clients',
  'suppliers',
  'transactions',
  'kardex',
  'adminLedger',
  'cheeseTrips',
  'settings',
  'cashClosings',
  'bills',
  'installments',
  'invoices',
  'users',
  'daily_drafts',
  'shift_transactions',
  'shift_sessions',
  'sales',
  'expenses',
  'payments',
  'mobileOrders',
  'business_debts',
  'photo_album',
  'voice_notes',
  'vehicle_trips',
  'purchases',
  'pwa_payments'
];

// Obtener respaldo completo de todas las colecciones existentes en JSON (Solo Admin)
app.get('/api/full-backup', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const backup = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      company: 'Mundo Kalu Sabanota',
      collections: {}
    };

    for (const colName of BACKUP_COLLECTIONS) {
      backup.collections[colName] = readCollection(colName);
    }

    res.json(backup);
  } catch (error) {
    console.error('Error generando copia de seguridad completa:', error);
    res.status(500).json({ error: 'Error generando backup completo', details: error.message });
  }
});

// Restaurar copia de seguridad completa atómicamente (Solo Admin + CSRF)
app.post('/api/restore-backup', requireAuth, requireRole('admin'), verifyCsrf, (req, res) => {
  try {
    const { collections } = req.body;
    if (!collections || typeof collections !== 'object') {
      return res.status(400).json({ error: 'Formato de respaldo inválido: falta el objeto "collections"' });
    }

    const restoredSummary = {};
    for (const [colName, docs] of Object.entries(collections)) {
      if (Array.isArray(docs)) {
        writeCollection(colName, docs);
        restoredSummary[colName] = docs.length;
      }
    }

    console.log('[Sistema Kalu] ✅ Restauración completa de base de datos realizada con éxito por admin:', restoredSummary);
    io.to('room:crm:admin').emit('database_restored', { timestamp: new Date().toISOString(), summary: restoredSummary });
    io.to('room:crm:staff').emit('database_restored', { timestamp: new Date().toISOString() });

    // Emitir eventos dirigidos para que las vistas reactivas autorizadas se actualicen
    for (const colName of Object.keys(collections)) {
      emitCollectionUpdatedScoped(colName);
    }

    res.json({
      success: true,
      message: 'Base de datos restaurada correctamente',
      summary: restoredSummary
    });
  } catch (error) {
    console.error('Error restaurando copia de seguridad:', error);
    res.status(500).json({ error: 'Error restaurando respaldo', details: error.message });
  }
});

// --- SERVICIOS AUXILIARES DE COMUNICACIÓN (WHATSAPP & CORREO) ---

async function sendWhatsAppNotification({ phone, name, message }) {
  if (!phone) return { success: false, reason: 'No phone' };

  let cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '58' + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith('58') && cleanPhone.length === 10) {
    cleanPhone = '58' + cleanPhone;
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.WHATSAPP_MODE === 'simulation';
  const waApiUrl = process.env.WHATSAPP_API_URL || process.env.MESSAGING_API_URL || process.env.WHATSAPP_URL;
  const waApiKey = process.env.WHATSAPP_API_KEY || process.env.API_KEY || process.env.WHATSAPP_TOKEN;

  if (isDev || !waApiUrl) {
    console.log(`[Robot WhatsApp Cobranza (DEV/Simulado)] A: ${cleanPhone}\nMensaje:\n${message}\n-----------------------------`);
    return { success: true, simulated: true, recipient: cleanPhone };
  }

  try {
    console.log(`[Robot WhatsApp Cobranza] Enviando mensaje a ${cleanPhone}...`);
    const response = await fetch(waApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(waApiKey ? { 'Authorization': `Bearer ${waApiKey}`, 'x-api-key': waApiKey } : {})
      },
      body: JSON.stringify({
        phone: cleanPhone,
        to: cleanPhone,
        message,
        body: message,
        text: message
      })
    });
    if (response.ok) {
      return { success: true, channel: 'whatsapp', recipient: cleanPhone };
    } else {
      const errText = await response.text();
      console.error('[Robot WhatsApp Cobranza] Error en respuesta:', response.status, errText);
      return { success: false, error: errText };
    }
  } catch (e) {
    console.error('[Robot WhatsApp Cobranza] Error de conexión:', e.message);
    return { success: false, error: e.message };
  }
}

async function sendEmailNotification({ email, name, subject, htmlContent }) {
  if (!email) return { success: false, reason: 'No email' };

  const isDev = process.env.NODE_ENV === 'development' || process.env.MAIL_MODE === 'development' || process.env.MAIL_MODE === 'simulation';
  const emailUser = process.env.EMAIL_USER || 'dev-simulator@kalu.local';
  const emailPass = process.env.EMAIL_PASS;

  if (isDev || !emailPass) {
    console.log(`[Robot Correo Cobranza (DEV/Simulado)] A: ${email}\nAsunto: ${subject || 'Notificación de Cobro'}\nHTML Preview: ${(htmlContent || '').substring(0, 150)}...\n-----------------------------`);
    return { success: true, simulated: true, recipient: email };
  }

  try {
    const dynamicTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailUser, pass: emailPass }
    });

    await dynamicTransporter.sendMail({
      from: `"Mundo Kalu Cobranzas" <${emailUser}>`,
      to: email,
      subject: subject || 'Notificación de Cuota Vencida - Mundo Kalu',
      html: htmlContent
    });
    console.log(`[Robot Correo Cobranza] Correo de cobro enviado con éxito a ${email}`);
    return { success: true, channel: 'email', recipient: email };
  } catch (error) {
    console.error('[Robot Correo Cobranza] Error enviando correo:', error.message);
    return { success: false, error: error.message };
  }
}

// --- SERVICIO DE MONITOREO DIARIO DE CUOTAS Y VENCIMIENTO (COBRANZAS) ---

async function checkOverdueInstallments() {
  console.log('\n[Robot Cobranzas] 🔍 Iniciando inspección de cuotas y fechas de vencimiento...');
  try {
    const installments = readCollection('installments');
    const clients = readCollection('clients');
    const settings = readCollection('settings');
    const generalSettings = settings.find(s => s.id === 'general') || {};
    const bcvRate = Number(generalSettings.exchangeRate || 807.38);

    if (!installments || installments.length === 0) {
      console.log('[Robot Cobranzas] No hay cuotas registradas en la base de datos.');
      return { checked: 0, markedOverdue: 0, notified: 0 };
    }

    const todayStr = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
    const today = new Date(todayStr).getTime();

    let markedOverdue = 0;
    let notifiedCount = 0;
    let hasChanges = false;

    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i];

      // Evaluar solo cuotas pendientes de pago
      if (inst.status === 'pending') {
        const dueRaw = inst.dueDate ? String(inst.dueDate).split('T')[0] : '';
        if (!dueRaw) continue;

        const dueTime = new Date(dueRaw).getTime();

        // Si la fecha actual alcanzó o superó la fecha de vencimiento
        if (today >= dueTime) {
          console.log(`[Robot Cobranzas] ⚠️ Cuota ${inst.id} vencida (Fecha: ${dueRaw}, Hoy: ${todayStr}). Marcando como 'overdue'...`);
          inst.status = 'overdue';
          inst.overdueNotifiedAt = new Date().toISOString();
          inst.pointsEarned = 0; // Regla: Pierde los puntos de esta cuota por atraso (no afecta puntos históricos)
          hasChanges = true;
          markedOverdue++;

          // Buscar cliente asociado para disparar la notificación
          const client = clients.find(c => String(c.id) === String(inst.clientId));
          if (client) {
            const amountUsd = Number(inst.amountUSD || inst.amount || 0).toFixed(2);
            const amountBs = (Number(amountUsd) * bcvRate).toFixed(2);
            const clientName = client.name || 'Estimado(a) Cliente';

            // 1. Notificación por WhatsApp
            const waMessage = `🔔 *Mundo Kalu - Aviso de Cobro*\n\nHola *${clientName}*,\nTe informamos que tu cuota de crédito por *$${amountUsd} USD* (aprox. *Bs. ${amountBs}* a tasa oficial BCV) venció el día *${dueRaw}*.\n\n⚠️ *Nota de Beneficios:* Los puntos de esta cuota quedan pausados por mora hasta regularizar tu cuenta (tus puntos históricos acumulados se mantienen seguros).\n\n📌 *Para realizar tu pago y mantener tu historial activo:*\n- Entra a tu Portal del Cliente: Mundo Kalu > Pagos\n- O acude a caja en tienda central para liquidar en efectivo o punto.\n\n_¡Gracias por tu preferencia y compromiso!_`;

            sendWhatsAppNotification({
              phone: client.phone,
              name: clientName,
              message: waMessage
            });

            // 2. Notificación por Correo Electrónico
            if (client.email) {
              const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #020617; color: #f8fafc; border-radius: 20px; overflow: hidden; border: 1px solid #1e293b;">
                  <div style="background-color: #0f172a; padding: 25px; text-align: center; border-bottom: 2px solid #eab308;">
                    <h1 style="color: #eab308; margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 2px;">MUNDO KALU</h1>
                    <p style="color: #94a3b8; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase;">Aviso de Cobranza y Vencimiento</p>
                  </div>
                  <div style="padding: 35px 25px;">
                    <h2 style="margin-top: 0; color: #f8fafc; font-size: 18px;">Estimado(a) ${clientName},</h2>
                    <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
                      Le recordamos que su cuota pendiente de financiamiento ha alcanzado su fecha límite de pago el <strong>${dueRaw}</strong>.
                    </p>
                    <div style="margin: 25px 0; background-color: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 20px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
                        <span style="color: #94a3b8; font-size: 13px;">Monto en Dólares:</span>
                        <span style="color: #10b981; font-weight: bold; font-size: 16px;">$${amountUsd} USD</span>
                      </div>
                      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
                        <span style="color: #94a3b8; font-size: 13px;">Equivalente en Bolívares (BCV):</span>
                        <span style="color: #f8fafc; font-weight: bold; font-size: 14px;">Bs. ${amountBs}</span>
                      </div>
                      <div style="display: flex; justify-content: space-between;">
                        <span style="color: #94a3b8; font-size: 13px;">Estado actual:</span>
                        <span style="color: #ef4444; font-weight: bold; font-size: 13px; text-transform: uppercase;">Vencida / En Mora</span>
                      </div>
                    </div>
                    <div style="background-color: #451a03; border: 1px solid #b45309; border-radius: 10px; padding: 12px; margin-bottom: 20px;">
                      <p style="color: #fde68a; font-size: 12px; margin: 0; line-height: 1.4;">
                        🛡️ <strong>Política Club Kalu Más:</strong> Sus puntos acumulados históricos no se pierden, pero los puntos correspondientes a esta cuota vencida no serán acreditados.
                      </p>
                    </div>
                    <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
                      Por favor, reporte su transferencia o Pago Móvil ingresando a su <strong>Portal del Cliente</strong> en la sección <em>Pagos</em>, o acérquese a nuestra sede principal para abonar en caja.
                    </p>
                  </div>
                  <div style="background-color: #020617; padding: 18px; text-align: center; border-top: 1px solid #1e293b;">
                    <p style="margin: 0; color: #475569; font-size: 11px;">© ${new Date().getFullYear()} Mundo Kalu. Departamento de Créditos y Finanzas.</p>
                  </div>
                </div>
              `;

              sendEmailNotification({
                email: client.email,
                name: clientName,
                subject: `⚠️ Recordatorio de Pago - Cuota Vencida ($${amountUsd} USD) - Mundo Kalu`,
                htmlContent: emailHtml
              });
            }
            notifiedCount++;
          }
        }
      }
    }

    if (hasChanges) {
      writeCollection('installments', installments);
      console.log(`[Robot Cobranzas] ✅ Se actualizaron ${markedOverdue} cuotas a estatus 'overdue' y se despacharon ${notifiedCount} avisos.`);
    } else {
      console.log('[Robot Cobranzas] ✨ Todo al día: No se encontraron cuotas vencidas pendientes por actualizar.');
    }

    return { checked: installments.length, markedOverdue, notified: notifiedCount };
  } catch (error) {
    console.error('[Robot Cobranzas] ❌ Error durante la inspección de cuotas:', error);
    return { error: error.message };
  }
}

// Endpoint para disparar la revisión manualmente desde el CRM/Contador
app.post('/api/run-debt-check', requireAuth, requireRole('admin', 'cajero', 'accountant'), verifyCsrf, async (req, res) => {
  try {
    console.log('\n[Trigger Manual] Ejecutando revisión de cobranzas y mora solicitada vía API...');
    const result = await checkOverdueInstallments();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de Política de Privacidad para Meta / WhatsApp Business API
app.get(['/privacidad', '/api/privacidad'], (req, res) => {
  res.send(`
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.6; color: #333;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #10b981; padding-bottom: 10px;">Política de Privacidad de Sistemakalu Sabanota</h2>
        <p><strong>Última actualización:</strong> Septiembre 2026</p>
        <h3>1. Uso de la información</h3>
        <p>Sistemakalu Sabanota utiliza WhatsApp exclusivamente para enviar notificaciones operativas, recibos y gestión de inventario.</p>
        <h3>2. Protección de datos</h3>
        <p>Los datos de contacto no se venden ni se comparten con terceros bajo ninguna circunstancia.</p>
    </div>
  `);
});

server.listen(PORT, () => {
  console.log(`Backend server (Uploader & WS) running on port ${PORT}`);
  console.log(`Saving databases and files to: ${uploadDir}`);

  // Ejecución inicial al arrancar el backend (tras 5 segundos de gracia)
  setTimeout(() => {
    checkOverdueInstallments();
  }, 5000);

  // Intervalo de revisión programada: Cada 12 Horas (12 * 60 * 60 * 1000 ms)
  const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
  setInterval(() => {
    checkOverdueInstallments();
  }, CHECK_INTERVAL_MS);
});

// Exportaciones del Recovery Core y Socket.IO para pruebas y consumo interno seguro
export {
  createRecoveryChallenge,
  verifyRecoveryCode,
  consumeResetToken,
  invalidateRecoveryChallenge,
  cleanupRecoveryStore,
  recoveryChallengeStore,
  recoveryResetTokenStore,
  recoveryRequestLimiter,
  recoveryVerifyLimiter,
  hashEphemeralSecret,
  maskRecipient,
  io,
  sessionMiddleware,
  emitCollectionDeltaScoped,
  emitCollectionUpdatedScoped,
  sanitizeClientPayload,
  sanitizeProducerPayload,
  sanitizePublicProduct,
  isOriginAllowed,
  writeCollection,
  activeSessionSockets,
  invalidateSessionSockets,
  purgePortalSocketPrivileges,
  setGeminiClientForTest,
  getGeminiClient,
  isGeminiConfigured,
  aiRateLimiter,
  dataDir,
  uploadDir,
  backupsDir,
  getCollectionFilePath,
  ALLOWED_STATIC_EXTENSIONS
};
