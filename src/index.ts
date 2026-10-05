import { obtenerRemoteOK } from './fuentes/remoteok.js';
import { obtenerRemotive } from './fuentes/remotive.js';
import { obtenerWeWorkRemotely } from './fuentes/weworkremotely.js';
import { obtenerHimalayas } from './fuentes/himalayas.js';
import { calcularHash, deduplicar } from './dedup.js';
import { coincideConFiltros } from './filtros.js';
import { cargarEstado, guardarEstado } from './estado.js';
import { ClienteTelegram, escaparHTML, extraerComandos } from './telegram.js';
import { procesarComando, type DependenciasComandos } from './comandos.js';
import type { Estado, OfertaEmpleo } from './tipos.js';

const MAXIMO_MENSAJES_POR_EJECUCION = 15; // margen de seguridad frente a los límites de Telegram, ver README

async function main(): Promise<void> {
  const { token, chatId } = leerConfiguracionTelegram();
  const urlApiPostulaciones = process.env.API_POSTULACIONES_URL; // opcional, ver src/estado.ts
  const tokenApiPostulaciones = process.env.API_POSTULACIONES_TOKEN;

  const telegram = new ClienteTelegram(token);
  let estado = await cargarEstado();

  // 1) Procesar los comandos que hayan llegado desde la última ejecución.
  estado = await procesarComandosPendientes(estado, telegram, chatId, urlApiPostulaciones, tokenApiPostulaciones);

  // 2) Si está pausado, no se buscan ni notifican ofertas nuevas — pero
  //    los comandos de arriba (por ejemplo /reanudar) sí se procesan
  //    siempre, si no fuese así un /reanudar en pausa nunca se leería.
  if (estado.filtros.pausado) {
    estado.estadisticas.ultimaEjecucion = new Date().toISOString();
    await guardarEstado(estado);
    console.log('Pausado por el usuario — no se buscaron ofertas nuevas esta vez.');
    return;
  }

  // 3) Traer las 4 fuentes. Si una falla, las otras tres siguen
  //    funcionando — un proveedor caído no debe tumbar el aviso de los
  //    otros tres. Se reporta el fallo por Telegram para que no pase
  //    desapercibido silenciosamente durante semanas.
  const { ofertas, fallos } = await obtenerTodasLasFuentes();

  for (const fallo of fallos) {
    await telegram.enviarMensaje({ chatId, texto: `⚠️ Fuente caída: ${fallo}` });
  }

  for (const oferta of ofertas) {
    estado.estadisticas.porFuente[oferta.fuente] += 1;
  }

  // 4) Deduplicar contra todo lo ya notificado (incluye ejecuciones anteriores).
  const { nuevas, descartadas } = deduplicar(ofertas, estado.hashesNotificados);
  estado.estadisticas.duplicadosDescartados += descartadas;

  // 5) Filtrar por el perfil configurado con /filtros.
  const queEncajan = nuevas.filter((oferta) => coincideConFiltros(oferta, estado.filtros));

  // 6) Notificar, con un tope por ejecución para no golpear el límite de
  //    Telegram (~30 mensajes/segundo, pero enviar 200 de golpe cada 6h
  //    tampoco es una buena experiencia) — el resto queda para /ultimas.
  const aNotificar = queEncajan.slice(0, MAXIMO_MENSAJES_POR_EJECUCION);
  for (const oferta of aNotificar) {
    await telegram.enviarMensaje({ chatId, texto: formatearOferta(oferta) });
  }

  // 7) Marcar como notificado TODO lo nuevo que se vio (no solo lo que
  //    encajó con el filtro): si no, cambiar los filtros más tarde haría
  //    reaparecer ofertas viejas que ya se habían descartado por criterio,
  //    como si fuesen nuevas.
  estado.hashesNotificados.push(...nuevas.map(calcularHash));
  // No crecer para siempre: se queda con los últimos 5000 hashes, de sobra
  // para varias semanas de las 4 fuentes juntas.
  estado.hashesNotificados = estado.hashesNotificados.slice(-5000);

  // Se acumula sobre la lista anterior en vez de reemplazarla: una corrida
  // sin novedades la dejaba vacía, y con ella /ultimas no mostraba nada y
  // /guardar no encontraba el id de un aviso de hacía unas horas. Las
  // notificadas van delante para que /guardar las encuentre aunque una
  // corrida traiga más de 50 nuevas.
  const restoNuevas = nuevas.filter((oferta) => !aNotificar.includes(oferta));
  estado.ultimasOfertas = [...aNotificar, ...restoNuevas, ...estado.ultimasOfertas].slice(0, 50);
  estado.estadisticas.ultimaEjecucion = new Date().toISOString();

  await guardarEstado(estado);

  console.log(
    `Listo: ${ofertas.length} vistas, ${nuevas.length} nuevas, ${queEncajan.length} encajaban con el filtro, ${aNotificar.length} notificadas.`,
  );
}

async function obtenerTodasLasFuentes(): Promise<{ ofertas: OfertaEmpleo[]; fallos: string[] }> {
  const resultados = await Promise.allSettled([
    obtenerRemoteOK(),
    obtenerRemotive(),
    obtenerWeWorkRemotely(),
    obtenerHimalayas(),
  ]);

  const nombres = ['RemoteOK', 'Remotive', 'WeWorkRemotely', 'Himalayas'];
  const ofertas: OfertaEmpleo[] = [];
  const fallos: string[] = [];

  resultados.forEach((resultado, i) => {
    if (resultado.status === 'fulfilled') {
      ofertas.push(...resultado.value);
    } else {
      fallos.push(`${nombres[i]}: ${(resultado.reason as Error).message}`);
    }
  });

  return { ofertas, fallos };
}

async function procesarComandosPendientes(
  estado: Estado,
  telegram: ClienteTelegram,
  chatId: number,
  urlApiPostulaciones: string | undefined,
  tokenApiPostulaciones: string | undefined,
): Promise<Estado> {
  // Si Telegram falla al pedir los updates (un timeout, un 5xx puntual),
  // que no procese comandos esta vez no debe impedir que el bot siga
  // buscando y avisando de ofertas nuevas, que es el valor principal:
  // un problema en /filtros no debería tumbar la parte que sí funciona.
  let updates: Awaited<ReturnType<ClienteTelegram['obtenerActualizaciones']>> = [];
  try {
    updates = await telegram.obtenerActualizaciones(estado.ultimoUpdateIdProcesado + 1);
  } catch (error) {
    console.error('No se pudieron leer los comandos pendientes de Telegram, se continúa sin ellos:', error);
    return estado;
  }

  const comandos = extraerComandos(updates);

  if (updates.length > 0) {
    const maximoUpdateId = Math.max(...updates.map((u) => u.update_id));
    estado = { ...estado, ultimoUpdateIdProcesado: maximoUpdateId };
  }

  const deps: DependenciasComandos = {
    guardarEnGestor: async (idFuente, tituloOferta, empresa, url) => {
      if (!urlApiPostulaciones) {
        throw new Error('API_POSTULACIONES_URL no está configurada');
      }
      const respuesta = await fetch(`${urlApiPostulaciones}/postulaciones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenApiPostulaciones ? { Authorization: `Bearer ${tokenApiPostulaciones}` } : {}),
        },
        body: JSON.stringify({
          empresa: { nombre: empresa },
          puesto: tituloOferta,
          fuente: 'bot-ofertas-empleo',
          modalidad: 'remoto',
          notas: `Encontrada por el bot (id fuente: ${idFuente}). URL: ${url}`,
        }),
      });
      if (!respuesta.ok) {
        throw new Error(`api-postulaciones respondió ${respuesta.status}`);
      }
    },
  };

  for (const comando of comandos) {
    const resultado = await procesarComando(comando, estado, deps);
    if (resultado.estadoActualizado) {
      estado = resultado.estadoActualizado;
    }
    await telegram.enviarMensaje({ chatId: comando.chatId, texto: resultado.respuesta });
  }

  return estado;
}

function formatearOferta(oferta: OfertaEmpleo): string {
  const partes = [
    `💼 <b>${escaparHTML(oferta.titulo)}</b>`,
    `${escaparHTML(oferta.empresa)} · ${oferta.fuente}`,
  ];
  if (oferta.ubicacion) partes.push(`📍 ${escaparHTML(oferta.ubicacion)}`);
  if (oferta.salarioTexto) partes.push(`💰 ${escaparHTML(oferta.salarioTexto)}`);
  // oferta.url no se escapa: Telegram no permite entidades HTML dentro de
  // una URL suelta y escaparla (por ejemplo "&" -> "&amp;") rompería el
  // enlace. Sí se escapa más abajo, porque ahí es texto normal, no una URL.
  partes.push(oferta.url);
  const idEscapado = escaparHTML(oferta.idFuente);
  partes.push(`<code>${idEscapado}</code> — usa /guardar ${idEscapado} para mandarla al gestor de candidaturas.`);
  return partes.join('\n');
}

// Se comprueban las dos a la vez y se listan todas las que falten: si no,
// quien configura el bot arregla una, relanza, y solo entonces descubre la
// segunda. Sale con process.exit(1) y un mensaje de una línea en vez de
// lanzar, porque una configuración incompleta no es un fallo del código y
// el stack trace solo taparía lo único que hay que leer.
function leerConfiguracionTelegram(): { token: string; chatId: number } {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const faltan = [
    !token && 'TELEGRAM_BOT_TOKEN',
    !chatId && 'TELEGRAM_CHAT_ID',
  ].filter((nombre): nombre is string => Boolean(nombre));

  if (!token || !chatId) {
    console.error(`Faltan variables de entorno: ${faltan.join(', ')} (configúralas como secrets de GitHub Actions, ver README).`);
    process.exit(1);
  }
  return { token, chatId: Number(chatId) };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
