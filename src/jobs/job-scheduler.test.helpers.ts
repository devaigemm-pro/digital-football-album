// Ayudantes de prueba del JobScheduler (Task 22.1).
//
// El cierre automático distingue el error "aún no corresponde cerrar"
// (`FechaLimiteNoAlcanzadaError`) por su `name`, no por identidad de clase. Este
// doble reproduce ese `name` para ejercitar la rama de no-op sin depender de la
// implementación concreta del servicio de cierre.

/** Doble del `FechaLimiteNoAlcanzadaError` del servicio de cierre (mismo `name`). */
export class FakeLimiteNoAlcanzadaError extends Error {
  constructor() {
    super('fecha límite no alcanzada (doble de prueba)');
    this.name = 'FechaLimiteNoAlcanzadaError';
  }
}
