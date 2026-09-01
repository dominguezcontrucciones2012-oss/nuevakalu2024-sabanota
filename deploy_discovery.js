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
    
    // Find where the project is
    const result = await ssh.execCommand('find /root -name "docker-compose.yml" -maxdepth 3');
    console.log('Project directories:', result.stdout);
    
    ssh.dispose();
  } catch (error) {
    console.error('Error connecting to VPS:', error);
  }
}

run();
