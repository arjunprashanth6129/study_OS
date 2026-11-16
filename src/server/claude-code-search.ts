/**
 * Keyless web search through the externally installed Claude Code CLI
 * (local addition, 2026-11-13): one short CLI run per query with ONLY the
 * CLI's own WebSearch tool enabled. Hits are read from the tool's structured
 * result line, never from model prose, so no URL can be invented. The CLI owns
 * authentication, routing and billing exactly as it does for model turns.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getClaudeBinary } from "../agent/claude-code/binary.ts";
import { externalCliEnv } from "../core/auth-env.ts";
import { CLAUDE_CODE_SEARCH_ID, type SearchHit, type SearchProvider } from "../core/search.ts";

const SEARCH_MODEL = "haiku";
const SEARCH_TIMEOUT_MS = 60_000;
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;

export function cliSearchArgs(query: string): string[] {
	return [
		"-p",
		"--model", SEARCH_MODEL,
		// Replace the CLI's large default prompt: a search run needs none of it.
		"--system-prompt", "You run one web search and report nothing else.",
		"--tools", "WebSearch",
		"--allowedTools", "WebSearch",
		"--output-format", "stream-json",
		"--verbose",
		"--no-session-persistence",
		"--setting-sources", "user",
		"--settings", JSON.stringify({ disableAllHooks: true, outputStyle: "default", env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" } }),
		"--disable-slash-commands",
		`Call the WebSearch tool exactly once with the query below, then reply with only the word done.\n\nQuery: ${query}`,
	];
}

function hit(title: unknown, url: unknown): SearchHit | null {
	if (typeof url !== "string" || !url.trim()) return null;
	try {
		const protocol = new URL(url).protocol;
		if (protocol !== "http:" && protocol !== "https:") return null;
	} catch { return null; }
	return { title: typeof title === "string" && title.trim() ? title.trim() : url, url, snippet: "" };
}

/** Read the WebSearch tool's structured result from stream-json output. */
export function parseCliSearchOutput(stdout: string): SearchHit[] {
	const hits: SearchHit[] = [];
	const seen = new Set<string>();
	for (const line of stdout.split("\n")) {
		if (!line.includes("tool_use_result")) continue;
		let parsed: unknown;
		try { parsed = JSON.parse(line); } catch { continue; }
		const results = (parsed as { type?: string; tool_use_result?: { results?: unknown } }).tool_use_result?.results;
		if ((parsed as { type?: string }).type !== "user" || !Array.isArray(results)) continue;
		for (const result of results) {
			const content = (result as { content?: unknown } | null)?.content;
			if (!Array.isArray(content)) continue;
			for (const row of content) {
				const found = hit((row as { title?: unknown } | null)?.title, (row as { url?: unknown } | null)?.url);
				if (!found || seen.has(found.url)) continue;
				seen.add(found.url);
				hits.push(found);
			}
		}
	}
	return hits;
}

export type RunCliSearch = (query: string) => Promise<string>;

/** One CLI run in an empty temporary directory, without a shell. */
export const runCliSearch: RunCliSearch = async (query) => {
	const binary = getClaudeBinary();
	if (!binary) throw new Error("claude CLI not found");
	const cwd = await mkdtemp(join(tmpdir(), "claude-code-search-"));
	try {
		return await new Promise<string>((resolve, reject) => {
			const child = spawn(binary, cliSearchArgs(query), {
				cwd,
				env: { ...externalCliEnv(), CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" },
				stdio: ["ignore", "pipe", "ignore"],
			});
			let stdout = "";
			let scanned = 0;
			const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("timed out")); }, SEARCH_TIMEOUT_MS);
			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				if (stdout.length < MAX_STDOUT_BYTES) stdout += chunk;
				// The structured result line is all a search needs. Stop the run there:
				// letting the model answer would re-send the whole result payload
				// (measured ~24k tokens) for a one-word reply.
				for (let end = stdout.indexOf("\n", scanned); end !== -1; end = stdout.indexOf("\n", scanned)) {
					const line = stdout.slice(scanned, end);
					scanned = end + 1;
					if (line.includes("tool_use_result") && parseCliSearchOutput(line).length > 0) {
						clearTimeout(timer);
						child.kill();
						resolve(line);
						return;
					}
				}
			});
			child.once("error", (error) => { clearTimeout(timer); reject(error); });
			child.once("close", () => { clearTimeout(timer); resolve(stdout); });
		});
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
};

export function claudeCodeSearchProvider(run: RunCliSearch = runCliSearch): SearchProvider {
	return {
		id: CLAUDE_CODE_SEARCH_ID,
		async search(query: string, count: number): Promise<SearchHit[]> {
			let stdout: string;
			try { stdout = await run(query); }
			catch (error) { throw new Error(`Claude Code web search failed: ${error instanceof Error ? error.message : String(error)}`); }
			return parseCliSearchOutput(stdout).slice(0, count);
		},
	};
}
