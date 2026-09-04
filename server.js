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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env asegurando la ruta absoluta a la raíz del proyecto
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config(); // Cargar también fallback por si está en proceso general

console.log('----------------------------------------------------');
console.log('🤖 ESTADO DEL ROBOT DE COMUNICACIONES:');
console.log('📧 Correo Emisor Configurado:', process.env.EMAIL_USER ? `SÍ (${process.env.EMAIL_USER})` : 'SÍ (Fallback: cherokejd566@gmail.com)');
console.log('🔑 Contraseña de Aplicación (.env):', process.env.EMAIL_PASS ? 'SÍ (Presente)' : '❌ NO DETECTADA (process.env.EMAIL_PASS vacío)');
console.log('📱 WhatsApp API Configurada:', process.env.WHATSAPP_API_URL || process.env.WHATSAPP_API_KEY ? 'SÍ' : 'Modo Simulación / Local');
console.log('----------------------------------------------------');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 3001;

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

    // Leer credenciales genéricas desde las variables de entorno
    const waApiUrl = process.env.WHATSAPP_API_URL || process.env.MESSAGING_API_URL || process.env.WHATSAPP_URL;
    const waApiKey = process.env.WHATSAPP_API_KEY || process.env.API_KEY || process.env.WHATSAPP_TOKEN;

    if (waApiUrl) {
      try {
        console.log(`[Robot WhatsApp] Despachando PIN ${code} a ${cleanPhone} vía API externa...`);
        const response = await fetch(waApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(waApiKey ? { 'Authorization': `Bearer ${waApiKey}`, 'x-api-key': waApiKey } : {})
          },
          body: JSON.stringify({
            phone: cleanPhone,
            to: cleanPhone,
            message: messageText,
            body: messageText,
            text: messageText
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('[Robot WhatsApp] Error en respuesta del proveedor:', response.status, errText);
          return res.status(502).json({ error: 'Error en la pasarela de WhatsApp', details: errText });
        }

        const data = await response.json().catch(() => ({ success: true }));
        console.log('[Robot WhatsApp] Mensaje enviado exitosamente:', data);
        return res.json({ success: true, channel: 'whatsapp', recipient: cleanPhone });
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

server.listen(PORT, () => {
  console.log(`Backend server (Uploader & WS) running on port ${PORT}`);
  console.log(`Saving databases and files to: ${uploadDir}`);
});
