export type MermaidSemanticNode = {
  id: string;
  label?: string;
  parentId?: string;
  isGroup?: boolean;
  type?: number;
};

export type MermaidSemanticEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  type?: string;
};

export type MermaidSemanticModel = {
  diagramType: string;
  nodes: MermaidSemanticNode[];
  edges: MermaidSemanticEdge[];
  source: "mermaidAPI" | "fallback";
};

export const extractMermaidSemanticModelFromMermaid = async (mermaid: any, code: string): Promise<MermaidSemanticModel> => {
  const trimmed = code.trim();
  const diagramType = detectDiagramType(mermaid, trimmed);

  const getDiagramFromText = mermaid?.mermaidAPI?.getDiagramFromText;
  if (typeof getDiagramFromText !== "function") {
    return { diagramType, nodes: [], edges: [], source: "fallback" };
  }

  const diagram = await getDiagramFromText(trimmed);
  const diagType = typeof diagram?.type === "string" ? diagram.type : diagramType;
  const db = diagram?.db;

  const getData = typeof db?.getData === "function" ? db.getData.bind(db) : null;
  if (getData) {
    const data = getData();
    const nodes = Array.isArray(data?.nodes)
      ? data.nodes
          .map((n: any) => ({
            id: String(n?.id ?? ""),
            label: typeof n?.label === "string" ? n.label : undefined,
            parentId: typeof n?.parentId === "string" ? n.parentId : undefined,
            isGroup: typeof n?.isGroup === "boolean" ? n.isGroup : undefined,
            type: typeof n?.type === "number" ? n.type : undefined
          }))
          .filter((n: MermaidSemanticNode) => n.id.length > 0)
      : [];
    const edges = Array.isArray(data?.edges)
      ? data.edges
          .map((e: any) => ({
            id: String(e?.id ?? ""),
            from: String(e?.start ?? e?.source ?? ""),
            to: String(e?.end ?? e?.target ?? ""),
            label: typeof e?.label === "string" ? e.label : typeof e?.text === "string" ? e.text : undefined,
            type: typeof e?.type === "string" ? e.type : undefined
          }))
          .filter((e: MermaidSemanticEdge) => e.id.length > 0 && e.from.length > 0 && e.to.length > 0)
      : [];
    return { diagramType: diagType, nodes, edges, source: "mermaidAPI" };
  }

  const vertices = db?.vertices;
  const edgesRaw = db?.edges;
  const nodes = normalizeVertices(vertices);
  const edges = normalizeEdges(edgesRaw);
  if (nodes.length > 0 || edges.length > 0) {
    return { diagramType: diagType, nodes, edges, source: "mermaidAPI" };
  }

  return { diagramType: diagType, nodes: [], edges: [], source: "fallback" };
};

const detectDiagramType = (mermaid: any, code: string): string => {
  try {
    if (typeof mermaid?.detectType === "function") {
      const t = mermaid.detectType(code);
      if (typeof t === "string" && t.length > 0) return t;
    }
  } catch {}
  try {
    const raw = code.trim().toLowerCase();
    if (raw.startsWith("flowchart ") || raw.startsWith("graph ")) return "flowchart";
  } catch {}
  return "unknown";
};

const normalizeVertices = (vertices: any): MermaidSemanticNode[] => {
  if (!vertices) return [];
  if (vertices instanceof Map) {
    const out: MermaidSemanticNode[] = [];
    for (const [k, v] of vertices.entries()) {
      const id = String(v?.id ?? k ?? "");
      if (!id) continue;
      out.push({
        id,
        label: typeof v?.text === "string" ? v.text : typeof v?.label === "string" ? v.label : undefined,
        parentId: typeof v?.parentId === "string" ? v.parentId : undefined,
        isGroup: typeof v?.isGroup === "boolean" ? v.isGroup : undefined,
        type: typeof v?.type === "number" ? v.type : undefined
      });
    }
    return out;
  }
  if (typeof vertices === "object") {
    return Object.entries(vertices)
      .map(([k, v]: any) => {
        const id = String(v?.id ?? k ?? "");
        return {
          id,
          label: typeof v?.text === "string" ? v.text : typeof v?.label === "string" ? v.label : undefined,
          parentId: typeof v?.parentId === "string" ? v.parentId : undefined,
          isGroup: typeof v?.isGroup === "boolean" ? v.isGroup : undefined,
          type: typeof v?.type === "number" ? v.type : undefined
        } satisfies MermaidSemanticNode;
      })
      .filter((n) => n.id.length > 0);
  }
  return [];
};

const normalizeEdges = (edgesRaw: any): MermaidSemanticEdge[] => {
  if (!edgesRaw || !Array.isArray(edgesRaw)) return [];
  return edgesRaw
    .map((e: any, i: number) => {
      const id = String(e?.id ?? `e${i}`);
      const from = String(e?.start ?? e?.source ?? "");
      const to = String(e?.end ?? e?.target ?? "");
      return {
        id,
        from,
        to,
        label: typeof e?.label === "string" ? e.label : typeof e?.text === "string" ? e.text : undefined,
        type: typeof e?.type === "string" ? e.type : undefined
      } satisfies MermaidSemanticEdge;
    })
    .filter((e) => e.id.length > 0 && e.from.length > 0 && e.to.length > 0);
};

