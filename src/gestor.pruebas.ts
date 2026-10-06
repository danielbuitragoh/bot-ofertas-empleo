import { describe, expect, it, vi } from 'vitest';
import { guardarEnGestor, leerCredencialesGestor } from './gestor.js';

const credenciales = { url: 'https://api.ejemplo.test', email: 'dan@ejemplo.test', contrasena: 'secreta' };
const oferta = {
  idFuente: 'abc',
  fuente: 'jobicy' as const,
  titulo: 'Backend Developer',
  empresa: 'Acme',
  url: 'https://ejemplo.test/oferta',
  ubicacion: 'Spain',
};

function respuesta(status: number, cuerpo: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as unknown as Response;
}

describe('leerCredencialesGestor', () => {
  it('devuelve null si falta cualquiera de las tres variables', () => {
    expect(leerCredencialesGestor({ API_POSTULACIONES_URL: 'https://x', API_POSTULACIONES_EMAIL: 'a@b' })).toBeNull();
  });

  it('ignora el espacio o salto de línea que se cuela al pegar un secret', () => {
    const leidas = leerCredencialesGestor({
      API_POSTULACIONES_URL: 'https://api.ejemplo.test\n',
      API_POSTULACIONES_EMAIL: ' dan@ejemplo.test \n',
      API_POSTULACIONES_CONTRASENA: 'con espacio \r\n',
    });
    expect(leidas).toEqual({ url: 'https://api.ejemplo.test', email: 'dan@ejemplo.test', contrasena: 'con espacio ' });
  });

  it('quita la barra final de la URL', () => {
    const leidas = leerCredencialesGestor({
      API_POSTULACIONES_URL: 'https://api.ejemplo.test/',
      API_POSTULACIONES_EMAIL: 'a@b',
      API_POSTULACIONES_CONTRASENA: 'c',
    });
    expect(leidas?.url).toBe('https://api.ejemplo.test');
  });
});

describe('guardarEnGestor', () => {
  // Un token fijo caducaba a los 15 minutos: el bot inicia sesión cada vez.
  it('inicia sesión y crea la postulación con el token recibido', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respuesta(200, { acceso: 'token-de-acceso' }))
      .mockResolvedValueOnce(respuesta(201));

    await guardarEnGestor(credenciales, oferta, fetchFalso as unknown as typeof fetch);

    const [urlAcceso, opcionesAcceso] = fetchFalso.mock.calls[0];
    expect(urlAcceso).toBe('https://api.ejemplo.test/auth/acceso');
    expect(JSON.parse(opcionesAcceso.body)).toEqual({ email: 'dan@ejemplo.test', contrasena: 'secreta' });

    const [urlCrear, opcionesCrear] = fetchFalso.mock.calls[1];
    expect(urlCrear).toBe('https://api.ejemplo.test/postulaciones');
    expect(opcionesCrear.headers.Authorization).toBe('Bearer token-de-acceso');
    expect(JSON.parse(opcionesCrear.body)).toMatchObject({
      empresa: { nombre: 'Acme' },
      puesto: 'Backend Developer',
      modalidad: 'remoto',
      estado_inicial: 'guardada',
      url_oferta: 'https://ejemplo.test/oferta',
      ubicacion: 'Spain',
      fuente: 'bot-ofertas-empleo · jobicy',
    });
  });

  it('explica el fallo si las credenciales son incorrectas', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuesta(401));
    await expect(guardarEnGestor(credenciales, oferta, fetchFalso as unknown as typeof fetch)).rejects.toThrow(
      /email o la contraseña/,
    );
  });
});
