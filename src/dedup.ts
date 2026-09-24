import type { HashDedup, OfertaEmpleo } from './tipos.js';

/**
 * El mismo empleo puede aparecer en varias fuentes (una empresa que
 * publica en RemoteOK y en Himalayas a la vez). El id de fuente no sirve
 * para detectarlo porque cada fuente tiene su propio espacio de ids. Se
 * usa `empresa + título`, normalizados, como huella: minúsculas, sin
 * acentos, espacios colapsados y signos de puntuación fuera. No es
 * perfecto (dos títulos casi iguales pero no idénticos no se detectan),
 * pero es determinista y no necesita llamar a nada.
 */
export function normalizarParaHash(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function calcularHash(oferta: OfertaEmpleo): HashDedup {
  return `${normalizarParaHash(oferta.empresa)}::${normalizarParaHash(oferta.titulo)}`;
}

export interface ResultadoDedup {
  nuevas: OfertaEmpleo[];
  descartadas: number;
}

/**
 * Recibe ofertas de las 4 fuentes ya juntas y devuelve solo las que no se
 * han visto nunca (ni en esta tanda, por si dos fuentes traen la misma
 * oferta en la misma ejecución, ni en ejecuciones anteriores, vía
 * `hashesYaNotificados`).
 */
export function deduplicar(ofertas: OfertaEmpleo[], hashesYaNotificados: HashDedup[]): ResultadoDedup {
  const vistos = new Set(hashesYaNotificados);
  const nuevas: OfertaEmpleo[] = [];
  let descartadas = 0;

  for (const oferta of ofertas) {
    const hash = calcularHash(oferta);
    if (vistos.has(hash)) {
      descartadas += 1;
      continue;
    }
    vistos.add(hash);
    nuevas.push(oferta);
  }

  return { nuevas, descartadas };
}
