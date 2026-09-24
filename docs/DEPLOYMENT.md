# Despliegue del backend

Guía para desplegar el backend del Álbum de Fútbol Digital en **Render**, con la
base de datos y la autenticación en **Supabase hosted**.

> Seguridad: ningún secreto se guarda en el repositorio. Todos se cargan en el
> gestor de secretos de Render y en los Secrets del repo de GitHub. `.env` y
> `.env.*` están en `.gitignore`.

## Arquitectura de despliegue

```
Cliente móvil ──HTTPS──► Render (web service Docker: album-backend)
                              │
                              ├─► Supabase hosted · Postgres (datos, RLS)
                              ├─► Supabase hosted · Auth/GoTrue (JWT ES256, JWKS)
                              └─► Supabase hosted · Storage (bucket "fotos")
```

- El backend corre desde el `Dockerfile` (multi-stage, usuario no-root).
- Render termina TLS en el borde; por eso `ALLOW_INSECURE` queda en `false`.
- La verificación de tokens se delega en Supabase Auth (JWKS ES256).

## 1. Supabase hosted (base de datos)

El proyecto ya está creado y las migraciones aplicadas. Para futuros cambios de
esquema, el flujo es:

```bash
export SUPABASE_ACCESS_TOKEN=<token de acceso de Supabase>
export SUPABASE_PROJECT_REF=<ref del proyecto>   # p. ej. nliltolgmocerrwhjivi
export SUPABASE_DB_PASSWORD=<password de la base>

npm run db:link     # supabase link --project-ref $SUPABASE_PROJECT_REF
npm run db:push     # aplica las migraciones pendientes de supabase/migrations/
```

**Nota:** con la **integración GitHub de Supabase** activa, las migraciones se
aplican automáticamente al proyecto hosted en cada push a `main`; los comandos
de arriba son solo para operaciones manuales/locales. El CI no aplica
migraciones (no las duplica).

### Sembrar catálogos (opcional)

El esquema queda vacío. Si quieres datos iniciales (clubes, plantillas), aplica
un `INSERT` de catálogos desde el SQL editor de Supabase o una migración de
datos. `supabase/seed.sql` solo se usa en local (`db reset`).

## 2. Render (backend)

1. Crea un **Blueprint** en Render apuntando a este repo; detecta `render.yaml`.
2. Render creará el web service `album-backend` desde el `Dockerfile`.
3. Carga las variables marcadas como `sync: false` en el dashboard del servicio
   (Environment):

   | Variable | Origen | Secreta |
   |---|---|---|
   | `SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon/publishable) | sí |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role) | **sí, alto poder** |
   | `CORS_ORIGINS` | **opcional** — solo si añades un cliente web (panel admin) | no |

   Las no secretas (`NODE_ENV`, `PERSISTENCE_DRIVER`, `AUTH_PROVIDER`,
   `SUPABASE_URL`, `HOST`) ya vienen en `render.yaml`. Render inyecta `PORT`.

   > El cliente principal es una **app móvil nativa** (React Native), que no está
   > sujeta a CORS (no envía cabecera `Origin`). Por eso `CORS_ORIGINS` es
   > opcional: si no se define, el gateway no emite cabeceras CORS y la app
   > funciona igual; las cabeceras de seguridad base se aplican siempre.

4. `render.yaml` usa `autoDeploy: true`: Render **despliega automáticamente** en
   cada push a `main` (construye la imagen desde el `Dockerfile`). No se necesita
   deploy hook ni orquestación desde el CI.

## 3. Despliegue automático (integraciones nativas)

El despliegue lo gestionan las integraciones con Git, sin secretos en el repo:

- **Supabase (integración GitHub):** aplica las migraciones de
  `supabase/migrations/` al proyecto hosted en cada push a `main`.
- **Render (auto-deploy):** reconstruye y libera el backend en cada push a `main`.

El pipeline de GitHub Actions (`.github/workflows/ci.yml`) **no despliega**: solo
valida calidad (typecheck, lint, tests, build de imagen) para proteger `main`.
Así no hay duplicación ni secretos de deploy en GitHub.

## 4. Variables de entorno del backend

Validadas al arranque (fail-fast) en `src/composition/config.ts`:

| Variable | Producción |
|---|---|
| `NODE_ENV` | `production` |
| `PERSISTENCE_DRIVER` | `supabase` |
| `AUTH_PROVIDER` | `supabase` |
| `SUPABASE_URL` | URL del proyecto hosted |
| `SUPABASE_ANON_KEY` | anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `CORS_ORIGINS` | opcional; solo para un cliente web (no `*` en producción) |
| `ALLOW_INSECURE` | sin definir (TLS exigido) |

El cliente principal es una app móvil nativa, no sujeta a CORS; `CORS_ORIGINS`
solo aplica si se añade un cliente web.

Reglas de producción que el arranque rechaza: `ALLOW_INSECURE=true`,
`PERSISTENCE_DRIVER=memory`, `CORS_ORIGINS="*"`, o secreto HMAC corto.

## 5. Rotación de secretos

- La **service_role key** da acceso total a la base (omite RLS). Si se expone
  (chat, logs, commit), **rótala**: Supabase → Project Settings → API → rotate
  `service_role`, y actualiza el valor en Render.
- Rota periódicamente los tokens de acceso y el deploy hook.

## 6. Verificación post-deploy

```bash
# Salud (endpoint público)
curl -fsS https://<tu-servicio>.onrender.com/health

# Ruta protegida sin token → 401
curl -s -o /dev/null -w "%{http_code}\n" https://<tu-servicio>.onrender.com/me/entitlements
```

Revisa los advisors de seguridad de Supabase tras cada cambio de esquema
(`get_advisors` vía MCP o el linter del dashboard).
