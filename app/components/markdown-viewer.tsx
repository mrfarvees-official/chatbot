import type { ElementType, ReactNode } from "react";

type DiagramNode = { id: string; label: string };
type DiagramEdge = { from: string; to: string; label?: string };

function safeUrl(value: string, image = false) {
  try {
    const url = new URL(value, "https://invalid.local");
    if (url.origin === "https://invalid.local" && !value.startsWith("/")) return null;
    if (!image && ["http:", "https:", "mailto:"].includes(url.protocol)) return value;
    if (image && ["http:", "https:"].includes(url.protocol)) return value;
  } catch {}
  return null;
}

function inline(value: string): ReactNode[] {
  const pattern = /(!?\[[^\]]*\]\([^)]*\)|https?:\/\/[^\s<]+|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_)/g;
  const parts = value.split(pattern).filter(Boolean);
  return parts.map((part, index) => {
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
    if (image) {
      const src = safeUrl(image[2].trim(), true);
      return src ? <img key={index} src={src} alt={image[1]} loading="lazy" className="my-2 max-h-80 max-w-full rounded-xl border border-[#30303a]" /> : <span key={index}>{part}</span>; // eslint-disable-line @next/next/no-img-element
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = safeUrl(link[2].trim());
      return href ? <a key={index} href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline underline-offset-2 hover:text-blue-300">{link[1]}</a> : <span key={index}>{link[1]}</span>;
    }
    if (/^https?:\/\//.test(part)) {
      const href = safeUrl(part);
      return href ? <a key={index} href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline underline-offset-2 hover:text-blue-300">{part}</a> : <span key={index}>{part}</span>;
    }
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-[#25252d] px-1.5 py-0.5 text-[0.9em] text-[#e5e7eb]">{part.slice(1, -1)}</code>;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <del key={index}>{part.slice(2, -2)}</del>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={index}>{part.slice(1, -1)}</em>;
    return <span key={index}>{part}</span>;
  });
}

function parseNode(value: string): DiagramNode | null {
  const match = /^([\w-]+)(?:\[(.*?)\]|\{(.*?)\}|\(\((.*?)\)\)|\((.*?)\))?$/.exec(value.trim());
  if (!match) return null;
  return { id: match[1], label: (match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[1]).trim() };
}

function FlowDiagram({ source }: { source: string }) {
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || /^(flowchart|graph|classDef|class |subgraph|end|style )/i.test(line)) continue;
    const edge = /^(.+?)\s+(?:-->|---|-.->)(?:\|([^|]+)\|)?\s+(.+)$/.exec(line);
    if (edge) {
      const from = parseNode(edge[1]);
      const to = parseNode(edge[3]);
      if (from && to) {
        nodes.set(from.id, from); nodes.set(to.id, to);
        edges.push({ from: from.id, to: to.id, label: edge[2]?.trim() });
      }
    } else {
      const node = parseNode(line);
      if (node) nodes.set(node.id, node);
    }
  }
  const list = [...nodes.values()];
  if (!list.length) return <pre className="overflow-x-auto rounded-xl bg-[#111116] p-4 text-xs text-[#a6a6b1]">{source}</pre>;
  const horizontal = /\b(?:LR|RL)\b/i.test(source);
  const width = horizontal ? Math.max(520, list.length * 190) : 620;
  const height = horizontal ? 150 : Math.max(170, list.length * 100);
  const positions = new Map(list.map((node, index) => [node.id, horizontal ? { x: 40 + index * 180, y: 52 } : { x: 180, y: 30 + index * 90 }]));
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Flowchart diagram" className="my-3 h-auto max-h-[28rem] w-full rounded-xl border border-[#30303a] bg-[#111116] p-3">
    <defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#60a5fa" /></marker></defs>
    {edges.map((edge, index) => { const from = positions.get(edge.from)!; const to = positions.get(edge.to)!; const x1 = horizontal ? from.x + 150 : from.x + 75; const y1 = horizontal ? from.y + 24 : from.y + 48; const x2 = horizontal ? to.x : to.x + 75; const y2 = horizontal ? to.y + 24 : to.y; return <g key={index}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#60a5fa" strokeWidth="2" markerEnd="url(#arrowhead)" />{edge.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} fill="#a6a6b1" fontSize="12" textAnchor="middle">{edge.label}</text>}</g>; })}
    {list.map((node) => { const position = positions.get(node.id)!; return <g key={node.id}><rect x={position.x} y={position.y} width="150" height="48" rx="12" fill="#1b1b23" stroke="#4b5563" /><text x={position.x + 75} y={position.y + 29} fill="#f4f4f5" fontSize="13" textAnchor="middle">{node.label.slice(0, 24)}</text></g>; })}
  </svg>;
}

function SequenceDiagram({ source }: { source: string }) {
  const rows = source.split("\n").map((line) => /^\s*([\w-]+)\s*-{1,2}>+\s*([\w-]+)\s*:\s*(.+)$/.exec(line)).filter(Boolean) as RegExpExecArray[];
  const actors = [...new Set(rows.flatMap((row) => [row[1], row[2]]))];
  if (!rows.length || actors.length < 2) return <FlowDiagram source={source} />;
  const positions = new Map(actors.map((actor, index) => [actor, 100 + index * 180]));
  return <svg viewBox={`0 0 ${Math.max(520, actors.length * 180)} ${Math.max(180, rows.length * 65 + 70)}`} role="img" aria-label="Sequence diagram" className="my-3 h-auto max-h-[28rem] w-full rounded-xl border border-[#30303a] bg-[#111116] p-3">
    <defs><marker id="sequence-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#60a5fa" /></marker></defs>
    {actors.map((actor) => <g key={actor}><text x={positions.get(actor)} y="24" fill="#f4f4f5" fontSize="13" textAnchor="middle">{actor}</text><line x1={positions.get(actor)} y1="34" x2={positions.get(actor)} y2={rows.length * 65 + 55} stroke="#3f3f4a" strokeDasharray="5 5" /></g>)}
    {rows.map((row, index) => { const y = 65 + index * 65; const x1 = positions.get(row[1])!; const x2 = positions.get(row[2])!; return <g key={index}><line x1={x1} y1={y} x2={x2} y2={y} stroke="#60a5fa" markerEnd="url(#sequence-arrowhead)" /><text x={(x1 + x2) / 2} y={y - 8} fill="#a6a6b1" fontSize="12" textAnchor="middle">{row[3].slice(0, 42)}</text></g>; })}
  </svg>;
}

function Diagram({ source }: { source: string }) {
  return /(^|\n)\s*sequenceDiagram\b/i.test(source) ? <SequenceDiagram source={source} /> : <FlowDiagram source={source} />;
}

function isBlockStart(line: string) {
  return /^(#{1,6}\s|```|>\s|[-*+]\s|\d+[.)]\s|---+$|\|.*\|)/.test(line);
}

export function MarkdownViewer({ content }: { content: string }) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = /^```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = []; index++;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      index++;
      blocks.push(fence[1].toLowerCase() === "mermaid" || /^(flowchart|graph|sequenceDiagram)\b/i.test(code.join("\n"))
        ? <Diagram key={blocks.length} source={code.join("\n")} />
        : <pre key={blocks.length} className="my-3 overflow-x-auto rounded-xl border border-[#30303a] bg-[#111116] p-4 text-xs leading-5 text-[#d4d4dc]"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { const Tag = `h${heading[1].length}` as ElementType; blocks.push(<Tag key={blocks.length} className="mt-4 mb-2 text-lg font-semibold text-[#fff]">{inline(heading[2])}</Tag>); index++; continue; }
    if (/^([-*+]\s)/.test(line)) {
      const items: string[] = []; while (index < lines.length && /^[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^[-*+]\s+/, ""));
      blocks.push(<ul key={blocks.length} className="my-2 list-disc space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>); continue;
    }
    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = []; while (index < lines.length && /^\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\d+[.)]\s+/, ""));
      blocks.push(<ol key={blocks.length} className="my-2 list-decimal space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ol>); continue;
    }
    if (/^>\s?/.test(line)) { const quote: string[] = []; while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, "")); blocks.push(<blockquote key={blocks.length} className="my-3 border-l-2 border-blue-400 pl-4 text-[#b5b5c0]">{quote.map((item, itemIndex) => <p key={itemIndex}>{inline(item)}</p>)}</blockquote>); continue; }
    if (/^---+$/.test(line)) { blocks.push(<hr key={blocks.length} className="my-4 border-[#30303a]" />); index++; continue; }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const headers = line.split("|").map((cell) => cell.trim()).filter(Boolean); index += 2; const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|")) { rows.push(lines[index++].split("|").map((cell) => cell.trim()).filter(Boolean)); }
      blocks.push(<div key={blocks.length} className="my-3 overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm"><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex} className="border border-[#30303a] bg-[#17171d] px-3 py-2 font-semibold">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex} className="border border-[#30303a] px-3 py-2 text-[#c4c4ce]">{inline(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const paragraph: string[] = [line]; index++;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={blocks.length} className="my-2 whitespace-pre-wrap leading-6">{inline(paragraph.join("\n"))}</p>);
  }
  return <div className="markdown-viewer text-[15px] text-[#ededf2]">{blocks}</div>;
}
