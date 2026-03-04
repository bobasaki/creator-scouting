# UI

The UI is a Next.js app that proxies backend requests through the same origin.

## How it works

- The browser calls relative paths under `/backend`.
- Next.js rewrites `/backend/:path*` to `BACKEND_URL/:path*`.
- `BACKEND_URL` is server-side only, so the browser never needs to know the API host.

This means the UI works the same way when you open it from:

- `localhost`
- another device on your LAN
- a deployed server

## Environment

Set `BACKEND_URL` for the machine running the UI server.

Example for local development:

```bash
BACKEND_URL=http://127.0.0.1:3000
```

Example when both services run on the same server:

```bash
BACKEND_URL=http://127.0.0.1:3000
```

Example when the UI must reach the API on another host:

```bash
BACKEND_URL=http://api.internal:3000
```

If you open the Next dev server from another device, add that UI origin to `DEV_ALLOWED_ORIGINS`.

Example:

```bash
DEV_ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001,http://192.168.1.150:3001
```

## Development

Run the API:

```bash
cd apps/api
npm run dev
```

Run the UI:

```bash
cd apps/ui
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).
