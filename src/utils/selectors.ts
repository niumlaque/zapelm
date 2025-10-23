const MAX_SELECTOR_DEPTH = 8;

function escapeIdent(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function segmentFor(element: Element): string {
  const tag = element.tagName.toLowerCase();

  if (element.id) {
    return `${tag}#${escapeIdent(element.id)}`;
  }

  const classNames = Array.from(element.classList)
    .filter(Boolean)
    .slice(0, 3)
    .map((name) => `.${escapeIdent(name)}`)
    .join("");

  let segment = `${tag}${classNames}`;

  const parent = element.parentElement;
  if (!parent) {
    return segment;
  }

  const siblings = Array.from(parent.children).filter(
    (node) => node.tagName === element.tagName,
  );

  if (siblings.length > 1) {
    const index = siblings.indexOf(element) + 1;
    segment += `:nth-of-type(${index})`;
  }

  return segment;
}

export function buildSelector(
  element: Element,
  root: Document | Element = document,
): string {
  if (element instanceof Document || element instanceof ShadowRoot) {
    throw new Error("Cannot build selector for document or shadow root nodes.");
  }

  if (element.id) {
    return `#${escapeIdent(element.id)}`;
  }

  const segments: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < MAX_SELECTOR_DEPTH) {
    segments.unshift(segmentFor(current));
    depth += 1;

    const selector = segments.join(" > ");
    if (isUniqueSelector(selector, root)) {
      return selector;
    }

    current = current.parentElement;
  }

  return segments.join(" > ");
}

function isUniqueSelector(selector: string, root: Document | Element): boolean {
  try {
    const matches = root.querySelectorAll(selector);
    return matches.length === 1;
  } catch {
    return false;
  }
}
