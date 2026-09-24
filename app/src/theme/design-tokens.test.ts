// Pruebas de design-tokens — sistema de diseño puro del cliente.
//
// TypeScript puro (sin React): usan el shim central de globales de Jest
// (app/src/testing/jest-globals.d.ts). Cubren:
//   - `isHexColor` acepta #RGB/#RRGGBB/#RRGGBBAA y rechaza el resto.
//   - `buildTheme` sin acento usa el acento de marca por defecto.
//   - `buildTheme` con un acento de Club válido lo aplica sin mutar los tokens.
//   - `buildTheme` ignora un acento inválido y cae al de marca.

import { buildTheme, isHexColor, palette } from './design-tokens';

describe('isHexColor', () => {
  it('acepta formatos hex válidos (#RGB, #RRGGBB, #RRGGBBAA)', () => {
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#C8102E')).toBe(true);
    expect(isHexColor('#c8102eff')).toBe(true);
    expect(isHexColor('  #8A0B20  ')).toBe(true); // se recorta el espacio
  });

  it('rechaza cadenas que no son hex', () => {
    expect(isHexColor('C8102E')).toBe(false); // sin '#'
    expect(isHexColor('#12')).toBe(false); // longitud inválida
    expect(isHexColor('#gggggg')).toBe(false); // dígitos no hex
    expect(isHexColor('rgb(0,0,0)')).toBe(false);
    expect(isHexColor('')).toBe(false);
  });
});

describe('buildTheme', () => {
  it('usa el acento de marca por defecto cuando no se pasa acento de Club', () => {
    const theme = buildTheme();
    expect(theme.palette.accent).toBe(palette.accent);
  });

  it('usa el acento de marca cuando el acento de Club es null/undefined', () => {
    expect(buildTheme(null).palette.accent).toBe(palette.accent);
    expect(buildTheme(undefined).palette.accent).toBe(palette.accent);
  });

  it('aplica el acento del Club cuando es un hex válido', () => {
    const theme = buildTheme('#0A3A9C');
    expect(theme.palette.accent).toBe('#0A3A9C');
  });

  it('ignora un acento de Club inválido y cae al de marca', () => {
    const theme = buildTheme('azul');
    expect(theme.palette.accent).toBe(palette.accent);
  });

  it('no muta los tokens base al construir el tema con acento de Club', () => {
    buildTheme('#0A3A9C');
    expect(palette.accent).toBe('#C8102E');
  });

  it('expone las escalas de espaciado, radios y tipografía', () => {
    const theme = buildTheme();
    expect(theme.spacing.md).toBe(12);
    expect(theme.radius.card).toBe(14);
    expect(theme.fontSize.hero).toBe(40);
    expect(theme.fontWeight.extrabold).toBe('800');
  });
});
