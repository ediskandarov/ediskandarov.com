import assert from "node:assert/strict";
import test from "node:test";
import { unified } from "@astrojs/markdown-remark";
import blogMarkdown from "../src/lib/blog-markdown.mjs";

test("the configured Markdown renderer produces real video HTML, headings, code blocks, and captions", async () => {
  const renderer = await unified({
    remarkPlugins: [blogMarkdown],
  }).createRenderer({});
  const { code, metadata } = await renderer.render(
    [
      "# My post",
      "",
      "## The demo",
      "",
      "![A short demo](https://media.example.com/demo.mp4)",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "",
      '<video controls poster="/poster.jpg"><source src="/clip.mp4" type="video/mp4" /><track kind="captions" src="/captions.vtt" /></video>',
    ].join("\n"),
    { frontmatter: { title: "My post" } },
  );
  assert.doesNotMatch(code, /<h1/);
  assert.match(code, /<h2 id="the-demo">The demo<\/h2>/);
  assert.match(code, /<video controls playsinline preload="metadata"/);
  assert.match(code, /<figcaption>A short demo/);
  assert.match(code, /class="astro-code/);
  assert.match(code, /<track kind="captions" src="\/captions.vtt"/);
  assert.deepEqual(
    metadata.headings.map(({ text }) => text),
    ["The demo"],
  );
});

function transform(nodes, title) {
  const tree = { type: "root", children: nodes };
  blogMarkdown()(tree, { data: { astro: { frontmatter: { title } } } });
  return tree.children;
}

function image(url, alt = "Project walkthrough") {
  return { type: "paragraph", children: [{ type: "image", url, alt }] };
}

test("remote videos with query strings become players without downloading the full video", () => {
  const [node] = transform([
    image("https://media.example.com/demo.MP4?v=2&part=1"),
  ]);
  assert.equal(node.type, "html");
  assert.match(node.value, /<video controls playsinline preload="metadata"/);
  assert.match(
    node.value,
    /src="https:\/\/media.example.com\/demo.MP4\?v=2&amp;part=1" type="video\/mp4"/,
  );
  assert.match(node.value, /<figcaption>Project walkthrough/);
  assert.match(node.value, />Download video<\/a>/);
  assert.doesNotMatch(node.value, /autoplay/);
});

test("video captions and URLs cannot inject markup", () => {
  const [node] = transform([
    image(
      'https://media.example.com/demo.mp4?x="quoted"',
      '<script>alert("oops")</script>',
    ),
  ]);
  assert.doesNotMatch(node.value, /<script>/);
  assert.match(node.value, /&lt;script&gt;/);
  assert.match(node.value, /&quot;quoted&quot;/);
});

test("normal images, inline video mentions, unsafe schemes, and invalid URLs stay untouched", () => {
  const inputs = [
    image("/images/photo.jpg"),
    image("javascript:alert(1).mp4"),
    image("http://"),
    {
      type: "paragraph",
      children: [
        { type: "text", value: "Watch " },
        { type: "image", url: "/demo.mp4", alt: "demo" },
      ],
    },
  ];
  assert.deepEqual(transform(structuredClone(inputs)), inputs);
});

test("WebM and OGV videos also work within a blockquote", () => {
  const [quote] = transform([
    { type: "blockquote", children: [image("/demo.webm"), image("/demo.ogv")] },
  ]);
  assert.match(quote.children[0].value, /type="video\/webm"/);
  assert.match(quote.children[1].value, /type="video\/ogg"/);
});

test("only a matching first H1 is removed, preserving other article headings", () => {
  const heading = {
    type: "heading",
    depth: 1,
    children: [
      { type: "text", value: "Hello, " },
      { type: "emphasis", children: [{ type: "text", value: "World!" }] },
    ],
  };
  const body = {
    type: "paragraph",
    children: [{ type: "text", value: "The original article." }],
  };
  assert.deepEqual(transform([heading, body], "Hello, World!"), [body]);
  assert.deepEqual(transform([heading, body], "A different title"), [
    heading,
    body,
  ]);
  assert.deepEqual(transform([body, heading], "Hello, World!"), [
    body,
    heading,
  ]);
});

test("production media URLs cover Markdown, raw players, posters, and links", async () => {
  const renderer = await unified({
    remarkPlugins: [
      [blogMarkdown, { mediaBaseUrl: "https://media.example.com/" }],
    ],
  }).createRenderer({});
  const { code } = await renderer.render(
    [
      "![Screenshot](/media/posts/demo/screen.png)",
      "",
      "![Clip](/media/posts/demo/movie.mp4)",
      "",
      '<video controls poster="/media/posts/demo/poster.png"><source src="/media/posts/demo/movie.mp4?one=1&amp;two=2"><a href="/media/posts/demo/movie.mp4">Download</a></video>',
      "",
      "[Reference][ref]",
      "",
      "[ref]: /media/posts/demo/evidence.json",
      "",
      "![Site image](/images/small.svg)",
    ].join("\n"),
  );
  assert.doesNotMatch(code, /(?:src|href|poster)="\/media\//);
  assert.match(
    code,
    /src="https:\/\/media.example.com\/posts\/demo\/screen.png"/,
  );
  assert.match(
    code,
    /poster="https:\/\/media.example.com\/posts\/demo\/poster.png"/,
  );
  assert.match(
    code,
    /href="https:\/\/media.example.com\/posts\/demo\/evidence.json"/,
  );
  assert.match(code, /movie.mp4\?one=1(?:&amp;|&#x26;)two=2/);
  assert.match(code, /src="\/images\/small.svg"/);
});

test("local preview keeps media paths local", () => {
  const [node] = transform([image("/media/posts/demo/movie.mp4")]);
  assert.match(node.value, /src="\/media\/posts\/demo\/movie.mp4"/);
});
