export function renderTemplate(
  template: string,
  vars: Record<string, unknown>
): string {
  let result = template;

  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key: string, inner: string) => {
      const val = vars[key];
      if (!val) return "";
      if (Array.isArray(val)) {
        return val
          .map((item: unknown) => {
            if (typeof item === "object" && item !== null) {
              return renderTemplate(inner, item as Record<string, unknown>);
            }
            return inner.replace(/\{\{\.\}\}/g, String(item));
          })
          .join("");
      }
      if (val) {
        return renderTemplate(inner, vars);
      }
      return "";
    }
  );

  result = result.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined && val !== null ? String(val) : "";
  });

  return result;
}
