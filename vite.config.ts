import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  build: {
    minify: true,
    cssMinify: 'esbuild', // adopt tailwindcss to vite@v8
  },
  plugins: [cloudflare(), tailwindcss(), ssrPlugin()]
})
