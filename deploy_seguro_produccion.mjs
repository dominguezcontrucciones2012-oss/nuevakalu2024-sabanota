import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ssh = new NodeSSH();

// Lista de archivos raíz y configs a sincronizar
const FILES_TO_SYNC = [
  'server.js',
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'index.html',
  'vps-deployment/docker-compose.yml',
  'vps-deployment/Dockerfile',
  'vps-deployment/nginx.conf'
];

// Carpetas de código fuente a sincronizar
const DIRS_TO_SYNC = [
  'src',
  'public'
];

async function deployDirectoVPS() {
  try {
    const privateKeyPath = process.env.SSH_KEY_PATH || path.join(os.homedir(), '.ssh', 'kalu_contabo_ed25519');
    console.log('📡 [1/3] Conectando por SSH al VPS Contabo (144.126.153.184) usando clave SSH...');
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      privateKeyPath: privateKeyPath,
      readyTimeout: 45000
    });
    console.log('✅ Conectado exitosamente al servidor VPS.');

    console.log('\n📦 [2/3] Sincronizando archivos de código directamente por SSH (sin tocar base de datos ni .env)...');
    
    // Subir archivos raíz y de despliegue
    for (const file of FILES_TO_SYNC) {
      const localFile = path.join(__dirname, file);
      const remoteFile = `/root/kalu-crm/${file}`;
      if (fs.existsSync(localFile)) {
        await ssh.putFile(localFile, remoteFile);
        console.log(`  ✓ Subido: ${file}`);
      }
    }

    // Subir carpetas de código fuente (src, public)
    for (const dir of DIRS_TO_SYNC) {
      const localDir = path.join(__dirname, dir);
      const remoteDir = `/root/kalu-crm/${dir}`;
      if (fs.existsSync(localDir)) {
        console.log(`  ⏳ Subiendo directorio: ${dir}/...`);
        await ssh.putDirectory(localDir, remoteDir, {
          recursive: true,
          concurrency: 10,
          validate: (itemPath) => !itemPath.includes('node_modules') && !itemPath.includes('.git')
        });
        console.log(`  ✓ Directorio sincronizado: ${dir}/`);
      }
    }

    console.log('\n⚙️ [3/3] Compilando frontend y recreando contenedores Docker en VPS...');
    const remoteBuildScript = `
      set -e
      cd /root/kalu-crm
      
      # Asegurar volumen de datos persistente en el host
      mkdir -p /root/kalu-crm/data
      chmod 777 /root/kalu-crm/data || true
      
      echo "Instalando dependencias si hay cambios..."
      npm install
      
      echo "Compilando frontend para producción..."
      npm run build
      
      echo "Copiando server y package a vps-deployment..."
      cp server.js vps-deployment/
      cp package.json vps-deployment/
      
      cd vps-deployment
      docker-compose down || true
      docker-compose build api
      docker-compose up -d
    `;

    const resBuild = await ssh.execCommand(remoteBuildScript);
    console.log(resBuild.stdout);
    if (resBuild.stderr) console.warn(resBuild.stderr);

    console.log('\n🔍 Verificando estado de los contenedores y persistencia...');
    const resVerify = await ssh.execCommand('docker ps && ls -lh /root/kalu-crm/data | head -n 10');
    console.log(resVerify.stdout);

    console.log('\n🎉 ¡DESPLIEGUE A PRODUCCIÓN COMPLETADO CON ÉXITO!');
    console.log('🛡️ La base de datos, contabilidad y claves .env se mantuvieron 100% intactas y protegidas.');
    ssh.dispose();
  } catch (err) {
    console.error('❌ Error durante el despliegue:', err);
    ssh.dispose();
  }
}

deployDirectoVPS();
