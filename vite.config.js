import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative so GitHub Pages deep links resolve.
export default defineConfig({
  base: './',
  plugins: [react()],
})
