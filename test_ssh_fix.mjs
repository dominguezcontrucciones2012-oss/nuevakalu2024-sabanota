import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function connectAndFix() {
  const passwords = [process.env.SSH_PASSWORD || 'Dominicdeisy2026', 'dominic.2026'];
  
  for (const pwd of passwords) {
    try {
      console.log(`Intentando conectar con clave...`);
      await ssh.connect({
        host: '144.126.153.184',
        username: 'root',
        password: pwd,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ssh-ed25519', 'rsa-sha2-512', 'rsa-sha2-256']
        },
        readyTimeout: 20000
      });
      console.log('✅ CONECTADO CON ÉXITO AL VPS.');
      
      const res = await ssh.execCommand('docker ps -a');
      console.log('=== DOCKER PS ===\n', res.stdout);
      
      const logsNginx = await ssh.execCommand('docker logs --tail 20 mi-web-nginx 2>&1');
      console.log('=== NGINX LOGS ===\n', logsNginx.stdout);

      const logsApi = await ssh.execCommand('docker logs --tail 20 mi-web-api 2>&1');
      console.log('=== API LOGS ===\n', logsApi.stdout);

      ssh.dispose();
      return;
    } catch (e) {
      console.error('Fallo intento:', e.message);
    }
  }
}

connectAndFix();
