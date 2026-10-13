import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import blogMarkdown from "./src/lib/blog-markdown.mjs";

export default defineConfig({
  site: "https://ediskandarov.com",
  output: "static",
  trailingSlash: "never",
  integrations: [sitemap({ filter: (page) => !page.endsWith("/404") })],
  markdown: {
    processor: unified({ remarkPlugins: [blogMarkdown] }),
    shikiConfig: { themes: { light: "github-light", dark: "github-dark" } },
  },
});
