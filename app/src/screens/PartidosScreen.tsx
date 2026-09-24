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
import { Badge, Hero, Screen } from '../ui/kit';
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

  const renderItem = ({ item }: ListRenderItemInfo<PartidoLamina>): React.ReactElement => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tomar foto del partido contra ${item.rival}`}
      onPress={() => onTomarFoto?.(item.partidoId)}
      style={styles.fila}
    >
      {/* Número de recuadro/sticker */}
      <View style={styles.numeroBox}>
        <Text style={styles.numero}>
          {item.numeroRecuadro != null ? item.numeroRecuadro : '—'}
        </Text>
      </View>

      {/* Info del partido */}
      <View style={styles.info}>
        <Text style={styles.rival} numberOfLines={1}>
          vs {item.rival}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {fechaCorta(item.fechaHora)} · {item.competicion} · {marcador(item)}
        </Text>
      </View>

      {/* Estado de la lámina */}
      {item.tieneFotoPrincipal ? (
        <Badge label="Montada" tone="accent" />
      ) : (
        <Badge label="Falta" tone="muted" />
      )}
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
          data={state.partidos}
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
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  numeroBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numero: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
  },
  info: { flex: 1 },
  rival: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.bold },
  meta: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginTop: 2 },
  errorBox: { marginBottom: spacing.md },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  vacio: {
    color: palette.textMutedOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 22,
  },
});

export default PartidosScreen;
