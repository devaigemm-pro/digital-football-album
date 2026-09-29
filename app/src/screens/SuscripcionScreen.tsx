// SuscripcionScreen — planes de suscripción (Básico vs Premium).
//
// Replica el prototipo (public/mockups/prototipo.html · pantalla #12
// "Suscripción · Planes"): hero + dos cards de plan con precio anual y
// beneficios, tag "Recomendado" en Premium, y una llamada a suscribirse.
//
// Disponibilidad real (docs/FRONTEND_INTEGRATION.md §7): el backend deployado
// solo expone `GET /me/entitlements` (LECTURA del plan). NO hay compra/upgrade
// (IAP en desarrollo). Por eso la pantalla:
//   - muestra los planes y beneficios (informativo, precios del producto);
//   - resalta el plan ACTUAL del usuario leído de los entitlements;
//   - NO ejecuta un flujo de pago: la acción de suscripción se marca como "no
//     disponible todavía" (preferencia del proyecto: no fingir funcionalidad).
//
// Pantalla DELGADA: solo lee entitlements para marcar el plan actual. Excluida
// del typecheck de `app/tsconfig.json` (RN no instalado en este entorno).

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Entitlements } from '../subscription';
import { Badge, Hero, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface SuscripcionScreenProps {
  /** Lee los derechos del plan (`GET /me/entitlements`) para marcar el actual. */
  readonly getEntitlements?: () => Promise<Entitlements>;
}

/** Un plan del catálogo (datos del producto; precios anuales en USD). */
interface Plan {
  readonly id: 'BASICO' | 'PREMIUM';
  readonly nombre: string;
  readonly precio: string;
  readonly por: string;
  readonly beneficios: readonly string[];
  readonly recomendado?: boolean;
}

const PLANES: readonly Plan[] = [
  {
    id: 'BASICO',
    nombre: 'Básico',
    precio: '$39.99',
    por: '/ año · ~$3.99 al mes',
    beneficios: [
      'Álbum tapa blanda + planchas de stickers',
      'Digital Cards de partidos de liga y copa',
      'Envío en sobre rígido',
    ],
  },
  {
    id: 'PREMIUM',
    nombre: 'Premium',
    precio: '$79.99',
    por: '/ año · ~$7.99 al mes',
    recomendado: true,
    beneficios: [
      'Tapa dura + stickers en sobres holográficos ✦',
      'Digital Cards de partidos internacionales',
      'Holograma en Clásicos e Internacionales · caja de colección',
    ],
  },
];

/**
 * Pantalla de planes de suscripción. Muestra Básico y Premium con sus beneficios
 * y resalta el plan actual del usuario (derivado de los entitlements). No ejecuta
 * compra: el backend aún no expone IAP (§7).
 */
export function SuscripcionScreen({
  getEntitlements,
}: SuscripcionScreenProps): React.ReactElement {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [cargando, setCargando] = useState<boolean>(Boolean(getEntitlements));

  useEffect(() => {
    let activo = true;
    if (!getEntitlements) {
      return;
    }
    getEntitlements()
      .then((e) => {
        if (activo) {
          setEntitlements(e);
        }
      })
      .catch(() => {
        // No bloqueamos la pantalla si falla: se muestran los planes igual.
      })
      .finally(() => {
        if (activo) {
          setCargando(false);
        }
      });
    return () => {
      activo = false;
    };
  }, [getEntitlements]);

  // Premium habilita cards internacionales + holograma (docs §6/gating).
  const planActual: Plan['id'] | null = entitlements
    ? entitlements.digitalCardsInternacional && entitlements.holograma
      ? 'PREMIUM'
      : 'BASICO'
    : null;

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Elige tu kit" title="Suscripción">
        <Text style={styles.heroSub}>Cobro anual vía App Store / Google Play</Text>
        {cargando ? (
          <ActivityIndicator
            color={palette.textOnDark}
            accessibilityLabel="Cargando tu plan"
            style={styles.heroSpinner}
          />
        ) : null}
      </Hero>

      <ScrollView contentContainerStyle={styles.body}>
        {PLANES.map((plan) => {
          const esActual = plan.id === planActual;
          const esPremium = plan.id === 'PREMIUM';
          return (
            <View
              key={plan.id}
              style={[styles.planCard, esPremium ? styles.planCardPremium : null]}
            >
              {plan.recomendado ? (
                <Badge label="Recomendado" tone="gold" style={styles.planTag} />
              ) : null}

              <Text style={styles.planNombre}>{plan.nombre.toUpperCase()}</Text>
              <View style={styles.precioRow}>
                <Text style={styles.precio}>{plan.precio}</Text>
                <Text style={styles.por}>{plan.por}</Text>
              </View>

              <View style={styles.beneficios}>
                {plan.beneficios.map((b) => (
                  <View key={b} style={styles.beneficioRow}>
                    <Text style={styles.beneficioBullet}>•</Text>
                    <Text style={styles.beneficioTexto}>{b}</Text>
                  </View>
                ))}
              </View>

              {esActual ? (
                <Text style={styles.planActual}>Tu plan actual</Text>
              ) : null}
            </View>
          );
        })}

        {/* La compra/upgrade aún no está disponible en el backend (§7). No se
            finge un flujo de pago; se informa con claridad. */}
        <View style={styles.ctaDisabled}>
          <Text style={styles.ctaDisabledText}>Suscribirme a Premium</Text>
        </View>
        <Text style={styles.notaNoDisponible}>
          La contratación desde la app aún no está disponible. Pronto podrás
          suscribirte con App Store / Google Play.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroSub: { color: palette.textMutedOnDark, fontFamily: fonts.body, fontSize: fontSize.small, marginTop: spacing.xs },
  heroSpinner: { alignSelf: 'flex-start', marginTop: spacing.sm },
  body: { padding: spacing.lg },
  planCard: {
    backgroundColor: palette.glassFill,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planCardPremium: { borderColor: palette.accent, borderWidth: 2 },
  planTag: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  planNombre: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  precioRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: spacing.xs },
  precio: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
  },
  por: { color: palette.textMutedOnDark, fontFamily: fonts.body, fontSize: fontSize.small },
  beneficios: { marginTop: spacing.md, gap: spacing.xs },
  beneficioRow: { flexDirection: 'row', gap: spacing.sm },
  beneficioBullet: { color: palette.accent, fontFamily: fonts.body, fontSize: fontSize.body, lineHeight: 20 },
  beneficioTexto: { flex: 1, color: palette.textOnDark, fontFamily: fonts.body, fontSize: fontSize.small, lineHeight: 20 },
  planActual: {
    color: palette.success,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  ctaDisabled: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.glassFillSoft,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
  },
  ctaDisabledText: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
  },
  notaNoDisponible: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});

export default SuscripcionScreen;
