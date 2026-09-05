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
    
    // Check running processes on VPS (maybe npm install is running in background)
    const psAux = await ssh.execCommand('ps aux | grep docker');
    console.log('PS AUX DOCKER:\n', psAux.stdout);

    const df = await ssh.execCommand('df -h');
    console.log('DISK SPACE:\n', df.stdout);

    const dockerImages = await ssh.execCommand('docker images');
    console.log('DOCKER IMAGES:\n', dockerImages.stdout);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    ssh.dispose();
  }
}
run();
