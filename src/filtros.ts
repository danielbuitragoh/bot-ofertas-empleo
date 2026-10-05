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
  const textoBusqueda = `${oferta.titulo} ${oferta.etiquetas.join(' ')}`;

  if (filtros.palabrasClave.length > 0) {
    const algunaCoincide = filtros.palabrasClave.some((palabra) => contieneTermino(textoBusqueda, palabra));
    if (!algunaCoincide) return false;
  }

  const excluidaPorSenioridad = filtros.senioridadExcluida.some((palabra) => contieneTermino(textoBusqueda, palabra));
  if (excluidaPorSenioridad) return false;

  // Igual que con el salario: una oferta que no indica ubicación no se
  // descarta, porque perderla por falta de dato sería peor que dejarla pasar.
  if (filtros.ubicaciones.length > 0 && oferta.ubicacion) {
    const ubicacion = oferta.ubicacion;
    const enAlgunaUbicacion = filtros.ubicaciones.some((lugar) => contieneTermino(ubicacion, lugar));
    if (!enAlgunaUbicacion) return false;
  }

  if (filtros.salarioMinimoUSD !== null) {
    const salario = salarioMinimoParseado(oferta.salarioTexto);
    // Sin dato de salario -> no se descarta (ver comentario de la función de arriba).
    if (salario !== null && salario < filtros.salarioMinimoUSD) return false;
  }

  return true;
}

/**
 * ¿Aparece `termino` en `texto` como palabra (o frase) completa? Con una
 * búsqueda de subcadena, "lead" descartaba "Leadership", "staff" descartaba
 * "Staffing" y "java" encajaba con "JavaScript". Los bordes son cualquier
 * cosa que no sea letra o número, así que "node" sí encaja con "node.js" y
 * "c++" o "full stack" funcionan tal cual.
 */
function contieneTermino(texto: string, termino: string): boolean {
  const buscado = normalizarTexto(termino).trim();
  if (!buscado) return false;
  const escapado = buscado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapado}(?![\\p{L}\\p{N}])`, 'u').test(normalizarTexto(texto));
}

/** Minúsculas y sin acentos, para que "Desarrolládor" y "desarrollador" coincidan. */
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
