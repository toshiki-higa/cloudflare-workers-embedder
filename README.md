# Experiments to run onnx on Cloudflare Stack

## Motivation
- Testing for using a lightweight onnx model in low-cost Edge environment.
- Mainly test for lightweight embedding model

## Prerequirements

- Cloudflare Workers
- Transformers.js (v3)
- onnxruntime-web

## Result

Options are:

1. Cloudflare Workers (server-side) > ✅ (But not working in Dev enviroment because of wasm)
2. Service Worker on Browser (client-side) > ❌ (https://github.com/w3c/ServiceWorker/issues/1356)
3. Web Worker on Browser (client-side) > ✅
4. Main thread on Browser (client-side) > ✅

## Limitation
- You must keep memory usage within 128MB in Cloudflare Workers (Server Side).

## Reference

Cloudflare Workers:

- https://github.com/CosteGieF/ort-cloudflare-workers

Browser (Service Worker):

- https://hono.dev/docs/getting-started/service-worker
- https://zenn.dev/mktbsh/articles/1d8a1b06bd5105
- https://github.com/mktbsh/hono-sw-magic-ts
- https://github.com/sugar-cat7/example-hono-service-Worker
- https://zenn.dev/yamachu/articles/e6fc24d8104e9e
