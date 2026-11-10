import { runCanvasCli } from "file:///C:/Users/32736/.trae-cn/plugins/trae-remote-official/whiteboard/0.2.0/skills/whiteboard-design/scripts/canvas-cli.mjs";

const argv = process.argv.slice(2);
const code = await runCanvasCli(argv, {
  executable: process.execPath,
  prefixArgs: [
    "C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js",
    "-y",
    "mcp-excalidraw-server@1.1.0",
  ],
});
process.exitCode = code ?? 0;
