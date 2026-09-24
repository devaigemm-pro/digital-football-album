// Servicio_Autenticación: emisión de tokens, rotación de refresh y logout.
//
// Implementa la sesión basada en tokens descrita en design.md
// ("Servicio_Autenticación"):
//   - `register`/`login` multiproveedor (Apple/Google/email) que emiten
//     `{ accessToken, refreshToken }`; el registro por email crea cuenta nueva.
//   - `refresh` que rota el refresh token (el usado se marca `rotado` y se emite
//     uno nuevo dentro de la misma familia). La reutilización de un refresh token
//     ya rotado se rechaza e invalida toda la familia de tokens (indicio de robo).
//   - `logout` que invalida (revoca) el refresh token vigente.
//
// Los refresh tokens se guardan siempre como hash (`tokenHash`), nunca en claro.
// Toda dependencia con I/O o no determinismo (repositorios, verificación de
// proveedor, reloj, generación de ids/tokens) se inyecta para poder ejercitar el
// servicio con los dobles en memoria de la capa de persistencia.
//
// Task 3.1 — Requirements: 1.1, 1.2, 1.3, 1.4

import type { ProveedorAuth, RefreshToken, Usuario, UUID } from '../../domain/types.js';
import type { RefreshTokenRepository, UsuarioRepository } from '../../persistence/repositories.js';
import type { ProviderVerifier } from './providers.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js';

/** Par de tokens emitido por login/register/refresh (design.md). */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Petición de registro/login: proveedor + credencial a verificar (Req 1.1). */
export interface AuthRequest {
  provider: ProveedorAuth;
  credential: string;
}

/** Códigos de error del servicio de autenticación. */
export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'INVALID_REFRESH_TOKEN' | 'ACCOUNT_EXISTS';

/**
 * Error de autenticación con código estable. El API Gateway mapea
 * `INVALID_CREDENTIALS`/`INVALID_REFRESH_TOKEN` a `401` (Req 1.3).
 */
export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Reloj inyectable (epoch ms). Facilita probar expiraciones de forma determinista. */
export type Clock = () => number;

/** Generador de UUID inyectable para ids de usuario/token/familia. */
export type IdGenerator = () => UUID;

/** Generador de refresh token inyectable (valor en claro + su hash). */
export type RefreshTokenFactory = () => { token: string; tokenHash: string };

/** Configuración del servicio: secreto de firma y vidas de los tokens. */
export interface AuthServiceConfig {
  /** Secreto HMAC para firmar el access token (JWT HS256). */
  accessTokenSecret: string;
  /** Vida del access token en segundos (corta, p. ej. 900 = 15 min). */
  accessTokenTtlSeconds: number;
  /** Vida del refresh token en segundos (larga, p. ej. 30 días). */
  refreshTokenTtlSeconds: number;
}

/** Dependencias inyectadas del servicio. */
export interface AuthServiceDeps {
  usuarios: UsuarioRepository;
  refreshTokens: RefreshTokenRepository;
  verifier: ProviderVerifier;
  config: AuthServiceConfig;
  /** Reloj; por defecto `Date.now`. */
  now?: Clock;
  /** Generador de ids; por defecto `crypto.randomUUID`. */
  newId?: IdGenerator;
  /** Generador de refresh tokens; por defecto aleatorio con hash SHA-256. */
  newRefreshToken?: RefreshTokenFactory;
}

/** Milisegundos por segundo (conversión epoch ms ↔ claims en segundos). */
const MS_PER_SECOND = 1000;

export class AuthService {
  private readonly usuarios: UsuarioRepository;
  private readonly refreshTokens: RefreshTokenRepository;
  private readonly verifier: ProviderVerifier;
  private readonly config: AuthServiceConfig;
  private readonly now: Clock;
  private readonly newId: IdGenerator;
  private readonly newRefreshToken: RefreshTokenFactory;

  constructor(deps: AuthServiceDeps) {
    this.usuarios = deps.usuarios;
    this.refreshTokens = deps.refreshTokens;
    this.verifier = deps.verifier;
    this.config = deps.config;
    this.now = deps.now ?? (() => Date.now());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.newRefreshToken = deps.newRefreshToken ?? generateRefreshToken;
  }

  /**
   * Registra una cuenta nueva y abre sesión (Req 1.1, 1.4). Con proveedor
   * `email`, si el correo verificado ya tiene cuenta se rechaza con
   * `ACCOUNT_EXISTS`; en caso contrario se crea una cuenta nueva asociada a ese
   * correo. Con proveedores federados, crea la cuenta si no existía o reutiliza
   * la existente para ese correo.
   */
  async register(req: AuthRequest): Promise<TokenPair> {
    const identity = await this.verifyOrThrow(req);

    const existente = await this.usuarios.findByEmail(identity.email);
    if (existente) {
      if (req.provider === 'email') {
        // Registro explícito por email de un correo ya registrado (Req 1.4).
        throw new AuthError('ACCOUNT_EXISTS', 'Ya existe una cuenta asociada a ese correo');
      }
      // Proveedor federado sobre un correo existente: reutiliza la cuenta.
      return this.issueTokenPair(existente.id, this.newId());
    }

    const usuario = await this.usuarios.create({
      id: this.newId(),
      proveedorAuth: identity.proveedor,
      email: identity.email,
      clubId: null,
      // Zona horaria neutra por defecto; el usuario la ajusta luego (Req 14).
      zonaHoraria: 'UTC',
    });
    return this.issueTokenPair(usuario.id, this.newId());
  }

  /**
   * Inicia sesión con credenciales válidas y emite el par de tokens (Req 1.2).
   * Credenciales inválidas → `INVALID_CREDENTIALS` (Req 1.3). Un correo nuevo
   * por email se registra automáticamente creando la cuenta (Req 1.4).
   */
  async login(req: AuthRequest): Promise<TokenPair> {
    const identity = await this.verifyOrThrow(req);

    let usuario = await this.usuarios.findByEmail(identity.email);
    usuario ??= await this.usuarios.create({
      id: this.newId(),
      proveedorAuth: identity.proveedor,
      email: identity.email,
      clubId: null,
      zonaHoraria: 'UTC',
    });

    return this.issueTokenPair(usuario.id, this.newId());
  }

  /**
   * Rota un refresh token válido: marca el actual como `rotado` y emite un par
   * nuevo dentro de la misma familia (Req 1). Un refresh token inexistente,
   * expirado o revocado se rechaza. La reutilización de un refresh token ya
   * `rotado` es indicio de robo: se rechaza y se revoca toda la familia.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await this.refreshTokens.findByTokenHash(tokenHash);
    if (!stored) {
      throw new AuthError('INVALID_REFRESH_TOKEN', 'Refresh token inválido');
    }

    if (stored.revocado) {
      throw new AuthError('INVALID_REFRESH_TOKEN', 'Refresh token revocado');
    }

    if (stored.rotado) {
      // Reutilización de un token ya rotado: invalida toda la familia (Req 1).
      await this.revocarFamilia(stored.familiaId);
      throw new AuthError(
        'INVALID_REFRESH_TOKEN',
        'Refresh token ya utilizado; se invalidó la familia de tokens',
      );
    }

    if (this.now() >= Date.parse(stored.expiraEn)) {
      throw new AuthError('INVALID_REFRESH_TOKEN', 'Refresh token expirado');
    }

    // Rota: marca el actual como usado y emite uno nuevo en la misma familia.
    await this.refreshTokens.update(stored.id, { rotado: true });
    return this.issueTokenPair(stored.usuarioId, stored.familiaId);
  }

  /**
   * Cierra la sesión invalidando (revocando) el refresh token vigente (Req 1,
   * design.md). Idempotente: un token inexistente no produce error.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await this.refreshTokens.findByTokenHash(tokenHash);
    if (!stored) {
      return;
    }
    await this.refreshTokens.update(stored.id, { revocado: true });
  }

  /** Verifica la credencial del proveedor o lanza `INVALID_CREDENTIALS` (Req 1.3). */
  private async verifyOrThrow(req: AuthRequest) {
    const result = await this.verifier.verify(req.provider, req.credential);
    if (!result.ok) {
      throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }
    return result.identity;
  }

  /**
   * Emite un par `{ accessToken, refreshToken }` para un usuario, persistiendo
   * el hash del refresh token en la familia dada. El access token es un JWT
   * HS256 de vida corta; el refresh token solo se devuelve en claro al llamador.
   */
  private async issueTokenPair(usuarioId: UUID, familiaId: UUID): Promise<TokenPair> {
    const nowMs = this.now();
    const iat = Math.floor(nowMs / MS_PER_SECOND);
    const accessToken = signAccessToken(
      { sub: usuarioId, iat, exp: iat + this.config.accessTokenTtlSeconds },
      this.config.accessTokenSecret,
    );

    const { token, tokenHash } = this.newRefreshToken();
    const expiraEnMs = nowMs + this.config.refreshTokenTtlSeconds * MS_PER_SECOND;
    await this.refreshTokens.create({
      id: this.newId(),
      usuarioId,
      tokenHash,
      familiaId,
      expiraEn: new Date(expiraEnMs).toISOString(),
      rotado: false,
      revocado: false,
    });

    return { accessToken, refreshToken: token };
  }

  /** Revoca todos los tokens de una familia (respuesta a reutilización — Req 1). */
  private async revocarFamilia(familiaId: UUID): Promise<void> {
    const familia = await this.refreshTokens.findByFamiliaId(familiaId);
    await Promise.all(
      familia
        .filter((t: RefreshToken) => !t.revocado)
        .map((t: RefreshToken) => this.refreshTokens.update(t.id, { revocado: true })),
    );
  }
}

/** Re-export para que los consumidores tipen el usuario emisor si lo necesitan. */
export type { Usuario };
