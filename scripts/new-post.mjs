import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function createPost({
  title,
  slug,
  directory = resolve("content/posts"),
  date = new Date(),
}) {
  if (!title?.trim())
    throw new Error('Provide a title: npm run new-post -- "My post title"');
  const filename =
    slug ??
    title
      .normalize("NFKD")
      .replace(/\p{Mark}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(filename))
    throw new Error("Provide an ASCII slug using --slug my-post-title.");
  const path = resolve(directory, `${filename}.md`);
  const content = `---\ntitle: ${JSON.stringify(title.trim())}\ndescription: "A short description for the archive, search, and sharing."\ndate: "${date.toISOString().slice(0, 10)}"\ndraft: true\ntags: []\n---\n\nStart writing here.\n`;
  await mkdir(directory, { recursive: true });
  await writeFile(path, content, { flag: "wx" });
  return path;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const slugIndex = args.indexOf("--slug");
  const slug = slugIndex < 0 ? undefined : args[slugIndex + 1];
  if (slugIndex >= 0) args.splice(slugIndex, 2);
  try {
    if (slugIndex >= 0 && !slug) throw new Error("--slug needs a value.");
    const path = await createPost({ title: args.join(" "), slug });
    console.log(
      `Created ${path}\nPreview with npm run dev. Set draft: false when ready to publish.`,
    );
  } catch (error) {
    console.error(
      error.code === "EEXIST"
        ? "That post already exists. Choose a different title or --slug."
        : error.message,
    );
    process.exitCode = 1;
  }
}
