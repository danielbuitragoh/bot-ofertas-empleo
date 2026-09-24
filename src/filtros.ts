import type { Filtros, OfertaEmpleo } from './tipos.js';

/**
 * Intenta leer un número de `salarioTexto`. Cuatro fuentes, cuatro
 * formatos: "$120k - $160k", "USD 90,000 - 120,000", vacío, etc. Cuando no
 * se puede parsear con confianza, se devuelve null — y una oferta sin
 * salario parseable **nunca se descarta** por el filtro de salario mínimo:
 * descartar por falta de dato sería peor que no filtrar, porque perderías
 * ofertas buenas solo porque su formato de salario no encajó con el regex.
 */
export function salarioMinimoParseado(salarioTexto: string | null): number | null {
  if (!salarioTexto) return null;

  const conK = salarioTexto.match(/(\d+(?:\.\d+)?)\s*k/i);
  if (conK) {
    return Math.round(parseFloat(conK[1]) * 1000);
  }

  const numeros = salarioTexto.match(/[\d,]{3,}/g);
  if (!numeros || numeros.length === 0) return null;

  const primero = Number(numeros[0].replace(/,/g, ''));
  return Number.isFinite(primero) ? primero : null;
}

export function coincideConFiltros(oferta: OfertaEmpleo, filtros: Filtros): boolean {
  const textoBusqueda = normalizarTexto(`${oferta.titulo} ${oferta.etiquetas.join(' ')}`);

  if (filtros.palabrasClave.length > 0) {
    const algunaCoincide = filtros.palabrasClave.some((palabra) =>
      textoBusqueda.includes(normalizarTexto(palabra)),
    );
    if (!algunaCoincide) return false;
  }

  const excluidaPorSenioridad = filtros.senioridadExcluida.some((palabra) =>
    textoBusqueda.includes(normalizarTexto(palabra)),
  );
  if (excluidaPorSenioridad) return false;

  if (filtros.salarioMinimoUSD !== null) {
    const salario = salarioMinimoParseado(oferta.salarioTexto);
    // Sin dato de salario -> no se descarta (ver comentario de la función de arriba).
    if (salario !== null && salario < filtros.salarioMinimoUSD) return false;
  }

  return true;
}

function normalizarTexto(texto: string): string {
  return texto.toLowerCase();
}
