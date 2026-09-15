import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import runTests from './auth_phase1a.test.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Iniciando servidor backend temporal para pruebas en puerto 3005...');

const serverProc = spawn('node', ['server.js'], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: '3001',
    UPLOAD_DIR: './data-dev',
    MAIL_MODE: 'development',
    WHATSAPP_MODE: 'simulation'
  },
  stdio: 'inherit'
});

async function main() {
  // Esperar a que el servidor inicialice
  await new Promise(r => setTimeout(r, 2000));

  let exitCode = 0;
  try {
    await runTests();
  } catch (err) {
    console.error('Error en suite:', err.message);
    exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
    // Forzar terminación limpia en Windows
    setTimeout(() => {
      process.exit(exitCode);
    }, 500);
  }
}

main();
