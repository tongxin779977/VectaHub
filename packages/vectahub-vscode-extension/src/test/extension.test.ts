import * as assert from 'assert';
import * as vscode from 'vscode';

suite('VectaHub Tasks Smoke Tests', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('vectahub.vectahub-vscode-extension'));
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const vectahubCommands = commands.filter(c => c.startsWith('vectahubTasks.'));
    
    assert.ok(vectahubCommands.includes('vectahubTasks.previewIntent'));
    assert.ok(vectahubCommands.includes('vectahubTasks.runIntent'));
    assert.ok(vectahubCommands.includes('vectahubTasks.doctor'));
  });
});
