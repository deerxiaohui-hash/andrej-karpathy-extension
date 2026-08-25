# Andrej-Karpathy-Extension 实施计划

> **给 agentic worker 的话：** 必选子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施本计划。步骤使用复选框（`- [ ]`）语法追踪进度。

**目标：** 构建一个 pi Extension（Andrej-Karpathy-Extension），以程序化方式强制执行 Andrej Karpathy 的四条编码准则（先想后做、简单优先、外科手术式修改、目标驱动执行），方法包括：把准则注入到每次 system prompt、拦截过大范围的代码编辑、提供面向用户的审查命令、以及为模型提供一个自检工具。

> **pi2dsh 兼容性：** 本 Extension 设计为可通过 [pi2dsh](https://npm.im/pi2dsh) 在 DSH 中运行。所有使用的 Pi API 均为 pi2dsh 已映射的能力。唯一的例外是 `pi.sendMessage()` 已被替换——详见任务 8。

**架构：** 用 TypeScript 写的单个 pi Extension（通过 jiti 加载，无需编译步骤）。该 Extension 注册一个 `before_agent_start` 处理器把准则追加到每次 system prompt，注册一个 `tool_call` 处理器对过大范围的 `write`/`edit` 操作给出警告，注册一个 `tool_result` 处理器观察过度工程的信号（新增抽象），注册一个 `/karma` 斜杠命令对最近改动做手动审查，再注册一个 `self_check` 工具让模型在关键决策点调用。配置从 `~/.pi/agent/karpathy.json` 读取，并提供合理的默认值，做到零配置可用。

**技术栈：** TypeScript（jiti 加载）、`@earendil-works/pi-coding-agent`（ExtensionAPI 类型）、`typebox`（pi 运行时自带）、`node:fs`/`node:path`（Node 内置）。不依赖任何第三方运行时依赖。

---

## 文件结构

Extension 放在 `extensions/karpathy-guidelines/` 目录下，方便以后添加更多 extension。

```
extensions/karpathy-guidelines/
├── package.json                      # 清单 + pi package 配置
├── index.ts                          # 默认导出工厂；串联所有 handler
├── config.ts                         # 加载/保存 ~/.pi/agent/karpathy.json，提供默认值
├── guidelines.ts                     # 四条准则的文本 + system prompt 后缀
├── system-injector.ts                # before_agent_start 处理器
├── tool-guard.ts                     # tool_call 处理器（对过大编辑给出警告）
├── result-watcher.ts                 # tool_result 处理器（标记新增抽象）
├── commands.ts                       # /karma 命令实现
├── self-check-tool.ts                # 模型可调用的 self_check 工具
├── analysis.ts                       # 纯函数：countLines、detectNewAbstractions
└── ui.ts                             # 共享格式化辅助函数（带主题输出）
```

每个 handler 文件导出一个 `register*(pi, config)` 函数。`analysis.ts` 是唯一含有非平凡逻辑的文件；其他文件都是接线工作。

根目录的 `package.json` 让整个项目成为可分发的 pi package。

---

## 任务 1：创建 Extension 目录和 package 清单

**文件：**
- 新建：`extensions/karpathy-guidelines/package.json`

- [ ] **第 1 步：创建目录**

```bash
mkdir -p extensions/karpathy-guidelines
```

- [ ] **第 2 步：编写 `extensions/karpathy-guidelines/package.json`**

```json
{
  "name": "karpathy-guidelines",
  "version": "0.1.0",
  "description": "pi Extension that programmatically enforces Karpathy's four coding guidelines",
  "type": "module",
  "private": true,
  "pi": {
    "extensions": [
      "./index.ts"
    ]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  }
}
```

- [ ] **第 3 步：验证文件是合法 JSON**

运行：`node -e "JSON.parse(require('fs').readFileSync('extensions/karpathy-guidelines/package.json','utf8')); console.log('ok')"`
预期输出：`ok`

- [ ] **第 4 步：提交**

```bash
git add extensions/karpathy-guidelines/package.json
git commit -m "feat(karpathy): add extension package manifest"
```

---

## 任务 2：实现准则文本模块

**文件：**
- 新建：`extensions/karpathy-guidelines/guidelines.ts`

这个文件保存被注入到 system prompt 并被审查命令复用的四条准则文本。把它集中在一处，修改措辞不需要碰接线代码。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/guidelines.ts`**

```typescript
/**
 * Karpathy 的四条编码准则，蒸馏自
 * https://x.com/karpathy/status/2015883857489522876
 *
 * 使用方：
 * - system-injector.ts：追加到每次 system prompt
 * - commands.ts：在 /karma 审查报告中渲染
 * - self-check-tool.ts：格式化为模型的清单
 *
 * 保持本文件是唯一来源。在此处修改措辞会同步更新所有出现准则的地方。
 */

export interface Principle {
	name: string;
	tagline: string;
	body: string;
}

export const PRINCIPLES: Principle[] = [
	{
		name: "1. Think Before Coding（先想后做）",
		tagline: "不要假设，不要隐藏困惑，要展现权衡。",
		body: [
			"开始实现之前：",
			"- 明确陈述你的假设。如果不确定，先问。",
			"- 如果存在多种理解，把它们都列出来——不要默默选一个。",
			"- 如果存在更简单的方法，说出来。该 push back 就 push back。",
			"- 如果某件事不清楚，就停下来。说清楚哪里不清楚，然后问。",
		].join("\n"),
	},
	{
		name: "2. Simplicity First（简单优先）",
		tagline: "用最少的代码解决问题，不搞推测性代码。",
		body: [
			"- 不加未请求的功能。",
			"- 单次使用的代码不抽抽象。",
			"- 不加未请求的\"灵活性\"或\"可配置性\"。",
			"- 不可能发生的场景不做错误处理。",
			"- 如果你写了 200 行、但其实 50 行就能搞定——重写。",
			"",
			"问自己：\"一个资深工程师看了会说这过度复杂了吗？\"如果是，简化。",
		].join("\n"),
	},
	{
		name: "3. Surgical Changes（外科手术式修改）",
		tagline: "只改你必须改的，只清理你自己制造的垃圾。",
		body: [
			"修改已有代码时：",
			"- 不要\"顺手\"改进相邻代码、注释、格式。",
			"- 没坏的东西不要重构。",
			"- 匹配已有风格，即使你本人会写得不一样。",
			"- 发现无关的死代码——提一下，但别删。",
			"",
			"当你制造的改动产生孤儿时：",
			"- 删除因**你的改动**而废弃的 import/变量/函数。",
			"- 不要删除**已有的**死代码（除非被要求）。",
			"",
			"检验标准：每一行改动都能直接追溯到用户的请求。",
		].join("\n"),
	},
	{
		name: "4. Goal-Driven Execution（目标驱动执行）",
		tagline: "定义成功标准，循环直到验证通过。",
		body: [
			"把命令式任务转化为可验证的目标：",
			"- \"加校验\" -> \"写无效输入的测试，然后让它们通过\"",
			"- \"修 bug\" -> \"写一个能复现 bug 的测试，然后让它通过\"",
			"- \"重构 X\" -> \"确保重构前后测试都通过\"",
			"",
			"对于多步任务，先列计划：",
			"1. [步骤] -> 验证：[检查方式]",
			"2. [步骤] -> 验证：[检查方式]",
			"3. [步骤] -> 验证：[检查方式]",
			"",
			"明确的目标让模型能独立循环。模糊的目标（\"让它工作\"）需要不断澄清。",
			"",
			"在关键决策点使用 self_check 工具，对照这四条准则验证进展。",
		].join("\n"),
	},
];

/**
 * 追加到每次 system prompt 的完整文本。保持为单个字符串，
 * 这样 before_agent_start 一次拼接就能追加完。
 */
export function buildSystemPromptSuffix(): string {
	const sections = PRINCIPLES.map((p) => `### ${p.name}：${p.tagline}\n${p.body}`).join("\n\n");

	return `

## Karpathy 编码准则

你必须在每个任务中遵循以下四条原则。它们是不可妥协的行为准则，不是建议。

${sections}

**你怎么知道这些在起作用：** diff 里不必要的改动变少；因为过度复杂而重写的情况变少；澄清问题出现在动手之前，而不是犯错之后。
`;
}

/**
 * 同样的内容，格式化为 self_check 工具的清单。
 */
export function buildChecklistForLLM(): string {
	return PRINCIPLES.map((p) => {
		const checklist = p.body
			.split("\n")
			.filter((line) => line.trim().startsWith("- "))
			.map((line) => `  [ ] ${line.replace(/^-\s+/, "")}`)
			.join("\n");
		return `${p.name}：${p.tagline}\n${checklist}`;
	}).join("\n\n");
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/guidelines.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/guidelines.ts
git commit -m "feat(karpathy): add guidelines text module"
```

---

## 任务 3：实现纯分析函数

**文件：**
- 新建：`extensions/karpathy-guidelines/analysis.ts`

这些函数是纯函数（不依赖 pi），这意味着它们易于单元测试，可以放心地在任何地方 import。它们分析代码改动的规模和形态，供 handler 决定是否发出警告。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/analysis.ts`**

```typescript
/**
 * 供 tool-guard 和 result-watcher 使用的纯分析辅助函数。
 * 不从 @earendil-works/pi-coding-agent 导入任何东西，因此本文件可单元测试。
 */

export interface ChangeSize {
	addedLines: number;
	removedLines: number;
	totalLines: number;
}

export interface NewAbstraction {
	kind: "function" | "class" | "interface" | "type" | "abstract-method";
	name: string;
	line: number;
}

export interface AbstractionReport {
	abstractions: NewAbstraction[];
	count: number;
}

/**
 * 计算字符串的行数。空/undefined 返回 0。
 */
export function countLines(content: string | undefined): number {
	if (!content) return 0;
	return content.replace(/\r\n/g, "\n").split("\n").length;
}

/**
 * 估算一次 write/edit 会增加或修改多少行。对于 `write` 工具，
 * `content` 是完整的文件新内容。对于 `edit`，`oldText`/`newText`
 * 的差异给出净变化。
 */
export function estimateChangeSize(args: { content?: string; newText?: string; oldText?: string }): ChangeSize {
	if (args.content !== undefined) {
		const total = countLines(args.content);
		return { addedLines: total, removedLines: 0, totalLines: total };
	}
	const added = countLines(args.newText);
	const removed = countLines(args.oldText);
	return { addedLines: added, removedLines: removed, totalLines: added + removed };
}

/**
 * 在代码字符串中检测新引入的抽象。启发式检测：
 * - TypeScript/JavaScript：函数声明、类声明、interface/type 声明
 * - Python：class/def 声明
 *
 * 我们刻意使用简单的正则模式。允许出现误报，因为目标是
 * 提示模型去思考，而不是以 100% 的确定性阻断。
 */
export function detectNewAbstractions(content: string | undefined): AbstractionReport {
	if (!content) return { abstractions: [], count: 0 };
	const found: NewAbstraction[] = [];
	const lines = content.split("\n");

	lines.forEach((line, idx) => {
		const trimmed = line.trim();
		let m: RegExpMatchArray | null;

		if ((m = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) {
			found.push({ kind: "function", name: m[1], line: idx + 1 });
		} else if ((m = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/))) {
			found.push({ kind: "class", name: m[1], line: idx + 1 });
		} else if ((m = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/))) {
			found.push({ kind: "interface", name: m[1], line: idx + 1 });
		} else if ((m = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/))) {
			found.push({ kind: "type", name: m[1], line: idx + 1 });
		} else if (
			(m = trimmed.match(
				/^(?:export\s+)?abstract\s+(?:async\s+)?(?:[\w$<>,\s|]+)\s+([A-Za-z_$][\w$]*)\s*\(/,
			))
		) {
			found.push({ kind: "abstract-method", name: m[1], line: idx + 1 });
		} else if ((m = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/))) {
			found.push({ kind: "function", name: m[1], line: idx + 1 });
		} else if ((m = trimmed.match(/^class\s+([A-Za-z_][\w]*)/))) {
			found.push({ kind: "class", name: m[1], line: idx + 1 });
		}
	});

	return { abstractions: found, count: found.length };
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/analysis.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/analysis.ts
git commit -m "feat(karpathy): add pure change-analysis helpers"
```

---

## 任务 4：实现配置加载器

**文件：**
- 新建：`extensions/karpathy-guidelines/config.ts`

配置加载器在 `~/.pi/agent/karpathy.json` 存在时读取它，否则使用默认值。导出一个 `loadConfig()` 函数和一个 `saveConfig()`（供 `/karma configure` 子命令使用）。默认值被调成保守（警告而不是阻断），使 Extension 开箱即用。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/config.ts`**

```typescript
/**
 * 加载和保存 Extension 的运行时配置。
 * 默认位于 ~/.pi/agent/karpathy.json，可通过 KARPATHY_CONFIG 环境变量覆盖。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Strictness = "low" | "medium" | "high";

export interface KarpathyConfig {
	/** 单次 write/edit 触发\"过大范围\"警告的行数阈值。 */
	maxLinesPerEdit: number;
	/** 单次改动允许的新增顶层抽象（函数/类/接口/类型）的最大数量。 */
	maxNewAbstractions: number;
	/** tool_call 守卫是否启用。 */
	enableToolGuard: boolean;
	/** tool_result 监听器是否在过度工程时注入 steer 消息。 */
	enableResultWatcher: boolean;
	/** 警告的严格程度。越高 = 越早告警。 */
	strictness: Strictness;
}

export const DEFAULT_CONFIG: KarpathyConfig = {
	maxLinesPerEdit: 150,
	maxNewAbstractions: 2,
	enableToolGuard: true,
	enableResultWatcher: true,
	strictness: "medium",
};

const STRICTNESS_MULTIPLIER: Record<Strictness, number> = {
	low: 1.5,
	medium: 1.0,
	high: 0.6,
};

/**
 * 把严格度应用到数值阈值上，避免在 handler 里重复计算。
 */
export function effectiveThresholds(config: KarpathyConfig): { maxLines: number; maxAbs: number } {
	const mult = STRICTNESS_MULTIPLIER[config.strictness];
	return {
		maxLines: Math.round(config.maxLinesPerEdit * mult),
		maxAbs: Math.max(1, Math.round(config.maxNewAbstractions * mult)),
	};
}

function configPath(): string {
	if (process.env.KARPATHY_CONFIG) return process.env.KARPATHY_CONFIG;
	const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
	return join(home, ".pi", "agent", "karpathy.json");
}

export function loadConfig(): KarpathyConfig {
	const path = configPath();
	if (!existsSync(path)) {
		return { ...DEFAULT_CONFIG };
	}
	try {
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch {
		// 配置损坏不应让 Extension 崩溃；回退到默认值。
		return { ...DEFAULT_CONFIG };
	}
}

export function saveConfig(config: KarpathyConfig): void {
	const path = configPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/config.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/config.ts
git commit -m "feat(karpathy): add config loader with strictness scaling"
```

---

## 任务 5：实现共享的 UI 格式化辅助函数

**文件：**
- 新建：`extensions/karpathy-guidelines/ui.ts`

集中处理小段主题感知的字符串格式化（banner、section 标题、bullet）。Handler 保持聚焦在逻辑上；UI 关注点放在这里。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/ui.ts`**

```typescript
/**
 * 轻量格式化辅助函数。我们不导入完整的 TUI 表面，因为 handler
 * 可能在没有 theme 的上下文中运行（例如 LLM 流式响应前的 tool_call）。
 * 带语义标记（warning、info）的纯字符串足以应付 notify() 和 /karma 报告。
 */

export type Severity = "info" | "warning" | "error";

export function banner(title: string): string {
	return `\n=== ${title} ===\n`;
}

export function section(title: string, body: string): string {
	return `\n## ${title}\n\n${body}\n`;
}

export function bullet(text: string, severity: Severity = "info"): string {
	const marker = severity === "error" ? "✗" : severity === "warning" ? "⚠" : "•";
	return `  ${marker} ${text}`;
}

export function summary(parts: string[]): string {
	return parts.filter(Boolean).join(" | ");
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/ui.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/ui.ts
git commit -m "feat(karpathy): add shared UI formatting helpers"
```

---

## 任务 6：实现 system prompt 注入器

**文件：**
- 新建：`extensions/karpathy-guidelines/system-injector.ts`

最重要的 handler。每次 `before_agent_start` 调用时把准则后缀追加到 `event.systemPrompt`。这保证模型在每一轮都能看到准则，不依赖它"记住"skill 描述。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/system-injector.ts`**

```typescript
/**
 * 把 Karpathy 准则追加到每次 system prompt。
 *
 * 在 `before_agent_start` 上运行，所以准则能在会话第一轮以及后续每一轮
 * 都到达 LLM。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSystemPromptSuffix } from "./guidelines.js";

/**
 * Extension 默认启用。System prompt 无条件追加；各特性的配置只影响
 * tool guard 和 result feedback，不影响模型是否看到准则文本。
 */
export function registerSystemInjector(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: event.systemPrompt + buildSystemPromptSuffix(),
		};
	});
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/system-injector.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/system-injector.ts
git commit -m "feat(karpathy): inject guidelines into every system prompt"
```

---

## 任务 7：实现 tool_call 守卫

**文件：**
- 新建：`extensions/karpathy-guidelines/tool-guard.ts`

监控每一次 `write` 和 `edit` 工具调用。如果改动过大，就请用户确认后再放行。默认检查是警告型（我们只 `notify`），但在交互模式下弹出确认对话框，让用户保留最终决定权。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/tool-guard.ts`**

```typescript
/**
 * 防止过大范围的 write/edit 操作。
 *
 * 当单次 write 或 edit 涉及的行数超过 `maxLines` 时，我们通知用户，
 * 在交互模式下请用户确认。LLM 依然可以继续——最终决定权在用户。
 */

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { estimateChangeSize } from "./analysis.js";
import type { KarpathyConfig } from "./config.js";
import { effectiveThresholds } from "./config.js";
import { bullet, section, summary } from "./ui.js";

export function registerToolGuard(pi: ExtensionAPI, config: KarpathyConfig): void {
	if (!config.enableToolGuard) return;

	const { maxLines } = effectiveThresholds(config);

	pi.on("tool_call", async (event, ctx) => {
		// 内置的 write 和 edit 工具走同一条路径。
		if (event.toolName === "write") {
			if (!isToolCallEventType("write", event)) return;
			const size = estimateChangeSize({ content: event.input.content as string | undefined });
			if (size.totalLines <= maxLines) return;
			return await confirmBroadChange(ctx, "write", event.input.path as string, size, maxLines);
		}

		if (event.toolName === "edit") {
			if (!isToolCallEventType("edit", event)) return;
			const size = estimateChangeSize({
				newText: event.input.newText as string | undefined,
				oldText: event.input.oldText as string | undefined,
			});
			if (size.totalLines <= maxLines) return;
			return await confirmBroadChange(ctx, "edit", event.input.path as string, size, maxLines);
		}
	});
}

async function confirmBroadChange(
	ctx: import("@earendil-works/pi-coding-agent").ExtensionContext,
	tool: "write" | "edit",
	path: string,
	size: { addedLines: number; removedLines: number; totalLines: number },
	threshold: number,
): Promise<{ block: true; reason: string } | undefined> {
	const body = section(
		`检测到过大的 ${tool}（${size.totalLines} 行，阈值 ${threshold}）`,
		[
			bullet(`文件：${path}`, "info"),
			bullet(`新增：${size.addedLines} | 删除：${size.removedLines}`, "info"),
			bullet(
				"依照 Simplicity First：能不能让这个改动更小？如果 200 行能写成 50 行，就重写。",
				"warning",
			),
		].join("\n"),
	);

	if (!ctx.hasUI) {
		// 非交互模式：只通知但不阻断。Print 模式用户依然能看到警告。
		ctx.ui.notify(`Karpathy：对 ${path} 的 ${tool} 过大（${size.totalLines} 行）`, "warning");
		return undefined;
	}

	const proceed = await ctx.ui.confirm(
		"Karpathy：改动是否过大？",
		`${body}\n是否继续这次 ${tool}？`,
	);

	if (!proceed) {
		return {
			block: true,
			reason: "被用户通过 Karpathy tool guard 阻断。依照 Simplicity First，考虑把改动改得更小。",
		};
	}

	ctx.ui.notify(summary(["karpathy", `ok: ${tool} ${path}`, `${size.totalLines} 行`]), "info");
	return undefined;
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/tool-guard.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/tool-guard.ts
git commit -m "feat(karpathy): guard over-broad write/edit with user confirm"
```

---

## 任务 8：实现 tool_result 监听器

**文件：**
- 新建：`extensions/karpathy-guidelines/result-watcher.ts`

每次 `write`/`edit` 完成后，我们看看实际写入的内容并统计新增抽象。如果新增的顶层声明太多，就通过修改 `tool_result` 的 content 来追加一条警告消息，让模型在下一轮看到。这是一种软性提醒——不是阻断。

对 `write` 需要额外一步：它的 `input.content` 是整份文件的新内容，直接统计会把文件里**原本就有**的函数/类也算成新增。所以我们在工具调用之前先记下该文件已有的声明作为基线，事后只对真正新增的部分告警。

> **pi2dsh 兼容性说明：** 原本使用 `pi.sendMessage(..., { deliverAs: "steer" })` 来注入 steer 消息，但 pi2dsh 的 capability matrix 中 `sendMessage` 映射为 warnOnce（无操作），DSH 没有对应机制。改为通过 `tool_result` handler return 修改后的 content 来追加警告，这在 pi2dsh 中是已映射的能力。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/result-watcher.ts`**

```typescript
/**
 * 监控 tool_result 事件中的过度工程信号。
 *
 * 在 write/edit 完成后，我们查看实际落地的内容并统计新增顶层抽象。
 * 如果数量超过阈值，就通过修改 tool_result 的 content 追加一条警告，
 * 让模型在下一轮看到。
 *
 * 为什么要在 tool_call 时先拍快照：`write` 的 input.content 是整份文件的
 * 新内容，直接统计会把文件里原有的函数/类也算成新增。所以写入之前先记下
 * 已有声明的签名，写入之后只对差集告警。`edit` 的 newText 只是被插入的片段，
 * 不需要基线。
 *
 * 注意：不使用 pi.sendMessage()，因为 pi2dsh 不支持。
 * 改为 return 修改后的 content，这是 pi2dsh 已映射的能力。
 * 也不使用 isToolCallEventType()——那个 guard 是给 tool_call 事件用的，
 * 在 tool_result 上不适用；这里直接从 input 上按需读字段。
 */

import { existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectNewAbstractions } from "./analysis.js";
import type { NewAbstraction } from "./analysis.js";
import type { KarpathyConfig } from "./config.js";
import { effectiveThresholds } from "./config.js";

/** 写入前每个文件已有的抽象签名，按路径记录。tool_call 写入，tool_result 消费。 */
const baselines = new Map<string, Set<string>>();

function signature(a: NewAbstraction): string {
	return `${a.kind}:${a.name}`;
}

function readInput(event: { input?: unknown }): Record<string, unknown> {
	return (event.input ?? {}) as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function existingSignatures(path: string): Set<string> {
	if (!existsSync(path)) return new Set();
	try {
		const found = detectNewAbstractions(readFileSync(path, "utf-8")).abstractions;
		return new Set(found.map(signature));
	} catch {
		// 读不到就当基线为空。宁可多提醒一次，也不要因为 IO 报错影响工具调用。
		return new Set();
	}
}

export function registerResultWatcher(pi: ExtensionAPI, config: KarpathyConfig): void {
	if (!config.enableResultWatcher) return;

	const { maxAbs } = effectiveThresholds(config);

	// 写入之前：记录文件现有的声明作为基线。
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "write") return;
		const path = asString(readInput(event).path);
		if (!path) return;
		baselines.set(path, existingSignatures(path));
	});

	pi.on("tool_result", async (event) => {
		// 只检查 write 和 edit 的结果。
		if (event.toolName !== "write" && event.toolName !== "edit") return;

		const input = readInput(event);
		const path = asString(input.path) ?? "<未知>";

		// write 的 content 是整份文件；edit 的 newText 只是被替换进去的片段。
		const content =
			event.toolName === "write" ? asString(input.content) : asString(input.newText);
		if (!content) return;

		// edit 没有基线（undefined），此时 newText 里的每个声明都算新增。
		const baseline = event.toolName === "write" ? baselines.get(path) : undefined;
		baselines.delete(path);

		const added = detectNewAbstractions(content).abstractions.filter(
			(a) => !baseline?.has(signature(a)),
		);
		if (added.length <= maxAbs) return;

		const names = added
			.slice(0, 6)
			.map((a) => `${a.kind} \`${a.name}\``)
			.join(", ");

		const warning = [
			"",
			`⚠️ [Karpathy] 你刚刚引入了 ${added.length} 个新的顶层抽象（阈值：${maxAbs}）。`,
			`检测到：${names}${added.length > 6 ? "，..." : ""}。`,
			`依照 Simplicity First：这些全部都是当前请求真正需要的吗？`,
			`能否把其中某些内联、删除，或者推迟到第二个用户真正需要时再添加？`,
		].join("\n");

		// 通过修改 tool_result content 追加警告（pi2dsh 已映射）。
		return {
			content: [
				...(Array.isArray(event.content) ? event.content : []),
				{ type: "text", text: warning },
			],
		};
	});
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/result-watcher.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/result-watcher.ts
git commit -m "feat(karpathy): watch results for new abstractions and steer"
```

---

## 任务 9：实现 `/karma` 斜杠命令

**文件：**
- 新建：`extensions/karpathy-guidelines/commands.ts`

面向用户的入口。`/karma` 显示准则和当前配置。`/karma review` 遍历最近 session 的 write/edit 工具调用，生成 Karpathy 风格的审查报告。`/karma configure` 展示配置路径和如何编辑。一切都是可选的：用户不输入命令什么都不发生。

> **pi2dsh 兼容性说明：** `/karma review` 使用 `ctx.sessionManager.getEntries()` 遍历 session entries，该 API 在 pi2dsh 中已映射。但注意：如果未来想存储 Karpathy 审查产生的自定义事实，不要用 `pi.appendEntry()`——pi2dsh 中 appendEntry 走 sidecar（3 级旁路），不进 DSH 原生日志。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/commands.ts`**

```typescript
/**
 * /karma 斜杠命令。子命令：
 *   /karma              -> 显示准则 + 当前配置
 *   /karma review       -> 审查本次 session 中最近的代码改动
 *   /karma configure    -> 显示配置文件路径和如何编辑
 *
 * 一切都是只读的。命令里不修改 session。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { estimateChangeSize, detectNewAbstractions } from "./analysis.js";
import type { KarpathyConfig } from "./config.js";
import { effectiveThresholds } from "./config.js";
import { PRINCIPLES } from "./guidelines.js";
import { bullet, section, summary } from "./ui.js";

export function registerCommands(pi: ExtensionAPI, configRef: { current: KarpathyConfig }): void {
	pi.registerCommand("karma", {
		description: "显示 Karpathy 准则、审查最近改动，或查看配置",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";

			if (sub === "review") return reviewRecentChanges(ctx, configRef.current);
			if (sub === "configure") return showConfig(ctx, configRef.current);
			if (sub === "help" || sub === "--help" || sub === "-h") return showHelp(ctx);
			if (sub === "") return showGuidelines(ctx, configRef.current);

			ctx.ui.notify(
				`未知的 /karma 子命令："${sub}"。试试 /karma help。`,
				"warning",
			);
		},
	});
}

function showHelp(ctx: import("@earendil-works/pi-coding-agent").ExtensionContext): void {
	ctx.ui.notify(
		[
			"/karma —— Karpathy 准则",
			"  （无参数）  显示四条原则和当前配置",
			"  review       审查本次 session 中最近的 write/edit 工具调用",
			"  configure    显示配置文件路径和如何编辑",
			"  help         显示本帮助",
		].join("\n"),
		"info",
	);
}

function showGuidelines(
	ctx: import("@earendil-works/pi-coding-agent").ExtensionContext,
	config: KarpathyConfig,
): void {
	const th = effectiveThresholds(config);
	const principles = PRINCIPLES.map(
		(p) => section(`${p.name}：${p.tagline}`, p.body),
	).join("\n");

	const configBlock = section(
		"当前配置",
		[
			bullet(`strictness: ${config.strictness}（有效阈值：${th.maxLines} 行，${th.maxAbs} 个新抽象）`),
			bullet(`tool guard: ${config.enableToolGuard ? "开" : "关"}`),
			bullet(`result watcher: ${config.enableResultWatcher ? "开" : "关"}`),
			bullet("编辑 ~/.pi/agent/karpathy.json 修改配置，然后 /reload。"),
		].join("\n"),
	);

	ctx.ui.notify(`${principles}${configBlock}`, "info");
}

function showConfig(
	ctx: import("@earendil-works/pi-coding-agent").ExtensionContext,
	config: KarpathyConfig,
): void {
	const th = effectiveThresholds(config);
	const lines = [
		"当前 Karpathy 配置：",
		bullet(`maxLinesPerEdit: ${config.maxLinesPerEdit} -> 有效值 ${th.maxLines}`),
		bullet(`maxNewAbstractions: ${config.maxNewAbstractions} -> 有效值 ${th.maxAbs}`),
		bullet(`enableToolGuard: ${config.enableToolGuard}`),
		bullet(`enableResultWatcher: ${config.enableResultWatcher}`),
		bullet(`strictness: ${config.strictness}`),
		"",
		"编辑 ~/.pi/agent/karpathy.json 后运行 /reload。",
	];
	ctx.ui.notify(lines.join("\n"), "info");
}

function reviewRecentChanges(
	ctx: import("@earendil-works/pi-coding-agent").ExtensionContext,
	config: KarpathyConfig,
): void {
	const th = effectiveThresholds(config);
	const entries = ctx.sessionManager.getEntries();
	const reports: { path: string; tool: string; size: ReturnType<typeof estimateChangeSize>; abs: ReturnType<typeof detectNewAbstractions> }[] = [];

	for (const entry of entries) {
		// 我们需要原始的 tool input。agent 的自定义条目里会保存 assistant
		// 消息，其中包含 toolCall 块。我们查找这些并取出 input。
		if (entry.type !== "message") continue;
		const msg = (entry as { message?: { role?: string; content?: unknown } }).message;
		if (!msg || msg.role !== "assistant") continue;
		const content = Array.isArray(msg.content) ? msg.content : [];
		for (const block of content) {
			if (typeof block !== "object" || block === null) continue;
			const b = block as { type?: string; name?: string; input?: Record<string, unknown> };
			if (b.type !== "toolCall") continue;
			if (b.name !== "write" && b.name !== "edit") continue;
			if (!b.input) continue;

			const path = String(b.input.path ?? "<未知>");
			if (b.name === "write") {
				const size = estimateChangeSize({ content: b.input.content as string | undefined });
				const abs = detectNewAbstractions(b.input.content as string | undefined);
				reports.push({ path, tool: "write", size, abs });
			} else {
				const size = estimateChangeSize({
					newText: b.input.newText as string | undefined,
					oldText: b.input.oldText as string | undefined,
				});
				const abs = detectNewAbstractions(b.input.newText as string | undefined);
				reports.push({ path, tool: "edit", size, abs });
			}
		}
	}

	if (reports.length === 0) {
		ctx.ui.notify("本次 session 还没有 write/edit 工具调用。", "info");
		return;
	}

	const lines: string[] = [
		`共审查 ${reports.length} 处改动：`,
		"（write 统计的是整份文件的顶层声明，其中可能包含改动前就已存在的）",
		"",
	];
	for (const r of reports) {
		const flaggedSize = r.size.totalLines > th.maxLines;
		const flaggedAbs = r.abs.count > th.maxAbs;
		const severity = flaggedSize || flaggedAbs ? "warning" : "info";
		lines.push(
			bullet(
				summary([
					`${r.tool} ${r.path}`,
					`+${r.size.addedLines}/-${r.size.removedLines}`,
					`${r.abs.count} 个顶层抽象`,
				]),
				severity,
			),
		);
		if (flaggedAbs) {
			for (const a of r.abs.abstractions) {
				lines.push(`     - ${a.kind} \`${a.name}\`（第 ${a.line} 行）`);
			}
		}
	}

	ctx.ui.notify(lines.join("\n"), "info");
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/commands.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/commands.ts
git commit -m "feat(karpathy): add /karma command (show, review, configure)"
```

---

## 任务 10：实现 `self_check` 工具

**文件：**
- 新建：`extensions/karpathy-guidelines/self-check-tool.ts`

LLM 可以在关键决策点调用的工具（例如在一次非平凡改动的前后）。它返回四条原则的结构化清单，模型预期会逐项走查，然后在下一条 assistant 消息中确认哪些项通过。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/self-check-tool.ts`**

```typescript
/**
 * 注册一个 `self_check` 工具，让 LLM 在决策点调用。
 *
 * 从 LLM 的视角使用：在非平凡改动之前/之后，调用
 *   self_check({ context: "刚刚为一个新的抽象层加了 X" })
 * 并在下一条回复中逐项走查返回的清单。
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildChecklistForLLM } from "./guidelines.js";

const SelfCheckParams = Type.Object({
	context: Type.Optional(
		Type.String({
			description:
				"你打算做（或者刚刚做完）的事。请具体。例子：'为 auth provider 加一个新的抽象基类'。",
		}),
	),
	step: Type.Optional(
		Type.String({
			description:
				"可选的步骤标签。例子：'第 2 步/共 5 步：实现重试逻辑'。帮用户追踪当前是哪一步。",
		}),
	),
});

export function registerSelfCheckTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "self_check",
		label: "Self-Check",
		description:
			"在决策点运行 Karpathy 准则自检。在非平凡改动之前使用（尤其是：新增抽象、重构、做大范围编辑时）。传入一个简短的描述说明你打算做什么。",
		parameters: SelfCheckParams,

		async execute(_toolCallId, params) {
			const context = (params.context as string | undefined) ?? "";
			const step = (params.step as string | undefined) ?? "";

			const header = step ? `[${step}] ` : "";
			const contextBlock = context
				? `\n上下文：${header}${context}\n`
				: `\n上下文：（未提供）\n`;

			const checklist = buildChecklistForLLM();

			const instructions = [
				"",
				"逐项走查上面每个未勾选项。在下一条消息中回答：",
				"  - 通过、失败、或不适用",
				"  - 一句话解释原因",
				"",
				"如果任何一项失败，不要继续。要么调整你的计划以满足它，要么",
				"请用户确认他们希望你无论如何继续。",
				"",
				"不要跳过这一步。self_check 的全部意义在于让推理过程可见。",
			].join("\n");

			return {
				content: [
					{
						type: "text",
						text: `Karpathy 自检${contextBlock}\n${checklist}\n${instructions}`,
					},
				],
				details: { context, step },
			};
		},
	});
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/self-check-tool.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/self-check-tool.ts
git commit -m "feat(karpathy): add self_check tool the LLM can invoke"
```

---

## 任务 11：在 `index.ts` 中串联一切

**文件：**
- 新建：`extensions/karpathy-guidelines/index.ts`

唯一的入口。加载配置，按正确顺序注册所有 handler，并显示一次性通知让用户知道 Extension 已加载。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/index.ts`**

```typescript
/**
 * Karpathy 编码准则 Extension for pi.
 *
 * 以程序化方式强制执行从 Andrej Karpathy 关于 LLM 编码陷阱的观察中
 * 蒸馏出的四条编码准则：
 *   1. 先想后做
 *   2. 简单优先
 *   3. 外科手术式修改
 *   4. 目标驱动执行
 *
 * 本 Extension 的作用：
 *   - 把准则追加到每次 system prompt.
 *   - 在过大范围的 write/edit 工具调用前发出警告。
 *   - 当引入过多新的顶层抽象时引导模型重新考虑。
 *   - 提供 /karma 命令供用户审查、查看配置、重读准则。
 *   - 提供 self_check 工具让 LLM 在决策点调用。
 *
 * 无需配置即可使用。要自定义，编辑 ~/.pi/agent/karpathy.json 然后 /reload。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, type KarpathyConfig } from "./config.js";
import { registerSystemInjector } from "./system-injector.js";
import { registerToolGuard } from "./tool-guard.js";
import { registerResultWatcher } from "./result-watcher.js";
import { registerCommands } from "./commands.js";
import { registerSelfCheckTool } from "./self-check-tool.js";

export default function karpathyGuidelinesExtension(pi: ExtensionAPI) {
	// 在 Extension 加载时加载一次配置。配置对象在剩余生命周期内可变；
	// 如果用户编辑了 JSON 文件，可以 /reload 重新加载。
	const configRef: { current: KarpathyConfig } = { current: loadConfig() };

	// 1. 始终向每次 system prompt 注入准则。
	registerSystemInjector(pi);

	// 2. 守卫过大范围的 write/edit 操作。
	registerToolGuard(pi, configRef.current);

	// 3. 当引入过多新抽象时引导模型。
	registerResultWatcher(pi, configRef.current);

	// 4. 注册 /karma 命令。configRef 是实时读取的，以便将来
	//    重新加载（如果添加 /karma reload 子命令）能生效。
	registerCommands(pi, configRef);

	// 5. 注册 self_check 工具。
	registerSelfCheckTool(pi);

	// 一次性欢迎。session_start 带上 reason "startup" 在每个进程里只触发一次，
	// 不是每次 session 恢复都触发。
	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup") return;
		ctx.ui.notify(
			"Karpathy 准则已激活：/karma 查看，/karma configure 查看设置。",
			"info",
		);
	});
}
```

- [ ] **第 2 步：冒烟检查文件存在**

```bash
test -f extensions/karpathy-guidelines/index.ts && echo "ok"
```
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/index.ts
git commit -m "feat(karpathy): wire all handlers in index.ts"
```

---

## 任务 12：创建根项目的 package.json（pi package 形态）

**文件：**
- 新建：`package.json`（项目根）

这让整个仓库成为一个 pi package，可以通过 `pi install`（本地路径）安装或发布到 npm。`pi` 清单指向 extension 入口。

- [ ] **第 1 步：编写 `package.json`**

```json
{
  "name": "andrej-karpathy-extension",
  "version": "0.1.0",
  "description": "pi extension that programmatically enforces Karpathy's four coding guidelines. Compatible with pi2dsh for DSH.",
  "keywords": ["pi-package", "karpathy", "coding-guidelines", "ai-agent", "pi2dsh"],
  "type": "module",
  "license": "MIT",
  "files": [
    "extensions/",
    "README.md"
  ],
  "scripts": {
    "check": "tsc --noEmit -p tsconfig.json",
    "test": "node --import tsx --test extensions/karpathy-guidelines/*.test.ts"
  },
  "pi": {
    "extensions": ["./extensions/karpathy-guidelines/index.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **第 2 步：验证文件是合法 JSON**

运行：`node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"`
预期输出：`ok`

- [ ] **第 3 步：提交**

```bash
git add package.json
git commit -m "feat(karpathy): add root pi package manifest"
```

---

## 任务 13：添加 TypeScript 配置并实际跑一次类型检查

**文件：**
- 新建：`tsconfig.json`

`tsconfig.json` 让编辑器和 `tsc` 能针对 `@earendil-works/pi-coding-agent` 验证 extension 通过类型检查。Extension 自身通过 jiti 运行，所以类型检查是建议性的，但它能捕获真正的 bug。

- [ ] **第 1 步：编写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "types": ["node"]
  },
  "include": [
    "extensions/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "extensions/**/*.test.ts"
  ]
}
```

- [ ] **第 2 步：安装开发依赖**

```bash
npm install --save-dev @types/node tsx typescript
```

预期：`npm install` 完成无错误。`@earendil-works/pi-coding-agent` 和 `typebox` peer 依赖会已经在 `node_modules` 里（因为我们运行着 pi，它们是全局可用的）。如果类型检查找不到它们，暂时也把 peer 依赖作为 devDependencies 安装即可。

- [ ] **第 3 步：运行类型检查**

```bash
npx tsc --noEmit -p tsconfig.json
```

预期：零错误。如果有错误，修复它们。最可能的问题有：
- `tool-guard.ts` 里的 `isToolCallEventType` 重载需要显式的字符串字面量类型。代码里用的就是字符串字面量，应当能工作。
- `result-watcher.ts` 从 `event.input` 上读字段走的是 `Record<string, unknown>` 转换（因为 `isToolCallEventType` 只适用于 tool_call 事件）。如果 `tool_result` 事件的类型里根本没有 `input` 字段，把 `readInput` 的参数类型放宽为 `unknown` 后再取属性。
- `tool_result` handler 返回的 `{ content: [...] }` 形状必须与 `ExtensionAPI` 声明的内容块类型一致。如果声明比 `{ type: "text", text: string }` 更严格，按声明的类型构造那条文本块。

- [ ] **第 4 步：提交**

```bash
git add tsconfig.json package-lock.json
git commit -m "build: add tsconfig and dev dependencies"
```

---

## 任务 14：为 `analysis.ts` 编写单元测试

**文件：**
- 新建：`extensions/karpathy-guidelines/analysis.test.ts`

纯函数值得配纯测试。我们用代表性输入跑 `countLines`、`estimateChangeSize` 和 `detectNewAbstractions`。这些测试是回归网：如果启发式变了，我们希望知道破坏了什么。

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/analysis.test.ts`**

```typescript
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { countLines, estimateChangeSize, detectNewAbstractions } from "./analysis.ts";

describe("countLines", () => {
	it("对 undefined 返回 0", () => {
		assert.equal(countLines(undefined), 0);
	});
	it("对空字符串返回 1（split 空字符串得到 [""]）", () => {
		assert.equal(countLines(""), 1);
	});
	it("计算普通行数", () => {
		assert.equal(countLines("a\nb\nc"), 3);
	});
	it("把 CRLF 归一化为 LF", () => {
		assert.equal(countLines("a\r\nb\r\nc"), 3);
	});
});

describe("estimateChangeSize", () => {
	it("write 情况下用 content 长度", () => {
		const size = estimateChangeSize({ content: "a\nb\nc\n" });
		assert.equal(size.addedLines, 4);
		assert.equal(size.removedLines, 0);
		assert.equal(size.totalLines, 4);
	});
	it("edit 情况下取 newText 与 oldText 的差", () => {
		const size = estimateChangeSize({ newText: "a\nb", oldText: "x" });
		assert.equal(size.addedLines, 2);
		assert.equal(size.removedLines, 1);
		assert.equal(size.totalLines, 3);
	});
	it("content 与 newText 同时提供时优先 content（write 形态）", () => {
		const size = estimateChangeSize({ content: "long\ncontent\nhere", newText: "short" });
		assert.equal(size.addedLines, 3);
	});
});

describe("detectNewAbstractions", () => {
	it("空输入返回空", () => {
		const r = detectNewAbstractions(undefined);
		assert.equal(r.count, 0);
		assert.deepEqual(r.abstractions, []);
	});
	it("能找到 TypeScript 函数", () => {
		const r = detectNewAbstractions("function foo() {}\nexport function bar() {}");
		assert.equal(r.count, 2);
		assert.deepEqual(r.abstractions.map((a) => a.name), ["foo", "bar"]);
		assert.equal(r.abstractions[0].kind, "function");
	});
	it("能找到类", () => {
		const r = detectNewAbstractions("class MyClass {}");
		assert.equal(r.count, 1);
		assert.equal(r.abstractions[0].kind, "class");
		assert.equal(r.abstractions[0].name, "MyClass");
	});
	it("能找到 interface 和 type", () => {
		const r = detectNewAbstractions("interface IFoo {}\ntype Bar = string;");
		assert.equal(r.count, 2);
		assert.equal(r.abstractions[0].kind, "interface");
		assert.equal(r.abstractions[1].kind, "type");
	});
	it("能找到 Python def 和 class", () => {
		const r = detectNewAbstractions("def foo():\n    pass\nclass MyClass:\n    pass");
		assert.equal(r.count, 2);
		assert.equal(r.abstractions[0].kind, "function");
		assert.equal(r.abstractions[0].name, "foo");
		assert.equal(r.abstractions[1].kind, "class");
		assert.equal(r.abstractions[1].name, "MyClass");
	});
	it("忽略代码里的函数调用", () => {
		const r = detectNewAbstractions("foo();\nbar();");
		assert.equal(r.count, 0);
	});
	it("记录 1-based 行号", () => {
		const r = detectNewAbstractions("\n\nfunction baz() {}");
		assert.equal(r.abstractions[0].line, 3);
	});
});
```

- [ ] **第 2 步：运行测试**

```bash
npm test
```

预期：全部测试通过。输出应该类似 `# pass 12 / fail 0`。

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/analysis.test.ts
git commit -m "test(karpathy): add unit tests for analysis helpers"
```

---

## 任务 15：为 `config.ts` 编写单元测试

**文件：**
- 新建：`extensions/karpathy-guidelines/config.test.ts`

- [ ] **第 1 步：编写 `extensions/karpathy-guidelines/config.test.ts`**

```typescript
import { strict as assert } from "node:assert";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, effectiveThresholds, loadConfig, saveConfig } from "./config.ts";

const tmp = mkdtempSync(join(tmpdir(), "karpathy-test-"));
process.env.KARPATHY_CONFIG = join(tmp, "karpathy.json");

after(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env.KARPATHY_CONFIG;
});

describe("loadConfig", () => {
	it("文件不存在时返回默认值", () => {
		// KARPATHY_CONFIG 指向尚不存在的路径。
		const c = loadConfig();
		assert.deepEqual(c, DEFAULT_CONFIG);
	});
	it("用户配置与默认值合并", () => {
		writeFileSync(process.env.KARPATHY_CONFIG!, JSON.stringify({ strictness: "high" }));
		const c = loadConfig();
		assert.equal(c.strictness, "high");
		assert.equal(c.maxLinesPerEdit, DEFAULT_CONFIG.maxLinesPerEdit);
	});
	it("JSON 损坏时回退到默认值", () => {
		writeFileSync(process.env.KARPATHY_CONFIG!, "{ not valid json");
		const c = loadConfig();
		assert.deepEqual(c, DEFAULT_CONFIG);
	});
});

describe("effectiveThresholds", () => {
	it("low 严格度把阈值调大", () => {
		const t = effectiveThresholds({ ...DEFAULT_CONFIG, strictness: "low", maxLinesPerEdit: 100, maxNewAbstractions: 2 });
		assert.equal(t.maxLines, 150);
		assert.equal(t.maxAbs, 3);
	});
	it("high 严格度把阈值调小", () => {
		const t = effectiveThresholds({ ...DEFAULT_CONFIG, strictness: "high", maxLinesPerEdit: 100, maxNewAbstractions: 2 });
		assert.equal(t.maxLines, 60);
		assert.equal(t.maxAbs, 1);
	});
	it("maxAbs 最小为 1", () => {
		const t = effectiveThresholds({ ...DEFAULT_CONFIG, strictness: "high", maxNewAbstractions: 0 });
		assert.equal(t.maxAbs, 1);
	});
});

describe("saveConfig", () => {
	it("写出合法 JSON，loadConfig 能读回", () => {
		const target = { ...DEFAULT_CONFIG, strictness: "low" as const };
		saveConfig(target);
		const loaded = loadConfig();
		assert.equal(loaded.strictness, "low");
	});
});
```

- [ ] **第 2 步：运行测试**

```bash
npm test
```

预期：全部测试通过（analysis + config 合并）。

- [ ] **第 3 步：提交**

```bash
git add extensions/karpathy-guidelines/config.test.ts
git commit -m "test(karpathy): add unit tests for config loader"
```

---

## 任务 16：在 pi 中做端到端冒烟测试

**文件：**
- 读取：`extensions/karpathy-guidelines/index.ts`
- 新建：`tmp/smoke-test-notes.md`（临时笔记，不提交）

这个任务是集成检查。我们用 `pi -e` 加载 extension，手动走一遍四条原则。把任何异常记下来供后续问题跟踪。

- [ ] **第 1 步：验证 extension 文件能被 pi 的 jiti 加载**

```bash
pi -e ./extensions/karpathy-guidelines/index.ts -p "echo back exactly the words: hello karpathy"
```

预期：pi 启动、运行一次性 prompt、打印回复。在 TUI 模式下能看到 "Karpathy 准则已激活" 通知（它仅在 reason 为 startup 的 `session_start` 触发；在 `-p` 模式下你可能需要去掉 `-p`）。

- [ ] **第 2 步：验证 system prompt 注入**

```bash
pi -e ./extensions/karpathy-guidelines/index.ts -p "请把你 system prompt 中标题为'Karpathy 编码准则'那一节原样复述出来。如果没看到，就回答'NOT FOUND'。"
```

预期：模型复制出准则文本的若干片段。如果它回答 NOT FOUND，说明注入器没触发。检查 `system-injector.ts` 和 handler 里的 `event.systemPrompt`。

- [ ] **第 3 步：验证 /karma 命令已注册**

以交互模式运行 pi 并加载 extension：

```bash
pi -e ./extensions/karpathy-guidelines/index.ts
```

在编辑器里输入 `/karma help` 并回车。预期：输出列出四个子命令。

（不要用 `-p "/karma help"`：`-p` 是一次性 prompt 模式，斜杠命令很可能被当作普通文本发给模型，而不是走命令解析。）

- [ ] **第 4 步：验证 self_check 工具出现**

以交互模式运行 `pi` 并加载 extension，然后在编辑器里输入 `/tools`，确认 `self_check` 在列表中。

- [ ] **第 5 步：用一次过大的 write 触发 tool guard**

在交互模式下，要求模型\"创建一个包含 500 行的新文件 big.txt\"。当模型调用 `write` 时，tool guard 应弹出确认对话框。

- [ ] **第 6 步：验证覆盖已有文件不会误报新抽象**

准备一个已经包含若干函数的文件（例如 `tmp/existing.ts` 里写 5 个 `function`），然后要求模型"把 tmp/existing.ts 里某个函数的返回值改掉，其余保持不动"。模型会用 `write` 覆盖整份文件。

预期：**不出现** "引入了 N 个新的顶层抽象" 警告——基线快照应该把原有的 5 个函数减掉。如果警告仍然出现，检查 `result-watcher.ts` 的 `tool_call` handler 是否真的拿到了 `input.path`。

- [ ] **第 7 步：记录结果**

在 `tmp/smoke-test-notes.md` 写一份简短总结，列出什么能用、什么不能用、需要修复的项。不要提交该文件（`tmp/` 已在任务 18 加入 .gitignore）。

- [ ] **第 8 步：提交冒烟测试中需要修复的项**

```bash
git add <files-fixed>
git commit -m "fix(karpathy): address smoke-test findings"
```

（如果一切正常，跳过此次提交。）

---

## 任务 17：编写项目 README

**文件：**
- 新建：`README.md`

简短、可链接的 README。pi 社区会快速浏览，所以保持可扫读。

- [ ] **第 1 步：编写 `README.md`**

````markdown
# Andrej-Karpathy-Extension

一个 [pi](https://pi.dev) Extension，以程序化方式强制执行 Andrej Karpathy 的四条编码准则。兼容 [pi2dsh](https://npm.im/pi2dsh)，可在 DSH (DeepSeek Harness) 中运行：

1. **先想后做** —— 不假设；不确定就问
2. **简单优先** —— 最少的代码，不做推测性设计
3. **外科手术式修改** —— 只改你必须改的
4. **目标驱动执行** —— 定义成功标准，循环直到验证通过

## 它做什么

- **把准则注入到每次 system prompt。** 模型在每一轮都看到它们，不只是\"记得加载 skill\"时才看到。
- **在大范围编辑前警告。** 当单次 `write` 或 `edit` 触动的行数超过你的阈值时，请确认。
- **过度工程时引导。** 一次 `write`/`edit` 后，统计新引入的顶层抽象（函数、类、接口、类型）。对 `write` 会先减去文件里原本就有的声明，只算净新增。如果太多，在 tool_result 中追加警告让模型重新考虑。
- **添加 `/karma` 斜杠命令。**
  - `/karma` —— 显示准则 + 当前配置
  - `/karma review` —— 审查 session 中最近的代码改动
  - `/karma configure` —— 显示配置路径和如何编辑
- **添加 `self_check` 工具**，让 LLM 在决策点可调用，按四条原则逐项走查清单。

## 在 pi 中安装

```bash
# 本地：克隆后按路径加载
git clone <本仓库>
pi -e ./extensions/karpathy-guidelines/index.ts

# 或者：把路径加到 settings.json 的 packages 数组里。
```

## 在 DSH 中安装（通过 pi2dsh）

```bash
# 1. 安装 pi2dsh（如果还没装）
dsh plugin add pi2dsh

# 2. 安装本扩展
dsh plugin add npm:andrej-karpathy-extension

# 3. 重启 dsh
```

## pi2dsh 兼容性

| Pi API | pi2dsh 状态 | 说明 |
|--------|-----------|------|
| `pi.on("before_agent_start")` | ✅ 已映射 | → `system-prompt/assemble` |
| `pi.on("tool_call")` | ✅ 已映射 | 支持阻断 |
| `pi.on("tool_result")` | ✅ 已映射 | 支持修改 content |
| `pi.registerTool()` | ✅ 已映射 | → DSH tool registry |
| `pi.registerCommand()` | ✅ 已映射 | → DSH commands |
| `ctx.ui.notify/confirm` | ✅ 已映射 | |
| `ctx.sessionManager.getEntries()` | ✅ 已映射 | |
| `pi.sendMessage()` | ❌ 不可用 | 已替换为 tool_result return |
| `pi.appendEntry()` | ⚠️ 3 级旁路 | 不进 DSH 原生日志 |

## 配置

编辑 `~/.pi/agent/karpathy.json`，然后在 pi 里跑 `/reload`：

```json
{
  "maxLinesPerEdit": 150,
  "maxNewAbstractions": 2,
  "enableToolGuard": true,
  "enableResultWatcher": true,
  "strictness": "medium"
}
```

`strictness` 会同时缩放两个阈值：`low` 宽松 1.5 倍，`high` 严格到 0.6 倍。

## 开发

```bash
npm install
npm test           # analysis + config 辅助函数的单元测试
npx tsc --noEmit   # 类型检查
npx pi2dsh inspect npm:andrej-karpathy-extension@latest  # 兼容性检查
```

## 许可证

MIT
````

- [ ] **第 2 步：提交**

```bash
git add README.md
git commit -m "docs: add project README"
```

---

## 任务 18：添加 .gitignore 和 .pi settings

**文件：**
- 新建：`.gitignore`
- 新建：`.pi/settings.json`

- [ ] **第 1 步：编写 `.gitignore`**

```
node_modules/
tmp/
*.log
.DS_Store
```

- [ ] **第 2 步：编写 `.pi/settings.json`**（项目级 pi 设置；默认为本仓库加载这个 extension）

注意：`packages` 里的相对路径是**相对 `.pi/` 目录**解析的，所以要写 `../extensions/...`。写成 `./extensions/...` 会被解析成 `.pi/extensions/...`，pi 会静默地不加载。（`pi list -a` 能看到条目，但 extension 实际没生效。）

```json
{
  "packages": ["../extensions/karpathy-guidelines"]
}
```

验证：在仓库目录里跑 `pi list -a`，应看到解析后的绝对路径；再跑 `pi -a -p "..."` 确认准则已注入。项目级配置需要 `-a`（信任项目本地文件）才会生效。

- [ ] **第 3 步：提交**

```bash
git add .gitignore .pi/settings.json
git commit -m "chore: add gitignore and project pi settings"
```

---

## 任务 19：最终集成验证

**文件：**
- 读取：`README.md`、`package.json`、`extensions/karpathy-guidelines/index.ts`

最后一遍检查，确保一切串联到位。

- [ ] **第 1 步：运行所有单元测试**

```bash
npm test
```

预期：全部通过。

- [ ] **第 2 步：运行类型检查**

```bash
npx tsc --noEmit
```

预期：零错误。

- [ ] **第 3 步：在 pi 中加载 extension，确认通知出现**

```bash
pi -e ./extensions/karpathy-guidelines/index.ts
```

预期：TUI 模式下显示一次性通知 `Karpathy 准则已激活：/karma 查看，/karma configure 查看设置。`

- [ ] **第 4 步：运行 `/karma` 确认四条原则都出现**

- [ ] **第 5 步：在几次 write 之后运行 `/karma review`，确认报告能渲染**

- [ ] **第 6 步：确认 `self_check` 出现在 `/tools` 中**

- [ ] **第 7 步：提交任何最终修复**

```bash
git add <any-changes>
git commit -m "chore: final integration fixes" || true
```

---

## 自我审查

**规范覆盖检查：**

- 先想后做准则 -> 准则文本（任务 2），通过任务 6 注入，在任务 9 中展示，可通过任务 10 调用。
- 简单优先准则 -> 准则文本（任务 2），通过任务 7（行数阈值）、任务 8（新抽象数量）强制执行，在任务 9 中展示。
- 外科手术式修改准则 -> 准则文本（任务 2），通过任务 7（过大编辑守卫）强制执行，在任务 9 和任务 10 中展示。
- 目标驱动执行准则 -> 准则文本（任务 2），通过任务 10（决策点 self_check）提示。
- 程序化（非纯文本）强制执行 -> 任务 6、7、8 都做运行时工作；不是纯提示。
- 用户控制 / 透明性 -> 任务 9（/karma），任务 4（配置文件），任务 7（确认对话框）。
- 零配置安装 -> 任务 11 默认配置；任务 4 读取已有文件或回退到默认值。
- 纯逻辑的测试 -> 任务 14、15。
- 可作为 pi package 安装 -> 任务 12、18。

**pi2dsh 兼容性：**
- ✅ 所有 Pi API 均为 pi2dsh 已映射能力
- ✅ `pi.sendMessage()` 已替换为 `tool_result` return（任务 8）
- ⚠️ `pi.appendEntry()` 在 DSH 中走 sidecar（3 级旁路），避免使用
- ✅ 可通过 `npx pi2dsh inspect` 验证兼容性

**占位符扫描：** 没有 "TODO" 或 "TBD" 或 "implement later"。每个步骤都有完整代码或命令。

**类型一致性：**
- `KarpathyConfig` 的形状在任务 4 定义，在任务 7、8、9、11 中原样使用。
- `effectiveThresholds` 返回 `{ maxLines, maxAbs }`，在任务 7 和 8 中以同样方式消费。
- `changeSize` / `AbstractionReport` 类型从 `analysis.ts` 中导出，在任务 7、8、9 中原样复用。
- `registerXxx(pi, config)` 的约定在所有 handler 文件中保持一致。
- `configRef: { current: KarpathyConfig }` 对象在任务 11 创建并传给 `registerCommands`；该形状正是将来如果想让命令热更新配置时需要的（目前仅 commands 读取它，一致性成立）。
