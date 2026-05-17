export type ImagePrompt = {
  number: number;
  text: string;
  originalLine: string;
};

export function extractImagePrompts(markdown: string): ImagePrompt[] {
  const prompts: ImagePrompt[] = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*\[Image Prompt\s*(\d+)\]\s*(.+)$/i);
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
  const re = new RegExp(
    `^\\s*\\[Image Prompt\\s*${promptNumber}\\].*$`,
    "im"
  );
  return markdown.replace(re, `![${altText}](${imgUrl})`);
}

export function extractItemCountFromTitle(title: string): number {
  const m = title.match(/\b(\d+)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 5 && n <= 100) return n;
  }
  return 10;
}
