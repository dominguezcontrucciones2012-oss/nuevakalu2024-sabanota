import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function checkAndFix() {
  try {
    console.log('📡 Conectando al VPS Contabo (144.126.153.184)...');
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      password: process.env.SSH_PASSWORD || 'Dominicdeisy2026',
      readyTimeout: 35000
    });
    console.log('✅ Conexión establecida.');

    const script = `
      echo "=== 1. VERIFICAR DOCKER PS ==="
      docker ps -a
      
      echo "=== 2. LOGS DE NGINX ==="
      docker logs --tail 30 mi-web-nginx 2>&1 || true
      
      echo "=== 3. LOGS DE API ==="
      docker logs --tail 30 mi-web-api 2>&1 || true

      echo "=== 4. REINICIAR CONTENEDORES ASEGURANDO LEVANTAMIENTO ==="
      cd /root/kalu-crm/vps-deployment
      docker-compose down || true
      docker-compose up -d
      
      echo "=== 5. ESTADO FINAL ==="
      docker ps
    `;

    const res = await ssh.execCommand(script);
    console.log(res.stdout);
    if (res.stderr) console.error(res.stderr);

    ssh.dispose();
  } catch (err) {
    console.error('Error:', err);
    ssh.dispose();
  }
}

checkAndFix();
