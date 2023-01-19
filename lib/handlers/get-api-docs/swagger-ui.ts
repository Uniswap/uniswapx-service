const SWAGGER_UI = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="SwaggerUI"
    />
    <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@4.14.3/favicon-32x32.png" sizes="32x32">
    <title>SwaggerUI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4.14.3/swagger-ui.css" />
  </head>
  <body style="margin:0">
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4.14.3/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@4.14.3/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: './api-docs/json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout",
      });
    };
  </script>
  </body>
</html>
`;
export default SWAGGER_UI;
