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
exports.detectPackageTasks = detectPackageTasks;
exports.getAllPackageScripts = getAllPackageScripts;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const packageManager_js_1 = require("./packageManager.js");
function detectPackageTasks(workspaceFolder, pm) {
    const packageJsonPath = path.join(workspaceFolder, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return [];
    }
    try {
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        const scripts = pkg.scripts || {};
        const tasks = [];
        // Install task
        tasks.push({
            id: 'pkg-install',
            kind: 'install',
            label: '安装依赖 (Install)',
            source: 'package-json',
            available: true,
            command: { cli: pm, args: ['install'] }
        });
        // Mapping common scripts
        const mappings = [
            { key: 'test', kind: 'test', label: '运行测试 (Test)' },
            { key: 'build', kind: 'build', label: '构建项目 (Build)' },
            { key: 'lint', kind: 'lint', label: '代码检查 (Lint)' },
            { key: 'typecheck', kind: 'typecheck', label: '类型检查 (Typecheck)' },
        ];
        for (const mapping of mappings) {
            const scriptContent = scripts[mapping.key];
            if (scriptContent) {
                tasks.push({
                    id: `pkg-${mapping.key}`,
                    kind: mapping.kind,
                    label: mapping.label,
                    description: scriptContent,
                    source: 'package-json',
                    available: true,
                    command: (0, packageManager_js_1.getRunCommand)(pm, mapping.key)
                });
            }
            else if (mapping.key === 'typecheck') {
                // Fallback for typecheck in lint
                const lintScript = scripts['lint'] || '';
                if (lintScript.includes('tsc')) {
                    tasks.push({
                        id: 'pkg-typecheck-fallback',
                        kind: 'typecheck',
                        label: '类型检查 (Inferred)',
                        description: '从 lint 脚本推断',
                        source: 'package-json',
                        available: true,
                        command: (0, packageManager_js_1.getRunCommand)(pm, 'lint')
                    });
                }
            }
        }
        return tasks;
    }
    catch (e) {
        return [];
    }
}
function getAllPackageScripts(workspaceFolder, pm) {
    const packageJsonPath = path.join(workspaceFolder, 'package.json');
    if (!fs.existsSync(packageJsonPath))
        return [];
    try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const scripts = pkg.scripts || {};
        return Object.keys(scripts).map(name => ({
            id: `script-${name}`,
            kind: 'list-scripts',
            label: name,
            description: scripts[name],
            source: 'package-json',
            available: true,
            command: (0, packageManager_js_1.getRunCommand)(pm, name)
        }));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=packageScripts.js.map