// Implementación del contrato CRUD genérico sobre Supabase (PostgREST).
//
// `SupabaseRepository<T, K>` traduce las operaciones del `Repository<T>` a
// llamadas de `@supabase/supabase-js` sobre la tabla `K`, usando un
// `EntityMapper` para convertir entre filas snake_case y entidades camelCase.
//
// Los códigos de error de Postgres se traducen a los errores tipados de la capa
// (`DuplicateIdError`, `NotFoundError`, `UniqueConstraintError`) para que los
// servicios de dominio los traten igual que con el driver en memoria.

import type { PostgrestError } from '@supabase/supabase-js';
import type { UUID } from '../../domain/types.js';
import {
  DuplicateIdError,
  NotFoundError,
  PersistenceError,
  UniqueConstraintError,
} from '../errors.js';
import type { Entity, Patch, Repository } from '../repository.js';
import type { TypedSupabaseClient } from './client.js';
import type { EntityMapper } from './mappers.js';

// Códigos SQLSTATE relevantes de Postgres.
const PG_UNIQUE_VIOLATION = '23505';
// PostgREST devuelve PGRST116 cuando `.single()` no encuentra exactamente una fila.
const PGRST_NO_ROWS = 'PGRST116';

type Tables = import('../../types/database.js').Database['public']['Tables'];

/**
 * Repositorio CRUD genérico respaldado por Supabase. Las subclases por entidad
 * heredan el CRUD y añaden sus consultas por relación usando `runMany`/`runMaybe`.
 */
export class SupabaseRepository<T extends Entity, K extends keyof Tables> implements Repository<T> {
  constructor(
    protected readonly client: TypedSupabaseClient,
    protected readonly mapper: EntityMapper<T, K>,
  ) {}

  /** Acceso tipado a la tabla de esta entidad. */
  protected get table() {
    return this.client.from(this.mapper.table);
  }

  async create(entity: T): Promise<T> {
    const row = this.mapper.toRow(entity);
    const { data, error } = await this.table
      .insert(row as never)
      .select()
      .single();

    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) {
        // Violación en la PK -> id duplicado; otra unicidad -> restricción.
        if (this.isPrimaryKeyViolation(error)) {
          throw new DuplicateIdError(this.mapper.entityName, entity.id);
        }
        throw new UniqueConstraintError(this.mapper.entityName, error.details ?? error.message);
      }
      throw this.wrap(error);
    }
    return this.mapper.fromRow(data as never);
  }

  async findById(id: UUID): Promise<T | null> {
    const { data, error } = await eqId(this.table.select(), id).maybeSingle();
    if (error) throw this.wrap(error);
    return data ? this.mapper.fromRow(data as never) : null;
  }

  async findAll(): Promise<T[]> {
    const { data, error } = await this.table.select();
    if (error) throw this.wrap(error);
    return (data ?? []).map((r) => this.mapper.fromRow(r as never));
  }

  async update(id: UUID, patch: Patch<T>): Promise<T> {
    const row = this.mapper.toRow(patch as Partial<T>);
    // El id es inmutable: nunca se envía en el patch.
    delete row.id;

    const { data, error } = await eqId(this.table.update(row as never).select(), id).maybeSingle();

    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) {
        throw new UniqueConstraintError(this.mapper.entityName, error.details ?? error.message);
      }
      throw this.wrap(error);
    }
    if (!data) throw new NotFoundError(this.mapper.entityName, id);
    return this.mapper.fromRow(data as never);
  }

  async delete(id: UUID): Promise<boolean> {
    // `count: 'exact'` permite saber si se eliminó algo (borrado idempotente).
    const { error, count } = await eqId(this.table.delete({ count: 'exact' }), id);
    if (error) throw this.wrap(error);
    return (count ?? 0) > 0;
  }

  async count(): Promise<number> {
    const { error, count } = await this.table.select('*', {
      count: 'exact',
      head: true,
    });
    if (error) throw this.wrap(error);
    return count ?? 0;
  }

  // -------------------------------------------------------------------------
  // Utilidades protegidas para las consultas por relación de las subclases.
  // -------------------------------------------------------------------------

  /** Ejecuta una consulta que devuelve múltiples filas y las mapea al dominio. */
  protected async runMany(
    build: (
      q: ReturnType<SupabaseRepository<T, K>['table']['select']>,
    ) => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>,
  ): Promise<T[]> {
    const { data, error } = await build(this.table.select());
    if (error) throw this.wrap(error);
    return (data ?? []).map((r) => this.mapper.fromRow(r as never));
  }

  /** Ejecuta una consulta que devuelve a lo sumo una fila. */
  protected async runMaybe(
    build: (
      q: ReturnType<SupabaseRepository<T, K>['table']['select']>,
    ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  ): Promise<T | null> {
    const { data, error } = await build(this.table.select());
    if (error && error.code !== PGRST_NO_ROWS) throw this.wrap(error);
    return data ? this.mapper.fromRow(data as never) : null;
  }

  private isPrimaryKeyViolation(error: PostgrestError): boolean {
    // El nombre de la constraint PK generado por Postgres termina en "_pkey".
    const haystack = `${error.details ?? ''} ${error.message ?? ''}`;
    return haystack.includes('_pkey');
  }

  private wrap(error: PostgrestError): PersistenceError {
    return new PersistenceError(
      `[${this.mapper.entityName}] ${error.code ?? ''} ${error.message}`.trim(),
    );
  }
}

/**
 * Filtro `.eq('id', ...)` sobre un query builder de PostgREST.
 *
 * El builder de supabase-js está tipado por tabla y su firma de `eq` es
 * variádica y auto-referencial; sobre el genérico `K` de este repositorio, TS
 * no puede probar que la columna literal `'id'` pertenece a cada tabla (aunque
 * por diseño toda `Entity` tiene `id` como PK). Este helper concentra en un solo
 * lugar el acceso relajado a `eq`, en vez de esparcir casts por cada operación.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eqId<B>(builder: B, id: UUID): B {
  return (builder as unknown as { eq(c: string, v: string): B }).eq('id', id);
}
