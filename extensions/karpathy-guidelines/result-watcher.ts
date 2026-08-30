/**
 * 监控 tool_result 事件中的两类信号：
 *
 * 1. 过度工程：在 write/edit 完成后查看实际落地的内容，统计新增顶层抽象。
 *    超过阈值就在 tool_result 的 content 顶部前置一条警告，让模型在下一轮看到。
 * 2. 波及范围：被改的文件如果有其他源文件相对导入它，前置一条提醒，
 *    要求收尾前跑类型检查和相关测试（对应准则 3 的影响声明和准则 4 的验证循环）。
 *
 * 为什么要在 tool_call 时先拍快照：`write` 的 input.content 是整份文件的
 * 新内容，直接统计会把文件里原有的函数/类也算成新增；`edit` 的 newText
 * 也可能整体重写已有函数，声明行会原样出现在片段里。所以写入之前先记下
 * 已有声明的签名，写入之后只对差集告警。
 *
 * 注意：不使用 pi.sendMessage()，因为 pi2dsh 不支持。
 * 改为 return 修改后的 content，这是 pi2dsh 已映射的能力。
 * 也不使用 isToolCallEventType()——那个 guard 是给 tool_call 事件用的，
 * 在 tool_result 上不适用；这里直接从 input 上按需读字段。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectNewAbstractions, mergeEdits } from "./analysis.js";
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

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".pi"]);
const SRC_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

function stripExt(p: string): string {
	return p.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, "");
}

/** 一个 import 说明符是否指向目标文件（只认相对路径，包导入忽略）。 */
function importsTarget(text: string, fileDir: string, target: string): boolean {
	const re = /(?:from|import|require\s*\()\s*["']([^"']+)["']/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		const spec = m[1];
		if (!spec || !spec.startsWith(".")) continue;
		if (stripExt(resolve(fileDir, spec)) === target) return true;
	}
	return false;
}

/**
 * 找出项目里有哪些源文件 import 了目标文件，即改动的波及范围。
 *
 * 这是启发式：只认相对路径导入，路径别名/动态拼接会漏。它给的是
 * "你动了共享模块"的信号，不是精确依赖图——和我们的哲学一致。
 * maxFiles 限制扫描成本，避免大项目上变慢。
 */
export function findDependents(targetPath: string, root: string, maxFiles = 500): string[] {
	const target = stripExt(resolve(root, targetPath));
	const deps: string[] = [];
	let scanned = 0;
	const stack: string[] = [root];
	while (stack.length > 0 && scanned < maxFiles) {
		const dir = stack.pop()!;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const e of entries) {
			const full = join(dir, e.name);
			if (e.isDirectory()) {
				if (!SKIP_DIRS.has(e.name)) stack.push(full);
				continue;
			}
			if (!e.isFile() || !SRC_EXT.test(e.name)) continue;
			if (stripExt(full) === target) continue; // 自己不算依赖方
			scanned++;
			let text: string;
			try {
				text = readFileSync(full, "utf-8");
			} catch {
				continue;
			}
			if (importsTarget(text, dir, target)) deps.push(relative(root, full));
		}
	}
	return deps;
}

function abstractionWarning(added: NewAbstraction[], maxAbs: number): string {
	const listed = added
		.slice(0, 6)
		.map((a) => `  - ${a.kind} \`${a.name}\` (line ${a.line})`);
	if (added.length > 6) listed.push("  - ...");
	// 要求型文案：让模型逐条回应，而不是修辞性提问。末尾的空行是
	// 前置后与后面真实结果之间的分隔（见 registerResultWatcher 的 content 重排）。
	return [
		`⚠️ [Karpathy — Simplicity First] 本次改动引入了 ${added.length} 个新的顶层抽象（阈值：${maxAbs}）：`,
		...listed,
		"",
		"在继续下一步之前，逐个回答：",
		"1. 每个抽象都是当前用户请求直接需要的吗？",
		"2. 其中某些能否内联到调用方，而不是新建顶层抽象？",
		"3. 一个资深工程师会认为这些属于过度设计吗？",
		"",
	].join("\n");
}

function impactNote(path: string, deps: string[]): string {
	const examples = deps.slice(0, 3).join("、");
	return [
		`⚠️ [Karpathy — Surgical Changes] \`${path}\` 被 ${deps.length} 个文件引用（如 ${examples}）。`,
		"",
		"在继续下一步之前，确认：",
		"1. 改动是否改变了现有导出签名（参数、返回类型、接口形状）？",
		"2. 如果改变了，依赖方是否仍然正常工作？",
		"3. 是否已运行 `tsc --noEmit` 与依赖方相关测试？",
		"",
	].join("\n");
}

/**
 * 从文件位置往上找项目根（带 package.json 或 .git 的目录），最多 10 层；
 * 找不到就退回文件所在目录。
 *
 * 不用 process.cwd()：要回答的是"谁引用了我"，扫整个工作目录又慢，
 * 又会被无关目录里的匹配打扰。只扫文件自己的目录又会漏掉跨目录引用，
 * 那是共享模块最常见的用法。
 */
function projectRootFor(path: string): string {
	const start = dirname(resolve(path));
	let dir = start;
	for (let i = 0; i < 10; i++) {
		if (existsSync(join(dir, "package.json")) || existsSync(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return start;
}

export function registerResultWatcher(
	pi: ExtensionAPI,
	config: KarpathyConfig,
	root?: string,
): void {
	const watchAbs = config.enableResultWatcher;
	const watchImpact = config.enableImpactWatcher;
	if (!watchAbs && !watchImpact) return;

	const { maxAbs } = effectiveThresholds(config);

	if (watchAbs) {
		// 写入之前：记录文件现有的声明作为基线（write 和 edit 都拍）。
		pi.on("tool_call", async (event) => {
			if (event.toolName !== "write" && event.toolName !== "edit") return;
			const path = asString(readInput(event).path);
			if (!path) return;
			baselines.set(path, existingSignatures(path));
		});
	}

	pi.on("tool_result", async (event) => {
		// 只检查 write 和 edit 的结果。
		if (event.toolName !== "write" && event.toolName !== "edit") return;

		const input = readInput(event);
		const path = asString(input.path) ?? "<未知>";

		const notes: string[] = [];

		if (watchAbs) {
			// write 的 content 是整份文件；edit 的 edits[].newText 只是被替换进去的片段。
			const content =
				event.toolName === "write" ? asString(input.content) : mergeEdits(input.edits).newText;
			if (content) {
				// 快照缺失（没经过 tool_call 的旁路路径）时基线为空集，声明全算新增兜底。
				const baseline = baselines.get(path);
				baselines.delete(path);

				const added = detectNewAbstractions(content).abstractions.filter(
					(a) => !baseline?.has(signature(a)),
				);
				if (added.length > maxAbs) notes.push(abstractionWarning(added, maxAbs));
			}
		} else {
			baselines.delete(path);
		}

		// 波及范围信号：改了被引用的模块时，提醒验证依赖方。
		if (watchImpact && path !== "<未知>") {
			const deps = findDependents(path, root ?? projectRootFor(path));
			if (deps.length > 0) notes.push(impactNote(path, deps));
		}

		if (notes.length === 0) return;

		// 警告前置而不是追加：模型逐 block 读取 content，第一眼看到的应该
		// 是警告而不是"写入成功"。原结果跟在警告后面，保留完整上下文——
		// 这也是不对 tool_result 做整体替换的原因（见 tmp/plan-c 文档）。
		// 仍通过修改 content 实现（pi2dsh 已映射）。
		return {
			content: [
				...notes.map((text) => ({ type: "text" as const, text })),
				...(Array.isArray(event.content) ? event.content : []),
			],
		};
	});
}
