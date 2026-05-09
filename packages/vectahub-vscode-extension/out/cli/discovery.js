"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverCli = discoverCli;
const child_process_1 = require("child_process");
const util_1 = require("util");
const settings_js_1 = require("../config/settings.js");
const os_1 = require("os");
const path_1 = require("path");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function findCliAbsolutePath(candidatePath) {
    if (candidatePath.includes('/') || candidatePath.includes('\\')) {
        return candidatePath;
    }
    try {
        const isWindows = (0, os_1.platform)() === 'win32';
        const whichCmd = isWindows ? 'where' : 'which';
        const { stdout } = await execAsync(`${whichCmd} ${candidatePath}`);
        const paths = stdout.trim().split(/\r?\n/);
        if (paths.length > 0 && paths[0]) {
            return paths[0];
        }
    }
    catch {
        // Ignore if which command fails
        try {
            const { stdout } = await execAsync('npm root -g');
            const globalNodeModules = stdout.trim();
            const possiblePath = (0, path_1.join)(globalNodeModules, '.bin', candidatePath);
            await execAsync(`${possiblePath} --version`);
            return possiblePath;
        }
        catch {
            // Ignore if npm root or version check fails
        }
    }
    return null;
}
async function discoverCli() {
    const cliPath = (0, settings_js_1.getCliPath)();
    try {
        const { stdout } = await execAsync(`${cliPath} --version`);
        const absolutePath = await findCliAbsolutePath(cliPath);
        return {
            exists: true,
            version: stdout.trim(),
            path: absolutePath || cliPath
        };
    }
    catch (error) {
        const err = error;
        return {
            exists: false,
            error: err.message
        };
    }
}
//# sourceMappingURL=discovery.js.map