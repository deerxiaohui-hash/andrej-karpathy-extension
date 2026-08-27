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
