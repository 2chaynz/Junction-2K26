import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { askPlugin } from './server/ask.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // '' prefix loads unprefixed vars too; GEMINI_API_KEY stays server-side because only VITE_* reach the client.
  plugins: [react(), askPlugin(loadEnv(mode, process.cwd(), '').GEMINI_API_KEY)],
}))
