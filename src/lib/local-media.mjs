import { fileURLToPath } from "node:url";
import sirv from "sirv";

// Development only: large originals stay outside public/ and the build output.
export default function localMedia({
  directory = fileURLToPath(new URL("../../media/", import.meta.url)),
} = {}) {
  return {
    name: "local-media",
    apply: "serve",
    configureServer(server) {
      const serve = sirv(directory, { dev: true });
      server.middlewares.use("/media", (req, res, next) => {
        let pathname;
        try {
          pathname = decodeURIComponent((req.url || "/").split("?")[0]);
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        // sirv's dev mode does not apply its cached-mode dotfile filter.
        if (
          pathname.includes("\\") ||
          pathname.split("/").some((part) => part.startsWith("."))
        ) {
          res.statusCode = 404;
          res.end();
          return;
        }
        serve(req, res, next);
      });
    },
  };
}
