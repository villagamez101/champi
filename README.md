# Champi

Chat web minimalista en `chat.eduardovilla.com`, conectado a los modelos de
**OpenCode Go**. Guarda tus conversaciones, permite adjuntar imágenes y corre en
Docker con HTTPS automático (Caddy).

## Características

- Streaming de respuestas en tiempo real (SSE).
- Conversaciones persistidas en SQLite: lista lateral para retomar hilos.
- Adjuntar imágenes (botón, pegar o arrastrar) para modelos con visión.
- Selector de modelo de OpenCode Go.
- Markdown y resaltado de código en las respuestas.
- Login con contraseña; la API key nunca llega al navegador.
- TLS gestionado por el Caddy ya existente en el servidor (proyecto `crm`).

## Estructura

```
.
├── app/                 # código de la aplicación (Bun + Hono + SQLite)
│   ├── index.ts         # servidor y rutas
│   ├── db.ts            # esquema y consultas SQLite
│   ├── opencode.ts      # cliente de la API de OpenCode Go
│   ├── auth.ts          # login + cookie firmada
│   └── public/          # frontend vanilla (HTML/CSS/JS + vendor)
├── Dockerfile
├── docker-compose.yml   # chat, unido a la red del Caddy existente
└── .env.example
```

## Configuración

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción |
|---|---|
| `OPENCODE_GO_API_KEY` | API key de tu suscripción Go en https://opencode.ai/zen |
| `APP_PASSWORD` | Contraseña para entrar al chat |
| `SESSION_SECRET` | Cadena larga y aleatoria para firmar la sesión |
| `DEFAULT_MODEL` | Modelo por defecto (p. ej. `deepseek-v4.1-flash`) |
| `GO_BASE_URL` | `https://opencode.ai/zen/go/v1` |
| `GO_USER_AGENT` | Identificador del cliente enviado como User-Agent |

El `.env` nunca se versiona. Los datos de la app viven en `data/` (SQLite +
imágenes subidas) y también están ignorados por git.

## Desarrollo local

Requiere [Bun](https://bun.sh):

```bash
cd app && bun install
COOKIE_SECURE=false APP_PASSWORD=dev SESSION_SECRET=dev-secret \
  OPENCODE_GO_API_KEY=tu-key bun run --watch index.ts
```

Abre http://localhost:3000.

## Despliegue con Docker

Este servidor ya tiene un Caddy (proyecto `crm`) escuchando en 80/443. Champi no
levanta su propio proxy: se une a la red `crm_crm-internal` y se publica a través
de ese Caddy.

1. Rellena `.env` (`OPENCODE_GO_API_KEY`, `APP_PASSWORD`, `SESSION_SECRET`).
2. Levanta el contenedor:

```bash
docker compose up -d --build
docker compose logs -f chat
```

3. El Caddy del CRM ya tiene este bloque (proyecto `../resources/crm/Caddyfile`):

```caddyfile
chat.eduardovilla.com {
	encode zstd gzip
	reverse_proxy champi-chat:3000
}
```

Recarga Caddy tras cualquier cambio del Caddyfile:

```bash
docker exec crm-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Caddy obtiene el certificado TLS automáticamente. Los datos se guardan en
`./data` del host.

## Integración con OpenCode Go

- Endpoint OpenAI-compatible: `POST {GO_BASE_URL}/chat/completions` con `stream: true`.
- Se envían los headers `Authorization: Bearer …`, `User-Agent` propio y
  `x-opencode-session` (id de conversación) según la política de uso de Go.
- Solo los modelos con visión aceptan imágenes (p. ej.
  `deepseek-v4-flash-vision-exp`); el selector los marca como `· visión`.
- El uso cuenta contra los límites mensuales de tu plan Go.

## Créditos

Construido sobre la plantilla base de contexto (`01_context/` … `06_automation/`).
Ver `AGENTS.md` para las convenciones del repositorio.
