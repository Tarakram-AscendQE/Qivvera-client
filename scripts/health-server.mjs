import http from "node:http";
import { pathToFileURL } from "node:url";

// Process health only. No assessment endpoint and no customer data.
export function createHealthServer() {
  return http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200);
      res.end(JSON.stringify({service:"qivvera-foundation",version:"0.0.1",process:"running",productReady:false}));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({error:"NOT_FOUND"}));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createHealthServer();
  server.listen(port, host, () => console.log(`Foundation health endpoint listening on ${host}:${port}; not a product release.`));
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
}
