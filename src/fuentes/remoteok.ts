import type { OfertaEmpleo } from '../tipos.js';

/**
 * RemoteOK: GET https://remoteok.com/api
 *
 * La trampa: el primer elemento del array no es una oferta, es un aviso
 * legal ({ legal: "...", ... }). Si no se salta, la primera "oferta" del
 * bot es un texto legal de la propia RemoteOK — se detecta por la ausencia
 * de `id` en ese primer elemento, en vez de asumir a ciegas `slice(1)`,
 * porque confiar en la posición y no en la forma del dato es lo que rompe
 * el día que RemoteOK cambie el orden.
 */
interface OfertaRemoteOK {
  id?: string;
  slug?: string;
  company?: string;
  position?: string;
  url?: string;
  date?: string; // ISO 8601
  salary_min?: number;
  salary_max?: number;
  location?: string;
  tags?: string[];
  legal?: string;
}

export async function obtenerRemoteOK(fetchImpl: typeof fetch = fetch): Promise<OfertaEmpleo[]> {
  const respuesta = await fetchImpl('https://remoteok.com/api', {
    headers: { 'User-Agent': 'bot-ofertas-empleo (uso personal, ver README)' },
  });

  if (!respuesta.ok) {
    throw new Error(`RemoteOK respondió ${respuesta.status}`);
  }

  const cuerpo = (await respuesta.json()) as OfertaRemoteOK[];
  if (!Array.isArray(cuerpo)) {
    throw new Error('RemoteOK: respuesta con forma inesperada (se esperaba un array)');
  }

  return cuerpo
    .filter((item): item is OfertaRemoteOK & { id: string } => typeof item.id === 'string' && item.id.length > 0)
    .map((item) => normalizar(item))
    .filter((oferta): oferta is OfertaEmpleo => oferta !== null);
}

/**
 * Segunda trampa: algunos textos llegan con el UTF-8 decodificado dos
 * veces, así que "Mecánico" aparece como "MecÃ¡nico". Además de verse mal,
 * rompía la deduplicación contra la misma oferta publicada en otra fuente.
 *
 * Solo se repara cuando el texto tiene la firma de ese error (un byte de
 * inicio de UTF-8 seguido de uno de continuación) y la reparación da un
 * texto válido: "SÃO PAULO" es correcto y no se toca, y un carácter que
 * RemoteOK corta por la mitad se deja como viene en vez de convertirlo en "�".
 */
function repararDobleCodificacion(texto: string): string {
  if (!/[Â-ô][\u0080-¿]/.test(texto)) return texto;
  if ([...texto].some((caracter) => caracter.charCodeAt(0) > 0xff)) return texto;
  const reparado = Buffer.from(texto, 'latin1').toString('utf8');
  return reparado.includes('�') ? texto : reparado;
}

function normalizar(item: OfertaRemoteOK & { id: string }): OfertaEmpleo | null {
  if (!item.position || !item.company || !item.url) return null;

  const salarioTexto =
    item.salary_min && item.salary_max
      ? `$${item.salary_min.toLocaleString('en-US')} - $${item.salary_max.toLocaleString('en-US')}`
      : null;

  const publicadoEn = item.date ? Date.parse(item.date) : Date.now();

  return {
    idFuente: item.id,
    fuente: 'remoteok',
    titulo: repararDobleCodificacion(item.position),
    empresa: repararDobleCodificacion(item.company),
    url: item.url,
    publicadoEn: Number.isNaN(publicadoEn) ? Date.now() : publicadoEn,
    salarioTexto,
    ubicacion: item.location ? repararDobleCodificacion(item.location) : null,
    etiquetas: item.tags ?? [],
  };
}
