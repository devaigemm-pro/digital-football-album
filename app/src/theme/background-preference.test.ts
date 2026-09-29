// Pruebas de la preferencia de color de fondo (lógica pura, sin React).
//
// Cubren: validación contra la paleta, resolución tolerante a valores
// inválidos/ausentes (cae al defecto), y la búsqueda de la opción por color.

import {
  COLOR_FONDO_POR_DEFECTO,
  OPCIONES_FONDO,
  esColorFondoValido,
  opcionDeColor,
  resolverColorFondo,
} from './background-preference';

describe('OPCIONES_FONDO', () => {
  it('tiene al menos una opción y la primera es el defecto', () => {
    expect(OPCIONES_FONDO.length).toBeGreaterThan(0);
    expect(OPCIONES_FONDO[0]?.color).toBe(COLOR_FONDO_POR_DEFECTO);
  });

  it('todos los colores son hex #RRGGBB y los ids son únicos', () => {
    const ids = new Set<string>();
    for (const o of OPCIONES_FONDO) {
      expect(/^#[0-9A-Fa-f]{6}$/.test(o.color)).toBe(true);
      expect(ids.has(o.id)).toBe(false);
      ids.add(o.id);
    }
  });
});

describe('esColorFondoValido', () => {
  it('acepta un color de la paleta (case-insensitive)', () => {
    expect(esColorFondoValido('#0B0E14')).toBe(true);
    expect(esColorFondoValido('#0b0e14')).toBe(true);
  });

  it('rechaza colores fuera de la paleta y valores no-string', () => {
    expect(esColorFondoValido('#FFFFFF')).toBe(false);
    expect(esColorFondoValido('azul')).toBe(false);
    expect(esColorFondoValido(null)).toBe(false);
    expect(esColorFondoValido(undefined)).toBe(false);
  });
});

describe('resolverColorFondo', () => {
  it('devuelve el color si es válido', () => {
    const valido = OPCIONES_FONDO[1]!.color;
    expect(resolverColorFondo(valido)).toBe(valido);
  });

  it('cae al defecto ante valor inválido, null o undefined', () => {
    expect(resolverColorFondo('#123456')).toBe(COLOR_FONDO_POR_DEFECTO);
    expect(resolverColorFondo(null)).toBe(COLOR_FONDO_POR_DEFECTO);
    expect(resolverColorFondo(undefined)).toBe(COLOR_FONDO_POR_DEFECTO);
  });
});

describe('opcionDeColor', () => {
  it('devuelve la opción correspondiente a un color de la paleta', () => {
    expect(opcionDeColor('#0B0E14')?.id).toBe('stadium');
  });

  it('devuelve null para un color desconocido o valor no-string', () => {
    expect(opcionDeColor('#FFFFFF')).toBeNull();
    expect(opcionDeColor(null)).toBeNull();
  });
});
