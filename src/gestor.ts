import type { OfertaEmpleo } from './tipos.js';

/**
 * Cliente mínimo de api-postulaciones, solo para /guardar.
 *
 * La API emite tokens de acceso que caducan a los 15 minutos, así que un
 * token fijo guardado como secret dejaba de servir a los 15 minutos de
 * crearlo y /guardar fallaba para siempre. Por eso el bot inicia sesión con
 * email y contraseña cada vez que guarda: es una petición más, solo cuando
 * el usuario manda /guardar, y nunca hay un token caducado que renovar.
 */

export interface CredencialesGestor {
  url: string;
  email: string;
  contrasena: string;
}

export type OfertaParaGestor = Pick<OfertaEmpleo, 'idFuente' | 'fuente' | 'titulo' | 'empresa' | 'url' | 'ubicacion'>;

/** Lee las credenciales del entorno. Devuelve null si falta alguna: /guardar responde entonces que no está disponible. */
export function leerCredencialesGestor(entorno: NodeJS.ProcessEnv = process.env): CredencialesGestor | null {
  // Al pegar un valor en el formulario de secrets de GitHub es fácil que se
  // cuele un espacio o un salto de línea al final: no se ve, y la API
  // rechaza el inicio de sesión. Al email y la URL se les quitan los
  // espacios de los extremos; a la contraseña, solo los saltos de línea
  // finales, porque un espacio sí puede formar parte de una contraseña.
  const url = entorno.API_POSTULACIONES_URL?.trim().replace(/\/+$/, '');
  const email = entorno.API_POSTULACIONES_EMAIL?.trim();
  const contrasena = entorno.API_POSTULACIONES_CONTRASENA?.replace(/[\r\n]+$/, '');
  if (!url || !email || !contrasena) return null;
  return { url, email, contrasena };
}

export async function guardarEnGestor(
  credenciales: CredencialesGestor,
  oferta: OfertaParaGestor,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const acceso = await iniciarSesion(credenciales, fetchImpl);

  const respuesta = await fetchImpl(`${credenciales.url}/postulaciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acceso}` },
    body: JSON.stringify({
      empresa: { nombre: oferta.empresa },
      puesto: oferta.titulo,
      fuente: `bot-ofertas-empleo · ${oferta.fuente}`,
      modalidad: 'remoto',
      // url_oferta y ubicacion van a sus campos y no a las notas: así el
      // tablero enseña el enlace a la oferta y se puede filtrar por lugar.
      url_oferta: oferta.url,
      ...(oferta.ubicacion ? { ubicacion: oferta.ubicacion.slice(0, 160) } : {}),
      notas: `Encontrada por el bot en ${oferta.fuente} (id ${oferta.idFuente}).`,
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`api-postulaciones respondió ${respuesta.status} al crear la postulación`);
  }
}

async function iniciarSesion(credenciales: CredencialesGestor, fetchImpl: typeof fetch): Promise<string> {
  const respuesta = await fetchImpl(`${credenciales.url}/auth/acceso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: credenciales.email, contrasena: credenciales.contrasena }),
  });
  if (respuesta.status === 401) {
    throw new Error('el email o la contraseña del gestor no son correctos (revisa los secrets API_POSTULACIONES_*)');
  }
  if (!respuesta.ok) {
    throw new Error(`api-postulaciones respondió ${respuesta.status} al iniciar sesión`);
  }
  const cuerpo = (await respuesta.json()) as { acceso?: string };
  if (!cuerpo.acceso) {
    throw new Error('api-postulaciones no devolvió un token de acceso');
  }
  return cuerpo.acceso;
}
