import { describe, expect, it } from "vitest";
import { BedrockAnalysisProvider, parseModelJson } from "../src/providers/bedrock-analysis-provider.js";

const analysis = { themes: ["Venue"], suggestions: ["Book early"], actionItems: [{ text: "Book cabin", priority: "high" }] };

function providerReplying(text) {
  const client = {
    async send() {
      return {
        output: { message: { content: [{ text }] } },
        usage: { inputTokens: 120, outputTokens: 45 },
      };
    },
  };
  return new BedrockAnalysisProvider({ region: "us-east-1", modelId: "test-model", client });
}

describe("BedrockAnalysisProvider", () => {
  it("parses a bare JSON reply and records token usage", async () => {
    const result = await providerReplying(JSON.stringify(analysis)).analyze({ prompt: "p" });

    expect(result).toEqual({ ...analysis, tokenUsage: { input: 120, output: 45 } });
  });

  it("accepts JSON wrapped in a markdown fence with a lead-in", async () => {
    const reply = `Here is the analysis:\n\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``;
    const result = await providerReplying(reply).analyze({ prompt: "p" });

    expect(result.themes).toEqual(["Venue"]);
  });

  it("reports non-JSON replies as an invalid AI response", () => {
    expect(() => parseModelJson("I cannot help with that.")).toThrow(
      expect.objectContaining({ code: "AI_INVALID_RESPONSE", status: 502 }),
    );
    expect(() => parseModelJson(undefined)).toThrow(
      expect.objectContaining({ code: "AI_INVALID_RESPONSE" }),
    );
  });
});
