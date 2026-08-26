/**
 * 防止过大范围的 write/edit 操作。
 *
 * 当单次 write 或 edit 涉及的行数超过 `maxLines` 时，我们通知用户，
 * 在交互模式下请用户确认。LLM 依然可以继续——最终决定权在用户。
 */

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { estimateChangeSize, mergeEdits } from "./analysis.js";
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
			// 不加 as 断言：这里的 event.input 已经是 WriteToolInput，pi 改字段名时
			// tsc 会直接报错，而不是默默拿到 undefined 后静默失效。
			const size = estimateChangeSize({ content: event.input.content });
			if (size.totalLines <= maxLines) return;
			return await confirmBroadChange(ctx, "write", event.input.path, size, maxLines);
		}

		if (event.toolName === "edit") {
			if (!isToolCallEventType("edit", event)) return;
			// 一次 edit 调用可以带多处替换；把它们合起来看总规模。
			const size = estimateChangeSize(mergeEdits(event.input.edits));
			if (size.totalLines <= maxLines) return;
			return await confirmBroadChange(ctx, "edit", event.input.path, size, maxLines);
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
