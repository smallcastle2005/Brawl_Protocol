import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    // 打成单文件 IIFE，便于由 pack 脚本内联进 HTML，双击即可运行（file:// 也能跑）
    target: 'es2019',
    assetsInlineLimit: 1024 * 1024,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/game.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
