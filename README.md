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

The filename becomes `/posts/something-i-learned-while-building`. Keep it stable after publishing. Dates sort the archive; the filename does not need a date prefix. `author` defaults to Ed Iskandarov. Optional `updated`, `image`, and `imageAlt` fields set the update date and social preview image. Use a public image URL or a path such as `/images/my-post.jpg`.

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

Large videos and downloads are uploaded separately, with their URLs referenced in posts. Keep local originals in the ignored `media/` directory or outside this repository. Cloudflare Pages and Workers Static Assets each have a 25 MiB limit per file. The planned media host is an R2 bucket on `media.ediskandarov.com`; it has not been provisioned yet. The blog does not need storage credentials or a rebuild when a media file is uploaded to an existing URL.

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

This checks formatting and types, runs tests, builds the site, and runs a Wrangler deployment dry run without publishing. To preview Cloudflare's actual routing locally:

```sh
npm run preview:cloudflare
```

The **CI** workflow runs on pushes to `main`, pull requests, and manual requests. The **Deploy to Cloudflare** workflow is started manually from GitHub's Actions tab, with `main` selected. It runs all checks again before deploying. Deployment uses the locked Wrangler version and credentials are available only to the deployment step.

### Configure the two GitHub secrets

In this repository's **Settings → Secrets and variables → Actions**, add:

| Repository secret       | Value                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | The account ID from the Cloudflare dashboard.                                                                                       |
| `CLOUDFLARE_API_TOKEN`  | A Cloudflare API token scoped to that account, with **Account → Workers Scripts → Edit** and **Account → Account Settings → Read**. |

Create the API token in Cloudflare's **My Profile → API Tokens**. Add its value directly as a GitHub secret; keep it out of Git and chat. This initial configuration deploys to the account's `workers.dev` address. Custom-domain routing and R2 media storage will be configured in subsequent steps.

After the secrets are added, open **Actions → Deploy to Cloudflare → Run workflow**, select `main`, and run it. The deployment log prints the site URL. If prompted by Cloudflare during account setup, choose a Workers subdomain in the dashboard first.

For an authenticated local deployment, use:

```sh
npm exec wrangler -- login
npm run deploy
```

GitHub Actions handles CI and deployment for this project; there is no need to connect the repository to Cloudflare Workers Builds as well.
