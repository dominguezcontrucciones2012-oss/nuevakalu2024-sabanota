import path from 'path';
import { fileURLToPath } from 'url';
import { server } from '../server.js';
import runTests from './auth_phase1a.test.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Iniciando suite de pruebas en proceso unificado (puerto 3001)...');

async function main() {
  const PORT = process.env.PORT || 3001;

  // Si el servidor no está escuchando aún, iniciarlo en-proceso
  if (!server.listening) {
    await new Promise((resolve) => {
      server.listen(PORT, () => {
        console.log(`Backend server listening on port ${PORT} for in-process test runner`);
        resolve();
      });
    });
  }

  let exitCode = 0;
  try {
    await runTests();
  } catch (err) {
    console.error('Error en suite:', err.message);
    exitCode = 1;
  } finally {
    if (server.listening) {
      server.close();
    }
    // Salida limpia
    setTimeout(() => {
      process.exit(exitCode);
    }, 300);
  }
}

main();
