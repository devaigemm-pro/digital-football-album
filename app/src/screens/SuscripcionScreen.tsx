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
    return (
      <View style={styles.planCard}>
        <View style={styles.planInfo}>
          <Text style={styles.planNombre}>{item.plan}</Text>
          <Text style={styles.planPrecio}>{formatPrecio(item)}</Text>
          <Text style={styles.planDescripcion}>{item.descripcion}</Text>
        </View>
        {esActual ? (
          <Text style={styles.planActualBadge}>Tu plan actual</Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Comprar plan ${item.plan}`}
            disabled={state.operando}
            style={[styles.boton, state.operando ? styles.botonDisabled : null]}
            onPress={() => {
              void pres.purchase(item.plan);
            }}
          >
            <Text style={styles.botonTexto}>Comprar</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Suscripción</Text>
        {state.status === 'loading' || state.operando ? (
          <ActivityIndicator accessibilityLabel="Procesando" />
        ) : null}
      </View>

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizar a Plan Premium"
          disabled={state.operando}
          style={[
            styles.botonUpgrade,
            state.operando ? styles.botonDisabled : null,
          ]}
          onPress={() => {
            void pres.upgrade();
          }}
        >
          <Text style={styles.botonTexto}>Actualizar a Premium</Text>
        </Pressable>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700' },
  estadoBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f2f2f2',
    marginBottom: 12,
  },
  estadoLinea: { fontSize: 14, marginBottom: 2 },
  entitlementsBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef5ff',
    marginBottom: 12,
  },
  entitlementsTitulo: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  catalogoTitulo: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 8,
  },
  planInfo: { flex: 1, paddingRight: 12 },
  planNombre: { fontSize: 16, fontWeight: '700' },
  planPrecio: { fontSize: 14, color: '#333333', marginTop: 2 },
  planDescripcion: { fontSize: 12, color: '#666666', marginTop: 4 },
  planActualBadge: { color: '#2e7d32', fontWeight: '600' },
  boton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#1565c0',
  },
  botonUpgrade: {
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#6a1b9a',
    alignItems: 'center',
    marginBottom: 12,
  },
  botonDisabled: { opacity: 0.5 },
  botonTexto: { color: '#ffffff', fontWeight: '600' },
  errorBox: { marginBottom: 12 },
  errorText: { color: '#b00020', marginBottom: 4 },
  retry: { color: '#1565c0', fontWeight: '600' },
});

export default SuscripcionScreen;
