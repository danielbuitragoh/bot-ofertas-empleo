import { XMLParser } from 'fast-xml-parser';
import type { OfertaEmpleo } from '../tipos.js';

/**
 * WeWorkRemotely: GET https://weworkremotely.com/remote-jobs.rss
 *
 * La trampa: es RSS, no JSON, y la empresa viene incrustada en el título
 * separada por dos puntos, p. ej. "Empresa X: Desarrollador backend". No
 * siempre hay dos puntos (algunas categorías del feed no siguen el
 * patrón) — cuando no aparece, se usa el título completo como puesto y la
 * empresa queda como "Sin especificar" en vez de adivinar mal.
 */
interface ItemRSS {
  title?: string;
  link?: string;
  pubDate?: string;
  region?: string;
  category?: string | string[];
}

export async function obtenerWeWorkRemotely(fetchImpl: typeof fetch = fetch): Promise<OfertaEmpleo[]> {
  const respuesta = await fetchImpl('https://weworkremotely.com/remote-jobs.rss', {
    headers: { 'User-Agent': 'bot-ofertas-empleo (uso personal, ver README)' },
  });

  if (!respuesta.ok) {
    throw new Error(`WeWorkRemotely respondió ${respuesta.status}`);
  }

  const xml = await respuesta.text();
  return parsearRSS(xml);
}

/** Separado del fetch para poder probarlo con XML de ejemplo, sin red (ver src/fuentes/weworkremotely.pruebas.ts). */
export function parsearRSS(xml: string): OfertaEmpleo[] {
  // La <description> de cada item es HTML escapado: el feed real suma más
  // de 27.000 entidades (&lt;, &amp;...) y fast-xml-parser corta a las 1.000
  // expansiones, así que el parseo lanzaba siempre. Solo se resuelven las
  // entidades de los campos que se leen; el límite se mantiene para esos.
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: {
      allowedTags: ['title', 'link', 'pubDate', 'region', 'category'],
      maxTotalExpansions: 1000,
    },
  });
  const doc = parser.parse(xml) as {
    rss?: { channel?: { item?: ItemRSS | ItemRSS[] } };
  };

  const itemsCrudos = doc.rss?.channel?.item;
  if (!itemsCrudos) return [];

  const items = Array.isArray(itemsCrudos) ? itemsCrudos : [itemsCrudos];

  return items
    .map((item) => normalizar(item))
    .filter((oferta): oferta is OfertaEmpleo => oferta !== null);
}

function normalizar(item: ItemRSS): OfertaEmpleo | null {
  if (!item.title || !item.link) return null;

  const separador = item.title.indexOf(':');
  const empresa = separador > 0 ? item.title.slice(0, separador).trim() : 'Sin especificar';
  const titulo = separador > 0 ? item.title.slice(separador + 1).trim() : item.title.trim();

  const publicadoEn = item.pubDate ? Date.parse(item.pubDate) : Date.now();

  const etiquetas = Array.isArray(item.category)
    ? item.category
    : item.category
      ? [item.category]
      : [];

  return {
    // El feed no trae un id explícito: se usa el final del link, que es
    // estable y único por oferta. No el link entero: el id sale en cada
    // aviso y se escribe a mano en /guardar.
    idFuente: item.link.split('/').filter(Boolean).pop() ?? item.link,
    fuente: 'weworkremotely',
    titulo,
    empresa,
    url: item.link,
    publicadoEn: Number.isNaN(publicadoEn) ? Date.now() : publicadoEn,
    salarioTexto: null, // el feed no incluye salario
    ubicacion: item.region ?? null,
    etiquetas,
  };
}
