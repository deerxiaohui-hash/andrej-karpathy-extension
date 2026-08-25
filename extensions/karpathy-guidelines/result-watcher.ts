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
import { detectNewAbstractions, mergeEdits } from "./analysis.js";
import type { EditEntry, NewAbstraction } from "./analysis.js";
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

		// write 的 content 是整份文件；edit 的 edits[].newText 只是被替换进去的片段。
		const content =
			event.toolName === "write"
				? asString(input.content)
				: mergeEdits(input.edits as EditEntry[] | undefined).newText;
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
