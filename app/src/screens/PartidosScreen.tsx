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

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { ProfilePresenter, type PartidosState } from '../profile';
import type { PartidoLamina, ProfileClient } from '../adapters';
import { Hero, LaminaIcon, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

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

/** Orden de aparición de las competiciones: Liga → Copa nacional → Internacional. */
const ORDEN_TIPO: Record<PartidoLamina['tipoCompeticion'], number> = {
  LIGA: 0,
  COPA_NACIONAL: 1,
  INTERNACIONAL: 2,
};

/** Compara dos partidos por fecha ascendente (jornada 1 → x). */
function porFechaAsc(a: PartidoLamina, b: PartidoLamina): number {
  return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime();
}

/**
 * Agrupa los partidos por competición, ordena las competiciones (Liga, Copa
 * nacional, Internacional y luego el resto) y, dentro de cada una, ordena los
 * partidos por fecha ascendente (de la primera jornada a la última). Los
 * partidos sin competición conocida caen en "Otros".
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
    .map(([title, data]) => ({
      title,
      tipo: tipoPorClave.get(title) ?? null,
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

  useEffect(() => {
    const unsubscribe = pres.subscribePartidos(setState);
    void pres.loadPartidos(temporadaId);
    return unsubscribe;
  }, [pres, temporadaId]);

  const sections = useMemo(
    () => agruparPorCompeticion(state.partidos),
    [state.partidos],
  );

  const renderItem = ({
    item,
    index,
  }: ListRenderItemInfo<PartidoLamina>): React.ReactElement => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tomar foto del partido contra ${item.rival}`}
      onPress={() => onTomarFoto?.(item.partidoId)}
      style={styles.fila}
    >
      {/* Número de FECHA (posición dentro de la competición). */}
      <View style={styles.fechaBox} accessibilityLabel={`Fecha ${index + 1}`}>
        <Text style={styles.fechaNumero}>{index + 1}</Text>
      </View>

      {/* Info del partido */}
      <View style={styles.info}>
        <Text style={styles.rival} numberOfLines={1}>
          vs {item.rival}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {fechaCorta(item.fechaHora)} · {marcador(item)}
        </Text>
      </View>

      {/* Estado de la lámina: montada (estrella dorada) o falta ("?" rojo). */}
      <LaminaIcon glyph={item.tieneFotoPrincipal ? 'star' : 'question'} size={30} />
    </Pressable>
  );

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
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>{iconoCompeticion(section.tipo)}</Text>
              <Text style={styles.sectionTitle} numberOfLines={1}>
                {section.title}
              </Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
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
  // Número de FECHA (posición dentro de la competición) en una cajita.
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
