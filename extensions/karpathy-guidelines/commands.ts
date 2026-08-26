/**
 * /karma 斜杠命令。子命令：
 *   /karma              -> 显示准则 + 当前配置
 *   /karma review       -> 审查本次 session 中最近的代码改动
 *   /karma configure    -> 显示配置文件路径和如何编辑
 *
 * 一切都是只读的。命令里不修改 session。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { estimateChangeSize, detectNewAbstractions, mergeEdits } from "./analysis.js";
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
				// 一次 edit 调用可以带多处替换；合起来统计总规模。
				const merged = mergeEdits(b.input.edits);
				const size = estimateChangeSize(merged);
				const abs = detectNewAbstractions(merged.newText);
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
