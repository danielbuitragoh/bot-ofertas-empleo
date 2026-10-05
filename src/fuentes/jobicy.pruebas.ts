import { describe, expect, it, vi } from 'vitest';
import { obtenerJobicy } from './jobicy.js';

function respuestaFalsa(cuerpo: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => cuerpo,
  }) as unknown as typeof fetch;
}

function ofertaJobicy(parcial: Record<string, unknown> = {}) {
  return {
    id: 154608,
    url: 'https://jobicy.com/jobs/154608-backend-developer',
    jobTitle: 'Backend Developer',
    companyName: 'Veriff',
    jobIndustry: ['Software Engineering'],
    jobGeo: 'Estonia,  Spain',
    jobLevel: 'Senior',
    pubDate: '2026-10-05T14:05:57+00:00',
    ...parcial,
  };
}

describe('obtenerJobicy', () => {
  it('normaliza id, ubicación y fecha', async () => {
    const ofertas = await obtenerJobicy(respuestaFalsa({ jobs: [ofertaJobicy()] }));
    expect(ofertas[0]).toMatchObject({
      idFuente: '154608',
      fuente: 'jobicy',
      empresa: 'Veriff',
      ubicacion: 'Estonia, Spain',
      publicadoEn: Date.parse('2026-10-05T14:05:57+00:00'),
    });
  });

  it('añade el nivel a las etiquetas para que lo vea el filtro de seniority', async () => {
    const ofertas = await obtenerJobicy(respuestaFalsa({ jobs: [ofertaJobicy()] }));
    expect(ofertas[0].etiquetas).toEqual(['Software Engineering', 'Senior']);
  });

  it('solo usa el salario cuando es anual', async () => {
    const ofertas = await obtenerJobicy(
      respuestaFalsa({
        jobs: [
          ofertaJobicy({ salaryMin: 60000, salaryMax: 80000, salaryCurrency: 'EUR', salaryPeriod: 'yearly' }),
          ofertaJobicy({ id: 2, salaryMin: 3000, salaryCurrency: 'EUR', salaryPeriod: 'monthly' }),
        ],
      }),
    );
    expect(ofertas[0].salarioTexto).toBe('EUR 60,000 - 80,000');
    expect(ofertas[1].salarioTexto).toBeNull();
  });

  it('lanza un error legible si la respuesta no trae el array de ofertas', async () => {
    await expect(obtenerJobicy(respuestaFalsa({ success: false }))).rejects.toThrow(/falta el array "jobs"/);
    await expect(obtenerJobicy(respuestaFalsa({}, false, 503))).rejects.toThrow(/respondió 503/);
  });
});
