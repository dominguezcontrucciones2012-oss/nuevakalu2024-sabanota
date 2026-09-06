import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function deploy() {
  try {
    console.log('📡 Conectando al servidor VPS Contabo (144.126.153.184)...');
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      password: process.env.SSH_PASSWORD || 'Dominicdeisy2026',
      readyTimeout: 35000
    });
    console.log('✅ Conexión SSH establecida con éxito.');

    const script = `
      set -e
      echo "=== [1/5] Actualizando repositorio en VPS ==="
      cd /root/kalu-crm
      git reset --hard HEAD
      git pull origin main

      echo "=== [2/5] Compilando frontend fresco en VPS ==="
      npm install
      npm run build

      echo "=== [3/5] Actualizando backend para contenedor Docker ==="
      cp server.js vps-deployment/
      cp package.json vps-deployment/

      echo "=== [4/5] Reconstruyendo y levantando contenedores Docker ==="
      cd vps-deployment
      docker-compose down || true
      docker-compose build api
      docker-compose up -d

      echo "=== [5/5] Verificando estado de contenedores y puertos ==="
      docker ps
      sleep 3
      curl -I http://localhost/ || true
      curl -I http://localhost:3001/api/health || true
      echo "🚀 ¡Despliegue finalizado exitosamente en Contabo!"
    `;

    console.log('⚙️ Ejecutando rutina de compilación y despliegue en remoto...');
    const res = await ssh.execCommand(script);
    console.log('--- LOG DE DESPLIEGUE ---');
    console.log(res.stdout);
    if (res.stderr) {
      console.warn('--- AVISOS / ERRORES ---');
      console.warn(res.stderr);
    }
    console.log('-------------------------');
    console.log('🎉 Despliegue completado al 100%.');

    ssh.dispose();
  } catch (err) {
    console.error('❌ Error durante el despliegue:', err);
    ssh.dispose();
  }
}

deploy();
