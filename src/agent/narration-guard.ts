import type { ToolCallHooks } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { QUESTION_TOOLS } from "../core/pending.ts";
import { SEND_TO_USER_TOOL, sendToUserText } from "../core/native-messages.ts";
import { sendToUserApplies } from "./tools/send-to-user.ts";
import { CLAUDE_CODE_PROVIDER } from "./claude-code/constants.ts";

export const NARRATION_GUARD_MAX_BLOCKS = 2;

export const NARRATION_BLOCK_REASON =
	"This response contains narration but no delivered learner-facing prose. Write the explanation or commentary the learner needs through `send_to_user`, then retry this question. Deliver learner-facing content, not internal reasoning.";

export const SEND_TO_USER_DELIVERY_RULE =
	"## Delivering your prose\n\n" +
	"Deliver learner-facing prose through `send_to_user`; ordinary response text may be converted into summarized thinking instead of reaching the learner. " +
	"Send the complete explanation, example, or commentary before calling the accompanying question tool. " +
	"Question-only turns do not require an extra message. " +
	"A question whose response contains narration but no delivered prose may be rejected so you can deliver the missing explanation and retry.";

export function narrationGuardApplies(
	kind: string,
	model: { provider: string; id: string },
	toolsOverridden: boolean,
): boolean {
	return kind === "teacher" && sendToUserApplies(kind, model, toolsOverridden);
}

export function isNarrationBlock(block: { type: string; thinkingSignature?: string }): boolean {
	if (block.type !== "thinking" || typeof block.thinkingSignature !== "string") return false;
	try {
		return Buffer.from(block.thinkingSignature, "base64").subarray(0, 60).includes("narration");
	} catch {
		return false;
	}
}

export function questionLacksDeliveredProse(message: AssistantMessage, toolName: string, delivered = false): boolean {
	if (!(QUESTION_TOOLS as readonly string[]).includes(toolName)) return false;
	if (!message.content.some(isNarrationBlock as (b: AssistantMessage["content"][number]) => boolean)) return false;
	return !delivered && !message.content.some((b) => b.type === "text" && b.text.trim().length > 0);
}

/** The Claude Code CLI stream carries no thinking signatures, so the marker
 * heuristic above can never fire there. Observed on that provider: genuine
 * reasoning arrives as an EMPTY thinking block, while prose converted into
 * thinking arrives as an unsigned thinking block carrying its summary. A
 * question whose response holds such a block, with nothing delivered, went
 * out bare. The CLI adapter publishes each admitted tool call as its own
 * assistant message, so delivery is credited per run (until the next posed
 * question), not per response. Legitimate question-only turns still pass. */
export const UNDELIVERED_BLOCK_REASON =
	"The explanation you wrote in this response did not reach the learner: on this connection ordinary response text is converted into hidden reasoning. " +
	"Send your complete reply through `send_to_user` first: respond to the learner's last answer and thinking (what was right, what was wrong and exactly why), " +
	"then give the full teaching for this step. Then retry this question.";

function isQuestionTool(toolName: string): boolean {
	return (QUESTION_TOOLS as readonly string[]).includes(toolName);
}

export function isCliConvertedProse(block: { type: string; thinking?: string; thinkingSignature?: string }): boolean {
	return block.type === "thinking" && typeof block.thinkingSignature !== "string"
		&& typeof block.thinking === "string" && block.thinking.trim().length > 0;
}

function hasDeliveredText(message: AssistantMessage): boolean {
	return message.content.some((b) => b.type === "text" && b.text.trim().length > 0);
}

export function makeNarrationGuard(): ToolCallHooks {
	let blocked = 0;
	// The sequential output/question tools run in call order. Credit only a
	// successful output already executed for THIS response, never a later
	// call, an older lesson, or a failed/aborted output. State is run-local.
	const delivered = new WeakSet<AssistantMessage>();
	// Claude Code CLI only: prose delivered in this run since the last posed question.
	let deliveredInRun = false;
	return {
		beforeToolCall: async ({ assistantMessage, toolCall }) => {
			if (hasDeliveredText(assistantMessage)) deliveredInRun = true;
			if (blocked >= NARRATION_GUARD_MAX_BLOCKS) return undefined;
			const viaCli = assistantMessage.provider === CLAUDE_CODE_PROVIDER;
			if (questionLacksDeliveredProse(assistantMessage, toolCall.name, delivered.has(assistantMessage) || (viaCli && deliveredInRun))) {
				blocked++;
				return { block: true, reason: NARRATION_BLOCK_REASON };
			}
			if (viaCli && isQuestionTool(toolCall.name) && !deliveredInRun
				&& assistantMessage.content.some(isCliConvertedProse as (b: AssistantMessage["content"][number]) => boolean)) {
				blocked++;
				return { block: true, reason: UNDELIVERED_BLOCK_REASON };
			}
			return undefined;
		},
		afterToolCall: async ({ assistantMessage, toolCall, result, isError }) => {
			const succeeded = !isError && !result.isError;
			if (toolCall.name === SEND_TO_USER_TOOL && succeeded && sendToUserText(toolCall) !== undefined) {
				delivered.add(assistantMessage);
				deliveredInRun = true;
			}
			// A posed question consumes the credit: the next one needs its own prose.
			if (isQuestionTool(toolCall.name) && succeeded) deliveredInRun = false;
			return undefined;
		},
	};
}
