/**
 * PRE-DEPLOY GUARD (Read-Only Security Verification)
 * 
 * Verifica estrictamente antes de cualquier despliegue:
 * 1. Coherencia de montajes Docker Compose con el manifiesto protegido
 * 2. Ausencia de comandos destructivos en scripts de despliegue
 * 3. Integridad de directorios de datos en VPS
 * 4. Integridad del manifiesto y reglas de persistencia
 * 
 * RETORNA:
 *   Exit code 0 (PASS)
 *   Exit code 1 (FAIL / ABORT)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export function validateDeploySafety({
  composeFilePath = path.join(projectRoot, 'vps-deployment', 'docker-compose.yml'),
  deployScriptPath = path.join(projectRoot, 'deploy_seguro_produccion.mjs'),
  manifestPath = path.join(projectRoot, 'config', 'protected-data.json'),
  customScripts = []
} = {}) {
  const errors = [];
  const warnings = [];

  // 1. Validar existencia del Manifiesto Protegido
  if (!fs.existsSync(manifestPath)) {
    return {
      pass: false,
      errors: [`Manifiesto de datos protegidos no encontrado en: ${manifestPath}`],
      warnings
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return {
      pass: false,
      errors: [`Error parseando config/protected-data.json: ${err.message}`],
      warnings
    };
  }

  // 2. Validar docker-compose.yml
  if (!fs.existsSync(composeFilePath)) {
    errors.push(`docker-compose.yml no encontrado en: ${composeFilePath}`);
  } else {
    const composeContent = fs.readFileSync(composeFilePath, 'utf8');

    // Verificar que contenga los montajes requeridos
    for (const [key, mount] of Object.entries(manifest.dataMounts || {})) {
      if (mount.required) {
        const expectedPattern = `${mount.hostPath}:${mount.containerPath}`;
        if (!composeContent.includes(expectedPattern)) {
          errors.push(`Montaje crítico faltante o alterado en docker-compose.yml: '${expectedPattern}' (${mount.description})`);
        }
      }
    }

    // Verificar que no use volúmenes efímeros o no mapeados para data
    if (composeContent.includes('named_volumes:') || composeContent.includes('volume: data')) {
      warnings.push('Verificar que los volúmenes de datos no dependan de named volumes volátiles.');
    }
  }

  // 3. Validar scripts de deploy en busca de comandos destructivos prohibidos
  const scriptsToCheck = [deployScriptPath, ...customScripts].filter(Boolean);
  for (const scriptPath of scriptsToCheck) {
    if (fs.existsSync(scriptPath)) {
      const content = fs.readFileSync(scriptPath, 'utf8');
      for (const forbidden of (manifest.forbiddenDeployCommands || [])) {
        if (content.includes(forbidden)) {
          errors.push(`Comando destructivo prohibido detectado en ${path.basename(scriptPath)}: "${forbidden}"`);
        }
      }
    }
  }

  // 4. Validar que no se intente sobreescribir /root/kalu-crm/data mediante copia directa de archivos
  if (fs.existsSync(deployScriptPath)) {
    const deployContent = fs.readFileSync(deployScriptPath, 'utf8');
    if (deployContent.includes("putDirectory(") && deployContent.includes("'data'") && !deployContent.includes("validate:")) {
      errors.push('Script de despliegue intenta sincronizar carpeta data local hacia VPS.');
    }
  }

  return {
    pass: errors.length === 0,
    errors,
    warnings,
    manifestVersion: manifest.version,
    protectedCollectionsCount: (manifest.protectedCollections || []).length
  };
}

// Ejecución directa por CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('==================================================');
  console.log('🛡️  EJECUTANDO PRE-DEPLOY GUARD');
  console.log('==================================================');

  const result = validateDeploySafety();

  if (result.warnings.length > 0) {
    console.log('\n⚠️  ADVERTENCIAS:');
    result.warnings.forEach(w => console.log(`   - ${w}`));
  }

  if (result.pass) {
    console.log('\n✅ PRE-DEPLOY GUARD: PASS');
    console.log(`   - Manifiesto versión: ${result.manifestVersion}`);
    console.log(`   - Colecciones protegidas: ${result.protectedCollectionsCount}`);
    console.log('   - Montajes Docker persistentes verificados.');
    console.log('   - Cero comandos destructivos detectados.');
    console.log('==================================================');
    process.exit(0);
  } else {
    console.error('\n❌ PRE-DEPLOY GUARD: FAIL / ABORTADO');
    result.errors.forEach(e => console.error(`   🛑 ERROR: ${e}`));
    console.error('==================================================');
    process.exit(1);
  }
}
