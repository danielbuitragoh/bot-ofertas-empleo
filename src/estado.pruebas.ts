import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cargarEstado } from './estado.js';

describe('cargarEstado', () => {
  // El datos.json de producción se escribió antes de que existieran el
  // filtro de ubicación y la fuente Jobicy. Con una fusión de un solo
  // nivel, `filtros` y `porFuente` del archivo viejo pisaban enteros a los
  // del estado inicial y los campos nuevos quedaban undefined.
  it('rellena con valores por defecto los campos anidados que un datos.json viejo no trae', async () => {
    const carpeta = await mkdtemp(join(tmpdir(), 'estado-'));
    const ruta = join(carpeta, 'datos.json');
    await writeFile(
      ruta,
      JSON.stringify({
        filtros: { palabrasClave: ['node'], senioridadExcluida: ['senior'], salarioMinimoUSD: null, pausado: true },
        estadisticas: {
          porFuente: { remoteok: 5, remotive: 1, weworkremotely: 2, himalayas: 3 },
          duplicadosDescartados: 4,
          ultimaEjecucion: '2026-10-05T12:00:00.000Z',
        },
      }),
    );

    const estado = await cargarEstado(ruta);

    expect(estado.filtros.ubicaciones).toEqual([]);
    expect(estado.filtros.palabrasClave).toEqual(['node']);
    expect(estado.filtros.pausado).toBe(true);
    expect(estado.estadisticas.porFuente.jobicy).toBe(0);
    expect(estado.estadisticas.porFuente.remoteok).toBe(5);
    expect(estado.estadisticas.duplicadosDescartados).toBe(4);
  });
});
