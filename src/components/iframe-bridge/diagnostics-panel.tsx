import React, { useEffect, useState } from 'react';
import { ParentBridgeClient, BridgeDiagnosticInfo } from './parent-bridge';
import './diagnostics-panel.scss';

interface DiagnosticsPanelProps {
    bridge: ParentBridgeClient | null;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({ bridge }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [diagnostics, setDiagnostics] = useState<BridgeDiagnosticInfo | null>(null);

    useEffect(() => {
        if (!bridge) {
            setDiagnostics(null);
            return;
        }

        setDiagnostics(bridge.getDiagnostics());

        const unsubscribe = bridge.subscribeDiagnostics(() => {
            setDiagnostics({ ...bridge.getDiagnostics() });
        });

        return () => unsubscribe();
    }, [bridge]);

    if (!bridge || !diagnostics) return null;

    if (!isOpen) {
        return (
            <button
                className='bridge-diagnostics-toggle'
                onClick={() => setIsOpen(true)}
                title='Open Bridge Diagnostics'
            >
                🛠️ Bridge: {diagnostics.state}
            </button>
        );
    }

    return (
        <div className='bridge-diagnostics-panel'>
            <div className='bridge-diagnostics-header'>
                <h3>Bridge Diagnostics</h3>
                <button onClick={() => setIsOpen(false)}>×</button>
            </div>

            <div className='bridge-diagnostics-content'>
                <div className='diag-row'>
                    <span className='diag-label'>State:</span>
                    <span className={`diag-value state-${diagnostics.state.toLowerCase()}`}>{diagnostics.state}</span>
                </div>
                <div className='diag-row'>
                    <span className='diag-label'>Session:</span>
                    <span className={`diag-value session-${diagnostics.sessionStatus}`}>
                        {diagnostics.sessionStatus}
                    </span>
                </div>
                <div className='diag-row'>
                    <span className='diag-label'>App ID:</span>
                    <span className='diag-value'>{diagnostics.appId}</span>
                </div>
                <div className='diag-row'>
                    <span className='diag-label'>Last Error:</span>
                    <span className='diag-value error'>{diagnostics.lastError || 'None'}</span>
                </div>

                <div className='diag-section-title'>Message History</div>
                <div className='diag-history'>
                    {diagnostics.messageHistory.map((entry, idx) => (
                        <div key={idx} className={`diag-msg ${entry.direction}`}>
                            <span className='diag-time'>{entry.time.toLocaleTimeString()}</span>
                            <span className='diag-dir'>{entry.direction === 'in' ? '↓' : '↑'}</span>
                            <span className='diag-type'>{entry.msg.type}</span>
                        </div>
                    ))}
                    {diagnostics.messageHistory.length === 0 && <div className='diag-msg empty'>No messages yet</div>}
                </div>
            </div>
        </div>
    );
};
