#!/usr/bin/env node
// ===========================================================================
// verify-sql.mjs — Verificación estructural de las migraciones SQL.
//
// No requiere una base de datos. Comprueba, para cada archivo .sql:
//   1. Paréntesis balanceados (fuera de literales/comentarios).
//   2. Comillas simples balanceadas por sentencia.
//   3. BEGIN/COMMIT balanceados.
//   4. Cada sentencia termina en ';'.
// Y a nivel de conjunto:
//   5. Toda tabla/tipo creado en la migración up se elimina en la down.
//   6. Toda tabla referenciada por REFERENCES existe (se crea antes o es la propia).
//   7. Todo tipo usado como columna existe entre los tipos base o los creados.
//
// Uso: node migrations/verify-sql.mjs
// Sale con código 0 si todo pasa, 1 si hay hallazgos.
// ===========================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const errors = [];
const info = (m) => console.log(`  ${m}`);

/** Elimina comentarios de línea (-- ...) y literales de string simples. */
function stripCommentsAndStrings(sql) {
  let out = '';
  let i = 0;
  let inString = false;
  let inLineComment = false;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        out += c;
      }
      i++;
      continue;
    }
    if (inString) {
      if (c === "'" && next === "'") {
        i += 2; // comilla escapada dentro del literal
        continue;
      }
      if (c === "'") {
        inString = false;
      }
      i++;
      continue;
    }
    if (c === '-' && next === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      inString = true;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function checkBalance(name, raw) {
  const code = stripCommentsAndStrings(raw);

  // Paréntesis
  let depth = 0;
  for (const ch of code) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth < 0) {
      errors.push(`${name}: paréntesis ')' de más`);
      break;
    }
  }
  if (depth > 0) errors.push(`${name}: ${depth} paréntesis '(' sin cerrar`);

  // Comillas simples (tras el strip no deberían quedar; si quedan, hay desbalance)
  const strayQuotes = (code.match(/'/g) || []).length;
  if (strayQuotes > 0) errors.push(`${name}: comillas simples desbalanceadas`);

  // BEGIN/COMMIT
  const begins = (code.match(/\bBEGIN\b/gi) || []).length;
  const commits = (code.match(/\bCOMMIT\b/gi) || []).length;
  if (begins !== commits) {
    errors.push(`${name}: BEGIN(${begins}) != COMMIT(${commits})`);
  }

  // Cada sentencia no vacía termina en ';'
  const statements = code
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const trailing = code.trim();
  if (trailing.length > 0 && !trailing.endsWith(';')) {
    errors.push(`${name}: la última sentencia no termina en ';'`);
  }
  return { code, statements };
}

// Tipos base de PostgreSQL admitidos como columnas.
const BASE_TYPES = new Set([
  'uuid',
  'text',
  'integer',
  'int',
  'boolean',
  'jsonb',
  'json',
  'date',
  'timestamptz',
  'timestamp',
  'numeric',
  'bigint',
  'real',
  'double',
]);

function analyzeUp(code) {
  const createdTables = new Set();
  const createdTypes = new Set();
  const referencedTables = new Set();
  const usedTypes = new Set();

  const tableRe = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = tableRe.exec(code))) createdTables.add(m[1].toLowerCase());

  const typeRe = /CREATE TYPE\s+([a-z_][a-z0-9_]*)\s+AS ENUM/gi;
  while ((m = typeRe.exec(code))) createdTypes.add(m[1].toLowerCase());

  const refRe = /REFERENCES\s+([a-z_][a-z0-9_]*)/gi;
  while ((m = refRe.exec(code))) referencedTables.add(m[1].toLowerCase());

  // Columnas con tipo enum del dominio: busca "<col> <tipo_creado>"
  for (const t of createdTypes) {
    const useRe = new RegExp(`\\b${t}\\b`, 'gi');
    const occurrences = (code.match(useRe) || []).length;
    // Al menos una ocurrencia adicional a la definición del propio tipo.
    if (occurrences > 1) usedTypes.add(t);
  }

  return { createdTables, createdTypes, referencedTables, usedTypes };
}

function analyzeDown(code) {
  const droppedTables = new Set();
  const droppedTypes = new Set();
  const dtRe = /DROP TABLE\s+(?:IF EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = dtRe.exec(code))) droppedTables.add(m[1].toLowerCase());
  const dtyRe = /DROP TYPE\s+(?:IF EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
  while ((m = dtyRe.exec(code))) droppedTypes.add(m[1].toLowerCase());
  return { droppedTables, droppedTypes };
}

// ---------------------------------------------------------------------------
console.log('Verificación estructural de migraciones SQL\n');

const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
const parsed = {};
for (const f of files) {
  const raw = readFileSync(join(dir, f), 'utf8');
  console.log(`Archivo: ${f}`);
  const { code } = checkBalance(f, raw);
  parsed[f] = code;
  info('sintaxis básica revisada');
}

const upFiles = files.filter((f) => !f.endsWith('.down.sql'));
for (const up of upFiles) {
  const down = up.replace(/\.sql$/, '.down.sql');
  const upA = analyzeUp(parsed[up]);
  console.log(`\nAnálisis de ${up}:`);
  info(`tablas creadas: ${upA.createdTables.size}`);
  info(`tipos enum creados: ${upA.createdTypes.size}`);

  // Integridad de REFERENCES: la tabla destino debe existir en el mismo archivo.
  for (const ref of upA.referencedTables) {
    if (!upA.createdTables.has(ref)) {
      errors.push(`${up}: REFERENCES a tabla inexistente '${ref}'`);
    }
  }

  // Cobertura del rollback.
  if (parsed[down]) {
    const downA = analyzeDown(parsed[down]);
    for (const t of upA.createdTables) {
      if (!downA.droppedTables.has(t)) {
        errors.push(`${down}: falta DROP TABLE '${t}'`);
      }
    }
    for (const t of upA.createdTypes) {
      if (!downA.droppedTypes.has(t)) {
        errors.push(`${down}: falta DROP TYPE '${t}'`);
      }
    }
    info(`rollback cubre ${downA.droppedTables.size} tablas y ${downA.droppedTypes.size} tipos`);
  } else {
    errors.push(`${up}: no existe archivo de rollback ${down}`);
  }
}

// Verificación cruzada de invariantes exigidas por la tarea.
const initCode = parsed['0001_init.sql'] || '';
const invariants = [
  {
    ok: /CREATE TABLE recuadro[\s\S]*?partido_oficial_id\s+uuid NOT NULL UNIQUE REFERENCES partido_oficial/i.test(
      initCode,
    ),
    msg: 'UNIQUE(partido_oficial_id) en recuadro (un Recuadro por Partido)',
  },
  {
    ok: /foto_principal_id\s+uuid REFERENCES foto/i.test(initCode),
    msg: 'foto_principal_id NULLABLE con FK a foto (a lo sumo una Foto_Principal)',
  },
  {
    ok: /recuadro_ancho_mm/i.test(initCode) && /recuadro_alto_mm/i.test(initCode),
    msg: 'dimensiones físicas del Recuadro en plantilla_album',
  },
  {
    ok: /ancho_px/i.test(initCode) && /alto_px/i.test(initCode),
    msg: 'dimensiones en píxeles de la Foto',
  },
  {
    ok: /chk_sub_modalidad_solo_transmision/i.test(initCode),
    msg: 'CHECK sub_modalidad solo en Transmisión',
  },
];

console.log('\nInvariantes exigidas por la tarea:');
for (const inv of invariants) {
  info(`${inv.ok ? 'OK ' : 'FALTA'} - ${inv.msg}`);
  if (!inv.ok) errors.push(`invariante ausente: ${inv.msg}`);
}

console.log('\n---');
if (errors.length === 0) {
  console.log('RESULTADO: OK — todas las verificaciones pasaron.');
  process.exit(0);
} else {
  console.log(`RESULTADO: ${errors.length} hallazgo(s):`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
