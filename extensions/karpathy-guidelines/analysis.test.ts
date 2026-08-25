import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { countLines, estimateChangeSize, detectNewAbstractions, mergeEdits } from "./analysis.ts";

describe("countLines", () => {
	it("对 undefined 返回 0", () => {
		assert.equal(countLines(undefined), 0);
	});
	it("对空字符串返回 0（空内容不算改动）", () => {
		assert.equal(countLines(""), 0);
	});
	it("计算普通行数", () => {
		assert.equal(countLines("a\nb\nc"), 3);
	});
	it("把 CRLF 归一化为 LF", () => {
		assert.equal(countLines("a\r\nb\r\nc"), 3);
	});
});

describe("estimateChangeSize", () => {
	it("write 情况下用 content 长度", () => {
		const size = estimateChangeSize({ content: "a\nb\nc\n" });
		assert.equal(size.addedLines, 4);
		assert.equal(size.removedLines, 0);
		assert.equal(size.totalLines, 4);
	});
	it("edit 情况下取 newText 与 oldText 的差", () => {
		const size = estimateChangeSize({ newText: "a\nb", oldText: "x" });
		assert.equal(size.addedLines, 2);
		assert.equal(size.removedLines, 1);
		assert.equal(size.totalLines, 3);
	});
	it("content 与 newText 同时提供时优先 content（write 形态）", () => {
		const size = estimateChangeSize({ content: "long\ncontent\nhere", newText: "short" });
		assert.equal(size.addedLines, 3);
	});
});

describe("mergeEdits", () => {
	it("undefined 得到空串", () => {
		assert.deepEqual(mergeEdits(undefined), { oldText: "", newText: "" });
	});
	it("多处替换的行数等于各段之和", () => {
		const merged = mergeEdits([
			{ oldText: "x", newText: "a\nb" },
			{ oldText: "y\nz", newText: "c" },
		]);
		assert.equal(countLines(merged.newText), 3);
		assert.equal(countLines(merged.oldText), 3);
	});
	it("缺字段的条目按空串处理", () => {
		const merged = mergeEdits([{ newText: "a" }]);
		assert.equal(merged.oldText, "");
		assert.equal(merged.newText, "a");
	});
});

describe("detectNewAbstractions", () => {
	it("空输入返回空", () => {
		const r = detectNewAbstractions(undefined);
		assert.equal(r.count, 0);
		assert.deepEqual(r.abstractions, []);
	});
	it("能找到 TypeScript 函数", () => {
		const r = detectNewAbstractions("function foo() {}\nexport function bar() {}");
		assert.equal(r.count, 2);
		assert.deepEqual(
			r.abstractions.map((a) => a.name),
			["foo", "bar"],
		);
		assert.equal(r.abstractions[0]!.kind, "function");
	});
	it("能找到类", () => {
		const r = detectNewAbstractions("class MyClass {}");
		assert.equal(r.count, 1);
		assert.equal(r.abstractions[0]!.kind, "class");
		assert.equal(r.abstractions[0]!.name, "MyClass");
	});
	it("能找到 interface 和 type", () => {
		const r = detectNewAbstractions("interface IFoo {}\ntype Bar = string;");
		assert.equal(r.count, 2);
		assert.equal(r.abstractions[0]!.kind, "interface");
		assert.equal(r.abstractions[1]!.kind, "type");
	});
	it("能找到 Python def 和 class", () => {
		const r = detectNewAbstractions("def foo():\n    pass\nclass MyClass:\n    pass");
		assert.equal(r.count, 2);
		assert.equal(r.abstractions[0]!.kind, "function");
		assert.equal(r.abstractions[0]!.name, "foo");
		assert.equal(r.abstractions[1]!.kind, "class");
		assert.equal(r.abstractions[1]!.name, "MyClass");
	});
	it("忽略代码里的函数调用", () => {
		const r = detectNewAbstractions("foo();\nbar();");
		assert.equal(r.count, 0);
	});
	it("记录 1-based 行号", () => {
		const r = detectNewAbstractions("\n\nfunction baz() {}");
		assert.equal(r.abstractions[0]!.line, 3);
	});
});
