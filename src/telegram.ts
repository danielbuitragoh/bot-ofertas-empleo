/**
 * Cliente mínimo de la API de Telegram, sin `grammy` ni `node-telegram-bot-api`.
 *
 * Ambas librerías están pensadas para un proceso que vive escuchando
 * (`bot.start()`, un long-poll continuo). Este proyecto no tiene ningún
 * proceso que viva: GitHub Actions arranca el contenedor, corre el script
 * una vez y lo mata. Así que en vez de "escuchar" mensajes, cada
 * ejecución hace **una sola llamada** a `getUpdates` con el `offset` del
 * último `update_id` procesado (guardado en el estado), procesa lo que
 * haya llegado desde la corrida anterior, y termina. Es exactamente lo
 * mismo que hace un long-poll por dentro, solo que en vez de repetirlo
 * cada segundo lo repite cada 6 horas — que es la cadencia real que este
 * proyecto necesita y punto.
 */
export interface MensajeTelegram {
  chatId: number;
  texto: string;
}

interface UpdateTelegram {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
}

export class ClienteTelegram {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private urlBase(): string {
    return `https://api.telegram.org/bot${this.token}`;
  }

  async obtenerActualizaciones(offset: number): Promise<UpdateTelegram[]> {
    const respuesta = await this.fetchImpl(
      `${this.urlBase()}/getUpdates?offset=${offset}&timeout=0`,
    );
    if (!respuesta.ok) {
      throw new Error(`Telegram getUpdates respondió ${respuesta.status}`);
    }
    const cuerpo = (await respuesta.json()) as { ok: boolean; result: UpdateTelegram[] };
    if (!cuerpo.ok) throw new Error('Telegram getUpdates: ok=false');
    return cuerpo.result;
  }

  /**
   * Telegram limita a ~1 mensaje/segundo por chat (no confundir con el
   * límite global de ~30/s de la API, que es por bot, no por chat — este
   * bot solo tiene un chat de destino, así que el límite que importa es
   * el más estricto). Mandar de golpe hasta 15 avisos en la misma
   * ejecución sin esperar entre ellos es justo la forma de provocar un
   * 429. Si aun así llega un 429, Telegram devuelve cuánto esperar en
   * `retry_after` — se respeta ese valor y se reintenta una vez, en vez
   * de perder el mensaje o tumbar toda la ejecución por un mensaje.
   */
  async enviarMensaje(mensaje: MensajeTelegram): Promise<void> {
    await this.esperar(this.milisegundosEntreMensajes);

    const respuesta = await this.hacerEnvio(mensaje);
    if (respuesta.ok) return;

    if (respuesta.status === 429) {
      const cuerpo = (await respuesta.json().catch(() => null)) as {
        parameters?: { retry_after?: number };
      } | null;
      const retryAfter = cuerpo?.parameters?.retry_after ?? 1;
      await this.esperar(retryAfter * 1000);

      const reintento = await this.hacerEnvio(mensaje);
      if (reintento.ok) return;
      const detalle = await reintento.text();
      throw new Error(`Telegram sendMessage respondió ${reintento.status} tras reintentar: ${detalle}`);
    }

    const detalle = await respuesta.text();
    throw new Error(`Telegram sendMessage respondió ${respuesta.status}: ${detalle}`);
  }

  private async hacerEnvio(mensaje: MensajeTelegram): Promise<Response> {
    return this.fetchImpl(`${this.urlBase()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: mensaje.chatId,
        text: mensaje.texto,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });
  }

  private esperar(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** En milisegundos entre envíos consecutivos; 0 en pruebas para no ralentizarlas artificialmente (ver src/telegram.pruebas.ts). */
  milisegundosEntreMensajes = 350;
}

/**
 * Escapa los tres caracteres con significado especial en el modo HTML de
 * Telegram. Es obligatorio aplicarlo a CUALQUIER texto que venga de las
 * fuentes externas antes de interpolarlo en un mensaje: un título de
 * oferta con "C++ & Rust" o "<Backend>" rompe el parseo de Telegram
 * (responde 400 "can't parse entities") y ese aviso se pierde en
 * silencio si no se captura el error. Mejor evitarlo desde el origen.
 */
export function escaparHTML(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ComandoRecibido {
  chatId: number;
  updateId: number;
  comando: string;
  argumentos: string;
}

/** Extrae solo los mensajes que son comandos ("/algo ..."), descarta el resto. */
/**
 * Con `chatPermitido`, solo se aceptan comandos de ese chat: el bot es
 * público y cualquiera que lo encuentre podría mandarle /pausar o cambiar
 * los filtros. Sin él (los tests de parseo), se aceptan todos.
 */
export function extraerComandos(updates: UpdateTelegram[], chatPermitido?: number): ComandoRecibido[] {
  const comandos: ComandoRecibido[] = [];

  for (const update of updates) {
    const texto = update.message?.text;
    const chatId = update.message?.chat.id;
    if (!texto || chatId === undefined || !texto.startsWith('/')) continue;
    if (chatPermitido !== undefined && chatId !== chatPermitido) continue;

    const [primeraPalabra, ...resto] = texto.trim().split(/\s+/);
    comandos.push({
      chatId,
      updateId: update.update_id,
      // Telegram añade "@nombre_del_bot" al comando cuando se elige del
      // menú de sugerencias ("/filtros@ofertas_dev_dan_bot").
      comando: primeraPalabra.toLowerCase().split('@')[0],
      argumentos: resto.join(' '),
    });
  }

  return comandos;
}
