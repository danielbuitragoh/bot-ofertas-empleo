# Subir `bot-ofertas-empleo` a GitHub

Notas para Dan, no para quien lea el repo — por eso vive en `docs/` y no en la raíz.

## 1 · Crear el repo y subir el código

Desde esta misma carpeta (`bot-ofertas-empleo/`), con git ya inicializado:

```bash
git init
git add .
git commit -m "Primer commit: bot de ofertas de empleo"
git branch -M main
git remote add origin https://github.com/danielbuitragoh/bot-ofertas-empleo.git
git push -u origin main
```

Si prefieres crear el repo primero en github.com/new (sin README, sin .gitignore, sin licencia — todo eso ya está aquí) y luego conectarlo, el `git remote add` + `git push` de arriba es lo único que cambia.

## 2 · Descripción y topics del repo

**Descripción corta** (en "Edit repository details", el engranaje junto a "About"):

```
Bot de Telegram que revisa 4 bolsas de empleo remoto sin autenticación, normaliza sus formatos y avisa cuando algo encaja con tu perfil. Corre entero en GitHub Actions, sin servidor.
```

**Topics:**

```
typescript nodejs telegram-bot github-actions cron job-search remote-work
```

Este repo **no tiene demo web ni GitHub Pages** — es un bot sin interfaz, así que no hay nada que enlazar en "Website". Lo que sí conviene enlazar ahí (opcional) es el propio bot de Telegram si lo dejas público, con `https://t.me/<nombre_de_tu_bot>`.

## 3 · Crear el bot de Telegram

1. Abre una conversación con [@BotFather](https://t.me/BotFather) en Telegram.
2. `/newbot`, sigue las instrucciones (nombre, username terminado en `bot`).
3. BotFather te da un token — es el `TELEGRAM_BOT_TOKEN` del paso 4.
4. Escríbele cualquier mensaje a tu bot nuevo (si no le escribes primero, no puede mandarte nada).
5. Para saber tu `chat_id`: abre en el navegador
   `https://api.telegram.org/bot<TU_TOKEN>/getUpdates` después de haberle escrito,
   y busca `"chat":{"id": ...}` en la respuesta — ese número es el `TELEGRAM_CHAT_ID`.

## 4 · Secrets del repo

En GitHub: Settings → Secrets and variables → Actions → New repository secret.

| Nombre | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | el token de BotFather |
| `TELEGRAM_CHAT_ID` | el número que sacaste en el paso anterior |
| `API_POSTULACIONES_URL` | (opcional) la URL pública de tu `api-postulaciones` desplegada, sin `/` al final |
| `API_POSTULACIONES_TOKEN` | (opcional) solo si tu API lo pide para crear postulaciones |

Sin las dos primeras, el workflow `bot.yml` falla enseguida con un mensaje claro de "falta la variable de entorno" — no hace falta adivinar por qué no llegó ningún mensaje.

## 5 · Primera corrida y verificación

1. Después de subir el código y los secrets, ve a la pestaña **Actions** del repo.
2. Workflow **"Buscar ofertas"** → **Run workflow** (el botón manual, gracias a `workflow_dispatch`) → confirma en la rama `main`.
3. En un par de minutos debería llegarte al chat de Telegram uno o varios avisos de ofertas (o el mensaje de que una fuente falló, si alguna está caída ese momento — es normal, revisa igual que hubo avisos de las otras).
4. Prueba `/filtros`, `/ultimas`, `/stats` directamente en el chat con el bot — la respuesta tarda hasta 6 horas (el próximo cron) salvo que dispares otra corrida manual desde Actions.

**Si el log de Actions muestra "RemoteOK respondió 403" en esa primera corrida:** no pude probar el fetch a RemoteOK contra la red real desde este entorno (el sandbox donde escribí el código bloquea esos dominios a nivel de proxy, así que no es una prueba concluyente de cómo se comporta RemoteOK de verdad). Si pasa, es casi seguro que RemoteOK/Cloudflare está rechazando la cabecera `User-Agent` del bot — la solución más simple es abrir `src/fuentes/remoteok.ts` y cambiar el valor de `User-Agent` por algo con forma de navegador real (p. ej. `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36`), commitear y volver a disparar el workflow. Las otras tres fuentes no dependen de esto.

## 6 · El aviso de los 60 días

GitHub apaga en silencio los workflows programados de un repo público si pasan 60 días sin ningún commit ni actividad. Si en algún momento el bot deja de avisar y las cuatro fuentes están bien, lo primero es mirar la pestaña Actions → el workflow "Buscar ofertas" — si aparece como desactivado, el mismo botón de "Run workflow" lo reactiva.
