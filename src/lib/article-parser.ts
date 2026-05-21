export type ImagePrompt = {
  number: number;
  text: string;
  originalLine: string;
};

export function extractImagePrompts(markdown: string): ImagePrompt[] {
  const prompts: ImagePrompt[] = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    // Match BOTH "[Image Prompt N]" and "[Section Image Prompt N]" formats.
    const m = line.match(/^\s*\[(?:Section\s+)?Image Prompt\s*(\d+)\]\s*(.+)$/i);
    if (m) {
      prompts.push({
        number: parseInt(m[1], 10),
        text: m[2].trim(),
        originalLine: line,
      });
    }
  }
  return prompts.sort((a, b) => a.number - b.number);
}

export function replaceImagePromptWithImg(
  markdown: string,
  promptNumber: number,
  imgUrl: string,
  altText: string
): string {
  // Match BOTH "[Image Prompt N]" and "[Section Image Prompt N]" variants.
  const re = new RegExp(
    `^\\s*\\[(?:Section\\s+)?Image Prompt\\s*${promptNumber}\\].*$`,
    "im"
  );
  return markdown.replace(re, `![${altText}](${imgUrl})`);
}

/**
 * Extract the special "[Cover Image Prompt]" line content used for Pinterest
 * pin/cover images. Returns the prompt text or null if not found.
 */
export function extractCoverImagePrompt(markdown: string): string | null {
  const lines = markdown.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*\[Cover Image Prompt\]\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Strip the "[Cover Image Prompt] ..." line from markdown so it does not
 * appear in the final article body.
 */
export function removeCoverImagePromptLine(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => !/^\s*\[Cover Image Prompt\]\s*.+$/i.test(line))
    .join("\n");
}

/**
 * Find the nearest H2/H3 heading PRECEDING a given image prompt in the
 * markdown body. Used to build richer alt text like `"<heading>: <prompt>"`
 * for Pinterest section images — including the H2 context measurably
 * helps Pinterest's accessibility-driven ranking.
 *
 * Returns the heading text (without the leading `##` / `###`) or null
 * if no heading exists above this prompt.
 */
export function findSectionHeadingForImagePrompt(
  markdown: string,
  promptNumber: number
): string | null {
  const lines = markdown.split("\n");
  let lastHeading: string | null = null;
  const promptRe = new RegExp(
    `^\\s*\\[(?:Section\\s+)?Image Prompt\\s*${promptNumber}\\]`,
    "i"
  );
  for (const line of lines) {
    // ## Heading  or  ### Heading  — capture text after the marker.
    const headingMatch = line.match(/^\s*#{2,3}\s+(.+?)\s*$/);
    if (headingMatch) {
      lastHeading = headingMatch[1].trim();
      continue;
    }
    if (promptRe.test(line)) return lastHeading;
  }
  return null;
}

export function extractItemCountFromTitle(title: string): number {
  const m = title.match(/\b(\d+)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 5 && n <= 100) return n;
  }
  return 10;
}
