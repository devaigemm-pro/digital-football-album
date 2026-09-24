// Logger estructurado mínimo, sin dependencias.
//
// En producción emite JSON por línea (apto para agregadores de logs); en
// desarrollo, texto legible. Expone niveles y permite adjuntar contexto
// estructurado. No registra secretos: el llamador decide qué campos incluir.

/** Niveles de log soportados, de menor a mayor severidad. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Campos estructurados adicionales de una entrada de log. */
export type LogFields = Record<string, unknown>;

/** Logger con niveles y salida estructurada. */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Devuelve un logger hijo con campos de contexto fijos añadidos a cada entrada. */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  /** Nivel mínimo a emitir. Por defecto 'info'. */
  readonly level?: LogLevel;
  /** 'json' (producción) o 'pretty' (desarrollo). Por defecto según NODE_ENV. */
  readonly format?: 'json' | 'pretty';
  /** Sumidero de escritura. Por defecto stdout/stderr. */
  readonly write?: (line: string, level: LogLevel) => void;
  /** Campos base incluidos en toda entrada. */
  readonly base?: LogFields;
}

function defaultWrite(line: string, level: LogLevel): void {
  // Los errores van a stderr; el resto a stdout.
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

function formatPretty(level: LogLevel, message: string, fields: LogFields): string {
  const ts = new Date().toISOString();
  const extras = Object.keys(fields).length ? ' ' + JSON.stringify(fields) : '';
  return `${ts} ${level.toUpperCase().padEnd(5)} ${message}${extras}`;
}

function formatJson(level: LogLevel, message: string, fields: LogFields): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
}

/** Crea un logger estructurado. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = options.level ?? 'info';
  const format = options.format ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');
  const write = options.write ?? defaultWrite;
  const base = options.base ?? {};

  const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const merged = { ...base, ...(fields ?? {}) };
    const line =
      format === 'json' ? formatJson(level, message, merged) : formatPretty(level, message, merged);
    write(line, level);
  };

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) =>
      createLogger({
        ...options,
        base: { ...base, ...fields },
      }),
  };
}
