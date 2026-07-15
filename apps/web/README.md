# Concord Web

React + Vite + TypeScript + Redux Toolkit + Tailwind. Tarayıcı istemcisi.

## Kurulum

```bash
pnpm install
pnpm dev
```

Tarayıcıdan `http://localhost:3000` adresine git.

Vite, `/api` isteklerini `http://localhost:8080`'e (Go API) ve `/socket` WS isteklerini `ws://localhost:4000`'a (Phoenix Gateway) proxy'liyor.
