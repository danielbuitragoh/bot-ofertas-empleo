import type { OfertaEmpleo } from '../tipos.js';

/**
 * Remotive: GET https://remotive.com/api/remote-jobs?search=&limit=
 *
 * La trampa: el límite de la propia API es 4 peticiones al día, y pasar de
 * 2 por minuto bloquea. Por eso el cron de este proyecto corre cada 6
 * horas (4 veces al día, ver README) y no cada 5 minutos como GitHub
 * Actions permitiría. Además los datos vienen con 24h de retraso
 * deliberado — otra razón por la que ir más rápido no serviría de nada:
 * no habría nada nuevo que ver.
 */
interface OfertaRemotive {
  id: number;
  title: string;
  company_name: string;
  url: string;
  publication_date: string; // ISO 8601
  salary: string; // texto libre, casi siempre vacío
  candidate_required_location: string;
  tags: string[];
}

interface RespuestaRemotive {
  jobs: OfertaRemotive[];
}

export async function obtenerRemotive(fetchImpl: typeof fetch = fetch): Promise<OfertaEmpleo[]> {
  const respuesta = await fetchImpl('https://remotive.com/api/remote-jobs?limit=100', {
    headers: { 'User-Agent': 'bot-ofertas-empleo (uso personal, ver README)' },
  });

  if (!respuesta.ok) {
    throw new Error(`Remotive respondió ${respuesta.status}`);
  }

  const cuerpo = (await respuesta.json()) as RespuestaRemotive;
  if (!Array.isArray(cuerpo.jobs)) {
    throw new Error('Remotive: respuesta con forma inesperada (falta el array "jobs")');
  }

  return cuerpo.jobs.map(normalizar);
}

function normalizar(item: OfertaRemotive): OfertaEmpleo {
  const publicadoEn = Date.parse(item.publication_date);

  return {
    idFuente: String(item.id),
    fuente: 'remotive',
    titulo: item.title,
    empresa: item.company_name,
    url: item.url,
    publicadoEn: Number.isNaN(publicadoEn) ? Date.now() : publicadoEn,
    salarioTexto: item.salary && item.salary.trim().length > 0 ? item.salary.trim() : null,
    ubicacion: item.candidate_required_location || null,
    etiquetas: item.tags ?? [],
  };
}
