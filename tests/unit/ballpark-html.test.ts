import { BALLPARK_DISCLAIMER } from "@/lib/pipeline-shared";
import { describe, expect, it } from "vitest";
import {
  injectBallparkIntoHtml,
  replaceBallparkInHtml,
  stripBallparkFromHtml,
} from "@/lib/ballpark-html";

describe("ballpark html helpers", () => {
  it("injects a disclaimer paragraph before the last paragraph", () => {
    const html =
      "<p>Hello</p><p>Please reply if interested.</p>";
    const next = injectBallparkIntoHtml(html, {
      minGbp: 10000,
      maxGbp: 20000,
      weeks: 4,
    });
    expect(next).toContain("£10,000");
    expect(next).toContain("£20,000");
    expect(next).toContain(BALLPARK_DISCLAIMER);
    expect(next.indexOf("indicative ballpark")).toBeLessThan(
      next.indexOf("Please reply"),
    );
  });

  it("replace updates figures when a ballpark already exists", () => {
    const first = injectBallparkIntoHtml("<p>Intro</p><p>Opt out</p>", {
      minGbp: 10000,
      maxGbp: 20000,
      weeks: 4,
    });
    const second = replaceBallparkInHtml(first, {
      minGbp: 30000,
      maxGbp: 40000,
      weeks: 6,
    });
    expect(second).toContain("£30,000");
    expect(second).not.toContain("£10,000");
    expect(second).toContain(BALLPARK_DISCLAIMER);
  });

  it("strip removes the ballpark paragraph", () => {
    const withBp = injectBallparkIntoHtml("<p>Intro</p><p>Opt out</p>", {
      minGbp: 10000,
      maxGbp: 20000,
      weeks: 4,
    });
    const stripped = stripBallparkFromHtml(withBp);
    expect(stripped).not.toContain(BALLPARK_DISCLAIMER);
    expect(stripped).toContain("Intro");
    expect(stripped).toContain("Opt out");
  });
});
