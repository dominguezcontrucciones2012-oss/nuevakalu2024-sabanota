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
    
    // Bajar los contenedores primero para evitar el error KeyError: 'ContainerConfig'
    const cmd1 = await ssh.execCommand('docker-compose down', { cwd: '/root/kalu-crm/vps-deployment' });
    console.log('Docker Down Output:', cmd1.stdout, cmd1.stderr);
    
    // Subir de nuevo
    const cmd2 = await ssh.execCommand('docker-compose up -d --build', { cwd: '/root/kalu-crm/vps-deployment' });
    console.log('Docker Up Output:', cmd2.stdout, cmd2.stderr);
    
    ssh.dispose();
  } catch (error) {
    console.error('Error deploying to VPS:', error);
  }
}

run();
