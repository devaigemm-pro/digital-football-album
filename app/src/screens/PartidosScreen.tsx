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
  FlatList,
  Pressable,
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

/**
 * Ordena los partidos por FECHA ascendente (primer partido de la temporada →
 * último), SIN agrupar por competición. La lista es una secuencia única 1→X por
 * fecha, consistente con el `numeroRecuadro` global del álbum (preferencia del
 * usuario 2026-09-27: numerar las láminas por fecha, independiente del torneo).
 * Para fechas iguales, desempata por `numeroRecuadro` (orden del álbum).
 */
function ordenarPorFecha(partidos: readonly PartidoLamina[]): PartidoLamina[] {
  return [...partidos].sort((a, b) => {
    const ta = new Date(a.fechaHora).getTime();
    const tb = new Date(b.fechaHora).getTime();
    if (ta !== tb) {
      return ta - tb;
    }
    return (a.numeroRecuadro ?? 0) - (b.numeroRecuadro ?? 0);
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

  const partidosOrdenados = useMemo(
    () => ordenarPorFecha(state.partidos),
    [state.partidos],
  );

  const renderItem = ({
    item,
  }: ListRenderItemInfo<PartidoLamina>): React.ReactElement => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tomar foto del partido contra ${item.rival}`}
      onPress={() => onTomarFoto?.(item.partidoId)}
      style={styles.fila}
    >
      {/* Número GLOBAL de la lámina (numeroRecuadro), 1→X por fecha,
          independiente del torneo. "—" si aún no tiene recuadro derivado. */}
      <View
        style={styles.fechaBox}
        accessibilityLabel={`Lámina ${item.numeroRecuadro ?? 'sin número'}`}
      >
        <Text style={styles.fechaNumero}>{item.numeroRecuadro ?? '—'}</Text>
      </View>

      {/* Info del partido: rival, competición, fecha y resultado. */}
      <View style={styles.info}>
        <Text style={styles.rival} numberOfLines={1}>
          vs {item.rival}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.competicion} · {fechaCorta(item.fechaHora)} · {marcador(item)}
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

        <FlatList
          data={partidosOrdenados}
          keyExtractor={(item) => item.partidoId}
          renderItem={renderItem}
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
