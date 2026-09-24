export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      albums: {
        Row: {
          created_at: string;
          id: string;
          temporada_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          temporada_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          temporada_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'albums_temporada_id_fkey';
            columns: ['temporada_id'];
            isOneToOne: true;
            referencedRelation: 'temporadas';
            referencedColumns: ['id'];
          },
        ];
      };
      clubs: {
        Row: {
          activos_visuales: Json;
          created_at: string;
          escudo_url: string;
          id: string;
          nombre: string;
          paleta_colores: Json;
        };
        Insert: {
          activos_visuales?: Json;
          created_at?: string;
          escudo_url: string;
          id?: string;
          nombre: string;
          paleta_colores: Json;
        };
        Update: {
          activos_visuales?: Json;
          created_at?: string;
          escudo_url?: string;
          id?: string;
          nombre?: string;
          paleta_colores?: Json;
        };
        Relationships: [];
      };
      config_admin: {
        Row: {
          created_at: string;
          fecha_limite_cierre: string;
          id: string;
          liga: string;
          operador_id: string;
          temporada_id: string;
        };
        Insert: {
          created_at?: string;
          fecha_limite_cierre: string;
          id?: string;
          liga: string;
          operador_id: string;
          temporada_id: string;
        };
        Update: {
          created_at?: string;
          fecha_limite_cierre?: string;
          id?: string;
          liga?: string;
          operador_id?: string;
          temporada_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'config_admin_temporada_id_fkey';
            columns: ['temporada_id'];
            isOneToOne: true;
            referencedRelation: 'temporadas';
            referencedColumns: ['id'];
          },
        ];
      };
      direcciones_envio: {
        Row: {
          campos: Json;
          created_at: string;
          id: string;
          usuario_id: string;
          validada: boolean;
        };
        Insert: {
          campos: Json;
          created_at?: string;
          id?: string;
          usuario_id: string;
          validada?: boolean;
        };
        Update: {
          campos?: Json;
          created_at?: string;
          id?: string;
          usuario_id?: string;
          validada?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'direcciones_envio_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: true;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      fotos: {
        Row: {
          alto_px: number;
          ancho_px: number;
          created_at: string;
          estado_asociacion: Database['public']['Enums']['estado_asociacion_foto'];
          id: string;
          momento_id: string;
          object_key: string;
        };
        Insert: {
          alto_px: number;
          ancho_px: number;
          created_at?: string;
          estado_asociacion?: Database['public']['Enums']['estado_asociacion_foto'];
          id?: string;
          momento_id: string;
          object_key: string;
        };
        Update: {
          alto_px?: number;
          ancho_px?: number;
          created_at?: string;
          estado_asociacion?: Database['public']['Enums']['estado_asociacion_foto'];
          id?: string;
          momento_id?: string;
          object_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fotos_momento_id_fkey';
            columns: ['momento_id'];
            isOneToOne: false;
            referencedRelation: 'momentos';
            referencedColumns: ['id'];
          },
        ];
      };
      momentos: {
        Row: {
          contexto_asistencia: Database['public']['Enums']['contexto_asistencia'];
          created_at: string;
          geo_verificado: boolean;
          id: string;
          jugador_del_partido: string | null;
          notas: string;
          partido_oficial_id: string;
          sub_modalidad: Database['public']['Enums']['sub_modalidad_transmision'] | null;
        };
        Insert: {
          contexto_asistencia: Database['public']['Enums']['contexto_asistencia'];
          created_at?: string;
          geo_verificado?: boolean;
          id?: string;
          jugador_del_partido?: string | null;
          notas?: string;
          partido_oficial_id: string;
          sub_modalidad?: Database['public']['Enums']['sub_modalidad_transmision'] | null;
        };
        Update: {
          contexto_asistencia?: Database['public']['Enums']['contexto_asistencia'];
          created_at?: string;
          geo_verificado?: boolean;
          id?: string;
          jugador_del_partido?: string | null;
          notas?: string;
          partido_oficial_id?: string;
          sub_modalidad?: Database['public']['Enums']['sub_modalidad_transmision'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'momentos_partido_oficial_id_fkey';
            columns: ['partido_oficial_id'];
            isOneToOne: true;
            referencedRelation: 'partidos_oficiales';
            referencedColumns: ['id'];
          },
        ];
      };
      partidos_oficiales: {
        Row: {
          alineacion: Json;
          competicion: string;
          created_at: string;
          es_clasico: boolean;
          es_internacional: boolean;
          estado: Database['public']['Enums']['estado_partido'];
          eventos: Json;
          fecha_hora: string;
          id: string;
          partido_externo_id: string;
          resultado: Json | null;
          rival: string;
          temporada_id: string;
          tipo_competicion: Database['public']['Enums']['tipo_competicion'];
        };
        Insert: {
          alineacion?: Json;
          competicion: string;
          created_at?: string;
          es_clasico?: boolean;
          es_internacional?: boolean;
          estado?: Database['public']['Enums']['estado_partido'];
          eventos?: Json;
          fecha_hora: string;
          id?: string;
          partido_externo_id: string;
          resultado?: Json | null;
          rival: string;
          temporada_id: string;
          tipo_competicion: Database['public']['Enums']['tipo_competicion'];
        };
        Update: {
          alineacion?: Json;
          competicion?: string;
          created_at?: string;
          es_clasico?: boolean;
          es_internacional?: boolean;
          estado?: Database['public']['Enums']['estado_partido'];
          eventos?: Json;
          fecha_hora?: string;
          id?: string;
          partido_externo_id?: string;
          resultado?: Json | null;
          rival?: string;
          temporada_id?: string;
          tipo_competicion?: Database['public']['Enums']['tipo_competicion'];
        };
        Relationships: [
          {
            foreignKeyName: 'partidos_oficiales_temporada_id_fkey';
            columns: ['temporada_id'];
            isOneToOne: false;
            referencedRelation: 'temporadas';
            referencedColumns: ['id'];
          },
        ];
      };
      pedidos: {
        Row: {
          created_at: string;
          datos_fiscales_minimos: Json | null;
          estado: Database['public']['Enums']['estado_pedido'];
          id: string;
          intentos_impresion: number;
          temporada_id: string;
          tracking: string | null;
        };
        Insert: {
          created_at?: string;
          datos_fiscales_minimos?: Json | null;
          estado?: Database['public']['Enums']['estado_pedido'];
          id?: string;
          intentos_impresion?: number;
          temporada_id: string;
          tracking?: string | null;
        };
        Update: {
          created_at?: string;
          datos_fiscales_minimos?: Json | null;
          estado?: Database['public']['Enums']['estado_pedido'];
          id?: string;
          intentos_impresion?: number;
          temporada_id?: string;
          tracking?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pedidos_temporada_id_fkey';
            columns: ['temporada_id'];
            isOneToOne: true;
            referencedRelation: 'temporadas';
            referencedColumns: ['id'];
          },
        ];
      };
      plantillas_album: {
        Row: {
          club_id: string;
          created_at: string;
          id: string;
          recuadro_alto_mm: number;
          recuadro_ancho_mm: number;
        };
        Insert: {
          club_id: string;
          created_at?: string;
          id?: string;
          recuadro_alto_mm: number;
          recuadro_ancho_mm: number;
        };
        Update: {
          club_id?: string;
          created_at?: string;
          id?: string;
          recuadro_alto_mm?: number;
          recuadro_ancho_mm?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'plantillas_album_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      recuadros: {
        Row: {
          album_id: string;
          alto_mm: number;
          ancho_mm: number;
          created_at: string;
          estado_recordatorio: Database['public']['Enums']['estado_recordatorio'];
          foto_principal_id: string | null;
          id: string;
          numero: number;
          partido_oficial_id: string;
          plantilla_id: string;
        };
        Insert: {
          album_id: string;
          alto_mm: number;
          ancho_mm: number;
          created_at?: string;
          estado_recordatorio?: Database['public']['Enums']['estado_recordatorio'];
          foto_principal_id?: string | null;
          id?: string;
          numero: number;
          partido_oficial_id: string;
          plantilla_id: string;
        };
        Update: {
          album_id?: string;
          alto_mm?: number;
          ancho_mm?: number;
          created_at?: string;
          estado_recordatorio?: Database['public']['Enums']['estado_recordatorio'];
          foto_principal_id?: string | null;
          id?: string;
          numero?: number;
          partido_oficial_id?: string;
          plantilla_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recuadros_album_id_fkey';
            columns: ['album_id'];
            isOneToOne: false;
            referencedRelation: 'albums';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recuadros_foto_principal_fk';
            columns: ['foto_principal_id'];
            isOneToOne: false;
            referencedRelation: 'fotos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recuadros_partido_oficial_id_fkey';
            columns: ['partido_oficial_id'];
            isOneToOne: true;
            referencedRelation: 'partidos_oficiales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recuadros_plantilla_id_fkey';
            columns: ['plantilla_id'];
            isOneToOne: false;
            referencedRelation: 'plantillas_album';
            referencedColumns: ['id'];
          },
        ];
      };
      refresh_tokens: {
        Row: {
          created_at: string;
          expira_en: string;
          familia_id: string;
          id: string;
          revocado: boolean;
          rotado: boolean;
          token_hash: string;
          usuario_id: string;
        };
        Insert: {
          created_at?: string;
          expira_en: string;
          familia_id: string;
          id?: string;
          revocado?: boolean;
          rotado?: boolean;
          token_hash: string;
          usuario_id: string;
        };
        Update: {
          created_at?: string;
          expira_en?: string;
          familia_id?: string;
          id?: string;
          revocado?: boolean;
          rotado?: boolean;
          token_hash?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refresh_tokens_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      rivalidades: {
        Row: {
          club_id: string;
          created_at: string;
          id: string;
          rival_nombre: string;
        };
        Insert: {
          club_id: string;
          created_at?: string;
          id?: string;
          rival_nombre: string;
        };
        Update: {
          club_id?: string;
          created_at?: string;
          id?: string;
          rival_nombre?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rivalidades_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      suscripciones: {
        Row: {
          created_at: string;
          estado: Database['public']['Enums']['estado_suscripcion'];
          id: string;
          plan: Database['public']['Enums']['plan_suscripcion'];
          revenue_cat_id: string;
          usuario_id: string;
          vigencia_hasta: string;
        };
        Insert: {
          created_at?: string;
          estado: Database['public']['Enums']['estado_suscripcion'];
          id?: string;
          plan: Database['public']['Enums']['plan_suscripcion'];
          revenue_cat_id: string;
          usuario_id: string;
          vigencia_hasta: string;
        };
        Update: {
          created_at?: string;
          estado?: Database['public']['Enums']['estado_suscripcion'];
          id?: string;
          plan?: Database['public']['Enums']['plan_suscripcion'];
          revenue_cat_id?: string;
          usuario_id?: string;
          vigencia_hasta?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'suscripciones_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: true;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      temporadas: {
        Row: {
          club_id: string;
          created_at: string;
          estado: Database['public']['Enums']['estado_temporada'];
          fecha_limite_cierre: string;
          id: string;
          temporada_externa: string;
          usuario_id: string;
        };
        Insert: {
          club_id: string;
          created_at?: string;
          estado?: Database['public']['Enums']['estado_temporada'];
          fecha_limite_cierre: string;
          id?: string;
          temporada_externa: string;
          usuario_id: string;
        };
        Update: {
          club_id?: string;
          created_at?: string;
          estado?: Database['public']['Enums']['estado_temporada'];
          fecha_limite_cierre?: string;
          id?: string;
          temporada_externa?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'temporadas_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'temporadas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      usuarios: {
        Row: {
          club_id: string | null;
          created_at: string;
          email: string;
          id: string;
          proveedor_auth: Database['public']['Enums']['proveedor_auth'];
          zona_horaria: string;
        };
        Insert: {
          club_id?: string | null;
          created_at?: string;
          email: string;
          id: string;
          proveedor_auth: Database['public']['Enums']['proveedor_auth'];
          zona_horaria?: string;
        };
        Update: {
          club_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          proveedor_auth?: Database['public']['Enums']['proveedor_auth'];
          zona_horaria?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usuarios_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      contexto_asistencia: 'EN_VIVO_LOCAL' | 'EN_VIVO_VISITA' | 'TRANSMISION';
      estado_asociacion_foto: 'ASOCIADA' | 'PENDIENTE_ASOCIACION';
      estado_partido: 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO';
      estado_pedido: 'PENDIENTE' | 'EN_IMPRESION' | 'LISTA' | 'FALLIDA' | 'ENVIADA';
      estado_recordatorio: 'ACTIVO' | 'DETENIDO_POR_FOTO' | 'SILENCIADO';
      estado_suscripcion: 'ACTIVA' | 'EN_GRACIA' | 'VENCIDA';
      estado_temporada:
        'CONFIGURACION' | 'ACTIVA' | 'CERRADA' | 'IMPRESION' | 'LISTA' | 'ENVIADA' | 'FALLIDA';
      plan_suscripcion: 'BASICO' | 'PREMIUM';
      proveedor_auth: 'apple' | 'google' | 'email';
      sub_modalidad_transmision: 'TELEVISION' | 'BAR' | 'STREAMING';
      tipo_competicion: 'LIGA' | 'COPA_NACIONAL' | 'INTERNACIONAL';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      contexto_asistencia: ['EN_VIVO_LOCAL', 'EN_VIVO_VISITA', 'TRANSMISION'],
      estado_asociacion_foto: ['ASOCIADA', 'PENDIENTE_ASOCIACION'],
      estado_partido: ['PROGRAMADO', 'EN_CURSO', 'FINALIZADO'],
      estado_pedido: ['PENDIENTE', 'EN_IMPRESION', 'LISTA', 'FALLIDA', 'ENVIADA'],
      estado_recordatorio: ['ACTIVO', 'DETENIDO_POR_FOTO', 'SILENCIADO'],
      estado_suscripcion: ['ACTIVA', 'EN_GRACIA', 'VENCIDA'],
      estado_temporada: [
        'CONFIGURACION',
        'ACTIVA',
        'CERRADA',
        'IMPRESION',
        'LISTA',
        'ENVIADA',
        'FALLIDA',
      ],
      plan_suscripcion: ['BASICO', 'PREMIUM'],
      proveedor_auth: ['apple', 'google', 'email'],
      sub_modalidad_transmision: ['TELEVISION', 'BAR', 'STREAMING'],
      tipo_competicion: ['LIGA', 'COPA_NACIONAL', 'INTERNACIONAL'],
    },
  },
} as const;
