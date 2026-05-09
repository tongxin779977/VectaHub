"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectPackageManager = detectPackageManager;
exports.getRunCommand = getRunCommand;
exports.getInstallCommand = getInstallCommand;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function detectPackageManager(workspaceFolder) {
    if (fs.existsSync(path.join(workspaceFolder, 'pnpm-lock.yaml'))) {
        return 'pnpm';
    }
    if (fs.existsSync(path.join(workspaceFolder, 'yarn.lock'))) {
        return 'yarn';
    }
    if (fs.existsSync(path.join(workspaceFolder, 'bun.lockb')) || fs.existsSync(path.join(workspaceFolder, 'bun.lock'))) {
        return 'bun';
    }
    return 'npm'; // Default to npm
}
function getRunCommand(packageManager, script) {
    switch (packageManager) {
        case 'pnpm':
            return { cli: 'pnpm', args: ['run', script] };
        case 'yarn':
            return { cli: 'yarn', args: ['run', script] };
        case 'bun':
            return { cli: 'bun', args: ['run', script] };
        default:
            return { cli: 'npm', args: ['run', script] };
    }
}
function getInstallCommand(packageManager) {
    switch (packageManager) {
        case 'pnpm':
            return { cli: 'pnpm', args: ['install'] };
        case 'yarn':
            return { cli: 'yarn', args: ['install'] };
        case 'bun':
            return { cli: 'bun', args: ['install'] };
        default:
            return { cli: 'npm', args: ['install'] };
    }
}
//# sourceMappingURL=packageManager.js.map