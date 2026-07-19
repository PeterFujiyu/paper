import { createHash } from 'node:crypto'

export const PROMPT_TEMPLATE_VERSION = '1.0'

const PROMPT_TEMPLATE = `你正在完成一项真实代码库的隔离基准任务。请直接检查并修改当前仓库中的代码，完成任务；不要只给出方案。

# 任务信息

题目：{{case_title}}
难度：{{difficulty}}
建议时长：{{time_budget_minutes}} 分钟

# 任务描述

{{case_prompt}}

# 验收标准

{{all_acceptance_criteria_as_markdown_list}}

# 工作规则

1. 先检查当前代码、项目约定和公开测试，再制定并实施完整修改。
2. 只在当前仓库内读取和写入文件。不要读取或搜索父目录、原项目、外部 Git 历史、参考提交、gold patch、benchmark 清单或隐藏 oracle。
3. 不要调用 benchmark 评价器，不要修改 .benchmark-task.md 或 .benchmark-session.json，也不要通过删除、弱化或绕过测试来提高分数。
4. 按当前项目的既有架构和编码约定完成生产代码；避免与任务无关的重写。
5. 运行与改动相关的测试、类型检查和构建。发现失败时继续定位并修复，而不是只报告失败。
6. 在任务真正满足验收标准后再结束。

# 完成时回复

请简要说明：

- 完成了哪些修改；
- 实际运行了哪些验证及其结果；
- 是否仍有已知风险或未完成项。

现在开始。`

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Prompt case ${field} must be a non-empty string`)
  }
  return value
}

function renderPrompt(benchmarkCase) {
  if (!benchmarkCase || typeof benchmarkCase !== 'object') {
    throw new TypeError('Prompt case must be an object')
  }

  const title = requireNonEmptyString(benchmarkCase.title, 'title')
  const difficulty = requireNonEmptyString(benchmarkCase.difficulty, 'difficulty')
  const prompt = requireNonEmptyString(benchmarkCase.prompt, 'prompt')
  const timeBudgetMinutes = benchmarkCase.timeBudgetMinutes
  if (!Number.isInteger(timeBudgetMinutes) || timeBudgetMinutes <= 0) {
    throw new TypeError('Prompt case timeBudgetMinutes must be a positive integer')
  }
  if (!Array.isArray(benchmarkCase.acceptanceCriteria)
    || benchmarkCase.acceptanceCriteria.length === 0
    || !benchmarkCase.acceptanceCriteria.every(criterion =>
      typeof criterion === 'string' && criterion.length > 0)) {
    throw new TypeError('Prompt case acceptanceCriteria must contain non-empty strings')
  }

  const criteria = benchmarkCase.acceptanceCriteria
    .map(criterion => `- ${criterion}`)
    .join('\n')

  const values = {
    case_title: title,
    difficulty,
    time_budget_minutes: String(timeBudgetMinutes),
    case_prompt: prompt,
    all_acceptance_criteria_as_markdown_list: criteria,
  }
  return PROMPT_TEMPLATE.replace(
    /{{(case_title|difficulty|time_budget_minutes|case_prompt|all_acceptance_criteria_as_markdown_list)}}/g,
    (_, field) => values[field],
  )
}

export function createPromptBundle(benchmarkCase) {
  const text = renderPrompt(benchmarkCase)
  return {
    text,
    version: PROMPT_TEMPLATE_VERSION,
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  }
}

export const buildPromptBundle = createPromptBundle
