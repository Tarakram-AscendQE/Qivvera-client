import { readFileSync } from "node:fs";
const p=JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const l=JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));
if (p.name !== l.name || p.version !== l.version || !p.private) throw new Error("Package identity mismatch");
if (p.devDependencies.typescript !== l.packages["node_modules/typescript"].version) throw new Error("Dependency lock mismatch");
console.log("Package manifest and dependency lock agree.");
