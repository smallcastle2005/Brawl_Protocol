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
    // BOSS 配乐 mp3 约 2.9MB，需一起内联进单文件 Demo（默认 1MB 会被拆成外部文件，file:// 下无法加载）
    assetsInlineLimit: 4 * 1024 * 1024,
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
