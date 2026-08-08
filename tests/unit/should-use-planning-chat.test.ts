import { describe, expect, it } from "vitest";
import { shouldUsePlanningChat } from "@/lib/ai/should-use-planning-chat";

describe("shouldUsePlanningChat", () => {
  it("uses deep-search when nothing is focused", () => {
    expect(shouldUsePlanningChat("Summarise this application", false)).toBe(
      false,
    );
  });

  it("uses chat for follow-ups when a case is focused", () => {
    expect(
      shouldUsePlanningChat("Summarise this application in plain English.", true),
    ).toBe(true);
  });

  it("prefers deep-search for new spatial prompts even when focused", () => {
    expect(
      shouldUsePlanningChat(
        "Approved residential extensions in Brixton since 2023",
        true,
      ),
    ).toBe(false);
  });
});
