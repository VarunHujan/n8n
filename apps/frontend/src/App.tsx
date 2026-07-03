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
import { useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { Play, Save, Zap, Globe, Database, Shuffle, Sun, Moon, Lock, Unlock, Trash, Unlink, Plus, PanelLeftClose, PanelLeft, FileSpreadsheet, Mail } from 'lucide-react';
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
      type: 'manual_trigger', 
      label: 'Manual Trigger', 
      description: 'Starts the workflow when you click Play',
      configSummary: 'Click to run',
      parameters: {}
    },
  }
];

const App = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(import.meta.env.VITE_REQUIRE_LOGIN !== 'true');
  const [userProfile, setUserProfile] = useState<{name: string, email: string} | null>(
    import.meta.env.VITE_REQUIRE_LOGIN !== 'true' ? { name: 'Guest User', email: 'guest@local' } : null
  );
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  const updateNodeParameters = (nodeId: string, newParams: any) => {
    setNodes(nds => nds.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            parameters: { ...(n.data.parameters || {}), ...newParams }
          }
        };
      }
      return n;
    }));
  };
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
    sourceNodeId: null,
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
      nodes: nodes.map(n => {
        const params: any = { ...(n.data.parameters || {}) };
        if (n.data.type === 'gmail_send') {
          params.accessToken = accessToken;
        }
        return {
          id: n.id,
          type: n.data.type,
          parameters: params
        };
      }),
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
        body: JSON.stringify({ workflow, initialPayload: { message: 'Triggered from React UI', accessToken } })
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

  const handleLogin = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
    onSuccess: async (codeResponse) => {
      console.log('Got Auth Code:', codeResponse.code);
      
      // Send the code to our NestJS backend to exchange for tokens
      try {
        const res = await fetch('http://localhost:3000/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeResponse.code })
        });
        const data = await res.json();
        
        if (data.success) {
          setUserProfile({ name: data.user.name, email: data.user.email });
          setAccessToken(data.access_token);
          setIsAuthenticated(true);
        } else {
          console.error("Backend auth failed:", data.error);
        }
      } catch (error) {
        console.error("Failed to authenticate with backend", error);
      }
    },
    onError: (error) => console.log('Login Failed:', error)
  });

  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-icon-wrapper">
            <Zap size={32} />
          </div>
          <h1 className="login-title">Welcome Back</h1>
          <p className="login-subtitle">Sign in to sync your workflows and authenticate your automation nodes.</p>
          
          <button className="google-auth-btn" onClick={handleLogin}>
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M47.532 24.5528C47.532 22.9214 47.3997 21.2811 47.1175 19.6761H24.48V28.9181H37.4434C36.9055 31.8988 35.177 34.5356 32.6461 36.2111V42.2078H40.3801C44.9217 38.0278 47.532 31.8547 47.532 24.5528Z" fill="#4285F4"/>
              <path d="M24.48 48.0016C30.9529 48.0016 36.4116 45.8764 40.3888 42.2078L32.6549 36.2111C30.5031 37.675 27.7253 38.5056 24.48 38.5056C18.2276 38.5056 12.9305 34.2798 11.0139 28.6006H3.03296V34.7825C7.10718 42.8868 15.4056 48.0016 24.48 48.0016Z" fill="#34A853"/>
              <path d="M11.0051 28.6006C9.99973 25.6199 9.99973 22.3923 11.0051 19.4117V13.2297H3.03296C-0.371021 20.0012 -0.371021 28.0111 3.03296 34.7825L11.0051 28.6006Z" fill="#FBBC04"/>
              <path d="M24.48 9.49606C27.9016 9.42125 31.2086 10.7027 33.6841 13.0573L40.5387 6.20263C36.1956 2.14818 30.4184 -0.0619894 24.48 0.00125439C15.4056 0.00125439 7.10718 5.11603 3.03296 13.2297L11.0051 19.4117C12.9129 13.7237 18.2188 9.49606 24.48 9.49606Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout" data-theme={theme}>
      
      {/* Top Right User Profile Badge */}
      {userProfile && (
        <div className="user-profile-badge">
          <div className="user-avatar">{userProfile.name.charAt(0)}</div>
          <div className="user-details">
            <span className="user-name">{userProfile.name}</span>
            <span className="user-status">Authenticated</span>
          </div>
        </div>
      )}

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
            
            <div className="dndnode manual_trigger" onDragStart={(e) => onDragStart(e, 'manual_trigger', 'Manual Trigger', 'Starts workflow when you click Execute')} draggable>
              <div className="sidebar-icon" style={{ color: 'var(--color-manual_trigger)' }}><Play size={20} /></div>
              <div>
                <strong>Manual Trigger</strong>
                <span>Click to start workflow</span>
              </div>
            </div>

            <div className="dndnode csv_input" onDragStart={(e) => onDragStart(e, 'csv_input', 'CSV Data', 'Provides tabular data like emails and names')} draggable>
              <div className="sidebar-icon" style={{ color: 'var(--color-csv_input)' }}><FileSpreadsheet size={20} /></div>
              <div>
                <strong>CSV Data</strong>
                <span>Tabular data source</span>
              </div>
            </div>

            <div className="dndnode gmail_send" onDragStart={(e) => onDragStart(e, 'gmail_send', 'Send Gmail', 'Sends an email using your authenticated account')} draggable>
              <div className="sidebar-icon" style={{ color: 'var(--color-gmail_send)' }}><Mail size={20} /></div>
              <div>
                <strong>Send Gmail</strong>
                <span>Sends an email</span>
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
                <button className="btn" style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px' }} onClick={() => addNodeFromMenu('manual_trigger', 'Manual Trigger', 'Starts workflow')}>
                  <Play size={16} color="var(--color-manual_trigger)" /> Manual Trigger
                </button>
                <button className="btn" style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px' }} onClick={() => addNodeFromMenu('csv_input', 'CSV Data', 'Tabular data source')}>
                  <FileSpreadsheet size={16} color="var(--color-csv_input)" /> CSV Data
                </button>
                <button className="btn" style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 12px' }} onClick={() => addNodeFromMenu('gmail_send', 'Send Gmail', 'Sends an email')}>
                  <Mail size={16} color="var(--color-gmail_send)" /> Send Gmail
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
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
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
          <Controls style={{ left: 16 }} />
        </ReactFlow>

        {/* Right Sidebar for Node Properties */}
        {selectedNodeId && (
          <div className="properties-panel">
            {(() => {
              const selectedNode = nodes.find(n => n.id === selectedNodeId);
              if (!selectedNode) return null;
              
              const p = selectedNode.data.parameters || {};

              return (
                <>
                  <div className="properties-header">
                    <h2>{selectedNode.data.label as string}</h2>
                    <button className="close-btn" onClick={() => setSelectedNodeId(null)}>×</button>
                  </div>
                  <div className="properties-content">
                    {selectedNode.data.type === 'csv_input' && (
                      <div className="form-group">
                        <label>CSV Data (Paste here)</label>
                        <textarea 
                          placeholder="email,name&#10;test@example.com,John"
                          value={p.csvData || ''}
                          onChange={(e) => updateNodeParameters(selectedNode.id, { csvData: e.target.value })}
                          rows={10}
                        />
                      </div>
                    )}
                    {selectedNode.data.type === 'gmail_send' && (
                      <>
                        <div className="form-group">
                          <label>To Email</label>
                          <input 
                            type="text" 
                            placeholder="{{email}}"
                            value={p.to || ''}
                            onChange={(e) => updateNodeParameters(selectedNode.id, { to: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Subject</label>
                          <input 
                            type="text" 
                            placeholder="Hello {{name}}"
                            value={p.subject || ''}
                            onChange={(e) => updateNodeParameters(selectedNode.id, { subject: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Body (Text/HTML)</label>
                          <textarea 
                            placeholder="Welcome to our platform!"
                            value={p.body || ''}
                            onChange={(e) => updateNodeParameters(selectedNode.id, { body: e.target.value })}
                            rows={8}
                          />
                        </div>
                      </>
                    )}
                    {selectedNode.data.type === 'manual_trigger' && (
                      <div className="form-group">
                        <label>Info</label>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          Click the "Execute Workflow" button to run the flow from this node.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
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
