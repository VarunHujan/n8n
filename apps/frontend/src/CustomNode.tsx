import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, Globe, Database, Shuffle, Plus } from 'lucide-react';

export const CustomNode = ({ id, data }: any) => {

  const getIcon = () => {
    switch (data.type) {
      case 'webhook': return <Zap size={20} />;
      case 'http_request': return <Globe size={20} />;
      case 'set_data': return <Database size={20} />;
      case 'if_condition': return <Shuffle size={20} />;
      default: return <Zap size={20} />;
    }
  };

  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Fire a custom event that App.tsx can listen to, or we can just pass a callback via context.
    // The easiest way is to dispatch a custom DOM event on the window.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('openNodeMenu', {
      detail: {
        sourceNodeId: id,
        x: rect.right + 20,
        y: rect.top
      }
    }));
  };

  return (
    <div className="custom-node" data-type={data.type}>
      {/* Target handle (input) */}
      {data.type !== 'webhook' && (
        <Handle type="target" position={Position.Left} />
      )}
      
      <div className="node-content-wrapper">
        <div className="node-header">
          <div className="node-icon-wrapper">
            {getIcon()}
          </div>
          <div className="node-title-area">
            <div className="node-title">{data.label}</div>
            <div className="node-subtitle">{data.description}</div>
          </div>
        </div>
        
        {data.configSummary && (
          <div style={{ marginTop: '16px' }}>
            <div className="node-pill">{data.configSummary}</div>
          </div>
        )}
      </div>

      {/* Source handle (output) */}
      <Handle type="source" position={Position.Right} id="a" />
      
      {data.type === 'if_condition' && (
        <Handle type="source" position={Position.Right} id="b" style={{ top: '75%' }} />
      )}

      {/* The new prominent + button on the right edge */}
      <div 
        onClick={handlePlusClick}
        style={{
          position: 'absolute',
          right: '-14px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: '50%',
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 20,
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-action)';
          e.currentTarget.style.borderColor = 'var(--color-action)';
          e.currentTarget.style.color = 'white';
          e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-panel)';
          e.currentTarget.style.borderColor = 'var(--border-color)';
          e.currentTarget.style.color = 'var(--text-primary)';
          e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
        }}
      >
        <Plus size={16} />
      </div>
    </div>
  );
};
