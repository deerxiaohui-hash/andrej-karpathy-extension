/**
 * 过大范围 write/edit 的观察者。
 *
 * 当单次 write 或 edit 触动的行数超过 `maxLines` 时，把具体数字通知给用户，
 * 但**不阻断**工具调用。
 *
 * 为什么不再拦截：行数是过度工程的代理指标，拿它当门会误拦正当的大写入
 * （数据文件、大功能、重构），还会诱导模型博弈阈值（拆小写入、改用 bash）。
 * 拦截本身也不包含"如何变简单"的信息，和"让代码更简单"之间没有因果链。
 * 提供可见性、把判断留给人，是摩擦最低且不误伤的做法。
 *
 * 模型侧的简洁约束由另外两条真正有因果链的机制承担：
 * system prompt 注入（动手前）和 result-watcher 的抽象警告（落地后）。
 */

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { estimateChangeSize, mergeEdits } from "./analysis.js";
import type { KarpathyConfig } from "./config.js";
import { effectiveThresholds } from "./config.js";
import { summary } from "./ui.js";

export function registerToolGuard(pi: ExtensionAPI, config: KarpathyConfig): void {
	if (!config.enableToolGuard) return;

	const { maxLines } = effectiveThresholds(config);

	pi.on("tool_call", async (event, ctx) => {
		// 内置的 write 和 edit 工具走同一条路径。
		if (event.toolName === "write") {
			if (!isToolCallEventType("write", event)) return;
			// 不加 as 断言：这里的 event.input 已经是 WriteToolInput，pi 改字段名时
			// tsc 会直接报错，而不是默默拿到 undefined 后静默失效。
			reportSize(ctx, "write", event.input.path, estimateChangeSize({ content: event.input.content }), maxLines);
			return;
		}

		if (event.toolName === "edit") {
			if (!isToolCallEventType("edit", event)) return;
			// 一次 edit 调用可以带多处替换；把它们合起来看总规模。
			reportSize(ctx, "edit", event.input.path, estimateChangeSize(mergeEdits(event.input.edits)), maxLines);
		}
	});
}

/**
 * 只通知，不阻断：让规模在发生的那一刻可见，判断留给人。
 * 观察者模式没有门槛可绕，因此也不会制造博弈。
 */
function reportSize(
	ctx: import("@earendil-works/pi-coding-agent").ExtensionContext,
	tool: "write" | "edit",
	path: string,
	size: { addedLines: number; removedLines: number; totalLines: number },
	threshold: number,
): void {
	if (size.totalLines <= threshold) return;
	ctx.ui.notify(
		summary([
			"karpathy",
			`${tool} ${path}`,
			`${size.totalLines} 行（阈值 ${threshold}）`,
			`+${size.addedLines}/-${size.removedLines}`,
		]),
		"warning",
	);
}
