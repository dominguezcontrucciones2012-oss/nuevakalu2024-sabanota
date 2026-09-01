import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      password: 'Dominicdeisy2026'
    });
    
    console.log('Connected to VPS.');
    
    const cmd1 = await ssh.execCommand('git pull', { cwd: '/root/kalu-crm' });
    console.log('Git Pull Output:', cmd1.stdout, cmd1.stderr);
    
    const cmd2 = await ssh.execCommand('docker-compose up -d --build', { cwd: '/root/kalu-crm/vps-deployment' });
    console.log('Docker Output:', cmd2.stdout, cmd2.stderr);
    
    ssh.dispose();
  } catch (error) {
    console.error('Error deploying to VPS:', error);
  }
}

run();
