import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import { site } from "./lib/site";

const posts = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./content/posts",
    // Preserve filenames and all existing /posts/... URLs.
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().default(site.name),
    draft: z.boolean().default(false),
    tags: z.array(z.string().min(1)).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
  }),
});

export const collections = { posts };
