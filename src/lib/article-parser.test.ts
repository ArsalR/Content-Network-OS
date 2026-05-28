import { describe, it, expect } from "vitest";
import {
  extractImagePrompts,
  replaceImagePromptWithImg,
  extractCoverImagePrompt,
  removeCoverImagePromptLine,
  extractItemCountFromTitle,
  findSectionHeadingForImagePrompt,
} from "./article-parser";

describe("extractImagePrompts", () => {
  it("extracts [Image Prompt N] tags in order", () => {
    const md = `Intro line.

[Image Prompt 1] first
[Image Prompt 3] third
[Image Prompt 2] second`;
    const out = extractImagePrompts(md);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.number)).toEqual([1, 2, 3]);
    expect(out[0].text).toBe("first");
  });

  it("also matches [Section Image Prompt N] for Pinterest articles", () => {
    const md = `## 1. Title
[Section Image Prompt 1] body text here`;
    const out = extractImagePrompts(md);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("body text here");
  });

  it("returns [] when no prompts are present", () => {
    expect(extractImagePrompts("just prose")).toEqual([]);
  });
});

describe("replaceImagePromptWithImg", () => {
  it("replaces the line with a markdown image tag", () => {
    const md = "[Image Prompt 1] alt text";
    const out = replaceImagePromptWithImg(md, 1, "https://x.com/y.png", "alt");
    expect(out).toBe("![alt](https://x.com/y.png)");
  });

  it("matches [Section Image Prompt N] too", () => {
    const md = "[Section Image Prompt 1] alt text";
    const out = replaceImagePromptWithImg(md, 1, "https://x.com/y.png", "alt");
    expect(out).toBe("![alt](https://x.com/y.png)");
  });

  it("only replaces the matching prompt number", () => {
    const md = `[Image Prompt 1] first
[Image Prompt 2] second`;
    const out = replaceImagePromptWithImg(md, 2, "URL2", "alt2");
    expect(out).toContain("[Image Prompt 1] first");
    expect(out).toContain("![alt2](URL2)");
    expect(out).not.toContain("[Image Prompt 2]");
  });
});

describe("extractCoverImagePrompt", () => {
  it("returns the cover prompt text", () => {
    const md = `[Cover Image Prompt] a vertical collage of bedrooms
# Title`;
    expect(extractCoverImagePrompt(md)).toBe("a vertical collage of bedrooms");
  });

  it("is case-insensitive", () => {
    expect(extractCoverImagePrompt("[cover image prompt] xxx")).toBe("xxx");
  });

  it("returns null when no cover prompt is present", () => {
    expect(extractCoverImagePrompt("# Title only")).toBeNull();
  });
});

describe("removeCoverImagePromptLine", () => {
  it("removes only the cover prompt line", () => {
    const md = `[Cover Image Prompt] should disappear
# Title
[Image Prompt 1] should stay`;
    const out = removeCoverImagePromptLine(md);
    expect(out).not.toContain("Cover Image Prompt");
    expect(out).toContain("# Title");
    expect(out).toContain("[Image Prompt 1] should stay");
  });
});

describe("findSectionHeadingForImagePrompt", () => {
  const md = `# Article title

Intro paragraph.

## 1. First Section
[Section Image Prompt 1] first photo
First section body.

## 2. Second Section
[Section Image Prompt 2] second photo

### Subheading
[Section Image Prompt 3] uses the nearer subheading`;

  it("returns the H2 preceding the prompt", () => {
    expect(findSectionHeadingForImagePrompt(md, 1)).toBe("1. First Section");
    expect(findSectionHeadingForImagePrompt(md, 2)).toBe("2. Second Section");
  });

  it("prefers the nearer H3 over a more distant H2", () => {
    expect(findSectionHeadingForImagePrompt(md, 3)).toBe("Subheading");
  });

  it("returns null when no heading precedes the prompt", () => {
    const orphan = "[Image Prompt 5] no heading above";
    expect(findSectionHeadingForImagePrompt(orphan, 5)).toBeNull();
  });

  it("returns null for a prompt number that doesn't exist", () => {
    expect(findSectionHeadingForImagePrompt(md, 99)).toBeNull();
  });

  it("ignores ## headings inside fenced code blocks", () => {
    const mdWithFence = `## Real Section

\`\`\`md
## fake heading inside fence
\`\`\`

[Image Prompt 1] should use the real heading`;
    expect(findSectionHeadingForImagePrompt(mdWithFence, 1)).toBe("Real Section");
  });

  it("ignores ## inside tilde-fenced blocks", () => {
    const mdWithFence = `## Real

~~~
## fake
~~~

[Image Prompt 1] x`;
    expect(findSectionHeadingForImagePrompt(mdWithFence, 1)).toBe("Real");
  });
});

describe("extractItemCountFromTitle", () => {
  it.each([
    ["25 DIY Bedroom Ideas", 25],
    ["The 10 best plants for shade", 10],
    ["No number → default", 10], // default is 10 per the implementation
    ["3 small things (too low) → default", 10],
    ["200 ideas (too high) → default", 10],
    ["5 things — boundary low accepted", 5],
    ["100 things — boundary high accepted", 100],
  ])("%s", (title, expected) => {
    expect(extractItemCountFromTitle(title)).toBe(expected);
  });
});
