#!/usr/bin/env node
// Hook en segundo plano: al terminar la sesión, deja registrada la sesión en el
// log de preferencias para que el agente representante tenga trazabilidad.
//
// Recibe por stdin un JSON con el contexto de la sesión (lo provee Kiro).
// No interrumpe al usuario: escribe en disco y termina.

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// .kiro/hooks -> raíz del workspace
const workspaceRoot = resolve(__dirname, '..', '..');
// El log vive en .kiro/hooks (no en steering) para no cargarse como contexto.
const logPath = resolve(workspaceRoot, '.kiro/hooks/preferencias-log.md');

// Lee el contexto de la sesión desde stdin (si lo hay).
let payload = {};
try {
  const raw = readFileSync(0, 'utf8');
  if (raw.trim()) payload = JSON.parse(raw);
} catch {
  // Sin stdin o JSON inválido: continuamos con lo que tengamos.
}

const now = new Date().toISOString();
const sessionId = payload.sessionId ?? payload.session_id ?? 'desconocida';

// Asegura el encabezado del log la primera vez.
if (!existsSync(logPath)) {
  appendFileSync(
    logPath,
    '# Log de sesiones (automático)\n\n' +
      'Registro en segundo plano de las sesiones cerradas. Revisar periódicamente\n' +
      'y consolidar las preferencias reales en `preferencias.md`.\n\n',
    'utf8',
  );
}

appendFileSync(
  logPath,
  `- [${now}] Sesión cerrada (id: ${sessionId}). Revisar si surgieron preferencias nuevas.\n`,
  'utf8',
);

// Silencioso: salida vacía y exit 0 para no interrumpir.
process.exit(0);
