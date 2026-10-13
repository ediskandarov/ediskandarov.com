import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import localMedia from "../src/lib/local-media.mjs";

test("dev media supports video ranges and HEAD without exposing hidden files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blog-media-"));
  let server;
  try {
    await writeFile(join(directory, "clip.mp4"), "0123456789");
    await writeFile(join(directory, ".private"), "hidden");
    const plugin = localMedia({ directory });
    assert.equal(plugin.apply, "serve");
    plugin.configureServer({
      middlewares: {
        use(route, handler) {
          assert.equal(route, "/media");
          server = createServer((req, res) =>
            handler(req, res, () => {
              res.statusCode = 404;
              res.end();
            }),
          );
        },
      },
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const partial = await fetch(`${base}/clip.mp4`, {
      headers: { Range: "bytes=3-6" },
    });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get("content-range"), "bytes 3-6/10");
    assert.equal(await partial.text(), "3456");
    const head = await fetch(`${base}/clip.mp4`, { method: "HEAD" });
    assert.equal(head.headers.get("content-type"), "video/mp4");
    assert.equal(head.headers.get("content-length"), "10");
    assert.equal(await head.text(), "");
    assert.equal((await fetch(`${base}/.private`)).status, 404);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
