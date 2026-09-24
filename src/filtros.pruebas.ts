import { describe, expect, it } from 'vitest';
import { coincideConFiltros, salarioMinimoParseado } from './filtros.js';
import { FILTROS_POR_DEFECTO } from './tipos.js';
import type { OfertaEmpleo } from './tipos.js';

function oferta(parcial: Partial<OfertaEmpleo>): OfertaEmpleo {
  return {
    idFuente: '1',
    fuente: 'remoteok',
    titulo: 'Backend Developer',
    empresa: 'Acme',
    url: 'https://ejemplo.test',
    publicadoEn: Date.now(),
    salarioTexto: null,
    ubicacion: null,
    etiquetas: [],
    ...parcial,
  };
}

describe('salarioMinimoParseado', () => {
  it('parsea formato "$120k - $160k" quedándose con el primer número', () => {
    expect(salarioMinimoParseado('$120k - $160k')).toBe(120000);
  });

  it('parsea formato "USD 90,000 - 120,000"', () => {
    expect(salarioMinimoParseado('USD 90,000 - 120,000')).toBe(90000);
  });

  it('devuelve null cuando no hay texto', () => {
    expect(salarioMinimoParseado(null)).toBeNull();
  });

  it('devuelve null cuando el texto no tiene ningún número reconocible', () => {
    expect(salarioMinimoParseado('A convenir')).toBeNull();
  });
});

describe('coincideConFiltros', () => {
  it('sin filtros de palabra clave, todo pasa', () => {
    expect(coincideConFiltros(oferta({}), { ...FILTROS_POR_DEFECTO, senioridadExcluida: [] })).toBe(true);
  });

  it('excluye por senioridad aunque el resto encaje', () => {
    const filtros = { ...FILTROS_POR_DEFECTO, senioridadExcluida: ['senior'] };
    expect(coincideConFiltros(oferta({ titulo: 'Senior Backend Developer' }), filtros)).toBe(false);
    expect(coincideConFiltros(oferta({ titulo: 'Backend Developer' }), filtros)).toBe(true);
  });

  it('exige que alguna palabra clave aparezca en título o etiquetas', () => {
    const filtros = { ...FILTROS_POR_DEFECTO, senioridadExcluida: [], palabrasClave: ['react'] };
    expect(coincideConFiltros(oferta({ titulo: 'Backend Developer', etiquetas: ['node'] }), filtros)).toBe(false);
    expect(coincideConFiltros(oferta({ titulo: 'React Developer' }), filtros)).toBe(true);
    expect(coincideConFiltros(oferta({ titulo: 'Backend Developer', etiquetas: ['react', 'node'] }), filtros)).toBe(
      true,
    );
  });

  it('descarta por salario mínimo solo cuando el salario se pudo parsear', () => {
    const filtros = { ...FILTROS_POR_DEFECTO, senioridadExcluida: [], salarioMinimoUSD: 100000 };
    expect(coincideConFiltros(oferta({ salarioTexto: '$80k - $90k' }), filtros)).toBe(false);
    expect(coincideConFiltros(oferta({ salarioTexto: '$120k - $150k' }), filtros)).toBe(true);
    // Sin salario parseable, no se descarta: perder una oferta buena por un
    // formato de salario que no se reconoció sería peor que dejarla pasar.
    expect(coincideConFiltros(oferta({ salarioTexto: 'A convenir' }), filtros)).toBe(true);
    expect(coincideConFiltros(oferta({ salarioTexto: null }), filtros)).toBe(true);
  });
});
