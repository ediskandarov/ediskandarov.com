import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

export async function getPosts({ includeDrafts = false } = {}) {
  const posts = await getCollection(
    "posts",
    ({ data }) => includeDrafts || !data.draft,
  );
  return posts.sort(
    (a, b) =>
      b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id),
  );
}

export function postUrl(post: Post) {
  return `/posts/${post.id.split("/").map(encodeURIComponent).join("/")}`;
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function readingTime(post: Post) {
  const words =
    (post.body ?? "").replace(/<[^>]*>/g, "").match(/\S+/g)?.length ?? 0;
  return `${Math.max(1, Math.ceil(words / 220))} min read`;
}
