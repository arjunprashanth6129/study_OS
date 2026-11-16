/** study_os study tools: timer arithmetic, study log, recall dates, photo pickup. Temp files only. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { createStudyLogTools, nextRecall, recentPhotos, studyLogPath } from "../src/agent/tools/study.ts";

const exec = async (tool: { execute: (...args: never[]) => unknown }, input: unknown) =>
	(await (tool.execute as (id: string, input: unknown) => Promise<{ details: unknown }>)("t", input)).details;

describe("study log", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "study-log-"));
	studyLogPath.current = path.join(dir, "study", "log.json");
	const tools = createStudyLogTools();

	it("adds, de-duplicates, reads and fixes weak points", async () => {
		await exec(tools.weak_points_add!, { chapter: "Amines", subject: "Chemistry", points: ["Hinsberg test products", "pKb order in water"] });
		await exec(tools.weak_points_add!, { chapter: "amines ", subject: "Chemistry", points: ["hinsberg test products"] });
		const read = await exec(tools.study_log_read!, { chapter: "Amines" }) as { openWeakPoints: { id: string; point: string; times: number }[] };
		assert.equal(read.openWeakPoints.length, 2);
		const hinsberg = read.openWeakPoints.find((p) => p.point === "Hinsberg test products")!;
		assert.equal(hinsberg.times, 2);
		await exec(tools.weak_points_fixed!, { ids: [hinsberg.id] });
		const after = await exec(tools.study_log_read!, {}) as { openWeakPoints: unknown[] };
		assert.equal(after.openWeakPoints.length, 1);
	});

	it("records a studied chapter once per day and schedules the next recall", async () => {
		const first = await exec(tools.chapter_studied!, { chapter: "Amines", subject: "Chemistry" }) as { sessions: string[]; nextRecall: string };
		const again = await exec(tools.chapter_studied!, { chapter: "Amines", subject: "Chemistry" }) as { sessions: string[] };
		assert.equal(first.sessions.length, 1);
		assert.equal(again.sessions.length, 1);
		assert.ok(first.nextRecall > first.sessions[0]!);
	});

	it("spaces recalls at 1, 3, 7, 21 and 45 days from the first session", () => {
		const record = (sessions: string[]) => ({ chapter: "c", subject: "s", sessions });
		assert.equal(nextRecall(record(["2026-11-16"])), "2026-11-17");
		assert.equal(nextRecall(record(["2026-11-16", "2026-11-17"])), "2026-11-19");
		assert.equal(nextRecall(record(["2026-11-16", "2026-11-17", "2026-11-19"])), "2026-11-23");
		assert.equal(nextRecall(record(["2026-11-16", "2026-11-17", "2026-11-19", "2026-11-23"])), "2026-12-07");
		assert.equal(nextRecall(record([])), null);
	});
});

describe("recentPhotos", () => {
	it("returns only recent image files, newest first", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "photos-"));
		const now = Date.now();
		for (const [name, ageMin] of [["old.jpg", 60], ["new.png", 1], ["mid.HEIC", 5], ["notes.pdf", 1]] as const) {
			const file = path.join(dir, name);
			fs.writeFileSync(file, "x");
			fs.utimesSync(file, new Date(now - ageMin * 60_000), new Date(now - ageMin * 60_000));
		}
		assert.deepEqual(recentPhotos([dir, path.join(dir, "missing")], now - 20 * 60_000, 3).map((p) => path.basename(p.file)), ["new.png", "mid.HEIC"]);
	});
});

describe("markEmptyTurnFailed", async () => {
	const { markEmptyTurnFailed, EMPTY_TURN_MESSAGE } = await import("../src/server/turn-service.ts");
	const assistant = (content: unknown[], stopReason = "stop") => ({ role: "assistant", content, stopReason, id: "a" }) as unknown as import("../src/core/native-messages.ts").LhMessage;
	it("marks a turn that showed nothing as failed", () => {
		const turn = [assistant([{ type: "thinking", thinking: "" }])];
		markEmptyTurnFailed(turn);
		assert.equal((turn[0] as unknown as { stopReason: string }).stopReason, "error");
		assert.equal((turn[0] as unknown as { errorMessage: string }).errorMessage, EMPTY_TURN_MESSAGE);
	});
	it("leaves turns with text or a tool call alone, including an empty final reply after send_to_user", () => {
		const withText = [assistant([{ type: "text", text: "Hello" }])];
		const afterTool = [assistant([{ type: "toolCall", id: "t", name: "send_to_user", arguments: {} }], "toolUse"), assistant([])];
		markEmptyTurnFailed(withText); markEmptyTurnFailed(afterTool);
		assert.equal((withText[0] as unknown as { stopReason: string }).stopReason, "stop");
		assert.equal((afterTool[1] as unknown as { stopReason: string }).stopReason, "stop");
	});
});
