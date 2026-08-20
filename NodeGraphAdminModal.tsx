import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import * as d3 from "d3";
import { X, Link2, Unlink, Search } from "lucide-react";
import { getAllNodesForAdmin, type AdminNodeInfo } from "../data/nodeData";
import { loadCustomGraphNodes, pullCustomGraphNodesFromSupabase } from "../data/customNodes";
import { fetchAllNodeConnections, createNodeConnection, deleteNodeConnection, type NodeConnection } from "../data/nodeConnections";
import { soundEngine } from "../utils/soundEngine";

interface NodeGraphAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = { eat: "#C2694A", go: "#5A8B9B", see: "#8B5A9B", do: "#6B8B5A" };

// 관리자 전용 — 지금 있는 모든 관심사(빌트인+커스텀)를 마인드맵처럼 한눈에 보고,
// 두 노드를 눌러서 직접 이어주거나 끊을 수 있다. 트리 연결(부모-자식)과 미리
// 정해둔 related는 읽기 전용으로만 보여주고, 실제로 만들고 끊을 수 있는 건
// 이 화면에서 새로 이은 연결(node_connections)뿐이다.
export function NodeGraphAdminModal({ isOpen, onClose }: NodeGraphAdminModalProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<AdminNodeInfo[]>([]);
  const [dbConnections, setDbConnections] = useState<NodeConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [dims, setDims] = useState({ w: 900, h: 600 });

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setSelected([]);
    // 이 기기 로컬 캐시만 읽으면, 다른 데서(또는 방금 막) 만든 노드가 안 보일 수 있다 —
    // 관리자 화면은 항상 최신 상태를 보여줘야 하니, Supabase에서 먼저 최신 목록을
    // 받아와서 로컬 캐시에 합친 다음에 읽는다.
    void pullCustomGraphNodesFromSupabase().then(() => {
      const builtIn = getAllNodesForAdmin();
      const custom = loadCustomGraphNodes().map((cn) => ({
        id: cn.id, label: cn.label, color: cn.color, parentId: cn.parentId, related: [] as string[], isCustom: true,
      }));
      const byId = new Map<string, AdminNodeInfo>();
      [...builtIn, ...custom].forEach((n) => byId.set(n.id, n));
      setNodes(Array.from(byId.values()));
      void fetchAllNodeConnections().then((data) => {
        setDbConnections(data);
        setLoading(false);
      });
    });
  }, [isOpen]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.max(320, width), h: Math.max(400, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const categoryOf = useMemo(() => {
    const map: Record<string, string> = {};
    const walkUp = (id: string, visited = new Set<string>()): string => {
      if (["eat", "go", "see", "do"].includes(id)) return id;
      if (visited.has(id)) return "eat";
      visited.add(id);
      const n = nodes.find((x) => x.id === id);
      if (!n || !n.parentId) return "eat";
      return walkUp(n.parentId, visited);
    };
    nodes.forEach((n) => { map[n.id] = walkUp(n.id); });
    return map;
  }, [nodes]);

  const filteredNodeIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return new Set(nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [search, nodes]);

  useEffect(() => {
    if (loading || !svgRef.current) return;
    const { w, h } = dims;

    const nodesData = nodes.map((n) => ({ ...n, category: categoryOf[n.id] ?? "eat" }));
    const treeLinks = nodes.filter((n) => n.parentId).map((n) => ({ source: n.parentId, target: n.id, kind: "tree" as const }));
    const relatedSeen = new Set<string>();
    const relatedLinks: { source: string; target: string; kind: "related" }[] = [];
    nodes.forEach((n) => n.related.forEach((r) => {
      const key = [n.id, r].sort().join("|");
      if (relatedSeen.has(key)) return;
      relatedSeen.add(key);
      relatedLinks.push({ source: n.id, target: r, kind: "related" });
    }));
    const dbLinks = dbConnections.map((c) => ({ source: c.nodeA, target: c.nodeB, kind: "db" as const, connId: c.id }));
    const validIds = new Set(nodesData.map((n) => n.id));
    const allLinks = [...treeLinks, ...relatedLinks, ...dbLinks].filter(
      (l) => validIds.has(l.source as string) && validIds.has(l.target as string)
    );

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", [0, 0, w, h] as unknown as string);
    const g = svg.append("g");
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.25, 3]).on("zoom", (event) => g.attr("transform", event.transform)) as any);

    const simulation = d3
      .forceSimulation(nodesData as any)
      .force("link", d3.forceLink(allLinks as any).id((d: any) => d.id).distance((l: any) => (l.kind === "tree" ? 70 : 55)).strength((l: any) => (l.kind === "tree" ? 0.4 : 0.12)))
      .force("charge", d3.forceManyBody().strength(-140))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collide", d3.forceCollide().radius(22));

    const linkSel = g.append("g").selectAll("line").data(allLinks).join("line")
      .attr("stroke", (l: any) => (l.kind === "tree" ? "#B0A08C" : l.kind === "db" ? "#5A8B9B" : "#9B7A5A"))
      .attr("stroke-width", (l: any) => (l.kind === "db" ? 2 : 1))
      .attr("stroke-dasharray", (l: any) => (l.kind === "related" ? "3 3" : l.kind === "db" ? "1 0" : null))
      .attr("stroke-opacity", (l: any) => (l.kind === "tree" ? 0.3 : 0.55));

    const nodeSel = g.append("g").selectAll("g").data(nodesData).join("g")
      .style("cursor", "pointer")
      .style("opacity", (d: any) => (filteredNodeIds && !filteredNodeIds.has(d.id) ? 0.15 : 1))
      .call(d3.drag<any, any>()
        .on("start", (event, d: any) => { if (!event.active) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (event, d: any) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d: any) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }) as any)
      .on("click", (_event, d: any) => {
        setSelected((prev) => {
          if (prev.includes(d.id)) return prev.filter((x) => x !== d.id);
          if (prev.length >= 2) return [prev[1], d.id];
          return [...prev, d.id];
        });
      });

    nodeSel.append("circle")
      .attr("r", (d: any) => (selected.includes(d.id) ? 14 : 9))
      .attr("fill", (d: any) => (d.isCustom ? "#9B7A5A" : CATEGORY_COLORS[d.category] ?? "#9B7A5A"))
      .attr("fill-opacity", (d: any) => (selected.includes(d.id) ? 0.9 : 0.65))
      .attr("stroke", (d: any) => (selected.includes(d.id) ? "#2C2420" : "none"))
      .attr("stroke-width", 2);

    nodeSel.append("text")
      .text((d: any) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", 20)
      .attr("font-size", 9.5)
      .attr("fill", "#2C2420")
      .style("pointer-events", "none")
      .style("font-family", "system-ui, sans-serif");

    simulation.on("tick", () => {
      linkSel.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y).attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      nodeSel.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [loading, nodes, dbConnections, dims, categoryOf, filteredNodeIds, selected]);

  const existingDbConnId = useMemo(() => {
    if (selected.length !== 2) return null;
    const [a, b] = selected;
    return dbConnections.find((c) => (c.nodeA === a && c.nodeB === b) || (c.nodeA === b && c.nodeB === a))?.id ?? null;
  }, [selected, dbConnections]);

  const handleConnect = async () => {
    if (selected.length !== 2) return;
    setBusy(true);
    const result = await createNodeConnection(selected[0], selected[1]);
    setBusy(false);
    if (!result.ok) { alert(result.error ?? "연결에 실패했어요."); return; }
    try { soundEngine.playClick(); } catch (_) {}
    void fetchAllNodeConnections().then(setDbConnections);
  };

  const handleDisconnect = async () => {
    if (selected.length !== 2) return;
    setBusy(true);
    const ok = await deleteNodeConnection(selected[0], selected[1]);
    setBusy(false);
    if (!ok) { alert("연결 끊기에 실패했어요."); return; }
    try { soundEngine.playClick(); } catch (_) {}
    setDbConnections((prev) => prev.filter((c) => !((c.nodeA === selected[0] && c.nodeB === selected[1]) || (c.nodeA === selected[1] && c.nodeB === selected[0]))));
  };

  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

  const CATEGORY_LABELS: Record<string, string> = { eat: "먹기", go: "가기", see: "보기", do: "하기" };

  function nodeDetailOf(id: string) {
    const n = nodes.find((x) => x.id === id);
    if (!n) return null;
    const parent = nodes.find((x) => x.id === n.parentId);
    const relatedLabels = n.related.map((r) => labelOf(r));
    const dbLabels = dbConnections
      .filter((c) => c.nodeA === id || c.nodeB === id)
      .map((c) => labelOf(c.nodeA === id ? c.nodeB : c.nodeA));
    return {
      label: n.label,
      id: n.id,
      category: CATEGORY_LABELS[categoryOf[id]] ?? "먹기",
      isCustom: n.isCustom,
      parentLabel: parent ? parent.label : n.parentId === "root" ? "나" : n.parentId,
      relatedLabels,
      dbLabels,
    };
  }

  const detailNodeId = selected.length > 0 ? selected[selected.length - 1] : null;
  const detail = detailNodeId ? nodeDetailOf(detailNodeId) : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ backgroundColor: "var(--background)" }}
        >
          <div className="flex items-center justify-between px-5 flex-shrink-0"
            style={{ paddingTop: "calc(20px + env(safe-area-inset-top))", paddingBottom: 14, borderBottom: "1px solid color-mix(in srgb, var(--foreground) 7%, transparent)" }}>
            <div className="flex items-center gap-2">
              <Link2 size={18} strokeWidth={1.6} style={{ color: "#5A8B9B" }} />
              <p className="text-foreground font-medium" style={{ fontSize: 16 }}>노드 관리</p>
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{nodes.length}개 노드</span>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
              <X size={20} strokeWidth={1.6} className="text-muted-foreground" />
            </button>
          </div>

          <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid color-mix(in srgb, var(--foreground) 6%, transparent)" }}>
            <div className="flex items-center gap-2 flex-1" style={{ backgroundColor: "var(--secondary)", borderRadius: 999, padding: "8px 14px" }}>
              <Search size={14} style={{ color: "var(--muted-foreground)" }} />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="노드 이름으로 찾기"
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "var(--foreground)" }}
              />
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "var(--muted-foreground)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, height: 0, borderTop: "1px solid #B0A08C", display: "inline-block" }} />트리</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, height: 0, borderTop: "1px dashed #9B7A5A", display: "inline-block" }} />related</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, height: 0, borderTop: "2px solid #5A8B9B", display: "inline-block" }} />관리자 연결</span>
            </div>
          </div>

          <div ref={containerRef} className="relative" style={{ flex: 1, minHeight: 0 }}>
            {loading ? (
              <p className="text-center text-muted-foreground" style={{ fontSize: 13, paddingTop: 60 }}>불러오는 중…</p>
            ) : (
              <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
            )}

            {/* 선택한 노드가 정확히 뭔지 보여주는 정보 카드 */}
            {detail && (
              <motion.div
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                className="absolute"
                style={{
                  top: 16, right: 16, width: "min(260px, calc(100% - 32px))",
                  backgroundColor: "var(--card)", borderRadius: 16, padding: 16,
                  boxShadow: "0 10px 28px rgba(0,0,0,0.14)", border: "1px solid color-mix(in srgb, var(--foreground) 8%, transparent)",
                  maxHeight: "calc(100% - 32px)", overflowY: "auto",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-foreground" style={{ fontSize: 15, fontWeight: 600 }}>{detail.label}</p>
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 999,
                    backgroundColor: detail.isCustom ? "color-mix(in srgb, #9B7A5A 16%, transparent)" : "color-mix(in srgb, #5A8B9B 16%, transparent)",
                    color: detail.isCustom ? "#9B7A5A" : "#5A8B9B",
                  }}>
                    {detail.isCustom ? "커스텀" : "빌트인"}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10 }}>id: {detail.id}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                  <div>
                    <p style={{ color: "var(--muted-foreground)", fontSize: 10.5, marginBottom: 2 }}>영역</p>
                    <p className="text-foreground">{detail.category}</p>
                  </div>
                  <div>
                    <p style={{ color: "var(--muted-foreground)", fontSize: 10.5, marginBottom: 2 }}>부모 노드</p>
                    <p className="text-foreground">{detail.parentLabel}</p>
                  </div>
                  <div>
                    <p style={{ color: "var(--muted-foreground)", fontSize: 10.5, marginBottom: 2 }}>related ({detail.relatedLabels.length})</p>
                    {detail.relatedLabels.length === 0 ? (
                      <p style={{ color: "var(--muted-foreground)", opacity: 0.6 }}>없음</p>
                    ) : (
                      <p className="text-foreground" style={{ lineHeight: 1.6 }}>{detail.relatedLabels.join(", ")}</p>
                    )}
                  </div>
                  <div>
                    <p style={{ color: "var(--muted-foreground)", fontSize: 10.5, marginBottom: 2 }}>관리자 연결 ({detail.dbLabels.length})</p>
                    {detail.dbLabels.length === 0 ? (
                      <p style={{ color: "var(--muted-foreground)", opacity: 0.6 }}>없음</p>
                    ) : (
                      <p className="text-foreground" style={{ lineHeight: 1.6 }}>{detail.dbLabels.join(", ")}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* 두 노드를 고르면 뜨는 연결/끊기 액션바 */}
            <AnimatePresence>
              {selected.length === 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ bottom: "calc(20px + env(safe-area-inset-bottom))", backgroundColor: "var(--card)", borderRadius: 18, padding: "14px 18px", boxShadow: "0 12px 32px rgba(0,0,0,0.18)", border: "1px solid color-mix(in srgb, var(--foreground) 8%, transparent)" }}
                >
                  <p className="text-foreground text-center mb-2.5" style={{ fontSize: 13, fontWeight: 500 }}>
                    {labelOf(selected[0])} ↔ {labelOf(selected[1])}
                  </p>
                  <div className="flex gap-2">
                    {existingDbConnId ? (
                      <button onClick={() => void handleDisconnect()} disabled={busy}
                        className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-[12.5px] font-medium"
                        style={{ backgroundColor: "var(--secondary)", color: "var(--foreground)", opacity: busy ? 0.5 : 1 }}>
                        <Unlink size={13} strokeWidth={1.8} /> 연결 끊기
                      </button>
                    ) : (
                      <button onClick={() => void handleConnect()} disabled={busy}
                        className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-[12.5px] font-medium"
                        style={{ backgroundColor: "#2C2420", color: "#FAF8F5", opacity: busy ? 0.5 : 1 }}>
                        <Link2 size={13} strokeWidth={1.8} /> 연결하기
                      </button>
                    )}
                    <button onClick={() => setSelected([])}
                      className="py-2.5 px-4 rounded-xl text-[12.5px]"
                      style={{ backgroundColor: "transparent", color: "var(--muted-foreground)", border: "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)" }}>
                      선택 해제
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {selected.length === 1 && (
              <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: "calc(20px + env(safe-area-inset-bottom))" }}>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", backgroundColor: "var(--card)", padding: "8px 14px", borderRadius: 999 }}>
                  {labelOf(selected[0])} 선택됨 — 이을 노드를 하나 더 눌러주세요
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
