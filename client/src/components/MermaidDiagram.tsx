import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "var(--font-sans, system-ui)",
  flowchart: {
    curve: "linear",       // straight edges, matching the standalone docs
    nodeSpacing: 50,
    rankSpacing: 60,
    padding: 16,
    htmlLabels: true,
    useMaxWidth: true,
  },
});

let counter = 0;

// LLM-generated diagrams routinely put a literal "\n" inside node labels for a
// line break, which Mermaid flowchart/sequence syntax does not honor (it wants
// <br/>). Normalize those so otherwise-valid diagrams render instead of failing.
function normalize(source: string): string {
  return source.replace(/\\n/g, "<br/>");
}

// Renders a Mermaid diagram from source. Falls back to the raw source in a
// code block if the diagram fails to parse, so a bad diagram never blanks the page.
export function MermaidDiagram({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${counter++}`;
    mermaid
      .render(id, normalize(source))
      .then(({ svg }) => {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to render diagram");
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return (
      <div className="mermaid-fallback">
        <p className="mermaid-error">Diagram could not render — showing source:</p>
        <pre className="mermaid-source">{source}</pre>
      </div>
    );
  }

  return <div className="mermaid-diagram" ref={ref} />;
}
