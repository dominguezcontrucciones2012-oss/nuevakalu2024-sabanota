import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();
async function run() {
  try {
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      password: process.env.SSH_PASSWORD || 'Dominicdeisy2026',
      readyTimeout: 30000
    });
    console.log('Connected to VPS.');
    
    // Kill hung build/compose processes
    console.log('Cleaning hung processes...');
    await ssh.execCommand('killall -9 docker-compose docker buildx 2>/dev/null || true');

    // Run docker-compose up -d without rebuilding
    console.log('Starting containers...');
    const upRes = await ssh.execCommand('cd /root/kalu-crm/vps-deployment && docker-compose up -d');
    console.log('Up STDOUT:\n', upRes.stdout);
    console.log('Up STDERR:\n', upRes.stderr);

    const ps = await ssh.execCommand('docker ps');
    console.log('--- DOCKER PS ---:\n', ps.stdout);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    ssh.dispose();
  }
}
run();
