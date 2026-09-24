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
