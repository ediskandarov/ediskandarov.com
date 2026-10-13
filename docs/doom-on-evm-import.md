# DOOM on EVM article import

Work started 2026-10-13T18:32:17Z on `content/doom-on-evm`, from website
`98544fb77c388c6f2833d57a7462eec234bea1ce`. Scope: import the approved essay
and existing rendered visuals, preserve narrative and captions, add local media
preview and a configurable external production media origin. No deployment.

Source manuscript: `writing/technical/ARTICLE-DRAFT.md` in `ediskandarov/doom-evm`,
revision `3046e287625a7c5f3cf1ff5f6a7ab2a29f6d113c`, SHA-256
`a2016da0083a50fb3d09b3825e4e134a536ef2ccba9b57e8cab5ded2564b711b`.
Rendered SVGs and media come from the existing `artifacts/local/essay-visual-integration/preview/`.

Verification gates: source text preservation, asset hashes, development media
loading and seeking, desktop/mobile layout, Astro check, tests, production build,
and draft exclusion. Stop condition: locally reviewable draft and a concrete
external-storage handoff; no cloud provisioning, upload, or publication.

## Local review

```sh
npm run dev -- --host 127.0.0.1 --port 4327
```

Open <http://127.0.0.1:4327/posts/doom-on-evm>. The post is a draft with a
provisional October 13 date. Keep `draft: true` until the public media URLs work
and the author selects the publication date.

The 10 unchanged media files are tracked in Git under the
`media/posts/doom-on-evm/` directory (approximately 28 MiB total). The three
rendered SVGs are tracked in `public/images/posts/doom-on-evm/`. See
[the exact asset hashes and sizes](doom-on-evm-assets.json).
Git checkout includes the media for local review and future CI uploads. Their
original source copies on this machine are under
`/Users/eduard/sandbox/doom-evm-article-sources/media/selected/`.

The article's prose and captions are unchanged. Adaptations are frontmatter,
semantic figure wrappers, responsive layout, image/video paths, rendered SVGs
instead of Mermaid fences, and GitHub evidence links pinned to the reviewed
integrated source revision. The existing preview HTML is older than the latest
manuscript: it supplies assets only, not the imported prose.

## Handoff: public large-file storage

No bucket was created and no objects were uploaded during the original import.
The user has since created an R2 bucket and connected `media.ediskandarov.com`.
The manual production workflow now uploads manifest media and verifies its public
URLs before deploying the site. Its first authenticated run remains pending.
Credentials must remain outside Git.

1. Set the GitHub repository variable `R2_BUCKET` to the existing article-media
   bucket name. Confirm its connection to `media.ediskandarov.com`. Refer to the
   [Cloudflare custom-domain instructions](https://developers.cloudflare.com/r2/buckets/public-buckets/).
2. The workflow uploads only the 10 `storage: external` entries in the manifest. Object keys are
   the manifest `file` values with the leading `media/` removed; for example,
   `posts/doom-on-evm/ACCEPTED_E1M1_VIDEO.mp4`. Verify each local SHA-256 first.
   Do not upload the entire source archive or any commercial WAD.
3. Add **Account → Workers R2 Storage → Edit** to the Cloudflare deployment token
   and configure the GitHub secrets. The complete setup instructions are in the
   [README](../README.md#configure-github-secrets-and-variables). The installed
   Wrangler also supports manual `r2 object put`. For example, after choosing
   the actual bucket name and authenticating, upload one object with:

   ```sh
   npx wrangler r2 object put BUCKET/posts/doom-on-evm/ACCEPTED_E1M1_VIDEO.mp4 \
     --file media/posts/doom-on-evm/ACCEPTED_E1M1_VIDEO.mp4 \
     --content-type video/mp4 --remote
   ```

   The automated uploader uses `image/png` for PNGs and `image/gif` for GIFs,
   inline disposition, and a five-minute cache lifetime. These filenames are not
   content-addressed.

4. The workflow verifies all 10 public URLs return the expected metadata and
   SHA-256 hashes, and that video seeking requests work. After it passes, check a
   video range request returns `206` and the correct `Content-Range`, then verify
   real browser playback and seeking. Native media elements currently have no
   `crossorigin` attribute; this import does not require canvas access to media.
5. If the public host differs, pass `MEDIA_BASE_URL=https://actual-host` to the
   production build (and configure the build workflow's environment). This is
   a build-process variable, not a credential or runtime setting. Its path prefix,
   if any, is prepended to each object key. `.env` loading is not added here.
6. Review the article locally, choose its date, and set `draft: false`. Run
   `npm run check`, `npm test`, and `npm run build`; inspect the emitted page and
   sitemap. Run `npm run ci` if deployment configuration changes. Publishing or
   deploying the site remains a separate action.

A fresh Git checkout includes the manuscript, diagrams, and all 10 external
media source files. Production uses external URLs and excludes the media bytes
from the site output; the production workflow uploads them to R2 separately.

## Verified checkpoint

Completed on October 13, 2026 (UTC), with Node 24.11.0. Source manuscript hash
remains unchanged. No source repository files were edited.

- 77 prose/caption blocks compared verbatim against the latest manuscript.
- All 13 copied assets matched source SHA-256 hashes and bytes served over HTTP.
- Three MP4 byte-range requests returned `206` and the requested exact bytes.
- Development HTML contains one title, 12 figures/captions, three video players,
  and `noindex, nofollow`.
- Chrome desktop and iPhone SE emulation (375 × 667): title/body layout,
  horizontally scrollable memory diagram, and recording player inspected.
  Accepted E1M1 played through to 15.62857 seconds; seeking back to seven seconds
  displayed gameplay correctly.
- Production config independently rendered a media URL with a custom
  `MEDIA_BASE_URL`; the configured host was present in emitted HTML.
- `npm run check`: 19 files, zero errors/warnings/hints.
- `npm test`: 12/12 passed. Includes production URL mapping, video ranges, HEAD,
  and hidden-file protection. The explicit hidden-file guard fixes a discovered
  difference in the static-server dependency's development behavior.
- `npm run build`: six existing pages built; this draft is absent from routes and
  sitemap, and `dist/media` does not exist.
- `npm run format:check` and `git diff --check`: passed.

Local preview was left running on `127.0.0.1:4327` for review. This import did not
provision or deploy infrastructure, upload assets, push Git, or publish the post.
