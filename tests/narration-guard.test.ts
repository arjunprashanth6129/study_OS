/** Narration guard: synthetic fixtures only; no provider calls or captures. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QUESTION_TOOLS } from "../src/core/pending.ts";
import {
	isCliConvertedProse, isNarrationBlock, makeNarrationGuard, narrationGuardApplies, NARRATION_BLOCK_REASON,
	NARRATION_GUARD_MAX_BLOCKS, SEND_TO_USER_DELIVERY_RULE, UNDELIVERED_BLOCK_REASON,
} from "../src/agent/narration-guard.ts";
import { sendToUserApplies } from "../src/agent/tools/send-to-user.ts";

// A synthetic signature with the proposed marker in the opaque header.
// This fixture exercises the heuristic, not a documented provider format.
const sig = (type: string) => Buffer.from(`\x08\x04\x12\x10\n\x11\x08\x13\x18\x028\x01B\t${type}\x12\x0cpayload`).toString("base64");
const thinking = (type: string) => ({ type: "thinking", thinking: "", thinkingSignature: sig(type) });
const quiz = { type: "toolCall", id: "t1", name: "quiz", arguments: {} };
const output = (message: unknown = "A complete synthetic explanation.") => ({
	type: "toolCall", id: "s", name: "send_to_user", arguments: { message },
});
const msg = (...content: unknown[]) => ({ role: "assistant", content }) as never;
const ask = (g: ReturnType<typeof makeNarrationGuard>, m: never, name = "quiz") =>
	g.beforeToolCall!({ assistantMessage: m, toolCall: { ...quiz, name } } as never);
const delivered = (g: ReturnType<typeof makeNarrationGuard>, m: never, call = output(), isError = false, resultError = isError) =>
	g.afterToolCall!({ assistantMessage: m, toolCall: call, isError, result: { isError: resultError } } as never);

describe("narrationGuardApplies", () => {
	for (const [provider, id, enabled] of [
		["anthropic", "claude-sonnet-5-5", true],
		["anthropic", "claude-haiku-5-5", true],
		["openrouter", "anthropic/claude-opus-5.5", true],
		["amazon-bedrock", "us.anthropic.claude-opus-5-5-v1:0", true],
		["fixture", "CLAUDE-fixture", true],
		["claude-code", "opus", true],
		["openai", "gpt-4o-mini", false],
		["anthropic", "opaque-alias", false],
	] as const) {
		it(`${provider}/${id}: shares the tool's gate, with teacher-only enforcement`, () => {
			const model = { provider, id };
			for (const kind of ["teacher", "prober", "practice"]) {
				assert.equal(sendToUserApplies(kind, model, false), enabled && kind !== "practice");
				assert.equal(narrationGuardApplies(kind, model, false), enabled && kind === "teacher");
				assert.equal(sendToUserApplies(kind, model, true), false);
				assert.equal(narrationGuardApplies(kind, model, true), false);
			}
		});
	}
	it("pins the approved delivery and retry wording", () => {
		assert.equal(SEND_TO_USER_DELIVERY_RULE, "## Delivering your prose\n\nDeliver learner-facing prose through `send_to_user`; ordinary response text may be converted into summarized thinking instead of reaching the learner. Send the complete explanation, example, or commentary before calling the accompanying question tool. Question-only turns do not require an extra message. A question whose response contains narration but no delivered prose may be rejected so you can deliver the missing explanation and retry.");
		assert.equal(NARRATION_BLOCK_REASON, "This response contains narration but no delivered learner-facing prose. Write the explanation or commentary the learner needs through `send_to_user`, then retry this question. Deliver learner-facing content, not internal reasoning.");
	});
});

describe("isNarrationBlock", () => {
	it("only recognizes the marker in a thinking signature's first 60 decoded bytes", () => {
		assert.equal(isNarrationBlock(thinking("narration")), true);
		for (const block of [
			thinking("thinking"),
			{ type: "thinking" },
			{ type: "thinking", thinkingSignature: "%%%" },
			{ type: "text", thinkingSignature: sig("narration") },
			{ type: "thinking", thinkingSignature: Buffer.from("x".repeat(60) + "narration").toString("base64") },
		]) assert.equal(isNarrationBlock(block), false);
	});
});

describe("makeNarrationGuard", () => {
	for (const name of QUESTION_TOOLS) {
		it(`blocks ${name} when narration has no learner-facing delivery`, async () => {
			const r = await ask(makeNarrationGuard(), msg(thinking("thinking"), thinking("narration"), quiz), name);
			assert.equal(r?.block, true);
			assert.equal(r?.reason, NARRATION_BLOCK_REASON);
		});
	}
	it("allows ordinary text, plain thinking, and legitimate question-only turns", async () => {
		const g = makeNarrationGuard();
		assert.equal(await ask(g, msg(thinking("narration"), { type: "text", text: "Hello" }, quiz)), undefined);
		assert.equal(await ask(g, msg(thinking("thinking"), quiz)), undefined);
		assert.equal(await ask(g, msg(quiz)), undefined);
	});
	it("does not treat blank ordinary text as delivered prose", async () => {
		assert.equal((await ask(makeNarrationGuard(), msg(thinking("narration"), { type: "text", text: " \n " }, quiz)))?.block, true);
	});
	it("requires successful output execution, not mere call presence", async () => {
		const g = makeNarrationGuard();
		const m = msg(thinking("narration"), output(), quiz);
		assert.equal((await ask(g, m))?.block, true, "a pending or later output call is not delivery");
		await delivered(g, m);
		assert.equal(await ask(g, m), undefined);
	});
	for (const [isError, resultError] of [[true, true], [true, false], [false, true]]) {
		it(`does not credit failed output (${isError}/${resultError})`, async () => {
			const g = makeNarrationGuard();
			const m = msg(thinking("narration"), output(), quiz);
			await delivered(g, m, output(), isError, resultError);
			assert.equal((await ask(g, m))?.block, true);
		});
	}
	for (const value of ["", " \n\t", 42, null]) {
		it(`does not credit unusable output ${JSON.stringify(value)}`, async () => {
			const g = makeNarrationGuard();
			const m = msg(thinking("narration"), output(value), quiz);
			await delivered(g, m, output(value));
			assert.equal((await ask(g, m))?.block, true);
		});
	}
	it("does not credit successful delivery from another assistant response", async () => {
		const g = makeNarrationGuard();
		await delivered(g, msg(output()));
		assert.equal((await ask(g, msg(thinking("narration"), quiz)))?.block, true);
	});
	it("ignores non-question tools without consuming the block budget", async () => {
		const g = makeNarrationGuard();
		const m = msg(thinking("narration"), quiz);
		assert.equal(await ask(g, m, "read"), undefined);
		for (let i = 0; i < NARRATION_GUARD_MAX_BLOCKS; i++) assert.equal((await ask(g, m))?.block, true);
		assert.equal(await ask(g, m), undefined);
	});
	it("counts blocks across responses in one run, but resets for a new agent run", async () => {
		const g = makeNarrationGuard();
		for (let i = 0; i < NARRATION_GUARD_MAX_BLOCKS; i++) {
			assert.equal((await ask(g, msg(thinking("narration"), quiz)))?.block, true);
		}
		assert.equal(await ask(g, msg(thinking("narration"), quiz)), undefined);
		assert.equal((await ask(makeNarrationGuard(), msg(thinking("narration"), quiz)))?.block, true);
	});
});

// The CLI stream has no thinking signatures and publishes each admitted tool
// call as its own assistant message, so delivery is credited per run.
describe("makeNarrationGuard on the Claude Code CLI", () => {
	const cli = (...content: unknown[]) => ({ role: "assistant", provider: "claude-code", content }) as never;
	const unsigned = (text = "") => ({ type: "thinking", thinking: text });
	const posed = (g: ReturnType<typeof makeNarrationGuard>, m: never, name = "quiz") =>
		g.afterToolCall!({ assistantMessage: m, toolCall: { ...quiz, name }, isError: false, result: { isError: false } } as never);

	// The observed shape of a swallowed explanation: empty reasoning, then the converted prose's summary.
	const swallowed = () => cli(unsigned(), unsigned("A summary of prose the learner never saw."), quiz);

	for (const name of QUESTION_TOOLS) {
		it(`blocks ${name} when the response's prose was converted and nothing was delivered`, async () => {
			const r = await ask(makeNarrationGuard(), swallowed(), name);
			assert.equal(r?.block, true);
			assert.equal(r?.reason, UNDELIVERED_BLOCK_REASON);
		});
	}
	it("recognizes only unsigned, non-blank thinking as converted prose", () => {
		assert.equal(isCliConvertedProse(unsigned("summary")), true);
		for (const block of [unsigned(), unsigned(" \n"), thinking("narration"), { type: "text", thinking: "summary" }, { type: "thinking" }]) {
			assert.equal(isCliConvertedProse(block as never), false);
		}
	});
	it("allows legitimate question-only turns and empty reasoning", async () => {
		assert.equal(await ask(makeNarrationGuard(), cli(quiz)), undefined);
		assert.equal(await ask(makeNarrationGuard(), cli(unsigned(), quiz)), undefined);
	});
	it("allows a question after text in the same response, but not blank text", async () => {
		assert.equal(await ask(makeNarrationGuard(), cli(unsigned(), unsigned("summary"), { type: "text", text: "The step, explained." }, quiz)), undefined);
		assert.equal((await ask(makeNarrationGuard(), cli(unsigned("summary"), { type: "text", text: " \n " }, quiz)))?.block, true);
	});
	it("credits send_to_user delivered in an earlier response of the same run", async () => {
		const g = makeNarrationGuard();
		await delivered(g, cli(output()));
		assert.equal(await ask(g, swallowed()), undefined);
	});
	it("does not credit failed or unusable output", async () => {
		const g = makeNarrationGuard();
		await delivered(g, cli(output()), output(), true);
		await delivered(g, cli(output("  ")), output("  "));
		assert.equal((await ask(g, swallowed()))?.block, true);
	});
	it("a posed question consumes the credit", async () => {
		const g = makeNarrationGuard();
		await delivered(g, cli(output()));
		const first = cli(quiz);
		assert.equal(await ask(g, first), undefined);
		await posed(g, first);
		assert.equal((await ask(g, swallowed()))?.block, true);
	});
	it("ignores non-question tools and stops blocking at the run budget", async () => {
		const g = makeNarrationGuard();
		assert.equal(await ask(g, swallowed(), "plan_init"), undefined);
		for (let i = 0; i < NARRATION_GUARD_MAX_BLOCKS; i++) assert.equal((await ask(g, swallowed()))?.block, true);
		assert.equal(await ask(g, swallowed()), undefined);
	});
	it("leaves other providers on the signature heuristic", async () => {
		assert.equal(await ask(makeNarrationGuard(), msg(unsigned("unsigned"), quiz)), undefined);
	});
});
