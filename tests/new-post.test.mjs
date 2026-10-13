import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPost } from "../scripts/new-post.mjs";

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "blog-new-post-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("new posts start as drafts with safe YAML titles and stable slugs", async (t) => {
  const root = await directory(t);
  const path = await createPost({
    title: 'Café: "a lesson"',
    directory: root,
    date: new Date("2026-10-13T12:00:00Z"),
  });
  assert.equal(path, join(root, "cafe-a-lesson.md"));
  const content = await readFile(path, "utf8");
  assert.match(content, /draft: true/);
  assert.match(content, /date: "2026-10-13"/);
  assert.match(content, /title: "Café: \\"a lesson\\""/);
});

test("creating a post twice cannot overwrite the original", async (t) => {
  const root = await directory(t);
  const options = { title: "My article", directory: root };
  const path = await createPost(options);
  const original = await readFile(path, "utf8");
  await assert.rejects(createPost(options), { code: "EEXIST" });
  assert.equal(await readFile(path, "utf8"), original);
});

test("explicit slugs support non-English titles and reject path traversal", async (t) => {
  const root = await directory(t);
  const path = await createPost({
    title: "Привет",
    slug: "hello",
    directory: root,
  });
  assert.equal(path, join(root, "hello.md"));
  for (const slug of ["../escape", "nested/post", "", "Uppercase"]) {
    await assert.rejects(
      createPost({ title: "A title", slug, directory: root }),
      /ASCII slug/,
    );
  }
  await assert.rejects(
    createPost({ title: " ", directory: root }),
    /Provide a title/,
  );
});
