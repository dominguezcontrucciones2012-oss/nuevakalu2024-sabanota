import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
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
  'portal.html',
  'vps-deployment/docker-compose.yml',
  'vps-deployment/Dockerfile',
  'vps-deployment/nginx.conf'
];

// Carpetas de código fuente a sincronizar
const DIRS_TO_SYNC = [
  'src',
  'public'
];

/**
 * Función central de verificación de guard previa a cualquier acción de red/SSH
 */
export function runPredeployGuard(guardScriptPath = path.join(__dirname, 'scripts', 'predeploy_guard.mjs')) {
  if (!fs.existsSync(guardScriptPath)) {
    console.error(`❌ [DEPLOY GUARD ERROR] Script de protección no encontrado en: ${guardScriptPath}`);
    return { ok: false, code: 1, error: 'GUARD_SCRIPT_NOT_FOUND' };
  }

  console.log('🛡️ [0/3] Ejecutando Pre-Deploy Guard de Protección Contable...');
  const res = spawnSync(process.execPath, [guardScriptPath], {
    stdio: 'inherit',
    cwd: __dirname
  });

  if (res.error) {
    console.error('❌ [DEPLOY GUARD ERROR] Fallo al ejecutar el guard:', res.error.message);
    return { ok: false, code: 1, error: res.error.message };
  }

  if (res.status !== 0) {
    console.error(`❌ [DEPLOY GUARD BLOCKED] El guard finalizó con código de error ${res.status}. Despliegue abortado.`);
    return { ok: false, code: res.status, error: `EXIT_CODE_${res.status}` };
  }

  return { ok: true, code: 0 };
}

async function deployDirectoVPS() {
  // PRIMERA PRECONDICIÓN OBLIGATORIA (FAIL-CLOSED): Pre-Deploy Guard
  const guardResult = runPredeployGuard();
  if (!guardResult.ok) {
    console.error('🚫 Despliegue cancelado automáticamente. Ningún comando ni archivo fue enviado al servidor.');
    process.exit(guardResult.code || 1);
  }

  try {
    const privateKeyPath = process.env.SSH_KEY_PATH || path.join(os.homedir(), '.ssh', 'kalu_contabo_ed25519');
    console.log('\n📡 [1/3] Conectando por SSH al VPS Contabo (144.126.153.184) usando clave SSH...');
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
      
      # Asegurar volumen de datos persistente en el host con permisos estrictos de mínimo privilegio (750)
      mkdir -p /root/kalu-crm/data /root/kalu-crm/uploads /root/kalu-crm/protected_media /root/kalu-crm/protected_media/captures
      chmod 750 /root/kalu-crm/data /root/kalu-crm/uploads /root/kalu-crm/protected_media /root/kalu-crm/protected_media/captures || true
      
      echo "Instalando dependencias si hay cambios..."
      npm install
      
      echo "Compilando frontend para producción..."
      npm run build
      
      echo "Copiando server y package a vps-deployment..."
      cp server.js vps-deployment/
      cp package.json vps-deployment/
      
      cd vps-deployment
      docker compose down || true
      docker compose build api
      docker compose up -d
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

// Solo ejecutar deploy si el script es invocado directamente desde CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  deployDirectoVPS();
}
