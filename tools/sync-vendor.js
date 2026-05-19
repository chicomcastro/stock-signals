#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const pairs = [
  {
    from: path.join("node_modules", "chart.js", "dist", "chart.umd.js"),
    to: path.join("public", "chart.umd.js"),
  },
];

for (const { from, to } of pairs) {
  try {
    if (!fs.existsSync(from)) {
      console.warn(`[sync-vendor] missing source: ${from}`);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log(`[sync-vendor] ${from} → ${to}`);
  } catch (err) {
    console.warn(`[sync-vendor] failed for ${from}: ${err.message}`);
  }
}
