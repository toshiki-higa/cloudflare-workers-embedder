import { defineConfig, type Plugin } from "vite";
import ssrPlugin from "vite-ssr-components/plugin";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKERS_NAME = "cloudflare-workers-embedder"
const OUT_DIR = resolve(__dirname, "dist");
const ORT_DIST = resolve(__dirname, "node_modules/onnxruntime-web/dist");

const onnxruntimePlugin = (): Plugin => ({
  name: "onnxruntime-web-patch",
  apply: "build",
  closeBundle() {
    const candidateEntrypoints = [
      resolve(OUT_DIR, `${WORKERS_NAME.replace(/-/g, '_')}/index.js`),
    ];
    
    const indexPath = candidateEntrypoints.find((p) => existsSync(p));
    if (!indexPath) return;
    console.info(`Found entrypoint: ${indexPath}`);
    console.info("Patching ONNX Runtime Web for Cloudflare Workers...");

    const workerDir = dirname(indexPath);
    const wasmPath = resolve(workerDir, "ort-wasm-simd-threaded.wasm");

    // Keep only canonical wasm module next to worker entry.
    if (!existsSync(wasmPath)) {
      cpSync(resolve(ORT_DIST, "ort-wasm-simd-threaded.wasm"), wasmPath);
    }

    let code = readFileSync(indexPath, "utf8");

    // Make patches idempotent.
    const preambleLine1 = 'import __ORT_WASM__ from "./ort-wasm-simd-threaded.wasm";';
    const preambleLine2 = 'globalThis.__ORT_WASM__ = __ORT_WASM__;';
    const preambleBlock = `${preambleLine1}\n${preambleLine2}\n`;
    while (code.startsWith(preambleBlock)) code = code.slice(preambleBlock.length);
    code = code.replace(/\w+\.instantiateWasm = \(imports, cb\) => \{[^}]+return inst\.exports; \};\s*/g, "");

    // Patch 1: preamble
    code = preambleBlock + code;

    // Patch 2: inject instantiateWasm
    const configMatch = code.match(/let\s+(\w+)\s*=\s*\{\s*numThreads:\s*(\w+)\s*\}/);
    if (!configMatch) throw new Error("Could not find Emscripten config `let X = { numThreads: Y }`.");
    const configVar = configMatch[1];

    const factoryCallRe = new RegExp(`(\\w+)\\(${configVar}\\)\\.then\\(`);
    const factoryMatch = code.match(factoryCallRe);
    if (!factoryMatch) throw new Error(`Could not find factory call FUNC(${configVar}).then(`);

    const instantiateWasmSnippet =
      `${configVar}.instantiateWasm = (imports, cb) => {` +
      ` var inst = new WebAssembly.Instance(__ORT_WASM__, imports);` +
      ` cb(inst, __ORT_WASM__);` +
      ` return inst.exports; };`;

    code = code.replace(factoryMatch[0], instantiateWasmSnippet + " " + factoryMatch[0]);

    // Patch 3: disable variable dynamic import
    code = code.replace(/await import\([\s\S]*?\)/g, (match) => {
      if (/await import\(\s*["'`]/.test(match)) return match;
      return 'await Promise.reject(new Error("dynamic import disabled in workerd"))';
    });

    if (!/export\s+default\s+\w+\s*;|export\s+\{[^}]*\bas\s+default\b[^}]*\}/.test(code)) {
      code += "\nexport default app;\n";
    }

    writeFileSync(indexPath, code);

    // Remove stale root wasm if any.
    const rootWasm = resolve(OUT_DIR, "ort-wasm-simd-threaded.wasm");
    if (rootWasm !== wasmPath) rmSync(rootWasm, { force: true });
  },
});

export default defineConfig({
  plugins: [
    cloudflare(),
    tailwindcss(),
    ssrPlugin(),
    onnxruntimePlugin()
  ],
  resolve: {
    alias: {
      "onnxruntime-web": resolve(ORT_DIST, "ort.wasm.bundle.min.mjs"),
    },
  },
  build: {
    minify: false,
    cssMinify: 'esbuild', // adopt tailwindcss to vite@v8
    emptyOutDir: true,
  },
});
