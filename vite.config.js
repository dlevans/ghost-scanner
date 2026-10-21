import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Phones only allow camera access on HTTPS (localhost is the one exception).
// basicSsl gives `npm run dev` a self-signed cert so you can open
// https://<your-computer-ip>:5173 on a phone and accept the warning once.
export default defineConfig({
  plugins: [react(), basicSsl()],
  base: './',
});