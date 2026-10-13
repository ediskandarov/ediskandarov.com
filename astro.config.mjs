import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import localMedia from "./src/lib/local-media.mjs";
import blogMarkdown from "./src/lib/blog-markdown.mjs";

export default defineConfig({
  site: "https://ediskandarov.com",
  output: "static",
  trailingSlash: "never",
  integrations: [sitemap({ filter: (page) => !page.endsWith("/404") })],
  vite: { plugins: [localMedia()] },
  markdown: {
    processor: unified({
      remarkPlugins: [
        [
          blogMarkdown,
          {
            mediaBaseUrl:
              process.env.NODE_ENV === "production"
                ? process.env.MEDIA_BASE_URL || "https://media.ediskandarov.com"
                : "",
          },
        ],
      ],
    }),
    shikiConfig: { themes: { light: "github-light", dark: "github-dark" } },
  },
});
