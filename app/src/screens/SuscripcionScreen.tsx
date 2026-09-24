// SuscripcionScreen — pantalla de suscripción (compra y upgrade vía IAP).
//
// Task 30.1 — Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6
// (backend Req 3.1/3.2/3.3/3.4 — Servicio_Suscripción `GET /subscription`,
//  `POST /subscription/purchase`, `POST /subscription/upgrade`,
//  `GET /entitlements`).
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO
// están instaladas en este entorno, por lo que este archivo `.tsx` está
// EXCLUIDO del typecheck de `app/tsconfig.json` (ver "exclude"). Es código real,
// listo para compilar cuando se instale el toolchain RN/React; hasta entonces no
// participa en `tsc --noEmit`.
//
// Este componente es intencionadamente DELGADO: NO contiene lógica sensible a la
// corrección. Toda la lógica (consumir `GET /subscription`, ejecutar el flujo
// IAP y enviar el comprobante en `POST /subscription/purchase` / `.../upgrade`,
// reflejar `GET /entitlements` SIN recalcular derechos, y conservar el estado
// previo ante errores) vive en `SubscriptionPresenter` (TypeScript puro,
// unit-testado en `subscription/subscription-presenter.test.ts`). Aquí solo se
// enlaza ese presentador a React y se pinta:
//   - el plan actual, su estado y la vigencia (Req 25.1);
//   - los Entitlements devueltos por el Sistema (Req 25.4, 25.5);
//   - el catálogo de planes con botones de compra/upgrade (Req 25.2, 25.3);
//   - el mensaje de error devuelto por el Sistema conservando el estado (Req 25.6).

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

import {
  SubscriptionPresenter,
  type IapPurchaser,
  type PlanCatalogoEntrada,
  type SubscriptionClient,
  type SubscriptionState,
} from '../subscription';
import { Badge, Hero, PrimaryButton, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface SuscripcionScreenProps {
  /** Adaptador HTTP de `SubscriptionClient` (endpoints del Servicio_Suscripción). */
  readonly client: SubscriptionClient;
  /** Adaptador nativo de compra dentro de la app (StoreKit / BillingClient). */
  readonly iap: IapPurchaser;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: SubscriptionPresenter;
}

/** Formatea el precio anual con su moneda para el catálogo (Req 25.1). */
function formatPrecio(entry: PlanCatalogoEntrada): string {
  return `${entry.precioAnual.toFixed(2)} ${entry.moneda} / año`;
}

/**
 * Pantalla de suscripción. Enlaza el `SubscriptionPresenter` al árbol de React y
 * re-renderiza cuando su estado cambia. Delega toda la lógica al presentador.
 */
export function SuscripcionScreen({
  client,
  iap,
  presenter,
}: SuscripcionScreenProps): React.ReactElement {
  const pres = useMemo(
    () => presenter ?? new SubscriptionPresenter(client, iap),
    [presenter, client, iap],
  );

  const [state, setState] = useState<SubscriptionState>(() => pres.getState());

  useEffect(() => {
    // `subscribe` emite el estado actual de inmediato y en cada cambio.
    const unsubscribe = pres.subscribe(setState);
    // Dispara la carga inicial (no bloqueante): plan + catálogo + entitlements.
    void pres.load();
    return unsubscribe;
  }, [pres]);

  const planActual = state.suscripcion?.plan ?? null;
  const puedeUpgrade = planActual === 'BASICO';

  const renderPlan = ({
    item,
  }: ListRenderItemInfo<PlanCatalogoEntrada>): React.ReactElement => {
    const esActual = item.plan === planActual;
    const esPremium = item.plan === 'PREMIUM';
    return (
      <View style={[styles.planCard, esPremium ? styles.planCardPremium : null]}>
        {esPremium ? <Badge label="Recomendado" tone="gold" style={styles.planBadge} /> : null}
        <View style={styles.planInfo}>
          <Text style={styles.planNombre}>{item.plan}</Text>
          <Text style={styles.planPrecio}>{formatPrecio(item)}</Text>
          <Text style={styles.planDescripcion}>{item.descripcion}</Text>
        </View>
        {esActual ? (
          <Text style={styles.planActualBadge}>Tu plan actual</Text>
        ) : (
          <PrimaryButton
            title="Comprar"
            accessibilityLabel={`Comprar plan ${item.plan}`}
            disabled={state.operando}
            onPress={() => {
              void pres.purchase(item.plan);
            }}
          />
        )}
      </View>
    );
  };

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Suscripción" title="Elige tu kit">
        {state.status === 'loading' || state.operando ? (
          <ActivityIndicator
            color={palette.textOnDark}
            accessibilityLabel="Procesando"
            style={styles.heroSpinner}
          />
        ) : null}
      </Hero>

      <View style={styles.body}>
      {/* Plan actual, estado y vigencia reflejados del Sistema (Req 25.1). */}
      <View style={styles.estadoBox}>
        {state.suscripcion !== null ? (
          <>
            <Text style={styles.estadoLinea}>
              Plan: {state.suscripcion.plan}
            </Text>
            <Text style={styles.estadoLinea}>
              Estado: {state.suscripcion.estado}
            </Text>
            <Text style={styles.estadoLinea}>
              Vigente hasta: {state.suscripcion.vigenciaHasta}
            </Text>
          </>
        ) : (
          <Text style={styles.estadoLinea}>
            Aún no tienes una suscripción activa.
          </Text>
        )}
      </View>

      {/* Entitlements devueltos por el Sistema, reflejados sin recalcular (Req 25.4, 25.5). */}
      {state.entitlements !== null ? (
        <View style={styles.entitlementsBox}>
          <Text style={styles.entitlementsTitulo}>Tus derechos</Text>
          <Text style={styles.estadoLinea}>
            Digital Cards internacionales:{' '}
            {state.entitlements.digitalCardsInternacional ? 'Sí' : 'No'}
          </Text>
          <Text style={styles.estadoLinea}>
            Efecto holograma: {state.entitlements.holograma ? 'Sí' : 'No'}
          </Text>
        </View>
      ) : null}

      {/* Botón de upgrade a Premium cuando el plan actual es Básico (Req 25.3). */}
      {puedeUpgrade ? (
        <PrimaryButton
          title="Actualizar a Premium"
          accessibilityLabel="Actualizar a Plan Premium"
          disabled={state.operando}
          onPress={() => {
            void pres.upgrade();
          }}
          style={styles.upgrade}
        />
      ) : null}

      {/* Mensaje de error del Sistema; el estado mostrado se conserva (Req 25.6). */}
      {state.error !== null ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar la suscripción"
            onPress={() => {
              void pres.load();
            }}
          >
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Catálogo de planes disponibles (Req 25.1). */}
      <Text style={styles.catalogoTitulo}>Planes disponibles</Text>
      <FlatList
        data={state.catalogo}
        keyExtractor={(item) => item.plan}
        renderItem={renderPlan}
      />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroSpinner: { alignSelf: 'flex-start', marginTop: spacing.sm },
  body: { flex: 1, padding: spacing.lg },
  estadoBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    marginBottom: spacing.md,
  },
  estadoLinea: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginBottom: 2 },
  entitlementsBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.infoBg,
    marginBottom: spacing.md,
  },
  entitlementsTitulo: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  catalogoTitulo: { color: palette.textOnLight, fontFamily: fonts.display, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold, letterSpacing: 0.5, marginBottom: spacing.sm },
  planCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    backgroundColor: palette.surface,
    marginBottom: spacing.sm,
  },
  planCardPremium: { borderColor: palette.accent, borderWidth: 2 },
  planBadge: { marginBottom: spacing.sm },
  planInfo: { marginBottom: spacing.md },
  planNombre: { color: palette.textOnLight, fontFamily: fonts.display, fontSize: fontSize.title, fontWeight: fontWeight.bold, letterSpacing: 0.5 },
  planPrecio: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.semibold, marginTop: 2 },
  planDescripcion: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginTop: spacing.xs },
  planActualBadge: { color: palette.success, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  upgrade: { marginBottom: spacing.md },
  errorBox: { marginBottom: spacing.md },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
});

export default SuscripcionScreen;
