import { describe, expect, it, vi } from 'vitest';
import { ClienteTelegram, escaparHTML, extraerComandos } from './telegram.js';

function respuesta(ok: boolean, status: number, cuerpo: unknown = {}): Response {
  return {
    ok,
    status,
    json: async () => cuerpo,
    text: async () => JSON.stringify(cuerpo),
  } as unknown as Response;
}

describe('extraerComandos', () => {
  it('ignora mensajes que no empiezan por /', () => {
    const comandos = extraerComandos([
      { update_id: 1, message: { chat: { id: 10 }, text: 'hola' } },
    ]);
    expect(comandos).toHaveLength(0);
  });

  it('separa comando y argumentos, y pasa el comando a minúsculas', () => {
    const comandos = extraerComandos([
      { update_id: 1, message: { chat: { id: 10 }, text: '/FILTROS palabras backend,node' } },
    ]);
    expect(comandos).toEqual([
      { chatId: 10, updateId: 1, comando: '/filtros', argumentos: 'palabras backend,node' },
    ]);
  });

  it('ignora updates sin mensaje de texto (por ejemplo, una foto)', () => {
    const comandos = extraerComandos([{ update_id: 1, message: { chat: { id: 10 } } }]);
    expect(comandos).toHaveLength(0);
  });

  it('quita el @nombre_del_bot que Telegram añade al elegir un comando del menú', () => {
    const comandos = extraerComandos([
      { update_id: 1, message: { chat: { id: 10 }, text: '/filtros@ofertas_dev_dan_bot' } },
    ]);
    expect(comandos[0].comando).toBe('/filtros');
  });

  it('con un chat permitido, ignora los comandos que lleguen de cualquier otro', () => {
    // El bot es público: cualquiera que lo encuentre podría mandarle
    // /pausar o cambiar los filtros si no se filtra por chat.
    const comandos = extraerComandos(
      [
        { update_id: 1, message: { chat: { id: 10 }, text: '/stats' } },
        { update_id: 2, message: { chat: { id: 99 }, text: '/pausar' } },
      ],
      10,
    );
    expect(comandos.map((c) => c.comando)).toEqual(['/stats']);
  });
});

describe('escaparHTML', () => {
  it('escapa &, < y > para no romper el parse_mode HTML de Telegram', () => {
    // Caso real: un título de oferta con "&" (nada exótico, "Backend &
    // Infra Engineer" es un título perfectamente normal) rompía el envío
    // del mensaje entero si no se escapaba antes de interpolarlo.
    expect(escaparHTML('Backend & Infra Engineer <junior>')).toBe('Backend &amp; Infra Engineer &lt;junior&gt;');
  });
});

describe('ClienteTelegram.enviarMensaje', () => {
  it('lanza un error legible si Telegram responde con un fallo que no es 429', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuesta(false, 400, { description: 'Bad Request' }));
    const cliente = new ClienteTelegram('token-falso', fetchFalso as unknown as typeof fetch);
    cliente.milisegundosEntreMensajes = 0;

    await expect(cliente.enviarMensaje({ chatId: 1, texto: 'hola' })).rejects.toThrow(/respondió 400/);
    expect(fetchFalso).toHaveBeenCalledTimes(1); // no reintenta si no es 429
  });

  it('ante un 429 espera "retry_after" y reintenta una vez', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respuesta(false, 429, { parameters: { retry_after: 0 } }))
      .mockResolvedValueOnce(respuesta(true, 200));
    const cliente = new ClienteTelegram('token-falso', fetchFalso as unknown as typeof fetch);
    cliente.milisegundosEntreMensajes = 0;

    await expect(cliente.enviarMensaje({ chatId: 1, texto: 'hola' })).resolves.toBeUndefined();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('si el reintento tras un 429 también falla, lanza un error', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respuesta(false, 429, { parameters: { retry_after: 0 } }))
      .mockResolvedValueOnce(respuesta(false, 429, { parameters: { retry_after: 0 } }));
    const cliente = new ClienteTelegram('token-falso', fetchFalso as unknown as typeof fetch);
    cliente.milisegundosEntreMensajes = 0;

    await expect(cliente.enviarMensaje({ chatId: 1, texto: 'hola' })).rejects.toThrow(/tras reintentar/);
  });
});
