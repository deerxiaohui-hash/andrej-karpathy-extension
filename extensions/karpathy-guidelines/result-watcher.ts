/**
 * 监控 tool_result 事件中的两类信号：
 *
 * 1. 过度工程：在 write/edit 完成后查看实际落地的内容，统计新增顶层抽象。
 *    超过阈值就通过修改 tool_result 的 content 追加一条警告，让模型在下一轮看到。
 * 2. 波及范围：被改的文件如果有其他源文件引用它，追加一条提醒，
 *    要求收尾前跑类型检查和相关测试（对应准则 3 的影响声明和准则 4 的验证循环）。
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
	const names = added
		.slice(0, 6)
		.map((a) => `${a.kind} \`${a.name}\``)
		.join(", ");
	return [
		"",
		`⚠️ [Karpathy] 你刚刚引入了 ${added.length} 个新的顶层抽象（阈值：${maxAbs}）。`,
		`检测到：${names}${added.length > 6 ? "，..." : ""}。`,
		`依照 Simplicity First：这些全部都是当前请求真正需要的吗？`,
		`能否把其中某些内联、删除，或者推迟到第二个用户真正需要时再添加？`,
	].join("\n");
}

function impactNote(path: string, deps: string[]): string {
	const examples = deps.slice(0, 3).join("、");
	return [
		"",
		`⚠️ [Karpathy] \`${path}\` 被 ${deps.length} 个文件引用（如 ${examples}）。`,
		"依照外科手术式修改与目标驱动执行：收尾前运行 `tsc --noEmit` 与依赖方相关测试，确认它们依然通过。",
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
		// 写入之前：记录文件现有的声明作为基线。
		pi.on("tool_call", async (event) => {
			if (event.toolName !== "write") return;
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
				// edit 没有基线（undefined），此时 newText 里的每个声明都算新增。
				const baseline = event.toolName === "write" ? baselines.get(path) : undefined;
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

		// 通过修改 tool_result content 追加警告（pi2dsh 已映射）。
		return {
			content: [
				...(Array.isArray(event.content) ? event.content : []),
				...notes.map((text) => ({ type: "text" as const, text })),
			],
		};
	});
}
