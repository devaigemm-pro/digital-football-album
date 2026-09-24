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

En el CI esto lo hace el job `deploy` automáticamente antes de liberar.

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
   | `CORS_ORIGINS` | dominio(s) del frontend, separados por coma | no, pero por entorno |

   Las no secretas (`NODE_ENV`, `PERSISTENCE_DRIVER`, `AUTH_PROVIDER`,
   `SUPABASE_URL`, `HOST`) ya vienen en `render.yaml`. Render inyecta `PORT`.

4. En **Settings → Deploy Hook**, copia la URL y guárdala como secreto del repo
   de GitHub `RENDER_DEPLOY_HOOK_URL` (ver sección 3). Deja `autoDeploy: false`
   para que el deploy lo controle el CI tras aplicar migraciones.

## 3. Secretos del repositorio (GitHub Actions)

En GitHub → Settings → Secrets and variables → Actions, define:

| Secreto | Para qué |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | `supabase link` en el CI |
| `SUPABASE_PROJECT_REF` | ref del proyecto hosted |
| `SUPABASE_DB_PASSWORD` | `supabase db push` |
| `RENDER_DEPLOY_HOOK_URL` | disparar el deploy en Render |

El workflow `.github/workflows/ci.yml` (job `deploy`, solo en push a `main`):
aplica migraciones → dispara el Deploy Hook de Render.

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
| `CORS_ORIGINS` | orígenes del frontend (no `*` en producción) |
| `ALLOW_INSECURE` | sin definir (TLS exigido) |

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
