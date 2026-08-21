import { motion, AnimatePresence } from "motion/react";
import * as d3 from "d3";
import { useNavigate, useLocation } from "react-router";
import { ArrowLeft, Plus, Trash2, PenLine, Maximize2, X, LogIn, LogOut, Pencil, ImagePlus, Bike, Plane, Rocket, CarFront } from "lucide-react";
import { MentionText } from "../components/MentionText";
import { useState, useMemo, useRef, useEffect } from "react";
import { soundEngine } from "../utils/soundEngine";
import { useAuth } from "../contexts/AuthContext";
import { useInventory } from "../contexts/InventoryContext";
import { compressImage } from "../utils/imageCompress";
import { ActivityPanel } from "../components/ActivityPanel";
import { LoginModal } from "../components/LoginModal";
import { ImageLightbox } from "../components/ImageLightbox";
import { recordEvent, hasMentionBridge } from "../data/missions";
import { advanceCoach } from "../data/tutorialCoach";
import {
  loadNodes,
  saveNodes,
  loadRecords,
  saveRecords,
  pullMyMapFromSupabase,
  uploadRecordPhoto,
  resolveRecordPhotoUrl,
  type MapNode,
  type MapRecord,
} from "../data/myMap";

const ROOT_ID = "root";
const ACTIVITY_ID = "activity-oneu";

// Supabase Storage 업로드가 안전하게 되는 크기로 제한 (그 이상은 조용히 실패해서
// "사진이 안 보이는" 것처럼 보일 수 있다).
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_PHOTOS_PER_RECORD = 6;

// 색상 12개를 최대한 서로 다른 색상으로 골랐다 — 예전 팔레트는 갈색 계열 3개,
// 초록 계열 3개, 보라 계열 2개처럼 비슷한 색이 몰려있어서 "한눈에 보기"(전체 지도)에서
// 구분이 잘 안 된다는 피드백이 있었다. 브랜드 톤(차분하고 은은한 색)은 유지하면서
// 색상환을 최대한 고르게 펼쳤다.
const COLOR_PALETTE = [
  "#B8622E", "#3D6B96", "#4A8B5C", "#2F8C82",
  "#A68A2E", "#B0526B", "#7A4FB0", "#4A5A8B",
  "#8B6D44", "#5A8B6B", "#8B4A6B", "#6B7A2E",
];

// ─── Persistence ──────────────────────────────────────────────────────────────
// 저장/불러오기 로직은 data/myMap.ts로 옮겼다 (Supabase 동기화 포함).
// 여기서는 사용자 닉네임만 이 화면 전용으로 로컬에 저장한다.
const NAME_KEY = "oneu-mymap-username";

function loadUsername(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "나";
  } catch (_) {
    return "나";
  }
}
function saveUsername(name: string) { try { localStorage.setItem(NAME_KEY, name); } catch (_) {} }

function formatDate(ts: number): string {
  const d = new Date(ts);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${days[d.getDay()]}요일`;
}

// 마이맵 사진은 비공개 버킷이라 경로만으로는 못 보여준다 — 매번 서명된 URL을
// 새로 받아와서 보여준다(캐싱은 resolveRecordPhotoUrl 안에서 이미 해준다).
function ResolvedRecordImage({ path, style, className, onClick }: {
  path: string; style?: React.CSSProperties; className?: string; onClick?: (e: React.MouseEvent) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void resolveRecordPhotoUrl(path).then((resolved) => { if (!cancelled) setUrl(resolved); });
    return () => { cancelled = true; };
  }, [path]);
  if (!url) return <div className={className} style={{ ...style, backgroundColor: "var(--secondary)" }} />;
  return <img src={url} alt="" style={style} className={className} onClick={onClick} />;
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────
const W = 360, H = 400, CX = 180, CY = 200, RADIUS = 108;
const JITTER  = [0, -10, 8, -6, 12, -8, 5, -3];
const NODE_SIZE = 52;
const HALF      = NODE_SIZE / 2;

const BREATHE = [
  { d: 3.8, dl: 0.0 }, { d: 4.2, dl: 0.7 }, { d: 3.5, dl: 1.2 },
  { d: 4.5, dl: 0.4 }, { d: 3.2, dl: 1.8 }, { d: 4.0, dl: 0.9 },
];

function computePositions(focusId: string, nodes: MapNode[]): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  map.set(focusId, { x: CX, y: CY });
  const focusNode = nodes.find(n => n.id === focusId);
  if (!focusNode) return map;
  const children = nodes.filter(n => n.parentId === focusId);
  const parent   = focusNode.parentId ? nodes.find(n => n.id === focusNode.parentId) : null;
  const neighbors = parent ? [parent, ...children] : children;
  neighbors.forEach((node, i) => {
    const angle = (-95 + (360 / Math.max(neighbors.length, 1)) * i + (JITTER[i] || 0)) * (Math.PI / 180);
    const r = RADIUS + (i % 3 === 0 ? -6 : i % 3 === 1 ? 5 : 0);
    map.set(node.id, { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) });
  });
  return map;
}

// Returns abstract coordinates (centered at 0,0); caller uses viewBox for auto-fit.
function computeAbstractLayout(nodes: MapNode[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();

  const childrenOf = new Map<string, string[]>();
  nodes.forEach(n => {
    if (n.parentId) {
      if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
      childrenOf.get(n.parentId)!.push(n.id);
    }
  });

  const subtreeSize = new Map<string, number>();
  const calcSize = (id: string): number => {
    const kids = childrenOf.get(id) ?? [];
    const s = 1 + kids.reduce((acc, k) => acc + calcSize(k), 0);
    subtreeSize.set(id, s);
    return s;
  };
  calcSize(ROOT_ID);

  const RADII = [0, 100, 185, 260, 325];

  const place = (id: string, depth: number, aStart: number, aEnd: number) => {
    const angle = (aStart + aEnd) / 2;
    const r = RADII[Math.min(depth, RADII.length - 1)];
    result.set(id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) return;
    const total = kids.reduce((s, k) => s + (subtreeSize.get(k) ?? 1), 0);
    let a = aStart;
    for (const kid of kids) {
      const span = ((subtreeSize.get(kid) ?? 1) / total) * (aEnd - aStart);
      place(kid, depth + 1, a, a + span);
      a += span;
    }
  };

  place(ROOT_ID, 0, -Math.PI, Math.PI);
  return result;
}

function buildBreadcrumb(targetId: string, nodes: MapNode[]): string[] {
  const path: string[] = [];
  let current: string | null = targetId;
  while (current) {
    path.unshift(current);
    if (current === ROOT_ID) break;
    const node = nodes.find(n => n.id === current);
    current = node?.parentId ?? null;
  }
  return path.length > 0 ? path : [ROOT_ID];
}

function curveD(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  return `M ${x1} ${y1} Q ${mx - (dy / len) * 12} ${my + (dx / len) * 12} ${x2} ${y2}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MyNode() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, email, loading: authLoading, signOut } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  const [nodes,    setNodes]    = useState<MapNode[]>(loadNodes);
  const [records,  setRecords]  = useState<MapRecord[]>(loadRecords);
  const [username, setUsername] = useState(loadUsername);
  const nodesRef = useRef(nodes);
  const recordsRef = useRef(records);
  nodesRef.current = nodes;
  recordsRef.current = records;

  useEffect(() => { saveNodes(nodes);     }, [nodes]);
  useEffect(() => { saveRecords(records); }, [records]);
  useEffect(() => { saveUsername(username); }, [username]);

  // 로그인되면 서버(Supabase)에 저장된 마이맵을 불러온다.
  // 서버에 데이터가 있으면 그걸 기준으로 쓰고(다른 기기에서 쓴 것 포함),
  // 서버가 비어있으면(처음 로그인) 지금 로컬 데이터를 그대로 서버에 올려서 첫 동기화가 된다.
  // (saveNodes/saveRecords는 myMap.ts 안에서 "이 세션에 한 번이라도 서버를 확인하기
  //  전엔 올리지 않는다"는 안전장치를 갖고 있어서, 여기서 순서를 안 맞춰도 안전하다 —
  //  예전엔 이 순서가 안 맞아서 새 기기 로그인 직후 서버의 진짜 기록이 텅 빈 로컬
  //  상태로 덮어써지는 경쟁 상태 버그가 있었다.)
  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    void pullMyMapFromSupabase().then((server) => {
      if (cancelled) return;
      if (server) {
        setNodes(server.nodes);
        setRecords(server.records);
      } else {
        // 서버가 비어있었다(첫 로그인) — 지금 로컬 상태를 그대로 서버에 올려서 시작한다.
        saveNodes(nodesRef.current);
        saveRecords(recordsRef.current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  // 로그인 → 로그아웃으로 바뀌는 순간(마이맵 화면에 있는 채로 로그아웃한 경우)
  // 화면에 남아있던 메모/기록을 바로 지운다 — localStorage는 clearLocalMyMap()이
  // 이미 지웠지만, 이 화면이 그새 다시 불러오지 않는 한 메모리 속 상태는 안 지워져서
  // 로그아웃했는데도 화면엔 그대로 남아있는 문제가 있었다.
  const wasLoggedInRef = useRef(false);
  useEffect(() => {
    if (userId) wasLoggedInRef.current = true;
    else if (wasLoggedInRef.current && !authLoading) {
      setNodes([]);
      setRecords([]);
      setFocusId(ROOT_ID);
      setBreadcrumb([ROOT_ID]);
      wasLoggedInRef.current = false;
    }
  }, [userId, authLoading]);

  // Handle !mention navigation: when arriving from a mention link, focus that node
  useEffect(() => {
    const state = location.state as { focusNodeId?: string; openMerge?: boolean } | null;
    if (state?.focusNodeId) {
      const targetNode = nodes.find(n => n.id === state.focusNodeId);
      if (targetNode) {
        setFocusId(state.focusNodeId);
        setBreadcrumb([ROOT_ID, state.focusNodeId]);
      }
      navigate("/my-space", { replace: true, state: {} });
    }
    // 노드 통합 아이템으로 진입한 경우 통합 시트를 연다
    if (state?.openMerge) {
      setMergeSourceId("");
      setMergeTargetId("");
      setModal("merge-node");
      navigate("/my-space", { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const displayNodes = useMemo(() => {
    const mapped = nodes.map(n => n.id === ROOT_ID ? { ...n, label: username } : n);
    // "오느" — 커뮤니티에서 내가 쓴 글/댓글/좋아요를 모아 보는 특별 노드. 항상 '나' 바로 아래
    // 연결돼 있고, 지우거나 이름을 바꿀 수 없다(nodes 배열에 실제로 들어있지 않고 여기서만
    // 합성해서 보여준다 — 그래서 삭제/수정 로직이 건드릴 수가 없다).
    mapped.push({ id: ACTIVITY_ID, label: "오느", color: "#9B7A5A", note: "", parentId: ROOT_ID, createdAt: 0 });
    return mapped;
  }, [nodes, username]);

  // Graph navigation — restore position on remount
  const [focusId, setFocusId] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem("mymap-focusId");
      if (saved && loadNodes().find(n => n.id === saved)) return saved;
    } catch (_) {}
    return ROOT_ID;
  });
  const [breadcrumb, setBreadcrumb] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem("mymap-breadcrumb");
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const allNodes = loadNodes();
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(id => allNodes.find(n => n.id === id))) {
          return parsed;
        }
      }
    } catch (_) {}
    return [ROOT_ID];
  });

  // Persist graph navigation position (declared after focusId/breadcrumb)
  useEffect(() => {
    try { sessionStorage.setItem("mymap-focusId", focusId); } catch (_) {}
  }, [focusId]);
  useEffect(() => {
    try { sessionStorage.setItem("mymap-breadcrumb", JSON.stringify(breadcrumb)); } catch (_) {}
  }, [breadcrumb]);

  const [showOverview, setShowOverview] = useState(false);

  // Modals: "none" | "add-node" | "edit-node" | "edit-name" | "add-record" | "delete-record"
  const [modal, setModal] = useState<string>("none");
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);
  // 길(연결선)을 눌러서 노드를 추가할 때만 채워진다 — 새 노드는 지금 보는 노드(focusId)의
  // 자식으로 들어가고, insertBetweenChildId에 담긴 원래 자식은 새 노드 밑으로 옮겨진다
  // (부모 → 자식 이었던 게, 부모 → 새 노드 → 자식 이 된다. 길 "중간"에 끼워넣는 것).
  const [addNodeParentId, setAddNodeParentId] = useState<string | null>(null);
  const [insertBetweenChildId, setInsertBetweenChildId] = useState<string | null>(null);
  // 길을 눌러서도 노드를 이을 수 있다는 걸 알아채기 어려워서(탭 영역이 안 보이니까),
  // 마우스를 올리면 살짝 밝아지게 해서 "이것도 눌리는구나"를 알려준다.
  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null);
  // 선뿐 아니라, 그 선과 이어진 노드를 누르고 있을 때도 "+"가 나타나게 하기 위한 상태.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // 노드를 눌러서 다른 곳으로 이동하면, 마우스가 실제로는 화면을 안 떠났어도 원래
  // 누르고 있던 노드가 사라지면서 onMouseLeave가 안 불릴 수 있다 — 그러면 새 화면에
  // 엉뚱하게 "+"가 계속 떠있는 채로 남는다. 포커스가 바뀔 때마다 확실히 지운다.
  useEffect(() => {
    setHoveredNodeId(null);
    setHoveredPathId(null);
  }, [focusId]);

  // Add/edit node form
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [newNodeColor, setNewNodeColor] = useState(COLOR_PALETTE[0]);

  // Add/edit record form
  const [newRecordContent, setNewRecordContent] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordImageUrls, setRecordImageUrls] = useState<string[]>([]);
  const [recordImageUploading, setRecordImageUploading] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<MapRecord | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Merge node form (노드 통합 아이템)
  const [mergeSourceId, setMergeSourceId] = useState<string>("");
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  // Edit name form
  const [editNameValue, setEditNameValue] = useState("");

  // Container measurement
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 360, h: 400 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sx = dims.w / W, sy = dims.h / H;
  const toPixel = (svgX: number, svgY: number) => ({
    x: (svgX - CX) * sx,
    y: (svgY - CY) * sy,
  });

  const positions = useMemo(() => computePositions(focusId, displayNodes), [focusId, displayNodes]);

  const nodeList = useMemo(() => {
    const focusNode = displayNodes.find(n => n.id === focusId);
    let bi = 0;
    return Array.from(positions.entries()).map(([id, pos]) => ({
      id, pos,
      isCenter: id === focusId,
      isParent: id !== focusId && focusNode?.parentId === id,
      node: displayNodes.find(n => n.id === id),
      bi: bi++,
    }));
  }, [positions, focusId, displayNodes]);

  const curves = useMemo(() => {
    const cp = positions.get(focusId) ?? { x: CX, y: CY };
    return Array.from(positions.entries())
      .filter(([id]) => id !== focusId)
      .map(([id, np]) => {
        // 이차 베지어 곡선의 중간점(t=0.5) — curveD와 똑같은 방식으로 조절점을 계산해서
        // 실제로 화면에 그려지는 곡선 위에 "+" 힌트가 정확히 올라가도록 한다.
        const x1 = cp.x, y1 = cp.y, x2 = np.x, y2 = np.y;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const ctrlX = mx - (dy / len) * 12, ctrlY = my + (dx / len) * 12;
        const midX = 0.25 * x1 + 0.5 * ctrlX + 0.25 * x2;
        const midY = 0.25 * y1 + 0.5 * ctrlY + 0.25 * y2;
        return {
          id,
          d: curveD(cp.x, cp.y, np.x, np.y),
          color: displayNodes.find(n => n.id === id)?.color ?? "#888",
          midX, midY,
        };
      });
  }, [positions, focusId, displayNodes]);

  // Records for current focus node
  const focusRecords = useMemo(() =>
    records
      .filter(r => r.nodeId === focusId)
      .sort((a, b) => b.createdAt - a.createdAt),
    [records, focusId]
  );

  const focusNode = displayNodes.find(n => n.id === focusId);
  const isAtRoot  = focusId === ROOT_ID;

  // ── Handlers ────────────────────────────────────────────────────────────────

  // 아이템가방에 장착한 탈것(자전거/비행기/로켓) — 예전엔 홈 지도에서만 적용되고
  // 마이맵에서는 그냥 순간이동이었다. 마이맵도 똑같이 타고 이동하도록 맞췄다.
  const { activeEffects } = useInventory();
  const vehicleEffect = activeEffects.find((item) => item.effect.type === "vehicle");
  const vehicleType = vehicleEffect ? (vehicleEffect.effect.value as string) : "car";
  const VehicleIcon = vehicleType === "bike" ? Bike : vehicleType === "plane" ? Plane : vehicleType === "rocket" ? Rocket : CarFront;
  const vehicleSpeed = vehicleType === "bike" ? 1.2 : vehicleType === "plane" ? 0.4 : vehicleType === "rocket" ? 0.2 : 0.6;
  const [travelAnim, setTravelAnim] = useState<{ from: { x: number; y: number }; to: { x: number; y: number }; mid: { x: number; y: number } } | null>(null);

  const completeNavigate = (id: string) => {
    const current = displayNodes.find(n => n.id === focusId);
    if (current?.parentId === id) {
      const idx = breadcrumb.indexOf(id);
      setBreadcrumb(idx >= 0 ? breadcrumb.slice(0, idx + 1) : [ROOT_ID]);
    } else {
      setBreadcrumb(prev => [...prev, id]);
    }
    setFocusId(id);
  };

  const navigateTo = (id: string) => {
    try { soundEngine.playClick(); } catch (_) {}

    const from = positions.get(focusId);
    const to = positions.get(id);
    if (from && to) {
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
      const mid = { x: mx - (dy / len) * 14, y: my + (dx / len) * 14 };
      setTravelAnim({ from, to, mid });
      setTimeout(() => {
        completeNavigate(id);
        setTravelAnim(null);
      }, vehicleSpeed * 1000);
      return;
    }
    completeNavigate(id);
  };

  const handleCenterTap = () => {
    try { soundEngine.playClick(); } catch (_) {}
    if (isAtRoot) {
      setEditNameValue(username);
      setModal("edit-name");
    }
    // Non-root center taps handled by the record section UI below
  };

  const isNodeLabelDuplicate = (label: string, excludeId?: string): boolean => {
    const target = label.trim().toLowerCase();
    if (!target) return false;
    if (target === "오느") return true; // 특별 노드 이름과 겹치지 않게 한다
    return nodes.some(n => n.id !== excludeId && n.label.trim().toLowerCase() === target);
  };

  const handleAddNode = () => {
    const label = newNodeLabel.trim();
    if (!label || isNodeLabelDuplicate(label)) return;
    const newId = `n-${Date.now()}`;
    setNodes(prev => {
      const withNew = [...prev, {
        id: newId,
        label,
        color: newNodeColor,
        note: "",
        parentId: addNodeParentId ?? focusId,
        createdAt: Date.now(),
      }];
      // 길 중간에 끼워넣는 경우 — 원래 그 길 끝에 있던 노드를 새 노드 밑으로 옮긴다.
      if (!insertBetweenChildId) return withNew;
      return withNew.map(n => n.id === insertBetweenChildId ? { ...n, parentId: newId } : n);
    });
    setNewNodeLabel("");
    setAddNodeParentId(null);
    setModal("none");
    try { soundEngine.playClick(); } catch (_) {}
    recordEvent("create-mymap-node");
    if (insertBetweenChildId) recordEvent("insert-mymap-path");
    setInsertBetweenChildId(null);
  };

  // 길을 눌렀을 때 — 그 길 "중간"에 새 노드를 끼워넣는다. 지금 보는 노드(focusId)와
  // 길 끝 노드(targetNodeId) 사이에 새 노드가 들어가고, 원래 있던 연결은
  // 새 노드를 거쳐가도록 바뀐다(부모→자식이 부모→새 노드→자식이 된다).
  const handlePathTap = (targetNodeId: string) => {
    try { soundEngine.playClick(); } catch (_) {}
    setNewNodeColor(COLOR_PALETTE[nodes.length % COLOR_PALETTE.length]);
    setNewNodeLabel("");
    setAddNodeParentId(focusId);
    setInsertBetweenChildId(targetNodeId);
    setModal("add-node");
  };

  const handleOpenEditNode = () => {
    if (!focusNode) return;
    setNewNodeLabel(focusNode.label);
    setNewNodeColor(focusNode.color);
    setModal("edit-node");
    try { soundEngine.playClick(); } catch (_) {}
  };

  const handleSaveEditNode = () => {
    const label = newNodeLabel.trim();
    if (!label || isNodeLabelDuplicate(label, focusId)) return;
    setNodes(prev => prev.map(n =>
      n.id === focusId ? { ...n, label, color: newNodeColor } : n
    ));
    setModal("none");
    try { soundEngine.playClick(); } catch (_) {}
  };

  const handleDeleteNode = (id: string) => {
    if (id === ROOT_ID) return;
    const toDelete = new Set<string>();
    const collect = (nodeId: string) => {
      toDelete.add(nodeId);
      nodes.forEach(n => { if (n.parentId === nodeId) collect(n.id); });
    };
    collect(id);
    const parentId = nodes.find(n => n.id === id)?.parentId ?? ROOT_ID;
    setNodes(prev  => prev.filter(n   => !toDelete.has(n.id)));
    setRecords(prev => prev.filter(r  => !toDelete.has(r.nodeId)));
    setFocusId(parentId);
    const pIdx = breadcrumb.indexOf(parentId);
    setBreadcrumb(pIdx >= 0 ? breadcrumb.slice(0, pIdx + 1) : [ROOT_ID]);
    setModal("none");
    try { soundEngine.playClick(); } catch (_) {}
  };

  // 마이맵 "전체 지도" 화면에서 꾹 눌러 지울 때 쓴다 — 삭제 로직은 handleDeleteNode와
  // 같지만, 지금 보고 있던 노드(focusId)가 지워진 것들 안에 있을 때만 포커스를
  // 옮긴다(전체 지도에선 지금 보던 곳과 다른 노드를 지울 수도 있어서, 그럴 땐
  // focusId를 안 건드리는 게 자연스럽다).
  const handleDeleteNodeFromOverview = (id: string) => {
    if (id === ROOT_ID) return;
    const toDelete = new Set<string>();
    const collect = (nodeId: string) => {
      toDelete.add(nodeId);
      nodes.forEach(n => { if (n.parentId === nodeId) collect(n.id); });
    };
    collect(id);
    setNodes(prev => prev.filter(n => !toDelete.has(n.id)));
    setRecords(prev => prev.filter(r => !toDelete.has(r.nodeId)));
    if (toDelete.has(focusId)) {
      const parentId = nodes.find(n => n.id === id)?.parentId ?? ROOT_ID;
      setFocusId(parentId);
      const pIdx = breadcrumb.indexOf(parentId);
      setBreadcrumb(pIdx >= 0 ? breadcrumb.slice(0, pIdx + 1) : [ROOT_ID]);
    }
    try { soundEngine.playClick(); } catch (_) {}
  };

  const handleOpenAddRecord = () => {
    setEditingRecordId(null);
    setNewRecordContent("");
    setRecordImageUrls([]);
    setModal("add-record");
  };

  const handleOpenEditRecord = (record: MapRecord) => {
    setEditingRecordId(record.id);
    setNewRecordContent(record.content);
    setRecordImageUrls(record.imageUrls ?? []);
    setModal("add-record");
    try { soundEngine.playClick(); } catch (_) {}
  };

  const handleSaveRecord = () => {
    const content = newRecordContent.trim();
    if (!content) return;
    const imageUrls = recordImageUrls.length > 0 ? recordImageUrls : undefined;
    // 글씨체 아이템을 장착하고 있으면 그 글씨체로 저장한다 — 게시물 작성과 같은 방식.
    const fontEffect = activeEffects.find((item) => item.effect.type === "font");
    const fontFamily = fontEffect ? (fontEffect.effect.value as string) : undefined;
    if (editingRecordId) {
      setRecords(prev => prev.map(r =>
        r.id === editingRecordId ? { ...r, content, imageUrls, fontFamily } : r
      ));
    } else {
      setRecords(prev => [...prev, {
        id: `r-${Date.now()}`,
        nodeId: focusId,
        content,
        createdAt: Date.now(),
        imageUrls,
        fontFamily,
      }]);
    }
    if (hasMentionBridge(content)) recordEvent("use-mention");
    setNewRecordContent("");
    setRecordImageUrls([]);
    setEditingRecordId(null);
    setModal("none");
    try { soundEngine.playClick(); } catch (_) {}
  };

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handleMergeNodes = () => {
    const sourceId = mergeSourceId;
    const targetId = mergeTargetId;
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (sourceId === ROOT_ID || targetId === ROOT_ID) return;

    const source = nodes.find(n => n.id === sourceId);
    const target = nodes.find(n => n.id === targetId);
    if (!source || !target) return;

    // 1) 합칠 노드의 기록을 남길 노드로 이동
    setRecords(prev => prev.map(r => r.nodeId === sourceId ? { ...r, nodeId: targetId } : r));

    // 2) 합칠 노드의 하위 노드들을 남길 노드 아래로 재연결하고, 합칠 노드는 삭제.
    //    남길 노드에 메모가 없으면 합칠 노드의 메모를 물려받는다.
    setNodes(prev => prev
      .filter(n => n.id !== sourceId)
      .map(n => {
        if (n.parentId === sourceId) return { ...n, parentId: targetId };
        if (n.id === targetId && !n.note && source.note) return { ...n, note: source.note };
        return n;
      })
    );

    // 3) 화면을 남길 노드로 이동 (breadcrumb은 루트→…→남길 노드 경로로 재계산)
    const path: string[] = [];
    let cur: string | null = targetId;
    while (cur) {
      path.unshift(cur);
      if (cur === ROOT_ID) break;
      cur = nodes.find(n => n.id === cur)?.parentId ?? null;
    }
    setFocusId(targetId);
    setBreadcrumb(path[0] === ROOT_ID ? path : [ROOT_ID, targetId]);

    setModal("none");
    try { soundEngine.playClick(); } catch (_) {}
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const room = MAX_PHOTOS_PER_RECORD - recordImageUrls.length;
    if (room <= 0) {
      alert(`사진은 기록 하나에 최대 ${MAX_PHOTOS_PER_RECORD}장까지 첨부할 수 있어요.`);
      return;
    }
    const toUpload = files.slice(0, room);
    const tooLarge = toUpload.filter((f) => f.size > MAX_PHOTO_BYTES);
    if (tooLarge.length > 0) {
      alert(`사진 용량이 너무 커요 (${(tooLarge[0].size / 1024 / 1024).toFixed(1)}MB). 8MB 이하 사진만 첨부할 수 있어요.`);
    }

    const okFiles = toUpload.filter((f) => f.size <= MAX_PHOTO_BYTES);
    if (okFiles.length === 0) return;

    setRecordImageUploading(true);
    const uploaded: string[] = [];
    for (const file of okFiles) {
      const compressed = await compressImage(file);
      const url = await uploadRecordPhoto(compressed);
      if (url) uploaded.push(url);
    }
    setRecordImageUploading(false);

    if (uploaded.length > 0) {
      setRecordImageUrls((prev) => [...prev, ...uploaded]);
    }
    if (uploaded.length < okFiles.length) {
      alert("일부 사진 업로드에 실패했어요. 로그인 상태를 확인해주세요.");
    }
  };

  const handleDeleteRecord = (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
    setDeleteRecordId(null);
    setModal("none");
    try { soundEngine.playClick(); } catch (_) {}
  };

  const handleSaveName = () => {
    const name = editNameValue.trim();
    if (name) setUsername(name);
    setModal("none");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-28">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <motion.button whileTap={{ scale: 0.88 }} style={{ touchAction: "manipulation" }}
          onClick={() => {
            try { soundEngine.playClick(); } catch (_) {}
            if (breadcrumb.length > 1) {
              // Go back one level in the personal graph
              const prev = breadcrumb.slice(0, -1);
              setBreadcrumb(prev);
              setFocusId(prev[prev.length - 1]);
            } else {
              navigate("/");
            }
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-secondary/60 border border-border text-muted-foreground"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
        </motion.button>

        <div className="flex flex-col items-center" style={{ gap: 2 }}>
          <span className="text-foreground font-medium" style={{ fontSize: 15, letterSpacing: "0.04em" }}>마이맵</span>
          <span className="text-muted-foreground" style={{ fontSize: 10, opacity: 0.70, letterSpacing: "0.06em" }}>나만의 노드 지도</span>
        </div>

        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => setShowOverview(true)}
          style={{ touchAction: "manipulation" }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-secondary/60 border border-border text-muted-foreground"
          title="전체 지도 보기"
        >
          <Maximize2 size={15} strokeWidth={1.5} />
        </motion.button>
      </div>

      {/* ── Account ── */}
      <div className="flex items-center justify-between px-5 pb-3">
        {userId ? (
          <>
            <span style={{ fontSize: 12, color: "#6B6158" }}>{email ?? "로그인됨"}</span>
            <button
              onClick={() => void signOut()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "#6B6158",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <LogOut size={14} strokeWidth={1.5} />
              로그아웃
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowLogin(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#2C2420",
              background: "#F5F1EB",
              border: "1px solid rgba(44,36,32,0.08)",
              borderRadius: 999,
              padding: "6px 12px",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            <LogIn size={14} strokeWidth={1.5} />
            로그인하고 기록 남기기
          </button>
        )}
      </div>
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      {/* ── Breadcrumb ── */}
      <AnimatePresence>
        {breadcrumb.length > 1 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }} className="px-5 py-1.5 flex items-center gap-1 flex-wrap"
          >
            {breadcrumb.map((id, i) => {
              const n = displayNodes.find(nd => nd.id === id);
              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span style={{ fontSize: 9, opacity: 0.60, color: "var(--muted-foreground)" }}>›</span>}
                  <button onClick={() => { setFocusId(id); setBreadcrumb(breadcrumb.slice(0, i + 1)); }}
                    style={{ touchAction: "manipulation", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                    <span style={{
                      fontSize: 10, letterSpacing: "0.04em",
                      color: i === breadcrumb.length - 1 ? "var(--foreground)" : "var(--muted-foreground)",
                      opacity: i === breadcrumb.length - 1 ? 0.8 : 0.42,
                      fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                    }}>{n?.label ?? id}</span>
                  </button>
                </span>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mind Map Canvas ── */}
      <div ref={containerRef} className="relative w-full overflow-hidden" style={{ paddingTop: `${(H / W) * 100}%` }}>
        <div className="absolute inset-0">
          <div className="absolute pointer-events-none" style={{
            left: "22%", top: "12%", width: "56%", height: "62%",
            background: "radial-gradient(ellipse, rgba(212,196,176,0.16) 0%, transparent 68%)",
          }} />

          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
            className="absolute inset-0" style={{ overflow: "visible" }}>
            <AnimatePresence>
              {curves.map(({ id, d, color, midX, midY }) => {
                // 선 자체를 누르고 있거나, 그 선의 양 끝(지금 보는 노드 또는 반대쪽 노드)을
                // 누르고 있을 때만 "+" 표시를 보여준다 — 평소엔 안 보여서 화면이 깔끔하다.
                const isActive = hoveredPathId === id || hoveredNodeId === focusId || hoveredNodeId === id;
                return (
                  <g key={id}>
                    {/* 실제 보이는 얇은 선 — 활성화되면 살짝 두껍고 진하게 반응해서
                        "이 선도 누를 수 있다"는 걸 알려준다. */}
                    <motion.path d={d} fill="none" stroke={color} strokeLinecap="round"
                      strokeWidth={isActive ? 2.4 : 1.2}
                      style={{ pointerEvents: "none", transition: "stroke-width 0.15s" }}
                      initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: isActive ? 0.55 : 0.22 }}
                      exit={{ opacity: 0, transition: { duration: 0.18 } }}
                      transition={{ pathLength: { duration: 0.5, ease: "easeOut" }, opacity: { duration: 0.15 } }}
                    />
                    {/* 길 중간의 "+" — 평소엔 아예 안 보이다가, 선이나 연결된 노드를
                        누르고 있을 때만 나타난다. */}
                    {isActive && (
                      <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.15 }}>
                        <circle cx={midX} cy={midY} r={6} fill="none" stroke={color} strokeWidth={1} opacity={0.85} style={{ pointerEvents: "none" }} />
                        <path
                          d={`M ${midX - 2} ${midY} L ${midX + 2} ${midY} M ${midX} ${midY - 2} L ${midX} ${midY + 2}`}
                          stroke={color} strokeWidth={1} strokeLinecap="round" opacity={0.9}
                          style={{ pointerEvents: "none" }}
                        />
                      </motion.g>
                    )}
                    {/* 눈에는 안 보이지만 훨씬 넓게 — 길을 눌러서 바로 노드를 이을 수 있게 하는 탭 영역 */}
                    <path d={d} fill="none" stroke="transparent" strokeWidth={22} strokeLinecap="round"
                      style={{ pointerEvents: "stroke", cursor: "pointer", touchAction: "manipulation" }}
                      onClick={() => handlePathTap(id)}
                      onMouseEnter={() => setHoveredPathId(id)}
                      onMouseLeave={() => setHoveredPathId((prev) => (prev === id ? null : prev))}
                    />
                  </g>
                );
              })}
            </AnimatePresence>
          </svg>

          <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
            <AnimatePresence>
              {nodeList.map(({ id, pos, isCenter, isParent, node, bi }) => {
                const { x: px, y: py } = toPixel(pos.x, pos.y);
                const bc    = BREATHE[bi % BREATHE.length];
                const color = node?.color ?? "#888";
                return (
                  <motion.div key={id} className="absolute"
                    style={{ left: "50%", top: "50%", marginLeft: -HALF, marginTop: -HALF, zIndex: isCenter ? 20 : 10, pointerEvents: "auto" }}
                    animate={{ x: px, y: py, opacity: 1, scale: isCenter ? 1.3 : 1 }}
                    initial={{ x: px, y: py, opacity: 0, scale: isCenter ? 1.3 : 0.45 }}
                    exit={{ opacity: 0, scale: 0.45, transition: { duration: 0.2 } }}
                    transition={{
                      x: { type: "spring", damping: 24, stiffness: 300 },
                      y: { type: "spring", damping: 24, stiffness: 300 },
                      scale: { type: "spring", damping: 24, stiffness: 300 },
                      opacity: { duration: 0.25 },
                    }}
                  >
                    <button onClick={() => isCenter ? handleCenterTap() : navigateTo(id)}
                      onMouseEnter={() => setHoveredNodeId(id)}
                      onMouseLeave={() => setHoveredNodeId((prev) => (prev === id ? null : prev))}
                      style={{ touchAction: "manipulation", background: "none", border: "none", padding: 0, cursor: "pointer", display: "block" }}
                    >
                      {!isCenter && (
                        <motion.div className="absolute rounded-full pointer-events-none"
                          style={{ inset: -8, backgroundColor: `${color}09` }}
                          animate={{ scale: [1, 1.5, 1], opacity: [0.25, 0.75, 0.25] }}
                          transition={{ duration: bc.d, delay: bc.dl, repeat: Infinity, ease: "easeInOut" }}
                        />
                      )}
                      <div className="relative flex flex-col items-center justify-center rounded-full"
                        style={{
                          width: NODE_SIZE, height: NODE_SIZE,
                          backgroundColor: isCenter ? "var(--background)" : `${color}0C`,
                          border: isCenter ? "1px solid rgba(44,36,32,0.09)" : isParent ? `1.5px dashed ${color}50` : `1.5px solid ${color}3A`,
                          boxShadow: isCenter ? "0 4px 20px rgba(44,36,32,0.07)" : `0 2px 12px ${color}12`,
                        }}
                      >
                        {isCenter && <div className="absolute rounded-full pointer-events-none" style={{ inset: 5, border: "1px solid rgba(44,36,32,0.06)" }} />}
                        <span className="font-medium text-center"
                          style={{ color: isCenter ? "var(--foreground)" : color, fontSize: isCenter ? 13 : 10, letterSpacing: isCenter ? "0.1em" : "0.03em", lineHeight: 1.25, padding: "0 5px", wordBreak: "keep-all" }}>
                          {node?.label ?? id}
                        </span>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* 탈것 이동 애니메이션 */}
          {travelAnim && (() => {
            const p0 = toPixel(travelAnim.from.x, travelAnim.from.y);
            const p1 = toPixel(travelAnim.mid.x, travelAnim.mid.y);
            const p2 = toPixel(travelAnim.to.x, travelAnim.to.y);
            return (
              <motion.div
                className="absolute"
                style={{ left: "50%", top: "50%", marginLeft: -11, marginTop: -11, zIndex: 30, pointerEvents: "none" }}
                initial={{ x: p0.x, y: p0.y, opacity: 0 }}
                animate={{ x: [p0.x, p1.x, p2.x], y: [p0.y, p1.y, p2.y], opacity: [0, 1, 1, 0] }}
                transition={{ duration: vehicleSpeed, ease: "easeInOut" }}
              >
                <VehicleIcon size={22} strokeWidth={1.6} style={{ color: "#2C2420" }} />
              </motion.div>
            );
          })()}

          {/* Empty hint */}
          <AnimatePresence>
            {nodeList.length === 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.6 }}
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                style={{ paddingTop: "55%" }}>
                <span className="text-muted-foreground" style={{ fontSize: 11, opacity: 0.63, letterSpacing: "0.04em" }}>
                  아래 + 버튼으로 첫 노드를 추가해보세요
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Node add FAB ── */}
      <div className="flex justify-center mt-4">
        <motion.button whileTap={{ scale: 0.92 }}
          onClick={() => { setNewNodeColor(COLOR_PALETTE[nodes.length % COLOR_PALETTE.length]); setNewNodeLabel(""); setAddNodeParentId(null); setInsertBetweenChildId(null); setModal("add-node"); }}
          style={{
            touchAction: "manipulation", display: "flex", alignItems: "center", gap: 7,
            padding: "9px 20px", borderRadius: 99,
            backgroundColor: "var(--foreground)", color: "var(--primary-foreground)",
            border: "none", cursor: "pointer",
            boxShadow: "0 4px 18px rgba(44,36,32,0.16)",
            fontSize: 12, fontWeight: 500, letterSpacing: "0.04em",
          }}
        >
          <Plus size={14} strokeWidth={2.2} />
          노드 추가
        </motion.button>
      </div>

      {/* ── "오느" 특별 노드 — 내가 쓴 글/댓글/좋아요한 글 모아보기 ── */}
      <AnimatePresence>
        {focusId === ACTIVITY_ID && <ActivityPanel />}
      </AnimatePresence>

      {/* ── Recording Section — shown when a non-root, non-activity node is centered ── */}
      <AnimatePresence>
        {!isAtRoot && focusId !== ACTIVITY_ID && (
          <motion.div
            key={focusId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3 }}
            className="px-5 mt-6"
          >
            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-full" style={{ width: 9, height: 9, backgroundColor: focusNode?.color ?? "#888", flexShrink: 0 }} />
                <span className="text-foreground" style={{ fontSize: 13, letterSpacing: "0.04em" }}>
                  {focusNode?.label}의 기록
                </span>
                {focusRecords.length > 0 && (
                  <span className="text-muted-foreground" style={{ fontSize: 10, opacity: 0.60 }}>
                    {focusRecords.length}개
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Edit node button */}
                <button
                  onClick={handleOpenEditNode}
                  style={{
                    touchAction: "manipulation", background: "none", border: "none",
                    cursor: "pointer", padding: "5px 9px", borderRadius: 8,
                    backgroundColor: "rgba(44,36,32,0.05)", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Pencil size={12} strokeWidth={1.8} className="text-muted-foreground" />
                  <span className="text-muted-foreground" style={{ fontSize: 10, letterSpacing: "0.04em" }}>이름·색 수정</span>
                </button>

                {/* Delete node button */}
                <button
                  onClick={() => handleDeleteNode(focusId)}
                  style={{
                    touchAction: "manipulation", background: "none", border: "none",
                    cursor: "pointer", padding: "5px 9px", borderRadius: 8,
                    backgroundColor: "rgba(212,24,61,0.07)", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Trash2 size={12} strokeWidth={1.8} style={{ color: "var(--destructive)" }} />
                  <span style={{ fontSize: 10, color: "var(--destructive)", letterSpacing: "0.04em" }}>삭제</span>
                </button>

                {/* Add record button */}
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={handleOpenAddRecord}
                  style={{
                    touchAction: "manipulation", display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 8,
                    backgroundColor: `${focusNode?.color ?? "#888"}14`,
                    border: `1px solid ${focusNode?.color ?? "#888"}28`,
                    cursor: "pointer",
                  }}
                >
                  <PenLine size={12} strokeWidth={1.8} style={{ color: focusNode?.color ?? "#888" }} />
                  <span style={{ fontSize: 10, color: focusNode?.color ?? "#888", letterSpacing: "0.04em", fontWeight: 500 }}>기록 추가</span>
                </motion.button>
              </div>
            </div>

            {/* Records list */}
            {focusRecords.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                className="flex flex-col items-center justify-center py-10 rounded-2xl"
                style={{ backgroundColor: "var(--secondary)", border: "1px solid rgba(44,36,32,0.06)" }}>
                <PenLine size={22} strokeWidth={1.2} className="text-muted-foreground mb-3" style={{ opacity: 0.3 }} />
                <span className="text-muted-foreground" style={{ fontSize: 12, opacity: 0.63, letterSpacing: "0.04em" }}>
                  아직 기록이 없어요
                </span>
                <span className="text-muted-foreground mt-1" style={{ fontSize: 10, opacity: 0.60, letterSpacing: "0.04em" }}>
                  오늘의 생각을 남겨보세요
                </span>
              </motion.div>
            ) : (
              <div className="flex flex-col" style={{ gap: 10 }}>
                {focusRecords.map((record, i) => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                    onDoubleClick={() => setViewingRecord(record)}
                    style={{
                      padding: "14px 16px",
                      backgroundColor: "var(--card)",
                      borderRadius: 16,
                      border: "1px solid rgba(44,36,32,0.06)",
                      boxShadow: "0 1px 6px rgba(44,36,32,0.04)",
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1" style={{ minWidth: 0 }}>
                        <p className="text-muted-foreground mb-2" style={{ fontSize: 9, letterSpacing: "0.08em", opacity: 0.5 }}>
                          {formatDate(record.createdAt)}
                        </p>
                        {record.imageUrls && record.imageUrls.length > 0 && (
                          <div className="relative" style={{ marginBottom: 10 }}>
                            <ResolvedRecordImage
                              path={record.imageUrls[0]}
                              style={{
                                width: "100%",
                                maxHeight: 220,
                                objectFit: "cover",
                                borderRadius: 10,
                                display: "block",
                                cursor: "pointer",
                              }}
                              onClick={(e) => { e.stopPropagation(); void resolveRecordPhotoUrl(record.imageUrls![0]).then((u) => u && setLightboxUrl(u)); }}
                            />
                            {record.imageUrls.length > 1 && (
                              <span style={{
                                position: "absolute", bottom: 8, right: 8, padding: "2px 8px", borderRadius: 999,
                                backgroundColor: "rgba(44,36,32,0.6)", color: "#FAF8F5", fontSize: 10, fontWeight: 500,
                              }}>
                                +{record.imageUrls.length - 1}
                              </span>
                            )}
                          </div>
                        )}
                        <MentionText
                          text={record.content}
                          style={{
                            fontSize: 13, lineHeight: 1.65, letterSpacing: "0.02em", whiteSpace: "pre-wrap",
                            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                            ...(record.fontFamily ? { fontFamily: record.fontFamily } : {}),
                          }}
                        />
                        <p className="text-muted-foreground" style={{ fontSize: 10, marginTop: 6, opacity: 0.60 }}>
                          더블클릭해서 자세히 보기
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-2" style={{ flexShrink: 0, marginTop: 1 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEditRecord(record); }}
                          style={{
                            touchAction: "manipulation", background: "rgba(44,36,32,0.05)", border: "none",
                            padding: "4px 7px", borderRadius: 7, cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 3,
                          }}
                        >
                          <Pencil size={12} strokeWidth={1.8} className="text-muted-foreground" />
                          <span className="text-muted-foreground" style={{ fontSize: 9.5 }}>수정</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteRecordId(record.id); setModal("delete-record"); }}
                          style={{ touchAction: "manipulation", background: "none", border: "none", padding: "2px 4px", cursor: "pointer" }}
                        >
                          <Trash2 size={13} strokeWidth={1.5} className="text-muted-foreground" style={{ opacity: 0.3 }} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ────────────────────── Modals ────────────────────── */}

      {/* Add node */}
      <AnimatePresence>
        {modal === "add-node" && (
          <BottomSheet onClose={() => { setAddNodeParentId(null); setInsertBetweenChildId(null); setModal("none"); }}>
            <SheetHandle />
            <p className="text-foreground font-medium mb-1" style={{ fontSize: 15, letterSpacing: "0.04em" }}>새 노드 추가</p>
            <p className="text-muted-foreground mb-5" style={{ fontSize: 11, opacity: 0.5 }}>
              {insertBetweenChildId
                ? <>&ldquo;{focusNode?.label ?? "나"}&rdquo;와 &ldquo;{nodes.find(n => n.id === insertBetweenChildId)?.label}&rdquo; 사이에 끼워넣어요</>
                : <>&ldquo;{(addNodeParentId ? nodes.find(n => n.id === addNodeParentId)?.label : focusNode?.label) ?? "나"}&rdquo; 에 연결됩니다</>
              }
            </p>
            <SheetInput
              value={newNodeLabel} onChange={setNewNodeLabel} placeholder="이름 (예: 커피, 독서, 캠핑…)" autoFocus
              onEnter={handleAddNode}
              error={isNodeLabelDuplicate(newNodeLabel) ? "이미 있는 이름이에요" : undefined}
            />
            <ColorPicker value={newNodeColor} onChange={setNewNodeColor} />
            <SheetActions onCancel={() => { setAddNodeParentId(null); setInsertBetweenChildId(null); setModal("none"); }} onConfirm={handleAddNode} confirmLabel="추가하기" confirmDisabled={!newNodeLabel.trim() || isNodeLabelDuplicate(newNodeLabel)} />
          </BottomSheet>
        )}
      </AnimatePresence>

      {/* Add / edit record */}
      <AnimatePresence>
        {modal === "add-record" && (
          <BottomSheet onClose={() => setModal("none")}>
            <SheetHandle />
            <div className="flex items-center gap-2.5 mb-5">
              <div className="rounded-full" style={{ width: 9, height: 9, backgroundColor: focusNode?.color ?? "#888" }} />
              <p className="text-foreground font-medium" style={{ fontSize: 15, letterSpacing: "0.04em" }}>
                {focusNode?.label} {editingRecordId ? "기록 수정" : "기록"}
              </p>
            </div>
            <textarea
              value={newRecordContent}
              onChange={e => setNewRecordContent(e.target.value)}
              placeholder="오늘의 생각, 발견, 메모를 자유롭게 남겨보세요…"
              autoFocus
              rows={10}
              className="w-full outline-none text-foreground placeholder:text-muted-foreground resize-none text-[16px] sm:text-[14px]"
              style={{
                padding: "14px 16px", display: "block", width: "100%",
                backgroundColor: "var(--secondary)", border: "1px solid color-mix(in srgb, var(--foreground) 8%, transparent)",
                borderRadius: 14, marginBottom: 12, lineHeight: 1.7,
                ...(activeEffects.find((item) => item.effect.type === "font")
                  ? { fontFamily: activeEffects.find((item) => item.effect.type === "font")!.effect.value as string }
                  : {}),
              }}
            />
            <p className="text-muted-foreground" style={{ fontSize: 10.5, lineHeight: 1.5, marginBottom: 12, opacity: 0.75 }}>
              <span style={{ color: "var(--foreground)" }}>@관심사</span>를 적으면 그 커뮤니티로,{" "}
              <span style={{ color: "var(--foreground)" }}>!관심사</span>를 적으면 내 마이맵으로 연결돼요
            </p>

            {/* Photo attach — 여러 장 첨부 가능 */}
            {recordImageUrls.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {recordImageUrls.map((url, i) => (
                  <div key={url + i} className="relative" style={{ width: 76, height: 76, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
                    <ResolvedRecordImage path={url} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <button
                      onClick={() => setRecordImageUrls((prev) => prev.filter((u) => u !== url))}
                      style={{
                        position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 99,
                        backgroundColor: "rgba(44,36,32,0.6)", border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation",
                      }}
                    >
                      <X size={11} strokeWidth={2} color="#FAF8F5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {recordImageUrls.length < MAX_PHOTOS_PER_RECORD && (
              <button
                onClick={handlePickPhoto}
                disabled={recordImageUploading}
                style={{
                  touchAction: "manipulation", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  width: "100%", padding: "12px", borderRadius: 14, marginBottom: 16,
                  backgroundColor: "var(--secondary)", border: "1px dashed rgba(44,36,32,0.18)",
                  cursor: recordImageUploading ? "default" : "pointer", color: "var(--muted-foreground)",
                }}
              >
                <ImagePlus size={14} strokeWidth={1.6} />
                <span style={{ fontSize: 12, letterSpacing: "0.03em" }}>
                  {recordImageUploading ? "업로드 중..." : recordImageUrls.length > 0 ? "사진 더 추가" : "사진 첨부 (최대 6장)"}
                </span>
              </button>
            )}

            <SheetActions onCancel={() => setModal("none")} onConfirm={handleSaveRecord} confirmLabel="저장" confirmDisabled={!newRecordContent.trim()} />
          </BottomSheet>
        )}
      </AnimatePresence>

      {/* 기록 자세히 보기 (더블클릭) */}
      <AnimatePresence>
        {viewingRecord && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setViewingRecord(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(44,36,32,0.4)", zIndex: 200 }}
            />
            <motion.div
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
              style={{
                position: "fixed", left: 0, right: 0, margin: "0 auto", bottom: 0,
                width: "100%", maxWidth: 480, height: "min(680px, 88dvh)", maxHeight: "88dvh",
                background: "var(--card)", borderTopLeftRadius: 22, borderTopRightRadius: 22,
                zIndex: 201, boxShadow: "0 -8px 28px rgba(0,0,0,0.2)",
                display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 22px 14px", flexShrink: 0, borderBottom: "1px solid color-mix(in srgb, var(--foreground) 8%, transparent)" }}>
                <p className="text-muted-foreground" style={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.6 }}>
                  {formatDate(viewingRecord.createdAt)}
                </p>
                <button onClick={() => setViewingRecord(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                  <X size={18} style={{ color: "var(--muted-foreground)" }} />
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 22px calc(24px + env(safe-area-inset-bottom))" }}>
                {viewingRecord.imageUrls && viewingRecord.imageUrls.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    {viewingRecord.imageUrls.map((path, i) => (
                      <ResolvedRecordImage
                        key={path + i}
                        path={path}
                        style={{ width: "100%", borderRadius: 14, display: "block", cursor: "pointer" }}
                        onClick={() => void resolveRecordPhotoUrl(path).then((u) => u && setLightboxUrl(u))}
                      />
                    ))}
                  </div>
                )}
                <MentionText
                  text={viewingRecord.content}
                  style={{ fontSize: 14, lineHeight: 1.75, letterSpacing: "0.02em", whiteSpace: "pre-wrap", display: "block", color: "var(--foreground)", ...(viewingRecord.fontFamily ? { fontFamily: viewingRecord.fontFamily } : {}) }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit node */}
      <AnimatePresence>
        {modal === "edit-node" && (
          <BottomSheet onClose={() => setModal("none")}>
            <SheetHandle />
            <p className="text-foreground font-medium mb-5" style={{ fontSize: 15, letterSpacing: "0.04em" }}>노드 수정</p>
            <SheetInput
              value={newNodeLabel} onChange={setNewNodeLabel} placeholder="이름" autoFocus
              onEnter={handleSaveEditNode}
              error={isNodeLabelDuplicate(newNodeLabel, focusId) ? "이미 있는 이름이에요" : undefined}
            />
            <ColorPicker value={newNodeColor} onChange={setNewNodeColor} />
            <SheetActions onCancel={() => setModal("none")} onConfirm={handleSaveEditNode} confirmLabel="저장" confirmDisabled={!newNodeLabel.trim() || isNodeLabelDuplicate(newNodeLabel, focusId)} />
          </BottomSheet>
        )}
      </AnimatePresence>

      {/* Merge nodes (노드 통합 아이템) */}
      <AnimatePresence>
        {modal === "merge-node" && (() => {
          const mergeable = nodes.filter(n => n.id !== ROOT_ID);
          const selectStyle: React.CSSProperties = {
            width: "100%", padding: "12px 14px", display: "block",
            backgroundColor: "var(--secondary)", border: "1px solid rgba(44,36,32,0.08)",
            borderRadius: 12, marginBottom: 12, color: "var(--foreground)",
            appearance: "none" as const, outline: "none",
          };
          const sourceNode = nodes.find(n => n.id === mergeSourceId);
          const targetNode = nodes.find(n => n.id === mergeTargetId);
          const canMerge = !!mergeSourceId && !!mergeTargetId && mergeSourceId !== mergeTargetId;

          return (
            <BottomSheet onClose={() => setModal("none")}>
              <SheetHandle />
              <p className="text-foreground font-medium mb-1" style={{ fontSize: 15, letterSpacing: "0.04em" }}>노드 통합</p>
              <p className="text-muted-foreground mb-5" style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.6 }}>
                합쳐질 노드의 기록과 하위 노드가 남길 노드로 옮겨지고, 합쳐진 노드는 사라져요.
              </p>

              {mergeable.length < 2 ? (
                <p className="text-muted-foreground mb-6" style={{ fontSize: 13, opacity: 0.6 }}>
                  통합하려면 노드가 2개 이상 필요해요.
                </p>
              ) : (
                <>
                  <label className="text-muted-foreground" style={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.55, display: "block", marginBottom: 6 }}>
                    합쳐질 노드 (사라짐)
                  </label>
                  <select
                    value={mergeSourceId}
                    onChange={e => setMergeSourceId(e.target.value)}
                    className="text-[16px] sm:text-[14px]"
                    style={selectStyle}
                  >
                    <option value="">선택하세요</option>
                    {mergeable.map(n => (
                      <option key={n.id} value={n.id} disabled={n.id === mergeTargetId}>{n.label}</option>
                    ))}
                  </select>

                  <label className="text-muted-foreground" style={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.55, display: "block", marginBottom: 6 }}>
                    남길 노드
                  </label>
                  <select
                    value={mergeTargetId}
                    onChange={e => setMergeTargetId(e.target.value)}
                    className="text-[16px] sm:text-[14px]"
                    style={selectStyle}
                  >
                    <option value="">선택하세요</option>
                    {mergeable.map(n => (
                      <option key={n.id} value={n.id} disabled={n.id === mergeSourceId}>{n.label}</option>
                    ))}
                  </select>

                  {canMerge && sourceNode && targetNode && (
                    <div
                      className="mb-4"
                      style={{
                        padding: "12px 14px",
                        backgroundColor: `${targetNode.color}0C`,
                        border: `1px solid ${targetNode.color}28`,
                        borderRadius: 12,
                      }}
                    >
                      <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--foreground)" }}>
                        &ldquo;{sourceNode.label}&rdquo;의 기록 {records.filter(r => r.nodeId === sourceNode.id).length}개와
                        하위 노드 {nodes.filter(n => n.parentId === sourceNode.id).length}개가
                        &ldquo;{targetNode.label}&rdquo;(으)로 옮겨져요.
                      </p>
                    </div>
                  )}
                </>
              )}

              <SheetActions
                onCancel={() => setModal("none")}
                onConfirm={handleMergeNodes}
                confirmLabel="통합하기"
                confirmDisabled={!canMerge}
              />
            </BottomSheet>
          );
        })()}
      </AnimatePresence>

      {/* 사진 첨부용 숨은 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handlePhotoSelected(e)}
        style={{ display: "none" }}
      />

      {/* Edit username */}
      <AnimatePresence>
        {modal === "edit-name" && (
          <BottomSheet onClose={() => setModal("none")}>
            <SheetHandle />
            <p className="text-foreground font-medium mb-5" style={{ fontSize: 15, letterSpacing: "0.04em" }}>이름 편집</p>
            <SheetInput value={editNameValue} onChange={setEditNameValue} placeholder="닉네임" autoFocus onEnter={handleSaveName} />
            <SheetActions onCancel={() => setModal("none")} onConfirm={handleSaveName} confirmLabel="저장" confirmDisabled={!editNameValue.trim()} />
          </BottomSheet>
        )}
      </AnimatePresence>

      {/* Delete record confirm */}
      <AnimatePresence>
        {modal === "delete-record" && deleteRecordId && (
          <BottomSheet onClose={() => setModal("none")}>
            <SheetHandle />
            <p className="text-foreground font-medium mb-2" style={{ fontSize: 15, letterSpacing: "0.04em" }}>기록 삭제</p>
            <p className="text-muted-foreground mb-6" style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.6 }}>
              이 기록을 삭제할까요? 삭제 후 복구할 수 없어요.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setModal("none")}
                style={{ flex: 1, padding: "12px", borderRadius: 12, fontSize: 13, backgroundColor: "var(--secondary)", border: "none", cursor: "pointer", color: "var(--muted-foreground)", touchAction: "manipulation" }}>
                취소
              </button>
              <button onClick={() => handleDeleteRecord(deleteRecordId)}
                style={{ flex: 2, padding: "12px", borderRadius: 12, fontSize: 13, fontWeight: 500, backgroundColor: "rgba(212,24,61,0.1)", border: "none", cursor: "pointer", color: "var(--destructive)", touchAction: "manipulation" }}>
                삭제
              </button>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      {/* Full map overview overlay */}
      <AnimatePresence>
        {showOverview && (
          activeEffects.some((item) => item.effect.value === "3d-mymap") ? (
            <MapOverview3D
              nodes={nodes}
              displayNodes={displayNodes}
              onClose={() => setShowOverview(false)}
              onDeleteNode={handleDeleteNodeFromOverview}
              onNavigate={(id) => {
                setShowOverview(false);
                setFocusId(id);
                setBreadcrumb(buildBreadcrumb(id, nodes));
                try { soundEngine.playClick(); } catch (_) {}
              }}
            />
          ) : (
            <MapOverview
              nodes={nodes}
              displayNodes={displayNodes}
              onClose={() => setShowOverview(false)}
              onDeleteNode={handleDeleteNodeFromOverview}
              onNavigate={(id) => {
                setShowOverview(false);
                setFocusId(id);
                setBreadcrumb(buildBreadcrumb(id, nodes));
                try { soundEngine.playClick(); } catch (_) {}
              }}
            />
          )
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Map Overview ─────────────────────────────────────────────────────────────

function getRecordCount(nodeId: string): number {
  try {
    const raw = localStorage.getItem("oneu-mymap-records");
    if (!raw) return 0;
    const recs: { nodeId: string }[] = JSON.parse(raw);
    return recs.filter(r => r.nodeId === nodeId).length;
  } catch { return 0; }
}

function MapOverview({
  nodes,
  displayNodes,
  onClose,
  onNavigate,
  onDeleteNode,
}: {
  nodes: MapNode[];
  displayNodes: MapNode[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  onDeleteNode: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 꾹 누르면 삭제 — 노드마다 훅을 따로 못 부르니(개수가 동적이라), 지금 누르고 있는
  // 노드 id 하나만 기억하는 타이머 하나를 여기서 공유해서 쓴다.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredId = useRef<string | null>(null);
  const handleNodePointerDown = (id: string) => {
    if (id === ROOT_ID) return; // 뿌리 노드는 지울 수 없다
    longPressTriggeredId.current = null;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTriggeredId.current = id;
      const label = nodes.find(n => n.id === id)?.label ?? "";
      if (window.confirm(`"${label}" 노드를 삭제할까요?\n하위 노드와 기록도 함께 사라져요.`)) {
        onDeleteNode(id);
      }
    }, 550);
  };
  const handleNodePointerUp = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const handleNodeClick = (id: string) => {
    if (longPressTriggeredId.current === id) { longPressTriggeredId.current = null; return; }
    onNavigate(id);
  };

  // Abstract layout (centered at 0,0) — viewBox handles fit-to-screen
  const positions = useMemo(() => computeAbstractLayout(nodes), [nodes]);

  const edges = useMemo(
    () => nodes.filter(n => n.parentId).map(n => ({
      from: n.parentId!,
      to: n.id,
      color: displayNodes.find(d => d.id === n.id)?.color ?? "#888",
    })),
    [nodes, displayNodes]
  );

  const recordCounts = useMemo(
    () => Object.fromEntries(nodes.map(n => [n.id, getRecordCount(n.id)])),
    [nodes]
  );

  // Compute viewBox from bounding box so ALL nodes always fit in view
  const viewBox = useMemo(() => {
    const pts = [...positions.values()];
    if (pts.length === 0) return "-180 -180 360 360";
    const R_MAX = 30; // max node radius
    const LABEL_BELOW = 32; // space for label below node
    const PAD = 48;
    const minX = Math.min(...pts.map(p => p.x)) - R_MAX - PAD;
    const maxX = Math.max(...pts.map(p => p.x)) + R_MAX + PAD;
    const minY = Math.min(...pts.map(p => p.y)) - R_MAX - PAD;
    const maxY = Math.max(...pts.map(p => p.y)) + R_MAX + LABEL_BELOW + PAD;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [positions]);

  const R_ROOT = 26;
  const R_NODE = 19;

  return (
    <motion.div
      className="fixed inset-0 z-[95] flex flex-col"
      style={{ backgroundColor: "var(--background)" }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 pt-12 pb-4 flex-shrink-0"
        style={{ borderBottom: "1px solid color-mix(in srgb, var(--foreground) 7%, transparent)" }}
      >
        <div>
          <p className="text-foreground font-medium" style={{ fontSize: 16, letterSpacing: "0.03em" }}>전체 지도</p>
          <p className="text-muted-foreground" style={{ fontSize: 11, opacity: 0.67, marginTop: 1 }}>
            {nodes.length}개 노드 · 탭하면 이동
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={onClose}
          style={{ touchAction: "manipulation", backgroundColor: "var(--secondary)" }}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-border text-muted-foreground"
        >
          <X size={15} strokeWidth={1.8} />
        </motion.button>
      </div>

      {/* ── Full-fit SVG canvas ── */}
      <div className="flex-1 relative" style={{ backgroundColor: "var(--secondary)" }}>

        {/* Background texture */}
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" style={{ opacity: 0.04 }}>
          <defs>
            <pattern id="ov-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--foreground)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ov-dots)" />
        </svg>

        {/* Central glow */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div style={{
            width: 300, height: 300,
            background: "radial-gradient(ellipse, color-mix(in srgb, var(--accent) 24%, transparent) 0%, transparent 70%)",
            borderRadius: "50%",
          }} />
        </div>

        {nodes.length <= 1 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground" style={{ fontSize: 13, opacity: 0.60 }}>노드를 추가해보세요</p>
          </div>
        ) : (
          <svg
            viewBox={viewBox}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            style={{ position: "absolute", inset: 0 }}
          >
            {/* ── Connection lines ── */}
            {edges.map(({ from, to, color }) => {
              const p1 = positions.get(from);
              const p2 = positions.get(to);
              if (!p1 || !p2) return null;
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;
              const dx = p2.x - p1.x, dy = p2.y - p1.y;
              const len = Math.hypot(dx, dy) || 1;
              const curve = `M ${p1.x} ${p1.y} Q ${mx - (dy / len) * 16} ${my + (dx / len) * 16} ${p2.x} ${p2.y}`;
              const active = hoveredId === from || hoveredId === to;
              return (
                <path
                  key={`e-${from}-${to}`}
                  d={curve}
                  fill="none"
                  stroke={color}
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeOpacity={active ? 0.8 : 0.38}
                  strokeLinecap="round"
                />
              );
            })}

            {/* ── Nodes ── */}
            {displayNodes.map((node, i) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              const isRoot = node.id === ROOT_ID;
              const r = isRoot ? R_ROOT : R_NODE;
              const color = node.color;
              const active = hoveredId === node.id;
              const recCount = recordCounts[node.id] ?? 0;

              return (
                <motion.g
                  key={node.id}
                  onClick={() => handleNodeClick(node.id)}
                  onPointerDown={() => handleNodePointerDown(node.id)}
                  onPointerUp={handleNodePointerUp}
                  onPointerLeave={handleNodePointerUp}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onTouchStart={() => setHoveredId(node.id)}
                  onTouchEnd={() => setHoveredId(null)}
                  style={{ cursor: "pointer", touchAction: "manipulation" }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", damping: 18, stiffness: 260, delay: 0.04 + i * 0.022 }}
                >
                  {/* Expanded hit target */}
                  <circle cx={pos.x} cy={pos.y} r={r + 16} fill="transparent" />

                  {/* Active/hover halo */}
                  {active && (
                    <circle cx={pos.x} cy={pos.y} r={r + 9}
                      fill={`${color}14`} stroke={color} strokeWidth={1} strokeOpacity={0.35} />
                  )}

                  {/* Root dashed outer ring */}
                  {isRoot && (
                    <circle cx={pos.x} cy={pos.y} r={r + 10}
                      fill="none" stroke={color}
                      strokeWidth={0.9} strokeOpacity={0.18} strokeDasharray="4 5" />
                  )}

                  {/* Main circle — filled solid for visibility */}
                  <circle
                    cx={pos.x} cy={pos.y} r={r}
                    fill={isRoot ? "var(--foreground)" : `${color}60`}
                    stroke={color}
                    strokeWidth={isRoot ? 0 : 1.8}
                    strokeOpacity={0.65}
                  />

                  {/* Inner ring (root only) */}
                  {isRoot && (
                    <circle cx={pos.x} cy={pos.y} r={r - 7}
                      fill="none" stroke="rgba(250,248,245,0.3)" strokeWidth={1} />
                  )}

                  {/* Label INSIDE for root, BELOW for others */}
                  {isRoot ? (
                    <text
                      x={pos.x} y={pos.y + 0.5}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="#FAF8F5"
                      fontSize={13} fontWeight={700} fontFamily="inherit"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {node.label}
                    </text>
                  ) : (
                    <>
                      {/* Initial glyph inside circle */}
                      <text
                        x={pos.x} y={pos.y + 0.5}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={color} fontSize={11} fontWeight={700}
                        fontFamily="inherit" fillOpacity={0.9}
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {node.label.charAt(0)}
                      </text>

                      {/* Full name below — plain text, clean background chip */}
                      <rect
                        x={pos.x - (Math.min(node.label.length, 7) * 5.8 + 10) / 2}
                        y={pos.y + r + 5}
                        width={Math.min(node.label.length, 7) * 5.8 + 10}
                        height={16}
                        rx={8}
                        fill="rgba(250,248,245,0.88)"
                        style={{ pointerEvents: "none" }}
                      />
                      <text
                        x={pos.x} y={pos.y + r + 14}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={color} fontSize={9} fontWeight={600}
                        fontFamily="inherit" fillOpacity={1}
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {node.label.length > 7 ? node.label.slice(0, 6) + "…" : node.label}
                      </text>
                    </>
                  )}

                  {/* Record count badge */}
                  {recCount > 0 && (
                    <>
                      <circle cx={pos.x + r - 2} cy={pos.y - r + 2} r={8}
                        fill={isRoot ? "#FAF8F5" : color} fillOpacity={0.95}
                        style={{ pointerEvents: "none" }} />
                      <text
                        x={pos.x + r - 2} y={pos.y - r + 2.5}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={isRoot ? "var(--foreground)" : "#FAF8F5"}
                        fontSize={7} fontWeight={800}
                        fontFamily="inherit"
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {recCount > 9 ? "9+" : recCount}
                      </text>
                    </>
                  )}
                </motion.g>
              );
            })}
          </svg>
        )}
      </div>

      {/* ── Slim footer ── */}
      <div
        className="flex-shrink-0 flex items-center justify-center gap-5 py-2.5"
        style={{ borderTop: "1px solid rgba(44,36,32,0.06)", backgroundColor: "var(--background)" }}
      >
        {[
          { dot: "var(--foreground)", label: "나" },
          { dot: "#8B6D44", label: "노드", opacity: 0.45 },
          { badge: true, label: "기록 수" },
        ].map(({ dot, badge, label, opacity }, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {badge ? (
              <div style={{ width: 13, height: 13, borderRadius: 99, backgroundColor: "#8B6D44", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 6.5, color: "white", fontWeight: 800 }}>3</span>
              </div>
            ) : (
              <div style={{ width: 9, height: 9, borderRadius: 99, backgroundColor: dot, opacity: opacity ?? 0.75 }} />
            )}
            <span style={{ fontSize: 9.5, color: "var(--muted-foreground)", opacity: 0.72 }}>{label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Map Overview (3D 위젯 장착 시) ──────────────────────────────────────────
// 관리자 노드 관리 화면과 같은 기법(d3-force, 드래그+확대) — 정해진 방사형 배치
// 대신 노드들이 서로 밀고 당기며 자리를 잡는다. "입체감"은 실제 3D가 아니라,
// 중심(나)에서 멀어질수록 작아지고 흐려지는 것으로 원근감을 흉내낸다.
function MapOverview3D({
  nodes,
  displayNodes,
  onClose,
  onNavigate,
  onDeleteNode,
}: {
  nodes: MapNode[];
  displayNodes: MapNode[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  onDeleteNode: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 400, h: 700 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.max(280, width), h: Math.max(400, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const recordCounts = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, getRecordCount(n.id)])),
    [nodes]
  );

  // 뿌리(나)로부터의 깊이 — 멀수록 작고 흐리게, 원근감을 흉내낸다.
  const depthOf = useMemo(() => {
    const map: Record<string, number> = { [ROOT_ID]: 0 };
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (map[n.id] !== undefined) continue;
        if (n.parentId && map[n.parentId] !== undefined) {
          map[n.id] = map[n.parentId] + 1;
          changed = true;
        }
      }
    }
    nodes.forEach((n) => { if (map[n.id] === undefined) map[n.id] = 1; });
    return map;
  }, [nodes]);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;
    const { w, h } = dims;

    const nodesData = displayNodes.map((n) => ({ ...n, depth: depthOf[n.id] ?? 1 }));
    const links = nodes.filter((n) => n.parentId).map((n) => ({ source: n.parentId, target: n.id }));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", [0, 0, w, h] as unknown as string);
    const g = svg.append("g");
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on("zoom", (event) => g.attr("transform", event.transform)) as any);

    const simulation = d3
      .forceSimulation(nodesData as any)
      .force("link", d3.forceLink(links as any).id((d: any) => d.id).distance(70).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collide", d3.forceCollide().radius((d: any) => (d.id === ROOT_ID ? 34 : 26 - d.depth * 1.5)));

    const linkSel = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", "var(--foreground)")
      .attr("stroke-opacity", 0.16)
      .attr("stroke-width", 1.4);

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressTriggeredId: string | null = null;
    let dragMoved = false;

    const nodeSel = g.append("g").selectAll("g").data(nodesData).join("g")
      .style("cursor", "pointer")
      .call(d3.drag<any, any>()
        .on("start", (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.2).restart();
          d.fx = d.x; d.fy = d.y;
          dragMoved = false;
          longPressTriggeredId = null;
          if (d.id === ROOT_ID) return; // 뿌리 노드는 지울 수 없다
          if (longPressTimer) clearTimeout(longPressTimer);
          longPressTimer = setTimeout(() => {
            if (dragMoved) return; // 실제로 끌어서 옮기는 중이면 삭제로 안 친다
            longPressTriggeredId = d.id;
            if (window.confirm(`"${d.label}" 노드를 삭제할까요?\n하위 노드와 기록도 함께 사라져요.`)) {
              onDeleteNode(d.id);
            }
          }, 550);
        })
        .on("drag", (event, d: any) => {
          dragMoved = true;
          d.fx = event.x; d.fy = event.y;
        })
        .on("end", (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        }) as any)
      .on("click", (_event, d: any) => {
        if (longPressTriggeredId === d.id) { longPressTriggeredId = null; return; }
        onNavigate(d.id);
      });

    nodeSel.append("circle")
      .attr("r", (d: any) => (d.id === ROOT_ID ? 28 : Math.max(12, 20 - d.depth * 1.8)))
      .attr("fill", (d: any) => d.color)
      .attr("fill-opacity", (d: any) => Math.max(0.5, 1 - d.depth * 0.12))
      .style("filter", (d: any) => `drop-shadow(0 ${2 + d.depth}px ${4 + d.depth * 2}px rgba(0,0,0,${0.22 - d.depth * 0.02}))`);

    nodeSel.filter((d: any) => (recordCounts[d.id] ?? 0) > 0)
      .append("circle")
      .attr("r", 3)
      .attr("cx", (d: any) => (d.id === ROOT_ID ? 20 : 14 - d.depth))
      .attr("cy", (d: any) => -(d.id === ROOT_ID ? 20 : 14 - d.depth))
      .attr("fill", "#D4A857");

    nodeSel.append("text")
      .text((d: any) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", (d: any) => (d.id === ROOT_ID ? 42 : 30 - d.depth))
      .attr("font-size", (d: any) => Math.max(8, 11 - d.depth))
      .attr("fill", "var(--foreground)")
      .attr("fill-opacity", (d: any) => Math.max(0.55, 1 - d.depth * 0.1))
      .style("pointer-events", "none")
      .style("font-family", "system-ui, sans-serif");

    simulation.on("tick", () => {
      linkSel.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y).attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      nodeSel.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [nodes, displayNodes, dims, depthOf, recordCounts]);

  return (
    <motion.div
      className="fixed inset-0 z-[95] flex flex-col"
      style={{ backgroundColor: "var(--background)" }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between px-5 pt-12 pb-4 flex-shrink-0"
        style={{ borderBottom: "1px solid color-mix(in srgb, var(--foreground) 7%, transparent)" }}>
        <div>
          <p className="text-foreground font-medium" style={{ fontSize: 16, letterSpacing: "0.03em" }}>전체 지도</p>
          <p className="text-muted-foreground" style={{ fontSize: 11, opacity: 0.67, marginTop: 1 }}>
            {nodes.length}개 노드 · 드래그해서 움직이기 · 탭하면 이동
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onClose}
          style={{ touchAction: "manipulation", backgroundColor: "var(--secondary)" }}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-border text-muted-foreground">
          <X size={15} strokeWidth={1.8} />
        </motion.button>
      </div>
      <div ref={containerRef} className="flex-1 relative" style={{ backgroundColor: "var(--secondary)" }}>
        {nodes.length <= 1 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground" style={{ fontSize: 13, opacity: 0.60 }}>노드를 추가해보세요</p>
          </div>
        ) : (
          <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
        )}
      </div>
    </motion.div>
  );
}

// ─── Sheet sub-components ─────────────────────────────────────────────────────

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80]" onClick={onClose}>
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(44,36,32,0.22)" }} />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
        style={{ backgroundColor: "var(--card)", padding: "20px 24px 44px" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function SheetHandle() {
  return <div className="mx-auto mb-5 rounded-full" style={{ width: 36, height: 4, backgroundColor: "rgba(44,36,32,0.11)" }} />;
}

function SheetInput({ value, onChange, placeholder, autoFocus, onEnter, error }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onEnter?: () => void; error?: string;
}) {
  return (
    <>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        className="w-full outline-none text-foreground placeholder:text-muted-foreground text-[16px] sm:text-[14px]"
        style={{
          padding: "12px 14px", display: "block", width: "100%", backgroundColor: "var(--secondary)",
          border: error ? "1px solid var(--destructive)" : "1px solid rgba(44,36,32,0.08)",
          borderRadius: 12, marginBottom: error ? 4 : 12,
        }}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
      />
      {error && <p style={{ fontSize: 10, color: "var(--destructive)", marginBottom: 12 }}>{error}</p>}
    </>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="mb-5">
      <span className="text-muted-foreground" style={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.55 }}>색상</span>
      <div className="flex gap-2 mt-2.5 flex-wrap">
        {COLOR_PALETTE.map(c => (
          <button key={c} onClick={() => onChange(c)}
            style={{ touchAction: "manipulation", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 99, backgroundColor: c,
              border: value === c ? "2.5px solid var(--foreground)" : "2.5px solid transparent",
              transform: value === c ? "scale(1.2)" : "scale(1)",
              transition: "transform 0.15s",
            }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SheetActions({ onCancel, onConfirm, confirmLabel, confirmDisabled }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmDisabled?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <button onClick={onCancel}
        style={{ flex: 1, padding: "12px", borderRadius: 12, fontSize: 13, backgroundColor: "var(--secondary)", border: "none", cursor: "pointer", color: "var(--muted-foreground)", touchAction: "manipulation" }}>
        취소
      </button>
      <button onClick={onConfirm} disabled={confirmDisabled}
        style={{ flex: 2, padding: "12px", borderRadius: 12, fontSize: 13, fontWeight: 500, letterSpacing: "0.04em", backgroundColor: confirmDisabled ? "var(--muted)" : "var(--foreground)", border: "none", cursor: confirmDisabled ? "default" : "pointer", color: "var(--primary-foreground)", touchAction: "manipulation" }}>
        {confirmLabel}
      </button>
    </div>
  );
}
