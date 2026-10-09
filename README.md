# Northstock

A lightweight inventory operations SPA built with React, TypeScript, Vite, and React Router.

## Run locally

```sh
npm install
cp .env.example .env.local
npm run dev
```

For local development, set `VITE_API_PROXY_TARGET` in `.env.local` to the backend origin (defaults to `http://localhost:8080`); Vite proxies `/api/*` to the backend and removes the browser's `Origin` header, avoiding development CORS checks. In production, set `VITE_API_BASE_URL` if the backend is on a separate origin, and configure CORS there or route both through the same origin. The frontend calls the backend's `/product`, `/warehouse`, `/inventory`, `/customer`, and `/order` endpoints.

## Included screens

- Public landing page with an overview of Northstock and links into the workspace
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
docker build -t northstock-frontend .
docker run --rm -p 8080:80 northstock-frontend
```

For a hosted build, set the frontend API URL at build time:

```sh
VITE_API_BASE_URL=https://api.example.com npm run build
```

The API layer is in `src/api.ts`; request and response payloads follow the backend contract, including its `isActive` and `movementType` camelCase fields.
