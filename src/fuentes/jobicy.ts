import type { OfertaEmpleo } from '../tipos.js';

/**
 * Jobicy: GET https://jobicy.com/api/v2/remote-jobs?count=50&geo=spain
 *
 * La quinta fuente, y la única que filtra por país en origen: `geo=spain`
 * devuelve solo ofertas remotas abiertas a candidatos en España (las otras
 * cuatro son internacionales y muchas resultan ser solo para EE. UU.).
 *
 * Las trampas:
 * - El salario puede venir por año, mes u hora (`salaryPeriod`). El filtro
 *   de salario mínimo compara contra una cifra anual, así que solo se
 *   rellena `salarioTexto` cuando es anual: un "EUR 3,000" mensual se
 *   descartaría por estar debajo de 80000. Sin dato, la oferta no se
 *   descarta (ver src/filtros.ts).
 * - El nivel ("Senior", "Director", "Entry-Level, Junior") viene en un
 *   campo aparte, no en el título. Se añade a las etiquetas para que el
 *   filtro de seniority también lo vea.
 * - `jobGeo` separa países con coma y espacios dobles ("Estonia,  Spain").
 *
 * Sus condiciones de uso piden citar a Jobicy con enlace (está en la tabla
 * de fuentes del README) y que la candidatura vaya a la URL original de la
 * oferta, que es justo lo que se manda por Telegram.
 */
interface OfertaJobicy {
  id?: number;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  jobIndustry?: string[];
  jobGeo?: string;
  jobLevel?: string;
  pubDate?: string; // ISO 8601
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

export async function obtenerJobicy(fetchImpl: typeof fetch = fetch): Promise<OfertaEmpleo[]> {
  const respuesta = await fetchImpl('https://jobicy.com/api/v2/remote-jobs?count=50&geo=spain', {
    headers: { 'User-Agent': 'bot-ofertas-empleo (uso personal, ver README)' },
  });

  if (!respuesta.ok) {
    throw new Error(`Jobicy respondió ${respuesta.status}`);
  }

  const cuerpo = (await respuesta.json()) as { jobs?: OfertaJobicy[] };
  if (!Array.isArray(cuerpo.jobs)) {
    throw new Error('Jobicy: respuesta con forma inesperada (falta el array "jobs")');
  }

  return cuerpo.jobs.map(normalizar).filter((oferta): oferta is OfertaEmpleo => oferta !== null);
}

function normalizar(item: OfertaJobicy): OfertaEmpleo | null {
  if (item.id === undefined || !item.jobTitle || !item.companyName || !item.url) return null;

  const salarioTexto =
    item.salaryMin && item.salaryPeriod === 'yearly'
      ? `${item.salaryCurrency ?? 'USD'} ${item.salaryMin.toLocaleString('en-US')}${
          item.salaryMax && item.salaryMax !== item.salaryMin ? ` - ${item.salaryMax.toLocaleString('en-US')}` : ''
        }`
      : null;

  const publicadoEn = item.pubDate ? Date.parse(item.pubDate) : Date.now();
  const ubicacion = item.jobGeo?.split(',').map((pais) => pais.trim()).filter(Boolean).join(', ');

  return {
    idFuente: String(item.id),
    fuente: 'jobicy',
    titulo: item.jobTitle,
    empresa: item.companyName,
    url: item.url,
    publicadoEn: Number.isNaN(publicadoEn) ? Date.now() : publicadoEn,
    salarioTexto,
    ubicacion: ubicacion || null,
    etiquetas: [...(item.jobIndustry ?? []), ...(item.jobLevel ? [item.jobLevel] : [])],
  };
}
