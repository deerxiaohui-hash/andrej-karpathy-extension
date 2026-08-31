/**
 * 测试用的假 ExtensionAPI / ExtensionContext。
 *
 * pi 的真实类型面很大，而本 Extension 只用到其中几个成员。这里构造最小的
 * 假对象，并把类型断言集中在这一个文件里——各测试文件就不必再各自写 as，
 * 事件负载那边也就能老老实实用 pi 导出的真实类型来标注。
 *
 * 文件名不是 *.test.ts，所以 `npm test` 的 glob 不会把它当成测试文件。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** ctx.ui.notify 收到的一条通知。 */
export interface Notice {
	message: string;
	level?: string;
}

/** ctx.ui.setWidget 收到的一次调用。 */
export interface WidgetCall {
	key: string;
	content: string[];
	options?: { placement?: string };
}

export interface FakeCtxOptions {
	/** 只有交互模式下 tool guard 才会弹确认框。默认 false。 */
	hasUI?: boolean;
	/** ctx.ui.confirm 的答复。默认 false（拒绝）。 */
	confirmAnswer?: boolean;
	/** ctx.sessionManager.getEntries() 的返回值，/karma review 会读它。 */
	entries?: unknown[];
	/** ctx.mode，默认 "tui"。非 TUI 模式欢迎消息退回 notify。 */
	mode?: string;
}

interface FakeCtx {
	hasUI: boolean;
	mode: string;
	ui: {
		notify(message: string, level?: string): void;
		confirm(title: string, message: string): Promise<boolean>;
		setWidget(key: string, content: string[] | undefined, options?: { placement?: string }): void;
	};
	sessionManager: { getEntries(): unknown[] };
}

type Handler = (event: never, ctx: never) => unknown;

export interface Harness {
	pi: ExtensionAPI;
	/** 所有 ctx 共享，按调用顺序累积。 */
	notices: Notice[];
	/** ctx.ui.confirm 收到的 (title, message)。 */
	confirms: { title: string; message: string }[];
	/** ctx.ui.setWidget 的调用记录，按顺序累积。 */
	widgets: WidgetCall[];
	/** 已注册的事件名，按注册顺序。 */
	registeredEvents(): string[];
	hasTool(name: string): boolean;
	/** 触发某个事件的全部 handler；返回值里已滤掉 undefined。 */
	fire(event: string, payload: unknown, opts?: FakeCtxOptions): Promise<unknown[]>;
	/** 执行已注册的斜杠命令。 */
	runCommand(name: string, args: string, opts?: FakeCtxOptions): Promise<void>;
}

export function createHarness(): Harness {
	const handlers: { event: string; fn: Handler }[] = [];
	const commands = new Map<string, { handler: (args: string, ctx: never) => unknown }>();
	const toolNames = new Set<string>();
	const notices: Notice[] = [];
	const confirms: { title: string; message: string }[] = [];
	const widgets: WidgetCall[] = [];

	const pi = {
		on: (event: string, fn: Handler) => {
			handlers.push({ event, fn });
		},
		registerCommand: (name: string, cmd: { handler: (args: string, ctx: never) => unknown }) => {
			commands.set(name, cmd);
		},
		registerTool: (tool: { name: string }) => {
			toolNames.add(tool.name);
		},
		registerMessageRenderer: () => {},
		sendMessage: () => {},
	} as unknown as ExtensionAPI;

	function makeCtx(opts: FakeCtxOptions = {}): FakeCtx {
		const entries = opts.entries ?? [];
		return {
			hasUI: opts.hasUI ?? false,
			mode: opts.mode ?? "tui",
			ui: {
				notify: (message, level) => {
					notices.push({ message, level });
				},
				confirm: async (title, message) => {
					confirms.push({ title, message });
					return opts.confirmAnswer ?? false;
				},
				setWidget: (key, content, options) => {
					widgets.push({ key, content: content ?? [], options });
				},
			},
			sessionManager: { getEntries: () => entries },
		};
	}

	return {
		pi,
		notices,
		confirms,
		widgets,
		registeredEvents: () => handlers.map((h) => h.event),
		hasTool: (name) => toolNames.has(name),
		fire: async (event, payload, opts) => {
			const ctx = makeCtx(opts);
			const results: unknown[] = [];
			for (const h of handlers) {
				if (h.event !== event) continue;
				const result = await h.fn(payload as never, ctx as never);
				if (result !== undefined) results.push(result);
			}
			return results;
		},
		runCommand: async (name, args, opts) => {
			const cmd = commands.get(name);
			if (!cmd) throw new Error(`命令未注册：${name}`);
			await cmd.handler(args, makeCtx(opts) as never);
		},
	};
}

/** 把全部通知拼成一个字符串，方便断言"输出里有没有提到某件事"。 */
export function allText(notices: Notice[]): string {
	return notices.map((n) => n.message).join("\n");
}

/** 生成 n 行文本，用来触发行数阈值。 */
export function lines(n: number): string {
	return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
}

/** 生成 n 个各自返回一个数字的导出函数，用来触发抽象数量阈值。 */
export function functions(names: number[]): string {
	return names.map((n) => `export function fn${n}() {\n\treturn ${n};\n}`).join("\n\n");
}
