const videoTypes = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
};

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function textContent(node) {
  return node.value ?? (node.children ?? []).map(textContent).join("");
}

export default function blogMarkdown() {
  return (tree, file) => {
    // The layout supplies the title. Keep legacy Markdown untouched on disk.
    const first = tree.children[0];
    const title = file.data.astro?.frontmatter?.title;
    if (
      first?.type === "heading" &&
      first.depth === 1 &&
      textContent(first).trim() === title?.trim()
    )
      tree.children.shift();

    function visit(parent) {
      if (!parent.children) return;
      parent.children = parent.children.map((node) => {
        if (
          node.type === "paragraph" &&
          node.children.length === 1 &&
          node.children[0].type === "image"
        ) {
          const image = node.children[0];
          let url;
          try {
            url = new URL(image.url, "https://ediskandarov.com");
          } catch {
            return node;
          }
          const extension = url.pathname
            .slice(url.pathname.lastIndexOf("."))
            .toLowerCase();
          const type = videoTypes[extension];
          if (type && ["https:", "http:"].includes(url.protocol)) {
            const src = escapeHtml(image.url);
            const caption = escapeHtml(image.alt || "Video");
            return {
              type: "html",
              value: `<figure class="video-embed"><video controls playsinline preload="metadata" aria-label="${caption}"><source src="${src}" type="${type}"><a href="${src}">Download the video</a></video><figcaption>${caption} · <a href="${src}">Download video</a></figcaption></figure>`,
            };
          }
        }
        visit(node);
        return node;
      });
    }
    visit(tree);
  };
}
