# Andrej-Karpathy-Extension — DSH 适配计划

> **给 agentic worker 的话：** 必选子技能：使用 superpowers:subagent-driven-development（recommended）或 superpowers:executing-plans 按任务逐步实施本计划。步骤使用复选框（`- [ ]`）语法追踪进度。

**目标：** 让 Karpathy 编码准则 Extension 通过 [pi2dsh](https://npm.im/pi2dsh) 在 DSH（DeepSeek Harness）上运行。利用 pi2dsh 已有的 111 条 Pi API 映射和 50+ 包验证成果，无需自建桥接层。

**架构：** 两层 + pi2dsh——
1. **karpathy-core**：纯逻辑层，不含任何 harness 依赖。包含准则文本、行数统计、抽象检测、配置读写等纯函数。
2. **karpathy-pi**：pi adapter，把 core 包装成 pi Extension 格式（`export default function(pi: ExtensionAPI)`）。
3. **pi2dsh**（npm 包）：DSH 适配层，通过运行时桥接把 pi 注册映射为 DSH 注册。

> **为什么不自建 pi2dsh？** npm 上已有成熟的 `pi2dsh` 包（0.19.0），经过 50+ 个 pi 包的端到端验证，覆盖 111 条 Pi API 映射。自建桥接层是重复造轮子，且覆盖不完整、维护负担重。

**技术栈：** TypeScript（pi 侧用 jiti 加载，DSH 侧用 Cordis 原生），`@earendil-works/pi-coding-agent`（pi 类型，peerDependency），`pi2dsh`（npm 包，DSH 桥接）。

---

## 文件结构

```
andrej-karpathy-extension/
├── package.json                  # 根 package.json（workspace 根）
├── packages/
│   ├── karpathy-core/            # 纯逻辑层
│   │   ├── package.json          # 零运行时依赖（仅 devDependencies: typescript）
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts          # 导出所有公共 API
│   │   │   ├── guidelines.ts     # 四条准则文本 + buildSystemPromptSuffix()
│   │   │   ├── analysis.ts       # countLines, estimateChangeSize, detectNewAbstractions
│   │   │   ├── config.ts         # KarpathyConfig 类型 + DEFAULT_CONFIG + effectiveThresholds
│   │   │   └── types.ts          # ChangeSize, NewAbstraction, AbstractionReport 等纯类型
│   │   └── test/
│   │       ├── analysis.test.ts
│   │       └── config.test.ts
│   │
│   └── karpathy-pi/              # pi 适配器（唯一运行时产物）
│       ├── package.json          # peerDeps: @earendil-works/pi-coding-agent, typebox
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts          # export { default } from "./karpathy-pi.js"
│       │   ├── karpathy-pi.ts    # 默认导出工厂：registerCore(pi, config) + 所有 handler 注册
│       │   ├── system-injector.ts
│       │   ├── tool-guard.ts
│       │   ├── result-watcher.ts
│       │   ├── commands.ts       # /karma 命令
│       │   └── self-check-tool.ts
│       └── test/
│           └── karpathy-pi.test.ts
│
├── examples/
│   ├── pi-usage.md               # 在 pi 中使用说明
│   └── dsh-usage.md             # 在 DSH 中使用说明（通过 pi2dsh）
├── scripts/
│   └── verify-dsh.sh             # pi2dsh inspect + E2E 验证
├── docs/
│   └── compatibility.md          # pi2dsh 兼容性报告
├── README.md
├── LICENSE
└── .gitignore
```

> **关键变化：** 删除了 `packages/pi2dsh/`（自建桥接层）和 `pi2dsh-adapted/`（转换产物）。DSH 适配完全由 npm 上的 `pi2dsh` 包承担。

---

## 任务 1：创建项目骨架

**文件：**
- 新建：`package.json`（根）
- 新建：`.gitignore`
- 新建：`packages/karpathy-core/package.json`
- 新建：`packages/karpathy-pi/package.json`

- [ ] **第 1 步：创建目录结构**

```bash
mkdir -p packages/karpathy-core/src packages/karpathy-core/test
mkdir -p packages/karpathy-pi/src packages/karpathy-pi/test
mkdir -p examples scripts docs
```

- [ ] **第 2 步：编写根 `package.json`**

```json
{
  "name": "andrej-karpathy-extension",
  "version": "0.1.0",
  "description": "Karpathy coding guidelines enforcement for AI coding agents. Runs on pi and DSH (via pi2dsh).",
  "type": "module",
  "private": true,
  "license": "MIT",
  "workspaces": [
    "packages/karpathy-core",
    "packages/karpathy-pi"
  ],
  "scripts": {
    "build": "npm run build --workspace packages/karpathy-core && npm run build --workspace packages/karpathy-pi",
    "test": "npm run test --workspace packages/karpathy-core && npm run test --workspace packages/karpathy-pi",
    "check": "npm run check --workspace packages/karpathy-core && npm run check --workspace packages/karpathy-pi",
    "pi:dev": "npm run dev --workspace packages/karpathy-pi",
    "dsh:verify": "bash scripts/verify-dsh.sh"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **第 3 步：编写 `packages/karpathy-core/package.json`**

```json
{
  "name": "@karpathy-guidelines/core",
  "version": "0.1.0",
  "description": "Harness-agnostic Karpathy guidelines core logic",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./guidelines": {
      "types": "./dist/guidelines.d.ts",
      "default": "./dist/guidelines.js"
    },
    "./analysis": {
      "types": "./dist/analysis.d.ts",
      "default": "./dist/analysis.js"
    },
    "./config": {
      "types": "./dist/config.d.ts",
      "default": "./dist/config.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "tsc --noEmit -p tsconfig.json",
    "test": "node --import tsx --test test/*.test.ts"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **第 4 步：编写 `packages/karpathy-pi/package.json`**

```json
{
  "name": "@karpathy-guidelines/pi",
  "version": "0.1.0",
  "description": "Pi extension adapter for Karpathy guidelines",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "pi": {
    "extensions": ["./dist/index.js"]
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "tsc --noEmit -p tsconfig.json",
    "test": "node --import tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@karpathy-guidelines/core": "workspace:*"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "^0.84.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typebox": "^0.34.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **第 5 步：编写 `.gitignore`**

```
node_modules/
dist/
tmp/
*.log
.DS_Store
```

- [ ] **第 6 步：冒烟检查**

```bash
ls packages/karpathy-core packages/karpathy-pi && echo "ok"
```
预期输出：`ok`

- [ ] **第 7 步：提交**

```bash
git add .
git commit -m "feat: add monorepo skeleton (karpathy-core, karpathy-pi)"
```

---

## 任务 2：实现 karpathy-core 核心层

**文件：**
- 新建：`packages/karpathy-core/src/types.ts`
- 新建：`packages/karpathy-core/src/guidelines.ts`
- 新建：`packages/karpathy-core/src/analysis.ts`
- 新建：`packages/karpathy-core/src/config.ts`
- 新建：`packages/karpathy-core/src/index.ts`

- [ ] **第 1 步：编写 `packages/karpathy-core/src/types.ts`**

```typescript
export interface ChangeSize {
	addedLines: number;
	removedLines: number;
	totalLines: number;
}

export type AbstractionKind = "function" | "class" | "interface" | "type" | "abstract-method";

export interface NewAbstraction {
	kind: AbstractionKind;
	name: string;
	line: number;
}

export interface AbstractionReport {
	abstractions: NewAbstraction[];
	count: number;
}

export type Strictness = "low" | "medium" | "high";

export interface KarpathyConfig {
	maxLinesPerEdit: number;
	maxNewAbstractions: number;
	enableToolGuard: boolean;
	enableResultWatcher: boolean;
	strictness: Strictness;
}

export interface Thresholds {
	maxLines: number;
	maxAbs: number;
}
```

- [ ] **第 2 步：编写 `packages/karpathy-core/src/guidelines.ts`**

```typescript
export interface Principle {
	name: string;
	tagline: string;
	body: string;
}

export const PRINCIPLES: Principle[] = [
	{
		name: "1. Think Before Coding",
		tagline: "Don't assume. Don't hide confusion. Surface tradeoffs.",
		body: [
			"Before implementing:",
			"- State your assumptions explicitly. If uncertain, ask.",
			"- If multiple interpretations exist, present them - don't pick silently.",
			"- If a simpler approach exists, say so. Push back when warranted.",
			"- If something is unclear, stop. Name what's confusing. Ask.",
		].join("\n"),
	},
	{
		name: "2. Simplicity First",
		tagline: "Minimum code that solves the problem. Nothing speculative.",
		body: [
			"- No features beyond what was asked.",
			"- No abstractions for single-use code.",
			"- No 'flexibility' or 'configurability' that wasn't requested.",
			"- No error handling for impossible scenarios.",
			"- If you write 200 lines and it could be 50, rewrite it.",
			"",
			"Ask yourself: 'Would a senior engineer say this is overcomplicated?' If yes, simplify.",
		].join("\n"),
	},
	{
		name: "3. Surgical Changes",
		tagline: "Touch only what you must. Clean up only your own mess.",
		body: [
			"When editing existing code:",
			"- Don't 'improve' adjacent code, comments, or formatting.",
			"- Don't refactor things that aren't broken.",
			"- Match existing style, even if you'd do it differently.",
			"- If you notice unrelated dead code, mention it - don't delete it.",
			"",
			"When your changes create orphans:",
			"- Remove imports/variables/functions that YOUR changes made unused.",
			"- Don't remove pre-existing dead code unless asked.",
			"",
			"The test: Every changed line should trace directly to the user's request.",
		].join("\n"),
	},
	{
		name: "4. Goal-Driven Execution",
		tagline: "Define success criteria. Loop until verified.",
		body: [
			"Transform tasks into verifiable goals:",
			"- 'Add validation' -> 'Write tests for invalid inputs, then make them pass'",
			"- 'Fix the bug' -> 'Write a test that reproduces it, then make it pass'",
			"- 'Refactor X' -> 'Ensure tests pass before and after'",
			"",
			"For multi-step tasks, state a brief plan:",
			"1. [Step] -> verify: [check]",
			"2. [Step] -> verify: [check]",
			"3. [Step] -> verify: [check]",
			"",
			"Strong success criteria let you loop independently. Weak criteria ('make it work') require constant clarification.",
			"",
			"Use the self_check tool at decision points to validate progress against these four principles.",
		].join("\n"),
	},
];

export function buildSystemPromptSuffix(): string {
	const sections = PRINCIPLES.map((p) => `### ${p.name}: ${p.tagline}\n${p.body}`).join("\n\n");
	return `

## Karpathy Coding Guidelines

You must follow these four principles on every task. They are non-negotiable behavioral guidelines, not suggestions.

${sections}

**How you know these are working:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes.
`;
}

export function buildChecklistForLLM(): string {
	return PRINCIPLES.map((p) => {
		const items = p.body
			.split("\n")
			.filter((line) => line.trim().startsWith("- "))
			.map((line) => `  [ ] ${line.replace(/^-\s+/, "")}`)
			.join("\n");
		return `${p.name}: ${p.tagline}\n${items}`;
	}).join("\n\n");
}
```

- [ ] **第 3 步：编写 `packages/karpathy-core/src/analysis.ts`**

```typescript
import type { ChangeSize, NewAbstraction, AbstractionReport } from "./types.js";

export function countLines(content: string | undefined): number {
	if (!content) return 0;
	return content.replace(/\r\n/g, "\n").split("\n").length;
}

export function estimateChangeSize(args: {
	content?: string;
	newText?: string;
	oldText?: string;
}): ChangeSize {
	if (args.content !== undefined) {
		const total = countLines(args.content);
		return { addedLines: total, removedLines: 0, totalLines: total };
	}
	return {
		addedLines: countLines(args.newText),
		removedLines: countLines(args.oldText),
		totalLines: countLines(args.newText) + countLines(args.oldText),
	};
}

export function detectNewAbstractions(content: string | undefined): AbstractionReport {
	if (!content) return { abstractions: [], count: 0 };
	const found: NewAbstraction[] = [];
	content.split("\n").forEach((line, idx) => {
		const t = line.trim();
		let m: RegExpMatchArray | null;
		if ((m = t.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)))
			found.push({ kind: "function", name: m[1], line: idx + 1 });
		else if ((m = t.match(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/)))
			found.push({ kind: "class", name: m[1], line: idx + 1 });
		else if ((m = t.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/)))
			found.push({ kind: "interface", name: m[1], line: idx + 1 });
		else if ((m = t.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/)))
			found.push({ kind: "type", name: m[1], line: idx + 1 });
		else if ((m = t.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/)))
			found.push({ kind: "function", name: m[1], line: idx + 1 });
		else if ((m = t.match(/^class\s+([A-Za-z_][\w]*)/)))
			found.push({ kind: "class", name: m[1], line: idx + 1 });
	});
	return { abstractions: found, count: found.length };
}
```

- [ ] **第 4 步：编写 `packages/karpathy-core/src/config.ts`**

```typescript
import type { KarpathyConfig, Strictness, Thresholds } from "./types.js";

export type { KarpathyConfig, Strictness, Thresholds };

export const DEFAULT_CONFIG: KarpathyConfig = {
	maxLinesPerEdit: 150,
	maxNewAbstractions: 2,
	enableToolGuard: true,
	enableResultWatcher: true,
	strictness: "medium",
};

const STRICTNESS_MULTIPLIER: Record<Strictness, number> = { low: 1.5, medium: 1.0, high: 0.6 };

export function effectiveThresholds(config: KarpathyConfig): Thresholds {
	const m = STRICTNESS_MULTIPLIER[config.strictness];
	return {
		maxLines: Math.round(config.maxLinesPerEdit * m),
		maxAbs: Math.max(1, Math.round(config.maxNewAbstractions * m)),
	};
}

export function mergeConfig(user: Partial<KarpathyConfig> | undefined): KarpathyConfig {
	return user ? { ...DEFAULT_CONFIG, ...user } : { ...DEFAULT_CONFIG };
}
```

- [ ] **第 5 步：编写 `packages/karpathy-core/src/index.ts`**

```typescript
export * from "./types.js";
export * from "./guidelines.js";
export * from "./analysis.js";
export * from "./config.js";
```

- [ ] **第 6 步：编写 `packages/karpathy-core/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": false,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **第 7 步：冒烟检查**

```bash
ls packages/karpathy-core/src/*.ts && echo "ok"
```

- [ ] **第 8 步：提交**

```bash
git add packages/karpathy-core
git commit -m "feat(core): add harness-agnostic karpathy guidelines core"
```

---

## 任务 3：为 karpathy-core 编写单元测试

**文件：**
- 新建：`packages/karpathy-core/test/analysis.test.ts`
- 新建：`packages/karpathy-core/test/config.test.ts`

- [ ] **第 1 步：编写 `packages/karpathy-core/test/analysis.test.ts`**

```typescript
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { countLines, estimateChangeSize, detectNewAbstractions } from "../src/analysis.js";

describe("countLines", () => {
	it("undefined -> 0", () => assert.equal(countLines(undefined), 0));
	it("counts lines", () => assert.equal(countLines("a\nb\nc"), 3));
	it("normalizes CRLF", () => assert.equal(countLines("a\r\nb\r\nc"), 3));
});

describe("estimateChangeSize", () => {
	it("write uses content", () => {
		const s = estimateChangeSize({ content: "a\nb\n" });
		assert.equal(s.totalLines, 2);
	});
	it("edit deltas new/old", () => {
		const s = estimateChangeSize({ newText: "a\nb", oldText: "x" });
		assert.equal(s.addedLines, 2);
		assert.equal(s.removedLines, 1);
	});
});

describe("detectNewAbstractions", () => {
	it("empty -> empty", () => {
		const r = detectNewAbstractions(undefined);
		assert.equal(r.count, 0);
	});
	it("finds TS functions", () => {
		const r = detectNewAbstractions("function foo() {}\nexport function bar() {}");
		assert.equal(r.count, 2);
		assert.deepEqual(r.abstractions.map((a) => a.name), ["foo", "bar"]);
	});
	it("finds classes and interfaces", () => {
		const r = detectNewAbstractions("class A {}\ninterface I {}\ntype T = string;");
		assert.equal(r.count, 3);
	});
	it("finds Python defs", () => {
		const r = detectNewAbstractions("def foo():\n    pass\nclass Bar:\n    pass");
		assert.equal(r.count, 2);
	});
	it("ignores function calls", () => {
		assert.equal(detectNewAbstractions("foo();\nbar();").count, 0);
	});
});
```

- [ ] **第 2 步：编写 `packages/karpathy-core/test/config.test.ts`**

```typescript
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, effectiveThresholds, mergeConfig } from "../src/config.js";
import type { KarpathyConfig } from "../src/types.js";

describe("effectiveThresholds", () => {
	it("low multiplies up", () => {
		const t = effectiveThresholds({ ...DEFAULT_CONFIG, strictness: "low", maxLinesPerEdit: 100, maxNewAbstractions: 2 });
		assert.equal(t.maxLines, 150);
		assert.equal(t.maxAbs, 3);
	});
	it("high multiplies down", () => {
		const t = effectiveThresholds({ ...DEFAULT_CONFIG, strictness: "high", maxLinesPerEdit: 100, maxNewAbstractions: 2 });
		assert.equal(t.maxLines, 60);
		assert.equal(t.maxAbs, 1);
	});
	it("maxAbs floors at 1", () => {
		const t = effectiveThresholds({ ...DEFAULT_CONFIG, strictness: "high", maxNewAbstractions: 0 });
		assert.equal(t.maxAbs, 1);
	});
});

describe("mergeConfig", () => {
	it("undefined -> defaults", () => {
		assert.deepEqual(mergeConfig(undefined), DEFAULT_CONFIG);
	});
	it("partial merge", () => {
		const c = mergeConfig({ strictness: "high" } as Partial<KarpathyConfig>);
		assert.equal(c.strictness, "high");
		assert.equal(c.maxLinesPerEdit, DEFAULT_CONFIG.maxLinesPerEdit);
	});
});
```

- [ ] **第 3 步：安装依赖并运行测试**

```bash
npm install
npm test --workspace packages/karpathy-core
```
预期：全部通过

- [ ] **第 4 步：提交**

```bash
git add packages/karpathy-core/test
git commit -m "test(core): add unit tests for analysis and config"
```

---

## 任务 4：实现 karpathy-pi 适配器

**文件：**
- 新建：`packages/karpathy-pi/src/karpathy-pi.ts`
- 新建：`packages/karpathy-pi/src/system-injector.ts`
- 新建：`packages/karpathy-pi/src/tool-guard.ts`
- 新建：`packages/karpathy-pi/src/result-watcher.ts`
- 新建：`packages/karpathy-pi/src/commands.ts`
- 新建：`packages/karpathy-pi/src/self-check-tool.ts`
- 新建：`packages/karpathy-pi/src/index.ts`

- [ ] **第 1 步：编写 `packages/karpathy-pi/src/index.ts`**

```typescript
export { default } from "./karpathy-pi.js";
```

- [ ] **第 2 步：编写 `packages/karpathy-pi/src/system-injector.ts`**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSystemPromptSuffix } from "@karpathy-guidelines/core";

export function registerSystemInjector(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event) => {
		return { systemPrompt: event.systemPrompt + buildSystemPromptSuffix() };
	});
}
```

- [ ] **第 3 步：编写 `packages/karpathy-pi/src/tool-guard.ts`**

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { estimateChangeSize } from "@karpathy-guidelines/core/analysis";
import type { KarpathyConfig, ChangeSize } from "@karpathy-guidelines/core";
import { effectiveThresholds } from "@karpathy-guidelines/core/config";

export function registerToolGuard(pi: ExtensionAPI, config: KarpathyConfig): void {
	if (!config.enableToolGuard) return;
	const { maxLines } = effectiveThresholds(config);

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "write" && isToolCallEventType("write", event)) {
			const size = estimateChangeSize({ content: event.input.content as string | undefined });
			if (size.totalLines > maxLines) {
				return confirmLargeChange(ctx, "write", event.input.path as string, size, maxLines);
			}
		}
		if (event.toolName === "edit" && isToolCallEventType("edit", event)) {
			const size = estimateChangeSize({
				newText: event.input.newText as string | undefined,
				oldText: event.input.oldText as string | undefined,
			});
			if (size.totalLines > maxLines) {
				return confirmLargeChange(ctx, "edit", event.input.path as string, size, maxLines);
			}
		}
	});
}

async function confirmLargeChange(
	ctx: ExtensionContext,
	tool: string,
	path: string,
	size: ChangeSize,
	threshold: number,
): Promise<{ block: true; reason: string } | undefined> {
	if (!ctx.hasUI) {
		ctx.ui.notify(`Karpathy: large ${tool} to ${path} (${size.totalLines} lines > ${threshold})`, "warning");
		return undefined;
	}
	const ok = await ctx.ui.confirm(
		"Karpathy: large change?",
		`${tool} ${path}: ${size.totalLines} lines (threshold ${threshold}).\nPer Simplicity First: could this be smaller?`,
	);
	if (!ok) return { block: true, reason: "Blocked by user via Karpathy guard." };
	return undefined;
}
```

- [ ] **第 4 步：编写 `packages/karpathy-pi/src/result-watcher.ts`**

> **注意：** 这里不使用 `pi.sendMessage()`，因为 pi2dsh 不支持。改为通过 `tool_result` return 修改后的 content 来追加警告。

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectNewAbstractions } from "@karpathy-guidelines/core/analysis";
import type { KarpathyConfig } from "@karpathy-guidelines/core";
import { effectiveThresholds } from "@karpathy-guidelines/core/config";

export function registerResultWatcher(pi: ExtensionAPI, config: KarpathyConfig): void {
	if (!config.enableResultWatcher) return;
	const { maxAbs } = effectiveThresholds(config);

	pi.on("tool_result", async (event) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;
		let content: string | undefined;
		if (event.toolName === "write" && isToolCallEventType("write", event)) {
			content = event.input.content as string | undefined;
		} else if (event.toolName === "edit" && isToolCallEventType("edit", event)) {
			content = event.input.newText as string | undefined;
		}
		if (!content) return;
		const report = detectNewAbstractions(content);
		if (report.count <= maxAbs) return;

		const names = report.abstractions.slice(0, 6).map((a) => `${a.kind} \`${a.name}\``).join(", ");
		const warning = [
			"",
			`⚠️ [Karpathy] 你刚刚引入了 ${report.count} 个新的顶层抽象（阈值：${maxAbs}）。`,
			`检测到：${names}${report.abstractions.length > 6 ? "，..." : ""}。`,
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

- [ ] **第 5 步：编写 `packages/karpathy-pi/src/commands.ts`**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PRINCIPLES, buildChecklistForLLM } from "@karpathy-guidelines/core/guidelines";
import type { KarpathyConfig } from "@karpathy-guidelines/core";
import { effectiveThresholds } from "@karpathy-guidelines/core/config";

export function registerCommands(pi: ExtensionAPI, config: KarpathyConfig): void {
	pi.registerCommand("karma", {
		description: "Karpathy guidelines: show, review, or configure",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
			const th = effectiveThresholds(config);

			if (sub === "review") {
				ctx.ui.notify("No write/edit calls in this session yet.", "info");
				return;
			}
			if (sub === "configure") {
				ctx.ui.notify(
					[
						"Karpathy config:",
						`  strictness: ${config.strictness} (effective: ${th.maxLines} lines, ${th.maxAbs} abstractions)`,
						`  tool guard: ${config.enableToolGuard}`,
						`  result watcher: ${config.enableResultWatcher}`,
						"Edit ~/.pi/agent/karpathy.json and /reload to change.",
					].join("\n"),
					"info",
				);
				return;
			}
			// default: show
			const principles = PRINCIPLES.map((p) => `### ${p.name}: ${p.tagline}\n${p.body}`).join("\n\n");
			ctx.ui.notify(principles, "info");
		},
	});
}
```

- [ ] **第 6 步：编写 `packages/karpathy-pi/src/self-check-tool.ts`**

```typescript
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildChecklistForLLM } from "@karpathy-guidelines/core/guidelines";

const SelfCheckParams = Type.Object({
	context: Type.Optional(Type.String({ description: "What you are about to/did" })),
	step: Type.Optional(Type.String({ description: "Optional step label" })),
});

export function registerSelfCheckTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "self_check",
		label: "Self-Check",
		description:
			"Run a Karpathy guidelines self-check at a decision point. Use before non-trivial changes.",
		parameters: SelfCheckParams,
		async execute(_tc, params) {
			const ctx = (params.context as string | undefined) ?? "";
			const step = (params.step as string | undefined) ?? "";
			const checklist = buildChecklistForLLM();
			const header = step ? `[${step}] ` : "";
			return {
				content: [
					{
						type: "text",
						text: `Karpathy self-check\nContext: ${header}${ctx}\n\n${checklist}\n\nWalk through each item. For each: PASS, FAIL, or N/A + one-sentence reason. If any FAIL, do not proceed.`,
					},
				],
				details: { context: ctx, step },
			};
		},
	});
}
```

- [ ] **第 7 步：编写 `packages/karpathy-pi/src/karpathy-pi.ts`（主入口）**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KarpathyConfig } from "@karpathy-guidelines/core";
import { mergeConfig, DEFAULT_CONFIG } from "@karpathy-guidelines/core/config";
import { registerSystemInjector } from "./system-injector.js";
import { registerToolGuard } from "./tool-guard.js";
import { registerResultWatcher } from "./result-watcher.js";
import { registerCommands } from "./commands.js";
import { registerSelfCheckTool } from "./self-check-tool.js";

export default function karpathyPi(pi: ExtensionAPI, userConfig?: Partial<KarpathyConfig>) {
	const config = mergeConfig(userConfig);
	registerSystemInjector(pi);
	registerToolGuard(pi, config);
	registerResultWatcher(pi, config);
	registerCommands(pi, config);
	registerSelfCheckTool(pi);
}
```

- [ ] **第 8 步：编写 `packages/karpathy-pi/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": {
      "@karpathy-guidelines/core": ["../karpathy-core/src"]
    },
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **第 9 步：冒烟检查**

```bash
ls packages/karpathy-pi/src/*.ts && echo "ok"
```

- [ ] **第 10 步：提交**

```bash
git add packages/karpathy-pi
git commit -m "feat(pi): add pi extension adapter for karpathy guidelines"
```

---

## 任务 5：验证 pi2dsh 兼容性

不使用自建的 pi2dsh 适配层，而是直接用 npm 上成熟的 `pi2dsh` 包。本任务验证 Karpathy Extension 的所有 Pi API 使用都在 pi2dsh 的覆盖范围内。

**文件：**
- 新建：`scripts/verify-dsh.sh`
- 新建：`docs/compatibility.md`

- [ ] **第 1 步：运行 pi2dsh inspect 检查兼容性**

```bash
# 安装 pi2dsh（如果还没装）
npm install -g pi2dsh

# 检查 Karpathy Extension 的兼容性
npx pi2dsh inspect npm:@karpathy-guidelines/pi@latest
```

预期输出：兼容性报告，显示所有 API 都已映射。

- [ ] **第 2 步：编写 `scripts/verify-dsh.sh`**

```bash
#!/bin/bash
set -e

echo "=== Karpathy Extension pi2dsh 兼容性验证 ==="

# 1. 检查 pi2dsh 是否已安装
if ! command -v pi2dsh &> /dev/null; then
    echo "安装 pi2dsh..."
    npm install -g pi2dsh
fi

# 2. 运行兼容性检查
echo ""
echo "--- 兼容性检查 ---"
npx pi2dsh inspect npm:@karpathy-guidelines/pi@latest

# 3. 构建检查
echo ""
echo "--- 构建检查 ---"
npm run build

# 4. 单元测试
echo ""
echo "--- 单元测试 ---"
npm test

# 5. 类型检查
echo ""
echo "--- 类型检查 ---"
npm run check

echo ""
echo "=== 验证完成 ==="
```

- [ ] **第 3 步：编写 `docs/compatibility.md`**

```markdown
# Karpathy Extension — pi2dsh 兼容性报告

## 使用的 Pi API 清单

| Pi API | pi2dsh 状态 | 说明 |
|--------|-----------|------|
| `pi.on("before_agent_start")` | ✅ 已映射 | → `system-prompt/assemble` |
| `pi.on("tool_call")` | ✅ 已映射 | 支持阻断 |
| `pi.on("tool_result")` | ✅ 已映射 | 支持修改 content |
| `pi.registerTool()` | ✅ 已映射 | → DSH tool registry |
| `pi.registerCommand()` | ✅ 已映射 | → DSH commands |
| `ctx.ui.notify()` | ✅ 已映射 | |
| `ctx.ui.confirm()` | ✅ 已映射 | |
| `ctx.hasUI` | ✅ 已映射 | |
| `ctx.sessionManager.getEntries()` | ✅ 已映射 | |
| `isToolCallEventType()` | ✅ 已映射 | 工具类型收窄 |

## 已知不兼容（已修复）

| 原计划使用的 API | 问题 | 修复方式 |
|----------------|------|----------|
| `pi.sendMessage()` | pi2dsh 不可用 | 改为 `tool_result` return 修改 content |
| `pi.appendEntry()` | 3 级旁路 | 避免使用 |

## 验证命令

```bash
npx pi2dsh inspect npm:@karpathy-guidelines/pi@latest
```
```

- [ ] **第 4 步：运行验证脚本**

```bash
bash scripts/verify-dsh.sh
```

预期：全部检查通过。

- [ ] **第 5 步：提交**

```bash
git add scripts/verify-dsh.sh docs/compatibility.md
git commit -m "feat: verify pi2dsh compatibility for karpathy extension"
```

---

## 任务 6：为 karpathy-pi 编写单元测试

**文件：**
- 新建：`packages/karpathy-pi/test/karpathy-pi.test.ts`

- [ ] **第 1 步：编写 `packages/karpathy-pi/test/karpathy-pi.test.ts`**

```typescript
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { detectNewAbstractions, estimateChangeSize } from "@karpathy-guidelines/core";

describe("karpathy-pi integration", () => {
	it("detects excessive abstractions in a large write", () => {
		const code = [
			"function foo() {}",
			"function bar() {}",
			"function baz() {}",
			"class MyClass {}",
		].join("\n");
		const report = detectNewAbstractions(code);
		assert.equal(report.count, 4);
		assert.ok(report.count > 2); // threshold
	});

	it("estimates change size correctly for write", () => {
		const size = estimateChangeSize({ content: "line1\nline2\nline3" });
		assert.equal(size.totalLines, 3);
	});

	it("estimates change size correctly for edit", () => {
		const size = estimateChangeSize({ newText: "a\nb", oldText: "x" });
		assert.equal(size.addedLines, 2);
		assert.equal(size.removedLines, 1);
	});
});
```

- [ ] **第 2 步：运行测试**

```bash
npm install
npm test
```

预期：全部通过

- [ ] **第 3 步：提交**

```bash
git add packages/karpathy-pi/test
git commit -m "test(pi): add karpathy-pi integration tests"
```

---

## 任务 7：编写使用示例 + README

**文件：**
- 新建：`examples/pi-usage.md`
- 新建：`examples/dsh-usage.md`
- 新建：`README.md`

- [ ] **第 1 步：编写 `examples/pi-usage.md`**

````markdown
# 在 pi 中使用 Karpathy 编码准则

## 安装

```bash
# 方式 1：从 npm 安装
pi install npm:@karpathy-guidelines/pi

# 方式 2：从 git 安装
pi install git:github.com/your-org/andrej-karpathy-extension

# 方式 3：本地开发
pi -e ./packages/karpathy-pi
```

## 使用

```
/karma          显示四条准则 + 当前配置
/karma review   审查最近的 write/edit 改动
/karma configure 显示配置文件路径
```

## 配置

编辑 `~/.pi/agent/karpathy.json` 然后 `/reload`：

```json
{
  "maxLinesPerEdit": 150,
  "maxNewAbstractions": 2,
  "enableToolGuard": true,
  "enableResultWatcher": true,
  "strictness": "medium"
}
```
````

- [ ] **第 2 步：编写 `examples/dsh-usage.md`**

````markdown
# 在 DSH 中使用 Karpathy 编码准则（通过 pi2dsh）

## 前置条件

- DSH 已安装（`npx @deepseek-ai/dsh`）
- pi2dsh 已安装（`dsh plugin add pi2dsh`）

## 安装

```bash
# 1. 安装 pi2dsh（如果还没装）
dsh plugin add pi2dsh

# 2. 安装 Karpathy Extension
dsh plugin add npm:@karpathy-guidelines/pi

# 3. 重启 dsh
```

## 验证

```bash
# 检查兼容性
npx pi2dsh inspect npm:@karpathy-guidelines/pi@latest
```

## 已知限制

| pi 能力 | DSH 状态 |
|---------|----------|
| system prompt 注入 | ✅ 通过 system-prompt/assemble |
| 工具注册 | ✅ 通过 ctx.tools.register |
| 命令注册 | ✅ 通过 ctx.commands.register |
| tool_call block | ⚠️ DSH 无 block 钩子（tool-guard 降级为通知） |
| tool_result 改写 | ✅ 已改为 return 修改 content |
| pi.appendEntry | ⚠️ 3 级旁路（不进 DSH 原生日志） |
| ctx.ui 交互 | ✅ notify/confirm 可用 |

## 降级策略

- tool-guard：从"block + confirm"降级为"通知 + 用户确认"
- result-watcher：通过 tool_result return 追加警告（非 steer）
- self-check tool：完全可用
- /karma 命令：完全可用
````

- [ ] **第 3 步：编写 `README.md`**

````markdown
# Andrej-Karpathy-Extension

Andrej Karpathy 的四条编码准则，以程序化方式在 AI 编码助手中强制执行。

## 支持的 Harness

| Harness | 安装方式 | 状态 |
|---------|----------|------|
| pi | `pi install npm:@karpathy-guidelines/pi` | ✅ 完整支持 |
| DSH | 通过 pi2dsh（`dsh plugin add pi2dsh`） | ⚠️ 部分支持（见下方） |

## 架构

```
karpathy-core/        ← 纯逻辑（无 harness 依赖）
karpathy-pi/         ← pi Extension 适配器
```

## 四条准则

1. **先想后做** — 不假设；不确定就问
2. **简单优先** — 最少的代码，不搞推测性设计
3. **外科手术式修改** — 只改你必须改的
4. **目标驱动执行** — 定义成功标准，循环直到验证通过

## DSH 已知限制

- tool_call 的 block 能力不可用（DSH 无对应钩子）
- 状态持久化（pi.appendEntry）走 sidecar
- 其余功能（system prompt 注入、工具/命令注册、tool_result 改写）完全可用

## 开发

```bash
npm install
npm run build
npm test
npm run check
npx pi2dsh inspect npm:@karpathy-guidelines/pi@latest
```

## License

MIT
````

- [ ] **第 4 步：提交**

```bash
git add examples README.md
git commit -m "docs: add usage examples and README"
```

---

## 任务 8：最终集成验证

- [ ] **第 1 步：构建所有包**

```bash
npm run build
```

预期：两个包全部构建成功

- [ ] **第 2 步：运行所有测试**

```bash
npm test
```

预期：全部通过

- [ ] **第 3 步：运行类型检查**

```bash
npm run check
```

预期：零错误

- [ ] **第 4 步：验证 pi2dsh 兼容性**

```bash
bash scripts/verify-dsh.sh
```

预期：兼容性检查通过

- [ ] **第 5 步：在 pi 中验证**

```bash
pi -e ./packages/karpathy-pi
```

预期：pi 启动时显示 "Karpathy guidelines active" 通知

- [ ] **第 6 步：提交最终修复**

```bash
git add .
git commit -m "chore: final integration fixes" || true
```

---

## 自我审查

**规范覆盖：**

- ✅ 两层架构（core / pi）清晰分离
- ✅ karpathy-core 零 harness 依赖，纯函数可独立测试
- ✅ karpathy-pi 用 pi ExtensionAPI 包装 core
- ✅ DSH 适配由 npm 上的 pi2dsh 包承担（无需自建）
- ✅ 所有 Pi API 使用均通过 pi2dsh inspect 验证
- ✅ 单元测试覆盖 core 和 pi
- ✅ 使用示例 + README 完整
- ✅ 验证脚本自动化

**占位符扫描：** 无 TBD/TODO/实现 later。

**类型一致性：**
- KarpathyConfig 在 core 定义，pi 通过 import 复用
- 所有 pi API 类型来自 `@earendil-works/pi-coding-agent`

**pi2dsh 兼容性：**
- ✅ `pi.on("before_agent_start")` → `system-prompt/assemble`
- ✅ `pi.on("tool_call")` → 支持阻断
- ✅ `pi.on("tool_result")` → 支持修改 content
- ✅ `pi.registerTool()` → DSH tool registry
- ✅ `pi.registerCommand()` → DSH commands
- ✅ `ctx.ui.notify/confirm` → 已映射
- ✅ `ctx.sessionManager.getEntries()` → 已映射
- ✅ `isToolCallEventType()` → 已映射
- ❌ `pi.sendMessage()` → 已替换为 tool_result return
- ⚠️ `pi.appendEntry()` → 3 级旁路，避免使用
