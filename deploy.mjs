import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function deploy() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({
      host: '144.126.153.184',
      username: 'root',
      password: 'Dominicdeisy2026',
    });
    console.log('Connected successfully!');
    
    // Find the project directory
    const findCmd = await ssh.execCommand('find / -name "kalu-crm-oficial-sabanota" -type d -maxdepth 4 2>/dev/null');
    let projectPath = findCmd.stdout.trim().split('\n')[0];
    
    if (!projectPath) {
      projectPath = '/root/kalu-crm-oficial-sabanota';
      console.log(`Fallback path: ${projectPath}`);
    } else {
      console.log(`Found project at: ${projectPath}`);
    }
    
    // Check if path exists
    const checkDir = await ssh.execCommand(`ls ${projectPath}`);
    if (checkDir.stderr) {
       console.log('Directory does not exist, let me just try /var/www/ or something.');
       // We might need a different path.
    }
    
    const script = `
      echo "Starting first deployment..."
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y git curl npm nodejs
      
      # Install Docker if not present
      if ! command -v docker &> /dev/null; then
          curl -fsSL https://get.docker.com -o get-docker.sh
          sh get-docker.sh
      fi
      
      # Install docker-compose
      if ! command -v docker-compose &> /dev/null; then
          apt-get install -y docker-compose
      fi

      cd /root
      if [ -d "kalu-crm" ]; then
          echo "Directory exists, pulling latest..."
          cd kalu-crm
          git reset --hard
          git pull origin main
      else
          echo "Cloning repository..."
          git clone https://github.com/dominguezcontrucciones2012-oss/nuevakalu2024-sabanota.git kalu-crm
          cd kalu-crm
      fi
      
      echo "Building the frontend..."
      curl -fsSL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
      bash nodesource_setup.sh
      apt-get install -y nodejs
      
      rm -rf node_modules package-lock.json
      npm install
      npm run build
      
      # Now run deployment using Docker
      cd vps-deployment
      
      # Clean up old containers forcefully if they conflict
      docker rm -f mi-web-api mi-web-nginx || true
      
      # Rebuild and restart containers
      docker-compose build
      docker-compose down
      docker-compose up -d
      
      # Sync the new uploads (SVGs and products_db.json) into the persistent Docker volume
      docker cp ../uploads/. mi-web-api:/var/www/app/uploads/
      docker restart mi-web-api
      
      echo "Deployment finished successfully!"
    `;
    
    const res = await ssh.execCommand(script);
    console.log('--- DEPLOY OUTPUT ---');
    console.log(res.stdout);
    if (res.stderr) {
      console.log('--- DEPLOY ERRORS ---');
      console.error(res.stderr);
    }
    console.log('---------------------');
    console.log('Deployment script executed!');
    
    ssh.dispose();
  } catch (err) {
    console.error('Error:', err);
    ssh.dispose();
  }
}

deploy();
