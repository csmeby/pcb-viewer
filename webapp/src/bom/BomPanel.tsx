import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { buildBom, type BomRow } from "./buildBom";

type LoadState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ready"; rows: BomRow[] }
  | { status: "error"; message: string };

export function BomPanel() {
  const { fileSystem } = useProjectStore();
  const [state, setState] = useState<LoadState>({ status: "empty" });

  useEffect(() => {
    if (!fileSystem) {
      setState({ status: "empty" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    buildBom(fileSystem)
      .then((rows) => {
        if (!cancelled) {
          setState({ status: "ready", rows });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileSystem]);

  if (state.status === "empty") {
    return <Placeholder text="Open a project to see its BOM." />;
  }
  if (state.status === "loading") {
    return <Placeholder text="Building BOM…" />;
  }
  if (state.status === "error") {
    return <Placeholder text={state.message} isError />;
  }
  if (state.rows.length === 0) {
    return <Placeholder text="No BOM-eligible symbols found in this project's schematic(s)." />;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Refs</th>
          <th style={thStyle}>Value</th>
          <th style={thStyle}>Footprint</th>
          <th style={thStyle}>Datasheet</th>
        </tr>
      </thead>
      <tbody>
        {state.rows.map((row) => (
          <tr key={row.references.join(",")}>
            <td style={tdStyle}>
              {row.references.map((reference) => (
                <ReferenceChip key={reference} reference={reference} />
              ))}
            </td>
            <td style={{ ...tdStyle, fontWeight: 600 }}>{row.value}</td>
            <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {row.footprint}
            </td>
            <td style={tdStyle}>
              <DatasheetLink datasheet={row.datasheet} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Placeholder({ text, isError }: { text: string; isError?: boolean }) {
  return <p style={{ color: isError ? "var(--danger)" : "var(--text-secondary)", fontSize: 13 }}>{text}</p>;
}

function ReferenceChip({ reference }: { reference: string }) {
  const selected = useSelectionStore((state) => state.reference === reference);
  const source = useSelectionStore((state) => state.source);
  const select = useSelectionStore((state) => state.select);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Selecting a component in the schematic/board view should bring its BOM
  // row into view here, mirroring the viewers panning to a BOM selection --
  // skipped when the selection originated from this same panel since the
  // row the user just clicked is already on screen.
  useEffect(() => {
    if (selected && source !== "bom") {
      buttonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selected, source]);

  return (
    <button
      ref={buttonRef}
      className={`pcb-chip${selected ? " pcb-chip--selected" : ""}`}
      onClick={() => select(reference, "bom")}
    >
      {reference}
    </button>
  );
}

function DatasheetLink({ datasheet }: { datasheet: string | null }) {
  if (!datasheet) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  if (!/^https?:\/\//i.test(datasheet)) {
    return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{datasheet}</span>;
  }
  return (
    <a href={datasheet} target="_blank" rel="noreferrer" style={datasheetLinkStyle}>
      Datasheet ↗
    </a>
  );
}

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid var(--border-strong)",
  padding: "8px 10px",
  color: "var(--text-secondary)",
  fontSize: 11.5,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid var(--border)",
  padding: "8px 10px",
  verticalAlign: "top",
  color: "var(--text-primary)",
};

const datasheetLinkStyle: CSSProperties = {
  color: "var(--accent-strong)",
  fontSize: 12.5,
  fontWeight: 500,
  textDecoration: "none",
};
