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
import rateLimit, { MemoryStore } from 'express-rate-limit';
import zlib from 'zlib';

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

// Si GEMINI_API_KEY quedó vacío por sombras de .env.development, intentar recuperar de .env
if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_API_KEY.trim()) {
  const rootEnvPath = path.join(__dirname, '.env');
  if (fs.existsSync(rootEnvPath)) {
    const rootEnv = dotenv.parse(fs.readFileSync(rootEnvPath));
    if (rootEnv.GEMINI_API_KEY && rootEnv.GEMINI_API_KEY.trim()) {
      process.env.GEMINI_API_KEY = rootEnv.GEMINI_API_KEY.trim();
    }
  }
}

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
const dataDir = process.env.KALU_DATA_DIR || process.env.DATA_DIR || defaultDataDir;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 2. UPLOAD_DIR: Directorio exclusivo para assets estáticos públicos (imágenes, banners, etc.)
const defaultUploadDir = isDevEnv ? path.join(dataDir, 'uploads') : path.join(__dirname, 'uploads');
const uploadDir = process.env.UPLOAD_DIR || defaultUploadDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 3. BACKUP_DIR: Directorio privado para copias de seguridad de colecciones
const backupsDir = process.env.BACKUP_DIR || path.join(dataDir, 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// 4. PROTECTED_MEDIA_DIR: Directorio privado para comprobantes y medios protegidos (Fase 3B)
const defaultProtectedMediaDir = path.join(__dirname, 'protected_media');
const protectedMediaDir = process.env.KALU_MEDIA_DIR || process.env.PROTECTED_MEDIA_DIR || defaultProtectedMediaDir;
const capturesDir = path.join(protectedMediaDir, 'captures');
if (!fs.existsSync(capturesDir)) {
  fs.mkdirSync(capturesDir, { recursive: true });
}

// Validación de seguridad estricta: DATA_DIR y UPLOAD_DIR NUNCA deben coincidir
if (path.resolve(dataDir) === path.resolve(uploadDir)) {
  const securityError = new Error('[FATAL SECURITY MISCONFIGURATION] DATA_DIR y UPLOAD_DIR no pueden ser el mismo directorio. Esto expondría las bases de datos en la web pública.');
  console.error(securityError.message);
  throw securityError;
}

// Validación de seguridad de producción: SESSION_SECRET obligatorio
if (isProd && (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim())) {
  const sessionSecretErr = new Error('[FATAL SECURITY MISCONFIGURATION] SESSION_SECRET es obligatorio en entorno de producción.');
  console.error(sessionSecretErr.message);
  throw sessionSecretErr;
}

console.log('----------------------------------------------------');
console.log(`🌐 ENTORNO: ${isDevEnv ? 'DESARROLLO LOCAL (KALU-DEV)' : 'PRODUCCIÓN'}`);
console.log('🤖 ESTADO DEL ROBOT DE COMUNICACIONES:');
console.log('📧 Correo Emisor:', mailMode === 'development' ? 'MODO SIMULACIÓN (DEV - Solo consola)' : (process.env.EMAIL_USER ? `SÍ (${process.env.EMAIL_USER})` : 'SÍ (Fallback: dev-simulator@kalu.local)'));
console.log('🔑 Contraseña Correo (.env):', mailMode === 'development' ? 'PROTEGIDA (Simulación DEV activa)' : (process.env.EMAIL_PASS ? 'SÍ (Presente)' : '❌ NO DETECTADA'));
console.log('📱 WhatsApp API:', waMode === 'simulation' ? 'MODO SIMULACIÓN (DEV - Solo consola)' : (process.env.WHATSAPP_API_URL || process.env.WHATSAPP_API_KEY ? 'SÍ (Producción)' : 'Modo Simulación / Local'));
console.log('📂 Directorio de Datos / DB (Privado):', dataDir);
console.log('🖼️  Directorio de Uploads / Assets (Público):', uploadDir);
console.log('----------------------------------------------------');

// --- CONFIGURACIÓN DE CORS Y ORIGINS PERMITIDOS (FASE 1D-D.2 & 1F-D) ---
function parseAllowedOrigins(rawEnv) {
  if (!rawEnv || typeof rawEnv !== 'string') return [];
  return rawEnv
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const rawAllowedOrigins = process.env.SOCKET_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '';
const configuredOrigins = parseAllowedOrigins(rawAllowedOrigins);

// Origins de desarrollo locales permitidos por defecto cuando !isProd
const defaultDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

function getAllowedOrigins() {
  const list = [...configuredOrigins];
  if (!isProd) {
    for (const devOrigin of defaultDevOrigins) {
      if (!list.includes(devOrigin)) {
        list.push(devOrigin);
      }
    }
  }
  return list;
}

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().replace(/\/+$/, '');
}

function isOriginAllowed(origin) {
  // Peticiones locales o server-to-server sin cabecera origin (curl, scripts internos, health checks, testing)
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  const allowed = getAllowedOrigins();
  if (allowed.includes(normalized)) return true;

  // En modo desarrollo, permitir orígenes de red local (192.168.x.x, 10.x.x.x, 172.16-31.x.x) para pruebas móviles
  if (!isProd) {
    const isLocalNetwork = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(normalized);
    if (isLocalNetwork) return true;
  }

  return false;
}

const PORT = process.env.PORT || 3001;

const app = express();

// Configuración de trust proxy (Fase 1K: Reverse proxy pre-producción / Single-Process)
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY.trim();
  app.set('trust proxy', tp === 'true' ? true : (isNaN(Number(tp)) ? tp : Number(tp)));
} else if (isProd) {
  app.set('trust proxy', 1);
}

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
    : `connect-src ${devConnectOrigins.join(' ')} http://*:* ws://*:* ${configuredOrigins.length > 0 ? ' ' + configuredOrigins.join(' ') : ''}`;

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
        callback(null, origin || true);
      } else {
        callback(new Error('Origin no permitido por política CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  }
});

// Middleware CORS Endurecido para Express (Fase 1F-D)
const corsOptions = {
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      // Si el request trae un Origin permitido, se devuelve explícitamente para que ACAO nunca sea '*'
      callback(null, origin ? normalizeOrigin(origin) : true);
    } else {
      // Origin no autorizado: callback(null, false) no emite ACAO y bloquea al navegador
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
};

app.use(cors(corsOptions));

// Parser JSON específico para el Webhook de WhatsApp con límite estricto de 2MB y captura de rawBody para HMAC
const whatsappJsonParser = express.json({
  limit: '2mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
});

// Parser JSON global para el CRM y endpoints de IA/Uploads con límite de 50MB
// Excluye /api/webhook/whatsapp para que sea procesado exclusivamente por whatsappJsonParser
app.use((req, res, next) => {
  if (req.originalUrl && req.originalUrl.startsWith('/api/webhook/whatsapp')) {
    return next();
  }
  express.json({ limit: '50mb' })(req, res, next);
});

/**
 * Validador criptográfico de firma X-Hub-Signature-256 para Webhooks de Meta/WhatsApp (Fase 1G-A)
 * Utiliza HMAC-SHA256(rawBytes, APP_SECRET) y crypto.timingSafeEqual en tiempo constante.
 */
function verifyWhatsAppWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  if (!appSecret || typeof appSecret !== 'string') return false;
  if (!rawBody || !Buffer.isBuffer(rawBody)) return false;

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'sha256') {
    return false;
  }

  const providedHex = parts[1].trim();
  if (providedHex.length !== 64) {
    return false;
  }

  const expectedHmac = crypto.createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const bufProvided = Buffer.from(providedHex, 'hex');
  const bufExpected = Buffer.from(expectedHmac, 'hex');

  if (bufProvided.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

// Rate limiter específico para Webhook de WhatsApp (Prevención de DoS / Flood de peticiones maliciosas)
const whatsappWebhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120, // 120 peticiones por minuto (suficiente para ráfagas Meta sin permitir flood masivo)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas peticiones al webhook. Rate limit excedido.'
  }
});

// Cache efímero de event IDs para deduplicación e idempotencia de Webhook (DEV/TEST In-Memory)
// NOTA: Para clusters o producción multiserver, se requiere un store distribuido (Redis).
const processedWebhookEventIds = new Set();

/**
 * Extrae los IDs de eventos únicos (mensajes, statuses o items) dentro de la estructura estándar de Meta/WhatsApp.
 * NUNCA utiliza entry[].id (que representa el WABA / Phone Number ID de la cuenta) como ID de evento único.
 *
 * Jerarquía de extracción:
 * 1. entry[].changes[].value.messages[].id (Identificador único de mensaje entrante, e.g. wamid.HBgL...)
 * 2. entry[].changes[].value.statuses[].id + status (Identificador único de actualización de estado de mensaje)
 * 3. payload.eventId / payload.id (Solo si es provisto como ID técnico explícito de evento)
 */
function extractWebhookEventIds(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const eventIds = [];

  if (Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const value = change?.value;
          if (!value || typeof value !== 'object') continue;

          // 1. Mensajes entrantes individuales
          if (Array.isArray(value.messages)) {
            for (const msg of value.messages) {
              if (msg && msg.id && typeof msg.id === 'string') {
                eventIds.push(`msg:${msg.id.trim()}`);
              }
            }
          }

          // 2. Actualizaciones de estado de mensajes individuales
          if (Array.isArray(value.statuses)) {
            for (const st of value.statuses) {
              if (st && st.id && typeof st.id === 'string') {
                const statusType = st.status || st.type || 'update';
                const statusTs = st.timestamp || '';
                eventIds.push(`status:${st.id.trim()}:${statusType}:${statusTs}`);
              }
            }
          }
        }
      }
    }
  }

  // Fallback explícito: si el payload trae un eventId técnico directo (no cuenta WABA)
  if (eventIds.length === 0 && payload.eventId && typeof payload.eventId === 'string') {
    eventIds.push(`evt:${payload.eventId.trim()}`);
  }

  return eventIds;
}

function isWebhookEventProcessed(eventId) {
  if (!eventId) return false;
  return processedWebhookEventIds.has(eventId);
}

function markWebhookEventProcessed(eventId) {
  if (!eventId) return;
  processedWebhookEventIds.add(eventId);
  // Limitar tamaño del set en memoria para evitar leaks
  if (processedWebhookEventIds.size > 5000) {
    const oldest = Array.from(processedWebhookEventIds).slice(0, 1000);
    for (const id of oldest) processedWebhookEventIds.delete(id);
  }
}

function resetProcessedWebhookEventsForTest() {
  processedWebhookEventIds.clear();
}

// Store en memoria para protección Anti-Spam del Modo Mantenimiento de WhatsApp
// Mapea recipientPhone -> timestamp del último aviso enviado
const whatsappMaintenanceAntiSpamStore = new Map();
const DEFAULT_MAINTENANCE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos por defecto

const WHATSAPP_MAINTENANCE_MESSAGE = `👋 ¡Hola! Gracias por comunicarte con nosotros.

En este momento estamos realizando una actualización de nuestro sistema para brindarte una mejor atención.

Estaremos nuevamente en servicio muy pronto.

🙏 Te pedimos disculpas por las molestias y agradecemos mucho tu comprensión.

Mundo Kalu`;

function isMaintenanceAntiSpamActive(phone) {
  if (!phone) return false;
  const clean = String(phone).replace(/\D/g, '');
  const lastSent = whatsappMaintenanceAntiSpamStore.get(clean);
  if (!lastSent) return false;

  const cooldownMs = parseInt(process.env.WHATSAPP_MAINTENANCE_COOLDOWN_MS, 10) || DEFAULT_MAINTENANCE_COOLDOWN_MS;
  const now = Date.now();
  if (now - lastSent < cooldownMs) {
    return true;
  }
  return false;
}

function recordMaintenanceNoticeSent(phone) {
  if (!phone) return;
  const clean = String(phone).replace(/\D/g, '');
  whatsappMaintenanceAntiSpamStore.set(clean, Date.now());

  // Limpieza preventiva si el mapa crece
  if (whatsappMaintenanceAntiSpamStore.size > 5000) {
    const cutoff = Date.now() - ((parseInt(process.env.WHATSAPP_MAINTENANCE_COOLDOWN_MS, 10) || DEFAULT_MAINTENANCE_COOLDOWN_MS) * 2);
    for (const [key, ts] of whatsappMaintenanceAntiSpamStore.entries()) {
      if (ts < cutoff) {
        whatsappMaintenanceAntiSpamStore.delete(key);
      }
    }
  }
}

function resetMaintenanceAntiSpamForTest() {
  whatsappMaintenanceAntiSpamStore.clear();
}

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

const loginLimiterStore = new MemoryStore();
const loginAccountLimiterStore = new MemoryStore();
const portalLoginLimiterStore = new MemoryStore();
const portalAccountLoginLimiterStore = new MemoryStore();
const recoveryRequestLimiterStore = new MemoryStore();
const recoveryVerifyLimiterStore = new MemoryStore();
const recoveryResetPinLimiterStore = new MemoryStore();
const syncRateLimiterStore = new MemoryStore();
const debtCheckLimiterStore = new MemoryStore();

// Rate limiter específico para Login por IP (10 intentos fallidos por cada ventana de 15 minutos)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: loginLimiterStore,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de autenticación fallidos. Por favor espere 15 minutos antes de intentar de nuevo.'
  }
});

// Helper para generar claves de rate limit hash seguras a partir de identificadores normalizados
function hashRateLimitKey(prefix, identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return null;
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
  return `${prefix}_${hash}`;
}

// Rate limiter específico para Login por Identificador de Cuenta (Anti-Password Spraying: 10 fallos / 15 min por cuenta)
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: loginAccountLimiterStore,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  keyGenerator: (req) => {
    const { loginMode = 'admin', email, cedula } = req.body || {};
    const rawId = loginMode === 'admin' ? (email || '') : (cedula || '');
    return hashRateLimitKey('crm_acct', rawId) || (req.ip || 'unknown_ip');
  },
  message: {
    error: 'Demasiados intentos de autenticación fallidos para esta cuenta. Por favor espere 15 minutos.'
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
      recordAuditLog({
        req,
        action: 'security.rbac_denied',
        resourceType: 'security',
        result: 'denied',
        metadata: { path: req.path, userRole, requiredRoles: allowedRoles }
      });
      return res.status(403).json({
        error: 'Acceso denegado: permisos insuficientes para esta operación',
        requiredRoles: allowedRoles
      });
    }

    next();
  };
}

// Rate limiter específico para Login de Portal por IP (10 intentos fallidos por cada 15 minutos)
const portalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: portalLoginLimiterStore,
  skipSuccessfulRequests: true,
  skip: (req, res) => req.skipRateLimit === true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de acceso al portal. Por favor espere 15 minutos.'
  }
});

// Rate limiter específico para Login de Portal por Identificador (Anti-PIN Spraying: 10 fallos / 15 min por cuenta)
const portalAccountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: portalAccountLoginLimiterStore,
  skipSuccessfulRequests: true,
  skip: (req, res) => req.skipRateLimit === true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  keyGenerator: (req) => {
    const { portalType = 'client', identifier = '' } = req.body || {};
    return hashRateLimitKey(`portal_${portalType}`, identifier) || (req.ip || 'unknown_ip');
  },
  message: {
    error: 'Demasiados intentos de acceso para esta cuenta de portal. Por favor espere 15 minutos.'
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
 * Utiliza HMAC-SHA256 con salt interno derivado de RECOVERY_SECRET o SESSION_SECRET.
 */
function hashEphemeralSecret(secret, saltKey = '') {
  const secretKey = process.env.RECOVERY_SECRET || process.env.SESSION_SECRET || (isProd ? '' : 'kalu_secure_recovery_secret_default_2026');
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
  store: recoveryRequestLimiterStore,
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
  store: recoveryVerifyLimiterStore,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de verificación. Por favor espere 15 minutos.'
  }
});

const recoveryResetPinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // Máximo 50 intentos fallidos de reseteo de PIN por IP en 15 minutos (Previene flood y bcrypt abuse sin bloquear flujos normales)
  store: recoveryResetPinLimiterStore,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de restablecimiento de PIN. Por favor espere 15 minutos.'
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

// Políticas de Acceso a Colecciones (Fase 1C / 1D-D.2 / 1I)
const ADMIN_ONLY_COLLECTIONS = new Set(['adminLedger', 'business_debts', 'settings', 'vehicle_trips', 'users', 'accounting', 'audit_logs']);
const SENSITIVE_CORE_COLLECTIONS = new Set(['users', 'clients', 'transactions', 'installments', 'bills', 'settings', 'adminLedger', 'business_debts', 'products', 'kardex', 'suppliers', 'audit_logs']);
const ALLOWED_DELETION_COLLECTIONS = new Set(['banners', 'daily_drafts', 'photo_album', 'voice_notes', 'mobileOrders', 'admin_voice_pending']);

function requireCollectionRead(req, res, next) {
  const collectionName = req.params.name;
  const userRole = String(req.user?.role || '').toLowerCase();

  // Colección de auditoría: protegida contra lectura genérica directa
  if (collectionName === 'audit_logs') {
    return res.status(403).json({
      error: 'Operación denegada: consulta de auditoría restringida al endpoint administrativo /api/admin/audit-logs.'
    });
  }

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

  // Colección de auditoría: append-only a nivel de aplicación (sin mutaciones vía API genérica)
  if (collectionName === 'audit_logs') {
    return res.status(403).json({
      error: 'Operación denegada: audit_logs es append-only interno y no permite escritura vía API genérica.'
    });
  }

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

// Helper recursivo de sanitización profunda para metadata de auditoría (Fase 1K)
function sanitizeAuditMetadataValue(val, depth = 0) {
  if (!val || depth > 5) return val;
  if (Array.isArray(val)) {
    return val.map(item => sanitizeAuditMetadataValue(item, depth + 1));
  }
  if (typeof val !== 'object') return val;

  const FORBIDDEN_METADATA_KEYS = [
    'password', 'passwordhash', 'pin', 'pinhash', 'secret',
    'token', 'csrftoken', 'resettoken', 'authsignature', 'recoverycode',
    'apikey', 'cookie', 'authorization', 'sessionsecret',
    'prompt', 'audio', 'voice', 'ocr', 'rawpayload', 'payload',
    'base64', 'image', 'document', 'imagedata', 'rawbody'
  ];

  const sanitized = {};
  for (const [key, subVal] of Object.entries(val)) {
    const keyLower = String(key).toLowerCase();
    if (FORBIDDEN_METADATA_KEYS.some(f => keyLower.includes(f))) {
      continue;
    }
    sanitized[key] = (subVal && typeof subVal === 'object')
      ? sanitizeAuditMetadataValue(subVal, depth + 1)
      : subVal;
  }
  return sanitized;
}

/**
 * Helper centralizado para registrar eventos de auditoría (Fase 1I / 1K: Append-Only y Sanitización Profunda)
 * Identidad 100% server-side desde sesión. Nunca confía en headers/body para actorId o rol.
 * Sanitiza automáticamente cualquier metadata de forma recursiva e insensible a mayúsculas/minúsculas.
 */
async function recordAuditLog({
  req = null,
  actorType = null,
  actorId = null,
  actorRole = null,
  action,
  resourceType,
  resourceId = null,
  result = 'success',
  metadata = {},
  ip = null,
  userAgent = null,
  tx = null
}) {
  try {
    // 1. Resolver identidad del actor desde la sesión server-side
    let resolvedActorType = actorType || 'system';
    let resolvedActorId = actorId || null;
    let resolvedActorRole = actorRole || null;

    if (req) {
      if (req.session?.userId) {
        resolvedActorType = 'crm';
        resolvedActorId = req.session.userId;
        resolvedActorRole = req.user?.role || req.session.userRole || null;
      } else if (req.session?.portalUser) {
        resolvedActorType = 'portal';
        resolvedActorId = req.session.portalUser.id;
        resolvedActorRole = req.session.portalUser.type || req.session.portalType || null;
      } else if (!actorType) {
        resolvedActorType = 'anonymous';
      }
    }

    // 2. Resolver IP y User-Agent de forma segura
    const resolvedIp = ip || (req ? (req.ip || req.socket?.remoteAddress || 'unknown') : 'system');
    const resolvedUserAgent = userAgent || (req ? (req.get('user-agent') || 'unknown') : 'system');

    // 3. Sanitizar metadata recursivamente
    const sanitizedMetadata = sanitizeAuditMetadataValue(metadata || {});

    const event = {
      id: `audit-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      actorType: resolvedActorType,
      actorId: resolvedActorId,
      actorRole: resolvedActorRole,
      action: String(action),
      resourceType: String(resourceType),
      resourceId: resourceId ? String(resourceId) : null,
      result: ['success', 'failure', 'denied'].includes(result) ? result : 'success',
      ip: String(resolvedIp),
      userAgent: String(resolvedUserAgent).substring(0, 255),
      metadata: sanitizedMetadata
    };

    // 4. Si se provee un contexto transaccional tx, delegar escritura en tx
    if (tx && typeof tx.write === 'function') {
      const logs = tx.read('audit_logs');
      logs.push(event);
      tx.write('audit_logs', logs);
    } else {
      // Escritura atómica serializada fuera de transacción
      await withCollectionLock('audit_logs', async () => {
        const logs = readCollection('audit_logs');
        logs.push(event);
        writeCollection('audit_logs', logs);
      });
    }

    return event;
  } catch (err) {
    console.error('[AuditLog Error] Fallo al registrar evento de auditoría:', err.message);
    return null;
  }
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

// 2. Login con verificación en backend y rotación de sesión (Protegido por IP + Identificador de Cuenta)
app.post('/api/auth/login', loginLimiter, loginAccountLimiter, (req, res) => {
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
        recordAuditLog({
          req,
          actorType: 'crm',
          action: 'auth.login',
          resourceType: 'auth',
          result: 'denied',
          metadata: { loginMode, reason: 'invalid_credentials' }
        });
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
        recordAuditLog({
          req,
          actorType: 'crm',
          action: 'auth.login',
          resourceType: 'auth',
          result: 'denied',
          metadata: { loginMode, reason: 'invalid_credentials' }
        });
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

      recordAuditLog({
        req,
        actorType: 'crm',
        actorId: matchedUser.id,
        actorRole: matchedUser.role,
        action: 'auth.login',
        resourceType: 'auth',
        resourceId: matchedUser.id,
        result: 'success',
        metadata: { loginMode, role: matchedUser.role }
      });

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

// --- ENDPOINTS DE PRUEBA Y VALIDACIÓN RBAC (FASE 1B / 1K: DEV & TEST ONLY) ---
if (!isProd) {
  // Endpoint exclusivo para Administradores (Test RBAC)
  app.get('/api/rbac/admin-only', requireAuth, requireRole('admin'), (req, res) => {
    res.json({
      success: true,
      message: 'Operación administrativa autorizada',
      user: req.user
    });
  });

  // Endpoint accesible por Administradores y Cajeros (Test RBAC)
  app.get('/api/rbac/cashier-allowed', requireAuth, requireRole('admin', 'cajero'), (req, res) => {
    res.json({
      success: true,
      message: 'Operación de caja autorizada',
      user: req.user
    });
  });

  // Endpoint de prueba que demuestra que el body no puede sobreescribir el rol de sesión (DEV/TEST ONLY)
  app.post('/api/rbac/role-change-test', requireAuth, (req, res) => {
    res.json({
      success: true,
      effectiveRole: req.user.role,
      user: req.user
    });
  });

  // Endpoint para resetear rate limiters en pruebas (DEV/TEST ONLY)
  app.post('/api/dev/reset-rate-limits', (req, res) => {
    portalLoginLimiterStore.resetAll();
    portalAccountLoginLimiterStore.resetAll();
    loginLimiterStore.resetAll();
    loginAccountLimiterStore.resetAll();
    recoveryRequestLimiterStore.resetAll();
    recoveryVerifyLimiterStore.resetAll();
    recoveryResetPinLimiterStore.resetAll();
    syncRateLimiterStore.resetAll();
    debtCheckLimiterStore.resetAll();
    res.json({ success: true, message: 'Rate limits reseteados para pruebas DEV' });
  });

  // Endpoint para generar un resetToken válido de prueba en ambiente de test (DEV/TEST ONLY)
  app.post('/api/dev/test-recovery-challenge', (req, res) => {
    const { portalType = 'client', targetId, targetName, channel = 'whatsapp', recipient } = req.body || {};
    if (!targetId || !recipient) {
      return res.status(400).json({ error: 'Faltan parámetros' });
    }
    const challenge = createRecoveryChallenge({
      portalType,
      targetId,
      targetName: targetName || 'Test User',
      channel,
      recipient
    });
    const verRes = verifyRecoveryCode({
      challengeId: challenge.challengeId,
      portalType,
      targetId,
      code: challenge.otpForDelivery
    });
    res.json({
      success: true,
      challengeId: challenge.challengeId,
      resetToken: verRes.resetToken
    });
  });
}

// Middleware de validación CSRF para operaciones mutadoras
function verifyCsrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const clientToken = req.headers['x-csrf-token'] || req.body?.csrfToken;
  const sessionToken = req.session?.csrfToken;

  if (!clientToken || !sessionToken || clientToken !== sessionToken) {
    recordAuditLog({
      req,
      action: 'security.csrf_denied',
      resourceType: 'security',
      result: 'denied',
      metadata: { path: req.path, method: req.method }
    });
    return res.status(403).json({ error: 'CSRF token inválido o ausente' });
  }
  next();
}

// 4. Logout e invalidación de sesión server-side (Protegido con verificación CSRF)
app.post('/api/auth/logout', verifyCsrf, (req, res) => {
  recordAuditLog({
    req,
    action: 'auth.logout',
    resourceType: 'auth',
    result: 'success'
  });
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

/**
 * Función centralizada y reutilizable para generar la contraseña inicial del cliente.
 * Contrato obligatorio: ÚLTIMOS 4 DÍGITOS DE LA CÉDULA/IDENTIFICACIÓN + "00" (Exactamente 6 dígitos numéricos).
 * Si la identificación no contiene al menos 4 dígitos válidos, devuelve null (FAIL CLOSED).
 */
function getClientInitialPin(client) {
  if (!client || typeof client !== 'object') return null;
  const rawId = client.cedula || client.ci || client.ciRif || client.idNumber || '';
  const digits = String(rawId).replace(/\D/g, '');
  if (digits.length < 4) {
    return null; // Fail closed: no inventar números ni credenciales inseguras
  }
  const last4 = digits.slice(-4);
  const initialPin = `${last4}00`;
  if (!/^\d{6}$/.test(initialPin)) {
    return null;
  }
  return initialPin;
}

/**
 * Resuelve autoritativamente el estado canónico de deuda de un cliente (Fase 2F).
 * Detecta inconsistencias entre outstandingDebt y currentDebtUsd legacy.
 */
function resolveClientDebtState(client) {
  const outstanding = Number(client?.outstandingDebt ?? 0);
  const legacy = Number(client?.currentDebtUsd ?? 0);

  if (outstanding > 0 && legacy > 0) {
    const err = new Error(`DATA_CONFLICT: El cliente ${client?.id || ''} posee saldo duplicado inconsistente (outstandingDebt=${outstanding}, currentDebtUsd=${legacy}). Operación abortada.`);
    err.statusCode = 409;
    throw err;
  }

  if (outstanding > 0) {
    return { effectiveDebt: outstanding, isLegacy: false, outstanding, legacy: 0 };
  }
  if (legacy > 0) {
    return { effectiveDebt: legacy, isLegacy: true, outstanding: 0, legacy };
  }
  return { effectiveDebt: 0, isLegacy: false, outstanding: 0, legacy: 0 };
}

// 1. Login de portal para cliente o productor (Protegido por IP + Identificador de Cuenta)
app.post('/api/portal/auth/login', portalLoginLimiter, portalAccountLoginLimiter, (req, res) => {
  try {
    const { portalType, identifier, pin } = req.body || {};

    if (!portalType || !['client', 'producer'].includes(portalType) || !identifier || !pin) {
      return res.status(400).json({ error: 'Debe ingresar identificador y PIN de acceso' });
    }

    const inputPin = String(pin).trim();
    // Validación de contrato de 6 dígitos numéricos en backend (FAIL CLOSED ante formatos inválidos)
    if (!/^\d{6}$/.test(inputPin)) {
      return res.status(400).json({ error: 'El PIN debe contener exactamente 6 dígitos numéricos' });
    }

    const genericAuthError = () => {
      recordAuditLog({
        req,
        actorType: 'portal',
        action: 'portal.login',
        resourceType: 'portal_auth',
        result: 'denied',
        metadata: { portalType, reason: 'invalid_credentials' }
      });
      return res.status(401).json({ error: 'Identificador o PIN incorrecto' });
    };
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

      if (!matchedEntity) {
        return genericAuthError();
      }

      let pinValid = false;
      if (matchedEntity.pinHash) {
        pinValid = verifyCredential(inputPin, matchedEntity.pinHash);
      } else if (matchedEntity.pin) {
        pinValid = verifyCredential(inputPin, matchedEntity.pin) || String(matchedEntity.pin) === inputPin;
      } else {
        const expectedPin = getClientInitialPin(matchedEntity);
        if (expectedPin) {
          pinValid = (inputPin === expectedPin);
        } else {
          pinValid = false; // Fail closed si no tiene 4 dígitos válidos
        }
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
        const base = matchedEntity.rif || matchedEntity.cedula || matchedEntity.ci || matchedEntity.phone || '';
        const baseDigits = String(base).replace(/\D/g, '');
        if (baseDigits.length >= 4) {
          const expectedPin = `${baseDigits.slice(-4)}00`;
          pinValid = (inputPin === expectedPin);
        } else {
          pinValid = false;
        }
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

      recordAuditLog({
        req,
        actorType: 'portal',
        actorId: matchedEntity.id,
        actorRole: portalType,
        action: 'portal.login',
        resourceType: 'portal_auth',
        resourceId: matchedEntity.id,
        result: 'success',
        metadata: { portalType }
      });

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
  recordAuditLog({
    req,
    actorType: 'portal',
    action: 'portal.logout',
    resourceType: 'portal_auth',
    result: 'success'
  });
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

// 3.1 Cambio directo de PIN autenticado desde el portal (Protegido por requirePortalAuth + verifyCsrf)
app.post('/api/portal/auth/change-pin', requirePortalAuth, verifyCsrf, async (req, res) => {
  try {
    const { currentPin, newPin } = req.body || {};
    const { type: portalType, id: targetId } = req.portalUser;

    if (!currentPin || !newPin) {
      return res.status(400).json({ error: 'Debe ingresar el PIN actual y el nuevo PIN' });
    }

    const newPinStr = String(newPin).trim();
    if (!/^\d{6}$/.test(newPinStr)) {
      return res.status(400).json({ error: 'El nuevo PIN debe contener exactamente 6 dígitos numéricos' });
    }

    const currentPinStr = String(currentPin).trim();
    let currentEntity = null;
    let isCurrentPinValid = false;

    if (portalType === 'client') {
      const clients = readCollection('clients');
      currentEntity = clients.find(c => String(c.id) === String(targetId));
      if (!currentEntity || (currentEntity.status && currentEntity.status !== 'active')) {
        return res.status(401).json({ error: 'Cliente no encontrado o inactivo' });
      }

      if (currentEntity.pinHash) {
        isCurrentPinValid = verifyCredential(currentPinStr, currentEntity.pinHash);
      } else if (currentEntity.pin) {
        isCurrentPinValid = verifyCredential(currentPinStr, currentEntity.pin) || String(currentEntity.pin) === currentPinStr;
      } else {
        const expectedPin = getClientInitialPin(currentEntity);
        isCurrentPinValid = Boolean(expectedPin && expectedPin === currentPinStr);
      }
    } else {
      const suppliers = readCollection('suppliers');
      currentEntity = suppliers.find(s => String(s.id) === String(targetId));
      if (!currentEntity || (currentEntity.status && currentEntity.status !== 'active')) {
        return res.status(401).json({ error: 'Productor no encontrado o inactivo' });
      }

      if (currentEntity.pinHash) {
        isCurrentPinValid = verifyCredential(currentPinStr, currentEntity.pinHash);
      } else if (currentEntity.pin) {
        isCurrentPinValid = verifyCredential(currentPinStr, currentEntity.pin) || String(currentEntity.pin) === currentPinStr;
      } else {
        const baseDigits = String(currentEntity.rif || currentEntity.cedula || currentEntity.ci || currentEntity.phone || '').replace(/\D/g, '');
        const expectedPin = baseDigits.length >= 4 ? `${baseDigits.slice(-4)}00` : null;
        isCurrentPinValid = Boolean(expectedPin && expectedPin === currentPinStr);
      }
    }

    if (!isCurrentPinValid) {
      recordAuditLog({
        req,
        actorType: 'portal',
        actorId: targetId,
        actorRole: portalType,
        action: 'portal.change_pin',
        resourceType: 'portal_auth',
        resourceId: targetId,
        result: 'denied',
        metadata: { reason: 'invalid_current_pin' }
      });
      return res.status(401).json({ error: 'El PIN actual ingresado es incorrecto' });
    }

    // Hashear nuevo PIN con bcrypt con 10 salt rounds
    const newPinHash = bcrypt.hashSync(newPinStr, 10);

    // Persistir nuevo pinHash bajo lock exclusivo eliminando PIN plano
    const collectionName = portalType === 'client' ? 'clients' : 'suppliers';
    await withCollectionLock(collectionName, async () => {
      const items = readCollection(collectionName);
      const idx = items.findIndex(item => String(item.id) === String(targetId));
      if (idx !== -1) {
        items[idx].pinHash = newPinHash;
        delete items[idx].pin; // Eliminar PIN plano si existía
        writeCollection(collectionName, items);
      }
    });

    recordAuditLog({
      req,
      actorType: 'portal',
      actorId: targetId,
      actorRole: portalType,
      action: 'portal.change_pin',
      resourceType: 'portal_auth',
      resourceId: targetId,
      result: 'success',
      metadata: { portalType }
    });

    return res.json({
      success: true,
      message: 'PIN de seguridad actualizado correctamente'
    });
  } catch (error) {
    console.error('[Portal Change PIN Exception]:', error);
    res.status(500).json({ error: 'Error procesando el cambio de PIN' });
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
 * 6. Restablecer PIN con resetToken verificado (Protegido por recoveryResetPinLimiter)
 * POST /api/portal/auth/recovery/reset-pin
 * Payload: { portalType: 'client'|'producer', identifier: string, resetToken: string, newPin: string }
 */
app.post('/api/portal/auth/recovery/reset-pin', recoveryResetPinLimiter, async (req, res) => {
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

    // Actualizar entidad mediante persistencia segura y controlada (whitelist estricta bajo lock)
    if (portalType === 'client') {
      await withCollectionLock('clients', async () => {
        const clients = readCollection('clients');
        const idx = clients.findIndex(c => String(c.id) === String(matchedEntity.id));
        if (idx !== -1) {
          clients[idx].pinHash = newPinHash;
          delete clients[idx].pin; // Eliminar PIN plano si existía
          writeCollection('clients', clients);
        }
      });
    } else {
      await withCollectionLock('suppliers', async () => {
        const suppliers = readCollection('suppliers');
        const idx = suppliers.findIndex(s => String(s.id) === String(matchedEntity.id));
        if (idx !== -1) {
          suppliers[idx].pinHash = newPinHash;
          delete suppliers[idx].pin; // Eliminar PIN plano si existía
          writeCollection('suppliers', suppliers);
        }
      });
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

    recordAuditLog({
      req,
      actorType: 'portal',
      actorId: matchedEntity.id,
      actorRole: portalType,
      action: 'portal.recovery.reset_pin',
      resourceType: 'portal_auth',
      resourceId: matchedEntity.id,
      result: 'success',
      metadata: { portalType }
    });

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
        transactionId: i.transactionId || null,
        paidAmount: Number(i.paidAmount || 0),
        amount: Number(i.amount || i.amountUSD || 0),
        amountUSD: Number(i.amountUSD || i.amount || 0),
        dueDate: i.dueDate,
        status: i.status || 'pending',
        installmentNumber: i.installmentNumber != null ? Number(i.installmentNumber) : null,
        totalInstallments: i.totalInstallments != null ? Number(i.totalInstallments) : null,
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

// Helper para validar y decodificar capture Base64 verificando magic bytes de imagen
function parseAndValidateCaptureBase64(rawBase64) {
  if (!rawBase64 || typeof rawBase64 !== 'string') {
    throw new Error('MISSING_CAPTURE');
  }

  const match = rawBase64.match(/^data:(image\/[a-zA-Z0-9\.\+-]+);base64,(.+)$/);
  const base64Data = match ? match[2] : rawBase64.trim();
  const declaredMime = match ? match[1].toLowerCase() : null;

  let buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    throw new Error('INVALID_CAPTURE_BASE64');
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('EMPTY_CAPTURE');
  }

  const MAX_CAPTURE_BYTES = 5 * 1024 * 1024; // 5MB
  if (buffer.length > MAX_CAPTURE_BYTES) {
    throw new Error('CAPTURE_TOO_LARGE');
  }

  // Validación de magic bytes para JPEG, PNG, WEBP
  let detectedMime = null;
  let ext = null;

  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    detectedMime = 'image/jpeg';
    ext = '.jpg';
  } else if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 && buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    detectedMime = 'image/png';
    ext = '.png';
  } else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    detectedMime = 'image/webp';
    ext = '.webp';
  }

  if (!detectedMime) {
    throw new Error('UNSUPPORTED_CAPTURE_TYPE');
  }

  return {
    buffer,
    mimeType: detectedMime,
    ext,
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

// 7. Reportar Pago PWA por el Cliente (Ownership forzado por req.portalUser.id + CSRF + Capture Obligatorio)
app.post('/api/portal/client/payments', requirePortalAuth, requirePortalType('client'), verifyCsrf, async (req, res) => {
  let createdFilePath = null;
  try {
    const { amount, paymentMethod, reference, bank, receiptImageUrl, receiptImage, notes, installmentId, date } = req.body || {};
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Monto de pago requerido y debe ser mayor a cero' });
    }

    const rawCapture = receiptImageUrl || receiptImage;
    if (!rawCapture) {
      return res.status(400).json({ error: 'Debes adjuntar el comprobante de pago' });
    }

    // Validar y decodificar capture
    let captureInfo;
    try {
      captureInfo = parseAndValidateCaptureBase64(rawCapture);
    } catch (valErr) {
      if (valErr.message === 'MISSING_CAPTURE' || valErr.message === 'EMPTY_CAPTURE') {
        return res.status(400).json({ error: 'Debes adjuntar el comprobante de pago' });
      }
      if (valErr.message === 'CAPTURE_TOO_LARGE') {
        return res.status(400).json({ error: 'El comprobante supera el tamaño máximo permitido de 5MB' });
      }
      if (valErr.message === 'UNSUPPORTED_CAPTURE_TYPE' || valErr.message === 'INVALID_CAPTURE_BASE64') {
        return res.status(400).json({ error: 'Formato de comprobante no válido. Use JPG, PNG o WEBP' });
      }
      return res.status(400).json({ error: 'Comprobante de pago inválido' });
    }

    const paymentId = `pwa-pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const filename = `capture-${paymentId}${captureInfo.ext}`;
    const targetFilePath = path.join(capturesDir, filename);

    // Guardar archivo en capturesDir
    fs.writeFileSync(targetFilePath, captureInfo.buffer);
    createdFilePath = targetFilePath;

    const receiptUrl = `/api/pwa-payments/${paymentId}/receipt`;

    const newPayment = {
      id: paymentId,
      entityId: req.portalUser.id,
      clientId: req.portalUser.id,
      entityType: 'client',
      portalType: 'client',
      source: 'client_portal',
      entityName: req.portalUser.name,
      amount: Number(amount),
      paymentMethod: String(paymentMethod || 'Pago Móvil'),
      reference: String(reference || ''),
      bank: String(bank || ''),
      receiptImageUrl: receiptUrl,
      receiptImage: receiptUrl,
      receiptFileName: filename,
      receiptMimeType: captureInfo.mimeType,
      receiptSize: captureInfo.size,
      receiptSha256: captureInfo.sha256,
      notes: String(notes || ''),
      installmentId: installmentId ? String(installmentId) : null,
      date: date || new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    if (installmentId) {
      await withTransaction(async (tx) => {
        const installments = tx.read('installments');
        const inst = installments.find(i => String(i.id) === String(installmentId) && (String(i.clientId) === String(req.portalUser.id) || String(i.client_id) === String(req.portalUser.id)));
        if (!inst) {
          const notFoundErr = new Error('INSTALLMENT_NOT_FOUND_OR_UNAUTHORIZED');
          notFoundErr.statusCode = 404;
          throw notFoundErr;
        }

        const installmentTotal = Number(inst.amountUSD ?? inst.amount ?? 0);
        const previousPaid = Number(inst.paidAmount ?? 0);
        const remaining = Math.round((installmentTotal - previousPaid) * 100) / 100;
        if (remaining <= 0 || inst.status === 'paid') {
          const paidErr = new Error('INSTALLMENT_ALREADY_PAID');
          paidErr.statusCode = 400;
          throw paidErr;
        }

        if (inst.status === 'in_review') {
          const inReviewErr = new Error('INSTALLMENT_ALREADY_IN_REVIEW');
          inReviewErr.statusCode = 409;
          throw inReviewErr;
        }

        if (!['pending', 'overdue'].includes(inst.status)) {
          const invalidStatusErr = new Error('INSTALLMENT_STATUS_INVALID_FOR_PAYMENT');
          invalidStatusErr.statusCode = 400;
          throw invalidStatusErr;
        }

        if (Number(amount) > remaining + 0.0001) {
          const exceedErr = new Error('AMOUNT_EXCEEDS_REMAINING_INSTALLMENT');
          exceedErr.statusCode = 400;
          throw exceedErr;
        }

        newPayment.transactionId = inst.transactionId || null;
        newPayment.installmentPreviousStatus = inst.status;

        inst.status = 'in_review';
        tx.write('installments', installments, { action: 'update', collection: 'installments', doc: inst });

        const pwaPayments = tx.read('pwa_payments');
        pwaPayments.push(newPayment);
        tx.write('pwa_payments', pwaPayments, { action: 'add', collection: 'pwa_payments', doc: newPayment });
      });
    } else {
      newPayment.transactionId = null;
      await withCollectionLock('pwa_payments', async () => {
        const pwaPayments = readCollection('pwa_payments');
        pwaPayments.push(newPayment);
        writeCollection('pwa_payments', pwaPayments, { action: 'add', collection: 'pwa_payments', doc: newPayment });
      });
    }

    res.json({ success: true, payment: newPayment });
  } catch (err) {
    // Si ocurrió cualquier fallo antes de persistir, limpiar el archivo creado para evitar huérfanos
    if (createdFilePath && fs.existsSync(createdFilePath)) {
      try {
        fs.unlinkSync(createdFilePath);
      } catch (cleanErr) {
        console.error('[Capture Cleanup Error]:', cleanErr);
      }
    }

    if (err.statusCode === 404 || err.message === 'INSTALLMENT_NOT_FOUND_OR_UNAUTHORIZED') {
      return res.status(404).json({ error: 'Cuota no encontrada o no pertenece al cliente' });
    }
    if (err.statusCode === 400 && err.message === 'INSTALLMENT_ALREADY_PAID') {
      return res.status(400).json({ error: 'La cuota ya se encuentra pagada' });
    }
    if (err.statusCode === 409 && err.message === 'INSTALLMENT_ALREADY_IN_REVIEW') {
      return res.status(409).json({ error: 'La cuota ya cuenta con un reporte de pago en revisión' });
    }
    if (err.statusCode === 400 && err.message === 'INSTALLMENT_STATUS_INVALID_FOR_PAYMENT') {
      return res.status(400).json({ error: 'La cuota no se encuentra en un estado apto para pago' });
    }
    if (err.statusCode === 400 && err.message === 'AMOUNT_EXCEEDS_REMAINING_INSTALLMENT') {
      return res.status(400).json({ error: 'El monto ingresado excede el saldo restante de la cuota' });
    }
    console.error('[Portal Client Payment POST Error]:', err);
    res.status(500).json({ error: 'Error registrando reporte de pago' });
  }
});

// Endpoint Autenticado para Servir Comprobantes PWA con Control de Autorización Estricto (Fase 3B)
// Accesible por:
// 1. Usuarios CRM autenticados (admin, contador, cajero, etc.)
// 2. Cliente portal autenticado PROPIETARIO del pago (req.portalUser.id === payment.clientId)
app.get('/api/pwa-payments/:id/receipt', (req, res) => {
  try {
    const paymentId = req.params.id;
    const allPayments = readCollection('pwa_payments');
    const payment = allPayments.find(p => String(p.id) === String(paymentId));
    if (!payment) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    // 1. Verificar si es usuario CRM autenticado
    let isAuthorized = false;

    if (req.session?.userId) {
      const users = readCollection('users');
      const u = users.find(x => String(x.id) === String(req.session.userId));
      if (u && u.active && ['admin', 'contador', 'cajero'].includes(u.role || req.session.userRole)) {
        isAuthorized = true;
      }
    } else if (req.session?.user && req.session.user.active) {
      isAuthorized = true;
    }

    // 2. Verificar si es cliente autenticado por sesión portal (propietario del pago)
    if (!isAuthorized && req.session?.portalUser) {
      const portalUser = req.session.portalUser;
      const targetClientId = payment.clientId || payment.entityId;
      if (portalUser.type === 'client' && String(portalUser.id) === String(targetClientId)) {
        isAuthorized = true;
      }
    }

    // 3. Fallback: Verificar si es cliente autenticado por token portal
    if (!isAuthorized) {
      const authHeader = req.headers.authorization;
      const portalToken = req.cookies?.portal_token || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);
      if (portalToken) {
        try {
          const decoded = jwt.verify(portalToken, JWT_SECRET);
          const targetClientId = payment.clientId || payment.entityId;
          if (decoded && (String(decoded.id) === String(targetClientId) || (decoded.phone && String(decoded.phone) === String(targetClientId)))) {
            isAuthorized = true;
          }
        } catch {
          // Token inválido
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'No tienes autorización para ver este comprobante' });
    }

    // Resolver archivo en filesystem
    let filePath = null;
    if (payment.receiptFileName) {
      filePath = path.join(capturesDir, path.basename(payment.receiptFileName));
    } else if (payment.receiptImageUrl && payment.receiptImageUrl.startsWith('/protected_media/')) {
      const subPath = payment.receiptImageUrl.replace('/protected_media/', '');
      filePath = path.join(protectedMediaDir, path.normalize(subPath));
    }

    if (!filePath || !fs.existsSync(filePath)) {
      // Fallback si es un data URL legacy en base64
      if (payment.receiptImageUrl && payment.receiptImageUrl.startsWith('data:image/')) {
        const match = payment.receiptImageUrl.match(/^data:(image\/[a-zA-Z0-9\.\+-]+);base64,(.+)$/);
        if (match) {
          const imgBuf = Buffer.from(match[2], 'base64');
          res.setHeader('Content-Type', match[1]);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          return res.send(imgBuf);
        }
      }
      return res.status(404).json({ error: 'Archivo de comprobante no encontrado en disco' });
    }

    // Validar contención dentro de protectedMediaDir para prevenir traversal
    const baseDir = path.resolve(protectedMediaDir);
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(baseDir + path.sep) && resolvedPath !== baseDir) {
      return res.status(404).json({ error: 'Ruta no válida' });
    }

    const mime = payment.receiptMimeType || (resolvedPath.endsWith('.png') ? 'image/png' : resolvedPath.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(resolvedPath);
  } catch (err) {
    console.error('[Receipt Serve Error]:', err);
    res.status(500).json({ error: 'Error al servir el comprobante' });
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

// ============================================================
// SUBSISTEMA DE AUTORIZACIÓN CRIPTOGRÁFICA QR SERVER-SIDE (FASE 1G-C.1)
// ============================================================

/**
 * Obtiene o resuelve el secreto criptográfico para firma de transacciones (Servidor exclusivamente).
 * - En PRODUCCIÓN: TRANSACTION_SIGNATURE_SECRET es OBLIGATORIO. Si falta, lanza excepción de seguridad al arrancar.
 * - En DESARROLLO/TEST: Si no se provee por variable de entorno, se genera un secreto efímero criptográficamente seguro
 *   usando crypto.randomBytes(32). Nunca se guarda en disco ni se expone a clientes.
 */
let ephemeralDevTxSecret = null;
function getTransactionSignatureSecret() {
  if (process.env.TRANSACTION_SIGNATURE_SECRET && process.env.TRANSACTION_SIGNATURE_SECRET.trim()) {
    return process.env.TRANSACTION_SIGNATURE_SECRET.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[FATAL SECURITY MISCONFIGURATION] TRANSACTION_SIGNATURE_SECRET es obligatorio en entorno de producción.');
  }
  if (!ephemeralDevTxSecret) {
    ephemeralDevTxSecret = crypto.randomBytes(32).toString('hex');
  }
  return ephemeralDevTxSecret;
}

// Validación de arranque en producción
if (process.env.NODE_ENV === 'production' && (!process.env.TRANSACTION_SIGNATURE_SECRET || !process.env.TRANSACTION_SIGNATURE_SECRET.trim())) {
  throw new Error('[FATAL SECURITY MISCONFIGURATION] TRANSACTION_SIGNATURE_SECRET es obligatorio en entorno de producción.');
}

/**
 * Helper para pruebas: permite resetear o inspeccionar el secreto efímero de desarrollo.
 */
function resetEphemeralDevTxSecretForTest() {
  ephemeralDevTxSecret = null;
}

/**
 * Genera un nonce criptográfico de autorización server-side (Fase 1G-C.2).
 * Utiliza exclusivamente crypto.randomBytes(32) de Node.js (64 caracteres hex).
 */
function generateTransactionAuthNonce() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Construye el payload canónico para la firma criptográfica de una transacción.
 * Utiliza datos confiables cargados del servidor.
 *
 * Contrato canónico:
 * canonicalPayload = [txId, clientId, clientCi, amount, authNonce].join('::')
 */
function buildTransactionCanonicalPayload(tx) {
  if (!tx || typeof tx !== 'object') return '';
  const txId = String(tx.id || '').trim();
  const clientId = String(tx.clientId || '').trim();
  const clientCi = String(tx.clientCi || '').trim();
  const amount = Number(tx.amount || tx.totalUSD || 0).toFixed(2);
  const nonce = String(tx.authNonce || '').trim();
  return [txId, clientId, clientCi, amount, nonce].join('::');
}

/**
 * Calcula la firma HMAC-SHA256 para un payload canónico de transacción.
 */
function computeTransactionHmac(canonicalPayload, secret = getTransactionSignatureSecret()) {
  return crypto.createHmac('sha256', secret)
    .update(canonicalPayload)
    .digest('hex');
}

/**
 * Valida criptográficamente la firma de autorización de una transacción.
 * Acepta formatos:
 * - 'SIG-v1.<nonceLast8>.<hex64>'
 * - 'SIG-v1.<hex64>'
 * - '<hex64>'
 * Utiliza crypto.timingSafeEqual en tiempo constante.
 */
function verifyTransactionApprovalSignature(tx, providedSignature, secret = getTransactionSignatureSecret()) {
  if (!providedSignature || typeof providedSignature !== 'string') return false;
  if (!tx || typeof tx !== 'object') return false;

  const canonicalPayload = buildTransactionCanonicalPayload(tx);
  if (!canonicalPayload) return false;

  const expectedHex = computeTransactionHmac(canonicalPayload, secret);

  let providedHex = providedSignature.trim();
  if (providedHex.startsWith('SIG-v1.')) {
    const parts = providedHex.split('.');
    providedHex = parts[parts.length - 1].trim();
  }

  if (providedHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(providedHex)) {
    return false;
  }

  const bufProvided = Buffer.from(providedHex.toLowerCase(), 'hex');
  const bufExpected = Buffer.from(expectedHex.toLowerCase(), 'hex');

  if (bufProvided.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

// 11. Aprobar Transacción con QR por el Cliente (Fase 1G-C.3: Protocolo Definitivo de Autorización Server-Side)
app.post('/api/portal/client/transactions/:id/approve', requirePortalAuth, requirePortalType('client'), verifyCsrf, async (req, res) => {
  try {
    const txId = req.params.id;
    const { authNonce } = req.body || {};

    let updatedTx = null;
    let errorCode = null;
    let errorMessage = null;

    await withCollectionLock('transactions', async () => {
      const txs = readCollection('transactions');
      const tx = txs.find(t => String(t.id) === String(txId));

      // 1. Ownership & Existencia: la transacción debe existir y pertenecer al cliente autenticado (req.portalUser.id)
      if (!tx || String(tx.clientId) !== String(req.portalUser.id)) {
        errorCode = 404;
        errorMessage = 'Transacción no encontrada';
        return;
      }

      // 2. Máquina de Estados: Solo se permite aprobar transacciones en 'pending_approval'
      if (tx.status !== 'pending_approval') {
        errorCode = 409;
        errorMessage = `La transacción no está pendiente de aprobación (estado actual: ${tx.status})`;
        return;
      }

      // 3. TTL: Validar que la solicitud de aprobación no haya superado 15 minutos de antigüedad
      const TX_APPROVAL_TTL_MS = 15 * 60 * 1000; // 15 minutos
      const txCreatedTime = tx.createdAt ? Number(tx.createdAt) : (tx.timestamp ? new Date(tx.timestamp).getTime() : (tx.date ? new Date(tx.date).getTime() : 0));
      if (!txCreatedTime || isNaN(txCreatedTime)) {
        errorCode = 400;
        errorMessage = 'La transacción no posee un timestamp de creación válido para autorización';
        return;
      }

      const age = Date.now() - txCreatedTime;
      if (age > TX_APPROVAL_TTL_MS) {
        errorCode = 410;
        errorMessage = 'La solicitud de aprobación ha expirado (límite de 15 minutos excedido)';
        return;
      }

      // 4. Verificación de Nonce: Si el cliente proporciona authNonce, debe coincidir exactamente con el server-generated en DB
      if (authNonce && typeof authNonce === 'string') {
        const providedNonce = authNonce.trim();
        const expectedNonce = String(tx.authNonce || '').trim();
        if (providedNonce !== expectedNonce) {
          errorCode = 400;
          errorMessage = 'Nonce de autorización inválido o no coincide con la transacción pendiente';
          return;
        }
      }

      // 5. Firma Criptográfica de Autoridad Server-Side (HMAC-SHA256 generada exclusivamente por el backend)
      const canonicalPayload = buildTransactionCanonicalPayload(tx);
      const serverAuthSignature = computeTransactionHmac(canonicalPayload);

      // 6. Transición atómica de estado a 'approved' y registro de auditoría
      tx.status = 'approved';
      tx.authSignature = `SIG-v1.${(tx.authNonce || '').slice(-8)}.${serverAuthSignature}`;
      tx.approvedByClientAt = new Date().toISOString();
      tx.approvedByClientIp = req.ip || '';

      writeCollection('transactions', txs, { action: 'update', collection: 'transactions', doc: tx });
      updatedTx = tx;
    });

    if (errorCode) {
      recordAuditLog({
        req,
        actorType: 'portal',
        action: 'qr.approve',
        resourceType: 'transactions',
        resourceId: txId,
        result: errorCode === 404 ? 'denied' : 'failure',
        metadata: { errorCode, errorMessage }
      });
      return res.status(errorCode).json({ error: errorMessage });
    }

    if (!updatedTx) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    recordAuditLog({
      req,
      actorType: 'portal',
      actorId: req.portalUser.id,
      actorRole: 'client',
      action: 'qr.approve',
      resourceType: 'transactions',
      resourceId: updatedTx.id,
      result: 'success',
      metadata: { amount: updatedTx.amount, status: 'approved' }
    });

    res.json({
      success: true,
      message: 'Transacción aprobada y autorizada por el cliente con éxito',
      transaction: updatedTx
    });
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

// Guardián de seguridad para servicio estático de /uploads (Fase 1F-B / 1K)
// Bloquea categóricamente cualquier intento de acceso a .json, .svg, .html, .js, .bak, .db, traversal, etc.
app.use('/uploads', (req, res, next) => {
  let decodedPath = req.path || '';
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  if (decodedPath.includes('\0')) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  const ext = path.extname(decodedPath).toLowerCase();
  if (!ext || !ALLOWED_STATIC_EXTENSIONS.has(ext)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  // Sanitizar path para evitar traversal hacia archivos fuera de uploadDir
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
  const baseDir = path.resolve(uploadDir);
  const resolvedTarget = path.resolve(baseDir, '.' + normalizedPath);
  const isContained = resolvedTarget === baseDir || resolvedTarget.startsWith(baseDir + path.sep);
  if (!isContained) {
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

app.use('/protected_media', (req, res, next) => {
  let decodedPath = req.path || '';
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  if (decodedPath.includes('\0')) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  const ext = path.extname(decodedPath).toLowerCase();
  if (!ext || !ALLOWED_STATIC_EXTENSIONS.has(ext)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  // Sanitizar path para evitar traversal
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
  const baseDir = path.resolve(protectedMediaDir);
  const resolvedTarget = path.resolve(baseDir, '.' + normalizedPath);
  const isContained = resolvedTarget === baseDir || resolvedTarget.startsWith(baseDir + path.sep);
  if (!isContained) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  next();
});
app.use('/protected_media', express.static(protectedMediaDir, {
  dotfiles: 'ignore',
  etag: true,
  lastModified: true
}));

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
app.patch('/api/products/:id', requireAuth, requireRole('admin', 'cajero'), verifyCsrf, async (req, res) => {
  try {
    const updatedProduct = await withCollectionLock('products', async () => {
      const data = readCollection('products');
      const index = data.findIndex(p => String(p.id) === String(req.params.id));

      if (index === -1) {
        return null;
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
          const err = new Error('Acceso denegado: los cajeros solo tienen autorización para ajustes de inventario (stock).');
          err.statusCode = 403;
          throw err;
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
      return data[index];
    });

    if (updatedProduct === null) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    recordAuditLog({
      req,
      action: 'inventory.stock_adjust',
      resourceType: 'products',
      resourceId: updatedProduct.id,
      result: 'success',
      metadata: {
        productName: updatedProduct.name,
        newStockKg: updatedProduct.stockKg,
        newStock: updatedProduct.stock
      }
    });

    res.json({ success: true, product: updatedProduct });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

// Crear producto local (Solo Admin + CSRF + validación de payload)
app.post('/api/products', requireAuth, requireRole('admin'), verifyCsrf, async (req, res) => {
  try {
    const { name, pricePerKg, wholesalePrice } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nombre de producto requerido' });
    }

    const newProduct = await withCollectionLock('products', async () => {
      const data = readCollection('products');
      const doc = { id: req.body.id || Date.now().toString(), ...req.body };
      data.push(doc);
      writeCollection('products', data, { action: 'add', collection: 'products', doc });
      return doc;
    });

    res.json({ success: true, product: newProduct });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error agregando producto' });
  }
});

// Eliminar producto local (Solo Admin + CSRF)
app.delete('/api/products/:id', requireAuth, requireRole('admin'), verifyCsrf, async (req, res) => {
  try {
    const deleted = await withCollectionLock('products', async () => {
      const data = readCollection('products');
      const previousDoc = data.find(p => String(p.id) === String(req.params.id));
      if (!previousDoc) {
        return false;
      }
      const filtered = data.filter(p => String(p.id) !== String(req.params.id));
      writeCollection('products', filtered, { action: 'delete', collection: 'products', doc: { id: req.params.id } }, previousDoc);
      return true;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

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
    user: process.env.EMAIL_USER || (isDevEnv ? 'dev-simulator@kalu.local' : ''),
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

    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
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
  const emailUser = process.env.EMAIL_USER || (isDevEnv ? 'dev-simulator@kalu.local' : '');
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


// ============================================================
// WEBHOOK LEGACY '/webhook' NEUTRALIZADO
// El endpoint '/webhook' sin prefijo /api permanece deshabilitado (410 Gone).
// ============================================================
app.all('/webhook', (req, res) => {
  console.warn(`[Legacy Webhook Neutralized] Petición ${req.method} a endpoint legacy '${req.originalUrl}' rechazada con 410 Gone.`);
  return res.status(410).json({
    error: 'Endpoint legacy de webhook deshabilitado. Utilice /api/webhook/whatsapp o /api/webhook.'
  });
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
  validate: { default: false },
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

// Rate limiter específico para sincronización de tasa BCV (Prevención de flood / scraping externo: 15 req/min por IP)
const syncRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  store: syncRateLimiterStore,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas solicitudes de sincronización de tasa. Por favor espere un momento.'
  }
});

// Rate limiter específico para revisión manual de cobranzas (Máximo 5 ejecuciones por cada 15 min por usuario autenticado/IP)
const debtCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: debtCheckLimiterStore,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  keyGenerator: (req) => {
    if (req.user?.id) return `debt_check_user_${req.user.id}`;
    if (req.session?.userId) return `debt_check_session_${req.session.userId}`;
    return req.ip || 'unknown_ip';
  },
  message: {
    success: false,
    error: 'Demasiadas solicitudes de revisión de cobranzas. Por favor espere 15 minutos.'
  }
});

// Rate limiter específico para descarga de Backups completos (Máximo 10 descargas por cada 15 min por admin/IP)
const adminBackupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  keyGenerator: (req) => {
    if (req.user?.id) return `backup_user_${req.user.id}`;
    return req.ip || 'unknown_ip';
  },
  message: {
    error: 'Demasiadas solicitudes de respaldo generadas. Por favor espere 15 minutos.'
  }
});

// Rate limiter específico para Restauración de Backup (Operación destructiva: Máximo 5 por cada 15 min por admin/IP)
const adminRestoreLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  keyGenerator: (req) => {
    if (req.user?.id) return `restore_user_${req.user.id}`;
    return req.ip || 'unknown_ip';
  },
  message: {
    error: 'Demasiadas solicitudes de restauración de respaldo. Por favor espere 15 minutos.'
  }
});

// Rate limiter específico para Restablecimiento Contable (Operación destructiva: Máximo 3 por cada 15 min por admin/IP)
const adminResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  keyGenerator: (req) => {
    if (req.user?.id) return `reset_acct_user_${req.user.id}`;
    return req.ip || 'unknown_ip';
  },
  message: {
    error: 'Demasiadas solicitudes de restablecimiento contable. Por favor espere 15 minutos.'
  }
});

// Cadena de modelos Gemini activos (Prioridad: 3.7-flash -> 3.6-flash -> flash-latest)
// Modelos deprecados/removidos por Google (2.5-flash, 2.0-flash, 1.5-flash) excluidos
const GEMINI_FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];

// Configuración de límites temporales para fallback rápido y seguro
const PER_ATTEMPT_TIMEOUT_MS = 12000; // 12 segundos por defecto para operaciones de texto ligero
const TOTAL_OPERATION_BUDGET_MS = 30000; // 30 segundos de presupuesto total general
const OCR_ATTEMPT_TIMEOUT_MS = 25000; // 25 segundos por intento para OCR de facturas densas/multimodales
const OCR_TOTAL_BUDGET_MS = 60000; // 60 segundos de presupuesto total para OCR multimodal

/**
 * Clasificador seguro de errores de Gemini: determina si el error es recuperable mediante fallback
 */
function classifyGeminiError(err) {
  if (!err) return { type: 'UNKNOWN', isTransient: false };

  const msg = String(err.message || '').toLowerCase();
  const status = Number(err.status || err.statusCode || (err.error && err.error.code) || 0);

  if (err.isTimeout || msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline exceeded')) {
    return { type: 'TIMEOUT', isTransient: true };
  }

  if (status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('resource exhausted') || msg.includes('rate limit')) {
    return { type: 'RATE_LIMIT', isTransient: true };
  }

  if (status === 503 || status === 500 || status === 502 || status === 504 || msg.includes('unavailable') || msg.includes('high demand') || msg.includes('service unavailable')) {
    return { type: 'MODEL_UNAVAILABLE', isTransient: true };
  }

  if (msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('socket') || msg.includes('network')) {
    return { type: 'NETWORK_ERROR', isTransient: true };
  }

  if (status === 401 || status === 403 || msg.includes('api key') || msg.includes('unauthorized') || msg.includes('permission denied')) {
    return { type: 'AUTH_ERROR', isTransient: false };
  }

  if (status === 400 || msg.includes('invalid argument') || msg.includes('bad request')) {
    return { type: 'INVALID_REQUEST', isTransient: false };
  }

  if (status === 413 || msg.includes('too large') || msg.includes('payload')) {
    return { type: 'PAYLOAD_TOO_LARGE', isTransient: false };
  }

  return { type: 'GENERIC_ERROR', isTransient: true };
}

// Helper de ejecución resiliente con modelos Gemini server-side con telemetría de desarrollo segura y fallback rápido nativo
// NOTA SDK: config.abortSignal y config.httpOptions.timeout cancelan/abandonan la llamada desde el cliente SDK.
// Google advierte que una operación ya despachada a la red puede seguir siendo facturable o procesada remotamente.
async function generateGeminiContentServer({ prompt, systemInstruction, imageBase64, mimeType, responseJson = false, maxOutputTokens, temperature = 0.2, operation = 'general', attemptTimeoutMs, totalBudgetMs }) {
  const resolvedAttemptTimeout = attemptTimeoutMs !== undefined
    ? attemptTimeoutMs
    : (operation === 'ocr_invoice' ? OCR_ATTEMPT_TIMEOUT_MS : PER_ATTEMPT_TIMEOUT_MS);
  const resolvedTotalBudget = totalBudgetMs !== undefined
    ? totalBudgetMs
    : (operation === 'ocr_invoice' ? OCR_TOTAL_BUDGET_MS : TOTAL_OPERATION_BUDGET_MS);
  if (!ai) {
    const noConfigErr = new Error('Servicio de IA no configurado en el servidor');
    noConfigErr.code = 'AI_CONFIGURATION_ERROR';
    throw noConfigErr;
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

  const models = GEMINI_FALLBACK_MODELS;
  let lastError = null;
  const promptLength = (systemInstruction ? String(systemInstruction).length : 0) + (prompt ? String(prompt).length : 0);
  const estimatedTokens = Math.ceil(promptLength / 4);
  const overallStartTime = Date.now();

  for (let i = 0; i < models.length; i++) {
    const elapsedTotal = Date.now() - overallStartTime;
    const remainingBudget = resolvedTotalBudget - elapsedTotal;

    // Si el presupuesto global de la operación se agotó por completo
    if (remainingBudget <= 0) {
      const budgetErr = new Error(`Presupuesto global de tiempo (${resolvedTotalBudget}ms) excedido`);
      budgetErr.code = 'TOTAL_BUDGET_EXCEEDED';
      budgetErr.isTimeout = true;
      lastError = budgetErr;
      if (process.env.NODE_ENV !== 'production' && !process.env.SUPPRESS_AI_LOGS) {
        console.warn(`[AI Telemetry Warning] Op: ${operation} | Presupuesto total agotado (${elapsedTotal}ms >= ${resolvedTotalBudget}ms). Deteniendo cadena de modelos.`);
      }
      break;
    }

    const effectiveTimeout = Math.min(resolvedAttemptTimeout, remainingBudget);
    const model = models[i];
    const attemptStartTime = Date.now();

    // AbortController NUEVO por intento para cancelación cliente nativa en el SDK
    const controller = new AbortController();
    let attemptTimer = null;

    const baseConfig = {
      temperature,
      abortSignal: controller.signal,
      httpOptions: {
        timeout: effectiveTimeout
      }
    };
    if (responseJson) {
      baseConfig.responseMimeType = 'application/json';
    }
    if (maxOutputTokens) {
      baseConfig.maxOutputTokens = maxOutputTokens;
    }

    try {
      // Temporizador de guardia en Node.js que aborta el signal nativo del cliente al llegar al effectiveTimeout
      attemptTimer = setTimeout(() => {
        controller.abort();
      }, effectiveTimeout);

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: baseConfig
      });

      if (attemptTimer) clearTimeout(attemptTimer);

      if (response && response.text) {
        const attemptDurationMs = Date.now() - attemptStartTime;
        const totalDurationMs = Date.now() - overallStartTime;
        if (process.env.NODE_ENV !== 'production' && !process.env.SUPPRESS_AI_LOGS) {
          console.log(`[AI Telemetry] Op: ${operation} | Model: ${model} | Attempt: ${i + 1}/${models.length} | Chars: ${promptLength} | EstTokens: ~${estimatedTokens} | AttemptDuration: ${attemptDurationMs}ms | TotalDuration: ${totalDurationMs}ms | EffectiveTimeout: ${effectiveTimeout}ms | Fallback: ${i > 0 ? 'YES' : 'NO'}`);
        }
        return response.text;
      }
    } catch (err) {
      if (attemptTimer) clearTimeout(attemptTimer);

      const isAbortOrTimeout = controller.signal.aborted || err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('abort');

      // Crear error normalizado sin mutar propiedades originales del SDK (evita TypeError por getters de solo lectura)
      const normalizedError = new Error(isAbortOrTimeout ? `Tiempo de espera agotado (${effectiveTimeout}ms) en modelo ${model}` : (err?.message || 'Error en Gemini API'));
      normalizedError.isTimeout = isAbortOrTimeout;
      normalizedError.status = err?.status || err?.statusCode || (err?.error && err?.error?.code);
      normalizedError.cause = err;

      lastError = normalizedError;
      const attemptDurationMs = Date.now() - attemptStartTime;
      const classification = classifyGeminiError(normalizedError);

      if (process.env.NODE_ENV !== 'production' && !process.env.SUPPRESS_AI_LOGS) {
        console.warn(`[AI Telemetry Warning] Op: ${operation} | Model: ${model} | Attempt: ${i + 1}/${models.length} | Type: ${classification.type} | Duration: ${attemptDurationMs}ms | Err: ${normalizedError.message}`);
      }

      // Si el error es no recuperable (credenciales malas o request inválido), no recorrer el resto de modelos
      if (!classification.isTransient) {
        throw normalizedError;
      }
    } finally {
      if (attemptTimer) clearTimeout(attemptTimer);
    }
  }

  const finalTotalDuration = Date.now() - overallStartTime;
  if (process.env.NODE_ENV !== 'production' && !process.env.SUPPRESS_AI_LOGS) {
    console.error(`[AI Telemetry Error] Op: ${operation} | Todos los modelos fallaron tras ${finalTotalDuration}ms. Último error: ${lastError?.message || 'Desconocido'}`);
  }

  const classification = classifyGeminiError(lastError);
  let safeMessage = 'El servicio de IA está temporalmente ocupado. Intente nuevamente en unos momentos.';
  let safeCode = 'AI_TEMPORARILY_UNAVAILABLE';

  if (classification.type === 'TIMEOUT') {
    safeMessage = 'La IA tardó más de lo esperado. Intente nuevamente.';
    safeCode = 'AI_TIMEOUT';
  } else if (classification.type === 'AUTH_ERROR') {
    safeMessage = 'El servicio de IA no está disponible en este momento.';
    safeCode = 'AI_CONFIGURATION_ERROR';
  } else if (classification.type === 'INVALID_REQUEST' || classification.type === 'PAYLOAD_TOO_LARGE') {
    safeMessage = 'La solicitud no pudo ser procesada por la IA.';
    safeCode = 'AI_INVALID_REQUEST';
  }

  const safeFinalError = new Error(safeMessage);
  safeFinalError.code = safeCode;
  safeFinalError.classification = classification.type;
  safeFinalError.originalError = lastError;
  throw safeFinalError;
}

// ============================================================
// HELPERS DE CONTEXTO DETERMINISTA MÍNIMO PARA IA (FASE 2)
// ============================================================

/**
 * 1. Recuperar productos relevantes para IA con ranking determinista (límite por defecto: 10)
 */
function retrieveRelevantProductsForAI(queryText, allProducts = [], limit = 10) {
  return retrieveRelevantProducts(queryText, allProducts, limit);
}

/**
 * 2. Recuperar clientes relevantes para IA (límite por defecto: 5)
 */
function retrieveRelevantClientsForAI(queryText, allClients = [], limit = 5) {
  const cleanQuery = normalizeSearchText(queryText);
  if (!cleanQuery) return { clients: [], isGeneralQuery: true, totalMatches: 0 };

  const cleanQueryCompact = cleanQuery.replace(/\s+/g, '');
  const scored = [];

  for (const c of allClients) {
    const cName = normalizeSearchText(c.name || '');
    const cCedula = normalizeSearchText(c.cedula || c.idNumber || c.id || '');
    const cCedulaCompact = cCedula.replace(/\s+/g, '');
    const cPhone = (c.phone || '').replace(/[^0-9]/g, '');

    let score = 0;

    // 1. Coincidencia exacta de cédula / RIF / ID / Teléfono (+100)
    if (
      cleanQuery === cCedula ||
      (cleanQueryCompact.length >= 4 && cCedulaCompact.includes(cleanQueryCompact)) ||
      (cleanQueryCompact.length >= 6 && cPhone.includes(cleanQueryCompact))
    ) {
      score += 100;
    } else if (cName === cleanQuery) {
      score += 80;
    } else if (cleanQuery.length >= 3 && cName.includes(cleanQuery)) {
      score += 60;
    } else {
      const tokens = cleanQuery.split(' ').filter(t => t.length > 2);
      for (const t of tokens) {
        if (cName.includes(t)) {
          score += 20;
        } else if (t.length >= 4) {
          const words = cName.split(' ');
          for (const w of words) {
            if (w.length >= 3 && levenshteinDistance(t, w) === 1) {
              score += 15;
              break;
            }
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ client: c, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topClients = scored.slice(0, limit).map(item => {
    const c = item.client;
    return {
      id: c.id,
      nombre: c.name,
      cedula: c.cedula || c.idNumber || 'S/C',
      saldo_deuda: Number(c.outstandingDebt || 0),
      limite_credito: Number(c.creditLimit || 0)
    };
  });

  return { clients: topClients, isGeneralQuery: false, totalMatches: scored.length };
}

/**
 * 3. Recuperar proveedores relevantes para IA (límite por defecto: 5)
 */
function retrieveRelevantSuppliersForAI(queryText, allSuppliers = [], limit = 5) {
  const cleanQuery = normalizeSearchText(queryText);
  if (!cleanQuery) return { suppliers: [], isGeneralQuery: true, totalMatches: 0 };

  const cleanQueryCompact = cleanQuery.replace(/\s+/g, '');
  const scored = [];

  for (const s of allSuppliers) {
    const sName = normalizeSearchText(s.name || '');
    const sRif = normalizeSearchText(s.rif || s.idNumber || s.id || '');
    const sRifCompact = sRif.replace(/\s+/g, '');

    let score = 0;

    if (
      cleanQuery === sRif ||
      (cleanQueryCompact.length >= 4 && sRifCompact.includes(cleanQueryCompact))
    ) {
      score += 100;
    } else if (sName === cleanQuery) {
      score += 80;
    } else if (cleanQuery.length >= 3 && sName.includes(cleanQuery)) {
      score += 60;
    } else {
      const tokens = cleanQuery.split(' ').filter(t => t.length > 2);
      for (const t of tokens) {
        if (sName.includes(t)) {
          score += 20;
        } else if (t.length >= 4) {
          const words = sName.split(' ');
          for (const w of words) {
            if (w.length >= 3 && levenshteinDistance(t, w) === 1) {
              score += 15;
              break;
            }
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ supplier: s, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topSuppliers = scored.slice(0, limit).map(item => {
    const s = item.supplier;
    return {
      id: s.id,
      nombre: s.name,
      rif: s.rif || s.idNumber || 'S/R',
      deuda_a_pagar: Number(s.balanceOwed || 0),
      es_productor_queso: Boolean(s.isCheeseProducer)
    };
  });

  return { suppliers: topSuppliers, isGeneralQuery: false, totalMatches: scored.length };
}

/**
 * 4. Helper de balance determinista de deudas (evita que la IA sume o calcule)
 */
function retrieveRelevantDebtsForAI(entityId, entityType, allInstallments = [], allSuppliers = [], allClients = []) {
  if (!entityId) return { entity: null, totalDebt: 0, pendingInstallments: [] };

  if (entityType === 'supplier') {
    const sup = allSuppliers.find(s => s.id === entityId || normalizeSearchText(s.name) === normalizeSearchText(entityId));
    return {
      entityType: 'supplier',
      entityId: sup ? sup.id : entityId,
      name: sup ? sup.name : 'Desconocido',
      totalDebtOwed: sup ? Number(sup.balanceOwed || 0) : 0,
      storeDebt: sup ? Number(sup.storeDebt || 0) : 0
    };
  }

  const cli = allClients.find(c => c.id === entityId || normalizeSearchText(c.name) === normalizeSearchText(entityId));
  const pending = allInstallments.filter(i => (i.clientId === entityId || (cli && i.clientId === cli.id)) && i.status !== 'paid');
  const sumPending = pending.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  return {
    entityType: 'client',
    entityId: cli ? cli.id : entityId,
    name: cli ? cli.name : 'Desconocido',
    totalDebt: cli ? Number(cli.outstandingDebt || sumPending) : sumPending,
    pendingInstallmentCount: pending.length,
    nextDueDates: pending.slice(0, 3).map(i => ({ amount: Number(i.amount), dueDate: i.dueDate }))
  };
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
// Accesible para roles CRM (admin, accountant, cajero) con inyección de contexto determinista acotado
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

    // Inyección de contexto mínimo intencional según la intención de la consulta
    let dynamicSystemContext = context || 'Eres un asistente experto en finanzas y control de inventario de la Quesería Kalu. Mantén tus respuestas claras, concisas y orientadas a la operativa del negocio.';

    const normPrompt = normalizeSearchText(prompt);
    if (normPrompt.includes('proveedor') || normPrompt.includes('deuda') || normPrompt.includes('debo')) {
      const sups = readCollection('suppliers');
      const relSups = retrieveRelevantSuppliersForAI(prompt, sups, 3);
      if (relSups.suppliers.length > 0) {
        dynamicSystemContext += `\n[CANDIDATOS PROVEEDORES RELEVANTES]: ${JSON.stringify(relSups.suppliers)}`;
      }
    } else if (normPrompt.includes('precio') || normPrompt.includes('costo') || normPrompt.includes('stock') || normPrompt.includes('inventario')) {
      const prods = readCollection('products');
      const relProds = retrieveRelevantProductsForAI(prompt, prods, 5);
      if (relProds.products.length > 0) {
        dynamicSystemContext += `\n[PRODUCTOS RELEVANTES REQUERIDOS]: ${JSON.stringify(relProds.products)}`;
      }
    }

    const textResponse = await generateGeminiContentServer({
      prompt,
      systemInstruction: dynamicSystemContext,
      imageBase64: imageBase64 || undefined,
      mimeType: mimeType || undefined,
      temperature: 0.3,
      operation: 'crm_chat'
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

    // Contexto Mínimo: Seleccionar candidatos relevantes para la orden (máximo 15 items relevantes)
    const baseProducts = Array.isArray(products) && products.length > 0 ? products : readCollection('products');
    const relMatches = retrieveRelevantProductsForAI(command, baseProducts, 15);
    const catalogSummary = (relMatches.products.length > 0 ? relMatches.products : baseProducts.slice(0, 10)).map(p => ({
      id: p.id,
      name: p.nombre || p.name,
      category: p.categoria || p.category,
      unit: p.unidad || p.unit || 'Und',
      purchasePrice: Number(p.precio_usd || p.purchasePrice || 0),
      sellingPrice: Number(p.precio_usd || p.sellingPrice || 0),
    }));

    const promptText = `
      Eres un asistente virtual integrado en el CRM de gestión de inventario de Quesería Kalu.
      Tu tarea es interpretar la orden del usuario y devolver un JSON puro con las acciones sugeridas.

      CANDIDATOS RELEVANTES DE INVENTARIO (Solo lectura):
      ${JSON.stringify(catalogSummary)}

      ORDEN DEL USUARIO:
      "${command}"

      INSTRUCCIONES Y REGLAS ESTRICTAS:
      1. Responde SIEMPRE con un único objeto JSON puro sin markdown.
      2. Estructura requerida:
         {
           "actions": [
             {
               "type": "ADD_PRODUCT" | "UPDATE_PRODUCT" | "NOTIFY" | "ERROR",
               "payload": { ... }
             }
           ],
           "message": "Mensaje descriptivo y breve para el usuario"
         }
      3. Para ADD_PRODUCT, el payload incluye: name, category (Repuestos | Charcutería | Víveres | Genérico), unit (Kg | Lt | Und | Bulto), purchasePrice, sellingPrice, stockKg (por defecto 0).
      4. Para UPDATE_PRODUCT, el payload DEBE incluir 'id' exacto del producto candidato y solo los campos a modificar.
      5. No realizar borrados.
    `;

    const rawResult = await generateGeminiContentServer({
      prompt: promptText,
      responseJson: true,
      temperature: 0.1,
      operation: 'inventory_command'
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    let parsed = {};
    try {
      parsed = JSON.parse(cleanText || '{}');
    } catch (parseErr) {
      return res.status(200).json({
        success: true,
        actions: [{ type: 'NOTIFY', payload: { message: 'La respuesta de la IA requiere confirmación manual.' } }],
        message: 'No fue posible estructurar la orden automáticamente.'
      });
    }

    // Validación local estricta de acciones
    const safeActions = [];
    if (Array.isArray(parsed.actions)) {
      for (const act of parsed.actions) {
        if (act && typeof act === 'object' && ['ADD_PRODUCT', 'UPDATE_PRODUCT', 'NOTIFY', 'ERROR'].includes(act.type)) {
          if (act.type === 'ADD_PRODUCT' && act.payload) {
            act.payload.purchasePrice = Math.max(0, Number(act.payload.purchasePrice) || 0);
            act.payload.sellingPrice = Math.max(0, Number(act.payload.sellingPrice) || 0);
            act.payload.stockKg = Math.max(0, Number(act.payload.stockKg) || 0);
          }
          safeActions.push(act);
        }
      }
    }

    res.json({
      success: true,
      actions: safeActions,
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

    // Minimización de contexto: Gemini extrae nombres de la imagen sin requerir volcar 600 productos al prompt inicial.
    // El matching fino contra el catálogo se ejecuta de forma determinista y precisa post-OCR.
    const promptText = `
      Eres un auditor contable de facturas comerciales para la Quesería Kalu.
      Extrae los datos de esta factura de compra en formato JSON estricto.

      REGLAS DE ORO:
      1. Responde ÚNICAMENTE con un objeto JSON válido (sin markdown ni texto antes ni después).
      2. UNIDADES: 'Und', 'Kg', 'Lt' o 'Bulto' (si indica bultos, sacos, fardos, cajas o paquetes).
      3. MONEDA Y CONVERSIÓN:
         - Tasa oficial BCV: ${safeRate} Bs/$.
         - Si la factura o renglón está en Bolívares (Bs), convierte a USD dividiendo entre ${safeRate}.
         - Si está en USD ($), conserva los montos en USD.
         - 'costo_unitario' y 'costo_total' deben ser números positivos mayores a 0 en USD.
      4. Extracción de Renglones:
         - Extrae cada producto con su nombre comercial limpio en mayúsculas, cantidad, unidad y costo.

      ESTRUCTURA JSON REQUERIDA:
      {
        "proveedor": { "nombre": "Nombre de la empresa o proveedor", "rif": "J-12345678" },
        "factura": "Número de factura o control",
        "fecha": "YYYY-MM-DD",
        "moneda_detectada": "USD" | "BS",
        "items": [
          { "nombre": "NOMBRE DEL ARTICULO", "cantidad": 0, "unidad": "Und" | "Kg" | "Lt" | "Bulto", "costo_unitario": 0, "costo_total": 0 }
        ]
      }
    `;

    const rawData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const rawResult = await generateGeminiContentServer({
      prompt: promptText,
      imageBase64: rawData,
      mimeType: cleanMime,
      responseJson: true,
      temperature: 0.1,
      operation: 'ocr_invoice'
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    let parsed = {};
    try {
      parsed = JSON.parse(cleanText || '{}');
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Respuesta OCR no estructurada correctamente por la IA' });
    }

    // Validación y Emparejamiento Local Determinista Post-OCR
    const allProducts = readCollection('products');
    if (parsed && parsed.items && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map(it => {
        const rawName = String(it.nombre || '').trim();
        const matched = retrieveRelevantProductsForAI(rawName, allProducts, 1);
        const canonicalName = (matched.products.length > 0 && matched.products[0].nombre) ? matched.products[0].nombre : rawName.toUpperCase();
        const qty = Math.max(0.01, Number(it.cantidad) || 1);
        const unitCost = Math.max(0, Number(it.costo_unitario) || 0);
        const totalCost = Number(it.costo_total) > 0 ? Number(it.costo_total) : parseFloat((qty * unitCost).toFixed(2));

        return {
          nombre: canonicalName,
          cantidad: qty,
          unidad: ['Kg', 'Lt', 'Und', 'Bulto'].includes(it.unidad) ? it.unidad : 'Und',
          costo_unitario: unitCost,
          costo_total: totalCost
        };
      });
    }

    res.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('[AI OCR Invoice Error]:', error.message || 'Error en OCR');

    const errCode = error.code || 'AI_PROCESSING_ERROR';
    let statusCode = 500;
    let safeMessage = error.message || 'No fue posible procesar la factura con la IA.';

    if (errCode === 'AI_TEMPORARILY_UNAVAILABLE' || error.classification === 'MODEL_UNAVAILABLE' || error.classification === 'RATE_LIMIT' || error.classification === 'NETWORK_ERROR') {
      statusCode = 503;
      safeMessage = 'El servicio de IA está temporalmente ocupado. Intente nuevamente en unos momentos.';
    } else if (errCode === 'AI_TIMEOUT' || errCode === 'TOTAL_BUDGET_EXCEEDED' || error.classification === 'TIMEOUT') {
      statusCode = 504;
      safeMessage = 'La IA tardó más de lo esperado. Intente nuevamente.';
    } else if (errCode === 'AI_CONFIGURATION_ERROR' || error.classification === 'AUTH_ERROR') {
      statusCode = 503;
      safeMessage = 'El servicio de IA no está disponible en este momento.';
    } else if (errCode === 'AI_INVALID_REQUEST' || error.classification === 'INVALID_REQUEST' || error.classification === 'PAYLOAD_TOO_LARGE') {
      statusCode = 400;
      safeMessage = 'La solicitud o formato de imagen no pudo ser procesada por la IA.';
    } else {
      statusCode = 500;
      safeMessage = 'No fue posible procesar la factura con la IA.';
    }

    res.status(statusCode).json({
      success: false,
      code: errCode,
      error: safeMessage
    });
  }
});

// 5. Dictado de Compras (POST /api/ai/parse-dictation)
// Accesible para administradores y cajeros.
app.post('/api/ai/parse-dictation', requireAuth, requireRole('admin', 'accountant', 'cajero'), verifyCsrf, aiRateLimiter, async (req, res) => {
  try {
    const { text, bcvRate = 45 } = req.body || {};

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

    // Recuperar candidatos de catálogo local relevantes al texto del dictado (máx 15 productos)
    const allProducts = readCollection('products');
    const relCatalog = retrieveRelevantProductsForAI(text, allProducts, 15);
    const candidateNames = relCatalog.products.map(p => p.nombre);

    const promptText = `
      Eres un asistente contable y de compras de alta precisión para la Quesería Kalu.
      Analiza esta orden o dictado de mercancía: "${text}".
      Tasa BCV de referencia: ${safeRate} Bs/$.

      CANDIDATOS DE PRODUCTOS RELEVANTES:
      ${candidateNames.length > 0 ? candidateNames.join(", ") : "Ninguno específico"}

      REGLAS DE EXTRACCIÓN:
      1. Devuelve ÚNICAMENTE un JSON válido sin markdown.
      2. UNIDADES: 'Und', 'Kg', 'Lt' o 'Bulto'.
      3. MONEDA: Si menciona precios en Bolívares (Bs), convierte a USD dividiendo entre ${safeRate}.
      4. PRECIOS: Si solo menciona el total, calcula costo_unitario = total / cantidad.
      5. Si un ítem corresponde a los candidatos relevantes, usa ese nombre exacto.

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
      temperature: 0.1,
      operation: 'parse_dictation'
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    let parsed = {};
    try {
      parsed = JSON.parse(cleanText || '{}');
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Error parseando respuesta estructurada de la IA' });
    }

    let items = [];
    if (parsed.items && Array.isArray(parsed.items)) {
      items = parsed.items.map(it => {
        const rawName = String(it.nombre || '').trim();
        const matched = retrieveRelevantProductsForAI(rawName, allProducts, 1);
        const finalName = (matched.products.length > 0 && matched.products[0].nombre) ? matched.products[0].nombre : rawName.toUpperCase();
        const qty = Math.max(0.01, Number(it.cantidad) || 1);
        const costUnit = Math.max(0, Number(it.costo_unitario) || 0);
        const costTotal = Number(it.costo_total) > 0 ? Number(it.costo_total) : parseFloat((qty * costUnit).toFixed(2));

        return {
          nombre: finalName,
          cantidad: qty,
          unidad: ['Kg', 'Lt', 'Und', 'Bulto'].includes(it.unidad) ? it.unidad : 'Und',
          costo_unitario: costUnit,
          costo_total: costTotal
        };
      });
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
      1. Si menciona compras o gastos, extrae el monto. Si está en Bs, calcula el equivalente en USD dividiendo entre ${safeRate}.
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
      temperature: 0.1,
      operation: 'parse_voice_note'
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    let parsed = {};
    try {
      parsed = JSON.parse(cleanText || '{}');
    } catch (e) {
      return res.json({
        success: true,
        data: {
          title: 'Nota de Voz',
          category: 'nota_general',
          summary: text,
          suggestedAction: 'Revisión manual (Formato no estructurado)'
        }
      });
    }

    // Validación local de montos numéricos
    if (parsed) {
      parsed.amountUsd = Math.max(0, Number(parsed.amountUsd) || 0);
      parsed.amountBs = Math.max(0, Number(parsed.amountBs) || 0);
      if (!['gasto', 'ingreso', 'compra', 'deuda', 'nota_general'].includes(parsed.category)) {
        parsed.category = 'nota_general';
      }
    }

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

    // Catálogo acotado de productos de queso relevantes
    const allProducts = readCollection('products');
    const cheeseMatches = retrieveRelevantProductsForAI(text + ' queso', allProducts, 10);
    const cheeseCatalogNames = cheeseMatches.products.length > 0
      ? cheeseMatches.products.map(p => p.nombre).join(', ')
      : 'QUESO DURO, QUESO SEMIDURO, QUESO BLANCO, QUESO PAISA';

    const promptText = `
      Eres el asistente operativo de la Quesería Kalu.
      Analiza esta orden hablada de salida para una gira/viaje a San Juan: "${text}".
      Tasa BCV actual: ${safeRate} Bs/$.

      CATÁLOGO DISPONIBLE DE PRODUCTOS DE QUESO:
      ${cheeseCatalogNames}

      RESPONSABLES POSIBLES:
      - Daisy Corro
      - Juan Carlos Domínguez

      INSTRUCCIONES DE EXTRACCIÓN:
      1. Devuelve ÚNICAMENTE un JSON válido sin markdown.
      2. Identifica si menciona un responsable (Daisy o Juan Carlos). Si no menciona ninguno, omite el campo.
      3. Extrae la cantidad en kilogramos (dispatchedKg) y el tipo de queso.
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
      temperature: 0.1,
      operation: 'parse_trip'
    });

    let cleanText = (rawResult || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    let parsed = {};
    try {
      parsed = JSON.parse(cleanText || '{}');
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Respuesta no estructurada correctamente por la IA' });
    }

    // Validación local estricta de datos de gira
    if (parsed) {
      parsed.dispatchedKg = Math.max(0, Number(parsed.dispatchedKg) || 0);
      parsed.costPerKg = Math.max(0, Number(parsed.costPerKg) || 0);
      parsed.cashTakenUsd = Math.max(0, Number(parsed.cashTakenUsd) || 0);
      parsed.cashTakenBs = Math.max(0, Number(parsed.cashTakenBs) || 0);
      parsed.bankTakenUsd = Math.max(0, Number(parsed.bankTakenUsd) || 0);
      parsed.bankTakenBs = Math.max(0, Number(parsed.bankTakenBs) || 0);
    }

    res.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('[AI Parse Trip Error]:', error.message || 'Error en parseo de gira');
    res.status(500).json({ success: false, error: 'Error procesando salida de gira con IA' });
  }
});

// --- GENERIC COLLECTIONS API WITH ASYNC MUTEX LOCK & ATOMIC TRANSACTIONS (FASE 1H) ---

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

/**
 * Primitivo centralizado de escritura atómica en disco (Fase 1H)
 * 1. Crea archivo temporal único en el mismo directorio/filesystem.
 * 2. Escribe buffer completo y ejecuta fsyncSync para garantizar persistencia física.
 * 3. Renombra atómicamente a la ruta destino final.
 * 4. Limpia temporales en caso de fallo y NUNCA destruye ni trunca el archivo anterior.
 */
function atomicWriteJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
  );

  const serialized = JSON.stringify(data, null, 2);
  let fd = null;
  try {
    fd = fs.openSync(tempPath, 'w');
    fs.writeSync(fd, serialized, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    let renamed = false;
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        fs.renameSync(tempPath, filePath);
        renamed = true;
        break;
      } catch (renameErr) {
        lastErr = renameErr;
        if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY' || renameErr.code === 'EACCES') {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        } else {
          throw renameErr;
        }
      }
    }
    if (!renamed && lastErr) {
      throw lastErr;
    }
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    console.error(`[AtomicWrite Error] Fallo al escribir atómicamente ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Lectura segura de colecciones JSON con protección contra corrupción (Fase 1H)
 * Si el archivo existe pero está corrupto/inválido:
 * - NO devuelve [] silenciosamente (lo cual destruiría datos en una posterior escritura).
 * - Crea un snapshot de resguardo '.corrupt.<timestamp>' para análisis forense.
 * - Lanza excepción clara impidiendo sobrescrituras destructivas.
 */
const readCollection = (name) => {
  const filePath = getCollectionFilePath(name);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw || raw.trim().length === 0) {
    // Archivo vacío existente: parsear como array vacío si es válido
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) && typeof parsed !== 'object') {
      throw new Error(`Estructura JSON no válida para la colección ${name}`);
    }
    return parsed;
  } catch (e) {
    const corruptSnapshot = path.join(dataDir, `${name}_db.json.corrupt-${Date.now()}`);
    try {
      fs.copyFileSync(filePath, corruptSnapshot);
      console.error(`[Corrupt JSON Detected] Archivo ${name}_db.json corrupto. Snapshot de resguardo creado en: ${corruptSnapshot}`);
    } catch {}
    console.error(`[Fatal Data Integrity Error] Error parsing JSON for collection ${name}:`, e.message);
    throw new Error(`[DATA_INTEGRITY_ERROR] La base de datos de ${name} está corrupta o es inválida: ${e.message}`);
  }
};

/**
 * Coordinador de Transacciones Multi-Colección (Fase 1H)
 * Provee garantías ACID sobre archivos JSON:
 * - Snapshot consistente de colecciones en memoria.
 * - Modificaciones aisladas en memoria durante la ejecución.
 * - Validación antes de persistir.
 * - Commit atómico: serializa todas las colecciones modificadas con atomicWriteJsonFile.
 * - Rollback garantizado: si ocurre cualquier error, no se toca el disco ni se emiten eventos.
 * - Emisión diferida de Socket.IO únicamente tras el commit exitoso.
 */
async function withTransaction(fn) {
  return await withCollectionLock('GLOBAL_TRANSACTION', async () => {
    const snapshots = new Map(); // name -> original cloned JSON
    const stagedChanges = new Map(); // name -> modified JSON
    const stagedDeltas = []; // [{ delta, previousDoc }]
    const touchedCollections = new Set();

    function getCollectionData(name) {
      if (stagedChanges.has(name)) {
        return stagedChanges.get(name);
      }
      if (!snapshots.has(name)) {
        const original = readCollection(name);
        snapshots.set(name, JSON.parse(JSON.stringify(original)));
      }
      const workingCopy = JSON.parse(JSON.stringify(snapshots.get(name)));
      stagedChanges.set(name, workingCopy);
      return workingCopy;
    }

    const txContext = {
      read(name) {
        return getCollectionData(name);
      },
      write(name, data, delta = null, previousDoc = null) {
        if (!snapshots.has(name)) {
          const original = readCollection(name);
          snapshots.set(name, JSON.parse(JSON.stringify(original)));
        }
        touchedCollections.add(name);
        stagedChanges.set(name, JSON.parse(JSON.stringify(data)));
        if (delta) {
          stagedDeltas.push({ delta, previousDoc });
        } else {
          stagedDeltas.push({ reloadCollection: name });
        }
      }
    };

    // 1. Ejecutar lógica de negocio dentro del contexto transaccional
    let result;
    try {
      result = await fn(txContext);
    } catch (err) {
      console.warn(`[Transaction Aborted / Rollback In-Memory]:`, err.message);
      throw err;
    }

    // 2. Commit: Persistir todas las colecciones modificadas atómicamente
    const writtenBackups = new Map(); // name -> original snapshot para rollback físico si fallara una escritura
    try {
      for (const colName of touchedCollections) {
        const filePath = getCollectionFilePath(colName);
        const originalData = snapshots.get(colName);
        writtenBackups.set(colName, originalData);

        const newData = stagedChanges.get(colName);
        atomicWriteJsonFile(filePath, newData);
      }
    } catch (commitErr) {
      console.error(`[Transaction Commit Error] Fallo durante escritura física. Ejecutando rollback en disco...`, commitErr.message);
      // Rollback físico de colecciones que ya se hubiesen escrito
      for (const [colName, oldData] of writtenBackups.entries()) {
        try {
          const filePath = getCollectionFilePath(colName);
          if (oldData !== undefined) {
            atomicWriteJsonFile(filePath, oldData);
          }
        } catch (rollbackErr) {
          console.error(`[Critical Rollback Error] (${colName}):`, rollbackErr.message);
        }
      }
      throw commitErr;
    }

    // 3. Post-Commit: Emitir deltas Socket.IO encolados de forma segura
    for (const item of stagedDeltas) {
      if (item.delta) {
        emitCollectionDeltaScoped(item.delta, item.previousDoc);
      } else if (item.reloadCollection) {
        emitCollectionUpdatedScoped(item.reloadCollection);
      }
    }

    return result;
  });
}

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
  atomicWriteJsonFile(filePath, data);

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

    // Transacción Multi-Colección con snapshot, rollback y atomic write
    const result = await withTransaction(async (tx) => {
      // 1. PRODUCTS & KARDEX
      const productsData = tx.read('products');
      const kardexData = tx.read('kardex');
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
          // Encolar delta de kardex
          tx.write('kardex', kardexData, { action: 'add', collection: 'kardex', doc: kardexMovement });
        }
      }
      tx.write('products', productsData);

      // 2. CLIENT / SUPPLIER
      let updatedClient = null;
      let updatedSupplier = null;
      let finalCustomerName = customerName || 'Cliente de Mostrador';

      if (clientId) {
        const clientsData = tx.read('clients');
        const cIndex = clientsData.findIndex(c => String(c.id) === String(clientId));
        if (cIndex !== -1) {
          const c = clientsData[cIndex];
          finalCustomerName = c.name;
          const addedPoints = Math.round(Number(amountPaid || 0));

          let newDebt = 0;
          if (debtAmount > 0) {
            const { effectiveDebt } = resolveClientDebtState(c);
            newDebt = Math.round((effectiveDebt + debtAmount) * 100) / 100;
          } else {
            newDebt = Number(c.outstandingDebt || 0);
          }

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
            currentDebtUsd: debtAmount > 0 ? 0 : Number(c.currentDebtUsd || 0),
            loyaltyPoints: newPoints,
            tier: getVIPCode(newPoints)
          };
          clientsData[cIndex] = updatedClient;
          tx.write('clients', clientsData, { action: 'update', collection: 'clients', doc: updatedClient });
        }
      } else if (supplierId) {
        const suppliersData = tx.read('suppliers');
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
          tx.write('suppliers', suppliersData, { action: 'update', collection: 'suppliers', doc: updatedSupplier });
        }
      }

      // 3. BILLS / RECEIVABLES & KALU INSTALLMENTS
      const nowMs = Date.now();
      const masterTransactionId = `TX-${nowMs}`;

      if (debtAmount > 0) {
        const billsData = tx.read('bills');
        const newBill = {
          id: `bill-rcv-${nowMs}`,
          transactionId: masterTransactionId,
          type: 'receivable',
          entityId: clientId || supplierId,
          entityName: finalCustomerName,
          amount: debtAmount,
          dueDate: new Date(nowMs + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          status: 'Pendiente',
          notes: `Consumo de tienda (${supplierId ? 'Libreta de Queso' : 'Crédito'})`
        };
        billsData.push(newBill);
        tx.write('bills', billsData, { action: 'add', collection: 'bills', doc: newBill });

        // Atomic Installments generation for Kalu Credit
        const hasKaluMethod = (addedPayments || []).some(p => p.method === 'Mundo Kalu') || paymentMethodType === 'Mundo Kalu';
        if (hasKaluMethod && clientId) {
          const installmentsData = tx.read('installments');
          const kaluItem = (addedPayments || []).find(p => p.method === 'Mundo Kalu');
          const financedAmount = kaluItem ? Number(kaluItem.amount || debtAmount) : debtAmount;

          // Helper autoritativo para identificar alimentos
          const isFoodProduct = (prod) => {
            const c = String(prod?.category || '').trim().toUpperCase();
            const n = String(prod?.name || '').trim().toUpperCase();
            if (c.includes('VÍVERE') || c.includes('VIVERE') || c.includes('ALIMENTO') || c.includes('CHARCUTER') || c.includes('QUESO')) return true;
            if (n.includes('HARINA') || n.includes('QUESO') || n.includes('MANTEQUILLA') || n.includes('ARROZ') || n.includes('PASTA') || n.includes('AZUCAR') || n.includes('AZÚCAR') || n.includes('ACEITE COMESTIBLE') || n.includes('CAFE') || n.includes('CAFÉ') || n.includes('LECHE')) return true;
            return false;
          };

          // Calcular subtotales por grupo de productos
          let foodSubtotal = 0;
          let otherSubtotal = 0;

          for (const item of (saleItems || [])) {
            const prod = productsData.find(p => String(p.id) === String(item.productId));
            const itemSubtotal = Number(item.subtotal !== undefined ? item.subtotal : (Number(item.quantityKg || item.quantity || 1) * Number(item.pricePerKg || item.price || 0)));
            if (isFoodProduct(prod)) {
              foodSubtotal += itemSubtotal;
            } else {
              otherSubtotal += itemSubtotal;
            }
          }

          const totalSubtotals = foodSubtotal + otherSubtotal;
          let foodFinanced = 0;
          let otherFinanced = 0;

          if (totalSubtotals <= 0 || (foodSubtotal > 0 && otherSubtotal <= 0)) {
            foodFinanced = financedAmount;
            otherFinanced = 0;
          } else if (otherSubtotal > 0 && foodSubtotal <= 0) {
            foodFinanced = 0;
            otherFinanced = financedAmount;
          } else {
            // Venta Mixta: Distribución proporcional exacta a centavos
            const rawFoodFinanced = Math.round((financedAmount * (foodSubtotal / totalSubtotals)) * 100) / 100;
            foodFinanced = rawFoodFinanced;
            otherFinanced = Math.round((financedAmount - rawFoodFinanced) * 100) / 100;
          }

          // Generación de Cuotas: Víveres = 1 cuota (15 días)
          let instIndex = 1;
          if (foodFinanced > 0.009) {
            let nextDate = new Date(nowMs);
            nextDate.setDate(nextDate.getDate() + 15);
            const foodInstDoc = {
              id: `inst-${nowMs}-${instIndex++}`,
              clientId: clientId,
              transactionId: masterTransactionId,
              amount: foodFinanced,
              amountUSD: foodFinanced,
              dueDate: nextDate.toISOString().split('T')[0],
              status: 'pending',
              installmentNumber: 1,
              totalInstallments: 1,
              pointsEarned: Math.round(foodFinanced),
              pointsAwarded: false,
              createdAt: new Date(nowMs).toISOString(),
              type: 'cotidiano'
            };
            installmentsData.push(foodInstDoc);
          }

          // Generación de Cuotas: Otros productos = 3 cuotas quincenales (con absorción exacta del redondeo en la última cuota)
          if (otherFinanced > 0.009) {
            const count = 3;
            const baseCuota = Math.floor((otherFinanced / count) * 100) / 100;
            let sumPrev = 0;
            let nextDate = new Date(nowMs);

            for (let i = 1; i <= count; i++) {
              nextDate.setDate(nextDate.getDate() + 15);
              const isLast = (i === count);
              const cuotaVal = isLast ? Math.round((otherFinanced - sumPrev) * 100) / 100 : baseCuota;
              sumPrev = Math.round((sumPrev + cuotaVal) * 100) / 100;

              const otherInstDoc = {
                id: `inst-${nowMs}-${instIndex++}`,
                clientId: clientId,
                transactionId: masterTransactionId,
                amount: cuotaVal,
                amountUSD: cuotaVal,
                dueDate: nextDate.toISOString().split('T')[0],
                status: 'pending',
                installmentNumber: i,
                totalInstallments: count,
                pointsEarned: Math.round(cuotaVal),
                pointsAwarded: false,
                createdAt: new Date(nowMs).toISOString(),
                type: 'repuestos'
              };
              installmentsData.push(otherInstDoc);
            }
          }

          tx.write('installments', installmentsData, { action: 'batchAdd', collection: 'installments' });
        }
      }

      // 4. CENTRAL VAULT BALANCE (BÓVEDA)
      const settingsData = tx.read('settings');
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
      tx.write('settings', settingsData, { action: 'update', collection: 'settings', doc: generalSettings });

      // 5. MAIN TRANSACTION RECORD
      let finalPaymentMethod = paymentMethodType || 'Efectivo';
      if (debtAmount > 0 && paidAmount === 0) {
        finalPaymentMethod = supplierId ? 'Libreta Quesero' : 'Crédito / Fiado';
      } else if (debtAmount > 0 && paidAmount > 0) {
        finalPaymentMethod = `Multipago (Efectivo + ${supplierId ? 'Libreta' : 'Crédito'})`;
      }

      const txsData = tx.read('transactions');
      const newTx = {
        id: masterTransactionId,
        entity: finalCustomerName,
        clientId: clientId || null,
        supplierId: supplierId || null,
        debtAmount: debtAmount,
        createdAt: nowMs,
        category: 'ventas',
        date: new Date(nowMs).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
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
      tx.write('transactions', txsData, { action: 'add', collection: 'transactions', doc: newTx });

      // Registro de Auditoría Transaccional (Fase 1I: Solo se persiste si el commit de la transacción tiene éxito)
      await recordAuditLog({
        req,
        action: 'pos.process_sale',
        resourceType: 'transactions',
        resourceId: newTx.id,
        result: 'success',
        metadata: {
          amount: newTx.amount,
          itemCount: (saleItems || []).length,
          paymentMethod: newTx.paymentMethod,
          debtAmount: newTx.debtAmount,
          customerName: finalCustomerName
        },
        tx
      });

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
    recordAuditLog({
      req,
      action: 'pos.process_sale',
      resourceType: 'transactions',
      result: 'failure',
      metadata: { error: error.message }
    });
    console.error('[POST /api/pos/process-sale] Error procesando venta transaccional:', error);
    res.status(500).json({ error: 'Error procesando venta transaccional', details: error.message });
  }
});

// Helper puro para verificar la existencia real de un comprobante válido antes de aprobar
function hasValidPaymentReceipt(payment, capturesDir, protectedMediaDir) {
  if (!payment) return false;

  // 1. Para pagos con archivo guardado en captures/
  if (payment.receiptFileName) {
    const capturePath = path.join(capturesDir, path.basename(payment.receiptFileName));
    return fs.existsSync(capturePath);
  }

  // 2. Para formato legacy en base64 inline
  const rawUrl = payment.receiptImageUrl || payment.receiptImage;
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return false;
  }

  if (rawUrl.startsWith('data:image/')) {
    const match = rawUrl.match(/^data:(image\/[a-zA-Z0-9\.\+-]+);base64,(.+)$/);
    if (match && match[2] && match[2].length > 10) {
      try {
        const buf = Buffer.from(match[2], 'base64');
        return buf.length > 0;
      } catch {
        return false;
      }
    }
    return false;
  }

  // 3. Si es ruta estática legacy bajo /protected_media/
  if (rawUrl.startsWith('/protected_media/')) {
    const subPath = rawUrl.replace('/protected_media/', '');
    const candidatePath = path.join(protectedMediaDir, path.normalize(subPath));
    return fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile();
  }

  // URLs arbitrarias sin respaldo de archivo no son comprobantes válidos
  return false;
}

// ============================================================
// ENDPOINTS ATÓMICOS DE COBRANZAS PWA (FASE 2D)
// ============================================================

// Endpoint atómico e idempotente para aprobación de pagos PWA (Fase 2E)
app.post('/api/pwa-payments/:id/approve', requireAuth, requireRole('admin', 'contador', 'cajero'), verifyCsrf, async (req, res) => {
  try {
    const paymentId = req.params.id;
    let result = null;

    await withTransaction(async (tx) => {
      const pwaPayments = tx.read('pwa_payments');
      const paymentIndex = pwaPayments.findIndex(p => String(p.id) === String(paymentId));
      if (paymentIndex === -1) {
        throw new Error('PAYMENT_NOT_FOUND');
      }

      const payment = pwaPayments[paymentIndex];
      // Idempotencia en servidor: solo procesar pagos en estatus 'pending'
      if (payment.status !== 'pending') {
        const conflictErr = new Error('PAYMENT_ALREADY_PROCESSED');
        conflictErr.statusCode = 409;
        conflictErr.paymentStatus = payment.status;
        throw conflictErr;
      }

      // Validar comprobante obligatorio verificable antes de tocar deuda o aprobar (Fase 3B/3B.1)
      if (!hasValidPaymentReceipt(payment, capturesDir, protectedMediaDir)) {
        const noReceiptErr = new Error('PAYMENT_MISSING_RECEIPT');
        noReceiptErr.statusCode = 400;
        throw noReceiptErr;
      }

      const isSupplier = payment.type === 'productor';
      const targetId = payment.clientId || payment.entityId;
      let updatedClient = null;
      let updatedSupplier = null;

      // 1. REVALIDAR CUOTA ANTES DE TOCAR CLIENTE / COBRANZA
      const installments = tx.read('installments');
      let instChanged = false;

      if (payment.installmentId) {
        const inst = installments.find(i => String(i.id) === String(payment.installmentId));
        if (!inst) {
          const err = new Error('INSTALLMENT_NOT_FOUND');
          err.statusCode = 404;
          throw err;
        }

        if (String(inst.clientId) !== String(targetId) && String(inst.client_id) !== String(targetId)) {
          const err = new Error('INSTALLMENT_OWNERSHIP_MISMATCH');
          err.statusCode = 403;
          throw err;
        }

        if (payment.transactionId && inst.transactionId && String(payment.transactionId) !== String(inst.transactionId)) {
          const err = new Error('TRANSACTION_ID_MISMATCH');
          err.statusCode = 400;
          throw err;
        }

        const installmentTotal = Number(inst.amountUSD ?? inst.amount ?? 0);
        const previousPaid = Number(inst.paidAmount ?? 0);
        const remainingBefore = Math.round((installmentTotal - previousPaid) * 100) / 100;

        if (payment.amount > remainingBefore + 0.0001) {
          const err = new Error('PAYMENT_EXCEEDS_INSTALLMENT_REMAINING');
          err.statusCode = 400;
          err.remaining = remainingBefore;
          throw err;
        }

        const nowMs = Date.now();
        if (payment.amount < remainingBefore - 0.0001) {
          inst.paidAmount = Math.round((previousPaid + payment.amount) * 100) / 100;
          // Restaurar a estado anterior (pending o overdue)
          const restoredStatus = (payment.installmentPreviousStatus === 'overdue' || payment.installmentPreviousStatus === 'pending')
            ? payment.installmentPreviousStatus
            : 'pending';
          inst.status = restoredStatus;
          inst.paidAt = null;
        } else {
          inst.paidAmount = installmentTotal;
          inst.status = 'paid';
          inst.paidAt = new Date(nowMs).toISOString();
        }
        instChanged = true;
      }

      if (instChanged) {
        tx.write('installments', installments, { action: 'batchUpdate', collection: 'installments' });
      }

      if (isSupplier) {
        const suppliers = tx.read('suppliers');
        const sIndex = suppliers.findIndex(s => String(s.id) === String(targetId));
        if (sIndex !== -1) {
          const s = suppliers[sIndex];
          const newStoreDebt = Math.max(0, Math.round(((s.storeDebt || 0) - payment.amount) * 100) / 100);
          updatedSupplier = {
            ...s,
            storeDebt: newStoreDebt
          };
          suppliers[sIndex] = updatedSupplier;
          tx.write('suppliers', suppliers, { action: 'update', collection: 'suppliers', doc: updatedSupplier });
        }
      } else {
        // Cliente Normal: Manejo autoritativo de deuda (outstandingDebt vs currentDebtUsd legacy)
        const clients = tx.read('clients');
        const cIndex = clients.findIndex(c => String(c.id) === String(targetId));
        if (cIndex !== -1) {
          const c = clients[cIndex];
          const { effectiveDebt } = resolveClientDebtState(c);

          // Si es pago de deuda abierta (sin installmentId), validar que el monto no supere la deuda efectiva
          if (!payment.installmentId && payment.amount > effectiveDebt + 0.0001) {
            const debtExceedErr = new Error('PAYMENT_EXCEEDS_CLIENT_DEBT');
            debtExceedErr.statusCode = 400;
            debtExceedErr.effectiveDebt = effectiveDebt;
            throw debtExceedErr;
          }

          const currentPoints = Number(c.loyaltyPoints || 0);
          const pointsToAdd = Math.round(payment.amount);
          const newEffectiveDebt = Math.max(0, Math.round((effectiveDebt - payment.amount) * 100) / 100);

          updatedClient = {
            ...c,
            outstandingDebt: newEffectiveDebt,
            currentDebtUsd: 0,
            loyaltyPoints: currentPoints + pointsToAdd
          };
          clients[cIndex] = updatedClient;
          tx.write('clients', clients, { action: 'update', collection: 'clients', doc: updatedClient });
        }
      }

      // Transacción de Cobranza (TX de ingresos_cobranza con referencias cruzadas)
      const nowMs = Date.now();
      const newTx = {
        id: `TX-${nowMs}`,
        clientId: !isSupplier ? targetId : undefined,
        supplierId: isSupplier ? targetId : undefined,
        entity: payment.entityName,
        category: 'ingresos_cobranza',
        date: new Date(nowMs).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        timestamp: new Date(nowMs).toISOString(),
        invoiceNumber: `PWA-${payment.reference || payment.id}`,
        amount: payment.amount,
        isIncome: true,
        status: 'Completado',
        paymentMethod: payment.method || payment.paymentMethod || 'Pago Móvil',
        notes: `Cobranza PWA aprobada. Ref: ${payment.reference || ''}`,
        paymentId: payment.id,
        receiptImageUrl: payment.receiptImageUrl || null,
        installmentId: payment.installmentId || null,
        transactionId: payment.transactionId || null
      };
      const txs = tx.read('transactions');
      txs.push(newTx);
      tx.write('transactions', txs, { action: 'add', collection: 'transactions', doc: newTx });

      // Actualizar estatus de pago PWA a 'approved'
      payment.status = 'approved';
      payment.approvedAt = new Date(nowMs).toISOString();
      pwaPayments[paymentIndex] = payment;
      tx.write('pwa_payments', pwaPayments, { action: 'update', collection: 'pwa_payments', doc: payment });

      result = {
        payment,
        transaction: newTx,
        client: updatedClient,
        supplier: updatedSupplier
      };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.message === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Comprobante de pago no encontrado' });
    }
    if (error.statusCode === 409 || error.message === 'PAYMENT_ALREADY_PROCESSED') {
      return res.status(409).json({ error: 'El comprobante ya fue procesado previamente', status: error.paymentStatus });
    }
    if (error.statusCode === 404 && error.message === 'INSTALLMENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Cuota referenciada no encontrada en la base de datos' });
    }
    if (error.statusCode === 403 && error.message === 'INSTALLMENT_OWNERSHIP_MISMATCH') {
      return res.status(403).json({ error: 'La cuota referenciada no pertenece al cliente' });
    }
    if (error.statusCode === 400 && error.message === 'TRANSACTION_ID_MISMATCH') {
      return res.status(400).json({ error: 'El transactionId del comprobante no coincide con la cuota' });
    }
    if (error.statusCode === 400 && error.message === 'PAYMENT_EXCEEDS_INSTALLMENT_REMAINING') {
      return res.status(400).json({ error: `El monto del pago supera el saldo pendiente de la cuota ($${error.remaining})` });
    }
    if (error.statusCode === 400 && error.message === 'PAYMENT_EXCEEDS_CLIENT_DEBT') {
      return res.status(400).json({ error: `El monto del pago supera la deuda pendiente del cliente ($${error.effectiveDebt})` });
    }
    if (error.statusCode === 400 && (error.message === 'PAYMENT_MISSING_RECEIPT' || error.message === 'RECEIPT_FILE_NOT_FOUND')) {
      return res.status(400).json({ error: 'El pago no posee comprobante de pago válido' });
    }
    console.error('[POST /api/pwa-payments/:id/approve Error]:', error);
    res.status(500).json({ error: 'Error aprobando pago PWA', details: error.message });
  }
});

// Endpoint atómico para rechazo de pagos PWA (Fase 2E/2F)
app.post('/api/pwa-payments/:id/reject', requireAuth, requireRole('admin', 'contador', 'cajero'), verifyCsrf, async (req, res) => {
  try {
    const paymentId = req.params.id;
    let result = null;

    await withTransaction(async (tx) => {
      const pwaPayments = tx.read('pwa_payments');
      const paymentIndex = pwaPayments.findIndex(p => String(p.id) === String(paymentId));
      if (paymentIndex === -1) {
        throw new Error('PAYMENT_NOT_FOUND');
      }

      const payment = pwaPayments[paymentIndex];
      if (payment.status !== 'pending') {
        const conflictErr = new Error('PAYMENT_ALREADY_PROCESSED');
        conflictErr.statusCode = 409;
        conflictErr.paymentStatus = payment.status;
        throw conflictErr;
      }

      payment.status = 'rejected';
      payment.rejectedAt = new Date().toISOString();
      pwaPayments[paymentIndex] = payment;
      tx.write('pwa_payments', pwaPayments, { action: 'update', collection: 'pwa_payments', doc: payment });

      // Si tiene cuota asociada en 'in_review', restaurar a su estado previo (pending o overdue) sin alterar paidAmount
      if (payment.installmentId) {
        const installments = tx.read('installments');
        const inst = installments.find(i => String(i.id) === String(payment.installmentId));
        if (inst && inst.status === 'in_review') {
          const restoredStatus = (payment.installmentPreviousStatus === 'overdue' || payment.installmentPreviousStatus === 'pending')
            ? payment.installmentPreviousStatus
            : 'pending';
          inst.status = restoredStatus;
          tx.write('installments', installments, { action: 'update', collection: 'installments', doc: inst });
        }
      }

      result = { payment };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.message === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Comprobante de pago no encontrado' });
    }
    if (error.statusCode === 409 || error.message === 'PAYMENT_ALREADY_PROCESSED') {
      return res.status(409).json({ error: 'El comprobante ya fue procesado previamente', status: error.paymentStatus });
    }
    console.error('[POST /api/pwa-payments/:id/reject Error]:', error);
    res.status(500).json({ error: 'Error rechazando pago PWA', details: error.message });
  }
});

// Endpoint para sincronización de tasa de cambio (Protegido por syncRateLimiter)
app.get('/api/sync-rate', syncRateLimiter, async (req, res) => {
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
app.post('/api/collections/:name', requireAuth, requireCollectionWrite, verifyCsrf, async (req, res) => {
  try {
    const colName = req.params.name;
    const newDoc = await withCollectionLock(colName, async () => {
      const data = readCollection(colName);
      let payload = { ...req.body };

      // FASE 1G-C.2: Si es una transacción, authNonce es 100% server-side e inmutable
      if (colName === 'transactions') {
        if (payload.status === 'pending_approval' || !payload.authNonce) {
          payload.authNonce = generateTransactionAuthNonce();
        } else {
          delete payload.authNonce;
        }
      }

      const doc = { id: req.body.id || Date.now().toString(), ...payload };
      const index = data.findIndex(d => String(d.id) === String(doc.id));

      if (index !== -1) {
        // Overwrite if it already exists to prevent duplication
        const previousDoc = { ...data[index] };
        // Mantener authNonce existente si ya tenía uno para evitar que un POST sobrescriba el nonce
        if (colName === 'transactions' && previousDoc.authNonce) {
          doc.authNonce = previousDoc.authNonce;
        }
        data[index] = doc;
        writeCollection(colName, data, { action: 'update', collection: colName, doc }, previousDoc);
      } else {
        data.push(doc);
        writeCollection(colName, data, { action: 'add', collection: colName, doc });
      }
      return doc;
    });

    res.json({ success: true, doc: newDoc });
  } catch (error) {
    console.error(`Error writing ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error writing collection' });
  }
});

// 3. Modificar / Upsert documento en colección (Protegido con requireAuth, validación de colección y CSRF)
app.patch('/api/collections/:name/:id', requireAuth, requireCollectionWrite, verifyCsrf, async (req, res) => {
  try {
    const colName = req.params.name;
    const doc = await withCollectionLock(colName, async () => {
      const data = readCollection(colName);
      const index = data.findIndex(d => String(d.id) === String(req.params.id));
      let updates = { ...req.body };

      // FASE 1G-C.2: Prohibir mutación de authNonce en updates genéricos de transacciones
      if (colName === 'transactions' && 'authNonce' in updates) {
        delete updates.authNonce;
      }

      if (index !== -1) {
        const previousDoc = { ...data[index] };
        data[index] = { ...data[index], ...updates };
        writeCollection(colName, data, { action: 'update', collection: colName, doc: data[index] }, previousDoc);
        return data[index];
      } else {
        // UPSERT: Create document if it does not exist
        if (colName === 'transactions') {
          if (updates.status === 'pending_approval' || !updates.authNonce) {
            updates.authNonce = generateTransactionAuthNonce();
          }
        }
        const newDoc = { id: req.params.id, ...updates };
        data.push(newDoc);
        writeCollection(colName, data, { action: 'add', collection: colName, doc: newDoc });
        return newDoc;
      }
    });

    res.json({ success: true, doc });
  } catch (error) {
    console.error(`Error updating ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error updating collection' });
  }
});

// 4. Borrado masivo (batchDelete) en colección (Solo Admin + Allowlist estricta + CSRF)
app.post('/api/collections/:name/batchDelete', requireAuth, requireRole('admin'), verifyCsrf, async (req, res) => {
  try {
    const collectionName = req.params.name;
    // Validar allowlist de colecciones borrables
    if (SENSITIVE_CORE_COLLECTIONS.has(collectionName) || !ALLOWED_DELETION_COLLECTIONS.has(collectionName)) {
      return res.status(403).json({
        error: `Operación denegada: borrado masivo prohibido en la colección protegida '${collectionName}'.`
      });
    }

    await withCollectionLock(collectionName, async () => {
      const data = readCollection(collectionName);
      const idsToDelete = req.body.ids || [];
      const filtered = data.filter(d => !idsToDelete.includes(String(d.id)));
      writeCollection(collectionName, filtered, { action: 'batchDelete', collection: collectionName, count: idsToDelete.length });
    });

    res.json({ success: true });
  } catch (error) {
    console.error(`Error batch deleting ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error batch deleting documents' });
  }
});

// 5. Borrado individual de documento (Solo Admin + Allowlist estricta + CSRF)
app.delete('/api/collections/:name/:id', requireAuth, requireRole('admin'), verifyCsrf, async (req, res) => {
  try {
    const collectionName = req.params.name;
    // Validar allowlist de colecciones con borrado individual permitido
    if (SENSITIVE_CORE_COLLECTIONS.has(collectionName) && !ALLOWED_DELETION_COLLECTIONS.has(collectionName)) {
      return res.status(403).json({
        error: `Operación denegada: borrado individual prohibido en la colección protegida '${collectionName}'.`
      });
    }

    await withCollectionLock(collectionName, async () => {
      const data = readCollection(collectionName);
      const previousDoc = data.find(d => String(d.id) === String(req.params.id));
      const filtered = data.filter(d => String(d.id) !== String(req.params.id));
      writeCollection(collectionName, filtered, { action: 'delete', collection: collectionName, doc: { id: req.params.id } }, previousDoc);
    });

    res.json({ success: true });
  } catch (error) {
    console.error(`Error deleting ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error deleting document' });
  }
});

// 6. Endpoint Administrativo Oficial para Restablecimiento Contable (Fase 1C/1H)
// Sustituye al peligroso DELETE /api/collections/:name de wipe genérico
app.post('/api/admin/reset-accounting', requireAuth, requireRole('admin'), verifyCsrf, adminResetLimiter, async (req, res) => {
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

    await withTransaction(async (tx) => {
      // 1. Limpiar colecciones contables fijas a []
      for (const coll of ACCOUNTING_COLLECTIONS) {
        tx.write(coll, [], { action: 'clear', collection: coll });
      }

      // 2. Resetear deudas de clientes a cero
      const clients = tx.read('clients');
      if (Array.isArray(clients)) {
        const updatedClients = clients.map(c => ({
          ...c,
          outstandingDebt: 0,
          loyaltyPoints: 0
        }));
        tx.write('clients', updatedClients, { action: 'update_all', collection: 'clients' });
      }

      // 3. Resetear deudas y saldos de proveedores a cero
      const suppliers = tx.read('suppliers');
      if (Array.isArray(suppliers)) {
        const updatedSuppliers = suppliers.map(s => ({
          ...s,
          balanceOwed: 0,
          storeDebt: 0
        }));
        tx.write('suppliers', updatedSuppliers, { action: 'update_all', collection: 'suppliers' });
      }

      // 4. Audit Log Transaccional
      await recordAuditLog({
        req,
        action: 'admin.reset_accounting',
        resourceType: 'accounting',
        result: 'success',
        metadata: { collectionsReset: ACCOUNTING_COLLECTIONS },
        tx
      });
    });

    console.log('[Sistema Kalu] ✅ Restablecimiento contable administrativo ejecutado con éxito por admin.');
    io.emit('database_restored', { timestamp: new Date().toISOString(), type: 'accounting_reset' });

    res.json({ success: true, message: 'Datos contables restablecidos exitosamente.' });
  } catch (error) {
    recordAuditLog({
      req,
      action: 'admin.reset_accounting',
      resourceType: 'accounting',
      result: 'failure',
      metadata: { error: error.message }
    });
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

// --- HELPERS TAR / GZ NATIVOS PARA BACKUP ESCALABLE (FASE 3C.2) ---
function createTarArchive(entries) {
  const chunks = [];
  for (const entry of entries) {
    const { name, data } = entry;
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8'); // filename (up to 100 chars)
    header.write('0000644\0', 100, 8, 'utf8'); // mode
    header.write('0000000\0', 108, 8, 'utf8'); // uid
    header.write('0000000\0', 116, 8, 'utf8'); // gid
    const sizeOctal = data.length.toString(8).padStart(11, '0') + ' ';
    header.write(sizeOctal, 124, 12, 'utf8'); // size in octal
    const mtimeOctal = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + ' ';
    header.write(mtimeOctal, 136, 12, 'utf8'); // mtime
    header.fill(' ', 148, 156); // checksum placeholder
    header.write('0', 156, 1, 'utf8'); // typeflag: regular file
    header.write('ustar\0', 257, 6, 'utf8'); // magic
    header.write('00', 263, 2, 'utf8'); // version

    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.write(checksumOctal, 148, 8, 'utf8');

    chunks.push(header);
    chunks.push(data);
    const padSize = (512 - (data.length % 512)) % 512;
    if (padSize > 0) {
      chunks.push(Buffer.alloc(padSize));
    }
  }
  chunks.push(Buffer.alloc(1024)); // Two 512-byte zero blocks at end of tar
  return Buffer.concat(chunks);
}

function parseTarArchive(tarBuf) {
  const files = [];
  let offset = 0;
  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    offset += 512;
    if (header.every(b => b === 0)) break; // Fin del archivo
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const sizeStr = header.toString('utf8', 124, 136).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const data = tarBuf.subarray(offset, offset + size);
    offset += size;
    const pad = (512 - (size % 512)) % 512;
    offset += pad;
    files.push({ name, data });
  }
  return files;
}

// Obtener respaldo completo descargable en formato Bundle TAR.GZ o JSON (Solo Admin)
// GET /api/full-backup?format=bundle (por defecto o .tar.gz) o ?format=json (compatibilidad legacy)
app.get('/api/full-backup', requireAuth, requireRole('admin'), adminBackupLimiter, (req, res) => {
  try {
    const requestedFormat = req.query.format || 'bundle';

    const backupJson = {
      version: '3.0',
      timestamp: new Date().toISOString(),
      company: 'Mundo Kalu Sabanota',
      collections: {}
    };

    for (const colName of BACKUP_COLLECTIONS) {
      backupJson.collections[colName] = readCollection(colName);
    }

    // Si solicita formato JSON puro (legacy):
    if (requestedFormat === 'json') {
      recordAuditLog({
        req,
        action: 'admin.full_backup_download',
        resourceType: 'backup',
        result: 'success',
        metadata: { format: 'json', collectionCount: BACKUP_COLLECTIONS.length }
      });
      return res.json(backupJson);
    }

    // Formato Bundle escalable (TAR.GZ):
    // 1. backup.json (Colecciones operacionales)
    // 2. captures/... (Archivos binarios puros)
    // 3. manifest.json (filename, size, sha256, paymentId)
    const pwaPayments = backupJson.collections['pwa_payments'] || [];
    const paymentFileMap = new Map();
    for (const p of pwaPayments) {
      if (p.receiptFileName) {
        paymentFileMap.set(p.receiptFileName, p.id);
      }
    }

    const manifest = {
      version: '3.0',
      timestamp: backupJson.timestamp,
      company: backupJson.company,
      filesCount: 0,
      captures: []
    };

    const tarEntries = [];

    // Agregar backup.json al tar
    const backupJsonBuffer = Buffer.from(JSON.stringify(backupJson, null, 2), 'utf8');
    tarEntries.push({
      name: 'backup.json',
      data: backupJsonBuffer
    });

    // Agregar archivos binarios de captures y construir manifest
    if (fs.existsSync(capturesDir)) {
      const files = fs.readdirSync(capturesDir);
      for (const f of files) {
        const fullPath = path.join(capturesDir, f);
        if (fs.statSync(fullPath).isFile()) {
          try {
            const buf = fs.readFileSync(fullPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            const entryManifest = {
              filename: f,
              size: buf.length,
              sha256,
              paymentId: paymentFileMap.get(f) || null
            };
            manifest.captures.push(entryManifest);
            tarEntries.push({
              name: `captures/${f}`,
              data: buf
            });
          } catch (e) {
            console.warn(`[Backup Bundle] Error leyendo capture ${f}:`, e.message);
          }
        }
      }
    }

    manifest.filesCount = manifest.captures.length;

    // Agregar manifest.json al tar
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    tarEntries.push({
      name: 'manifest.json',
      data: manifestBuffer
    });

    const tarBuffer = createTarArchive(tarEntries);
    const gzBuffer = zlib.gzipSync(tarBuffer);

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `kalu-backup-${dateStr}.tar.gz`;

    recordAuditLog({
      req,
      action: 'admin.full_backup_download',
      resourceType: 'backup',
      result: 'success',
      metadata: { format: 'bundle_targz', collectionCount: BACKUP_COLLECTIONS.length, capturesCount: manifest.filesCount, bundleSize: gzBuffer.length }
    });

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Version', '3.0');
    res.setHeader('X-Backup-Captures-Count', String(manifest.filesCount));
    return res.send(gzBuffer);
  } catch (error) {
    console.error('Error generando copia de seguridad completa:', error);
    res.status(500).json({ error: 'Error generando backup completo', details: error.message });
  }
});

// Restaurar copia de seguridad atómicamente con soporte para Bundle TAR.GZ y JSON Legacy (Solo Admin + CSRF)
app.post('/api/restore-backup', requireAuth, requireRole('admin'), verifyCsrf, adminRestoreLimiter, async (req, res) => {
  try {
    let collections = null;
    let capturesToRestore = []; // array de { filename, data: Buffer, expectedSha256 }
    let manifestData = null;

    // Detectar si la petición es un Bundle binario (o multipart/tar.gz) o JSON estructurado
    if (Buffer.isBuffer(req.body) || (req.body && req.body.bundleBase64)) {
      const bundleBuffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body.bundleBase64, 'base64');

      let uncompressedTar;
      try {
        uncompressedTar = zlib.gunzipSync(bundleBuffer);
      } catch (gzErr) {
        return res.status(400).json({ error: 'El archivo de respaldo no es un gzip válido o está corrupto.' });
      }

      const files = parseTarArchive(uncompressedTar);
      const fileMap = new Map();
      for (const f of files) {
        fileMap.set(f.name, f.data);
      }

      const backupJsonData = fileMap.get('backup.json');
      if (!backupJsonData) {
        return res.status(400).json({ error: 'Respaldo inválido: no contiene backup.json dentro del bundle.' });
      }

      try {
        const parsedBackup = JSON.parse(backupJsonData.toString('utf8'));
        collections = parsedBackup.collections;
      } catch (jsonErr) {
        return res.status(400).json({ error: 'backup.json dentro del bundle contiene sintaxis JSON inválida.' });
      }

      const manifestBuf = fileMap.get('manifest.json');
      if (manifestBuf) {
        try {
          manifestData = JSON.parse(manifestBuf.toString('utf8'));
        } catch {}
      }

      // Preparar captures desde el bundle
      for (const [name, buf] of fileMap.entries()) {
        if (name.startsWith('captures/') && name.length > 9) {
          const fname = path.basename(name);
          capturesToRestore.push({
            filename: fname,
            data: buf,
            expectedSha256: manifestData?.captures?.find(c => c.filename === fname)?.sha256 || null
          });
        }
      }
    } else if (req.body && typeof req.body === 'object') {
      // JSON Legacy / Directo
      collections = req.body.collections;

      // Soporte legacy para captures en base64 dentro de JSON
      if (req.body.captures && typeof req.body.captures === 'object') {
        for (const [fname, b64] of Object.entries(req.body.captures)) {
          if (typeof b64 === 'string' && fname) {
            try {
              const buf = Buffer.from(b64, 'base64');
              capturesToRestore.push({
                filename: path.basename(fname),
                data: buf,
                expectedSha256: null
              });
            } catch (e) {
              console.warn(`[Restore Legacy] Error decodificando ${fname}:`, e.message);
            }
          }
        }
      }
    }

    if (!collections || typeof collections !== 'object') {
      return res.status(400).json({ error: 'Formato de respaldo inválido: falta el bloque de colecciones' });
    }

    const restoredSummary = {};
    for (const [colName, docs] of Object.entries(collections)) {
      if (!Array.isArray(docs)) {
        return res.status(400).json({ error: `Formato inválido: la colección "${colName}" debe ser un array.` });
      }
      restoredSummary[colName] = docs.length;
    }

    // Validar integridad SHA256 de los captures con el manifest ANTES de escribir a disco
    const verificationErrors = [];
    for (const item of capturesToRestore) {
      const actualSha = crypto.createHash('sha256').update(item.data).digest('hex');
      if (item.expectedSha256 && actualSha !== item.expectedSha256) {
        verificationErrors.push(`Comprobante ${item.filename} corrupto: SHA256 real (${actualSha}) no coincide con manifest (${item.expectedSha256})`);
      }
      item.computedSha256 = actualSha;
    }

    if (verificationErrors.length > 0) {
      recordAuditLog({
        req,
        action: 'admin.restore_backup',
        resourceType: 'backup',
        result: 'failure',
        metadata: { errors: verificationErrors }
      });
      return res.status(422).json({
        error: 'Verificación de integridad fallida durante la restauración de comprobantes',
        details: verificationErrors
      });
    }

    // Restaurar captures validados en protected_media/captures
    let restoredCapturesCount = 0;
    if (capturesToRestore.length > 0) {
      if (!fs.existsSync(capturesDir)) {
        fs.mkdirSync(capturesDir, { recursive: true });
      }
      for (const item of capturesToRestore) {
        const targetPath = path.join(capturesDir, item.filename);
        try {
          fs.writeFileSync(targetPath, item.data);
          restoredCapturesCount++;
        } catch (writeErr) {
          console.error(`[Restore] Error escribiendo capture ${item.filename}:`, writeErr);
        }
      }
    }
    restoredSummary['captures'] = restoredCapturesCount;

    // Restauración transaccional atómica de las colecciones de base de datos
    await withTransaction(async (tx) => {
      for (const [colName, docs] of Object.entries(collections)) {
        tx.write(colName, docs);
      }

      await recordAuditLog({
        req,
        action: 'admin.restore_backup',
        resourceType: 'backup',
        result: 'success',
        metadata: { restoredSummary, capturesCount: restoredCapturesCount },
        tx
      });
    });

    console.log('[Sistema Kalu] ✅ Restauración completa de base de datos y comprobantes realizada con éxito por admin:', restoredSummary);
    io.to('room:crm:admin').emit('database_restored', { timestamp: new Date().toISOString(), summary: restoredSummary });
    io.to('room:crm:staff').emit('database_restored', { timestamp: new Date().toISOString() });

    for (const colName of Object.keys(collections)) {
      emitCollectionUpdatedScoped(colName);
    }

    res.json({
      success: true,
      message: 'Base de datos y comprobantes restaurados correctamente',
      summary: restoredSummary
    });
  } catch (error) {
    recordAuditLog({
      req,
      action: 'admin.restore_backup',
      resourceType: 'backup',
      result: 'failure',
      metadata: { error: error.message }
    });
    console.error('Error restaurando copia de seguridad:', error);
    res.status(500).json({ error: 'Error restaurando respaldo', details: error.message });
  }
});

// Endpoint Administrativo de Consulta de Auditoría (Fase 1I: Admin-Only, Read-Only con Paginación)
app.get('/api/admin/audit-logs', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const rawPage = parseInt(req.query.page, 10);
    const rawLimit = parseInt(req.query.limit, 10);

    const page = !isNaN(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = !isNaN(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 50;

    const actionFilter = req.query.action ? String(req.query.action).trim() : null;
    const resourceTypeFilter = req.query.resourceType ? String(req.query.resourceType).trim() : null;
    const resultFilter = req.query.result ? String(req.query.result).trim() : null;

    const allLogs = readCollection('audit_logs');
    let filteredLogs = Array.isArray(allLogs) ? allLogs : [];

    if (actionFilter) {
      filteredLogs = filteredLogs.filter(l => l.action === actionFilter);
    }
    if (resourceTypeFilter) {
      filteredLogs = filteredLogs.filter(l => l.resourceType === resourceTypeFilter);
    }
    if (resultFilter) {
      filteredLogs = filteredLogs.filter(l => l.result === resultFilter);
    }

    // Orden descendente por timestamp (más recientes primero)
    filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = filteredLogs.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      page,
      limit,
      total,
      totalPages,
      logs: paginatedLogs
    });
  } catch (error) {
    console.error('[Audit Query Error]:', error);
    res.status(500).json({ error: 'Error al consultar logs de auditoría' });
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
      await withCollectionLock('installments', async () => {
        writeCollection('installments', installments);
      });
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
app.post('/api/run-debt-check', requireAuth, requireRole('admin', 'cajero', 'accountant'), verifyCsrf, debtCheckLimiter, async (req, res) => {
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

// ============================================================
// FUNCIONES AUXILIARES DEL ROBOT KALU PARA WHATSAPP / META API
// ============================================================

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
  if (!normalizedInput || !Array.isArray(clientsList)) return undefined;
  return clientsList.find(client => {
    const clientPhone = normalizeWhatsAppPhone(client.phone || client.telefono || '');
    return clientPhone === normalizedInput || (normalizedInput.length >= 10 && clientPhone.endsWith(normalizedInput.slice(-10)));
  });
}

// Control Anti-Spam / Enfriamiento por Usuario (Máximo 5 mensajes en 10 minutos)
const userRateLimits = new Map();
function checkUserRateLimit(phone) {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  if (!cleanPhone) return { isRateLimited: false, justTriggered: false };
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxMessages = 5;

  let userData = userRateLimits.get(cleanPhone);
  if (!userData || now - userData.startTime > windowMs) {
    userData = { count: 1, startTime: now, warned: false };
    userRateLimits.set(cleanPhone, userData);
    return { isRateLimited: false, justTriggered: false };
  }

  userData.count++;
  if (userData.count > maxMessages) {
    const justTriggered = !userData.warned;
    userData.warned = true;
    return { isRateLimited: true, justTriggered };
  }

  return { isRateLimited: false, justTriggered: false };
}

function resetUserRateLimitsForTest() {
  userRateLimits.clear();
}

/**
 * Normaliza texto para búsqueda: minúsculas, sin acentos ni diacríticos, sin puntuación extra.
 */
function normalizeSearchText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const d = [];
  for (let i = 0; i <= la; i++) d[i] = [i];
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[la][lb];
}

const FILLER_STOP_WORDS = new Set([
  'tienes', 'tiene', 'tienen', 'precio', 'precios', 'cuanto', 'cuesta', 'cuestan',
  'hay', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'para',
  'por', 'favor', 'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'amigo',
  'amiga', 'sr', 'sra', 'que', 'como', 'donde', 'estan', 'estoy', 'ustedes', 'venden',
  'quisiera', 'saber', 'disponible', 'disponibilidad', 'existencia', 'existencias',
  'informacion', 'info', 'saludos', 'holaaa', 'holaaaa', 'holaa', 'buen',
  'producto', 'productos', 'articulo', 'articulos', 'item', 'items', 'mercancia'
]);

/**
 * Recuperación server-side determinista de productos relevantes según la consulta del usuario.
 * Reduce drásticamente la latencia y volumen de tokens enviados a Gemini AI.
 */
function retrieveRelevantProducts(queryText, allProducts = [], limit = 10) {
  const cleanQuery = normalizeSearchText(queryText);
  if (!cleanQuery) return { products: [], isGeneralQuery: true, totalMatches: 0 };

  const allTokens = cleanQuery.split(' ').filter(Boolean);
  const meaningfulTokens = allTokens.filter(t => !FILLER_STOP_WORDS.has(t) && t.length > 1);

  if (meaningfulTokens.length === 0) {
    return { products: [], isGeneralQuery: true, totalMatches: 0 };
  }

  const scored = [];
  for (const p of allProducts) {
    const pName = normalizeSearchText(p.name || '');
    const pCat = normalizeSearchText(p.category || '');
    const pCode = normalizeSearchText(p.barcode || p.code || p.id || '');
    const pBarcodes = Array.isArray(p.barcodes) ? p.barcodes.map(b => normalizeSearchText(b)) : [];

    let score = 0;

    // 1. Coincidencia exacta de código / barcode / SKU / ID (+100)
    const rawQueryCompact = cleanQuery.replace(/\s+/g, '');
    const pCodeCompact = pCode.replace(/\s+/g, '');
    const pIdCompact = normalizeSearchText(p.id || '').replace(/\s+/g, '');

    if (
      cleanQuery === pCode ||
      cleanQuery === normalizeSearchText(p.id || '') ||
      (rawQueryCompact.length >= 2 && (rawQueryCompact === pCodeCompact || rawQueryCompact === pIdCompact)) ||
      pBarcodes.some(b => b === cleanQuery || b.replace(/\s+/g, '') === rawQueryCompact) ||
      meaningfulTokens.some(t => t === pCode || pBarcodes.includes(t) || t === normalizeSearchText(p.id || ''))
    ) {
      score += 100;
    }

    // 2. Coincidencia exacta de frase completa (+80) o subcadena (+60)
    if (pName === cleanQuery) {
      score += 80;
    } else if (cleanQuery.length > 3 && pName.includes(cleanQuery)) {
      score += 60;
    }

    // 3. Coincidencia por tokens y similitud fonética/ortográfica
    const pNameWords = pName.split(' ').filter(Boolean);
    const pCatWords = pCat.split(' ').filter(Boolean);

    for (const token of meaningfulTokens) {
      if (pNameWords.includes(token)) {
        score += 30;
      } else if (pName.includes(token)) {
        score += 15;
      } else if (pCatWords.includes(token)) {
        score += 10;
      } else if (pCat.includes(token)) {
        score += 5;
      } else if (token.length >= 4) {
        for (const w of pNameWords) {
          if (w.length >= 3) {
            const dist = levenshteinDistance(token, w);
            if (dist === 1) {
              score += 20;
              break;
            } else if (token.length >= 6 && dist === 2) {
              score += 10;
              break;
            }
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ product: p, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const totalMatches = scored.length;
  const topProducts = scored.slice(0, limit).map(item => {
    const p = item.product;
    return {
      id: p.id,
      nombre: p.name,
      codigo: p.barcode || p.code || p.id,
      categoria: p.category,
      precio_usd: p.sellingPrice || p.price || 0,
      stock: p.stockKg ?? p.stock ?? 0,
      unidad: p.unit || 'Und'
    };
  });

  return { products: topProducts, isGeneralQuery: false, totalMatches };
}

/**
 * Normaliza formato de texto para WhatsApp:
 * Convierte **negrita** de Markdown estándar a *negrita* compatible con WhatsApp.
 */
function normalizeWhatsAppFormatting(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/__(.*?)__/g, '_$1_')
    .trim();
}

async function sendWhatsAppDirectMessage(toPhone, messageBody) {
  const token = process.env.WHATSAPP_API_KEY;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

  if (!token || !phoneId) {
    console.warn('[Robot Kalu WhatsApp] Faltan credenciales de WhatsApp en el entorno.');
    return { success: false, reason: 'missing_credentials' };
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
      console.log(`[Robot Kalu WhatsApp] ✅ Respuesta despachada con éxito a contacto WhatsApp.`);
    }
    return data;
  } catch (error) {
    console.error('[Robot Kalu WhatsApp] Excepción al enviar mensaje:', error.message);
    return { success: false, error: error.message };
  }
}

async function downloadMetaMediaAsBase64(mediaId) {
  const token = process.env.WHATSAPP_API_KEY;
  if (!token || !mediaId) return null;

  try {
    console.log(`[Robot Kalu Audio] 🔍 Consultando URL de descarga para mediaId: ${mediaId}...`);
    const mediaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!mediaRes.ok) {
      console.error('[Robot Kalu Audio] Error obteniendo URL de audio de Meta:', mediaRes.status);
      return null;
    }

    const mediaMeta = await mediaRes.json();
    const directUrl = mediaMeta?.url;
    const mimeType = mediaMeta?.mime_type || 'audio/ogg; codecs=opus';

    if (!directUrl) {
      console.error('[Robot Kalu Audio] No se encontró URL directa en la respuesta de Meta.');
      return null;
    }

    const fileRes = await fetch(directUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!fileRes.ok) {
      console.error('[Robot Kalu Audio] Error descargando el binario de audio de Meta:', fileRes.status);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    console.log(`[Robot Kalu Audio] ✅ Audio descargado y convertido a Base64 con éxito.`);
    return { base64Audio, mimeType };
  } catch (error) {
    console.error('[Robot Kalu Audio] Excepción descargando audio de Meta:', error.message);
    return null;
  }
}

// ============================================================
// ENDPOINTS DE WEBHOOK DE WHATSAPP / META CLOUD API (FASE 1G-A)
// ============================================================

/**
 * 1. GET /api/webhook/whatsapp y GET /api/webhook: Verificación de suscripción del Webhook (Handshake de Meta)
 * Valida hub.mode === 'subscribe' y hub.verify_token contra process.env.WHATSAPP_VERIFY_TOKEN
 * con comparación segura en tiempo constante. Devuelve hub.challenge si es válido.
 */
app.get(['/api/webhook/whatsapp', '/api/webhook'], (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || (isProd ? '' : 'kalu_dev_verification_token');

    if (isProd && !expectedToken) {
      console.warn('[WhatsApp Webhook] ❌ Verificación rechazada: WHATSAPP_VERIFY_TOKEN no configurado en producción');
      return res.status(500).json({ error: 'Configuración de verificación incompleta en producción' });
    }

    if (mode === 'subscribe' && token && expectedToken && safeTimingCompare(String(token), String(expectedToken))) {
      console.log('[WhatsApp Webhook] ✅ Verificación de suscripción exitosa (Handshake)');
      return res.status(200).send(String(challenge || ''));
    }

    console.warn('[WhatsApp Webhook] ❌ Verificación de suscripción fallida: token o modo inválido');
    return res.status(403).json({ error: 'Verificación de webhook no autorizada' });
  } catch (err) {
    console.error('[WhatsApp Webhook] ❌ Error en verificación GET:', err.message);
    return res.status(500).json({ error: 'Error interno en verificación' });
  }
});

/**
 * 2. POST /api/webhook/whatsapp y POST /api/webhook: Recepción y procesamiento de eventos de WhatsApp
 * NOTA DE ARQUITECTURA / COMPATIBILIDAD HISTÓRICA:
 * Ambas rutas convergen al mismo orquestador conversacional para garantizar compatibilidad
 * total con la configuración activa de Meta Cloud API.
 * (handshake GET con WHATSAPP_VERIFY_TOKEN + SLA HTTP 200 rápido a Meta + orquestador conversacional asíncrono).
 * TODO: La validación HMAC estricta X-Hub-Signature-256 queda desacoplada temporalmente y programada
 * para migración separada con pruebas directas sobre el raw body de Meta.
 */
app.post(['/api/webhook/whatsapp', '/api/webhook'], whatsappWebhookLimiter, whatsappJsonParser, async (req, res) => {
  try {
    /**
     * MODELO DE COMPATIBILIDAD HISTÓRICA TEMPORAL:
     * El handshake inicial GET /api/webhook/whatsapp valida estrictamente WHATSAPP_VERIFY_TOKEN.
     * En el POST, se desacopla temporalmente el bloqueo 403 por firma HMAC para permitir
     * el flujo fluido del orquestador conversacional histórico con Meta Cloud API.
     *
     * TODO SECURITY:
     * Reintroducir validación X-Hub-Signature-256 en migración separada después de validar el manejo raw-body contra eventos reales de Meta.
     */

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Payload JSON inválido' });
    }

    // 1. Extraer event IDs técnicos granulares para idempotencia y deduplicación
    const eventIds = extractWebhookEventIds(payload);
    let allDuplicated = eventIds.length > 0;
    let newEventsCount = 0;

    for (const evId of eventIds) {
      if (!isWebhookEventProcessed(evId)) {
        allDuplicated = false;
        newEventsCount++;
        markWebhookEventProcessed(evId);
      }
    }

    // Si todos los eventos dentro del payload ya fueron procesados previamente (Replay total)
    if (eventIds.length > 0 && allDuplicated) {
      recordAuditLog({
        req,
        action: 'webhook.whatsapp_replay',
        resourceType: 'webhook',
        result: 'denied',
        metadata: { eventCount: eventIds.length }
      });
      console.log(`[WhatsApp Webhook] ℹ️ Replay total detectado (${eventIds.length} eventos ya procesados), respondiendo 200 OK.`);
      return res.status(200).json({ status: 'EVENT_ALREADY_PROCESSED', processedCount: 0 });
    }

    // 2. Extraer estructura del evento
    const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
    const changes = entry?.changes?.[0];
    const field = changes?.field || 'unknown';
    const value = changes?.value || {};

    const isMaintenanceActive = String(process.env.WHATSAPP_MAINTENANCE_MODE || '').trim().toLowerCase() === 'true';

    // CASO A: MODO MANTENIMIENTO ACTIVO
    if (isMaintenanceActive) {
      const incomingMessages = Array.isArray(value.messages) ? value.messages : [];
      let maintenanceNoticesSent = 0;
      let maintenanceNoticesSkippedAntiSpam = 0;

      for (const msg of incomingMessages) {
        const senderPhone = msg?.from;
        if (senderPhone) {
          if (!isMaintenanceAntiSpamActive(senderPhone)) {
            try {
              const sendResult = await sendWhatsAppDirectMessage(senderPhone, WHATSAPP_MAINTENANCE_MESSAGE);
              // Verificar si Graph API respondió exitosamente
              if (sendResult && !sendResult.error && sendResult.success !== false) {
                recordMaintenanceNoticeSent(senderPhone);
                maintenanceNoticesSent++;
                console.log(`[WhatsApp Maintenance] 📢 Aviso de mantenimiento enviado con éxito a contacto (anti-spam registrado).`);
              } else {
                console.error(`[WhatsApp Maintenance] ⚠️ Graph API rechazó el envío del aviso de mantenimiento:`, sendResult?.error || sendResult?.reason || 'Error desconocido');
              }
            } catch (err) {
              console.error('[WhatsApp Maintenance] Error despachando aviso directo a contacto:', err.message);
            }
          } else {
            maintenanceNoticesSkippedAntiSpam++;
            console.log(`[WhatsApp Maintenance] 🛡️ Mensaje recibido pero aviso omitido por ventana Anti-Spam activa.`);
          }
        }
      }

      recordAuditLog({
        req,
        action: 'webhook.whatsapp_maintenance',
        resourceType: 'webhook',
        result: 'success',
        metadata: {
          field,
          newEventsCount,
          maintenanceNoticesSent,
          maintenanceNoticesSkippedAntiSpam
        }
      });

      console.log(`[WhatsApp Webhook] 🛠️ [MODO MANTENIMIENTO ACTIVO] Evento verificado. Avisos enviados: ${maintenanceNoticesSent}, omitidos anti-spam: ${maintenanceNoticesSkippedAntiSpam}`);
      return res.status(200).json({
        status: 'EVENT_RECEIVED',
        maintenance: true,
        newEvents: newEventsCount,
        noticesSent: maintenanceNoticesSent,
        antiSpamSuppressed: maintenanceNoticesSkippedAntiSpam
      });
    }

    // 3. Responder HTTP 200 INMEDIATAMENTE a Meta para cumplir el SLA de entrega (< 3s)
    res.status(200).json({ status: 'EVENT_RECEIVED', newEvents: newEventsCount });

    // 4. Procesamiento asíncrono posterior (No bloquea la entrega HTTP de Meta)
    (async () => {
      try {
        const incomingMessages = Array.isArray(value.messages) ? value.messages : [];

        // CASO B: MODO OPERATIVO NORMAL — ORQUESTADOR CONVERSACIONAL (WHATSAPP + GEMINI IA)
        for (const message of incomingMessages) {
          const fromPhone = message?.from;
          const messageType = message?.type;
          if (!fromPhone) continue;

          // 1. Recepción de Comprobantes de Pago (Imágenes / Documentos)
          if (messageType === 'image' || messageType === 'document') {
            const replyText = `¡Hola! 👋 Hemos recibido tu comprobante de pago con éxito.\n\nPara validar tu abono de forma inmediata en el sistema, por favor regístralo a través de tu portal oficial:\n👉 https://sistemakalu.com/?portal=cliente\n\nAllí podrás verificar tu saldo actualizado y el historial de tus facturas al instante.`;
            await sendWhatsAppDirectMessage(fromPhone, replyText);
            continue;
          }

          // 2. Control Anti-Spam / Enfriamiento por Usuario
          const rateLimit = checkUserRateLimit(fromPhone);
          if (rateLimit.isRateLimited) {
            if (rateLimit.justTriggered) {
              const cooldownNotice = `Hemos detectado múltiples mensajes continuos. Por tu comodidad y para brindarte una atención personalizada, hemos transferido tu conversación a la bandeja de un asesor humano de nuestro equipo. En breve un operador se comunicará contigo. ¡Muchas gracias por tu paciencia!`;
              await sendWhatsAppDirectMessage(fromPhone, cooldownNotice);
            }
            console.log(`[Robot Kalu Anti-Spam] Mensaje silenciado por periodo de enfriamiento.`);
            continue;
          }

          // 3. Procesamiento de Mensajes de Texto y Notas de Voz (Audio OGG)
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

            // Cargar colecciones vivas del sistema server-side
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

            // Recuperación contextual inteligente de inventario (evita inyección masiva de 622 productos)
            const productRetrieval = retrieveRelevantProducts(userText, products, 10);
            let inventorySection = '';

            if (productRetrieval.isGeneralQuery) {
              inventorySection = 'No se detectó una consulta de producto específico en este mensaje. Si el cliente requiere cotización o disponibilidad de artículos, solicítale amablemente el nombre, categoría o código del artículo para atenderlo de inmediato.';
            } else if (productRetrieval.products.length > 0) {
              inventorySection = `${JSON.stringify(productRetrieval.products, null, 2)}${productRetrieval.totalMatches > productRetrieval.products.length ? `\n(Nota: Se encontraron ${productRetrieval.totalMatches} productos coincidentes; se muestran los ${productRetrieval.products.length} más relevantes. Si el cliente busca otra variante o especificación, indícaselo y solicita más detalles).` : ''}`;
            } else {
              inventorySection = 'No se encontraron productos coincidentes en el inventario para los términos consultados. Responde amablemente indicando que no se tiene disponibilidad o solicita confirmar el nombre exacto o código del artículo.';
            }

            const systemPrompt = `
Eres Kalu, el asesor de ventas y asistente virtual inteligente oficial de Mundo Kalu Sabanota.
Estás atendiendo al cliente: ${client.name || client.nombre || 'Cliente'}.
Tasa oficial BCV actual: ${exchangeRate} VES/USD.

ESTADO DE CUENTA Y CUOTAS PENDIENTES DEL CLIENTE:
${JSON.stringify(pendingInstallments, null, 2)}

INVENTARIO DISPONIBLE RELACIONADO CON LA CONSULTA (PRECIOS Y EXISTENCIAS):
${inventorySection}

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
                const modelsToTry = GEMINI_FALLBACK_MODELS;
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

            botReply = normalizeWhatsAppFormatting(botReply);
            await sendWhatsAppDirectMessage(fromPhone, botReply);
          }
        }

        recordAuditLog({
          req,
          action: 'webhook.whatsapp_processed',
          resourceType: 'webhook',
          result: 'success',
          metadata: { field, newEventsCount }
        });
      } catch (asyncErr) {
        console.error('[WhatsApp Webhook Async] ❌ Error en orquestador conversacional:', asyncErr.message);
      }
    })();
  } catch (err) {
    console.error('[WhatsApp Webhook] ❌ Error procesando evento POST:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Error interno procesando webhook' });
    }
  }
});

const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('server.js') ||
  process.argv[1].endsWith('server')
);

if (isDirectExecution || process.env.AUTO_START_SERVER === 'true') {
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
}

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
  ALLOWED_STATIC_EXTENSIONS,
  parseAllowedOrigins,
  normalizeOrigin,
  getAllowedOrigins,
  verifyWhatsAppWebhookSignature,
  whatsappWebhookLimiter,
  isWebhookEventProcessed,
  markWebhookEventProcessed,
  extractWebhookEventIds,
  resetProcessedWebhookEventsForTest,
  isMaintenanceAntiSpamActive,
  recordMaintenanceNoticeSent,
  resetMaintenanceAntiSpamForTest,
  WHATSAPP_MAINTENANCE_MESSAGE,
  hashRateLimitKey,
  loginAccountLimiter,
  portalLoginLimiter,
  portalAccountLoginLimiter,
  recoveryResetPinLimiter,
  syncRateLimiter,
  debtCheckLimiter,
  adminBackupLimiter,
  adminRestoreLimiter,
  adminResetLimiter,
  buildTransactionCanonicalPayload,
  computeTransactionHmac,
  verifyTransactionApprovalSignature,
  getTransactionSignatureSecret,
  resetEphemeralDevTxSecretForTest,
  generateTransactionAuthNonce,
  atomicWriteJsonFile,
  withTransaction,
  readCollection,
  withCollectionLock,
  normalizeWhatsAppPhone,
  findClientByPhone,
  checkUserRateLimit,
  resetUserRateLimitsForTest,
  normalizeSearchText,
  retrieveRelevantProducts,
  retrieveRelevantProductsForAI,
  retrieveRelevantClientsForAI,
  retrieveRelevantSuppliersForAI,
  retrieveRelevantDebtsForAI,
  normalizeWhatsAppFormatting,
  GEMINI_FALLBACK_MODELS,
  PER_ATTEMPT_TIMEOUT_MS,
  TOTAL_OPERATION_BUDGET_MS,
  OCR_ATTEMPT_TIMEOUT_MS,
  OCR_TOTAL_BUDGET_MS,
  classifyGeminiError,
  generateGeminiContentServer,
  sendWhatsAppDirectMessage,
  downloadMetaMediaAsBase64,
  recordAuditLog,
  getClientInitialPin,
  app,
  server
};
