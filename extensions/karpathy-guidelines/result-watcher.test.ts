/**
 * result watcher 的行为测试。
 *
 * 最要紧的一条是"覆盖已有文件不许误报"：write 的 input.content 是整份文件的
 * 新内容，天真地统计会把文件里原本就有的函数也算成新增。这里用真实的临时
 * 文件把基线快照那条路径跑通。
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { EditToolInput, WriteToolInput } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, type KarpathyConfig } from "./config.js";
import { findDependents, registerResultWatcher } from "./result-watcher.js";
import { createHarness, functions, type Harness } from "./test-harness.js";

const workDir = mkdtempSync(join(tmpdir(), "karpathy-watcher-"));
let seq = 0;

after(() => {
	rmSync(workDir, { recursive: true, force: true });
});

/** 每个用例用一份新路径：基线是模块级状态，共用路径会串味。 */
function freshPath(): string {
	seq += 1;
	return join(workDir, `case-${seq}.ts`);
}

function setup(overrides: Partial<KarpathyConfig> = {}, root?: string): Harness {
	const h = createHarness();
	registerResultWatcher(h.pi, { ...DEFAULT_CONFIG, ...overrides }, root);
	return h;
}

/** 走一遍真实顺序：tool_call 拍基线 -> 文件落地 -> tool_result 统计。 */
async function runWrite(h: Harness, path: string, content: string): Promise<unknown[]> {
	const input: WriteToolInput = { path, content };
	await h.fire("tool_call", { toolName: "write", input });
	writeFileSync(path, content, "utf-8");
	return await h.fire("tool_result", {
		toolName: "write",
		input,
		content: [{ type: "text", text: "ok" }],
	});
}

function warningText(results: unknown[]): string {
	assert.equal(results.length, 1, `期望恰好一条警告，实际 ${results.length} 条`);
	const blocks = (results[0] as { content?: { text?: string }[] }).content ?? [];
	return blocks.map((b) => b.text ?? "").join("\n");
}

/** 波及范围夹具：独立目录里，b.ts 相对导入 a.ts。 */
function impactFixture(): { dir: string; target: string } {
	seq += 1;
	const dir = join(workDir, `impact-${seq}`);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "a.ts"),
		"export function helper(): number {\n\treturn 1;\n}\n",
		"utf-8",
	);
	writeFileSync(
		join(dir, "b.ts"),
		'import { helper } from "./a.js";\n\nexport function use(): number {\n\treturn helper();\n}\n',
		"utf-8",
	);
	return { dir, target: join(dir, "a.ts") };
}

describe("registerResultWatcher", () => {
	it("两个开关都关时一个 handler 都不注册", () => {
		const h = setup({ enableResultWatcher: false, enableImpactWatcher: false });
		assert.deepEqual(h.registeredEvents(), []);
	});

	it("同时监听 tool_call（拍基线）和 tool_result（统计）", () => {
		const h = setup();
		assert.deepEqual(h.registeredEvents(), ["tool_call", "tool_result"]);
	});

	it("新建文件里一次塞 5 个函数会告警", async () => {
		const h = setup();
		const results = await runWrite(h, freshPath(), functions([1, 2, 3, 4, 5]));
		const text = warningText(results);
		assert.match(text, /5 个新的顶层抽象（阈值：2）/);
		assert.match(text, /Simplicity First/);
	});

	it("覆盖已有文件时，原有的声明不算新增", async () => {
		const h = setup();
		const path = freshPath();
		const before = functions([1, 2, 3, 4, 5]);
		writeFileSync(path, before, "utf-8");

		// 只改一个函数体，声明一个没多。（变量别叫 after，会遮住 node:test 的 after）
		const updated = before.replace("return 3;", "return 30;");
		const results = await runWrite(h, path, updated);
		assert.deepEqual(results, [], "覆盖写入不该产生警告");
	});

	it("已有文件上真的多出 4 个声明时才告警，且数量只算增量", async () => {
		const h = setup();
		const path = freshPath();
		const before = functions([1, 2, 3, 4, 5]);
		writeFileSync(path, before, "utf-8");

		const grown = `${before}\n\n${functions([6, 7, 8, 9])}`;
		const text = warningText(await runWrite(h, path, grown));
		assert.match(text, /4 个新的顶层抽象/);
	});

	it("正好到阈值不告警（只有超过才提醒）", async () => {
		const h = setup();
		const results = await runWrite(h, freshPath(), functions([1, 2]));
		assert.deepEqual(results, []);
	});

	it("警告追加在原有 content 之后，不覆盖它", async () => {
		const h = setup();
		const results = await runWrite(h, freshPath(), functions([1, 2, 3]));
		const blocks = (results[0] as { content: { type: string; text: string }[] }).content;
		assert.equal(blocks.length, 2);
		assert.equal(blocks[0]!.text, "ok");
		assert.match(blocks[1]!.text, /Karpathy/);
	});

	it("edit 按 edits[].newText 统计，且不需要基线", async () => {
		const h = setup();
		const input: EditToolInput = {
			path: freshPath(),
			edits: [
				{ oldText: "// a", newText: functions([1, 2]) },
				{ oldText: "// b", newText: functions([3]) },
			],
		};
		const results = await h.fire("tool_result", { toolName: "edit", input, content: [] });
		assert.match(warningText(results), /3 个新的顶层抽象/);
	});

	it("edits 形状不对时安静跳过，不抛错", async () => {
		const h = setup();
		const results = await h.fire("tool_result", {
			toolName: "edit",
			input: { path: freshPath(), edits: "这不是数组" },
			content: [],
		});
		assert.deepEqual(results, []);
	});

	it("不管别的工具", async () => {
		const h = setup();
		const results = await h.fire("tool_result", {
			toolName: "read",
			input: { path: freshPath() },
			content: [{ type: "text", text: functions([1, 2, 3, 4, 5]) }],
		});
		assert.deepEqual(results, []);
	});

	it("基线读不到文件时按空基线处理（宁可多提醒一次）", async () => {
		const h = setup();
		const path = freshPath();
		assert.equal(existsSync(path), false);
		const text = warningText(await runWrite(h, path, functions([1, 2, 3])));
		assert.match(text, /3 个新的顶层抽象/);
	});
});

describe("impact watcher（波及范围）", () => {
	it("改被引用的文件时追加波及提示，列出依赖方并要求验证", async () => {
		const { dir, target } = impactFixture();
		const h = setup({}, dir);
		const results = await runWrite(
			h,
			target,
			"export function helper(): number {\n\treturn 2;\n}\n",
		);
		const text = warningText(results);
		assert.match(text, /被 1 个文件引用/);
		assert.match(text, /b\.ts/);
		assert.match(text, /tsc --noEmit/);
	});

	it("没人引用的文件不加波及提示", async () => {
		const { dir, target } = impactFixture();
		rmSync(join(dir, "b.ts"));
		const h = setup({}, dir);
		const results = await runWrite(
			h,
			target,
			"export function helper(): number {\n\treturn 2;\n}\n",
		);
		assert.deepEqual(results, []);
	});

	it("关掉影响观察后，被引用也不再提示", async () => {
		const { dir, target } = impactFixture();
		const h = setup({ enableImpactWatcher: false }, dir);
		const results = await runWrite(
			h,
			target,
			"export function helper(): number {\n\treturn 2;\n}\n",
		);
		assert.deepEqual(results, []);
	});

	it("只开影响观察、关掉抽象观察时，波及提示依然生效", async () => {
		const { dir, target } = impactFixture();
		const h = setup({ enableResultWatcher: false }, dir);
		// 新增 5 个函数也不该触发抽象警告（已关），但波及提示要有。
		const text = warningText(await runWrite(h, target, functions([1, 2, 3, 4, 5])));
		assert.match(text, /被 1 个文件引用/);
		assert.doesNotMatch(text, /新的顶层抽象/);
	});

	it("edit 被引用文件同样产生波及提示", async () => {
		const { dir, target } = impactFixture();
		const h = setup({}, dir);
		const input: EditToolInput = {
			path: target,
			edits: [{ oldText: "return 1;", newText: "return 2;" }],
		};
		const results = await h.fire("tool_result", { toolName: "edit", input, content: [] });
		assert.match(warningText(results), /被 1 个文件引用/);
	});

	it("抽象警告和波及提示可以叠加出现", async () => {
		const { dir, target } = impactFixture();
		const h = setup({}, dir);
		// 新内容比基线多出 3 个函数（超阈值 2），同时文件被 b.ts 引用。
		const grown = `export function helper(): number {\n\treturn 2;\n}\n\n${functions([10, 11, 12])}`;
		const results = await runWrite(h, target, grown);
		assert.equal(results.length, 1);
		const blocks = (results[0] as { content: { text: string }[] }).content;
		assert.equal(blocks.length, 3); // 原有 ok + 抽象警告 + 波及提示
		assert.match(blocks[1]!.text, /新的顶层抽象/);
		assert.match(blocks[2]!.text, /被 1 个文件引用/);
	});

	it("子目录里的依赖方也能找到", async () => {
		const { dir, target } = impactFixture();
		mkdirSync(join(dir, "sub"));
		writeFileSync(
			join(dir, "sub", "c.ts"),
			'import { helper } from "../a.js";\n',
			"utf-8",
		);
		const h = setup({}, dir);
		const text = warningText(
			await runWrite(h, target, "export function helper(): number {\n\treturn 2;\n}\n"),
		);
		assert.match(text, /被 2 个文件引用/);
	});

	it("findDependents 只认相对导入、不算自己、忽略包导入", () => {
		const { dir, target } = impactFixture();
		writeFileSync(join(dir, "c.ts"), 'import { helper } from "some-package";\n', "utf-8");
		assert.deepEqual(findDependents(target, dir), ["b.ts"]);
	});
});
