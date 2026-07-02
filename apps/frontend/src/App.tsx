import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  useReactFlow,
  MiniMap
} from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import { CustomNode } from './CustomNode';
import { Play, Save, Zap, Globe, Database, Shuffle, Sun, Moon } from 'lucide-react';
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
  const [theme, setTheme] = useState('light');
  const { screenToFlowPosition } = useReactFlow();

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
    sourceNodeId: null,
    screenPos: { x: 0, y: 0 }
  });

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
    };

    window.addEventListener('openNodeMenu', handleOpenMenu);
    return () => window.removeEventListener('openNodeMenu', handleOpenMenu);
  }, [screenToFlowPosition]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const sourceNode = nodes.find(n => n.id === params.source);
      const edgeColor = getEdgeColor(sourceNode?.data.type as string, theme);
      
      setEdges((eds) => addEdge({ 
        ...params, 
        type: 'smoothstep', 
        animated: true, 
        style: { stroke: edgeColor, strokeWidth: 2.5 } 
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
        animated: true,
        style: { stroke: edgeColor, strokeWidth: 2.5 }
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
      
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const position = {
        x: event.clientX - reactFlowBounds.left - 140, 
        y: event.clientY - reactFlowBounds.top - 40,
      };

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
        target: e.target
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
    <div className="app-layout">
      {/* Sidebar / Node Palette */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>
            <Zap size={24} color="#8b5cf6" />
            Automate
          </h1>
        </div>
        <div className="node-list">
          <p className="node-list-title">AVAILABLE NODES</p>
          
          <div className="draggable-node" onDragStart={(e) => onDragStart(e, 'webhook', 'Webhook Trigger', 'Starts on incoming HTTP request')} draggable>
            <div className="sidebar-icon icon-trigger"><Zap size={20} /></div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Webhook</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Trigger</div>
            </div>
          </div>

          <div className="draggable-node" onDragStart={(e) => onDragStart(e, 'http_request', 'HTTP Request', 'Makes an external API call')} draggable>
            <div className="sidebar-icon icon-action"><Globe size={20} /></div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>HTTP Request</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Action</div>
            </div>
          </div>

          <div className="draggable-node" onDragStart={(e) => onDragStart(e, 'set_data', 'Set Data', 'Sets or merges specific fields')} draggable>
            <div className="sidebar-icon icon-data"><Database size={20} /></div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Set Data</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Transform</div>
            </div>
          </div>

          <div className="draggable-node" onDragStart={(e) => onDragStart(e, 'if_condition', 'If / Else', 'Branches workflow based on condition')} draggable>
            <div className="sidebar-icon icon-logic"><Shuffle size={20} /></div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>If Condition</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Logic</div>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="canvas-area" ref={reactFlowWrapper} onClick={closeMenu}>
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
                                animated: true,
                                style: { stroke: edgeColor, strokeWidth: 2.5 }
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

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { stroke: theme === 'dark' ? '#8b5cf6' : '#7c3aed', strokeWidth: 2.5 },
          }}
          minZoom={0.01}
          maxZoom={100}
          fitView
          className={theme === 'dark' ? "dark-theme-flow" : "light-theme-flow"}
        >
          <MiniMap 
            nodeStrokeColor={(n: any) => getEdgeColor(n.data.type as string, theme)}
            nodeColor="var(--bg-card)"
            maskColor={theme === 'dark' ? "rgba(0,0,0, 0.4)" : "rgba(240,240,240, 0.6)"}
            style={{ backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
          />
          <Background color={theme === 'dark' ? '#3f3f46' : '#cbd5e1'} gap={20} size={1} />
          <Controls style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fill: 'var(--text-secondary)' }} />
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
