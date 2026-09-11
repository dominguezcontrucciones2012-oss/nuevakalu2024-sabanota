import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env asegurando la ruta absoluta a la raíz del proyecto
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config(); // Cargar también fallback por si está en proceso general

// Inicializar cliente de Google Gemini para el Robot Kalu
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

console.log('----------------------------------------------------');
console.log('🤖 ESTADO DEL ROBOT DE COMUNICACIONES:');
console.log('📧 Correo Emisor Configurado:', process.env.EMAIL_USER ? `SÍ (${process.env.EMAIL_USER})` : 'SÍ (Fallback: cherokejd566@gmail.com)');
console.log('🔑 Contraseña de Aplicación (.env):', process.env.EMAIL_PASS ? 'SÍ (Presente)' : '❌ NO DETECTADA (process.env.EMAIL_PASS vacío)');
console.log('📱 WhatsApp API Configurada:', process.env.WHATSAPP_API_URL || process.env.WHATSAPP_API_KEY ? 'SÍ' : 'Modo Simulación / Local');
console.log('----------------------------------------------------');

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

app.use(cors());
app.use(express.json());

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
  const token = process.env.WHATSAPP_API_KEY;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1344089325449515';

  if (!token || !phoneId) {
    console.warn('[Robot Kalu WhatsApp] Faltan credenciales de WhatsApp en el entorno.');
    return;
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

// 2. Recepción de Eventos / Mensajes Entrantes de Meta y Cerebro Robot Kalu (POST)
app.post('/api/webhook', async (req, res) => {
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

            // 1. FILTRO DE MULTIMEDIA (IMÁGENES / DOCUMENTOS)
            if (messageType === 'image' || messageType === 'document') {
              const replyText = "Hola 👋. Por este medio de WhatsApp no podemos recibir capturas ni comprobantes de pago por seguridad. Por favor, sube tu comprobante directamente a través de tu portal web personal.\n\nSi no recuerdas cómo ingresar, avísame y te guío paso a paso.";
              await sendWhatsAppDirectMessage(fromPhone, replyText);
              continue;
            }

            // 2. PROCESAMIENTO DE MENSAJES DE TEXTO Y NOTAS DE VOZ (AUDIO/OGG)
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

              // Contexto enriquecido para el motor de Inteligencia Artificial
              const systemPrompt = `
              Eres Kalu, el asistente virtual inteligente oficial de Mundo Kalu Sabanota.
              Estás atendiendo al cliente: ${client.name || client.nombre || 'Cliente'}.
              Tasa oficial BCV actual: ${exchangeRate} VES/USD.
              
              Deudas / Cuotas pendientes del cliente:
              ${JSON.stringify(pendingInstallments, null, 2)}
              
              Inventario de productos (quesos y precios):
              ${JSON.stringify(products.map(p => ({ id: p.id, name: p.name, price: p.price, stock: p.stock })), null, 2)}
              
              Reglas estrictas de comportamiento:
              1. Saluda cordialmente por su nombre.
              2. Si el cliente envió una nota de voz, escucha con atención su consulta y responde con claridad al contenido de su audio.
              3. Si pregunta por sus deudas o saldo, dale montos exactos en USD y su equivalente en Bolívares usando la tasa BCV (${exchangeRate} Bs/$).
              4. Si pregunta por productos, presentaciones de queso o precios, respóndele basándote estrictamente en el inventario provisto.
              5. Si pregunta cómo entrar al portal o enviar pagos, explícale de forma clara que debe ingresar a su Portal del Cliente en la sección 'Pagos' con su número de cédula o teléfono.
              6. Mantén respuestas concisas, amables y profesionales, adaptadas para WhatsApp.
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
                    parts.push({ text: "Escucha la nota de voz del cliente arriba y responde a su consulta siguiendo las reglas del sistema." });
                  } else {
                    parts.push({ text: "Mensaje del cliente: " + userText });
                  }

                  let aiResponse = null;
                  const modelsToTry = ['gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
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

// --- GENERIC COLLECTIONS API ---

const getCollectionFilePath = (name) => path.join(uploadDir, `${name}_db.json`);

const readCollection = (name) => {
  const filePath = getCollectionFilePath(name);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return [];
};

const writeCollection = (name, data, delta = null) => {
  fs.writeFileSync(getCollectionFilePath(name), JSON.stringify(data, null, 2));
  if (delta) {
    io.emit('collection_delta', delta);
  } else {
    io.emit('collection_updated', name); // Fallback for full reload
  }
};

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

// --- SERVICIOS AUXILIARES DE COMUNICACIÓN (WHATSAPP & CORREO) ---

async function sendWhatsAppNotification({ phone, name, message }) {
  if (!phone) return { success: false, reason: 'No phone' };
  
  let cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '58' + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith('58') && cleanPhone.length === 10) {
    cleanPhone = '58' + cleanPhone;
  }

  const waApiUrl = process.env.WHATSAPP_API_URL || process.env.MESSAGING_API_URL || process.env.WHATSAPP_URL;
  const waApiKey = process.env.WHATSAPP_API_KEY || process.env.API_KEY || process.env.WHATSAPP_TOKEN;

  if (waApiUrl) {
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
  } else {
    console.log(`[Robot WhatsApp Cobranza (Simulado)] A: ${cleanPhone}\nMensaje:\n${message}\n-----------------------------`);
    return { success: true, simulated: true, recipient: cleanPhone };
  }
}

async function sendEmailNotification({ email, name, subject, htmlContent }) {
  if (!email) return { success: false, reason: 'No email' };
  
  const emailUser = process.env.EMAIL_USER || 'cherokejd566@gmail.com';
  const emailPass = process.env.EMAIL_PASS;

  if (!emailPass) {
    console.warn('[Robot Correo Cobranza] No se puede enviar correo: process.env.EMAIL_PASS no configurado.');
    return { success: false, reason: 'No email credentials' };
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
app.post('/api/run-debt-check', async (req, res) => {
  try {
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

