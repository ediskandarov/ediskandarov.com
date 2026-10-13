import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  cacheControl,
  checkBuild,
  loadAssets,
  mediaBaseUrl,
  uploadAssets,
  verifyAsset,
  verifyAssets,
} from "../scripts/media.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "blog-media-ci-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entries = [
    [
      "media/posts/demo/clip.mp4",
      "external",
      Buffer.from("0123456789".repeat(300)),
    ],
    ["media/posts/demo/screen.png", "external", Buffer.from("small image")],
    ["public/images/diagram.svg", "site", Buffer.from("<svg/>")],
  ];
  const assets = [];
  await mkdir(join(root, "docs"));
  for (const [file, storage, data] of entries) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), data);
    assets.push({
      file,
      storage,
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  const manifest = join(root, "docs/demo-assets.json");
  const save = () => writeFile(manifest, JSON.stringify({ assets }));
  await save();
  return { root, assets, save };
}

function responses(
  asset,
  bytes,
  {
    mime = asset.contentType,
    full = bytes,
    rangeStatus = 206,
    rangeBytes,
    headStatus = 200,
    cache = cacheControl,
  } = {},
) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, ...options });
    const headers = {
      "Content-Type": mime,
      "Cache-Control": cache,
      "Content-Disposition": "inline",
    };
    if (options.method === "HEAD") {
      return new Response(null, {
        status: headStatus,
        headers: { ...headers, "Content-Length": String(bytes.length) },
      });
    }
    if (options.headers.Range) {
      const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
      const body = rangeBytes ?? bytes.subarray(Number(start), Number(end) + 1);
      return new Response(body, {
        status: rangeStatus,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
          "Content-Length": String(body.length),
        },
      });
    }
    return new Response(full, { headers });
  };
  return { calls, fetcher };
}

test("manifests validate local bytes and separate site assets from external object keys", async (t) => {
  const { root } = await fixture(t);
  const assets = await loadAssets(root);
  assert.equal(assets.length, 3);
  assert.equal(assets[0].key, "posts/demo/clip.mp4");
  assert.equal(assets[0].contentType, "video/mp4");
  assert.equal(assets[2].key, undefined);
});

test("corrupted media fails before any upload even when its size is unchanged", async (t) => {
  const { root, assets } = await fixture(t);
  await writeFile(join(root, assets[0].file), "x".repeat(assets[0].bytes));
  await assert.rejects(loadAssets(root), /SHA-256 mismatch/);
});

test("manifest paths cannot escape source directories or duplicate upload keys", async (t) => {
  const { root, assets, save } = await fixture(t);
  const original = assets[0].file;
  for (const file of [
    "media/../secret.mp4",
    "media/.secret.mp4",
    "/tmp/clip.mp4",
    "public/clip.mp4",
  ]) {
    assets[0].file = file;
    await save();
    await assert.rejects(
      loadAssets(root),
      /unsafe asset path|must be in media/,
    );
  }
  assets[0].file = original;
  assets.push(assets[0]);
  await save();
  await assert.rejects(loadAssets(root), /duplicate manifest entry/);
});

test("symlinks cannot upload files outside media", async (t) => {
  const { root, assets } = await fixture(t);
  const path = join(root, assets[0].file);
  await rm(path);
  await symlink(join(root, assets[2].file), path);
  await assert.rejects(loadAssets(root), /symlink escapes media/);
});

test("upload sets HTTP metadata, uses remote R2, and excludes site assets", async (t) => {
  const { root } = await fixture(t);
  const assets = await loadAssets(root);
  const calls = [];
  const count = await uploadAssets(assets, {
    bucket: "blog-media",
    jurisdiction: "eu",
    env: {
      CLOUDFLARE_API_TOKEN: "test-only",
      CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    },
    run: async (args) => calls.push(args),
  });
  assert.equal(count, 2);
  assert.deepEqual(calls[0], [
    "r2",
    "object",
    "put",
    "blog-media/posts/demo/clip.mp4",
    "--file",
    assets[0].path,
    "--content-type",
    "video/mp4",
    "--cache-control",
    cacheControl,
    "--content-disposition",
    "inline",
    "--remote",
    "--jurisdiction",
    "eu",
  ]);
  assert.equal(calls[1][calls[1].indexOf("--content-type") + 1], "image/png");
});

test("missing configuration and failed uploads stop deployment preparation", async (t) => {
  const { root } = await fixture(t);
  const assets = await loadAssets(root);
  const env = {
    CLOUDFLARE_API_TOKEN: "test-only",
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  };
  let calls = 0;
  const run = async () => {
    calls++;
    throw new Error("Upload failed");
  };
  await assert.rejects(uploadAssets(assets, { env, run }), /R2_BUCKET/);
  await assert.rejects(
    uploadAssets(assets, { bucket: "blog-media", env: {}, run }),
    /CLOUDFLARE_API_TOKEN/,
  );
  await assert.rejects(
    uploadAssets(assets, {
      bucket: "blog-media",
      env: { CLOUDFLARE_API_TOKEN: "test-only" },
      run,
    }),
    /CLOUDFLARE_ACCOUNT_ID/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    uploadAssets(assets, { bucket: "blog-media", env, run }),
    /Upload failed/,
  );
  assert.equal(calls, 1);
});

test("public verification checks canonical URLs, metadata, hashes, and actual seek bytes", async (t) => {
  const { root } = await fixture(t);
  const [asset] = await loadAssets(root);
  const bytes = await readFile(asset.path);
  const { calls, fetcher } = responses(asset, bytes);
  await verifyAsset(asset, "https://media.example.com/archive/", fetcher);
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every(
      (call) =>
        call.url === "https://media.example.com/archive/posts/demo/clip.mp4" &&
        call.redirect === "error",
    ),
  );
  assert.equal(calls[2].headers.Range, "bytes=1976-2999");
});

test("public verification rejects wrong metadata, stale bytes, and broken video ranges", async (t) => {
  const { root } = await fixture(t);
  const [asset] = await loadAssets(root);
  const bytes = await readFile(asset.path);
  for (const [options, error] of [
    [{ headStatus: 404 }, /HTTP status/],
    [{ mime: "application/octet-stream" }, /MIME type/],
    [{ cache: "public, max-age=31536000, immutable" }, /cache policy/],
    [{ full: Buffer.alloc(bytes.length) }, /public SHA-256/],
    [{ rangeStatus: 200 }, /HTTP status/],
    [{ rangeBytes: Buffer.alloc(1024) }, /video range bytes/],
  ]) {
    await assert.rejects(
      verifyAsset(
        asset,
        "https://media.example.com",
        responses(asset, bytes, options).fetcher,
      ),
      error,
    );
  }
});

test("verification retries transient failures but ultimately blocks on unavailable media", async (t) => {
  const { root } = await fixture(t);
  const [asset] = await loadAssets(root);
  const bytes = await readFile(asset.path);
  const good = responses(asset, bytes).fetcher;
  const waits = [];
  let calls = 0;
  const fetcher = async (...args) =>
    ++calls <= 2 ? new Response(null, { status: 404 }) : good(...args);
  assert.equal(
    await verifyAssets([asset], "https://media.example.com", {
      fetcher,
      retryDelays: [1, 2],
      wait: async (ms) => waits.push(ms),
      log: () => {},
    }),
    1,
  );
  assert.deepEqual(waits, [1, 2]);
  await assert.rejects(
    verifyAssets([asset], "https://media.example.com", {
      fetcher: async () => new Response(null, { status: 404 }),
      retryDelays: [],
      log: () => {},
    }),
    /HTTP status/,
  );
});

test("build check prevents media bytes from shipping with Worker assets", async (t) => {
  const { root } = await fixture(t);
  await mkdir(join(root, "dist"));
  await checkBuild(root);
  await mkdir(join(root, "dist/media"));
  await assert.rejects(checkBuild(root), /must not ship as Worker assets/);
});

test("media origin supports a path prefix and rejects credential-bearing or malformed hosts", () => {
  assert.equal(mediaBaseUrl(), "https://media.ediskandarov.com");
  assert.equal(
    mediaBaseUrl("https://cdn.example.com/archive/"),
    "https://cdn.example.com/archive",
  );
  for (const value of [
    "http://cdn.example.com",
    "https://user:pass@cdn.example.com",
    "https://cdn.example.com?x=1",
    "https://cdn.example.com#fragment",
    "https://",
  ]) {
    assert.throws(() => mediaBaseUrl(value));
  }
});
