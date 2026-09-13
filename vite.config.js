import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this app from a subfolder (/GuestManagementSystem/),
// but Vercel serves it from the root domain. Vercel automatically sets the
// VERCEL environment variable during its builds, so we use that to pick
// the right base path automatically, no manual switching needed.
export default defineConfig({
  plugins: [react()],
  base: process.env.VERCEL ? '/' : '/GuestManagementSystem/',
});
