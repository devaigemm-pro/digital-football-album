# Guía de integración del frontend con el backend

Dirigida al desarrollador de la **app móvil** (React Native). Explica cómo está
implementado el backend y cómo consumirlo desde la app. El backend es la
**fuente de verdad**: la app es un cliente delgado y no reimplementa la lógica
de negocio sensible.

## 1. Panorama de la arquitectura

```
App móvil (React Native)
   │
   ├─ Autenticación ──► Supabase Auth (GoTrue) directamente con supabase-js
   │                     (signup / login / refresh). Devuelve un access token JWT.
   │
   └─ Lógica de negocio ──► Backend (API Gateway) en Render, con el JWT en
                            Authorization: Bearer. El backend valida el token
                            contra Supabase y ejecuta la lógica.
                                 │
                                 ├─ Postgres (datos, con RLS por usuario)
                                 └─ Storage (fotos)
```

Dos servidores distintos que la app usa:

- **Supabase** (`https://nliltolgmocerrwhjivi.supabase.co`): para **autenticación**
  (y, si se quiere, acceso directo a Storage/lecturas públicas con RLS).
- **Backend** (`https://album-backend-smr4.onrender.com`): para las **operaciones
  de negocio** (álbum, fotos, cards, club, entitlements).

Regla de oro: **la app no habla con Postgres para lógica de negocio**; usa los
endpoints del backend. Supabase se usa directamente solo para el flujo de auth.

## 2. Autenticación (con Supabase Auth desde la app)

La app gestiona el login con `@supabase/supabase-js` apuntando a Supabase, NO al
backend. El backend no expone login/registro: solo consume el token resultante.

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nliltolgmocerrwhjivi.supabase.co',
  '<SUPABASE_ANON_O_PUBLISHABLE_KEY>', // clave pública, va en la app
);

// Registro (envía email de confirmación según config del proyecto)
await supabase.auth.signUp({ email, password });

// Login
const { data } = await supabase.auth.signInWithPassword({ email, password });
const accessToken = data.session?.access_token; // JWT que se envía al backend
```

- El token es un **JWT ES256** emitido por Supabase; el backend lo valida contra
  el JWKS de Supabase. La app no necesita saber nada de eso.
- `supabase-js` refresca el token automáticamente. Envía siempre el `access_token`
  vigente en cada request al backend.
- Al registrarse un usuario, el backend le crea automáticamente su **perfil**
  (tabla `usuarios`) mediante un trigger; la app no crea el perfil.

## 3. Llamar al backend

Todas las rutas de negocio requieren el header `Authorization: Bearer <token>`.
El backend está detrás de HTTPS; no se necesita nada de CORS (app nativa).

```ts
const API = 'https://album-backend-smr4.onrender.com';

async function api(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, ...body };
  return body;
}
```

### Respuestas de error (formato uniforme)

```json
{ "error": "codigo_de_error", "message": "descripción legible" }
```

| Código HTTP | Significado |
|---|---|
| 401 | Falta el token, es inválido o expiró → reintenta con `refreshSession()` |
| 400 | Petición inválida (body/params) o error de negocio (`error` trae el código de dominio, p. ej. `REQUIERE_PLAN_PREMIUM`) |
| 404 | Ruta o recurso no encontrado |
| 426 | La petición no llegó por HTTPS (no debería pasar con la URL pública) |
| 429 | Rate limit superado; respeta la cabecera `Retry-After` |
| 500 | Error interno |

## 4. Endpoints disponibles hoy

> Todos bajo `https://album-backend-smr4.onrender.com`. Los de negocio requieren
> `Authorization: Bearer <token>`.

### `GET /health` (público)
Salud del servicio. No requiere token.
```json
{ "status": "ok", "driver": "supabase", "auth": "supabase-or-hmac" }
```

### `GET /clubs`
Catálogo de clubes disponibles (para que el usuario elija el suyo).
```json
{ "clubs": [
  { "id": "uuid", "nombre": "Atlético Kiro",
    "paletaColores": { "primario": "#C8102E", "secundario": "#FFFFFF", "acento": "#000000" },
    "escudoUrl": "https://...", "activosVisuales": { "estadioUrls": [], "camisetaUrls": [] } }
] }
```

### `PUT /me/club`
Asigna o cambia el club del usuario. Devuelve la identidad visual para
personalizar la UI. Bloquea el cambio si hay una temporada ACTIVA (error de
dominio → 400).
```jsonc
// Request body:
{ "clubId": "11111111-1111-1111-1111-111111111111" }

// Response 200:
{ "usuario": { "id": "...", "clubId": "...", "email": "...", "zonaHoraria": "UTC" },
  "identidadVisual": { "clubId": "...", "nombre": "Atlético Kiro",
    "paletaColores": { "primario": "#C8102E", "secundario": "#FFFFFF" },
    "escudoUrl": "https://...", "activosVisuales": { "estadioUrls": [], "camisetaUrls": [] } } }
```

### `GET /me/entitlements`
Derechos del usuario según su plan (gating por suscripción).
```json
{ "digitalCardsInternacional": false, "holograma": false }
```
`false/false` = Plan Básico (o sin suscripción). Premium habilita ambos.

### `GET /me`
Perfil del usuario autenticado: sus datos, el club actual (o `null`) y la
temporada ACTIVA (o `null`). Es el punto de entrada del flujo: de aquí sale el
`temporadaId` que necesitan el álbum y la lista de partidos.
```jsonc
{
  "usuario": { "id": "uuid", "email": "...", "clubId": "uuid|null", "zonaHoraria": "America/Bogota" },
  "club": { "id": "uuid", "nombre": "Atlético Kiro", "paletaColores": {...}, "escudoUrl": "...", "activosVisuales": {...} } , // o null
  "temporadaActiva": { "id": "uuid", "usuarioId": "uuid", "clubId": "uuid", "temporadaExterna": "2026", "estado": "ACTIVA", "fechaLimiteCierre": "..." } // o null
}
```
`404 usuario_no_encontrado` si el perfil aún no existe.

### `GET /me/temporadas`
Todas las temporadas del usuario autenticado.
```json
{ "temporadas": [ { "id": "uuid", "estado": "ACTIVA", "temporadaExterna": "2026", "clubId": "uuid", "fechaLimiteCierre": "..." } ] }
```

### `GET /temporadas/:temporadaId/partidos`
Partidos oficiales de la temporada, enriquecidos con el número de su recuadro y
si ya tienen foto principal, para listar las "láminas" y navegar a la captura
con el `partidoId` correcto. Valida que la temporada sea del usuario (si no,
`404 temporada_no_encontrada`).
```jsonc
{
  "temporadaId": "uuid",
  "partidos": [
    {
      "partidoId": "uuid",
      "rival": "Rival FC",
      "competicion": "Liga",
      "tipoCompeticion": "LIGA",          // LIGA | COPA_NACIONAL | INTERNACIONAL
      "fechaHora": "2026-03-10T22:00:00.000Z",
      "estado": "FINALIZADO",             // PROGRAMADO | EN_CURSO | FINALIZADO
      "esClasico": false,
      "esInternacional": false,
      "resultado": { "golesLocal": 2, "golesVisita": 1 }, // o null
      "numeroRecuadro": 1,                 // número del recuadro/sticker (o null)
      "tieneFotoPrincipal": false
    }
  ]
}
```

### `GET /album/:temporadaId/preview`
Previsualización del álbum: cada recuadro montado (con foto) o vacío (silueta).
```json
{ "temporadaId": "uuid", "albumId": "uuid",
  "recuadros": [
    { "numero": 1, "estado": "MONTADA", "miniaturaKey": "thumbs/optimized/..." },
    { "numero": 2, "estado": "VACIO" }
  ],
  "recuadrosSinFotoPrincipal": [2] }
```
Errores de dominio (400): `ALBUM_NO_ENCONTRADO`, `FOTO_PRINCIPAL_NO_ENCONTRADA`.

### `POST /partidos/:partidoId/fotos`
Sube una foto para un partido (se agrupa en el Momento del partido).
```jsonc
// Request body: el binario va en base64.
{ "binarioBase64": "<bytes en base64>",
  "anchoPx": 2400, "altoPx": 3400,
  "fuente": "galeria" }   // "galeria" | "camara" (por defecto "galeria")

// Response 201:
{ "foto": { "id": "uuid", "momentoId": "uuid", "objectKey": "...",
            "anchoPx": 2400, "altoPx": 3400, "estadoAsociacion": "ASOCIADA" },
  "momentoId": "uuid", "momentoCreado": true }
```
Nota: `anchoPx`/`altoPx` deben ser reales; el backend los usa para verificar los
300 DPI mínimos en impresión. Error de dominio (400): `PartidoNoEncontrado`.

### `POST /cards/:momentoId`
Genera una Digital Card del momento (foto + marcador + escudo).
```json
{ "objectKey": "dev/cards/2-1.png", "formato": "PNG" }
```
Gating (400 `REQUIERE_PLAN_PREMIUM`): las cards de partidos **internacionales**
requieren Plan Premium; las demás las puede generar cualquier plan.

## 5. Convenciones de datos

- **IDs**: UUID (string). **Fechas**: ISO 8601 (string).
- **camelCase** en toda la API (el backend traduce a la base internamente).
- **Estados** como uniones de strings, p. ej. `estado_temporada`:
  `CONFIGURACION | ACTIVA | CERRADA | IMPRESION | LISTA | ENVIADA | FALLIDA`.
- **Planes**: `BASICO | PREMIUM`. **Contexto de asistencia**:
  `EN_VIVO_LOCAL | EN_VIVO_VISITA | TRANSMISION`.

## 6. Invariantes de negocio a respetar en la UI

Estas reglas las **garantiza el backend**; la app debe reflejarlas, no
saltárselas:

- Un recuadro por cada partido oficial de la temporada (amistosos excluidos).
- A lo sumo una **foto principal** por recuadro (solo esa se imprime).
- El número del sticker = número de su recuadro.
- El **cambio de club** se bloquea si hay una temporada ACTIVA (→ 400).
- El **gating por plan** (cards internacionales, holograma) lo decide el backend;
  la UI puede consultar `/me/entitlements` para mostrar/ocultar opciones, pero la
  decisión final es del servidor.

## 7. Lo que aún NO está disponible

Endpoints/servicios que el backend tiene en el dominio pero que aún no se
exponen o usan adaptadores de desarrollo (no llamarlos todavía en producción):

- Registro de contexto/notas/votación del momento (más allá de subir la foto).
- Creación/derivación de la temporada y sus partidos desde la API deportiva:
  hoy `GET /me` y `GET /temporadas/:id/partidos` leen lo que exista en la base;
  si el usuario aún no tiene temporada/partidos sembrados, devolverán `null`/vacío.
- Dirección de envío, pedido y tracking del kit físico.
- Generación real de PDFs de impresión (Print Engine) y sincronización con la
  API deportiva: hoy usan implementaciones de desarrollo.
- Validación de compras in-app (IAP) y notificaciones push: en desarrollo.

Coordina con el equipo de backend antes de construir UI que dependa de estos.
