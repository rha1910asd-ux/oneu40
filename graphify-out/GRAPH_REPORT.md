# Graph Report - oneu40  (2026-10-24)

## Corpus Check
- Large corpus: 3025 files · ~3,585,517 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 180 nodes · 323 edges · 16 communities (7 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.84)
- Token cost: 68,565 input · 0 output

## Community Hubs (Navigation)
- Node Graph Admin Modal
- App Shell & Link Previews
- MyNode Screen (root copy)
- MyNode Screen (src)
- My Map Data (root copy)
- Post Detail View
- My Map Data (src)
- Vercel Rewrites

## God Nodes (most connected - your core abstractions)
1. `MyNode()` - 22 edges
2. `MyNode()` - 17 edges
3. `index.html App Shell (오느)` - 11 edges
4. `syncNow()` - 7 edges
5. `ensureMyMapNode()` - 7 edges
6. `syncNow()` - 7 edges
7. `ensureMyMapNode()` - 7 edges
8. `addMyMapRecord()` - 6 edges
9. `addMyMapRecord()` - 6 edges
10. `loadNodes()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `MyNode()` --indirect_call--> `loadNodes()`  [INFERRED]
  MyNode.tsx → myMap.ts
- `MyNode()` --indirect_call--> `loadRecords()`  [INFERRED]
  MyNode.tsx → myMap.ts
- `MyNode()` --indirect_call--> `loadRecords()`  [INFERRED]
  src/app/screens/MyNode.tsx → src/app/data/myMap.ts
- `MyNode()` --calls--> `loadNodes()`  [EXTRACTED]
  src/app/screens/MyNode.tsx → src/app/data/myMap.ts
- `MyNode()` --calls--> `saveNodes()`  [EXTRACTED]
  src/app/screens/MyNode.tsx → src/app/data/myMap.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **App Boot Flow (config.js -> bundle -> #root)** — config, index_vite_bundle_entry, index_modulepreload_chunks, index_root_mount [INFERRED 0.85]
- **Link Share Preview Metadata** — index_og_link_preview_defaults, api_post_preview, index_oneu_app [EXTRACTED 1.00]

## Communities (16 total, 9 thin omitted)

### Community 0 - "Node Graph Admin Modal"
Cohesion: 0.12
Nodes (12): CATEGORY_COLORS, NodeGraphAdminModal(), NodeGraphAdminModalProps, NodeGraphAdminModal, SettingsModal(), SettingsModalProps, CATEGORY_COLORS, NodeGraphAdminModal() (+4 more)

### Community 1 - "App Shell & Link Previews"
Cohesion: 0.08
Nodes (19): Google Fonts (Nanum Pen Script, Jua, Nanum Myeongjo) Shop Item Fonts, index.html App Shell (오느), Modulepreload Chunks (react, supabase-realtime/auth/core, motion), 오느 (Oneu) Interest-Based Community, PWA / Apple Web App Meta, #root React Mount Point, Supabase (realtime, auth, core), Vite Bundle Entry (assets/index-*.js) (+11 more)

### Community 2 - "MyNode Screen (root copy)"
Cohesion: 0.11
Nodes (20): BottomSheet(), BREATHE, buildBreadcrumb(), COLOR_PALETTE, ColorPicker(), computeAbstractLayout(), computePositions(), curveD() (+12 more)

### Community 3 - "MyNode Screen (src)"
Cohesion: 0.16
Nodes (23): pullMyMapFromSupabase(), resolveRecordPhotoUrl(), uploadRecordPhoto(), BottomSheet(), BREATHE, buildBreadcrumb(), COLOR_PALETTE, ColorPicker() (+15 more)

### Community 4 - "My Map Data (root copy)"
Cohesion: 0.17
Nodes (14): addFavoriteNodeToMyMap(), addMyMapRecord(), ensureMyMapNode(), loadNodes(), loadRecords(), makeId(), MapNode, MapRecord (+6 more)

### Community 5 - "Post Detail View"
Cohesion: 0.16
Nodes (4): PostDetailViewProps, PostType, PostDetailViewProps, PostType

### Community 6 - "My Map Data (src)"
Cohesion: 0.25
Nodes (14): addFavoriteNodeToMyMap(), addMyMapRecord(), ensureMyMapNode(), loadNodes(), loadRecords(), makeId(), MapNode, MapRecord (+6 more)

## Knowledge Gaps
- **2 isolated node(s):** `오느 (Oneu) Interest-Based Community`, `Supabase (realtime, auth, core)`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 59 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MyNode()` connect `MyNode Screen (root copy)` to `My Map Data (root copy)`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `MyNode()` (e.g. with `loadRecords()` and `loadUsername()`) actually correct?**
  _`MyNode()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `오느 (Oneu) Interest-Based Community`, `Supabase (realtime, auth, core)` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Node Graph Admin Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.11954022988505747 - nodes in this community are weakly interconnected._
- **Why does `loadNodes()` connect `My Map Data (root copy)` to `MyNode Screen (root copy)`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `MyNode()` (e.g. with `loadNodes()` and `loadRecords()`) actually correct?**
  _`MyNode()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `App Shell & Link Previews` be split into smaller, more focused modules?**
  _Cohesion score 0.07881773399014778 - nodes in this community are weakly interconnected._