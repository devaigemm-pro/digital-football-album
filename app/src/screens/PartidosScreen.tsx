// PartidosScreen — lista de partidos (láminas) de la temporada.
//
// Consume `GET /temporadas/:temporadaId/partidos` vía el `ProfilePresenter`
// (TypeScript puro, unit-testado) y muestra cada partido como una fila de
// "lámina": número de recuadro, rival, fecha, resultado y si ya tiene foto
// principal. Al tocar un partido, navega a la captura con su `partidoId` (Req 3:
// tomar la foto por partido). Pantalla DELGADA (sin lógica sensible).
//
// IMPORTANTE (entorno actual): `.tsx` EXCLUIDO del typecheck (RN no instalado en
// este entorno). Código real para cuando se instale el toolchain del cliente.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import Svg, { Path as SvgPath, Rect as SvgRect, Line as SvgLine } from 'react-native-svg';

import { ProfilePresenter, type PartidosState } from '../profile';
import type { PartidoLamina, ProfileClient } from '../adapters';
import { Hero, LaminaIcon, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

/**
 * Ícono de "próximo partido": un calendario con una flecha verde apuntando a la
 * derecha en el centro. Dibujado con SVG (nítido en cualquier densidad).
 */
function IconoCalendarioProximo({ size = 30 }: { readonly size?: number }): React.ReactElement {
  const verde = palette.success;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Partido próximo">
      {/* Cuerpo del calendario */}
      <SvgRect x={3} y={4.5} width={18} height={16} rx={2.5} stroke={verde} strokeWidth={1.8} fill="none" />
      {/* Anillas superiores */}
      <SvgLine x1={8} y1={2.5} x2={8} y2={6} stroke={verde} strokeWidth={1.8} strokeLinecap="round" />
      <SvgLine x1={16} y1={2.5} x2={16} y2={6} stroke={verde} strokeWidth={1.8} strokeLinecap="round" />
      {/* Línea de cabecera del calendario */}
      <SvgLine x1={3} y1={8.5} x2={21} y2={8.5} stroke={verde} strokeWidth={1.5} />
      {/* Flecha hacia la derecha en el centro */}
      <SvgPath
        d="M9 14.5 H15 M12.5 12 L15.5 14.5 L12.5 17"
        stroke={verde}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export interface PartidosScreenProps {
  /** Temporada cuyos partidos se listan (viene del perfil / navegación). */
  readonly temporadaId: string;
  /** Cliente de perfil/partidos (`GET /temporadas/:id/partidos`). */
  readonly client: ProfileClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: ProfilePresenter;
  /** Navega a la captura de fotos del partido indicado (Req 3). */
  readonly onTomarFoto?: (partidoId: string) => void;
}

/** Formatea la fecha ISO a algo legible corto (dd/mm). */
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {return '';}
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/** Marcador si el partido está finalizado, o el estado en otro caso. */
function marcador(p: PartidoLamina): string {
  if (p.resultado) {
    return `${p.resultado.golesLocal} - ${p.resultado.golesVisita}`;
  }
  return p.estado === 'PROGRAMADO' ? 'Próximo' : p.estado;
}

/** Sección de la lista: una competición con sus partidos ordenados por fecha. */
interface PartidosSection {
  readonly title: string;
  /** Tipo de competición del grupo (para elegir el ícono del encabezado). */
  readonly tipo: PartidoLamina['tipoCompeticion'] | null;
  readonly data: readonly PartidoLamina[];
}

/**
 * Ícono representativo de la competición. El backend no expone el logo de la
 * competición, así que usamos un emblema por tipo (honesto, sin inventar un
 * logo). Liga 🏆, Copa nacional 🏅, Internacional 🌎.
 */
function iconoCompeticion(tipo: PartidoLamina['tipoCompeticion'] | null): string {
  switch (tipo) {
    case 'LIGA':
      return '🏆';
    case 'COPA_NACIONAL':
      return '🏅';
    case 'INTERNACIONAL':
      return '🌎';
    default:
      return '⚽';
  }
}

/**
 * Traduce al español los nombres de competición que API-Football entrega en
 * inglés (p. ej. "Friendlies Clubs"). Si no hay traducción conocida, devuelve el
 * nombre original (muchas competiciones chilenas ya vienen en español, como
 * "Primera División" o "Copa Chile"). Comparación tolerante a mayúsculas.
 */
function competicionEsEspañol(nombre: string): string {
  const limpio = nombre.trim();
  const traducciones: Record<string, string> = {
    'friendlies clubs': 'Amistosos de clubes',
    'friendlies': 'Amistosos',
    'club friendlies': 'Amistosos de clubes',
    'super cup': 'Supercopa',
    'copa de la liga': 'Copa de la Liga',
    'serie rio de la plata': 'Serie Río de la Plata',
    'primera division': 'Primera División',
    'conmebol libertadores': 'Copa Libertadores',
    'conmebol sudamericana': 'Copa Sudamericana',
    'uefa champions league': 'Liga de Campeones',
  };
  return traducciones[limpio.toLowerCase()] ?? limpio;
}

/** Orden de aparición de las competiciones: Liga → Copa nacional → Internacional. */
const ORDEN_TIPO: Record<PartidoLamina['tipoCompeticion'], number> = {
  LIGA: 0,
  COPA_NACIONAL: 1,
  INTERNACIONAL: 2,
};

/** Compara dos partidos por fecha ascendente (de la primera jornada a la última). */
function porFechaAsc(a: PartidoLamina, b: PartidoLamina): number {
  return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime();
}

/**
 * Agrupa los partidos POR COMPETICIÓN (cada torneo con sus partidos), ordena las
 * competiciones (Liga → Copa nacional → Internacional → resto) y, dentro de cada
 * una, ordena por fecha ascendente. Los partidos sin competición conocida caen
 * en "Otros".
 *
 * IMPORTANTE: la agrupación es solo de PRESENTACIÓN; el número que se muestra en
 * cada fila es el `numeroRecuadro` GLOBAL del álbum (1→X por fecha, único por
 * temporada), NO un índice local por sección. Así se conserva la segmentación
 * por torneo sin romper la numeración global.
 */
function agruparPorCompeticion(partidos: readonly PartidoLamina[]): PartidosSection[] {
  const grupos = new Map<string, PartidoLamina[]>();
  const tipoPorClave = new Map<string, PartidoLamina['tipoCompeticion'] | null>();

  for (const p of partidos) {
    const clave = p.competicion?.trim() ? p.competicion : 'Otros';
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = [];
      grupos.set(clave, grupo);
      tipoPorClave.set(clave, p.tipoCompeticion ?? null);
    }
    grupo.push(p);
  }

  return [...grupos.entries()]
    .map(([clave, data]) => ({
      // Título en español (traduce los nombres en inglés de la API).
      title: clave === 'Otros' ? 'Otros' : competicionEsEspañol(clave),
      tipo: tipoPorClave.get(clave) ?? null,
      data: [...data].sort(porFechaAsc),
    }))
    .sort((a, b) => {
      const ra = a.tipo ? ORDEN_TIPO[a.tipo] : 99;
      const rb = b.tipo ? ORDEN_TIPO[b.tipo] : 99;
      if (ra !== rb) {
        return ra - rb;
      }
      return a.title.localeCompare(b.title);
    });
}

/**
 * Pantalla de lista de partidos/láminas. Carga los partidos de la temporada al
 * montar (no bloqueante) y permite tocar uno para tomar su foto.
 */
export function PartidosScreen({
  temporadaId,
  client,
  presenter,
  onTomarFoto,
}: PartidosScreenProps): React.ReactElement {
  const pres = useMemo(() => presenter ?? new ProfilePresenter(client), [presenter, client]);
  const [state, setState] = useState<PartidosState>(() => pres.getPartidosState());
  // Secciones contraídas (por su título). Al colapsar, la sección muestra solo
  // su encabezado; sus filas se ocultan.
  const [colapsadas, setColapsadas] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const unsubscribe = pres.subscribePartidos(setState);
    void pres.loadPartidos(temporadaId);
    return unsubscribe;
  }, [pres, temporadaId]);

  const toggleSeccion = useCallback((titulo: string) => {
    setColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(titulo)) {
        next.delete(titulo);
      } else {
        next.add(titulo);
      }
      return next;
    });
  }, []);

  const sectionsBase = useMemo(
    () => agruparPorCompeticion(state.partidos),
    [state.partidos],
  );
  // Para SectionList: si una sección está colapsada, se le pasa `data` vacío
  // (el encabezado sigue visible y tocable). `total` conserva el conteo real.
  const sections = useMemo(
    () =>
      sectionsBase.map((s) => ({
        ...s,
        total: s.data.length,
        data: colapsadas.has(s.title) ? [] : s.data,
      })),
    [sectionsBase, colapsadas],
  );

  const renderItem = ({
    item,
  }: ListRenderItemInfo<PartidoLamina>): React.ReactElement => {
    const esProximo = item.estado === 'PROGRAMADO';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${esProximo ? 'Próximo partido' : 'Partido'} contra ${item.rival}`}
        onPress={() => onTomarFoto?.(item.partidoId)}
        style={styles.fila}
      >
        {/* Cajita de la lámina: SIEMPRE muestra el numeroRecuadro GLOBAL
            (1→X por fecha), también para los partidos próximos. */}
        <View
          style={styles.fechaBox}
          accessibilityLabel={`Lámina ${item.numeroRecuadro ?? 'sin número'}`}
        >
          <Text style={styles.fechaNumero}>{item.numeroRecuadro ?? '—'}</Text>
        </View>

        {/* Info del partido: rival, fecha y resultado (la competición va en el
            encabezado de la sección). */}
        <View style={styles.info}>
          <Text style={styles.rival} numberOfLines={1}>
            vs {item.rival}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {fechaCorta(item.fechaHora)} · {marcador(item)}
          </Text>
        </View>

        {/* Próximo: calendario con flecha verde a la derecha. Jugado: estado de
            la lámina (estrella dorada montada / "?" rojo si falta). */}
        {esProximo ? (
          <IconoCalendarioProximo size={30} />
        ) : (
          <LaminaIcon glyph={item.tieneFotoPrincipal ? 'star' : 'question'} size={30} />
        )}
      </Pressable>
    );
  };

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Temporada 2026" title="Tus partidos">
        {state.status === 'loading' ? (
          <ActivityIndicator
            color={palette.textOnDark}
            accessibilityLabel="Cargando partidos"
            style={styles.heroSpinner}
          />
        ) : null}
      </Hero>

      <View style={styles.body}>
        {state.status === 'error' && state.error !== null ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{state.error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar cargar los partidos"
              onPress={() => {
                void pres.loadPartidos(temporadaId);
              }}
            >
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.partidoId}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => {
            const colapsada = colapsadas.has(section.title);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${colapsada ? 'Expandir' : 'Contraer'} ${section.title}`}
                accessibilityState={{ expanded: !colapsada }}
                onPress={() => toggleSeccion(section.title)}
                style={styles.sectionHeader}
              >
                <Text style={styles.sectionIcon}>{iconoCompeticion(section.tipo)}</Text>
                <Text style={styles.sectionTitle} numberOfLines={1}>
                  {section.title}
                </Text>
                <Text style={styles.sectionCount}>{section.total}</Text>
                {/* Chevron: ▾ expandida, ▸ contraída. */}
                <Text style={styles.sectionChevron}>{colapsada ? '▸' : '▾'}</Text>
              </Pressable>
            );
          }}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            state.status === 'loaded' ? (
              <Text style={styles.vacio}>
                Aún no hay partidos en tu temporada. Aparecerán cuando se sincronice el
                fixture oficial.
              </Text>
            ) : null
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroSpinner: { alignSelf: 'flex-start', marginTop: spacing.sm },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  list: { paddingBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: {
    flex: 1,
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
  // Chevron de contraer/expandir la sección.
  sectionChevron: {
    color: palette.textMutedOnDark,
    fontSize: fontSize.body,
    marginLeft: spacing.xs,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // Número GLOBAL de la lámina (numeroRecuadro) en una cajita.
  fechaBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fechaNumero: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
  },
  info: { flex: 1 },
  rival: { color: palette.textOnDark, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.bold },
  meta: { color: palette.textMutedOnDark, fontFamily: fonts.body, fontSize: fontSize.small, marginTop: 2 },
  errorBox: { marginBottom: spacing.md },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  vacio: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 22,
  },
});

export default PartidosScreen;
