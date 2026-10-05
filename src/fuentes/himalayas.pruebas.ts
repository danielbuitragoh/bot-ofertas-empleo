import { describe, expect, it, vi } from 'vitest';
import { obtenerHimalayas } from './himalayas.js';

function respuestaFalsa(cuerpo: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => cuerpo,
  }) as unknown as typeof fetch;
}

describe('obtenerHimalayas', () => {
  it('convierte pubDate de segundos a milisegundos', async () => {
    const epochSegundos = 1_790_000_000; // ~ septiembre 2026
    const cuerpo = {
      jobs: [
        {
          guid: 'abc123',
          title: 'Backend Engineer',
          companyName: 'Delta',
          applicationLink: 'https://himalayas.app/jobs/abc123',
          pubDate: epochSegundos,
        },
      ],
    };
    const ofertas = await obtenerHimalayas(respuestaFalsa(cuerpo));
    expect(ofertas[0].publicadoEn).toBe(epochSegundos * 1000);
  });

  it('acorta el guid con forma de URL a "empresa/puesto" para usarlo como id', async () => {
    const cuerpo = {
      jobs: [
        {
          guid: 'https://himalayas.app/companies/lsports/jobs/sales-manager',
          title: 'Sales Manager',
          companyName: 'LSports',
          applicationLink: 'https://himalayas.app/companies/lsports/jobs/sales-manager',
          pubDate: 1_790_000_000,
        },
      ],
    };
    const ofertas = await obtenerHimalayas(respuestaFalsa(cuerpo));
    expect(ofertas[0].idFuente).toBe('lsports/sales-manager');
  });

  it('forma el salario con la moneda cuando min y max existen', async () => {
    const cuerpo = {
      jobs: [
        {
          guid: 'xyz',
          title: 'Data Engineer',
          companyName: 'Epsilon',
          applicationLink: 'https://himalayas.app/jobs/xyz',
          pubDate: 1_790_000_000,
          minSalary: 70000,
          maxSalary: 100000,
          salaryCurrency: 'EUR',
        },
      ],
    };
    const ofertas = await obtenerHimalayas(respuestaFalsa(cuerpo));
    expect(ofertas[0].salarioTexto).toBe('EUR 70,000 - 100,000');
  });

  it('lanza un error legible si falta el array "jobs"', async () => {
    await expect(obtenerHimalayas(respuestaFalsa({}))).rejects.toThrow(/forma inesperada/);
  });
});
