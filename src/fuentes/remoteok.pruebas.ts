import { describe, expect, it, vi } from 'vitest';
import { obtenerRemoteOK } from './remoteok.js';

function respuestaFalsa(cuerpo: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => cuerpo,
  }) as unknown as typeof fetch;
}

describe('obtenerRemoteOK', () => {
  // Casos reales del API: algunos textos llegan con el UTF-8 decodificado
  // dos veces ("Mecánico" -> "MecÃ¡nico"), lo que además rompía la
  // deduplicación contra la misma oferta en otra fuente.
  it('repara los acentos que RemoteOK manda con doble codificación', async () => {
    const cuerpo = [
      {
        id: '1',
        company: 'Workana',
        position: 'MecÃ¡nico Automotriz DiagnÃ³stico',
        url: 'https://remoteok.com/remote-jobs/1',
      },
      {
        id: '2',
        company: 'Tessera Labs',
        position: 'Oracle Fusion Cloud Lead â\u0080\u0094 Logistics',
        url: 'https://remoteok.com/remote-jobs/2',
      },
    ];
    const ofertas = await obtenerRemoteOK(respuestaFalsa(cuerpo));
    expect(ofertas[0].titulo).toBe('Mecánico Automotriz Diagnóstico');
    expect(ofertas[1].titulo).toBe('Oracle Fusion Cloud Lead — Logistics');
  });

  it('no toca textos correctos aunque lleven "Ã", ni los que no se pueden reparar enteros', async () => {
    const cuerpo = [
      { id: '1', company: 'SÃO PAULO TECH', position: 'Dev', url: 'https://remoteok.com/remote-jobs/1' },
      // Cortado a mitad de carácter por RemoteOK: repararlo dejaría un "�".
      { id: '2', company: 'DoiT', position: 'SDR Attributeâ\u0084', url: 'https://remoteok.com/remote-jobs/2' },
    ];
    const ofertas = await obtenerRemoteOK(respuestaFalsa(cuerpo));
    expect(ofertas[0].empresa).toBe('SÃO PAULO TECH');
    expect(ofertas[1].titulo).toBe('SDR Attributeâ\u0084');
  });

  it('salta el primer elemento cuando es el aviso legal (sin id)', async () => {
    const cuerpo = [
      { legal: 'Aviso legal de RemoteOK, no es una oferta' },
      {
        id: '123',
        company: 'Acme',
        position: 'Backend Developer',
        url: 'https://remoteok.com/remote-jobs/123',
        date: '2026-09-20T00:00:00Z',
        tags: ['node', 'typescript'],
      },
    ];
    const ofertas = await obtenerRemoteOK(respuestaFalsa(cuerpo));
    expect(ofertas).toHaveLength(1);
    expect(ofertas[0].empresa).toBe('Acme');
    expect(ofertas[0].fuente).toBe('remoteok');
  });

  it('no falla si por algún motivo no hay aviso legal al principio', async () => {
    const cuerpo = [
      {
        id: '456',
        company: 'Beta',
        position: 'Frontend Developer',
        url: 'https://remoteok.com/remote-jobs/456',
        date: '2026-09-20T00:00:00Z',
      },
    ];
    const ofertas = await obtenerRemoteOK(respuestaFalsa(cuerpo));
    expect(ofertas).toHaveLength(1);
  });

  it('construye el texto de salario solo cuando hay min y max', async () => {
    const cuerpo = [
      {
        id: '789',
        company: 'Gamma',
        position: 'Fullstack Developer',
        url: 'https://remoteok.com/remote-jobs/789',
        salary_min: 90000,
        salary_max: 130000,
      },
    ];
    const ofertas = await obtenerRemoteOK(respuestaFalsa(cuerpo));
    expect(ofertas[0].salarioTexto).toBe('$90,000 - $130,000');
  });

  it('lanza un error legible si la respuesta no es un array', async () => {
    await expect(obtenerRemoteOK(respuestaFalsa({ error: 'algo cambió' }))).rejects.toThrow(/forma inesperada/);
  });
});
