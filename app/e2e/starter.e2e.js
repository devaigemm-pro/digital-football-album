// Prueba e2e de humo (Detox) — placeholder de scaffold.
//
// Task 24 — Requirements: 21.1, 21.2
// Verifica que la app arranca en emulador iOS 15+ / Android 8.0+ (API 26+).
// SOLO scaffold: ejecutar requiere emuladores + build nativo, no disponibles
// en este entorno. Las pruebas e2e reales se escriben con las pantallas
// (Task 26–29) y la prueba de humo de plataforma (Task 22.2).
describe('App_Móvil - humo', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('arranca la aplicación', async () => {
    // Placeholder: reemplazar por aserciones sobre la pantalla inicial (Login).
    await expect(element(by.id('app-root'))).toBeVisible();
  });
});
