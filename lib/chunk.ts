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
  const paras = text
    .replace(/\r\n/g, "\n")
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
