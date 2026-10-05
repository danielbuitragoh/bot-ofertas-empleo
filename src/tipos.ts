/**
 * Esquema único al que se normalizan las cinco fuentes. Cada fuente trae su
 * propio formato (ver src/fuentes/*.ts) — este es el único tipo que ve el
 * resto del programa (dedup, filtros, notificación).
 */
export interface OfertaEmpleo {
  /** Identificador estable dentro de la fuente (no global: dos fuentes pueden repetir el id). */
  idFuente: string;
  fuente: 'remoteok' | 'remotive' | 'weworkremotely' | 'himalayas' | 'jobicy';
  titulo: string;
  empresa: string;
  /** URL de la oferta. Obligatoria: es lo único que se manda por Telegram para no reescribir texto de terceros. */
  url: string;
  /** Milisegundos desde epoch. Cada fuente trae fechas en un formato distinto; aquí siempre en ms. */
  publicadoEn: number;
  /** Texto libre tal cual lo da la fuente ("$120k - $160k", "USD 90000", etc.) — no se intenta parsear a número: ver decisión en el README. */
  salarioTexto: string | null;
  ubicacion: string | null;
  etiquetas: string[];
}

/** Clave de deduplicación: empresa + título normalizados (minúsculas, sin acentos, espacios colapsados). */
export type HashDedup = string;

export interface Filtros {
  /** Si la lista está vacía, no filtra por palabra clave (todo pasa). */
  palabrasClave: string[];
  /** Subcadena buscada en `etiquetas`/`titulo` en minúsculas, p. ej. "senior" para excluir. */
  senioridadExcluida: string[];
  /** null = sin mínimo. Solo se aplica a ofertas cuyo salario se pudo parsear a número (ver salarioMinimoParseado). */
  salarioMinimoUSD: number | null;
  /** Si la lista está vacía, no filtra por ubicación. Una oferta sin ubicación indicada nunca se descarta. */
  ubicaciones: string[];
  pausado: boolean;
}

export const FILTROS_POR_DEFECTO: Filtros = {
  palabrasClave: [],
  senioridadExcluida: ['senior', 'staff', 'principal', 'lead', 'director'],
  salarioMinimoUSD: null,
  ubicaciones: [],
  pausado: false,
};

/** Estado que persiste entre ejecuciones de GitHub Actions (ver src/estado.ts). */
export interface Estado {
  /** Hashes de ofertas ya notificadas — para no avisar dos veces de lo mismo ni entre fuentes distintas. */
  hashesNotificados: HashDedup[];
  /** Últimas ofertas vistas, para que /ultimas funcione sin volver a llamar a las 4 fuentes. */
  ultimasOfertas: OfertaEmpleo[];
  /**
   * idFuente de las ofertas ya mandadas al gestor con /guardar. Sin esto,
   * si una ejecución procesa el comando pero el commit del estado al
   * final falla (por ejemplo, un push rechazado), la próxima corrida
   * recibiría el mismo update de Telegram sin confirmar y volvería a
   * llamar a `guardarEnGestor`, creando la misma postulación dos veces.
   */
  idsGuardadosEnGestor: string[];
  filtros: Filtros;
  /** update_id más alto de Telegram ya procesado, para no reprocesar comandos (ver src/telegram.ts). */
  ultimoUpdateIdProcesado: number;
  /** Contadores para /stats: cuántas ofertas ha traído cada fuente y cuántas eran duplicadas. */
  estadisticas: {
    porFuente: Record<OfertaEmpleo['fuente'], number>;
    duplicadosDescartados: number;
    ultimaEjecucion: string | null;
  };
}

export function estadoInicial(): Estado {
  return {
    hashesNotificados: [],
    ultimasOfertas: [],
    idsGuardadosEnGestor: [],
    filtros: { ...FILTROS_POR_DEFECTO },
    ultimoUpdateIdProcesado: 0,
    estadisticas: {
      porFuente: { remoteok: 0, remotive: 0, weworkremotely: 0, himalayas: 0, jobicy: 0 },
      duplicadosDescartados: 0,
      ultimaEjecucion: null,
    },
  };
}
