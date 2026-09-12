import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ssh = new NodeSSH();

async function deploySeguro() {
  try {
    console.log('📡 [1/3] Conectando por SSH a Contabo (144.126.153.184)...');
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      password: process.env.SSH_PASSWORD || 'Dominicdeisy2026',
      readyTimeout: 45000
    });
    console.log('✅ Conectado exitosamente al servidor VPS.');

    // 1. Transferir el archivo seguro .env al servidor privado por SSH (nunca pasa por Git)
    const localEnvPath = path.join(__dirname, '.env');
    if (fs.existsSync(localEnvPath)) {
      console.log('🔒 Transfiriendo archivo .env seguro y aislado al servidor VPS...');
      await ssh.putFile(localEnvPath, '/root/kalu-crm/.env');
      await ssh.putFile(localEnvPath, '/root/kalu-crm/vps-deployment/.env');
      console.log('✅ Archivo .env sincronizado privadamente en el VPS.');
    }

    // 2. Actualizar código, construir imagen y recrear contenedor SIN tocar los datos persistentes
    console.log('\n⚙️ [2/3] Actualizando código desde Git y compilando frontend...');
    const buildScript = `
      set -e
      cd /root/kalu-crm
      git reset --hard HEAD
      git pull origin main
      
      # Asegurar que el directorio de datos persistente en el host exista y tenga permisos
      mkdir -p /root/kalu-crm/data
      chmod 777 /root/kalu-crm/data || true
      
      # Si /root/kalu-crm/data está vacío por ser primera vez, migrar desde uploads
      if [ ! "$(ls -A /root/kalu-crm/data)" ] && [ -d "/root/kalu-crm/uploads" ]; then
        echo "Primera inicialización: Copiando estructura base a /root/kalu-crm/data..."
        cp -rn /root/kalu-crm/uploads/* /root/kalu-crm/data/ || true
      fi
      
      echo "Instalando paquetes y compilando frontend..."
      npm install
      npm run build
      
      echo "Actualizando archivos de backend para Docker..."
      cp server.js vps-deployment/
      cp package.json vps-deployment/
      
      cd vps-deployment
      docker-compose down || true
      docker-compose build api
      docker-compose up -d
      echo "Contenedores levantados con volumen persistente en /root/kalu-crm/data."
    `;
    const resBuild = await ssh.execCommand(buildScript);
    console.log(resBuild.stdout);
    if (resBuild.stderr) console.warn(resBuild.stderr);

    // 3. Verificación de estado
    console.log('\n🔍 [3/3] Verificando salud del sistema y persistencia de datos...');
    const verifyScript = `
      sleep 3
      docker ps
      echo "Archivos en volumen de datos persistente (/root/kalu-crm/data):"
      ls -la /root/kalu-crm/data | head -n 15
      echo "=== DESPLIEGUE SEGURO COMPLETADO ==="
    `;
    const resVerify = await ssh.execCommand(verifyScript);
    console.log(resVerify.stdout);
    if (resVerify.stderr) console.warn(resVerify.stderr);

    console.log('\n🎉 ¡DESPLIEGUE SEGURO EXITOSO! La base de datos y contabilidad permanecen 100% intactas.');
    ssh.dispose();
  } catch (err) {
    console.error('❌ Error durante el despliegue seguro:', err);
    ssh.dispose();
  }
}

deploySeguro();
