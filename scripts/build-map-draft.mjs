import { runCanvasCli } from "file:///C:/Users/32736/.trae-cn/plugins/trae-remote-official/whiteboard/0.2.0/skills/whiteboard-design/scripts/canvas-cli.mjs";

const base = "d:/游戏文档/pixel-brawl/scripts/";
const opts = {
  executable: process.execPath,
  prefixArgs: [
    "C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js",
    "-y",
    "mcp-excalidraw-server@1.1.0",
  ],
  stdio: "inherit",
};

await runCanvasCli(["add", base + "map-draft.2400.json"], opts);
await runCanvasCli(["describe"], opts);
await runCanvasCli(["export", "--out", base + "map-draft.2400.excalidraw"], opts);
