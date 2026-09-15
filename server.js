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

// Inicializar cliente de Google Gemini para el Robot Kalu
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const ai = (geminiApiKey && !geminiApiKey.startsWith('mock') && !geminiApiKey.startsWith('dummy')) 
  ? new GoogleGenAI({ apiKey: geminiApiKey }) 
  : null;

const isDevEnv = process.env.NODE_ENV === 'development' || !isProd;
const mailMode = process.env.MAIL_MODE || (isDevEnv ? 'development' : 'production');
const waMode = process.env.WHATSAPP_MODE || (isDevEnv ? 'simulation' : 'production');

console.log('----------------------------------------------------');
console.log(`🌐 ENTORNO: ${isDevEnv ? 'DESARROLLO LOCAL (KALU-DEV)' : 'PRODUCCIÓN'}`);
console.log('🤖 ESTADO DEL ROBOT DE COMUNICACIONES:');
console.log('📧 Correo Emisor:', mailMode === 'development' ? 'MODO SIMULACIÓN (DEV - Solo consola)' : (process.env.EMAIL_USER ? `SÍ (${process.env.EMAIL_USER})` : 'SÍ (Fallback: cherokejd566@gmail.com)'));
console.log('🔑 Contraseña Correo (.env):', mailMode === 'development' ? 'PROTEGIDA (Simulación DEV activa)' : (process.env.EMAIL_PASS ? 'SÍ (Presente)' : '❌ NO DETECTADA'));
console.log('📱 WhatsApp API:', waMode === 'simulation' ? 'MODO SIMULACIÓN (DEV - Solo consola)' : (process.env.WHATSAPP_API_URL || process.env.WHATSAPP_API_KEY ? 'SÍ (Producción)' : 'Modo Simulación / Local'));
console.log('📂 Directorio de Datos / DB:', process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
console.log('----------------------------------------------------');

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

app.use(cors({
  origin: function (origin, callback) {
    // Permitir solicitudes en localhost/127.0.0.1 y apps clientes
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

const SESSION_SECRET = process.env.SESSION_SECRET || 'kalu_dev_session_secret_2026_super_safe_and_random';

// Configuración de sesiones server-side (MemoryStore para DEV, modular para SQLite/Redis en producción)
app.use(session({
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
}));

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
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth Error] Error destruyendo sesión:', err);
    }
    res.clearCookie('__kalu_sid');
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  });
});

// Servir la build estática de producción de Vite si existe la carpeta dist
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

io.on('connection', (socket) => {
  console.log('A client connected via WebSocket:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});


// Configurar la carpeta de destino física (puede ser /var/www/app/uploads en producción)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de Multer para guardar los archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generar un nombre único
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Extensión del archivo
    const ext = path.extname(file.originalname) || (file.mimetype === 'video/mp4' ? '.mp4' : '.jpg');
    cb(null, 'banner-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// Servir la carpeta de subidas de forma estática
app.use('/uploads', express.static(uploadDir));
const protectedMediaDir = path.join(__dirname, 'protected_media');
app.use('/protected_media', express.static(protectedMediaDir));

const productsDbFile = path.join(uploadDir, 'products_db.json');

// Leer productos locales
app.get('/api/products', (req, res) => {
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

// Actualizar producto local
app.patch('/api/products/:id', (req, res) => {
  try {
    if (!fs.existsSync(productsDbFile)) {
      return res.status(404).json({ error: 'DB no encontrada' });
    }
    const data = JSON.parse(fs.readFileSync(productsDbFile, 'utf8'));
    const index = data.findIndex(p => String(p.id) === String(req.params.id));
    
    if (index !== -1) {
      let current = data[index];
      let updates = req.body;
      
      // Manejo especial de incrementos desde el cliente
      if (updates.adjustStockKg) {
        current.stockKg = (Number(current.stockKg || 0) + Number(updates.adjustStockKg));
        delete updates.adjustStockKg;
      }
      if (updates.adjustStock) {
        current.stock = (Number(current.stock || 0) + Number(updates.adjustStock));
        delete updates.adjustStock;
      }
      
      data[index] = { ...current, ...updates };
      fs.writeFileSync(productsDbFile, JSON.stringify(data, null, 2));
      io.emit('collection_delta', { action: 'update', collection: 'products', doc: data[index] });
      io.emit('collection_updated', 'products');
      res.json({ success: true, product: data[index] });
    } else {
      res.status(404).json({ error: 'Producto no encontrado' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

app.post('/api/products', (req, res) => {
  try {
    let data = [];
    if (fs.existsSync(productsDbFile)) {
      data = JSON.parse(fs.readFileSync(productsDbFile, 'utf8'));
    }
    const newProduct = { id: req.body.id || Date.now().toString(), ...req.body };
    data.push(newProduct);
    fs.writeFileSync(productsDbFile, JSON.stringify(data, null, 2));
    io.emit('collection_delta', { action: 'add', collection: 'products', doc: newProduct });
    io.emit('collection_updated', 'products');
    res.json({ success: true, product: newProduct });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error agregando producto' });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    if (!fs.existsSync(productsDbFile)) {
      return res.status(404).json({ error: 'DB no encontrada' });
    }
    const data = JSON.parse(fs.readFileSync(productsDbFile, 'utf8'));
    const filtered = data.filter(p => String(p.id) !== String(req.params.id));
    fs.writeFileSync(productsDbFile, JSON.stringify(filtered, null, 2));
    io.emit('collection_delta', { action: 'delete', collection: 'products', doc: { id: req.params.id } });
    io.emit('collection_updated', 'products');
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error eliminando producto' });
  }
});

// Endpoint para recibir los videos/imágenes
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    // Mapear los nombres a la ruta relativa
    const fileUrls = req.files.map(f => `/uploads/${f.filename}`);
    
    res.json({ success: true, urls: fileUrls });
  } catch (error) {
    console.error('Error procesando subida:', error);
    res.status(500).json({ error: 'Internal server error.' });
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

app.post('/api/send-recovery', async (req, res) => {
  const { channel = 'email', email, phone, code, name } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Falta el código de recuperación' });
  }

  // --- CANAL 1: WHATSAPP ---
  if (channel === 'whatsapp') {
    if (!phone) {
      return res.status(400).json({ error: 'Falta el número de teléfono para WhatsApp' });
    }

    // Normalizar el número telefónico
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '58' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('58') && cleanPhone.length === 10) {
      cleanPhone = '58' + cleanPhone;
    }

    const messageText = `🔒 *Mundo Kalu - Seguridad*\n\nHola *${name || 'Usuario'}*,\nTu código de verificación para restablecer tu PIN es:\n\n👉 *${code}*\n\n_Por seguridad, no compartas este código con nadie._`;

    // Leer credenciales desde las variables de entorno de forma estricta y segura
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1344089325449515';
    const waApiKey = process.env.WHATSAPP_API_KEY || process.env.API_KEY || process.env.WHATSAPP_TOKEN;
    const waApiUrl = process.env.WHATSAPP_API_URL || (phoneId ? `https://graph.facebook.com/v20.0/${phoneId}/messages` : null);

    if (waApiUrl && waApiKey) {
      try {
        console.log(`[Robot WhatsApp] Despachando PIN ${code} a ${cleanPhone} vía Meta Cloud API (${waApiUrl})...`);
        
        // Estructura oficial de Meta Cloud API
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
          console.error('[Robot WhatsApp] Error en respuesta de Meta/Proveedor:', response.status, errText);
          return res.status(502).json({ error: 'Error en la pasarela de WhatsApp', details: errText });
        }

        const data = await response.json().catch(() => ({ success: true }));
        console.log('[Robot WhatsApp] Mensaje enviado exitosamente:', data);
        return res.json({ success: true, channel: 'whatsapp', recipient: cleanPhone, data });
      } catch (error) {
        console.error('[Robot WhatsApp] Error de conexión:', error.message);
        return res.status(500).json({ error: 'Error conectando con el servicio de WhatsApp', details: error.message });
      }
    } else {
      // Modo simulación / Fallback seguro si la URL no está seteada en el entorno
      console.log(`[Robot WhatsApp] (Modo Local/API Key lista) Mensaje simulado a ${cleanPhone}: "${messageText}"`);
      return res.json({ 
        success: true, 
        channel: 'whatsapp', 
        simulated: true, 
        recipient: cleanPhone,
        message: 'Código despachado por WhatsApp' 
      });
    }
  }

  // --- CANAL 2: CORREO ELECTRÓNICO (DEFAULT) ---
  if (!email) {
    return res.status(400).json({ error: 'Falta el correo electrónico' });
  }

  const emailUser = process.env.EMAIL_USER || 'cherokejd566@gmail.com';
  const emailPass = process.env.EMAIL_PASS;

  if (!emailPass) {
    console.error('[Robot Correo] ❌ Error: process.env.EMAIL_PASS no está definido en el archivo .env.');
    return res.status(500).json({ 
      error: 'Credenciales incompletas', 
      details: 'Falta la contraseña de aplicación (EMAIL_PASS) en el archivo .env del servidor.' 
    });
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
      to: email,
      subject: 'Tu código de recuperación de Mundo Kalu',
      html: htmlTemplate
    });
    console.log(`[Robot Correo] PIN enviado exitosamente a ${email}`);
    res.json({ success: true, channel: 'email', recipient: email });
  } catch (error) {
    console.error('[Robot Correo] Error enviando correo:', error);
    res.status(500).json({ error: 'Error enviando el correo', details: error.message });
  }
});

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

// --- GENERIC COLLECTIONS API WITH ASYNC MUTEX LOCK ---

const getCollectionFilePath = (name) => path.join(uploadDir, `${name}_db.json`);

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

const writeCollection = (name, data, delta = null) => {
  const filePath = getCollectionFilePath(name);
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  if (delta) {
    io.emit('collection_delta', delta);
  } else {
    io.emit('collection_updated', name); // Fallback for full reload
  }
};

// --- ATOMIC POS SALE CHECKOUT ENDPOINT ---
app.post('/api/pos/process-sale', async (req, res) => {
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
    } = req.body;

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
          io.emit('collection_delta', { action: 'add', collection: 'kardex', doc: kardexMovement });
        }
      }
      writeCollection('products', productsData);
      writeCollection('kardex', kardexData);

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
            io.emit('collection_delta', { action: 'add', collection: 'installments', doc: installmentDoc });
            nextDate.setDate(nextDate.getDate() + 15);
          }
          writeCollection('installments', installmentsData);
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

app.get('/api/collections/:name', (req, res) => {
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

app.post('/api/collections/:name', (req, res) => {
  try {
    const data = readCollection(req.params.name);
    const newDoc = { id: req.body.id || Date.now().toString(), ...req.body };
    const index = data.findIndex(d => String(d.id) === String(newDoc.id));
    
    if (index !== -1) {
      // Overwrite if it already exists to prevent duplication
      data[index] = newDoc;
      writeCollection(req.params.name, data, { action: 'update', collection: req.params.name, doc: newDoc });
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

app.patch('/api/collections/:name/:id', (req, res) => {
  try {
    const data = readCollection(req.params.name);
    const index = data.findIndex(d => String(d.id) === String(req.params.id));
    if (index !== -1) {
      data[index] = { ...data[index], ...req.body };
      writeCollection(req.params.name, data, { action: 'update', collection: req.params.name, doc: data[index] });
      res.json({ success: true, doc: data[index] });
    } else {
      // UPSERT: Create document if it does not exist (like Firebase setDoc)
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

app.post('/api/collections/:name/batchDelete', (req, res) => {
  try {
    const data = readCollection(req.params.name);
    const idsToDelete = req.body.ids || [];
    const filtered = data.filter(d => !idsToDelete.includes(String(d.id)));
    writeCollection(req.params.name, filtered, { action: 'batchDelete', collection: req.params.name, count: idsToDelete.length });
    res.json({ success: true });
  } catch (error) {
    console.error(`Error batch deleting ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error batch deleting documents' });
  }
});

// Endpoint Atómico Oficial para Procesar Venta de Caja y Crédito Kalú
app.post('/api/pos/process-sale', (req, res) => {
  try {
    const payload = req.body;
    const {
      saleItems = [],
      clientId,
      customerName,
      supplierId,
      paidAmount = 0,
      saleTotalAmount = 0,
      debtAmount = 0,
      addedPayments = [],
      paymentMethodType = 'Efectivo',
      transaction: customTx,
      creditDetails
    } = payload;

    const txId = (customTx && customTx.id) || `TX-${Date.now()}`;
    const invoiceNum = (customTx && customTx.invoiceNumber) || `F-${Date.now().toString().slice(-4)}`;
    
    // 1. Persistir Transacción
    const transactions = readCollection('transactions');
    const finalTx = {
      id: txId,
      entity: customerName || 'Cliente General',
      clientId: clientId || null,
      supplierId: supplierId || null,
      amount: Number(paidAmount || saleTotalAmount || 0),
      debtAmount: Number(debtAmount || 0),
      totalUSD: Number(saleTotalAmount || 0),
      category: 'ventas',
      status: 'Completado',
      paymentMethod: paymentMethodType || 'Multipago',
      invoiceNumber: invoiceNum,
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      timestamp: new Date().toISOString(),
      createdAt: Date.now(),
      isIncome: true,
      items: saleItems,
      addedPayments: addedPayments,
      ...(customTx || {})
    };

    transactions.unshift(finalTx);
    writeCollection('transactions', transactions, { action: 'add', collection: 'transactions', doc: finalTx });

    // 2. Si es Crédito Kalú, generar cuotas en 'installments'
    const kaluPayment = addedPayments.find(p => p.method === 'Mundo Kalu');
    if (kaluPayment || creditDetails?.isKaluCredit) {
      const financedAmount = Number(kaluPayment?.amount || creditDetails?.financedAmount || debtAmount || 0);
      const installmentsCount = Number(creditDetails?.installmentsCount || 2);
      const cuotaAmount = Number((financedAmount / installmentsCount).toFixed(2));
      
      const installments = readCollection('installments');
      let nextDueDate = new Date();
      nextDueDate.setDate(nextDueDate.getDate() + 15);

      for (let i = 0; i < installmentsCount; i++) {
        const instDoc = {
          id: `INST-${Date.now()}-${i + 1}`,
          clientId: clientId || finalTx.clientId,
          transactionId: txId,
          amount: cuotaAmount,
          amountUSD: cuotaAmount,
          dueDate: nextDueDate.toISOString().split('T')[0],
          status: 'pending',
          installmentNumber: i + 1,
          totalInstallments: installmentsCount,
          pointsEarned: Math.round(cuotaAmount),
          pointsAwarded: false,
          createdAt: new Date().toISOString(),
          type: creditDetails?.creditType || 'cotidiano'
        };
        installments.push(instDoc);
        nextDueDate.setDate(nextDueDate.getDate() + 15);
      }
      writeCollection('installments', installments, { action: 'add', collection: 'installments' });
    }

    // 3. Descontar Inventario de Productos
    if (saleItems.length > 0) {
      const products = readCollection('products');
      saleItems.forEach(item => {
        const prodId = item.productId || item.id;
        const pIndex = products.findIndex(p => String(p.id) === String(prodId));
        if (pIndex !== -1) {
          const deductQty = Number(item.quantityKg || item.quantity || 1);
          products[pIndex].stockKg = Math.max(0, Number(products[pIndex].stockKg || 0) - deductQty);
        }
      });
      writeCollection('products', products, { action: 'update', collection: 'products' });
    }

    res.json({
      success: true,
      transaction: finalTx,
      message: 'Venta procesada y cuotas registradas atómicamente.'
    });
  } catch (error) {
    console.error('Error en /api/pos/process-sale:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/collections/:name', (req, res) => {
  try {
    writeCollection(req.params.name, [], { action: 'clear', collection: req.params.name });
    res.json({ success: true });
  } catch (error) {
    console.error(`Error clearing ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error clearing collection' });
  }
});

app.delete('/api/collections/:name/:id', (req, res) => {
  try {
    const data = readCollection(req.params.name);
    const filtered = data.filter(d => String(d.id) !== String(req.params.id));
    writeCollection(req.params.name, filtered, { action: 'delete', collection: req.params.name, doc: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error(`Error deleting ${req.params.name}:`, error);
    res.status(500).json({ error: 'Error deleting document' });
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
    io.emit('database_restored', { timestamp: new Date().toISOString(), summary: restoredSummary });
    
    // Emitir eventos para que todas las vistas reactivas se actualicen
    for (const colName of Object.keys(collections)) {
      io.emit('collection_updated', colName);
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

