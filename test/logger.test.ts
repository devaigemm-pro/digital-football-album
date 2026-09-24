// Pruebas del logger estructurado.

import { describe, expect, it } from 'vitest';
import { createLogger, type LogLevel } from '../src/composition/logger.js';

interface Captured {
  line: string;
  level: LogLevel;
}

function makeCapture(): { lines: Captured[]; write: (l: string, lv: LogLevel) => void } {
  const lines: Captured[] = [];
  return { lines, write: (line, level) => lines.push({ line, level }) };
}

describe('createLogger', () => {
  it('emite JSON estructurado con nivel, mensaje y campos', () => {
    const cap = makeCapture();
    const log = createLogger({ format: 'json', write: cap.write });
    log.info('hola', { userId: 'u1', n: 3 });

    expect(cap.lines).toHaveLength(1);
    const entry = JSON.parse(cap.lines[0]!.line) as Record<string, unknown>;
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('hola');
    expect(entry.userId).toBe('u1');
    expect(entry.n).toBe(3);
    expect(typeof entry.ts).toBe('string');
  });

  it('respeta el nivel mínimo (debug se filtra bajo info)', () => {
    const cap = makeCapture();
    const log = createLogger({ level: 'info', format: 'json', write: cap.write });
    log.debug('no-visible');
    log.warn('visible');
    expect(cap.lines).toHaveLength(1);
    expect(cap.lines[0]!.level).toBe('warn');
  });

  it('el logger hijo hereda y añade campos de contexto', () => {
    const cap = makeCapture();
    const log = createLogger({ format: 'json', write: cap.write, base: { a: 1 } });
    const child = log.child({ requestId: 'r1' });
    child.info('x', { b: 2 });
    const entry = JSON.parse(cap.lines[0]!.line) as Record<string, unknown>;
    expect(entry.a).toBe(1);
    expect(entry.requestId).toBe('r1');
    expect(entry.b).toBe(2);
  });

  it('formato pretty incluye nivel y mensaje en texto', () => {
    const cap = makeCapture();
    const log = createLogger({ format: 'pretty', write: cap.write });
    log.error('algo falló', { code: 'E1' });
    expect(cap.lines[0]!.line).toContain('ERROR');
    expect(cap.lines[0]!.line).toContain('algo falló');
    expect(cap.lines[0]!.level).toBe('error');
  });
});
