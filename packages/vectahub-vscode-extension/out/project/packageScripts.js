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
function readPackageJson(workspaceFolder) {
    const packageJsonPath = path.join(workspaceFolder, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return null;
    }
    try {
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
function detectPackageTasks(workspaceFolder, pm, preParsedPkg) {
    const pkg = preParsedPkg || readPackageJson(workspaceFolder);
    if (!pkg) {
        return [];
    }
    try {
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
            // 开发服务
            { key: 'dev', kind: 'dev', label: '启动开发服务 (Dev)' },
            { key: 'start', kind: 'start', label: '启动项目 (Start)' },
            { key: 'serve', kind: 'serve', label: '启动服务 (Serve)' },
            // 预览和监听
            { key: 'preview', kind: 'preview', label: '预览构建结果 (Preview)' },
            { key: 'watch', kind: 'watch', label: '监听构建 (Watch)' },
            { key: 'build:watch', kind: 'watch', label: '监听构建 (Build Watch)' },
            { key: 'test:watch', kind: 'watch', label: '监听测试 (Test Watch)' },
            // 质量检查
            { key: 'lint', kind: 'lint', label: '代码检查 (Lint)' },
            { key: 'typecheck', kind: 'typecheck', label: '类型检查 (Typecheck)' },
            { key: 'check', kind: 'check', label: '项目检查 (Check)' },
            { key: 'validate', kind: 'validate', label: '项目验证 (Validate)' },
            { key: 'format', kind: 'format', label: '格式化代码 (Format)' },
            { key: 'format:check', kind: 'format', label: '检查格式 (Format Check)' },
            // 测试和覆盖率
            { key: 'test', kind: 'test', label: '运行测试 (Test)' },
            { key: 'test:unit', kind: 'test', label: '单元测试 (Unit Test)' },
            { key: 'test:e2e', kind: 'test', label: 'E2E 测试 (E2E Test)' },
            { key: 'coverage', kind: 'coverage', label: '测试覆盖率 (Coverage)' },
            // 构建和组件预览
            { key: 'build', kind: 'build', label: '构建项目 (Build)' },
            { key: 'storybook', kind: 'storybook', label: '启动 Storybook' },
        ];
        const processedKeys = new Set();
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
                processedKeys.add(mapping.key);
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
        // 处理“其他”脚本
        for (const [key, content] of Object.entries(scripts)) {
            if (!processedKeys.has(key)) {
                tasks.push({
                    id: `pkg-other-${key}`,
                    kind: 'other',
                    label: key,
                    description: content,
                    source: 'package-json',
                    available: true,
                    command: (0, packageManager_js_1.getRunCommand)(pm, key)
                });
            }
        }
        return tasks;
    }
    catch {
        return [];
    }
}
function getAllPackageScripts(workspaceFolder, pm, preParsedPkg) {
    const pkg = preParsedPkg || readPackageJson(workspaceFolder);
    if (!pkg)
        return [];
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
//# sourceMappingURL=packageScripts.js.map