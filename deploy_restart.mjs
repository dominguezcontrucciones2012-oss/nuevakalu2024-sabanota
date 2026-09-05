import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function deploy() {
  try {
    console.log('📡 Conectando al servidor VPS Contabo...');
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      password: process.env.SSH_PASSWORD || 'Dominicdeisy2026',
      readyTimeout: 35000
    });
    console.log('✅ Conexión establecida.');

    const script = `
      set -e
      cd /root/kalu-crm/vps-deployment
      echo "Reiniciando contenedores limpiamente con la nueva imagen..."
      docker-compose down || true
      docker rm -f mi-web-api mi-web-nginx 2>/dev/null || true
      docker-compose up -d --force-recreate
      echo "=== ESTADO DE CONTENEDORES DOCKER ==="
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

deploy();
