"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERIFY_PIPELINE_STEPS = void 0;
exports.selectPipelineTasks = selectPipelineTasks;
exports.createPipeline = createPipeline;
exports.createVerifyPipeline = createVerifyPipeline;
const planBuilder_js_1 = require("./planBuilder.js");
exports.VERIFY_PIPELINE_STEPS = [
    { kind: 'check', idPattern: 'format:check', label: '格式检查' },
    { kind: 'typecheck', label: '类型检查' },
    { kind: 'lint', label: '代码检查' },
    { kind: 'test', label: '运行测试' },
    { kind: 'build', label: '构建项目' }
];
function findTaskForStep(step, tasks) {
    return tasks.find(t => {
        if (t.kind !== step.kind)
            return false;
        if (step.idPattern && !t.id.includes(step.idPattern))
            return false;
        return true;
    });
}
function selectPipelineTasks(steps, availableTasks) {
    const included = [];
    const skipped = [];
    for (const step of steps) {
        const task = findTaskForStep(step, availableTasks);
        if (task) {
            included.push(task);
        }
        else {
            skipped.push(step.label);
        }
    }
    return { included, skipped };
}
function createPipeline(steps, availableTasks) {
    const { included, skipped } = selectPipelineTasks(steps, availableTasks);
    if (included.length === 0) {
        return { plans: [], included, skipped };
    }
    const plans = [];
    for (const task of included) {
        const plan = planBuilder_js_1.PlanBuilder.createProjectTaskPlan(task);
        if (plan) {
            plans.push(plan);
        }
    }
    return { plans, included, skipped };
}
function createVerifyPipeline(availableTasks) {
    return createPipeline(exports.VERIFY_PIPELINE_STEPS, availableTasks);
}
//# sourceMappingURL=devPipeline.js.map