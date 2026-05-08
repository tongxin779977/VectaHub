# VectaHub Tasks for VS Code

VectaHub Tasks is the official VS Code extension for [VectaHub](https://github.com/vectahub/vectahub), providing a powerful UI wrapper for the VectaHub CLI.

## Features

- **Natural Language Intent**: Run tasks using natural language (e.g., "Run all tests", "Show git status").
- **Intent Preview**: See what commands will be executed before running them.
- **Tasks View**: Quickly access common tasks and natural language input from the side bar.
- **YAML Workflow Support**: Preview and run VectaHub YAML workflows directly from the editor.
- **CLI Discovery**: Automatically detects your local `vectahub` installation.
- **Security Check**: Verify the safety of commands using VectaHub's security protocol.

## Requirements

VectaHub Tasks requires the VectaHub CLI to be installed globally on your system:

```bash
npm install -g vectahub
```

Currently, this extension and the CLI are optimized for **macOS** (Apple Silicon & Intel).

## Extension Settings

This extension contributes the following settings:

* `vectahubTasks.cliPath`: Path to the VectaHub CLI executable (default: `vectahub`).
* `vectahubTasks.executionMode`: Default execution mode (`strict`, `relaxed`, `consensus`).
* `vectahubTasks.previewBeforeRun`: Force preview before executing any natural language intent.
* `vectahubTasks.autoDetectCli`: Automatically detect CLI on extension activation.

## Usage

1. Open the VectaHub icon in the Activity Bar.
2. Use the **Tasks** panel to run common commands.
3. Use **Preview Intent** to test natural language commands.
4. Use **Run Intent** to execute commands after confirmation.

## Development

To develop the extension:

1. `cd packages/vectahub-vscode-extension`
2. `npm install`
3. `npm run compile`
4. Press `F5` in VS Code to start debugging.

## License

MIT
