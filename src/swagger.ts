import { Express } from "express";
import { buildOpenApi } from "./schemas/authSchema";

export function swaggerMiddleware(app: Express, basePath = "") {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

  app.set("trust proxy", 1);

  app.get(`${base}/docs-json`, (req, res) => {
    const openApiDoc = buildOpenApi();

    const proto =
      (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol;
    const host = req.get("host");

    openApiDoc.servers = [{ url: `${proto}://${host}` }];

    res.setHeader("Cache-Control", "no-store");
    res.json(openApiDoc);
  });

  app.get(`${base}/docs`, (_req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Accuraai API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        SwaggerUIBundle({
          url: '${base}/docs-json',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout'
        });
      };
    </script>
  </body>
</html>`);
  });
}
