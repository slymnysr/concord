import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// pnpm'de paketler .pnpm/<ad>@<sürüm>_<peer'lar>/node_modules/<ad>/ altında durur →
// GERÇEK paket adı son 'node_modules/' segmentinden sonra gelir.
// Redux'un TÜM bağımlılıkları da burada olmalı: @reduxjs/toolkit → immer/reselect/
// @standard-schema. Onlar 'vendor'da kalırsa vendor-react → vendor → vendor-react
// döngüsü oluşur ve Vite "Circular chunk" uyarır (uygulama beyaz ekrana düşer).
const REACT_PKGS =
  /[\\/]node_modules[\\/](react|react-dom|react-is|react-redux|redux|redux-thunk|reselect|immer|@standard-schema|@reduxjs|scheduler|use-sync-external-store)[\\/]/;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Sabit bağımlılıkları ayrı 'vendor' chunk'larına al (tarayıcı önbelleği için)
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Lazy yüklenen büyük veriler vendor'a GİRMESİN — kendi dynamic chunk'larında kalsınlar
            if (
              id.includes('unicode-emoji-json') ||
              id.includes('@mediapipe') ||
              id.includes('web-noise-suppressor')
            )
              return undefined;
            if (id.includes('mediasoup-client')) return 'vendor-voice';
            // React EKOSİSTEMİNİN TAMAMI tek chunk'ta olmalı. Yol içinde substring aramak
            // ('/react') kırılgandı: react-redux'un yolu '/react-redux@' içerdiği için
            // vendor-react'a düşüyor, ama bağımlısı use-sync-external-store ('_react@'
            // içerir, '/react' değil) vendor'a düşüyordu → vendor-react ↔ vendor DÖNGÜSÜ →
            // React değerlenmeden okunuyor: "Cannot read properties of undefined
            // (reading 'useSyncExternalStore')" → uygulama beyaz ekran.
            // Paket ADIYLA kesin eşleşme bunu yapısal olarak imkânsız kılar.
            if (REACT_PKGS.test(id)) return 'vendor-react';
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
      '/socket': {
        target: 'ws://localhost:4000',
        ws: true,
      },
      '/voice-ws': {
        target: 'ws://localhost:4443',
        ws: true,
        rewrite: (p) => p.replace(/^\/voice-ws/, ''),
      },
      '/voice-api': {
        target: 'http://localhost:4444',
        rewrite: (p) => p.replace(/^\/voice-api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
