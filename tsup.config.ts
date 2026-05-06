import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  clean: true,
  banner: {
    js: `
if (typeof process !== "undefined" && typeof process.setMaxListeners === "function") {
  process.setMaxListeners(20);
  process.on("warning", (warning) => {
    if (warning.name === "MaxListenersExceededWarning" && warning.message.includes("exit listeners")) {
      return;
    }
    process.stderr.write(warning.message + "\\n");
  });
}
`.trimStart(),
  },
});
