import React, { useState, useEffect } from 'react';

/**
 * Connection Diagnostics Panel
 * Displays detailed debugging information for troubleshooting connection issues
 */
export default function ConnectionDiagnostics({ debugLogs, connectionState, serverInfo }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    // Run diagnostics on mount
    runDiagnostics();
  }, []);

  const runDiagnostics = () => {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);

    let iOSVersion = null;
    if (isIOS) {
      const match = ua.match(/OS (\d+)_(\d+)_?(\d+)?/);
      if (match) {
        iOSVersion = `${match[1]}.${match[2]}${match[3] ? '.' + match[3] : ''}`;
      }
    }

    const isStandalone = window.navigator.standalone ||
                         window.matchMedia('(display-mode: standalone)').matches;

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    setDiagnostics({
      // Browser
      userAgent: ua,
      platform: navigator.platform,
      isIOS,
      iOSVersion,
      isAndroid,
      isSafari,
      isChrome: /Chrome/.test(ua),

      // PWA
      isPWA: isStandalone,
      displayMode: isStandalone ? 'standalone' : 'browser',

      // Page context
      pageURL: window.location.href,
      pageProtocol: window.location.protocol,
      isSecureContext: window.isSecureContext,

      // Network
      onlineStatus: navigator.onLine,
      connectionType: connection?.effectiveType || 'unknown',
      downlink: connection?.downlink || 'unknown',
      rtt: connection?.rtt || 'unknown',

      // Capabilities
      webSocketSupported: 'WebSocket' in window,
      serviceWorkerSupported: 'serviceWorker' in navigator,

      // Performance
      deviceMemory: navigator.deviceMemory || 'unknown',
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',

      // Viewport
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio
    });
  };

  const testServerReachability = async () => {
    if (!serverInfo?.address || !serverInfo?.port) {
      setTestResults({ error: 'No server configured' });
      return;
    }

    const results = { timestamp: new Date().toISOString() };

    // Test HTTPS endpoint
    try {
      const testUrl = `https://${serverInfo.address}:${serverInfo.port}/health`;
      results.testUrl = testUrl;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const startTime = Date.now();
      const response = await fetch(testUrl, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'no-cors'
      }).catch(err => ({ error: err.message, name: err.name }));

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      results.latency = `${latency}ms`;
      results.reachable = !response.error;
      results.error = response.error;
      results.errorType = response.name;

    } catch (err) {
      results.error = err.message;
      results.reachable = false;
    }

    setTestResults(results);
  };

  const copyLogsToClipboard = () => {
    const logText = debugLogs.map(log =>
      `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${
        log.metadata ? '\n  ' + JSON.stringify(log.metadata, null, 2) : ''
      }`
    ).join('\n');

    navigator.clipboard.writeText(logText).then(() => {
      alert('Logs copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy logs:', err);
    });
  };

  const copyDiagnosticsToClipboard = () => {
    const diagText = JSON.stringify(diagnostics, null, 2);
    navigator.clipboard.writeText(diagText).then(() => {
      alert('Diagnostics copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy diagnostics:', err);
    });
  };

  if (!diagnostics) return null;

  return (
    <div style={styles.container}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={styles.toggleButton}
      >
        {isExpanded ? '▼' : '▶'} Connection Diagnostics
      </button>

      {isExpanded && (
        <div style={styles.panel}>
          {/* System Information */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>System Information</h3>
            <table style={styles.table}>
              <tbody>
                <tr>
                  <td style={styles.label}>Device:</td>
                  <td style={styles.value}>
                    {diagnostics.isIOS ? `iOS ${diagnostics.iOSVersion || 'unknown'}` :
                     diagnostics.isAndroid ? 'Android' : 'Other'}
                  </td>
                </tr>
                <tr>
                  <td style={styles.label}>Browser:</td>
                  <td style={styles.value}>
                    {diagnostics.isSafari ? 'Safari' :
                     diagnostics.isChrome ? 'Chrome' : 'Other'}
                  </td>
                </tr>
                <tr>
                  <td style={styles.label}>PWA Mode:</td>
                  <td style={styles.value}>
                    {diagnostics.isPWA ? '✅ Yes' : '❌ No (Browser Tab)'}
                  </td>
                </tr>
                <tr>
                  <td style={styles.label}>Secure Context:</td>
                  <td style={styles.value}>
                    {diagnostics.isSecureContext ? '✅ Yes' : '❌ No'}
                  </td>
                </tr>
                <tr>
                  <td style={styles.label}>Online Status:</td>
                  <td style={styles.value}>
                    {diagnostics.onlineStatus ? '✅ Online' : '❌ Offline'}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Connection Status */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Connection Status</h3>
            <div style={styles.statusBadge}>
              {connectionState.toUpperCase()}
            </div>
            {serverInfo && (
              <>
                <p style={styles.info}>
                  Server: {serverInfo.address}:{serverInfo.port}
                </p>
                <button onClick={testServerReachability} style={styles.button}>
                  Test Server Reachability
                </button>
                {testResults.timestamp && (
                  <div style={styles.testResults}>
                    <p><strong>Test Results:</strong></p>
                    <p>Latency: {testResults.latency || 'N/A'}</p>
                    <p>Reachable: {testResults.reachable ? '✅ Yes' : '❌ No'}</p>
                    {testResults.error && (
                      <p style={styles.error}>Error: {testResults.error}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* iOS-Specific Warnings */}
          {diagnostics.isIOS && (
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>⚠️ iOS-Specific Checks</h3>
              <div style={styles.warningBox}>
                {!diagnostics.isSecureContext && (
                  <p style={styles.warning}>
                    ❌ Not a secure context! iOS requires HTTPS for WebSockets.
                  </p>
                )}
                {!diagnostics.isPWA && (
                  <p style={styles.info}>
                    💡 For best results, add this app to your Home Screen.
                  </p>
                )}

                {/* Certificate Installation Options */}
                <div style={{
                  background: '#e7f3ff',
                  border: '2px solid #007AFF',
                  padding: '15px',
                  borderRadius: '8px',
                  margin: '15px 0'
                }}>
                  <p style={{ fontWeight: 'bold', color: '#007AFF', marginBottom: '10px' }}>
                    ✅ RECOMMENDED: Install Certificate Profile
                  </p>
                  <p style={{ fontSize: '14px', marginBottom: '10px' }}>
                    Install the certificate once - works forever, no warnings!
                  </p>
                  {serverInfo && (
                    <>
                      <a
                        href={`https://${serverInfo.address}:${serverInfo.port}/setup`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-block',
                          background: '#007AFF',
                          color: 'white',
                          padding: '10px 20px',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          fontWeight: 'bold',
                          margin: '10px 0'
                        }}
                      >
                        📥 Download Certificate Profile
                      </a>
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                        Opens setup page with step-by-step installation instructions.
                        Valid for 10 years after installation!
                      </p>
                    </>
                  )}
                </div>

                <div style={{
                  background: '#fff3cd',
                  border: '2px solid #ff9800',
                  padding: '15px',
                  borderRadius: '8px',
                  margin: '15px 0'
                }}>
                  <p style={{ fontWeight: 'bold', color: '#ff6600', marginBottom: '10px' }}>
                    ⚡ ALTERNATIVE: Manual Certificate Accept
                  </p>
                  <p style={{ fontSize: '13px', marginBottom: '8px' }}>
                    📱 Quick method (needs to be done before each connection):
                  </p>
                  {serverInfo && (
                    <>
                      <p style={{ fontSize: '13px', marginBottom: '8px' }}>
                        1. Copy this URL: <code style={{ background: 'white', padding: '2px 6px', borderRadius: '3px' }}>
                          https://{serverInfo.address}:{serverInfo.port}
                        </code>
                      </p>
                      <p style={{ fontSize: '13px', marginBottom: '8px' }}>
                        2. Open it in Safari and accept the certificate warning
                      </p>
                      <p style={{ fontSize: '13px' }}>
                        3. Return to PhotoSync and connect
                      </p>
                    </>
                  )}
                </div>

                <p style={styles.info}>
                  ⏱️ iOS PWAs have limited background time (~5 min). Keep app in foreground
                  during sync.
                </p>
              </div>
            </section>
          )}

          {/* Debug Logs */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>
              Debug Logs ({debugLogs.length})
              <button onClick={copyLogsToClipboard} style={styles.smallButton}>
                Copy Logs
              </button>
            </h3>
            <div style={styles.logContainer}>
              {debugLogs.slice(-50).reverse().map((log, idx) => (
                <div key={idx} style={{
                  ...styles.logEntry,
                  ...(log.level === 'error' ? styles.logError : {}),
                  ...(log.level === 'warn' ? styles.logWarn : {})
                }}>
                  <span style={styles.logTime}>[{log.timestamp}]</span>
                  <span style={styles.logLevel}>{log.level.toUpperCase()}</span>
                  <span style={styles.logMessage}>{log.message}</span>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <pre style={styles.logMetadata}>
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Actions */}
          <section style={styles.section}>
            <button onClick={copyDiagnosticsToClipboard} style={styles.button}>
              Copy All Diagnostics
            </button>
            <button onClick={runDiagnostics} style={styles.button}>
              Refresh Diagnostics
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    margin: '10px 0',
    border: '1px solid #ccc',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  toggleButton: {
    width: '100%',
    padding: '12px',
    background: '#f0f0f0',
    border: 'none',
    textAlign: 'left',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  panel: {
    padding: '15px',
    background: '#fafafa',
    maxHeight: '600px',
    overflowY: 'auto'
  },
  section: {
    marginBottom: '20px',
    padding: '10px',
    background: 'white',
    borderRadius: '6px'
  },
  sectionTitle: {
    margin: '0 0 10px 0',
    fontSize: '18px',
    fontWeight: 'bold'
  },
  table: {
    width: '100%',
    fontSize: '14px'
  },
  label: {
    fontWeight: 'bold',
    padding: '4px 8px',
    width: '40%'
  },
  value: {
    padding: '4px 8px'
  },
  statusBadge: {
    display: 'inline-block',
    padding: '8px 16px',
    background: '#007bff',
    color: 'white',
    borderRadius: '4px',
    fontWeight: 'bold',
    marginBottom: '10px'
  },
  info: {
    margin: '5px 0',
    fontSize: '14px'
  },
  button: {
    padding: '10px 16px',
    margin: '5px 5px 5px 0',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  smallButton: {
    padding: '4px 8px',
    marginLeft: '10px',
    background: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  testResults: {
    marginTop: '10px',
    padding: '10px',
    background: '#f8f9fa',
    borderRadius: '4px',
    fontSize: '14px'
  },
  warningBox: {
    padding: '10px',
    background: '#fff3cd',
    borderRadius: '4px'
  },
  warning: {
    color: '#856404',
    margin: '5px 0'
  },
  error: {
    color: '#dc3545',
    fontWeight: 'bold'
  },
  logContainer: {
    maxHeight: '300px',
    overflowY: 'auto',
    background: '#1e1e1e',
    padding: '10px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '12px'
  },
  logEntry: {
    marginBottom: '8px',
    padding: '6px',
    borderLeft: '3px solid #4CAF50',
    background: '#2d2d2d',
    color: '#e0e0e0'
  },
  logError: {
    borderLeftColor: '#f44336',
    background: '#3d2b2b'
  },
  logWarn: {
    borderLeftColor: '#ff9800',
    background: '#3d3520'
  },
  logTime: {
    color: '#888',
    marginRight: '8px'
  },
  logLevel: {
    fontWeight: 'bold',
    marginRight: '8px',
    color: '#4CAF50'
  },
  logMessage: {
    color: '#e0e0e0'
  },
  logMetadata: {
    marginTop: '4px',
    marginLeft: '20px',
    fontSize: '11px',
    color: '#aaa',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }
};
