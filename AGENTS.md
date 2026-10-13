# Working on this blog

- Keep this a fun, small project with a quick local preview and simple Markdown publishing.
- Display the author as Ed Iskandarov. Use the profile links and email in `src/lib/site.ts`; there is no Twitter profile link.
- Keep the design plain and academic: black text on white, serif typography, and underlined links.
- Use gitmoji in commit messages, for example `✨ Add video embeds` or `🎨 Improve article typography`.
- Use npm and keep `package-lock.json` updated. Node 24 is specified in `.nvmrc`.
- Posts live in `content/posts`. Preserve published filenames, URLs, dates, and article text unless a content change is requested.
- Drafts must stay out of production pages and the sitemap.
- Do not add RSS feeds or subscription links.
- Large media belongs in external storage, with URLs in posts. Never commit videos or credentials.
- Run `npm run check`, `npm test`, and `npm run build` for changes to the framework or content pipeline. Check responsive layouts for design changes.
- Deployment is a separate step from modernization. The intended host is Cloudflare, with `ediskandarov.com` as the canonical domain and R2 for large media.
