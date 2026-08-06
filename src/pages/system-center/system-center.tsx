import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { systemCenterStore } from '@/stores/system-center-store';
import { localize } from '@deriv-com/translations';
import './system-center.scss';

export const SystemCenter = observer(() => {
    const [activeTab, setActiveTab] = useState<'status' | 'ws' | 'api' | 'perf' | 'diag'>('status');

    // Emulate Performance/FPS tracking for Phase 8
    useEffect(() => {
        let lastTime = performance.now();
        let frames = 0;
        let animationId: number;

        const loop = () => {
            const now = performance.now();
            frames++;
            if (now > lastTime + 1000) {
                const fps = Math.round((frames * 1000) / (now - lastTime));
                // Mock CPU based on reverse FPS + some variance
                const cpu = Math.max(5, Math.min(100, 100 - fps + Math.floor(Math.random() * 10)));
                systemCenterStore.updateHealth(fps, cpu, 0); // Memory requires performance.memory which is non-standard
                frames = 0;
                lastTime = now;
            }
            animationId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(animationId);
    }, []);

    const renderSidebar = () => (
        <div className="sc-sidebar">
            <div className="sc-sidebar__header">
                <h2>{localize('System Center')}</h2>
                <p>NOC Operations Dashboard</p>
            </div>
            <div className="sc-sidebar__nav">
                {[
                    { id: 'status', label: 'Live Status' },
                    { id: 'ws', label: 'WebSocket Monitor' },
                    { id: 'api', label: 'API Inspector' },
                    { id: 'perf', label: 'Performance' },
                    { id: 'diag', label: 'Diagnostics Engine' },
                ].map(tab => (
                    <div 
                        key={tab.id}
                        className={`sc-sidebar__item ${activeTab === tab.id ? 'sc-sidebar__item--active' : ''}`}
                        onClick={() => setActiveTab(tab.id as any)}
                    >
                        {localize(tab.label)}
                    </div>
                ))}
            </div>
        </div>
    );

    const renderLiveStatus = () => {
        const isHealthy = systemCenterStore.wsStats.connected && systemCenterStore.wsStats.latency < 500;
        const latency = systemCenterStore.wsStats.latency;
        
        return (
            <div>
                <div className="sc-grid-3">
                    <div className={`sc-card ${isHealthy ? 'sc-card--success' : (latency > 1000 ? 'sc-card--danger' : 'sc-card--warning')}`}>
                        <h3 className="sc-card__title">Deriv Connection</h3>
                        <p className="sc-card__value">
                            {systemCenterStore.wsStats.connected ? 'ONLINE' : 'OFFLINE'}
                        </p>
                    </div>
                    <div className={`sc-card ${latency < 200 ? 'sc-card--success' : (latency > 1000 ? 'sc-card--danger' : 'sc-card--warning')}`}>
                        <h3 className="sc-card__title">Current Latency</h3>
                        <p className="sc-card__value">
                            {latency} <small>ms</small>
                        </p>
                    </div>
                    <div className="sc-card sc-card--info">
                        <h3 className="sc-card__title">Average Latency</h3>
                        <p className="sc-card__value">
                            {Math.round(systemCenterStore.wsStats.avgLatency)} <small>ms</small>
                        </p>
                    </div>
                </div>

                <div className="sc-panel">
                    <div className="sc-panel__header">Tab Monitor (Global Error Boundaries)</div>
                    <table className="sc-table">
                        <thead>
                            <tr>
                                <th>Module / Tab</th>
                                <th>Status</th>
                                <th>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(systemCenterStore.tabs.values()).map(tab => (
                                <tr key={tab.id}>
                                    <td>{tab.name}</td>
                                    <td>
                                        <span className={`status-badge ${tab.status === 'Ready' ? 'success' : (tab.status === 'Error' ? 'error' : 'warning')}`}>
                                            {tab.status}
                                        </span>
                                    </td>
                                    <td>{new Date(tab.lastUpdated).toLocaleTimeString()}</td>
                                </tr>
                            ))}
                            {systemCenterStore.tabs.size === 0 && (
                                <tr><td colSpan={3} style={{ textAlign: 'center', opacity: 0.5 }}>No tabs registered yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderWsMonitor = () => (
        <div>
            <div className="sc-grid-3">
                <div className="sc-card sc-card--info">
                    <h3 className="sc-card__title">Messages Sent</h3>
                    <p className="sc-card__value">{systemCenterStore.wsStats.sent.toLocaleString()}</p>
                </div>
                <div className="sc-card sc-card--success">
                    <h3 className="sc-card__title">Messages Received</h3>
                    <p className="sc-card__value">{systemCenterStore.wsStats.received.toLocaleString()}</p>
                </div>
                <div className="sc-card sc-card--danger">
                    <h3 className="sc-card__title">Reconnects</h3>
                    <p className="sc-card__value">{systemCenterStore.wsStats.reconnects}</p>
                </div>
            </div>

            <div className="sc-panel">
                <div className="sc-panel__header">Live WebSocket Traffic (Max {systemCenterStore.MAX_LOGS})</div>
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    <table className="sc-table">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Dir</th>
                                <th>Type</th>
                                <th>Size (Bytes)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {systemCenterStore.wsMessages.slice(0, 50).map(msg => (
                                <tr key={msg.id}>
                                    <td>{new Date(msg.timestamp).toISOString().split('T')[1].replace('Z', '')}</td>
                                    <td style={{ color: msg.direction === 'IN' ? '#10b981' : '#3b82f6' }}>{msg.direction}</td>
                                    <td>{msg.type}</td>
                                    <td>{msg.size}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderApiInspector = () => (
        <div>
            <div className="sc-panel">
                <div className="sc-panel__header">REST API Inspector</div>
                <div style={{ maxHeight: '700px', overflowY: 'auto' }}>
                    <table className="sc-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Status</th>
                                <th>Duration</th>
                                <th>Size</th>
                            </tr>
                        </thead>
                        <tbody>
                            {systemCenterStore.apiRequests.map(req => (
                                <tr key={req.id}>
                                    <td style={{ fontWeight: 600 }}>{req.method}</td>
                                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {req.endpoint.replace('https://', '')}
                                    </td>
                                    <td>
                                        <span className={`status-badge ${req.status === 200 || req.status === 204 ? 'success' : (req.status === 0 ? 'error' : 'warning')}`}>
                                            {req.status === 0 ? 'FAIL' : req.status}
                                        </span>
                                    </td>
                                    <td>{req.duration}ms</td>
                                    <td>{(req.size / 1024).toFixed(1)} KB</td>
                                </tr>
                            ))}
                            {systemCenterStore.apiRequests.length === 0 && (
                                <tr><td colSpan={5} style={{ textAlign: 'center', opacity: 0.5 }}>Waiting for API requests...</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderPerformance = () => (
        <div>
            <div className="sc-grid-3">
                <div className={`sc-card ${systemCenterStore.health.fps >= 30 ? 'sc-card--success' : 'sc-card--danger'}`}>
                    <h3 className="sc-card__title">React Render FPS</h3>
                    <p className="sc-card__value">{systemCenterStore.health.fps}</p>
                </div>
                <div className={`sc-card ${systemCenterStore.health.cpu < 70 ? 'sc-card--info' : 'sc-card--warning'}`}>
                    <h3 className="sc-card__title">Est. CPU Load</h3>
                    <p className="sc-card__value">{systemCenterStore.health.cpu}%</p>
                </div>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', padding: '1rem' }}>
                Note: These metrics track the UI render cycle speed. Lower FPS indicates heavy React rendering overhead (e.g., from massive real-time WebSocket ticks).
            </p>
        </div>
    );

    const renderDiagnostics = () => (
        <div>
            <h2 style={{ marginTop: 0, marginBottom: '2rem' }}>AI Diagnostics Engine (Phase 10)</h2>
            {systemCenterStore.diagnostics.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                    <p>No critical failures detected.</p>
                </div>
            ) : (
                systemCenterStore.diagnostics.map(diag => (
                    <div key={diag.id} className={`sc-diagnostic-card ${diag.recoveryStatus === 'Success' ? 'resolved' : ''}`}>
                        <h3>
                            {diag.rootCause}
                            <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', background: diag.recoveryStatus === 'Success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' }}>
                                {diag.recoveryStatus === 'Success' ? 'Self-Healed' : 'Critical Failure'}
                            </span>
                        </h3>
                        <div className="diag-grid">
                            <div>
                                <strong>Affected Modules</strong>
                                {diag.affectedModules.join(', ')}
                            </div>
                            <div>
                                <strong>Recommended Fix / Action Taken</strong>
                                {diag.recommendedFix}
                            </div>
                            <div>
                                <strong>Timestamp</strong>
                                {new Date(diag.timestamp).toLocaleString()}
                            </div>
                            <div>
                                <strong>Diagnostic ID</strong>
                                {diag.id}
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    return (
        <div className="system-center-container">
            {renderSidebar()}
            <div className="sc-content">
                <div className="sc-content__header">
                    <h1>Operations Center</h1>
                    <div className="sc-server-time">
                        {new Date(systemCenterStore.serverTime * 1000 || Date.now()).toUTCString()}
                    </div>
                </div>
                
                {activeTab === 'status' && renderLiveStatus()}
                {activeTab === 'ws' && renderWsMonitor()}
                {activeTab === 'api' && renderApiInspector()}
                {activeTab === 'perf' && renderPerformance()}
                {activeTab === 'diag' && renderDiagnostics()}
            </div>
        </div>
    );
});
