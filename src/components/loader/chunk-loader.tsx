import { useEffect, useState } from 'react';
import { Activity, Sparkles, Zap } from 'lucide-react';
import './chunk-loader.scss';

interface ChunkLoaderProps {
    message?: string;
    isWelcome?: boolean;
}

export default function ChunkLoader({ message = 'Loading workspace...', isWelcome = false }: ChunkLoaderProps) {
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>(['[SYSTEM] Quantum boot sequence initialized...']);

    useEffect(() => {
        if (!isWelcome) return;

        const terminalMessages = [
            '[SYSTEM] Quantum boot sequence initialized...',
            '[NET] Establishing secure Deriv WebSocket connection...',
            '[AUTH] Validating authorized algorithmic tokens...',
            '[CORE] Loading Neural Digit Prediction Models...',
            '[MARKET] Calibrating live multi-synthetic liquidity...',
            '[AI] Synchronizing real-time parity detection nodes...',
            '[INIT] System ready. Welcome to Profit Hub Expert.',
        ];

        let currentMsgIndex = 0;

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                const next = prev + Math.floor(Math.random() * 8) + 4;

                const expectedIndex = Math.min(Math.floor((next / 100) * terminalMessages.length), terminalMessages.length - 1);
                if (expectedIndex > currentMsgIndex) {
                    currentMsgIndex = expectedIndex;
                    setLogs(prevLogs => [...prevLogs, terminalMessages[currentMsgIndex]]);
                }

                return Math.min(next, 100);
            });
        }, 120);

        return () => clearInterval(timer);
    }, [isWelcome]);

    if (!isWelcome) {
        return (
            <div className="ultimate-compact-loader">
                <div className="ucl-spinner">
                    <div className="ucl-ring ucl-ring-1" />
                    <div className="ucl-ring ucl-ring-2" />
                    <div className="ucl-core">
                        <Zap size={16} className="ucl-icon text-gold" />
                    </div>
                </div>
                {message && (
                    <div className="ucl-text">
                        <span className="ucl-label">{message}</span>
                        <span className="ucl-dots">...</span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="fx-welcome-loader">
            {/* Ambient Background Lights */}
            <div className="fx-background">
                <div className="fx-grid" />
                <div className="fx-glow fx-glow-1" />
                <div className="fx-glow fx-glow-2" />
                <div className="fx-blur-overlay" />
            </div>

            {/* Glowing Holographic Glass Card */}
            <div className="fx-glass-card">
                <div className="fx-card-header">
                    <div className="fx-logo-orb">
                        <Activity size={24} className="icon-pulse" />
                    </div>
                    <div className="fx-brand">
                        <h1 className="fx-title">ProfitHub Expert</h1>
                        <span className="fx-subtitle">QUANTUM ALGORITHMIC TRADING NETWORK</span>
                    </div>
                </div>

                {/* Live Diagnostic Terminal Console */}
                <div className="fx-terminal">
                    <div className="fx-terminal-header">
                        <div className="terminal-dots">
                            <span className="dot red" />
                            <span className="dot yellow" />
                            <span className="dot green" />
                        </div>
                        <span className="terminal-title">quantum_boot.exe</span>
                    </div>
                    <div className="fx-terminal-body">
                        {logs.map((log, index) => (
                            <div key={index} className="fx-log-line">
                                <span className="log-timestamp">{new Date().toISOString().split('T')[1].substring(0, 12)}</span>
                                <span className="log-text">{log}</span>
                            </div>
                        ))}
                        {progress < 100 && (
                            <div className="fx-log-line typing">
                                <span className="cursor">_</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Progress Tracking Telemetry */}
                <div className="fx-progress-container">
                    <div className="fx-progress-meta">
                        <span className="status-text">
                            <Sparkles size={12} className="text-gold" /> System Initializing...
                        </span>
                        <span className="status-pct">{progress}%</span>
                    </div>
                    <div className="fx-progress-track">
                        <div className="fx-progress-fill" style={{ width: `${progress}%` }}>
                            <div className="fx-progress-glow" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
