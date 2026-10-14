import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(root, ".agents/plugins/ai-task-board");
const require = createRequire(import.meta.url);
const { webpack } = require(resolve(root, "node_modules/next/dist/compiled/webpack/webpack.js"));

await new Promise((resolveBuild, rejectBuild) => {
  webpack(
    {
      mode: "production",
      target: "node22",
      entry: resolve(root, "dist/integrations/mcp/index.js"),
      output: {
        path: outputPath,
        filename: "ai-task-board.cjs",
        library: { type: "commonjs2" },
      },
      optimization: { minimize: false, minimizer: [] },
    },
    (error, stats) => {
      if (error) {
        rejectBuild(error);
        return;
      }
      if (stats?.hasErrors()) {
        rejectBuild(new Error(stats.toString({ all: false, errors: true })));
        return;
      }
      process.stdout.write("Packaged the AI Task Board MCP plugin runtime.\n");
      resolveBuild();
    },
  );
});
