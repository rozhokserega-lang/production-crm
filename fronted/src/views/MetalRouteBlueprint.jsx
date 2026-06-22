import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useNodesState,
  useEdgesState,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  METAL_STAGE_KEYS,
  METAL_STAGE_LABELS,
  deriveStageRouteFromGraph,
  normalizeProcessGraph,
} from "../app/metalProcessGraph";

const STAGE_COLORS = {
  laser: { border: "#3b82f6", text: "#93c5fd", bg: "#1a3a5c", icon: "⚡" },
  saw: { border: "#22c55e", text: "#86efac", bg: "#1a2e1a", icon: "🔩" },
  bending: { border: "#a855f7", text: "#d8b4fe", bg: "#2d1a3a", icon: "⚙️" },
  welding: { border: "#f97316", text: "#fdba74", bg: "#3a2a1a", icon: "🔥" },
  painting: { border: "#06b6d4", text: "#67e8f9", bg: "#1a2a3a", icon: "🎨" },
};

const ARROW = (color) => ({ type: MarkerType.ArrowClosed, color });

function StartNode() {
  return (
    <div className="mbp-node mbp-node--start">
      <div className="mbp-node__title">Старт</div>
      <div className="mbp-node__name">План → работа</div>
      <Handle type="source" position={Position.Right} id="out" className="mbp-handle" />
    </div>
  );
}

function StageNode({ data, selected }) {
  const c = STAGE_COLORS[data.stage] || { border: "#64748b", text: "#cbd5e1", bg: "#1e293b", icon: "•" };
  const hasNote = Boolean(String(data.note || "").trim());
  return (
    <div
      className={`mbp-node mbp-node--stage${selected ? " mbp-node--selected" : ""}${hasNote ? " mbp-node--has-note" : ""}`}
      style={{ borderColor: c.border, background: c.bg, color: c.text }}
      onClick={(e) => {
        e.stopPropagation();
        data.onSelect?.(data.nodeId);
      }}
    >
      <Handle type="target" position={Position.Left} id="in" className="mbp-handle" />
      <Handle type="source" position={Position.Right} id="out" className="mbp-handle" />
      <div className="mbp-node__title">Этап</div>
      <div className="mbp-node__name">
        <span className="mbp-node__icon">{c.icon}</span>
        {data.label || data.stage}
        {hasNote && <span className="mbp-node__note-flag" title="Есть пояснение">📝</span>}
      </div>
      {hasNote && (
        <div className="mbp-node__note-preview" title={data.note}>
          {String(data.note).trim()}
        </div>
      )}
      {!data.disabled && (
        <button
          type="button"
          className="mbp-node__del"
          title="Удалить этап"
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete?.(data.nodeId);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

const NODE_TYPES = {
  start: StartNode,
  stage: (props) => <StageNode {...props} selected={props.selected} />,
};

function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {!data?.disabled && (
        <EdgeLabelRenderer>
          <div
            className="mbp-edge__del-wrap nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <button
              type="button"
              className="mbp-edge__del"
              title="Удалить связь"
              aria-label="Удалить связь между этапами"
              onClick={(e) => {
                e.stopPropagation();
                data?.onDelete?.(id);
              }}
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const EDGE_TYPES = { deletable: DeletableEdge };

function graphToFlow(graph, disabled, onDeleteStage, onDeleteEdge, selectedNodeId, onSelectNode) {
  const normalized = normalizeProcessGraph(graph);
  const nodes = normalized.nodes.map((node) => {
    if (node.kind === "start") {
      return {
        id: node.id,
        type: "start",
        position: { x: node.x, y: node.y },
        data: {},
        draggable: !disabled,
      };
    }
    return {
      id: node.id,
      type: "stage",
      position: { x: node.x, y: node.y },
      data: {
        nodeId: node.id,
        stage: node.stage,
        label: METAL_STAGE_LABELS[node.stage] || node.stage,
        note: node.note || "",
        disabled,
        onDelete: onDeleteStage,
        onSelect: onSelectNode,
      },
      draggable: !disabled,
      selected: selectedNodeId === node.id,
    };
  });

  const edges = normalized.edges.map((edge) => ({
    id: edge.id,
    type: "deletable",
    source: edge.from,
    target: edge.to,
    sourceHandle: "out",
    targetHandle: "in",
    markerEnd: ARROW("#64748b"),
    style: { stroke: "#64748b", strokeWidth: 1.5 },
    deletable: !disabled,
    data: {
      disabled,
      onDelete: onDeleteEdge,
    },
  }));

  return { nodes, edges };
}

function flowToGraph(nodes, edges) {
  return {
    nodes: nodes.map((node) => {
      if (node.type === "start") {
        return {
          id: node.id,
          kind: "start",
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
        };
      }
      return {
        id: node.id,
        kind: "stage",
        stage: node.data?.stage,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        ...(String(node.data?.note || "").trim() ? { note: String(node.data.note).trim() } : {}),
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
    })),
  };
}

function graphSignature(graph) {
  const normalized = normalizeProcessGraph(graph);
  const nodes = normalized.nodes.map(({ id, kind, stage, x, y, note }) => ({ id, kind, stage, x, y, note: note || "" }));
  const edges = normalized.edges.map(({ from, to }) => ({ from, to }));
  return JSON.stringify({ nodes, edges });
}

export function MetalRouteBlueprint({ value, onChange, disabled = false, validationErrors = [], validationWarnings = [], fullScreen = false }) {
  const syncingRef = useRef(false);
  const nodeSeqRef = useRef(0);
  const userDraggedRef = useRef(false);
  const lastEmittedSigRef = useRef(graphSignature(value));
  const onChangeRef = useRef(onChange);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteJustSaved, setNoteJustSaved] = useState(false);
  const noteDraftRef = useRef(noteDraft);

  const emitGraph = useCallback(
    (nextNodes, nextEdges) => {
      if (disabled || typeof onChangeRef.current !== "function") return;
      const normalized = normalizeProcessGraph(flowToGraph(nextNodes, nextEdges));
      const sig = graphSignature(normalized);
      if (sig === lastEmittedSigRef.current) return;
      lastEmittedSigRef.current = sig;
      syncingRef.current = true;
      onChangeRef.current(normalized);
      queueMicrotask(() => {
        syncingRef.current = false;
      });
    },
    [disabled],
  );

  const initial = useMemo(
    () => graphToFlow(value, disabled, null, null, null, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => {
    noteDraftRef.current = noteDraft;
  }, [noteDraft]);

  const commitSelectedNodeNote = useCallback(
    (noteText, nodeId = selectedNodeId) => {
      if (!nodeId || disabled) return;
      const trimmed = String(noteText ?? "").trim();
      setNodes((prev) => {
        const next = prev.map((node) => {
          if (node.id !== nodeId || node.type !== "stage") return node;
          return { ...node, data: { ...node.data, note: trimmed } };
        });
        setEdges((prevEdges) => {
          queueMicrotask(() => emitGraph(next, prevEdges));
          return prevEdges;
        });
        return next;
      });
      if (nodeId === selectedNodeId) {
        setNoteDraft(trimmed);
      }
    },
    [disabled, emitGraph, selectedNodeId, setNodes, setEdges],
  );

  const saveNoteDraft = useCallback(() => {
    if (!selectedNodeId || disabled) return;
    commitSelectedNodeNote(noteDraftRef.current, selectedNodeId);
    setNoteJustSaved(true);
    window.setTimeout(() => setNoteJustSaved(false), 1500);
  }, [commitSelectedNodeNote, disabled, selectedNodeId]);

  const closeNotePanel = useCallback(() => {
    setSelectedNodeId(null);
    setNoteJustSaved(false);
  }, []);

  const onSelectNode = useCallback((nodeId) => {
    if (disabled) return;
    setSelectedNodeId((prevId) => {
      if (prevId && prevId !== nodeId) {
        const prevNode = nodesRef.current.find((n) => n.id === prevId && n.type === "stage");
        const saved = String(prevNode?.data?.note || "").trim();
        const draft = String(noteDraftRef.current).trim();
        if (draft !== saved) {
          queueMicrotask(() => commitSelectedNodeNote(draft, prevId));
        }
      }
      return nodeId;
    });
  }, [commitSelectedNodeNote, disabled]);

  const updateSelectedNodeNote = useCallback(
    (noteText) => {
      setNoteDraft(noteText);
    },
    [],
  );

  const selectedStageNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId && node.type === "stage") || null,
    [nodes, selectedNodeId],
  );

  useEffect(() => {
    if (!selectedNodeId) {
      setNoteDraft("");
      return;
    }
    const node = nodesRef.current.find((n) => n.id === selectedNodeId && n.type === "stage");
    setNoteDraft(String(node?.data?.note || ""));
    setNoteJustSaved(false);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!selectedStageNode || disabled) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      const saved = String(selectedStageNode.data?.note || "").trim();
      const draft = String(noteDraftRef.current).trim();
      if (draft !== saved) {
        commitSelectedNodeNote(draft, selectedNodeId);
      }
      closeNotePanel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeNotePanel, commitSelectedNodeNote, disabled, selectedNodeId, selectedStageNode]);

  const deleteEdgeRef = useRef(null);
  const deleteStageRef = useRef(null);
  const onDeleteStage = useCallback((nodeId) => {
    deleteStageRef.current?.(nodeId);
  }, []);
  const onDeleteEdge = useCallback((edgeId) => {
    deleteEdgeRef.current?.(edgeId);
  }, []);

  const deleteEdge = useCallback(
    (edgeId) => {
      setEdges((prevEdges) => {
        const nextEdges = prevEdges.filter((e) => e.id !== edgeId);
        setNodes((prevNodes) => {
          queueMicrotask(() => emitGraph(prevNodes, nextEdges));
          return prevNodes;
        });
        return nextEdges;
      });
    },
    [emitGraph, setEdges, setNodes],
  );

  const deleteStage = useCallback(
    (nodeId) => {
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      setNodes((prev) => {
        const nextNodes = prev.filter((n) => n.id !== nodeId);
        setEdges((prevEdges) => {
          const nextEdges = prevEdges.filter((e) => e.source !== nodeId && e.target !== nodeId);
          queueMicrotask(() => emitGraph(nextNodes, nextEdges));
          return nextEdges;
        });
        return nextNodes;
      });
    },
    [emitGraph, selectedNodeId, setEdges, setNodes],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
    nodesRef.current = nodes;
    edgesRef.current = edges;
    deleteEdgeRef.current = deleteEdge;
    deleteStageRef.current = deleteStage;
  });

  useEffect(() => {
    if (syncingRef.current) return;
    const incomingSig = graphSignature(value);
    const currentSig = graphSignature(flowToGraph(nodesRef.current, edgesRef.current));
    if (incomingSig === currentSig) return;
    const next = graphToFlow(value, disabled, onDeleteStage, onDeleteEdge, selectedNodeId, onSelectNode);
    lastEmittedSigRef.current = incomingSig;
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [value, disabled, onDeleteStage, onDeleteEdge, onSelectNode, selectedNodeId, setNodes, setEdges]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.type !== "stage") return { ...node, draggable: !disabled };
        return {
          ...node,
          draggable: !disabled,
          selected: node.id === selectedNodeId,
          data: { ...node.data, disabled, onDelete: onDeleteStage, onSelect: onSelectNode },
        };
      }),
    );
    setEdges((prev) =>
      prev.map((edge) => ({
        ...edge,
        type: "deletable",
        deletable: !disabled,
        data: { ...edge.data, disabled, onDelete: onDeleteEdge },
      })),
    );
  }, [disabled, onDeleteStage, onDeleteEdge, onSelectNode, selectedNodeId, setNodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      if (disabled) return;
      for (const change of changes) {
        if (change.type === "position" && change.dragging === true) {
          userDraggedRef.current = true;
        }
      }
      const dragEnded = changes.some((c) => c.type === "position" && c.dragging === false);
      if (!dragEnded || !userDraggedRef.current) return;
      userDraggedRef.current = false;
      queueMicrotask(() => {
        setNodes((prevNodes) => {
          setEdges((prevEdges) => {
            emitGraph(prevNodes, prevEdges);
            return prevEdges;
          });
          return prevNodes;
        });
      });
    },
    [disabled, emitGraph, onNodesChange, setNodes, setEdges],
  );

  const handleEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      if (disabled) return;
      if (!changes.some((c) => c.type === "remove")) return;
      queueMicrotask(() => {
        setNodes((prevNodes) => {
          setEdges((prevEdges) => {
            emitGraph(prevNodes, prevEdges);
            return prevEdges;
          });
          return prevNodes;
        });
      });
    },
    [disabled, emitGraph, onEdgesChange, setNodes, setEdges],
  );

  const onConnect = useCallback(
    (connection) => {
      if (disabled) return;
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (targetNode?.type === "start") return;

      setEdges((prev) => {
        const exists = prev.some((e) => e.source === connection.source && e.target === connection.target);
        if (exists) return prev;
        const next = addEdge(
          {
            ...connection,
            type: "deletable",
            sourceHandle: connection.sourceHandle || "out",
            targetHandle: connection.targetHandle || "in",
            markerEnd: ARROW("#64748b"),
            style: { stroke: "#64748b", strokeWidth: 1.5 },
            deletable: true,
            data: { disabled: false, onDelete: onDeleteEdge },
          },
          prev,
        );
        queueMicrotask(() => emitGraph(nodes, next));
        return next;
      });
    },
    [disabled, emitGraph, nodes, onDeleteEdge, setEdges],
  );

  const addStage = useCallback(
    (stageKey) => {
      if (disabled) return;
      nodeSeqRef.current += 1;
      const id = `s${Date.now()}_${nodeSeqRef.current}`;
      const maxY = nodes.reduce((acc, n) => Math.max(acc, n.position.y), 120);
      const newNode = {
        id,
        type: "stage",
        position: { x: 220, y: maxY + 90 },
        data: {
          nodeId: id,
          stage: stageKey,
          label: METAL_STAGE_LABELS[stageKey] || stageKey,
          note: "",
          disabled,
          onDelete: onDeleteStage,
          onSelect: onSelectNode,
        },
        draggable: true,
      };
      setNodes((prev) => {
        const next = [...prev, newNode];
        setEdges((prevEdges) => {
          queueMicrotask(() => emitGraph(next, prevEdges));
          return prevEdges;
        });
        return next;
      });
    },
    [disabled, emitGraph, nodes, onDeleteStage, onSelectNode, setEdges, setNodes],
  );

  const rootClass = fullScreen ? "mbp-root mbp-root--fullscreen" : "mbp-root";

  return (
    <div className={rootClass}>

      {!disabled && (
        <div className="mbp-toolbar">
          <span className="mbp-toolbar__label">Добавить этап:</span>
          {METAL_STAGE_KEYS.map((stageKey) => {
            const c = STAGE_COLORS[stageKey];
            return (
              <button
                key={`palette-${stageKey}`}
                type="button"
                className="mbp-palette-btn"
                disabled={disabled}
                style={{ borderColor: c.border, color: c.text }}
                onClick={() => addStage(stageKey)}
              >
                {c.icon} {METAL_STAGE_LABELS[stageKey]}
              </button>
            );
          })}
        </div>
      )}

      {!disabled && selectedStageNode && (
        <div className="mbp-note-panel">
          <div className="mbp-note-panel__head">
            <strong>
              Пояснение: {selectedStageNode.data?.label || selectedStageNode.data?.stage}
            </strong>
            <button
              type="button"
              className="mbp-note-panel__save"
              onClick={saveNoteDraft}
            >
              {noteJustSaved ? "Сохранено" : "Сохранить"}
            </button>
          </div>
          <textarea
            className="mbp-note-panel__input"
            rows={3}
            placeholder="Текст для оператора на этом этапе (размеры, особенности, внимание…)"
            value={noteDraft}
            onChange={(e) => updateSelectedNodeNote(e.target.value)}
          />
          <div className="mbp-note-panel__hint">
            Нажмите «Сохранить», затем Esc — закрыть. Текст показывается оператору в производстве.
          </div>
        </div>
      )}

      <div className="mbp-wrap">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.35}
          maxZoom={1.4}
          nodesConnectable={!disabled}
          nodesDraggable={!disabled}
          elementsSelectable={!disabled}
          connectionRadius={28}
          deleteKeyCode={disabled ? null : "Delete"}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor="#334155" maskColor="rgba(2,6,23,0.7)" />
        </ReactFlow>
      </div>

      {!fullScreen && (
        <div className="mbp-hint">
          Тяните стрелку от правого кружка к левому. Две стрелки из одного этапа — параллельная работа;
          две стрелки в один этап — слияние (например, лазер + пила → сварка).
          {disabled ? " Режим просмотра." : " Крестик на стрелке — удалить связь."}
        </div>
      )}

      {!fullScreen && validationWarnings.length > 0 && (
        <div className="mbp-warnings">
          {validationWarnings.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
        </div>
      )}

      {!fullScreen && validationErrors.length > 0 && (
        <div className="mbp-errors">
          {validationErrors.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MetalRouteGraphSummary({ processGraph, stageRoute }) {
  const graph = normalizeProcessGraph(processGraph, stageRoute);
  const routeOrder = deriveStageRouteFromGraph(graph);
  const uniqueNodes = [];
  const seen = new Set();
  for (const node of graph.nodes.filter((n) => n.kind === "stage")) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    uniqueNodes.push(node);
  }
  const displayNodes = uniqueNodes.sort((a, b) => {
    const ai = routeOrder.indexOf(a.stage);
    const bi = routeOrder.indexOf(b.stage);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.x - b.x;
  });

  if (displayNodes.length === 0) return <span className="empty">—</span>;

  return (
    <div className="route-badge-row" style={{ flexWrap: "wrap" }}>
      {displayNodes.map((node, idx) => {
        const c = STAGE_COLORS[node.stage] || { border: "#64748b", text: "#cbd5e1", bg: "#1e293b", icon: "•" };
        const outs = graph.edges.filter((e) => e.from === node.id);
        const ins = graph.edges.filter((e) => e.to === node.id);
        const isSplit = outs.length > 1;
        const isMerge = ins.length > 1;
        return (
          <span key={node.id} className="route-badge" title={isSplit ? "Разветвление" : isMerge ? "Слияние" : undefined}>
            {idx > 0 && <span className="route-badge__arrow">→</span>}
            <span
              className="stage-badge stage-badge--sm"
              style={{ background: c.bg, borderColor: c.border, color: c.text }}
            >
              <span className="stage-badge__icon">{c.icon}</span>
              {METAL_STAGE_LABELS[node.stage] || node.stage}
              {isMerge ? " ⊕" : ""}
              {isSplit ? " ⋔" : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
}
