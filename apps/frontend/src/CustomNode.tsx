import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, Globe, Database, Shuffle, Plus, Lock, Play, Mail, FileSpreadsheet } from 'lucide-react';

export const CustomNode = ({ id, data }: any) => {
  const isLocked = !!data.isLocked;

  const getIcon = () => {
    switch (data.type) {
      case 'webhook': return <Zap size={20} />;
      case 'manual_trigger': return <Play size={20} />;
      case 'csv_input': return <FileSpreadsheet size={20} />;
      case 'gmail': return <Mail size={20} />;
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

  const colorVar = `var(--color-${data.type}, var(--color-primary))`;
  const bgVar = `rgba(var(--color-${data.type}-rgb, 99, 102, 241), 0.15)`;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default browser right-click menu
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('openNodeContextMenu', {
      detail: {
        nodeId: id,
        isLocked: isLocked,
        x: e.clientX,
        y: e.clientY
      }
    }));
  };

  return (
    <div 
      className={`custom-node ${isLocked ? 'nodrag' : ''}`} 
      data-type={data.type}
      onContextMenu={handleContextMenu}
      style={{
        transition: 'all 0.3s ease',
        ...(isLocked ? {
          borderColor: 'var(--color-action)',
          boxShadow: '0 0 0 2px var(--color-action), 0 4px 20px rgba(0,0,0,0.1)'
        } : {})
      } as React.CSSProperties}
    >
      {/* Target handle (input) */}
      {(data.type !== 'webhook' && data.type !== 'manual_trigger') && (
        <Handle 
          type="target" 
          position={Position.Left} 
          className={isLocked ? "giant-target-handle" : ""} 
        />
      )}
      
      <div className="node-content-wrapper">
        <div className="node-header">
          <div className="node-icon" style={{ color: colorVar, background: bgVar }}>
            {getIcon()}
          </div>
          <div className="node-title-area">
            <div className="node-title">{data.label}</div>
            {data.description && <div className="node-description">{data.description}</div>}
          </div>
          <div className="node-lock-indicator">
            {isLocked && <Lock size={12} color="var(--text-secondary)" />}
          </div>
        </div>
        
        {data.configSummary && (
          <div className="node-config-summary">
            {data.configSummary}
          </div>
        )}
      </div>

      {/* Lock Indicator Icon */}
      {isLocked && (
        <div style={{ position: 'absolute', top: -12, right: -12, background: 'var(--color-action)', borderRadius: '50%', padding: '4px', color: 'white' }}>
          <Lock size={12} />
        </div>
      )}

      {/* Source handles (output) */}
      <Handle 
        type="source" 
        position={Position.Right} 
        id={data.type === 'if_condition' ? 'true' : 'default'} 
        className={isLocked ? `giant-source-handle ${(data.type === 'webhook' || data.type === 'manual_trigger') ? 'giant-source-handle-full' : ''}` : ""}
        style={data.type === 'if_condition' ? { top: '35%' } : undefined}
      />
      {data.type === 'if_condition' && (
        <div style={{ position: 'absolute', right: '-4px', top: '35%', transform: 'translateY(-50%)', fontSize: '9px', background: 'var(--bg-card)', padding: '2px 4px', borderRadius: '4px', zIndex: 10 }}>True</div>
      )}
      
      {data.type === 'if_condition' && (
        <>
          <Handle 
            type="source" 
            position={Position.Right} 
            id="false" 
            style={{ top: '65%' }} 
          />
          <div style={{ position: 'absolute', right: '-4px', top: '65%', transform: 'translateY(-50%)', fontSize: '9px', background: 'var(--bg-card)', padding: '2px 4px', borderRadius: '4px', zIndex: 10 }}>False</div>
        </>
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
