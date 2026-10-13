import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, readdir, realpath, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
export const cacheControl = "public, max-age=300, must-revalidate";
const contentTypes = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".json": "application/json",
  ".vtt": "text/vtt",
};

async function digest(stream) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of stream) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest("hex") };
}

export async function loadAssets(root = rootDirectory) {
  const manifests = (await readdir(join(root, "docs")))
    .filter((name) => name.endsWith("-assets.json"))
    .sort();
  assert.ok(manifests.length, "No docs/*-assets.json manifests found");
  const assets = [];
  const files = new Set();
  for (const manifest of manifests) {
    const data = JSON.parse(
      await readFile(join(root, "docs", manifest), "utf8"),
    );
    assert.ok(
      Array.isArray(data.assets),
      `${manifest}: assets must be an array`,
    );
    for (const asset of data.assets) {
      const { file, storage, bytes, sha256 } = asset;
      assert.ok(
        typeof file === "string" &&
          /^[a-zA-Z0-9_./-]+$/.test(file) &&
          !file.split("/").some((part) => !part || part.startsWith(".")),
        `${manifest}: unsafe asset path`,
      );
      assert.ok(
        ["external", "site"].includes(storage),
        `${file}: invalid storage`,
      );
      const directory = storage === "external" ? "media" : "public";
      assert.ok(
        file.startsWith(`${directory}/`),
        `${file}: must be in ${directory}/`,
      );
      assert.ok(!files.has(file), `${file}: duplicate manifest entry`);
      files.add(file);
      assert.ok(
        Number.isSafeInteger(bytes) && bytes > 0,
        `${file}: invalid size`,
      );
      assert.match(sha256 ?? "", /^[a-f0-9]{64}$/, `${file}: invalid SHA-256`);
      const path = await realpath(join(root, file));
      const allowedDirectory = `${await realpath(join(root, directory))}${sep}`;
      assert.ok(
        path.startsWith(allowedDirectory),
        `${file}: symlink escapes ${directory}/`,
      );
      const info = await stat(path);
      assert.ok(info.isFile(), `${file}: not a regular file`);
      assert.equal(info.size, bytes, `${file}: size mismatch`);
      const actual = await digest(createReadStream(path));
      assert.equal(actual.sha256, sha256, `${file}: SHA-256 mismatch`);
      if (storage === "external") {
        assert.ok(
          bytes <= 300 * 1024 * 1024,
          `${file}: exceeds Wrangler's 300 MiB upload limit`,
        );
        assert.ok(
          contentTypes[extname(file).toLowerCase()],
          `${file}: unsupported media type`,
        );
      }
      assets.push({
        ...asset,
        path,
        key: storage === "external" ? file.slice("media/".length) : undefined,
        contentType: contentTypes[extname(file).toLowerCase()],
      });
    }
  }
  return assets;
}

export function uploadArguments(asset, { bucket, jurisdiction = "" }) {
  assert.match(
    bucket ?? "",
    /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
    "Set R2_BUCKET to the bucket name from the R2 dashboard (not the hostname)",
  );
  assert.ok(
    asset.storage === "external",
    "Only external manifest assets may be uploaded",
  );
  assert.ok(
    ["", "eu", "fedramp", "us"].includes(jurisdiction),
    "Invalid R2_JURISDICTION",
  );
  return [
    "r2",
    "object",
    "put",
    `${bucket}/${asset.key}`,
    "--file",
    asset.path,
    "--content-type",
    asset.contentType,
    "--cache-control",
    cacheControl,
    "--content-disposition",
    "inline",
    "--remote",
    ...(jurisdiction ? ["--jurisdiction", jurisdiction] : []),
  ];
}

function runWrangler(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      [join(rootDirectory, "node_modules/wrangler/bin/wrangler.js"), ...args],
      {
        cwd: rootDirectory,
        stdio: "inherit",
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`Wrangler upload failed (${code})`)),
    );
  });
}

export async function uploadAssets(
  assets,
  {
    bucket,
    jurisdiction,
    dryRun = false,
    env = process.env,
    run = runWrangler,
  } = {},
) {
  const commands = assets
    .filter((asset) => asset.storage === "external")
    .map((asset) => uploadArguments(asset, { bucket, jurisdiction }));
  if (!dryRun) {
    assert.ok(
      env.CLOUDFLARE_API_TOKEN,
      "Set the CLOUDFLARE_API_TOKEN secret with Workers R2 Storage Edit permission",
    );
    assert.match(
      env.CLOUDFLARE_ACCOUNT_ID ?? "",
      /^[a-f0-9]{32}$/i,
      "Set the CLOUDFLARE_ACCOUNT_ID secret",
    );
  }
  for (const args of commands) {
    if (dryRun) console.log(JSON.stringify(args));
    else await run(args);
  }
  return commands.length;
}

export function mediaBaseUrl(value = "https://media.ediskandarov.com") {
  const url = new URL(value);
  assert.ok(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    "MEDIA_BASE_URL must be an HTTPS URL without credentials, query, or fragment",
  );
  return url.href.replace(/\/+$/, "");
}

async function request(url, options, fetcher) {
  return fetcher(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    headers: { "Accept-Encoding": "identity", ...options.headers },
  });
}

function checkHeaders(response, asset, status) {
  assert.equal(response.status, status, `${asset.key}: HTTP status`);
  assert.equal(
    response.headers.get("content-type")?.split(";")[0],
    asset.contentType,
    `${asset.key}: MIME type`,
  );
  assert.equal(
    response.headers.get("content-encoding"),
    null,
    `${asset.key}: unexpected content encoding`,
  );
}

export async function verifyAsset(asset, base, fetcher = fetch) {
  const url = `${mediaBaseUrl(base)}/${asset.key}`;
  const head = await request(url, { method: "HEAD" }, fetcher);
  checkHeaders(head, asset, 200);
  assert.equal(
    head.headers.get("content-length"),
    String(asset.bytes),
    `${asset.key}: HEAD size`,
  );
  const directives = head.headers
    .get("cache-control")
    ?.split(",")
    .map((part) => part.trim())
    .sort();
  assert.deepEqual(
    directives,
    cacheControl
      .split(",")
      .map((part) => part.trim())
      .sort(),
    `${asset.key}: cache policy`,
  );
  assert.equal(
    head.headers.get("content-disposition"),
    "inline",
    `${asset.key}: content disposition`,
  );

  const response = await request(url, { method: "GET" }, fetcher);
  try {
    checkHeaders(response, asset, 200);
  } catch (error) {
    await response.body?.cancel();
    throw error;
  }
  const actual = await digest(response.body);
  assert.equal(actual.bytes, asset.bytes, `${asset.key}: public size`);
  assert.equal(actual.sha256, asset.sha256, `${asset.key}: public SHA-256`);

  if (asset.contentType.startsWith("video/")) {
    const length = Math.min(1024, asset.bytes);
    const start = asset.bytes - length;
    const range = await request(
      url,
      {
        method: "GET",
        headers: { Range: `bytes=${start}-${asset.bytes - 1}` },
      },
      fetcher,
    );
    let received;
    try {
      checkHeaders(range, asset, 206);
      assert.equal(
        range.headers.get("content-range"),
        `bytes ${start}-${asset.bytes - 1}/${asset.bytes}`,
        `${asset.key}: video Content-Range`,
      );
      assert.equal(
        range.headers.get("content-length"),
        String(length),
        `${asset.key}: video range length`,
      );
      received = Buffer.from(await range.arrayBuffer());
    } catch (error) {
      await range.body?.cancel().catch(() => {});
      throw error;
    }
    const file = await open(asset.path, "r");
    try {
      const expected = Buffer.alloc(length);
      const { bytesRead } = await file.read(expected, 0, length, start);
      assert.equal(bytesRead, length, `${asset.key}: local video range length`);
      assert.deepEqual(received, expected, `${asset.key}: video range bytes`);
    } finally {
      await file.close();
    }
  }
}

export async function verifyAssets(
  assets,
  base,
  {
    fetcher = fetch,
    retryDelays = [5_000, 15_000, 30_000, 60_000, 90_000],
    wait = delay,
    log = console.log,
  } = {},
) {
  const external = assets.filter((asset) => asset.storage === "external");
  const results = await Promise.allSettled(
    external.map(async (asset) => {
      for (let attempt = 0; ; attempt++) {
        try {
          await verifyAsset(asset, base, fetcher);
          log(`Verified ${asset.key}`);
          return;
        } catch (error) {
          if (attempt === retryDelays.length) throw error;
          log(`Retrying ${asset.key}: ${error.message}`);
          await wait(retryDelays[attempt]);
        }
      }
    }),
  );
  const errors = results.filter((result) => result.status === "rejected");
  if (errors.length)
    throw new Error(errors.map((result) => result.reason.message).join("\n"));
  return external.length;
}

export async function checkBuild(root = rootDirectory) {
  await stat(join(root, "dist"));
  try {
    await stat(join(root, "dist/media"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(
    "dist/media exists: source media must not ship as Worker assets",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [command, ...flags] = process.argv.slice(2);
    assert.ok(
      ["check", "upload", "verify"].includes(command),
      "Use media.mjs check|upload|verify",
    );
    assert.ok(
      flags.every(
        (flag) =>
          flag ===
          (command === "check"
            ? "--build"
            : command === "upload"
              ? "--dry-run"
              : ""),
      ),
      "Unknown media command option",
    );
    const assets = await loadAssets();
    if (command === "check") {
      if (flags.includes("--build")) await checkBuild();
      console.log(
        `Verified ${assets.length} local assets against their manifests`,
      );
    } else if (command === "upload") {
      const count = await uploadAssets(assets, {
        bucket: process.env.R2_BUCKET,
        jurisdiction: process.env.R2_JURISDICTION,
        dryRun: flags.includes("--dry-run"),
      });
      console.log(
        `${flags.includes("--dry-run") ? "Planned" : "Uploaded"} ${count} external media files`,
      );
    } else {
      const count = await verifyAssets(assets, process.env.MEDIA_BASE_URL);
      console.log(`Verified ${count} public media files`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
