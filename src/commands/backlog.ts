import { Command } from "commander";
import * as path from "path";
import {
  dryRunSelection,
  getAllBacklogItems,
  validateTaskConsistency,
  checkDirtyFiles,
} from "../backlog/index.js";

export function registerBacklogCommand(program: Command) {
  const backlog = program.command("backlog").description("Backlog management commands");

  backlog
    .command("select")
    .description("Select the next eligible task (dry-run)")
    .option("--items-dir <dir>", "Path to backlog items directory", "docs/backlog/items")
    .action((options) => {
      const itemsDir = path.resolve(process.cwd(), options.itemsDir);
      const result = dryRunSelection(itemsDir);
      console.log(JSON.stringify(result, null, 2));
    });

  backlog
    .command("validate")
    .description("Validate all backlog items")
    .option("--items-dir <dir>", "Path to backlog items directory", "docs/backlog/items")
    .action((options) => {
      const itemsDir = path.resolve(process.cwd(), options.itemsDir);
      const allItems = getAllBacklogItems(itemsDir);
      let allValid = true;
      for (const [id, item] of allItems) {
        const validation = validateTaskConsistency(item);
        if (!validation.valid) {
          console.error(`❌ ${id}: ${validation.reason}`);
          allValid = false;
        } else {
          console.log(`✅ ${id}: ${validation.reason}`);
        }
      }
      process.exit(allValid ? 0 : 1);
    });

  backlog
    .command("check-dirty")
    .description("Check for dirty files outside allowed patterns")
    .option("--allowed <patterns...>", "Allowed file patterns", [
      "docs/backlog/items",
      "src/backlog",
      "src/types/backlog.ts",
    ])
    .action((options) => {
      const result = checkDirtyFiles(options.allowed);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.clean ? 0 : 1);
    });
}
