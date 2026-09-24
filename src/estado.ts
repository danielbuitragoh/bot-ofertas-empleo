import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Estado } from './tipos.js';
import { estadoInicial } from './tipos.js';

/**
 * GitHub Actions no recuerda nada entre ejecuciones: cada corrida arranca
 * un contenedor nuevo. Hay dos formas razonables de que el bot recuerde
 * qué ofertas ya notificó: commitear un JSON al propio repo, o guardar el
 * estado en un servicio externo (la especificación original sugería el
 * API de `api-postulaciones`).
 *
 * Se eligió **solo el JSON committeado** para el estado del bot (hashes
 * notificados, filtros, contadores): es lo único que no depende de que un
 * segundo servicio esté despierto y accesible en el momento exacto del
 * cron, y el propio historial de git del archivo es, de regalo, un log de
 * qué se notificó y cuándo. La contrapartida documentada es que cada
 * ejecución añade un commit automático — se acepta porque es un repo de
 * bot, no una librería que alguien vaya a `git log` por otra razón.
 *
 * El API de `api-postulaciones` sí se usa, pero solo para `/guardar` (ver
 * src/comandos.ts): eso es lo que de verdad "conecta los proyectos" —
 * mandar una oferta encontrada al sistema de gestión — y no depende de
 * que ese servicio esté arriba para que el resto del bot funcione.
 */
const RUTA_ESTADO = 'estado/datos.json';

export async function cargarEstado(ruta: string = RUTA_ESTADO): Promise<Estado> {
  try {
    const contenido = await readFile(ruta, 'utf-8');
    const datos = JSON.parse(contenido) as Partial<Estado>;
    // Fusiona sobre el estado inicial para que añadir un campo nuevo al
    // tipo Estado no rompa la carga de un datos.json más viejo.
    return { ...estadoInicial(), ...datos };
  } catch (error) {
    if (esErrorArchivoInexistente(error)) {
      return estadoInicial();
    }
    throw error;
  }
}

export async function guardarEstado(estado: Estado, ruta: string = RUTA_ESTADO): Promise<void> {
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, JSON.stringify(estado, null, 2) + '\n', 'utf-8');
}

function esErrorArchivoInexistente(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT';
}
