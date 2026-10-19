import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("splits a very long paragraph", () => {
    const chunks = chunkText("word ".repeat(100), 40, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
  });

  it("prepends Markdown headings to their section chunks", () => {
    const chunks = chunkText(
      "# About\n\n" + "Owner information. ".repeat(80) + "\n\n# Work\n\nProjects.",
      80,
    );
    expect(chunks.filter((chunk) => chunk.startsWith("# About")).length).toBeGreaterThan(1);
    expect(chunks.at(-1)).toContain("# Work");
  });

  it("does not start overlap in the middle of a word", () => {
    const chunks = chunkText("First paragraph has enough words here.\n\nSecond paragraph follows.", 40, 15);
    expect(chunks[1]).not.toMatch(/^\w*irst|^\w*econd/);
  });
});
