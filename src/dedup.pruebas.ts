import { describe, expect, it } from 'vitest';
import { calcularHash, deduplicar, normalizarParaHash } from './dedup.js';
import type { OfertaEmpleo } from './tipos.js';

function oferta(parcial: Partial<OfertaEmpleo>): OfertaEmpleo {
  return {
    idFuente: '1',
    fuente: 'remoteok',
    titulo: 'Desarrollador Backend',
    empresa: 'Acme Corp',
    url: 'https://ejemplo.test/1',
    publicadoEn: Date.now(),
    salarioTexto: null,
    ubicacion: null,
    etiquetas: [],
    ...parcial,
  };
}

describe('normalizarParaHash', () => {
  it('quita acentos, pasa a minúsculas y colapsa espacios', () => {
    expect(normalizarParaHash('  Desarrollador Backend/Full-Stack  ')).toBe('desarrollador backend full stack');
    expect(normalizarParaHash('Ingeniería')).toBe('ingenieria');
  });
});

describe('calcularHash', () => {
  it('la misma oferta en dos fuentes distintas produce el mismo hash', () => {
    const a = oferta({ fuente: 'remoteok', idFuente: 'abc' });
    const b = oferta({ fuente: 'himalayas', idFuente: 'xyz' });
    expect(calcularHash(a)).toBe(calcularHash(b));
  });

  it('distinta empresa o título produce hashes distintos', () => {
    const a = oferta({ empresa: 'Acme Corp' });
    const b = oferta({ empresa: 'Otra Empresa' });
    expect(calcularHash(a)).not.toBe(calcularHash(b));
  });
});

describe('deduplicar', () => {
  it('descarta duplicados dentro de la misma tanda (dos fuentes, misma oferta)', () => {
    const a = oferta({ fuente: 'remoteok', idFuente: '1' });
    const b = oferta({ fuente: 'himalayas', idFuente: '2' });
    const { nuevas, descartadas } = deduplicar([a, b], []);
    expect(nuevas).toHaveLength(1);
    expect(descartadas).toBe(1);
  });

  it('descarta lo que ya estaba en hashesYaNotificados de ejecuciones anteriores', () => {
    const a = oferta({});
    const hashPrevio = calcularHash(a);
    const { nuevas, descartadas } = deduplicar([a], [hashPrevio]);
    expect(nuevas).toHaveLength(0);
    expect(descartadas).toBe(1);
  });

  it('deja pasar ofertas realmente distintas', () => {
    const a = oferta({ titulo: 'Backend' });
    const b = oferta({ titulo: 'Frontend' });
    const { nuevas } = deduplicar([a, b], []);
    expect(nuevas).toHaveLength(2);
  });
});
