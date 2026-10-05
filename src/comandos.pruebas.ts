import { describe, expect, it, vi } from 'vitest';
import { procesarComando, type DependenciasComandos } from './comandos.js';
import { estadoInicial } from './tipos.js';
import type { OfertaEmpleo } from './tipos.js';

function depsFalsas(): DependenciasComandos {
  return { guardarEnGestor: vi.fn().mockResolvedValue(undefined) };
}

function ofertaDePrueba(): OfertaEmpleo {
  return {
    idFuente: 'abc',
    fuente: 'remoteok',
    titulo: 'Backend Developer',
    empresa: 'Acme',
    url: 'https://ejemplo.test',
    publicadoEn: Date.now(),
    salarioTexto: null,
    ubicacion: null,
    etiquetas: [],
  };
}

describe('procesarComando', () => {
  it('/filtros ubicacion guarda la lista y "ninguna" la vacía', async () => {
    const conLista = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/filtros', argumentos: 'ubicacion Spain, Europe ,worldwide' },
      estadoInicial(),
      depsFalsas(),
    );
    expect(conLista.estadoActualizado?.filtros.ubicaciones).toEqual(['Spain', 'Europe', 'worldwide']);

    const vaciada = await procesarComando(
      { chatId: 1, updateId: 2, comando: '/filtros', argumentos: 'ubicacion ninguna' },
      conLista.estadoActualizado!,
      depsFalsas(),
    );
    expect(vaciada.estadoActualizado?.filtros.ubicaciones).toEqual([]);
  });

  it('/pausar marca filtros.pausado = true', async () => {
    const estado = estadoInicial();
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/pausar', argumentos: '' },
      estado,
      depsFalsas(),
    );
    expect(resultado.estadoActualizado?.filtros.pausado).toBe(true);
  });

  it('/reanudar marca filtros.pausado = false', async () => {
    const estado = { ...estadoInicial(), filtros: { ...estadoInicial().filtros, pausado: true } };
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/reanudar', argumentos: '' },
      estado,
      depsFalsas(),
    );
    expect(resultado.estadoActualizado?.filtros.pausado).toBe(false);
  });

  it('/filtros palabras actualiza la lista de palabras clave', async () => {
    const estado = estadoInicial();
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/filtros', argumentos: 'palabras backend, node ' },
      estado,
      depsFalsas(),
    );
    expect(resultado.estadoActualizado?.filtros.palabrasClave).toEqual(['backend', 'node']);
  });

  it('/filtros salario ninguno quita el mínimo', async () => {
    const estado = { ...estadoInicial(), filtros: { ...estadoInicial().filtros, salarioMinimoUSD: 90000 } };
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/filtros', argumentos: 'salario ninguno' },
      estado,
      depsFalsas(),
    );
    expect(resultado.estadoActualizado?.filtros.salarioMinimoUSD).toBeNull();
  });

  it('/guardar con un id inexistente no llama al gestor y avisa', async () => {
    const deps = depsFalsas();
    const estado = estadoInicial();
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/guardar', argumentos: 'no-existe' },
      estado,
      deps,
    );
    expect(deps.guardarEnGestor).not.toHaveBeenCalled();
    expect(resultado.respuesta).toMatch(/No encuentro/);
  });

  it('/guardar con un id válido llama al gestor con los datos de la oferta', async () => {
    const deps = depsFalsas();
    const oferta = ofertaDePrueba();
    const estado = { ...estadoInicial(), ultimasOfertas: [oferta] };
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/guardar', argumentos: 'abc' },
      estado,
      deps,
    );
    expect(deps.guardarEnGestor).toHaveBeenCalledWith('abc', 'Backend Developer', 'Acme', 'https://ejemplo.test');
    expect(resultado.respuesta).toMatch(/Guardada/);
  });

  it('/guardar dos veces con el mismo id no llama al gestor la segunda vez', async () => {
    const deps = depsFalsas();
    const oferta = ofertaDePrueba();
    let estado = { ...estadoInicial(), ultimasOfertas: [oferta] };

    const primero = await procesarComando({ chatId: 1, updateId: 1, comando: '/guardar', argumentos: 'abc' }, estado, deps);
    estado = primero.estadoActualizado ?? estado;
    expect(deps.guardarEnGestor).toHaveBeenCalledTimes(1);

    const segundo = await procesarComando({ chatId: 1, updateId: 2, comando: '/guardar', argumentos: 'abc' }, estado, deps);
    expect(deps.guardarEnGestor).toHaveBeenCalledTimes(1); // sigue en 1, no subió a 2
    expect(segundo.respuesta).toMatch(/ya estaba guardada/);
  });

  it('/guardar sigue funcionando aunque falle el gestor, sin tumbar el bot', async () => {
    const deps: DependenciasComandos = { guardarEnGestor: vi.fn().mockRejectedValue(new Error('caído')) };
    const oferta = ofertaDePrueba();
    const estado = { ...estadoInicial(), ultimasOfertas: [oferta] };
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/guardar', argumentos: 'abc' },
      estado,
      deps,
    );
    expect(resultado.respuesta).toMatch(/No pude guardarla/);
  });

  it('un comando desconocido responde con la lista de comandos disponibles', async () => {
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/inventado', argumentos: '' },
      estadoInicial(),
      depsFalsas(),
    );
    expect(resultado.respuesta).toMatch(/No conozco ese comando/);
  });

  // Las respuestas se mandan con parse_mode HTML: un "<" sin escapar hace
  // que Telegram rechace el mensaje con un 400. Pasó con "/guardar <id>"
  // en la ayuda, al recibir "/stats/filtros/ultimas 3" pegado en un solo
  // mensaje.
  it('la ayuda de un comando desconocido no lleva etiquetas HTML sin escapar', async () => {
    const resultado = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/stats/filtros/ultimas', argumentos: '3' },
      estadoInicial(),
      depsFalsas(),
    );
    expect(resultado.respuesta).not.toMatch(/<id>/);
    expect(resultado.respuesta).toContain('/guardar &lt;id&gt;');
  });

  it('escapa lo que escribe el usuario cuando lo repite en la respuesta', async () => {
    const filtros = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/filtros', argumentos: '<b>raro' },
      estadoInicial(),
      depsFalsas(),
    );
    expect(filtros.respuesta).toContain('&lt;b&gt;raro');

    const palabras = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/filtros', argumentos: 'palabras C++ & <Rust>' },
      estadoInicial(),
      depsFalsas(),
    );
    expect(palabras.respuesta).toContain('C++ &amp; &lt;Rust&gt;');

    const guardar = await procesarComando(
      { chatId: 1, updateId: 1, comando: '/guardar', argumentos: '<x>' },
      estadoInicial(),
      depsFalsas(),
    );
    expect(guardar.respuesta).toContain('&lt;x&gt;');
  });
});
