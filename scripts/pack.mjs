/**
 * 把 dist 产物内联成单个 HTML，生成可直接双击运行的 Demo：
 *   d:\游戏文档\乱斗协议-Demo.html
 * 用法：npm run pack
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const outFile = path.resolve(root, '..', '乱斗协议-Demo.html');

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

// 内联 JS（IIFE 经典脚本，file:// 下无需 CORS）
html = html.replace(
  /<script[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_m, src) => {
    const file = path.join(dist, src.replace(/^\.?\//, ''));
    return `<script>\n${fs.readFileSync(file, 'utf8')}\n</script>`;
  },
);

// 内联 CSS
html = html.replace(
  /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_m, href) => {
    const file = path.join(dist, href.replace(/^\.?\//, ''));
    return `<style>\n${fs.readFileSync(file, 'utf8')}\n</style>`;
  },
);

// 去掉 modulepreload 之类的预加载标签（已全部内联）
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '');

fs.writeFileSync(outFile, html, 'utf8');
console.log('已生成单文件 Demo:', outFile, `(${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
