import type { NextConfig } from "next";

// O painel é 100% do lado do cliente (lê as planilhas locais pela File System Access API), então sai como
// export estático e roda em qualquer hospedagem de arquivos.
//
// O GitHub Pages serve um site de projeto em `/<nome-do-repositório>`. O workflow
// .github/workflows/deploy-pages.yml define NEXT_BASE_PATH só para esse build; deixe sem definir no
// desenvolvimento local.
const basePath = (process.env.NEXT_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
