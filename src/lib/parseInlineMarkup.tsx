import React from 'react';

/**
 * Parses a string that may contain `<em>` and `<strong>` HTML tags
 * into safe React elements. All other HTML is escaped/rendered as text.
 *
 * @param html  - The raw string (may contain <em>, <strong> tags)
 * @param strongStyle - Optional inline styles to apply to <strong> elements
 */
export function parseInlineMarkup(
  html: string,
  strongStyle?: React.CSSProperties
): React.ReactNode[] {
  // Match only <em>, </em>, <strong>, </strong>
  const TAG_RE = /(<\/?(?:em|strong)>)/gi;
  const parts = html.split(TAG_RE);

  const result: React.ReactNode[] = [];
  const stack: Array<'em' | 'strong'> = [];
  let buffer = '';
  let key = 0;

  function flush() {
    if (!buffer) return;

    let node: React.ReactNode = buffer;

    // Wrap in tags from outermost to innermost
    for (let i = 0; i < stack.length; i++) {
      const tag = stack[i];
      if (tag === 'strong') {
        node = (
          <strong key={`s-${key++}`} style={strongStyle}>
            {node}
          </strong>
        );
      } else {
        node = <em key={`e-${key++}`}>{node}</em>;
      }
    }

    result.push(node);
    buffer = '';
  }

  for (const part of parts) {
    const lower = part.toLowerCase();

    if (lower === '<em>') {
      flush();
      stack.push('em');
    } else if (lower === '</em>') {
      flush();
      // Pop only if matching
      const idx = stack.lastIndexOf('em');
      if (idx !== -1) stack.splice(idx, 1);
    } else if (lower === '<strong>') {
      flush();
      stack.push('strong');
    } else if (lower === '</strong>') {
      flush();
      const idx = stack.lastIndexOf('strong');
      if (idx !== -1) stack.splice(idx, 1);
    } else {
      buffer += part;
    }
  }

  flush();
  return result;
}
