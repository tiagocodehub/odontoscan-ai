/** @type {import('next').NextConfig} */

// Origem do backend derivada de NEXT_PUBLIC_API_URL (fallback local).
const API_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:8000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:8000";
  }
})();

const isDev = process.env.NODE_ENV === "development";

// CSP compativel com o runtime do Next 14 (App Router): o framework injeta
// scripts/estilos inline, por isso `'unsafe-inline'` e obrigatorio sem nonce.
// Em desenvolvimento o HMR tambem exige `'unsafe-eval'` e websockets.
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // `blob:` para o preview local do upload; `data:` para placeholders/inline.
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src 'self' ${API_ORIGIN}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // `false` = o lint roda durante o build e o INTERROMPE em caso de erro
    // (alem da validacao explicita via `npm run lint`).
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config) => {
    // Konva e usado apenas no cliente (via dynamic + ssr:false). No bundle de
    // servidor ele tenta resolver o modulo nativo `canvas`; neutralizamos o alias
    // para evitar "Module not found: Can't resolve 'canvas'".
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
