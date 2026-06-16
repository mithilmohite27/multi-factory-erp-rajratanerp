import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function localApiPlugin() {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res, next) => {
        try {
          const requestPath = new URL(req.url, "http://localhost").pathname
            .replace(/^\/api\/?/, "")
            .replace(/^\/+/, "");
          const apiFile = path.resolve("api", `${requestPath}.js`);

          if (!apiFile.startsWith(path.resolve("api")) || !fs.existsSync(apiFile)) {
            next();
            return;
          }

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString("utf8");

          req.body = body;
          req.query = Object.fromEntries(
            new URL(req.url, "http://localhost").searchParams,
          );
          res.status = (statusCode) => {
            res.statusCode = statusCode;
            return res;
          };
          res.json = (payload) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(payload));
          };

          const module = await import(
            `${pathToFileURL(apiFile).href}?t=${Date.now()}`
          );
          await module.default(req, res);
        } catch (error) {
          server.ssrFixStacktrace(error);
          res.statusCode = error.statusCode || 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              ok: false,
              error: error.message || "Local API request failed.",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), localApiPlugin()],
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
    },
  };
});
