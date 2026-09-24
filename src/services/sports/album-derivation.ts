// Servicio_Datos_Deportivos — derivación y re-derivación del álbum desde el
// fixture oficial (`deriveAlbum`).
//
// La estructura del álbum se deriva del fixture oficial de la Temporada: existe
// **exactamente un Recuadro por cada Partido_Oficial** (liga/copa/internacional)
// y la correspondencia Partido↔Recuadro es biyectiva (Req 4.1, 4.3). Los
// partidos **amistosos se excluyen**: no generan Partido_Oficial ni Recuadro
// (Req 4.2). Cuando el fixture se actualiza (altas o bajas de partidos), la
// re-derivación mantiene la biyección: elimina los Recuadros de los partidos que
// ya no están, agrega Recuadros para los partidos nuevos y **conserva la
// Foto_Principal y el `numero`** de los partidos que persisten (Req 4.4).
//
// Este módulo NO consume la red ni sanea el fixture crudo (eso es `syncFixture`,
// Task 8.2) ni clasifica los partidos (eso es el Clasificador, Task 9.1):
// recibe entradas ya saneadas y clasificadas (con `tipoCompeticion`) y reconcilia
// la persistencia de `PartidoOficial` y `Recuadro` contra ese fixture vigente.
//
// Task 8.3 — Requirements: 4.1, 4.2, 4.3, 4.4

import type {
  EstadoPartido,
  ISODateTime,
  PartidoOficial,
  Recuadro,
  TipoCompeticion,
  UUID,
} from '../../domain/types.js';
import type {
  AlbumRepository,
  PartidoOficialRepository,
  PlantillaAlbumRepository,
  RecuadroRepository,
} from '../../persistence/repositories.js';

/**
 * Entrada del fixture vigente lista para derivar el álbum. Representa un partido
 * ya saneado (Task 8.2) y clasificado (Task 9.1), identificado de forma estable
 * por su `partidoExternoId` dentro de la Temporada.
 *
 * El campo opcional `esAmistoso` permite excluir explícitamente cualquier
 * partido marcado como amistoso por la fuente, incluso si por error llegara con
 * un `tipoCompeticion` oficial. Los amistosos nunca generan Recuadro (Req 4.2).
 */
export interface FixtureEntry {
  /** Identificador externo del partido (clave estable dentro de la Temporada). */
  readonly partidoExternoId: string;
  /** Competición reportada por la API. */
  readonly competicion: string;
  /** Clasificación de la competición (excluye amistosos por construcción). */
  readonly tipoCompeticion: TipoCompeticion;
  /** Rival reportado por la API. */
  readonly rival: string;
  /** Fecha/hora ISO 8601 del partido; ordena la numeración de Recuadros. */
  readonly fechaHora: ISODateTime;
  /** Estado del partido. */
  readonly estado: EstadoPartido;
  /** Si es `true`, el partido es amistoso y se excluye de la derivación (Req 4.2). */
  readonly esAmistoso?: boolean;
}

/** Generador de UUID inyectable para las entidades nuevas. */
export type IdGenerator = () => UUID;

/** Dependencias inyectadas de la derivación del álbum. */
export interface DeriveAlbumDeps {
  /** Álbum por Temporada (se crea si aún no existe). */
  readonly albumes: AlbumRepository;
  /** Partidos oficiales de la Temporada (se reconcilian contra el fixture). */
  readonly partidos: PartidoOficialRepository;
  /** Recuadros del álbum (biyección con los partidos). */
  readonly recuadros: RecuadroRepository;
  /** Plantillas del Club (aportan las dimensiones físicas del Recuadro — Req 19.1). */
  readonly plantillas: PlantillaAlbumRepository;
  /** Generador de ids; por defecto `crypto.randomUUID`. */
  readonly newId?: IdGenerator;
}

/** Resumen del efecto de una derivación/re-derivación (para diagnóstico). */
export interface DeriveAlbumResult {
  /** Álbum de la Temporada (existente o recién creado). */
  readonly albumId: UUID;
  /** Recuadros resultantes tras la reconciliación (uno por Partido_Oficial). */
  readonly recuadros: readonly Recuadro[];
  /** Cantidad de partidos oficiales creados en esta derivación. */
  readonly partidosCreados: number;
  /** Cantidad de partidos (y sus recuadros) eliminados por baja del fixture. */
  readonly partidosEliminados: number;
  /** Cantidad de amistosos excluidos de la entrada. */
  readonly amistososExcluidos: number;
}

/** Conjunto de competiciones consideradas oficiales (excluye amistosos — Req 4.2). */
const TIPOS_OFICIALES: ReadonlySet<TipoCompeticion> = new Set<TipoCompeticion>([
  'LIGA',
  'COPA_NACIONAL',
  'INTERNACIONAL',
]);

/** ¿La entrada corresponde a un Partido_Oficial (no amistoso)? (Req 4.2) */
function esOficial(entry: FixtureEntry): boolean {
  return entry.esAmistoso !== true && TIPOS_OFICIALES.has(entry.tipoCompeticion);
}

/**
 * Orden determinista de las entradas del fixture: por `fechaHora` ascendente y,
 * para instantes iguales, por `partidoExternoId`. Fija una numeración estable y
 * reproducible de los Recuadros a partir del mismo fixture.
 */
function ordenarFixture(entries: readonly FixtureEntry[]): FixtureEntry[] {
  return [...entries].sort((a, b) => {
    const ta = Date.parse(a.fechaHora);
    const tb = Date.parse(b.fechaHora);
    if (ta !== tb) {
      return ta - tb;
    }
    return a.partidoExternoId < b.partidoExternoId
      ? -1
      : a.partidoExternoId > b.partidoExternoId
        ? 1
        : 0;
  });
}

/**
 * Deriva (o re-deriva) el álbum de una Temporada a partir de su fixture oficial
 * vigente, garantizando exactamente un Recuadro por Partido_Oficial.
 *
 * Comportamiento:
 *   - **Exclusión de amistosos** (Req 4.2): las entradas amistosas (o con
 *     `tipoCompeticion` no oficial) se descartan y no generan Partido_Oficial ni
 *     Recuadro.
 *   - **Derivación inicial** (Req 4.1, 4.3): por cada entrada oficial se crea un
 *     `PartidoOficial` (si no existe) y su Recuadro, de modo que
 *     `#Recuadros === #Partidos_Oficiales` y la correspondencia es biyectiva.
 *   - **Re-derivación tras cambios** (Req 4.4): los partidos que ya no están en
 *     el fixture se eliminan junto con su Recuadro; los partidos nuevos se
 *     agregan con su Recuadro; los partidos que **persisten conservan su
 *     `fotoPrincipalId` y su `numero`** (numeración estable), y sus datos del
 *     partido se actualizan con los del fixture vigente.
 *
 * La numeración de los Recuadros nuevos se asigna de forma determinista por el
 * orden (`fechaHora`, `partidoExternoId`) del fixture, sin renumerar los
 * Recuadros que ya existían (estabilidad de `numero`).
 *
 * Requiere que exista al menos una `Plantilla_Album` del Club para dimensionar
 * los Recuadros nuevos (Req 19.1); se usa la primera plantilla registrada.
 *
 * @param temporadaId Temporada cuyo álbum se deriva.
 * @param clubId Club de la Temporada (resuelve la plantilla de dimensiones).
 * @param fixture Fixture oficial vigente (entradas saneadas y clasificadas).
 * @param deps Repositorios inyectados y generador de ids opcional.
 */
export async function deriveAlbum(
  temporadaId: UUID,
  clubId: UUID,
  fixture: readonly FixtureEntry[],
  deps: DeriveAlbumDeps,
): Promise<DeriveAlbumResult> {
  const { albumes, partidos, recuadros, plantillas } = deps;
  const newId: IdGenerator = deps.newId ?? ((): UUID => crypto.randomUUID());

  // 1. Excluir amistosos y ordenar de forma determinista (Req 4.2).
  const oficialesOrdenados = ordenarFixture(fixture.filter(esOficial));
  const amistososExcluidos = fixture.length - oficialesOrdenados.length;

  // Deduplicar por `partidoExternoId` (clave estable en la Temporada),
  // conservando la primera aparición en el orden determinista.
  const entradasPorExternoId = new Map<string, FixtureEntry>();
  for (const entry of oficialesOrdenados) {
    if (!entradasPorExternoId.has(entry.partidoExternoId)) {
      entradasPorExternoId.set(entry.partidoExternoId, entry);
    }
  }

  // 2. Asegurar el Álbum de la Temporada.
  let album = await albumes.findByTemporadaId(temporadaId);
  if (album === null) {
    album = await albumes.create({ id: newId(), temporadaId });
  }
  const albumId = album.id;

  // 3. Resolver la plantilla de dimensiones del Club (Req 19.1).
  const plantillasClub = await plantillas.findByClubId(clubId);
  const plantilla = plantillasClub[0];
  if (plantilla === undefined) {
    throw new Error(
      `No hay Plantilla_Album para el Club ${clubId}: no se pueden dimensionar los Recuadros.`,
    );
  }

  // 4. Estado persistido actual de la Temporada/álbum.
  const partidosActuales = await partidos.findByTemporadaId(temporadaId);
  const partidosPorExternoId = new Map<string, PartidoOficial>(
    partidosActuales.map((p) => [p.partidoExternoId, p]),
  );
  const recuadrosActuales = await recuadros.findByAlbumId(albumId);
  const recuadroPorPartidoId = new Map<UUID, Recuadro>(
    recuadrosActuales.map((r) => [r.partidoOficialId, r]),
  );

  const externoIdsVigentes = new Set(entradasPorExternoId.keys());

  // 5. Baja de partidos que ya no están en el fixture (y su Recuadro) (Req 4.4).
  let partidosEliminados = 0;
  for (const partido of partidosActuales) {
    if (externoIdsVigentes.has(partido.partidoExternoId)) {
      continue;
    }
    const recuadro = recuadroPorPartidoId.get(partido.id);
    if (recuadro !== undefined) {
      await recuadros.delete(recuadro.id);
    }
    await partidos.delete(partido.id);
    partidosEliminados += 1;
  }

  // 6. Numeración estable: conservar el `numero` de los Recuadros persistentes y
  //    asignar los siguientes números libres a los Recuadros nuevos.
  const numerosUsados = new Set<number>();
  for (const partido of partidosActuales) {
    if (!externoIdsVigentes.has(partido.partidoExternoId)) {
      continue;
    }
    const recuadro = recuadroPorPartidoId.get(partido.id);
    if (recuadro !== undefined) {
      numerosUsados.add(recuadro.numero);
    }
  }
  let siguienteNumero = 1;
  const proximoNumeroLibre = (): number => {
    while (numerosUsados.has(siguienteNumero)) {
      siguienteNumero += 1;
    }
    numerosUsados.add(siguienteNumero);
    return siguienteNumero;
  };

  // 7. Alta/actualización por cada entrada oficial vigente, en orden determinista.
  let partidosCreados = 0;
  const resultado: Recuadro[] = [];

  for (const entry of entradasPorExternoId.values()) {
    const existente = partidosPorExternoId.get(entry.partidoExternoId);

    if (existente === undefined) {
      // Alta: nuevo Partido_Oficial + su Recuadro (Foto_Principal aún vacía).
      const nuevoPartido: PartidoOficial = {
        id: newId(),
        temporadaId,
        partidoExternoId: entry.partidoExternoId,
        competicion: entry.competicion,
        tipoCompeticion: entry.tipoCompeticion,
        rival: entry.rival,
        fechaHora: entry.fechaHora,
        estado: entry.estado,
        esClasico: false,
        esInternacional: entry.tipoCompeticion === 'INTERNACIONAL',
        resultado: null,
        alineacion: [],
        eventos: [],
      };
      await partidos.create(nuevoPartido);
      partidosCreados += 1;

      const nuevoRecuadro: Recuadro = {
        id: newId(),
        albumId,
        partidoOficialId: nuevoPartido.id,
        plantillaId: plantilla.id,
        numero: proximoNumeroLibre(),
        anchoMm: plantilla.recuadroAnchoMm,
        altoMm: plantilla.recuadroAltoMm,
        fotoPrincipalId: null,
        estadoRecordatorio: 'ACTIVO',
      };
      await recuadros.create(nuevoRecuadro);
      resultado.push(nuevoRecuadro);
      continue;
    }

    // Persiste: actualizar datos del partido desde el fixture vigente, pero
    // conservar el Recuadro (su `numero` y su `fotoPrincipalId`) (Req 4.4).
    await partidos.update(existente.id, {
      competicion: entry.competicion,
      tipoCompeticion: entry.tipoCompeticion,
      rival: entry.rival,
      fechaHora: entry.fechaHora,
      estado: entry.estado,
    });

    let recuadro = recuadroPorPartidoId.get(existente.id);
    if (recuadro === undefined) {
      // Invariante de biyección rota (p. ej. datos previos incompletos): crear
      // el Recuadro faltante para restaurar exactamente uno por partido.
      recuadro = {
        id: newId(),
        albumId,
        partidoOficialId: existente.id,
        plantillaId: plantilla.id,
        numero: proximoNumeroLibre(),
        anchoMm: plantilla.recuadroAnchoMm,
        altoMm: plantilla.recuadroAltoMm,
        fotoPrincipalId: null,
        estadoRecordatorio: 'ACTIVO',
      };
      await recuadros.create(recuadro);
    }
    resultado.push(recuadro);
  }

  return {
    albumId,
    recuadros: resultado,
    partidosCreados,
    partidosEliminados,
    amistososExcluidos,
  };
}
