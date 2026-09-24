// Clasificador de Partidos (Req 10).
//
// Implementa el contrato lógico `clasificar(partido, club)` del design.md
// ("Clasificador de Partidos"): asigna a cada Partido_Oficial los indicadores
// `esClasico` y `esInternacional`, que alimentan las reglas de holograma en
// stickers y la generación de Digital Cards premium (Req 10.4).
//
// Reglas (design.md · "Clasificador de Partidos"):
//   - `esClasico`  = true  ⇔ el `rival` del Partido_Oficial figura en la lista
//                            predefinida de rivalidades del Club (Req 10.2).
//   - `esInternacional` = true ⇔ la competición es internacional, es decir
//                            `tipoCompeticion === 'INTERNACIONAL'` según la
//                            clasificación obtenida de la API (Req 10.3).
//   - Todo Partido_Oficial queda clasificado con ambos indicadores (Req 10.1).
//
// Decisión de emparejamiento de rivalidades:
//   El nombre del rival proveniente de la API deportiva y el `rivalNombre`
//   almacenado en las rivalidades del Club pueden diferir en mayúsculas/minúsculas
//   y en espacios de borde. Para que la clasificación de Clásicos sea robusta
//   frente a estas variaciones triviales, la comparación es **case-insensitive y
//   con recorte de espacios de borde** (normalización): se comparan las cadenas
//   pasadas por `trim()` y `toLocaleLowerCase()`. No se aplica ninguna otra
//   transformación (no se colapsan espacios internos ni se eliminan acentos),
//   de modo que "River Plate" ≠ "River  Plate" y "Peñarol" ≠ "Penarol": la lista
//   de rivalidades debe declarar el nombre canónico salvo por caja y bordes.
//
// El clasificador se ofrece en dos formas:
//   - `clasificar(partido, rivalidades)`: función pura y determinista que recibe
//     directamente la lista de nombres de rivalidades (ideal para pruebas puras).
//   - `ClassifierService`: fachada inyectable con `RivalidadRepository` que
//     resuelve las rivalidades del Club antes de delegar en la función pura.
//
// Task 9.1 — Requirements: 10.1, 10.2, 10.3, 10.4

import type { Club, PartidoOficial, Rivalidad } from '../../domain/types.js';
import type { RivalidadRepository } from '../../persistence/repositories.js';

/**
 * Resultado de clasificar un Partido_Oficial: los dos indicadores que fija el
 * Clasificador y que consumen el Print_Engine (holograma) y el Generador_Cards
 * (Digital Cards premium) (Req 10.4).
 */
export interface ClasificacionPartido {
  /** El rival figura en la lista de rivalidades del Club (Req 10.2). */
  esClasico: boolean;
  /** La competición es internacional (`tipoCompeticion === 'INTERNACIONAL'`) (Req 10.3). */
  esInternacional: boolean;
}

/**
 * Normaliza un nombre de rival para la comparación de Clásicos: recorta espacios
 * de borde y pasa a minúsculas de forma sensible a la localización. Es la única
 * transformación aplicada (ver nota de decisión en el encabezado del módulo).
 */
function normalizarNombre(nombre: string): string {
  return nombre.trim().toLocaleLowerCase();
}

/**
 * Clasifica un Partido_Oficial de forma pura y determinista a partir de la lista
 * de nombres de rivalidades del Club.
 *
 * - `esClasico`: `true` si y solo si el `rival` del partido coincide (tras
 *   normalizar caja y bordes) con algún nombre de la lista de rivalidades.
 * - `esInternacional`: `true` si y solo si `tipoCompeticion === 'INTERNACIONAL'`.
 *
 * @param partido Partido_Oficial a clasificar (se leen `rival` y `tipoCompeticion`).
 * @param rivalidades Nombres de los rivales predefinidos del Club (Req 10.2).
 * @returns Los indicadores `{ esClasico, esInternacional }` (Req 10.1).
 */
export function clasificar(
  partido: Pick<PartidoOficial, 'rival' | 'tipoCompeticion'>,
  rivalidades: readonly string[],
): ClasificacionPartido {
  const rivalNormalizado = normalizarNombre(partido.rival);
  const esClasico = rivalidades.some((nombre) => normalizarNombre(nombre) === rivalNormalizado);
  const esInternacional = partido.tipoCompeticion === 'INTERNACIONAL';
  return { esClasico, esInternacional };
}

/**
 * Aplica una clasificación a un Partido_Oficial devolviendo una copia con los
 * campos `esClasico`/`esInternacional` fijados. No muta el partido de entrada.
 */
export function aplicarClasificacion(
  partido: PartidoOficial,
  clasificacion: ClasificacionPartido,
): PartidoOficial {
  return {
    ...partido,
    esClasico: clasificacion.esClasico,
    esInternacional: clasificacion.esInternacional,
  };
}

/**
 * Clasificador de Partidos inyectable con `RivalidadRepository`.
 *
 * Resuelve las rivalidades del Club (por `clubId`) y delega en la función pura
 * `clasificar`. Depende únicamente de la interfaz del repositorio, no de una
 * implementación concreta, para ser testeable con los dobles en memoria.
 */
export class ClassifierService {
  constructor(private readonly rivalidades: RivalidadRepository) {}

  /**
   * Clasifica un Partido_Oficial usando las rivalidades predefinidas del Club.
   *
   * @param partido Partido_Oficial a clasificar.
   * @param club Club del usuario (aporta su `id` para resolver las rivalidades).
   * @returns Los indicadores `{ esClasico, esInternacional }` (Req 10.1).
   */
  async clasificar(
    partido: Pick<PartidoOficial, 'rival' | 'tipoCompeticion'>,
    club: Pick<Club, 'id'>,
  ): Promise<ClasificacionPartido> {
    const rivalidades: Rivalidad[] = await this.rivalidades.findByClubId(club.id);
    return clasificar(
      partido,
      rivalidades.map((r) => r.rivalNombre),
    );
  }

  /**
   * Clasifica un Partido_Oficial y devuelve una copia con `esClasico`/
   * `esInternacional` fijados, lista para persistir (Req 10.1).
   */
  async clasificarYAplicar(
    partido: PartidoOficial,
    club: Pick<Club, 'id'>,
  ): Promise<PartidoOficial> {
    const clasificacion = await this.clasificar(partido, club);
    return aplicarClasificacion(partido, clasificacion);
  }
}
