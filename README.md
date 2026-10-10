# ApexStock

A lightweight inventory operations SPA built with React, TypeScript, Vite, and React Router.

## Run locally

```sh
npm install
cp .env.example .env.local
npm run dev
```

For local development, set `VITE_API_PROXY_TARGET` in `.env.local` to the backend origin (defaults to `http://localhost:8080`); Vite proxies `/api/*` to the backend and removes the browser's `Origin` header, avoiding development CORS checks. In production, set `VITE_API_BASE_URL` if the backend is on a separate origin, and configure CORS there or route both through the same origin. The frontend calls the backend's `/product`, `/warehouse`, `/inventory`, `/customer`, and `/order` endpoints.

## Included screens

- Public landing page with an overview of ApexStock and links into the workspace
- Dashboard at `/dashboard` with stock totals, reorder warnings, recent orders, and quick actions
- Product and warehouse lists with search, create, edit, and delete actions
- Inventory by warehouse and low-stock list
- Stock adjustment and warehouse transfer dialogs with client-side quantity checks
- Customer list and creation
- Order creation with multiple line items, status filters, and pending cancellation
- Product/warehouse movement history

## Preview 

![Alt text](src\assets\ezgif.com-gif-maker.gif)

## Production deployment

The app ships as a static SPA and is ready to deploy behind any HTTP server. The repository includes a production Docker image that builds the frontend, serves it with Nginx, and falls back to `index.html` for client-side routes.

```sh
docker build -t apexstock-frontend .
docker run --rm -p 8080:80 apexstock-frontend
```

For a static hosting provider, configure the build command as `npm ci && npm run build` and the publish/output directory as `dist`. Do not publish the repository root or `src`: the source `index.html` points at `/src/main.tsx`, while the generated `dist/index.html` points at the bundled JavaScript under `/assets/`. Serving source files directly can produce the browser error about module scripts having an `application/octet-stream` MIME type.

Set `VITE_API_BASE_URL` in the hosting provider's build environment to the backend origin (for example, `https://api.example.com`), then trigger a fresh build and deployment. For local PowerShell builds, set it before building:

```powershell
$env:VITE_API_BASE_URL = "https://api.example.com"
npm run build
```

The API URL is embedded into the build, so changing it requires rebuilding and redeploying. For client-side routes such as `/dashboard`, configure the host to serve `index.html` as its SPA fallback; the included Docker/Nginx setup already does this.

The API layer is in `src/api.ts`; request and response payloads follow the backend contract, including its `isActive` and `movementType` camelCase fields.
