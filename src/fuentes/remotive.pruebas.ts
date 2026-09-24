import { describe, expect, it, vi } from 'vitest';
import { obtenerRemotive } from './remotive.js';

function respuestaFalsa(cuerpo: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => cuerpo,
  }) as unknown as typeof fetch;
}

describe('obtenerRemotive', () => {
  it('normaliza una oferta con salario vacío a null', async () => {
    const cuerpo = {
      jobs: [
        {
          id: 1,
          title: 'Backend Developer',
          company_name: 'Zeta',
          url: 'https://remotive.com/remote-jobs/1',
          publication_date: '2026-09-20T00:00:00',
          salary: '',
          candidate_required_location: 'Worldwide',
          tags: ['python'],
        },
      ],
    };
    const ofertas = await obtenerRemotive(respuestaFalsa(cuerpo));
    expect(ofertas[0].salarioTexto).toBeNull();
    expect(ofertas[0].ubicacion).toBe('Worldwide');
  });

  it('lanza un error legible si falta el array "jobs"', async () => {
    await expect(obtenerRemotive(respuestaFalsa({}))).rejects.toThrow(/forma inesperada/);
  });
});
