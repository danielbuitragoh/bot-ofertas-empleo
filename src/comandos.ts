import { escaparHTML, type ComandoRecibido } from './telegram.js';
import type { Estado, OfertaEmpleo } from './tipos.js';

export interface ResultadoComando {
  respuesta: string;
  /** Si el comando cambió el estado (filtros, pausa...), aquí va la versión nueva. */
  estadoActualizado?: Estado;
}

export interface DependenciasComandos {
  /**
   * Guarda una oferta en el sistema de gestión (api-postulaciones). Se
   * inyecta para poder probar /guardar sin red real, y porque el bot debe
   * seguir funcionando (avisando de ofertas) aunque este servicio esté
   * caído — solo /guardar deja de funcionar, nada más.
   */
  guardarEnGestor: (oferta: OfertaEmpleo) => Promise<void>;
}

export async function procesarComando(
  comando: ComandoRecibido,
  estado: Estado,
  deps: DependenciasComandos,
): Promise<ResultadoComando> {
  switch (comando.comando) {
    case '/filtros':
      return manejarFiltros(comando.argumentos, estado);

    case '/pausar':
      return {
        respuesta: 'Pausado. No te voy a avisar de nada hasta que mandes /reanudar.',
        estadoActualizado: { ...estado, filtros: { ...estado.filtros, pausado: true } },
      };

    case '/reanudar':
      return {
        respuesta: 'Reanudado. Vuelvo a avisarte de las ofertas que encajen.',
        estadoActualizado: { ...estado, filtros: { ...estado.filtros, pausado: false } },
      };

    case '/ultimas':
      return manejarUltimas(comando.argumentos, estado);

    case '/stats':
      return manejarStats(estado);

    case '/guardar':
      return manejarGuardar(comando.argumentos, estado, deps);

    default:
      return {
        respuesta:
          'No conozco ese comando. Los que hay: /filtros, /pausar, /reanudar, /ultimas [n], /stats, /guardar &lt;id&gt;.',
      };
  }
}

function manejarFiltros(argumentos: string, estado: Estado): ResultadoComando {
  const partes = argumentos.trim().split(/\s+/);
  const sub = partes[0]?.toLowerCase();
  const resto = partes.slice(1).join(' ');

  if (!sub) {
    const f = estado.filtros;
    return {
      respuesta: [
        `Palabras clave: ${f.palabrasClave.length > 0 ? escaparHTML(f.palabrasClave.join(', ')) : '(ninguna, no filtra)'}`,
        `Seniority excluida: ${f.senioridadExcluida.length > 0 ? escaparHTML(f.senioridadExcluida.join(', ')) : '(ninguna)'}`,
        `Salario mínimo: ${f.salarioMinimoUSD !== null ? `USD ${f.salarioMinimoUSD.toLocaleString('en-US')}` : '(sin mínimo)'}`,
        `Ubicación: ${f.ubicaciones.length > 0 ? escaparHTML(f.ubicaciones.join(', ')) : '(cualquiera)'}`,
        `Estado: ${f.pausado ? 'pausado' : 'activo'}`,
        '',
        'Para cambiar: /filtros palabras backend,node · /filtros senioridad senior,lead · /filtros salario 80000 · /filtros salario ninguno · /filtros ubicacion spain,europe,worldwide · /filtros ubicacion ninguna',
      ].join('\n'),
    };
  }

  if (sub === 'ubicacion' || sub === 'ubicación') {
    const ubicaciones =
      resto.trim().toLowerCase() === 'ninguna' ? [] : resto.split(',').map((s) => s.trim()).filter(Boolean);
    return {
      respuesta: `Ubicación actualizada: ${ubicaciones.length > 0 ? escaparHTML(ubicaciones.join(', ')) : '(cualquiera)'}. Las ofertas que no indican ubicación se siguen avisando.`,
      estadoActualizado: { ...estado, filtros: { ...estado.filtros, ubicaciones } },
    };
  }

  if (sub === 'palabras') {
    const palabrasClave = resto.length > 0 ? resto.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return {
      respuesta: `Palabras clave actualizadas: ${palabrasClave.length > 0 ? escaparHTML(palabrasClave.join(', ')) : '(ninguna, no filtra)'}`,
      estadoActualizado: { ...estado, filtros: { ...estado.filtros, palabrasClave } },
    };
  }

  if (sub === 'senioridad') {
    const senioridadExcluida = resto.length > 0 ? resto.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return {
      respuesta: `Seniority excluida actualizada: ${senioridadExcluida.length > 0 ? escaparHTML(senioridadExcluida.join(', ')) : '(ninguna)'}`,
      estadoActualizado: { ...estado, filtros: { ...estado.filtros, senioridadExcluida } },
    };
  }

  if (sub === 'salario') {
    if (resto.trim().toLowerCase() === 'ninguno') {
      return {
        respuesta: 'Salario mínimo quitado.',
        estadoActualizado: { ...estado, filtros: { ...estado.filtros, salarioMinimoUSD: null } },
      };
    }
    const numero = Number(resto.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numero) || numero <= 0) {
      return { respuesta: 'Ese número de salario no lo entendí. Ejemplo: /filtros salario 80000' };
    }
    return {
      respuesta: `Salario mínimo actualizado: USD ${numero.toLocaleString('en-US')}`,
      estadoActualizado: { ...estado, filtros: { ...estado.filtros, salarioMinimoUSD: numero } },
    };
  }

  return { respuesta: `No reconozco "/filtros ${escaparHTML(sub)}". Usa /filtros solo para ver las opciones.` };
}

function manejarUltimas(argumentos: string, estado: Estado): ResultadoComando {
  const n = Number(argumentos.trim()) || 5;
  const ofertas = estado.ultimasOfertas.slice(0, Math.max(1, Math.min(n, 20)));

  if (ofertas.length === 0) {
    return { respuesta: 'Todavía no he visto ninguna oferta. Espera al próximo cron.' };
  }

  const lineas = ofertas.map(
    (o, i) =>
      `${i + 1}. <b>${escaparHTML(o.titulo)}</b> — ${escaparHTML(o.empresa)} (${o.fuente})\n   id: <code>${escaparHTML(o.idFuente)}</code>\n   ${o.url}`,
  );
  return { respuesta: lineas.join('\n\n') };
}

function manejarStats(estado: Estado): ResultadoComando {
  const { porFuente, duplicadosDescartados, ultimaEjecucion } = estado.estadisticas;
  const lineas = Object.entries(porFuente).map(([fuente, total]) => `  ${fuente}: ${total}`);
  return {
    respuesta: [
      'Ofertas traídas por fuente (acumulado):',
      ...lineas,
      `Duplicados descartados (acumulado): ${duplicadosDescartados}`,
      `Última ejecución: ${ultimaEjecucion ?? '(nunca)'}`,
    ].join('\n'),
  };
}

async function manejarGuardar(
  argumentos: string,
  estado: Estado,
  deps: DependenciasComandos,
): Promise<ResultadoComando> {
  const idFuente = argumentos.trim();
  if (!idFuente) {
    return { respuesta: 'Uso: /guardar &lt;id&gt; — el id sale en /ultimas.' };
  }

  // Idempotencia: si por lo que sea Telegram reenvía el mismo update (el
  // commit del estado de la corrida anterior no llegó a completarse, ver
  // src/tipos.ts) no se crea la misma postulación dos veces en el gestor.
  if (estado.idsGuardadosEnGestor.includes(idFuente)) {
    return { respuesta: 'Esa oferta ya estaba guardada en el gestor — no la dupliqué.' };
  }

  const oferta = estado.ultimasOfertas.find((o) => o.idFuente === idFuente);
  if (!oferta) {
    return { respuesta: `No encuentro ninguna oferta reciente con id "${escaparHTML(idFuente)}". Revisa /ultimas.` };
  }

  try {
    await deps.guardarEnGestor(oferta);
    return {
      respuesta: `Guardada: ${escaparHTML(oferta.titulo)} — ${escaparHTML(oferta.empresa)}. Ya aparece en el gestor de candidaturas.`,
      estadoActualizado: { ...estado, idsGuardadosEnGestor: [...estado.idsGuardadosEnGestor, idFuente].slice(-2000) },
    };
  } catch (error) {
    return {
      respuesta: `No pude guardarla en el gestor: ${escaparHTML((error as Error).message)}. La oferta sigue en /ultimas para intentarlo de nuevo.`,
    };
  }
}
