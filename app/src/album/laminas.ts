// laminas.ts — lógica PURA de presentación de las láminas del álbum.
//
// Reúne tres funciones framework-agnósticas (TypeScript puro, sin React/RN, por
// lo que PARTICIPAN del typecheck y se testean con Vitest) que alimentan tres
// features pedidas desde la mirada del hincha/coleccionista:
//
//   - Feature 5 · Realce de Clásico / Internacional: deriva el "realce" visual
//     de una lámina a partir de los booleanos que YA resuelve el backend
//     (`esClasico`, `esInternacional`). El cliente NO clasifica (Req 8, regla de
//     negocio del backend): solo traduce esos booleanos a un estilo. El sticker
//     con efecto holograma IMPRESO para Clásicos/Internacionales es Premium
//     (Req 7); este realce es solo DIGITAL y no promete el holograma físico.
//
//   - Feature 1 · Progreso real de la temporada: cuenta láminas montadas sobre
//     el total de RECUADROS (partidos con `numeroRecuadro != null`), respetando
//     la biyección Recuadro↔Partido (Req 4.1) y la numeración tolerante a huecos
//     (Req 3). No inventa el conteo: se deriva de datos del backend.
//
//   - Feature 4 · Estantería agrupada por competición: agrupa las láminas por
//     `tipoCompeticion` (LIGA | COPA_NACIONAL | INTERNACIONAL) conservando el
//     orden por número de recuadro, para pintar la estantería con huecos. Las
//     láminas vacías (silueta) comunican el faltante sin aviso extra (Req 11.2 /
//     preferencia 2026-09-27).
//
// Estas funciones NO tocan la red ni el estado observable: son helpers que las
// pantallas `.tsx` (Carné, estantería del álbum) y los presenters consumen.

import type { PartidoLamina, TipoCompeticion } from '../adapters/http-profile-client';

// ---------------------------------------------------------------------------
// Feature 5 · Realce de Clásico / Internacional (capa visual sobre la
// clasificación que ya resuelve el backend).
// ---------------------------------------------------------------------------

/**
 * Nivel de realce visual de una lámina, derivado de la clasificación del
 * backend. Unión de literales de string (convención del repo, en vez de `enum`):
 *   - `'clasico'`: el rival está en la lista de rivalidades del club (Req 8).
 *   - `'internacional'`: partido de competición internacional (Req 8).
 *   - `'normal'`: liga/copa sin realce especial.
 *
 * Si un partido fuese a la vez Clásico e Internacional, PRIMA `'clasico'`: para
 * el hincha, el clásico es el pico emocional máximo, y así el realce es estable
 * y predecible.
 */
export type RealceLamina = 'clasico' | 'internacional' | 'normal';

/**
 * Datos mínimos de clasificación que necesita el realce. `PartidoLamina` y
 * `PartidoDetalle` (ambos DTOs del backend) los satisfacen, por lo que la misma
 * función sirve para la lista de láminas y para el detalle del partido.
 */
export interface ClasificacionPartido {
  readonly esClasico: boolean;
  readonly esInternacional: boolean;
}

/**
 * Deriva el realce visual de una lámina desde los booleanos del backend. El
 * Clásico tiene prioridad sobre el Internacional (ver {@link RealceLamina}).
 *
 * @param partido clasificación ya resuelta por el backend (no se recalcula).
 * @returns el nivel de realce a aplicar en la UI.
 */
export function realceLamina(partido: ClasificacionPartido): RealceLamina {
  if (partido.esClasico) {
    return 'clasico';
  }
  if (partido.esInternacional) {
    return 'internacional';
  }
  return 'normal';
}

/**
 * ¿La lámina merece realce especial (Clásico o Internacional)? Atajo booleano
 * para decidir si mostrar borde dorado / badge sin repetir la comparación.
 */
export function tieneRealceEspecial(partido: ClasificacionPartido): boolean {
  return realceLamina(partido) !== 'normal';
}

/**
 * Etiqueta corta y legible del realce para badges/píldoras de la UI, o `null`
 * si la lámina es normal (sin badge). Texto en español, coherente con el
 * mockup ("CLÁSICO" / "INTERNACIONAL").
 */
export function etiquetaRealce(partido: ClasificacionPartido): string | null {
  switch (realceLamina(partido)) {
    case 'clasico':
      return 'CLÁSICO';
    case 'internacional':
      return 'INTERNACIONAL';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Feature 1 · Progreso real de la temporada.
// ---------------------------------------------------------------------------

/**
 * Progreso del álbum de una temporada, listo para pintar en el Carné del hincha.
 * Se mide sobre RECUADROS (no sobre todos los partidos): un partido sin recuadro
 * derivado aún (`numeroRecuadro == null`) no cuenta para el total, respetando la
 * biyección Recuadro↔Partido (Req 4.1).
 */
export interface ProgresoTemporada {
  /** Láminas con Foto_Principal montada (recuadros MONTADOS). */
  readonly montadas: number;
  /** Total de recuadros de la temporada (partidos con recuadro derivado). */
  readonly total: number;
  /** Recuadros aún sin Foto_Principal (`total - montadas`, nunca negativo). */
  readonly faltantes: number;
  /**
   * Progreso en el rango [0, 1] (montadas / total). Es `0` cuando no hay
   * recuadros todavía, evitando divisiones por cero para el anillo de progreso.
   */
  readonly ratio: number;
  /** Porcentaje entero [0, 100] para etiquetas ("63%"). */
  readonly porcentaje: number;
}

/** Progreso vacío (sin recuadros aún): evita NaN en la UI. */
const PROGRESO_VACIO: ProgresoTemporada = {
  montadas: 0,
  total: 0,
  faltantes: 0,
  ratio: 0,
  porcentaje: 0,
};

/**
 * Deriva el progreso real de la temporada a partir de la lista de láminas del
 * backend. Solo cuenta partidos CON recuadro derivado (`numeroRecuadro != null`)
 * para el total, y como montados los que además tienen Foto_Principal
 * (`tieneFotoPrincipal`). No reimplementa reglas: solo agrega datos del backend.
 *
 * @param partidos láminas de la temporada (`GET /temporadas/:id/partidos`).
 * @returns el progreso listo para el anillo y la etiqueta "X de Y láminas".
 */
export function derivarProgresoTemporada(
  partidos: readonly PartidoLamina[],
): ProgresoTemporada {
  let montadas = 0;
  let total = 0;
  for (const p of partidos) {
    // Un partido sin recuadro derivado aún no es una lámina del álbum.
    if (p.numeroRecuadro == null) {
      continue;
    }
    total += 1;
    if (p.tieneFotoPrincipal) {
      montadas += 1;
    }
  }
  if (total === 0) {
    return PROGRESO_VACIO;
  }
  const ratio = montadas / total;
  return {
    montadas,
    total,
    faltantes: total - montadas,
    ratio,
    porcentaje: Math.round(ratio * 100),
  };
}

/**
 * Texto "X de Y láminas · temporada Z" para el Carné del hincha. Sin regañar por
 * lo que falta (las siluetas ya lo comunican): solo celebra el avance.
 *
 * @param progreso progreso derivado de la temporada.
 * @param temporadaExterna nombre externo de la temporada (p. ej. "2026"), o
 *   `null` si aún no se conoce (se omite el sufijo de temporada).
 */
export function etiquetaProgreso(
  progreso: ProgresoTemporada,
  temporadaExterna: string | null,
): string {
  const base = `${progreso.montadas} de ${progreso.total} láminas`;
  const temp = temporadaExterna?.trim();
  return temp ? `${base} · temporada ${temp}` : base;
}

// ---------------------------------------------------------------------------
// Feature 4 · Estantería del álbum agrupada por competición.
// ---------------------------------------------------------------------------

/**
 * Grupo de láminas de una misma competición, para pintar la estantería por
 * secciones (Liga / Copa nacional / Internacional). Conserva el orden por
 * número de recuadro y su propio progreso.
 */
export interface GrupoCompeticion {
  /** Tipo de competición del grupo (discriminador). */
  readonly tipo: TipoCompeticion;
  /** Título legible en español para el encabezado de la sección. */
  readonly titulo: string;
  /** Láminas del grupo, ordenadas ascendentemente por `numeroRecuadro`. */
  readonly laminas: readonly PartidoLamina[];
  /** Progreso del grupo (montadas/total dentro de la competición). */
  readonly progreso: ProgresoTemporada;
}

/** Orden de presentación de las competiciones en la estantería. */
const ORDEN_COMPETICION: readonly TipoCompeticion[] = [
  'LIGA',
  'COPA_NACIONAL',
  'INTERNACIONAL',
];

/** Título legible por tipo de competición (español). */
const TITULO_COMPETICION: Readonly<Record<TipoCompeticion, string>> = {
  LIGA: 'Liga',
  COPA_NACIONAL: 'Copa nacional',
  INTERNACIONAL: 'Internacional',
};

/**
 * Agrupa las láminas por competición para la estantería del álbum, en el orden
 * Liga → Copa nacional → Internacional. Dentro de cada grupo, ordena por número
 * de recuadro ascendente (numeración tolerante a huecos, Req 3). Solo incluye
 * partidos CON recuadro derivado (`numeroRecuadro != null`): son las láminas del
 * álbum. Los grupos vacíos se omiten.
 *
 * @param partidos láminas de la temporada (`GET /temporadas/:id/partidos`).
 * @returns grupos por competición, cada uno con sus láminas ordenadas y su
 *   progreso; en el orden de presentación fijo.
 */
export function agruparLaminasPorCompeticion(
  partidos: readonly PartidoLamina[],
): readonly GrupoCompeticion[] {
  const porTipo = new Map<TipoCompeticion, PartidoLamina[]>();
  for (const p of partidos) {
    if (p.numeroRecuadro == null) {
      continue; // aún no es una lámina del álbum.
    }
    const lista = porTipo.get(p.tipoCompeticion);
    if (lista) {
      lista.push(p);
    } else {
      porTipo.set(p.tipoCompeticion, [p]);
    }
  }

  const grupos: GrupoCompeticion[] = [];
  for (const tipo of ORDEN_COMPETICION) {
    const laminas = porTipo.get(tipo);
    if (!laminas || laminas.length === 0) {
      continue;
    }
    // Orden por número de recuadro ascendente; `numeroRecuadro` es no-nulo aquí.
    const ordenadas = [...laminas].sort(
      (a, b) => (a.numeroRecuadro ?? 0) - (b.numeroRecuadro ?? 0),
    );
    grupos.push({
      tipo,
      titulo: TITULO_COMPETICION[tipo],
      laminas: ordenadas,
      progreso: derivarProgresoTemporada(ordenadas),
    });
  }
  return grupos;
}

// ---------------------------------------------------------------------------
// Dashboard del Carné · Próximo partido, Actividad reciente y Estadísticas.
//
// Todo se deriva de la lista de láminas (`GET /temporadas/:id/partidos`), sin
// inventar datos. IMPORTANTE: `PartidoLamina` NO indica si el club jugó de local
// o visitante, por lo que NO se puede saber si ganó/empató/perdió; por eso NO se
// deriva una "racha" (sería inventar). Solo se exponen conteos verificables.
// ---------------------------------------------------------------------------

/** Compara por fecha ISO ascendente (para "próximo") y su inverso (recientes). */
function porFechaAsc(a: PartidoLamina, b: PartidoLamina): number {
  return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime();
}

/**
 * Próximo partido de la temporada: el `PROGRAMADO` más cercano por fecha. Si no
 * hay ninguno programado (temporada terminada o sin fixture futuro), devuelve
 * `null`. No inventa: solo elige de la lista real.
 */
export function proximoPartido(
  partidos: readonly PartidoLamina[],
): PartidoLamina | null {
  const programados = partidos
    .filter((p) => p.estado === 'PROGRAMADO')
    .sort(porFechaAsc);
  return programados[0] ?? null;
}

/**
 * Actividad reciente: los últimos `limite` partidos FINALIZADOS, del más
 * reciente al más antiguo. Cada uno trae lo necesario para pintar su fila
 * (rival, número de recuadro, marcador y estado de la lámina); los datos que el
 * backend no expone en la lista (local/visita, goleadores) se omiten.
 */
export function actividadReciente(
  partidos: readonly PartidoLamina[],
  limite = 3,
): readonly PartidoLamina[] {
  return partidos
    .filter((p) => p.estado === 'FINALIZADO')
    .sort((a, b) => -porFechaAsc(a, b))
    .slice(0, Math.max(0, limite));
}

/** Marcador "L - V" de un partido, o `null` si aún no hay resultado. */
export function marcadorTexto(partido: PartidoLamina): string | null {
  if (!partido.resultado) {
    return null;
  }
  return `${partido.resultado.golesLocal} - ${partido.resultado.golesVisita}`;
}

/**
 * Estadísticas verificables de la temporada, derivadas SOLO de datos reales.
 * No incluye racha ni victorias: `PartidoLamina` no dice si el club fue local o
 * visitante, así que el resultado no puede atribuirse al club sin inventar.
 */
export interface EstadisticasTemporada {
  /** Total de partidos oficiales de la temporada. */
  readonly totalPartidos: number;
  /** Partidos ya jugados (estado FINALIZADO). */
  readonly jugados: number;
  /** Partidos aún por jugar (estado PROGRAMADO). */
  readonly programados: number;
  /** Láminas montadas (con Foto_Principal). */
  readonly montadas: number;
  /** Total de recuadros de la temporada. */
  readonly totalRecuadros: number;
  /** Porcentaje de avance del álbum [0,100]. */
  readonly porcentajeAlbum: number;
}

/** Deriva las estadísticas verificables de la temporada. */
export function estadisticasTemporada(
  partidos: readonly PartidoLamina[],
): EstadisticasTemporada {
  let jugados = 0;
  let programados = 0;
  for (const p of partidos) {
    if (p.estado === 'FINALIZADO') {
      jugados += 1;
    } else if (p.estado === 'PROGRAMADO') {
      programados += 1;
    }
  }
  const progreso = derivarProgresoTemporada(partidos);
  return {
    totalPartidos: partidos.length,
    jugados,
    programados,
    montadas: progreso.montadas,
    totalRecuadros: progreso.total,
    porcentajeAlbum: progreso.porcentaje,
  };
}

// ---------------------------------------------------------------------------
// Presentación "Revisar mi temporada" · láminas montadas en secuencia.
// ---------------------------------------------------------------------------

/**
 * Láminas MONTADAS (con Foto_Principal) de la temporada, ordenadas por número de
 * recuadro ascendente, para la presentación en carrusel "Revisar mi temporada".
 * Solo incluye partidos con recuadro derivado (`numeroRecuadro != null`) y foto
 * principal (`tieneFotoPrincipal`): son los recuerdos ya coleccionados. No
 * inventa datos; la miniatura la aporta el preview del álbum por número.
 */
export function laminasMontadasEnSecuencia(
  partidos: readonly PartidoLamina[],
): readonly PartidoLamina[] {
  return partidos
    .filter((p) => p.numeroRecuadro != null && p.tieneFotoPrincipal)
    .sort((a, b) => (a.numeroRecuadro ?? 0) - (b.numeroRecuadro ?? 0));
}
