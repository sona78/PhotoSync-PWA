import React, { useEffect, useRef } from 'react';
import './DebugLog.css';

const DebugLog = ({ logs, visible, onToggle, onClear }) => {
  const logContainerRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current && visible) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, visible]);

  if (!visible) {
    return (
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={onToggle}
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '16px',
            padding: '8px 16px',
            background: '#fff',
            color: '#000',
            border: '2px solid #000',
            cursor: 'pointer',
            textTransform: 'uppercase',
            width: '100%',
          }}
        >
          SHOW DEBUG LOGS
        </button>
      </div>
    );
  }

  return (
    <div className="debug-log-container" style={{ marginBottom: '20px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        gap: '10px',
      }}>
        <button
          onClick={onToggle}
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '16px',
            padding: '8px 16px',
            background: '#000',
            color: '#fff',
            border: '2px solid #000',
            cursor: 'pointer',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          HIDE DEBUG LOGS
        </button>
        <button
          onClick={onClear}
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '16px',
            padding: '8px 16px',
            background: '#fff',
            color: '#000',
            border: '2px solid #000',
            cursor: 'pointer',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          CLEAR LOGS
        </button>
      </div>
      <div
        ref={logContainerRef}
        className="debug-log-content"
        style={{
          fontFamily: "'Courier New', monospace",
          fontSize: '12px',
          background: '#000',
          color: '#00ff00',
          padding: '10px',
          border: '2px solid #00ff00',
          height: '300px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#666' }}>No logs yet. Start scanning to see debug info.</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              style={{
                marginBottom: '4px',
                color: log.level === 'error' ? '#ff4444' : log.level === 'warn' ? '#ffaa00' : '#00ff00',
              }}
            >
              <span style={{ color: '#888' }}>[{log.timestamp}]</span>{' '}
              <span style={{ color: '#00aaff' }}>[{log.level.toUpperCase()}]</span>{' '}
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DebugLog;
