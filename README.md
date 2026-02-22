# Experiments to run onnx on Cloudflare Stack

## Prereqirements

- Cloudflare Workers
- Transformers.js (v3)

## Result

Options are:

1. Cloudflare Workers (server-side) > ❌ (Cannot keep memory usage within 128MB.)
2. Service Worker on Browser (client-side) > ❌ (https://github.com/w3c/ServiceWorker/issues/1356)
3. Web Worker on Browser (client-side) > ✅
4. Main thread on Browser (client-side) > ✅

## Reference

Cloudflare Workers:

- https://github.com/CosteGieF/ort-cloudflare-workers

Browser (Service Worker):

- https://hono.dev/docs/getting-started/service-worker
- https://zenn.dev/mktbsh/articles/1d8a1b06bd5105
- https://github.com/mktbsh/hono-sw-magic-ts
- https://github.com/sugar-cat7/example-hono-service-Worker
- https://zenn.dev/yamachu/articles/e6fc24d8104e9e