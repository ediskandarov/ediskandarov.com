# ediskandarov.com

Ed Iskandarov's personal blog. Built with Astro, TypeScript, and plain CSS. Posts are Markdown; the output is a static site.

## Work locally

Use Node 24 (`nvm use` if you use nvm).

```sh
npm ci
npm run dev
```

Open the local URL printed by Astro. Editing a post or a page updates the preview immediately. Drafts appear locally with a badge.

```sh
npm run check       # Astro and TypeScript diagnostics
npm test           # Markdown and writing workflow checks
npm run build      # Production output in dist/
npm run preview    # Preview the production build (without drafts)
npm run format
```

## Write a post

```sh
npm run new-post -- "Something I learned while building"
```

This creates `content/posts/something-i-learned-while-building.md` as a draft. An existing file will never be overwritten. Use `--slug my-slug` to choose a filename, including for non-English titles.

```yaml
---
title: "Something I learned while building"
description: "A short summary for the archive, search engines, and link previews."
date: "2026-10-13"
draft: true
tags: [engineering]
---
```

Write below the frontmatter. The page supplies the title, date, and author, so start the body with a paragraph and use `##` for sections. Older posts with a matching `#` title also work. Code blocks support syntax highlighting, along with tables, task lists, and footnotes.

When ready, set `draft: false`, build, and commit with gitmoji:

```sh
git add content/posts/something-i-learned-while-building.md
git commit -m "📝 Publish something I learned while building"
```

The filename becomes `/posts/something-i-learned-while-building`. Keep it stable after publishing. Dates sort the archive; the filename does not need a date prefix. `author` defaults to Ed Iskandarov. Optional `updated`, `image`, and `imageAlt` fields set the update date and social preview image. Link previews have no image by default; an explicit `image` opts a post into an image preview. Use a public image URL or a path such as `/images/my-post.jpg`.

Drafts are excluded from the production homepage, archive, routes, and sitemap.

## Embed a video

Use an image-style Markdown embed on its own line with an MP4, WebM, or OGV URL:

```md
![A walkthrough of the project](https://media.ediskandarov.com/posts/my-post/demo.mp4)
```

It becomes a responsive video player with controls, a caption, and a download link. The browser initially loads only metadata. Normal images keep working as usual. URLs with query strings are supported.

For a poster image or captions, use HTML directly in Markdown:

```html
<figure>
  <video
    controls
    playsinline
    preload="metadata"
    poster="/images/demo-poster.jpg"
    aria-label="Project walkthrough"
  >
    <source
      src="https://media.ediskandarov.com/posts/my-post/demo.mp4"
      type="video/mp4"
    />
    <track
      kind="captions"
      src="/captions/demo.en.vtt"
      srclang="en"
      label="English"
      default
    />
    <a href="https://media.ediskandarov.com/posts/my-post/demo.mp4"
      >Download the video</a
    >
  </video>
  <figcaption>A walkthrough of the project.</figcaption>
</figure>
```

Videos with speech should include captions. For browser compatibility, MP4 with H.264 video and AAC audio is a useful default. Export for web playback (including fast start) before uploading; object storage does not transcode files.

Large videos and downloads are uploaded separately, with their URLs referenced in posts. Track source files in `media/` so GitHub Actions can retrieve them for upload; they stay outside the static site output. Cloudflare Pages and Workers Static Assets each have a 25 MiB limit per file. An R2 bucket is connected to `media.ediskandarov.com`; the manual production workflow uploads and verifies its media before deploying the site. The blog does not need storage credentials or a rebuild when a media file is uploaded to an existing URL.

## Find your way around

- `content/posts/`: articles and drafts.
- `src/pages/`: homepage, archive, articles, About, robots, and 404.
- `src/content.config.ts`: validated post metadata.
- `src/lib/site.ts`: biography links, email, and site description.
- `src/lib/blog-markdown.mjs`: video embeds and legacy title handling.
- `src/styles/global.css`: the monochrome layout and typography.
- `public/`: small images and files served at their original paths.

The design uses a white background, black serif text, and plain underlined links. There are no external fonts or analytics scripts. The historical posts and their publication dates are preserved, including the startup article whose filename contains 2021 while its frontmatter says 2020.

## Cloudflare and GitHub Actions

Wrangler is pinned in `package.json`. `wrangler.jsonc` serves the static output in `dist/` as the Worker `ediskandarov-blog`, preserves URLs without trailing slashes, and uses the generated `404.html` for missing pages. The canonical site URL is `https://ediskandarov.com`.

Run the same validation as GitHub Actions locally:

```sh
npm run ci
```

This checks formatting and types, runs tests, builds the site, validates manifest asset sizes and SHA-256 hashes, checks that `dist/media` is absent, and runs a Wrangler deployment dry run without publishing. To preview Cloudflare's actual routing locally:

```sh
npm run preview:cloudflare
```

The **CI** workflow runs on pushes to `main`, pull requests, and manual requests, without Cloudflare credentials or remote writes. The **Deploy to Cloudflare** workflow is started manually from GitHub's Actions tab, with `main` selected. It runs all checks again, uploads manifest-listed media to R2 with HTTP metadata, verifies public media, and then deploys the site. A failed upload or public verification stops the site deployment. Deployment uses the locked Wrangler version and credentials are available only to the upload and site deployment steps.

### Configure GitHub secrets and variables

In this repository's **Settings → Secrets and variables → Actions**, add:

| Repository secret       | Value                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | The account ID from the Cloudflare dashboard.                                                                                                                                 |
| `CLOUDFLARE_API_TOKEN`  | A Cloudflare API token scoped to that account, with **Account → Workers Scripts → Edit**, **Account → Account Settings → Read**, and **Account → Workers R2 Storage → Edit**. |

In the same GitHub settings page, select **Variables** and add:

| Repository variable | Value                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `R2_BUCKET`         | Required: the exact bucket name from R2, rather than its public domain.                                                                                                        |
| `MEDIA_BASE_URL`    | Optional: defaults to `https://media.ediskandarov.com`. Both CI builds and public verification use it.                                                                         |
| `R2_JURISDICTION`   | Optional: leave unset for a default-jurisdiction bucket; set `eu`, `us`, or `fedramp` only for a bucket created with that jurisdiction. A location hint is not a jurisdiction. |

To update an existing user API token:

1. Open Cloudflare's **My Profile → API Tokens** and choose **Edit** from the existing deployment token's menu.
2. Keep **Account → Workers Scripts → Edit** and **Account → Account Settings → Read**. Add **Account → Workers R2 Storage → Edit**. The account-token UI may label the equivalent access level **Write**.
3. Under **Account Resources**, choose **Include → Specific account → your blog's account**, then review and save.
4. Editing permissions preserves the token value, so the existing GitHub secret can stay. If creating or rotating a token, copy its new value directly into GitHub's `CLOUDFLARE_API_TOKEN` secret. Keep it out of Git and chat.

This workflow uses Wrangler's Cloudflare API token, not an R2 S3 access key/secret pair. R2's bucket-scoped **Object Read & Write** credentials are for the S3 API and do not replace this token. See [Cloudflare API permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) and [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/).

Wrangler deploys the site to the account's `workers.dev` address. Blog custom-domain routing is not defined in `wrangler.jsonc`; confirm or connect `ediskandarov.com` separately if it is not already configured in the dashboard.

After the secrets and required variable are set and these changes are on `main`, open **Actions → Deploy to Cloudflare → Run workflow**, select `main`, and run it. The deployment log prints the site URL. If prompted by Cloudflare during account setup, choose a Workers subdomain in the dashboard first.

For a local site-only deployment, use:

```sh
npm exec wrangler -- login
npm run deploy
```

`npm run deploy` does not upload or verify media. Use the GitHub production workflow for the complete sequence, or run the media commands below first.

GitHub Actions handles CI and deployment for this project; there is no need to connect the repository to Cloudflare Workers Builds as well.

## Large media preview and publication

Posts can use `/media/posts/<slug>/<filename>` in Markdown images, links, and
HTML `src`, `href`, and `poster` attributes. Commit source files under the
`media/posts/<slug>/` directory. `npm run dev` serves them with byte-range support
for video seeking. They are never copied into `dist/`.

Production Markdown rendering changes these paths to
`https://media.ediskandarov.com/posts/<slug>/<filename>`. To use a different host,
set the build process environment variable, for example:

```sh
MEDIA_BASE_URL=https://cdn.example.com npm run build
```

This setting does not upload files or provision storage. The public host and
matching objects must exist before publishing a post. Direct external URLs remain
unchanged; small `/images/...` assets still ship with the site. Frontmatter social
images use explicit public URLs as before. Keep unfinished posts as drafts.

The first imported essay and the next agent's storage/upload checklist are in
[the DOOM article handoff](docs/doom-on-evm-import.md).

## Media upload lifecycle

Maintain a `docs/<post>-assets.json` manifest for each post with external media. Each `assets` entry has `file`, `bytes`, `sha256`, and `storage` (`external` for `media/`, `site` for `public/`). All `docs/*-assets.json` manifests are checked. External filenames must use ASCII letters, numbers, underscores, hyphens, dots, and directory separators. The script derives MIME types from their extensions and rejects unsupported types. Update the byte count and SHA-256 when changing a source file.

```sh
npm run media:check
R2_BUCKET=your-bucket npm run media:upload -- --dry-run
```

The dry run prints upload arguments without credentials or network access. For authenticated uploads, set `R2_BUCKET`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` in the process environment, then run:

```sh
npm run media:upload
npm run media:verify
```

The upload command revalidates every local asset first, then uploads only `storage: external` entries. It strips the leading `media/` from object keys and sets the extension's MIME type, `Content-Disposition: inline`, and `Cache-Control: public, max-age=300, must-revalidate`. All listed external assets are uploaded, including assets belonging to draft posts; the draft article itself remains excluded from the production site. Wrangler supports files up to 300 MiB; larger files need a multipart-capable uploader.

Public verification uses the actual canonical URLs, checks HEAD metadata and full-download SHA-256 hashes, and checks the final 1 KiB of each video with a byte-range request. It retries failures for brief propagation delays and cached missing responses. The commands upload all listed external objects on each production run and never delete other objects.

Prefer a new filename/object key when replacing published media, and retain old objects for site rollbacks. Overwriting an existing key can leave cached bytes until expiry; verification will block deployment while the canonical URL is stale. Purge that URL's Cloudflare cache if necessary, especially if a cache rule overrides the five-minute object TTL. A site rollback does not restore overwritten R2 objects, and this workflow does not automate object deletion or cache purges.
