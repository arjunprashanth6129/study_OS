/** Keyless Claude Code web search: synthetic CLI output only; no process, no network. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLAUDE_CODE_SEARCH_ID } from "../src/core/search.ts";
import { claudeCodeSearchProvider, cliSearchArgs, parseCliSearchOutput } from "../src/server/claude-code-search.ts";
import { claudeCodeSearchApplies } from "../src/server/search.ts";

const resultLine = (content: unknown[], extra: unknown[] = ["Model commentary about the results."]) => JSON.stringify({
	type: "user",
	message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "Web search results…" }] },
	tool_use_result: { query: "q", results: [{ tool_use_id: "srv1", content }, ...extra], durationSeconds: 1 },
});

describe("parseCliSearchOutput", () => {
	it("reads hits from the tool's structured result, in order, without duplicates", () => {
		const stdout = [
			JSON.stringify({ type: "system", subtype: "init" }),
			JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "see https://invented.example/not-a-hit" }] } }),
			resultLine([
				{ title: "First", url: "https://a.example/1" },
				{ title: "  ", url: "https://b.example/2" },
				{ title: "Duplicate", url: "https://a.example/1" },
			]),
			JSON.stringify({ type: "result", is_error: false }),
		].join("\n");
		assert.deepEqual(parseCliSearchOutput(stdout), [
			{ title: "First", url: "https://a.example/1", snippet: "" },
			{ title: "https://b.example/2", url: "https://b.example/2", snippet: "" },
		]);
	});

	it("drops non-http rows, malformed rows and unparsable lines", () => {
		const stdout = [
			"not json tool_use_result",
			resultLine([{ title: "ftp", url: "ftp://a.example/x" }, { title: "none" }, null, { title: "ok", url: "http://c.example/" }]),
			JSON.stringify({ type: "assistant", tool_use_result: { results: [{ content: [{ title: "wrong line type", url: "https://d.example/" }] }] } }),
		].join("\n");
		assert.deepEqual(parseCliSearchOutput(stdout).map((h) => h.url), ["http://c.example/"]);
		assert.deepEqual(parseCliSearchOutput(""), []);
	});
});

describe("claudeCodeSearchProvider", () => {
	it("returns at most `count` hits from one run", async () => {
		const queries: string[] = [];
		const provider = claudeCodeSearchProvider(async (query) => {
			queries.push(query);
			return resultLine([1, 2, 3, 4].map((n) => ({ title: `T${n}`, url: `https://e.example/${n}` })));
		});
		assert.equal(provider.id, CLAUDE_CODE_SEARCH_ID);
		assert.deepEqual((await provider.search("board questions", 2)).map((h) => h.title), ["T1", "T2"]);
		assert.deepEqual(queries, ["board questions"]);
	});

	it("maps a failed run to a clear error and an empty run to no hits", async () => {
		await assert.rejects(claudeCodeSearchProvider(async () => { throw new Error("timed out"); }).search("q", 5), /Claude Code web search failed: timed out/);
		assert.deepEqual(await claudeCodeSearchProvider(async () => "").search("q", 5), []);
	});

	it("enables only the CLI's own web search tool", () => {
		const args = cliSearchArgs("the query");
		assert.equal(args[args.indexOf("--tools") + 1], "WebSearch");
		assert.equal(args[args.indexOf("--allowedTools") + 1], "WebSearch");
		assert.ok(args.includes("--no-session-persistence"));
		assert.ok(args[args.length - 1]!.endsWith("Query: the query"));
	});
});

describe("claudeCodeSearchApplies", () => {
	it("applies only with nothing pinned, nothing keyed, and an available CLI", () => {
		assert.equal(claudeCodeSearchApplies(undefined, {}, true), true);
		assert.equal(claudeCodeSearchApplies(undefined, { exa: undefined }, true), true);
		assert.equal(claudeCodeSearchApplies(undefined, {}, false), false);
		assert.equal(claudeCodeSearchApplies(undefined, { brave: "key" }, true), false, "a keyed engine outranks the fallback");
		assert.equal(claudeCodeSearchApplies("tavily", {}, true), false, "a pin without its key stays unavailable");
	});
});
