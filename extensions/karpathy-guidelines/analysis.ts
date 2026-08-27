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
 * 把一次 edit 调用的多处替换各自拼成一个字符串，交给
 * estimateChangeSize / detectNewAbstractions 复用。用 "\n" 连接：
 * countLines 对拼接结果的计数正好等于各段之和。
 *
 * 参数收 unknown 而不是具体形状：tool_result 事件和 session entry 里的
 * input 都是 Record<string, unknown>，调用点拿不到类型。形状不对时按空处理，
 * 不抛错——统计失准也好过打断工具调用。
 */
export function mergeEdits(edits: unknown): { oldText: string; newText: string } {
	const list = Array.isArray(edits) ? edits : [];
	const pick = (entry: unknown, key: "oldText" | "newText"): string => {
		const value = (entry as Record<string, unknown> | null | undefined)?.[key];
		return typeof value === "string" ? value : "";
	};
	return {
		oldText: list.map((e) => pick(e, "oldText")).join("\n"),
		newText: list.map((e) => pick(e, "newText")).join("\n"),
	};
}

/**
 * 在代码字符串中检测新引入的**顶层**抽象。启发式检测：
 * - TypeScript/JavaScript：函数声明、类声明、interface/type 声明
 * - Python：class/def 声明
 *
 * 只统计行首无缩进的声明。嵌套声明（函数内的局部函数、类方法、
 * 内部 type）不是新引入的顶层抽象，把它们算进来只会让
 * result-watcher 的警告噪音变大。
 *
 * 我们刻意使用简单的正则模式。允许出现误报，因为目标是
 * 提示模型去思考，而不是以 100% 的确定性阻断。
 *
 * 每个模式的捕获组都是必配的，所以匹配成功时 m[1] 一定存在
 * （用 ! 满足 noUncheckedIndexedAccess）。
 */
export function detectNewAbstractions(content: string | undefined): AbstractionReport {
	if (!content) return { abstractions: [], count: 0 };
	const found: NewAbstraction[] = [];
	const lines = content.split("\n");

	lines.forEach((line, idx) => {
		// 行首有空白（空格或 tab）即视为嵌套声明，跳过。
		if (/^[ \t]/.test(line)) return;
		const trimmed = line.trim();
		let m: RegExpMatchArray | null;

		if ((m = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) {
			found.push({ kind: "function", name: m[1]!, line: idx + 1 });
		} else if ((m = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/))) {
			found.push({ kind: "class", name: m[1]!, line: idx + 1 });
		} else if ((m = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/))) {
			found.push({ kind: "interface", name: m[1]!, line: idx + 1 });
		} else if ((m = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/))) {
			found.push({ kind: "type", name: m[1]!, line: idx + 1 });
		} else if (
			(m = trimmed.match(
				/^(?:export\s+)?abstract\s+(?:async\s+)?(?:[\w$<>,\s|]+)\s+([A-Za-z_$][\w$]*)\s*\(/,
			))
		) {
			found.push({ kind: "abstract-method", name: m[1]!, line: idx + 1 });
		} else if ((m = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/))) {
			found.push({ kind: "function", name: m[1]!, line: idx + 1 });
		} else if ((m = trimmed.match(/^class\s+([A-Za-z_][\w]*)/))) {
			found.push({ kind: "class", name: m[1]!, line: idx + 1 });
		}
	});

	return { abstractions: found, count: found.length };
}
