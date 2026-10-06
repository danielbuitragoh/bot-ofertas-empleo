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

export interface OfertaParaGestor {
  idFuente: string;
  titulo: string;
  empresa: string;
  url: string;
}

/** Lee las credenciales del entorno. Devuelve null si falta alguna: /guardar responde entonces que no está disponible. */
export function leerCredencialesGestor(entorno: NodeJS.ProcessEnv = process.env): CredencialesGestor | null {
  const url = entorno.API_POSTULACIONES_URL?.replace(/\/+$/, '');
  const email = entorno.API_POSTULACIONES_EMAIL;
  const contrasena = entorno.API_POSTULACIONES_CONTRASENA;
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
      fuente: 'bot-ofertas-empleo',
      modalidad: 'remoto',
      notas: `Encontrada por el bot (id fuente: ${oferta.idFuente}). URL: ${oferta.url}`,
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
