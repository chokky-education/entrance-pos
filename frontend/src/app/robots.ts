import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3005";
  return {
    rules: [
      {
        userAgent: [
          "*",
          "Googlebot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "GPTBot",
          "ClaudeBot",
          "PerplexityBot",
          "Google-Extended",
        ],
        allow: ["/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
