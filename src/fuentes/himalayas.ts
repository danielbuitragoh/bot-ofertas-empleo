import type { OfertaEmpleo } from '../tipos.js';

/**
 * Himalayas: GET https://himalayas.app/jobs/api?limit=100&offset=0
 *
 * La trampa: JSON paginado (con offset), salarios numéricos (min/max en
 * USD, a diferencia de las otras tres fuentes que dan texto libre o nada),
 * y fechas en epoch **en segundos**, no en milisegundos — hay que
 * multiplicar por 1000 o toda fecha sale en 1970.
 */
interface OfertaHimalayas {
  guid: string;
  title: string;
  companyName: string;
  applicationLink: string;
  pubDate: number; // epoch en SEGUNDOS
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryCurrency?: string | null;
  locationRestrictions?: string[];
  categories?: string[];
}

interface RespuestaHimalayas {
  jobs: OfertaHimalayas[];
}

export async function obtenerHimalayas(fetchImpl: typeof fetch = fetch): Promise<OfertaEmpleo[]> {
  const respuesta = await fetchImpl('https://himalayas.app/jobs/api?limit=100&offset=0', {
    headers: { 'User-Agent': 'bot-ofertas-empleo (uso personal, ver README)' },
  });

  if (!respuesta.ok) {
    throw new Error(`Himalayas respondió ${respuesta.status}`);
  }

  const cuerpo = (await respuesta.json()) as RespuestaHimalayas;
  if (!Array.isArray(cuerpo.jobs)) {
    throw new Error('Himalayas: respuesta con forma inesperada (falta el array "jobs")');
  }

  return cuerpo.jobs.map(normalizar);
}

/**
 * El guid es la URL completa de la oferta. Como id se usa "empresa/puesto"
 * de su ruta: el id sale en cada aviso y se escribe a mano en /guardar, y
 * la URL entera repetía el enlace y era incómoda de copiar. Si el guid no
 * es una URL con esa forma, se usa tal cual.
 */
function idCorto(guid: string): string {
  const coincidencia = /\/companies\/([^/]+)\/jobs\/([^/?#]+)/.exec(guid);
  return coincidencia ? `${coincidencia[1]}/${coincidencia[2]}` : guid;
}

function normalizar(item: OfertaHimalayas): OfertaEmpleo {
  const moneda = item.salaryCurrency ?? 'USD';
  const salarioTexto =
    item.minSalary && item.maxSalary
      ? `${moneda} ${item.minSalary.toLocaleString('en-US')} - ${item.maxSalary.toLocaleString('en-US')}`
      : null;

  return {
    idFuente: idCorto(item.guid),
    fuente: 'himalayas',
    titulo: item.title,
    empresa: item.companyName,
    url: item.applicationLink,
    // epoch en segundos -> milisegundos: la trampa de esta fuente.
    publicadoEn: item.pubDate * 1000,
    salarioTexto,
    ubicacion: item.locationRestrictions?.join(', ') ?? null,
    etiquetas: item.categories ?? [],
  };
}
