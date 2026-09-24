// Pantalla de Detalle del Recuadro/Momento (UI React Native) — Task 28.2.
//
// Requirements (cliente · Requerimiento 3 / backend · Req 5 y 6):
//   3.5 Seleccionar la Foto_Principal del Recuadro (a lo sumo una).
//   3.7 Cambiar la Foto_Principal antes del cierre (el backend valida la ventana).
//   3.8 Marcar el Contexto_Asistencia (En Vivo Local / Visita / Transmisión);
//       la sub-modalidad (Televisión / Bar / Streaming) SOLO en Transmisión;
//       notas y Jugador_del_Partido.
//   3.9 Verificación opcional por geolocalización en contextos En Vivo.
//   3.13 Reflejar los mensajes de error de negocio del backend en la UI.
//
// Es un componente DELGADO: no contiene lógica de negocio. Toda la lógica
// verificable vive en `app/src/capture` (MomentoDetailPresenter), TypeScript
// puro y testeado. La AUTORIDAD de las reglas (biunivocidad de la Foto_Principal,
// ventana de edición, validez de la sub-modalidad, pertenencia del jugador a la
// alineación) es del BACKEND: la pantalla solo delega y muestra el mensaje que
// el backend devuelve (`MomentoBusinessError`).
//
// Este archivo es `.tsx` y queda EXCLUIDO del typecheck (`app/tsconfig.json`):
// depende de React/React Native, cuyo toolchain se instala aparte.

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Image,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { MomentoBusinessError, MomentoDetailPresenter } from '../capture';
import type {
  ContextoAsistencia,
  Foto,
  JugadorAlineacion,
  SubModalidadTransmision,
} from '../../../src/domain/types';
import type { MomentoContextoInput } from '../viewmodels';

/** Opciones de contexto de asistencia con su etiqueta legible (Req 3.8). */
const CONTEXTOS: ReadonlyArray<{ valor: ContextoAsistencia; etiqueta: string }> = [
  { valor: 'EN_VIVO_LOCAL', etiqueta: 'En Vivo (Local)' },
  { valor: 'EN_VIVO_VISITA', etiqueta: 'En Vivo (Visita)' },
  { valor: 'TRANSMISION', etiqueta: 'Transmisión' },
];

/** Sub-modalidades, visibles SOLO cuando el contexto es Transmisión (Req 3.8). */
const SUBMODALIDADES: ReadonlyArray<{
  valor: SubModalidadTransmision;
  etiqueta: string;
}> = [
  { valor: 'TELEVISION', etiqueta: 'Televisión' },
  { valor: 'BAR', etiqueta: 'Bar' },
  { valor: 'STREAMING', etiqueta: 'Streaming' },
];

export interface DetalleCardScreenProps {
  /** Recuadro del partido cuya Foto_Principal se selecciona (Req 3.5). */
  readonly recuadroId: string;
  /** Momento del partido cuyo contexto se edita (Req 3.8). */
  readonly momentoId: string;
  /** Fotos disponibles del Momento para elegir Foto_Principal. */
  readonly fotos: readonly Foto[];
  /** Id de la Foto_Principal actual (o null si el Recuadro está vacío). */
  readonly fotoPrincipalId?: string | null;
  /** Alineación del partido para elegir el Jugador_del_Partido (Req 3.8). */
  readonly alineacion: readonly JugadorAlineacion[];
  /** Presentador de detalle (inyectado; enlaza CaptureViewModel). */
  readonly presenter: MomentoDetailPresenter;
}

/**
 * Pantalla de detalle: permite elegir la Foto_Principal y editar el contexto.
 * Muestra la sub-modalidad solo cuando el contexto es Transmisión y refleja los
 * mensajes de error de negocio del backend (Req 3.13).
 */
export function DetalleCardScreen({
  recuadroId,
  momentoId,
  fotos,
  fotoPrincipalId,
  alineacion,
  presenter,
}: DetalleCardScreenProps): React.ReactElement {
  const [principalId, setPrincipalId] = useState<string | null>(
    fotoPrincipalId ?? null,
  );
  const [contexto, setContexto] = useState<ContextoAsistencia>('EN_VIVO_LOCAL');
  const [subModalidad, setSubModalidad] =
    useState<SubModalidadTransmision | null>(null);
  const [geoVerificado, setGeoVerificado] = useState(false);
  const [notas, setNotas] = useState('');
  const [jugador, setJugador] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const esTransmision = contexto === 'TRANSMISION';
  const esEnVivo = contexto !== 'TRANSMISION';

  /** Maneja un error surfaceado por el presentador reflejando su mensaje (Req 3.13). */
  const mostrarError = useCallback((titulo: string, e: unknown) => {
    if (e instanceof MomentoBusinessError) {
      // El backend es la autoridad: mostramos su mensaje tal cual.
      Alert.alert(titulo, e.message);
    } else {
      Alert.alert(titulo, String(e));
    }
  }, []);

  /** Fija la Foto_Principal (Req 3.5); el backend valida biunivocidad y ventana. */
  const elegirPrincipal = useCallback(
    async (fotoId: string) => {
      setOcupado(true);
      try {
        const recuadro = await presenter.setFotoPrincipal(recuadroId, fotoId);
        setPrincipalId(recuadro.fotoPrincipalId ?? fotoId);
      } catch (e) {
        mostrarError('No se pudo fijar la Foto_Principal', e);
      } finally {
        setOcupado(false);
      }
    },
    [presenter, recuadroId, mostrarError],
  );

  /** Guarda el contexto de asistencia y datos del Momento (Req 3.8, 3.9). */
  const guardarContexto = useCallback(async () => {
    setOcupado(true);
    const patch: MomentoContextoInput = {
      contextoAsistencia: contexto,
      // La sub-modalidad solo aplica en Transmisión; el presentador la
      // normaliza igualmente y el backend es la autoridad final (Req 3.8).
      subModalidad: esTransmision ? subModalidad : null,
      geoVerificado: esEnVivo ? geoVerificado : false,
      notas,
      jugadorDelPartido: jugador,
    };
    try {
      await presenter.updateContexto(momentoId, patch);
      Alert.alert('Contexto guardado', 'Se actualizó el Momento.');
    } catch (e) {
      mostrarError('No se pudo guardar el contexto', e);
    } finally {
      setOcupado(false);
    }
  }, [
    presenter,
    momentoId,
    contexto,
    esTransmision,
    esEnVivo,
    subModalidad,
    geoVerificado,
    notas,
    jugador,
    mostrarError,
  ]);

  const jugadores = useMemo(() => alineacion, [alineacion]);

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Foto principal</Text>
      <FlatList
        horizontal
        data={fotos}
        keyExtractor={(f) => f.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              item.id === principalId
                ? 'Foto principal seleccionada'
                : 'Elegir esta foto como principal'
            }
            accessibilityState={{ selected: item.id === principalId }}
            onPress={() => void elegirPrincipal(item.id)}
            disabled={ocupado}
          >
            <Image
              style={[
                styles.miniatura,
                item.id === principalId && styles.miniaturaSel,
              ]}
              source={{ uri: item.objectKey }}
              accessibilityRole="image"
              accessibilityLabel="Foto del momento"
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.vacio}>Aún no hay fotos.</Text>}
      />

      <Text style={styles.titulo}>Contexto de asistencia</Text>
      <View style={styles.grupo}>
        {CONTEXTOS.map((c) => (
          <TouchableOpacity
            key={c.valor}
            accessibilityRole="radio"
            accessibilityLabel={`Contexto: ${c.etiqueta}`}
            accessibilityState={{ selected: contexto === c.valor }}
            style={[styles.radio, contexto === c.valor && styles.radioSel]}
            onPress={() => setContexto(c.valor)}
          >
            <Text>{c.etiqueta}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {esTransmision && (
        <View>
          <Text style={styles.subtitulo}>Sub-modalidad</Text>
          <View style={styles.grupo}>
            {SUBMODALIDADES.map((s) => (
              <TouchableOpacity
                key={s.valor}
                accessibilityRole="radio"
                accessibilityLabel={`Sub-modalidad: ${s.etiqueta}`}
                accessibilityState={{ selected: subModalidad === s.valor }}
                style={[styles.radio, subModalidad === s.valor && styles.radioSel]}
                onPress={() => setSubModalidad(s.valor)}
              >
                <Text>{s.etiqueta}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {esEnVivo && (
        <View style={styles.fila}>
          <Text>Verificar por geolocalización</Text>
          <Switch
            value={geoVerificado}
            onValueChange={setGeoVerificado}
            accessibilityLabel="Verificar la asistencia por geolocalización"
          />
        </View>
      )}

      <Text style={styles.subtitulo}>Notas</Text>
      <TextInput
        style={styles.input}
        multiline
        value={notas}
        onChangeText={setNotas}
        placeholder="Bitácora del partido…"
        accessibilityLabel="Notas del partido"
      />

      <Text style={styles.subtitulo}>Jugador del partido</Text>
      <View style={styles.grupo}>
        {jugadores.map((j) => (
          <TouchableOpacity
            key={j.id}
            accessibilityRole="radio"
            accessibilityLabel={`Jugador del partido: ${j.nombre}`}
            accessibilityState={{ selected: jugador === j.id }}
            style={[styles.radio, jugador === j.id && styles.radioSel]}
            onPress={() => setJugador(j.id)}
          >
            <Text>{j.nombre}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button title="Guardar contexto" onPress={() => void guardarContexto()} disabled={ocupado} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  titulo: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  subtitulo: { fontSize: 14, fontWeight: '500', marginTop: 8 },
  grupo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  radio: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  radioSel: { borderColor: '#1e88e5', backgroundColor: '#e3f2fd' },
  miniatura: { width: 96, height: 96, borderRadius: 8, marginRight: 8 },
  miniaturaSel: { borderWidth: 3, borderColor: '#1e88e5' },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, minHeight: 64, padding: 8 },
  vacio: { opacity: 0.6 },
});

export default DetalleCardScreen;
