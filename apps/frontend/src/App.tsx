import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  MiniMap,
  MarkerType,
  ConnectionMode
} from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import { CustomNode } from './CustomNode';
import { Play, Save, Zap, Globe, Database, Shuffle, Sun, Moon, Lock, Unlock, Trash, Unlink, Plus, PanelLeftClose, PanelLeft } from 'lucide-react';
import './index.css';

const nodeTypes = {
  customNode: CustomNode,
};

const initialNodes: Node[] = [
  {
    id: 'node_trigger',
    type: 'customNode',
    position: { x: 100, y: 150 },
    data: { 
      type: 'webhook', 
      label: 'Webhook Trigger', 
      description: 'Starts the workflow on a webhook hit',
      configSummary: 'POST /webhook/xyz',
      parameters: {}
    },
  }
];

const App = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Floating Sidebar State
  const [sidebarConfig, setSidebarConfig] = useState({
    isMinimized: false,
    position: { x: 16, y: 16 }
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

  // Auto-hide MiniMap state
  const [isCanvasMoving, setIsCanvasMoving] = useState(false);
  const moveTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMove = () => {
    setIsCanvasMoving(true);
    if (moveTimeout.current) clearTimeout(moveTimeout.current);
    moveTimeout.current = setTimeout(() => {
      setIsCanvasMoving(false);
    }, 1500);
  };
  const [theme, setTheme] = useState('light');
  const { screenToFlowPosition } = useReactFlow();

  // Handle Dragging
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSidebar) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setSidebarConfig(prev => ({
        ...prev,
        position: {
          x: Math.max(0, dragStart.current.initialX + dx),
          y: Math.max(0, dragStart.current.initialY + dy)
        }
      }));
    };
    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };

    if (isDraggingSidebar) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Update existing edges to match new theme
    setEdges(eds => eds.map(e => {
      const sourceNode = nodes.find(n => n.id === e.source);
      return {
        ...e,
        style: { ...e.style, stroke: getEdgeColor(sourceNode?.data.type as string, theme) }
      };
    }));
  }, [theme, nodes, setEdges]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const getEdgeColor = (nodeType: string, currentTheme: string) => {
    switch (nodeType) {
      case 'webhook': return currentTheme === 'dark' ? '#ef4444' : '#dc2626';
      case 'http_request': return currentTheme === 'dark' ? '#3b82f6' : '#2563eb';
      case 'set_data': return currentTheme === 'dark' ? '#10b981' : '#059669';
      case 'if_condition': return currentTheme === 'dark' ? '#f59e0b' : '#d97706';
      default: return currentTheme === 'dark' ? '#8b5cf6' : '#7c3aed';
    }
  };

  // Floating Context Menu State
  const connectingNodeId = useRef<string | null>(null);
  const [menuState, setMenuState] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    sourceNodeId: string | null;
    screenPos: { x: number; y: number };
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    screenPos: { x: 0, y: 0 }
  });

  const [contextMenuState, setContextMenuState] = useState<{
    isOpen: boolean;
    nodeId: string | null;
    isLocked: boolean;
    screenPos: { x: number; y: number };
  }>({
    isOpen: false,
    nodeId: null,
    isLocked: false,
    screenPos: { x: 0, y: 0 }
  });

  const [edgeMenuState, setEdgeMenuState] = useState<{
    isOpen: boolean;
    edgeId: string | null;
    screenPos: { x: number; y: number };
  }>({
    isOpen: false,
    edgeId: null,
    screenPos: { x: 0, y: 0 }
  });

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDraggingSidebar(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: sidebarConfig.position.x,
      initialY: sidebarConfig.position.y
    };
  };

  React.useEffect(() => {
    const handleOpenMenu = (e: any) => {
      const { sourceNodeId, x, y } = e.detail;
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;
      
      const position = screenToFlowPosition({ x, y });
      
      setMenuState({
        isOpen: true,
        position,
        sourceNodeId,
        screenPos: { 
          x: x - reactFlowBounds.left, 
          y: y - reactFlowBounds.top 
        }
      });
      setContextMenuState(prev => ({ ...prev, isOpen: false })); // Close context menu if open
      setEdgeMenuState(prev => ({ ...prev, isOpen: false })); // Close edge menu if open
    };

    const handleNodeContextMenu = (e: any) => {
      const { nodeId, isLocked, x, y } = e.detail;
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;
      
      setContextMenuState({
        isOpen: true,
        nodeId,
        isLocked,
        screenPos: { 
          x: x - reactFlowBounds.left, 
          y: y - reactFlowBounds.top 
        }
      });
      setMenuState(prev => ({ ...prev, isOpen: false })); // Close quick-add menu if open
      setEdgeMenuState(prev => ({ ...prev, isOpen: false })); // Close edge menu if open
    };

    window.addEventListener('openNodeMenu', handleOpenMenu);
    window.addEventListener('openNodeContextMenu', handleNodeContextMenu);
    
    return () => {
      window.removeEventListener('openNodeMenu', handleOpenMenu);
      window.removeEventListener('openNodeContextMenu', handleNodeContextMenu);
    };
  }, [screenToFlowPosition]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const sourceNode = nodes.find(n => n.id === params.source);
      const edgeColor = getEdgeColor(sourceNode?.data.type as string, theme);
      
      setEdges((eds) => addEdge({ 
        ...params, 
        type: 'smoothstep', 
        animated: false, 
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        style: { stroke: edgeColor, strokeWidth: 3, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' } 
      } as Edge, eds));
    },
    [setEdges, nodes, theme]
  );

  const onConnectStart = useCallback((_: any, { nodeId }: any) => {
    connectingNodeId.current = nodeId;
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!connectingNodeId.current) return;

      const targetIsPane = (event.target as Element).classList.contains('react-flow__pane');

      if (targetIsPane && reactFlowWrapper.current) {
        const clientX = 'clientX' in event ? event.clientX : (event as TouchEvent).changedTouches[0].clientX;
        const clientY = 'clientY' in event ? event.clientY : (event as TouchEvent).changedTouches[0].clientY;
        
        const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
        
        const position = screenToFlowPosition({ x: clientX, y: clientY });
        
        setMenuState({
          isOpen: true,
          position,
          sourceNodeId: connectingNodeId.current,
          screenPos: { 
            x: clientX - reactFlowBounds.left, 
            y: clientY - reactFlowBounds.top 
          }
        });
      }
    },
    [screenToFlowPosition]
  );

  const closeMenu = () => setMenuState(prev => ({ ...prev, isOpen: false }));
  const closeContextMenu = () => setContextMenuState(prev => ({ ...prev, isOpen: false }));
  const closeEdgeMenu = () => setEdgeMenuState(prev => ({ ...prev, isOpen: false }));

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!reactFlowBounds) return;
    
    setEdgeMenuState({
      isOpen: true,
      edgeId: edge.id,
      screenPos: { 
        x: event.clientX - reactFlowBounds.left, 
        y: event.clientY - reactFlowBounds.top 
      }
    });
    setMenuState(prev => ({ ...prev, isOpen: false }));
    setContextMenuState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const addNodeFromMenu = (type: string, label: string, description: string) => {
    let defaultParams = {};
    let summary = 'Config needed';
    if (type === 'http_request') {
      defaultParams = { url: 'https://jsonplaceholder.typicode.com/posts/1', method: 'GET' };
      summary = 'GET /api';
    } else if (type === 'set_data') {
      defaultParams = { fields: { source: 'frontend_canvas' } };
      summary = 'Set { source }';
    } else if (type === 'if_condition') {
      defaultParams = { condition: 'equals', field: 'source', value: 'frontend_canvas' };
      summary = 'If source == ...';
    }

    const newNodeId = `node_${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'customNode',
      position: menuState.position,
      data: { 
        type, 
        label,
        description,
        configSummary: summary,
        parameters: defaultParams
      },
    };

    setNodes((nds) => nds.concat(newNode));
    
    if (menuState.sourceNodeId) {
      const sourceNode = nodes.find(n => n.id === menuState.sourceNodeId);
      const edgeColor = getEdgeColor(sourceNode?.data.type as string, theme);
      
      setEdges((eds) => addEdge({
        id: `edge_${Date.now()}`,
        source: menuState.sourceNodeId!,
        target: newNodeId,
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        style: { stroke: edgeColor, strokeWidth: 3, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }
      } as Edge, eds));
    }
    
    closeMenu();
  };

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string, description: string) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ type: nodeType, label, description }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const typeData = event.dataTransfer.getData('application/reactflow');
      if (!typeData) return;

      const parsed = JSON.parse(typeData);
      
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      // Center the node under the mouse (node is ~320px wide and ~120px tall)
      position.x -= 160;
      position.y -= 60;

      let defaultParams = {};
      let summary = 'Config needed';
      if (parsed.type === 'http_request') {
        defaultParams = { url: 'https://jsonplaceholder.typicode.com/posts/1', method: 'GET' };
        summary = 'GET /api';
      } else if (parsed.type === 'set_data') {
        defaultParams = { fields: { source: 'frontend_canvas' } };
        summary = 'Set { source }';
      } else if (parsed.type === 'if_condition') {
        defaultParams = { condition: 'equals', field: 'source', value: 'frontend_canvas' };
        summary = 'If source == ...';
      } else if (parsed.type === 'webhook') {
        summary = 'POST /webhook';
      }

      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: 'customNode',
        position,
        data: { 
          type: parsed.type, 
          label: parsed.label,
          description: parsed.description,
          configSummary: summary,
          parameters: defaultParams
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  const executeWorkflow = async () => {
    setIsExecuting(true);
    const workflow = {
      id: 'demo_workflow',
      name: 'Demo Visual Workflow',
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.data.type,
        parameters: n.data.parameters || {}
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle
      }))
    };

    try {
      const res = await fetch('http://localhost:3000/workflows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow, initialPayload: { message: 'Triggered from React UI' } })
      });
      const data = await res.json();
      
      if(data.success) {
        alert('Execution Success! Check your NestJS backend console for the output logs.\n\nReturned Data:\n' + JSON.stringify(data.executionData, null, 2));
      } else {
        alert('Execution Failed: ' + data.error);
      }
    } catch (err: any) {
      alert('Failed to connect to backend on localhost:3000. Make sure the NestJS server is running.');
    } finally {
      setIsExecuting(false);
    }
  };

  // --- CONNECTION VALIDATION RULES ---
  const isValidConnection = useCallback((connection: Edge | Connection) => {
    // 1. Prevent a node from connecting to itself (this breaks graphs)
    if (connection.source === connection.target) return false;

    // Everything else is allowed! You can build loops, backwards connections, anything.
    return true;
  }, []);

  return (
    <div className="app-layout" data-theme={theme}>
      {/* Floating Draggable Sidebar / Palette */}
      {sidebarConfig.isMinimized ? (
        <div 
          className="sidebar-bubble" 
          style={{ left: sidebarConfig.position.x, top: sidebarConfig.position.y }}
          onClick={() => setSidebarConfig(p => ({...p, isMinimized: false}))}
          onMouseDown={handleDragStart}
          title="Open Automate Palette"
        >
          <Zap size={24} color="#8b5cf6" />
        </div>
      ) : (
        <div 
          className="sidebar" 
          style={{ left: sidebarConfig.position.x, top: sidebarConfig.position.y }}
        >
          <div className="sidebar-header" onMouseDown={handleDragStart}>
            <h1>
              <Zap size={24} color="#8b5cf6" />
              Automate
            </h1>
            <div style={{ display: 'flex', gap: '8px', zIndex: 110 }}>
              <button className="sidebar-control-btn" onClick={() => setSidebarConfig(p => ({...p, isMinimized: true}))} title="Minimize Palette">
                <div style={{ width: '10px', height: '2px', background: 'currentColor' }} />
              </button>
            </div>
          </div>
          <div className="node-list">
            <p className="node-list-title">AVAILABLE NODES</p>
            <div className="dndnode webhook" onDragStart={(e) => onDragStart(e, 'webhook', 'Webhook Trigger', 'Starts on incoming HTTP request')} draggable>
              <div className="sidebar-icon icon-trigger"><Zap size={20} /></div>
              <div>
                <strong>Webhook</strong>
                <span>Trigger on HTTP request</span>
              </div>
            </div>

            <div className="dndnode http_request" onDragStart={(e) => onDragStart(e, 'http_request', 'HTTP Request', 'Makes an external API call')} draggable>
              <div className="sidebar-icon icon-action"><Globe size={20} /></div>
              <div>
                <strong>HTTP Request</strong>
                <span>Makes an API call</span>
              </div>
            </div>

            <div className="dndnode set_data" onDragStart={(e) => onDragStart(e, 'set_data', 'Set Data', 'Sets or merges specific fields')} draggable>
              <div className="sidebar-icon icon-data"><Database size={20} /></div>
              <div>
                <strong>Set Data</strong>
                <span>Transforms data</span>
              </div>
            </div>

            <div className="dndnode if_condition" onDragStart={(e) => onDragStart(e, 'if_condition', 'If / Else', 'Branches workflow based on condition')} draggable>
              <div className="sidebar-icon icon-logic"><Shuffle size={20} /></div>
              <div>
                <strong>If Condition</strong>
                <span>Branches the logic</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canvas Area */}
      <div 
        className="canvas-area" 
        ref={reactFlowWrapper} 
        onClick={() => { closeMenu(); closeContextMenu(); closeEdgeMenu(); }}
        onContextMenu={(e) => { e.preventDefault(); closeMenu(); closeContextMenu(); closeEdgeMenu(); }}
      >
        <div className="top-bar">
          <button className="btn" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="btn">
            <Save size={16} /> Save
          </button>
          <button className="btn btn-primary" onClick={executeWorkflow} disabled={isExecuting}>
            <Play size={16} /> {isExecuting ? 'Executing...' : 'Execute Workflow'}
          </button>
        </div>
        
        {menuState.isOpen && (
          <div 
            className="quick-add-menu"
            style={{ 
              top: menuState.screenPos.y, 
              left: menuState.screenPos.x,
            }}
            onClick={(e) => e.stopPropagation()} 
          >
            <div>
              <div className="quick-add-title">ADD NEW NODE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button className="btn" style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px' }} onClick={() => addNodeFromMenu('http_request', 'HTTP Request', 'Makes API call')}>
                  <Globe size={16} color="var(--color-action)" /> HTTP Request
                </button>
                <button className="btn" style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px' }} onClick={() => addNodeFromMenu('set_data', 'Set Data', 'Sets fields')}>
                  <Database size={16} color="var(--color-data)" /> Set Data
                </button>
                <button className="btn" style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px' }} onClick={() => addNodeFromMenu('if_condition', 'If / Else', 'Logic branch')}>
                  <Shuffle size={16} color="var(--color-logic)" /> If Condition
                </button>
              </div>
            </div>

            {nodes.filter(n => n.id !== menuState.sourceNodeId && !edges.some(e => e.source === menuState.sourceNodeId && e.target === n.id)).length > 0 && (
              <>
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '8px 0' }} />
                <div>
                  <div className="quick-add-title">LINK TO EXISTING NODE</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {nodes
                      .filter(n => n.id !== menuState.sourceNodeId)
                      .filter(n => !edges.some(e => e.source === menuState.sourceNodeId && e.target === n.id))
                      .map(existingNode => (
                        <button 
                          key={existingNode.id}
                          className="btn" 
                          style={{ justifyContent: 'space-between', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', padding: '10px 12px', fontSize: '13px' }} 
                          onClick={() => {
                            if (menuState.sourceNodeId) {
                              const sourceNode = nodes.find(n => n.id === menuState.sourceNodeId);
                              const edgeColor = getEdgeColor(sourceNode?.data.type as string, theme);

                              setEdges((eds) => addEdge({
                                id: `edge_${Date.now()}`,
                                source: menuState.sourceNodeId!,
                                target: existingNode.id,
                                type: 'smoothstep',
                                animated: false,
                                markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
                                style: { stroke: edgeColor, strokeWidth: 3, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }
                              } as Edge, eds));
                            }
                            closeMenu();
                          }}
                        >
                          {existingNode.data.label as string} <span style={{fontSize: '10px', color: 'var(--text-secondary)', marginLeft: 'auto'}}>On Canvas</span>
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Right-Click Context Menu */}
        {contextMenuState.isOpen && (
          <div 
            className="quick-add-menu"
            style={{ 
              top: contextMenuState.screenPos.y, 
              left: contextMenuState.screenPos.x,
              width: '180px'
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <div>
              <div className="quick-add-title">NODE OPTIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button 
                  className="btn" 
                  style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px' }} 
                  onClick={() => {
                    setNodes(nds => nds.map(n => n.id === contextMenuState.nodeId ? { ...n, data: { ...n.data, isLocked: !contextMenuState.isLocked } } : n));
                    closeContextMenu();
                  }}
                >
                  {contextMenuState.isLocked ? <Unlock size={16} /> : <Lock size={16} />} 
                  {contextMenuState.isLocked ? 'Unlock Node' : 'Lock Node'}
                </button>
                
                <button 
                  className="btn" 
                  style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px' }} 
                  onClick={() => {
                    const rect = reactFlowWrapper.current?.getBoundingClientRect();
                    if (!rect) return;
                    setContextMenuState(prev => ({ ...prev, isOpen: false }));
                    setMenuState({
                      isOpen: true,
                      position: screenToFlowPosition({ 
                        x: contextMenuState.screenPos.x + rect.left + 190, 
                        y: contextMenuState.screenPos.y + rect.top 
                      }),
                      sourceNodeId: contextMenuState.nodeId,
                      screenPos: { 
                        x: contextMenuState.screenPos.x + 190, 
                        y: contextMenuState.screenPos.y 
                      }
                    });
                  }}
                >
                  <Plus size={16} /> Link to New Node
                </button>

                {(() => {
                  const connectedEdges = edges.filter(e => e.source === contextMenuState.nodeId || e.target === contextMenuState.nodeId);
                  if (connectedEdges.length === 0) return null;
                  
                  return (
                    <>
                      <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                      <div className="quick-add-title" style={{ marginTop: '4px', paddingLeft: '8px' }}>CONNECTIONS</div>
                      {connectedEdges.map(edge => {
                        const isSource = edge.source === contextMenuState.nodeId;
                        const otherId = isSource ? edge.target : edge.source;
                        const otherNode = nodes.find(n => n.id === otherId);
                        const otherName = otherNode ? otherNode.data.label : 'Unknown';
                        
                        return (
                          <div key={edge.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 12px', color: 'var(--text-secondary)' }}>
                            <span>{isSource ? 'Out \u2192' : 'In \u2190'} {String(otherName)}</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEdges(eds => eds.filter(e2 => e2.id !== edge.id));
                              }}
                              style={{ background: 'var(--bg-node)', border: '1px solid var(--border-color)', color: 'var(--color-trigger)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Unlink"
                            >
                              <Unlink size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}

                <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                <button 
                  className="btn" 
                  style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px', color: 'var(--color-trigger)' }} 
                  onClick={() => {
                    setNodes(nds => nds.filter(n => n.id !== contextMenuState.nodeId));
                    setEdges(eds => eds.filter(e => e.source !== contextMenuState.nodeId && e.target !== contextMenuState.nodeId));
                    closeContextMenu();
                  }}
                >
                  <Trash size={16} /> Delete Node
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edge / Link Context Menu */}
        {edgeMenuState.isOpen && (
          <div 
            className="quick-add-menu"
            style={{ 
              top: edgeMenuState.screenPos.y, 
              left: edgeMenuState.screenPos.x,
              width: '200px'
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {(() => {
               const edge = edges.find(e => e.id === edgeMenuState.edgeId);
               if (!edge) return null;
               const sourceNode = nodes.find(n => n.id === edge.source);
               const targetNode = nodes.find(n => n.id === edge.target);
               
               return (
                 <div>
                    <div className="quick-add-title">LINK DETAILS</div>
                    <div style={{ fontSize: '13px', padding: '8px 12px', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <span style={{ fontSize: '10px', textTransform: 'uppercase', opacity: 0.7 }}>From</span><br/>
                          <strong style={{ color: 'var(--text-color)' }}>{String(sourceNode?.data?.label || 'Unknown')}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', textTransform: 'uppercase', opacity: 0.7 }}>To</span><br/>
                          <strong style={{ color: 'var(--text-color)' }}>{String(targetNode?.data?.label || 'Unknown')}</strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <button 
                        className="btn" 
                        style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px', color: 'var(--color-trigger)' }} 
                        onClick={() => {
                          setEdges(eds => eds.filter(e => e.id !== edge.id));
                          closeEdgeMenu();
                        }}
                      >
                        <Unlink size={16} /> Delete Link
                      </button>
                    </div>
                 </div>
               );
            })()}
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onEdgeClick={onEdgeClick}
          isValidConnection={isValidConnection}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          onMove={handleMove}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          connectionMode={ConnectionMode.Loose}
          defaultEdgeOptions={{
            type: 'bezier',
            animated: false,
            style: { stroke: '#94a3b8', strokeWidth: 3, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }
          }}
          minZoom={0.05}
          maxZoom={100}
          className={theme === 'dark' ? "dark-theme-flow" : "light-theme-flow"}
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={24} 
            size={2} 
            color={theme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)'} 
          />
          <MiniMap 
            position="top-left"
            nodeStrokeColor={(n: any) => getEdgeColor(n.data.type as string, theme)}
            nodeColor="var(--bg-card)"
            maskColor={theme === 'dark' ? "rgba(0,0,0, 0.6)" : "rgba(240,240,240, 0.4)"}
            style={{ 
              backgroundColor: 'var(--bg-card-glass)', 
              backdropFilter: 'blur(10px)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '12px', 
              marginTop: '80px', 
              marginLeft: '20px',
              opacity: isCanvasMoving ? 1 : 0,
              pointerEvents: isCanvasMoving ? 'auto' : 'none',
              transition: 'opacity 0.5s ease-in-out'
            }}
          />
          <Controls position="bottom-right" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fill: 'var(--text-secondary)' }} />
        </ReactFlow>
      </div>
    </div>
  );
};

export default function AppWrapper() {
  return (
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  );
}
