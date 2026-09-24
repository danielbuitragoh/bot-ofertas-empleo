import { describe, expect, it } from 'vitest';
import { parsearRSS } from './weworkremotely.js';

const RSS_EJEMPLO = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>We Work Remotely</title>
    <item>
      <title>Acme Corp: Senior Backend Engineer</title>
      <link>https://weworkremotely.com/remote-jobs/1</link>
      <pubDate>Wed, 24 Sep 2026 10:00:00 +0000</pubDate>
      <region>Anywhere</region>
      <category>Programming</category>
    </item>
    <item>
      <title>Sin dos puntos en este titulo</title>
      <link>https://weworkremotely.com/remote-jobs/2</link>
      <pubDate>Wed, 24 Sep 2026 11:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`;

describe('parsearRSS (WeWorkRemotely)', () => {
  it('separa empresa y título por los dos puntos', () => {
    const ofertas = parsearRSS(RSS_EJEMPLO);
    expect(ofertas[0].empresa).toBe('Acme Corp');
    expect(ofertas[0].titulo).toBe('Senior Backend Engineer');
    expect(ofertas[0].fuente).toBe('weworkremotely');
    expect(ofertas[0].ubicacion).toBe('Anywhere');
  });

  it('cuando no hay dos puntos, usa el título completo y marca la empresa como sin especificar', () => {
    const ofertas = parsearRSS(RSS_EJEMPLO);
    expect(ofertas[1].empresa).toBe('Sin especificar');
    expect(ofertas[1].titulo).toBe('Sin dos puntos en este titulo');
  });

  it('usa el link como idFuente, porque el feed no trae un id explícito', () => {
    const ofertas = parsearRSS(RSS_EJEMPLO);
    expect(ofertas[0].idFuente).toBe('https://weworkremotely.com/remote-jobs/1');
  });

  it('devuelve un array vacío si no hay items', () => {
    const vacio = `<?xml version="1.0"?><rss><channel></channel></rss>`;
    expect(parsearRSS(vacio)).toEqual([]);
  });
});
