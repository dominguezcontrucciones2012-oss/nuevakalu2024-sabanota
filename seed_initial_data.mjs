import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsLocalDir = path.join(__dirname, 'uploads');

const ssh = new NodeSSH();

async function seedDataExplicitly() {
  console.log('⚠️ SCRIPT EXPLÍCITO DE MANTENIMIENTO: SINCRONIZACIÓN MANUAL DE DATOS');
  console.log('Este script solo debe ejecutarse de forma consciente para inicializar o restaurar datos locales hacia el servidor.');
  
  try {
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      password: process.env.SSH_PASSWORD || 'Dominicdeisy2026',
      readyTimeout: 45000
    });
    console.log('✅ Conectado al servidor VPS.');

    await ssh.execCommand('mkdir -p /root/kalu-crm/data');

    const jsonFiles = fs.readdirSync(uploadsLocalDir).filter(f => f.endsWith('.json'));
    console.log(`Transfiriendo ${jsonFiles.length} archivos JSON locales a /root/kalu-crm/data/...`);

    for (const file of jsonFiles) {
      const localPath = path.join(uploadsLocalDir, file);
      const remotePath = `/root/kalu-crm/data/${file}`;
      await ssh.putFile(localPath, remotePath);
    }

    await ssh.execCommand('docker restart mi-web-api');
    console.log('✅ Datos sincronizados manualmente en /root/kalu-crm/data y API reiniciada.');
    ssh.dispose();
  } catch (err) {
    console.error('❌ Error en script de sincronización:', err);
    ssh.dispose();
  }
}

seedDataExplicitly();
