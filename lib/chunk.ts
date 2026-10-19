function splitLong(p: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of p.split(/(?<=[.!?])\s+/)) {
    if (s.length > max) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
    } else if (cur && cur.length + s.length + 1 > max) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function chunkText(text: string, max = 900, overlap = 150): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const hasMarkdownHeading = normalized
    .split("\n")
    .some((line) => /^#{1,6}\s+\S/.test(line.trim()));

  if (hasMarkdownHeading) {
    const sections: { heading: string; body: string }[] = [];
    let heading = "";
    let lines: string[] = [];
    const flush = () => {
      const body = lines.join("\n").trim();
      if (body) sections.push({ heading, body });
      lines = [];
    };
    for (const line of normalized.split("\n")) {
      const trimmed = line.trim();
      const match = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (match) {
        flush();
        heading = trimmed;
      } else if (trimmed) {
        lines.push(trimmed);
      } else {
        flush();
      }
    }
    flush();
    return sections.flatMap(({ heading: prefix, body }) => {
      const context = prefix ? `${prefix}\n\n` : "";
      const available = Math.max(1, max - context.length);
      return splitLong(body, available).map((piece) => `${context}${piece}`.trim());
    });
  }

  const paras = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };

  for (const p of paras) {
    if (p.length > max) {
      flush();
      chunks.push(...splitLong(p, max));
    } else if (cur && cur.length + p.length + 2 > max) {
      const tail = cur.slice(-overlap);
      const clean = tail.slice(tail.indexOf(" ") + 1); // don't start mid-word
      flush();
      cur = `${clean}\n\n${p}`;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  flush();
  return chunks;
}
