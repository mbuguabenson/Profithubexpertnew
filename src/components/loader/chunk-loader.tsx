import { useEffect, useState } from 'react';
import { Activity, Cpu, Sparkles, Zap } from 'lucide-react';
import './chunk-loader.scss';

interface ChunkLoaderProps {
    message?: string;
    isWelcome?: boolean;
}

export default function ChunkLoader({ message = 'Loading workspace...', isWelcome = false }: ChunkLoaderProps) {
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>(['[SYSTEM] Initializing Legacy Quantum Core v4.8...']);

    useEffect(() => {
        if (!isWelcome) return;

        const terminalMessages = [
            '[SYSTEM] Initializing Legacy Quantum Core v4.8...',
            '[NET] Establishing high-frequency Deriv WebSocket feed...',
            '[AUTH] Validating authorized algorithmic tokens...',
            '[AI] Loading Neural Pattern & Trend Detection Matrix...',
            '[MARKET] Calibrating live multi-synthetic orderbooks...',
            '[SYNC] Synchronizing parity detection nodes...',
            '[READY] Workspace initialized. Welcome to Legacy Trading Hub.',
        ];

        let currentMsgIndex = 0;

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                const next = prev + Math.floor(Math.random() * 12) + 8;

                const expectedIndex = Math.min(
                    Math.floor((next / 100) * terminalMessages.length),
                    terminalMessages.length - 1
                );
                if (expectedIndex > currentMsgIndex) {
                    currentMsgIndex = expectedIndex;
                    setLogs(prevLogs => [...prevLogs, terminalMessages[currentMsgIndex]]);
                }

                return Math.min(next, 100);
            });
        }, 80);

        return () => clearInterval(timer);
    }, [isWelcome]);

    if (!isWelcome) {
        return (
            <div className='lth-compact-loader' role='status' aria-live='polite'>
                <div className='lth-gyro-wrapper'>
                    {/* Outer Orbit Ring */}
                    <div className='lth-orbit lth-orbit-outer'>
                        <div className='lth-orbit-dot' />
                    </div>
                    {/* Mid Gyro Ring */}
                    <div className='lth-orbit lth-orbit-mid'>
                        <div className='lth-orbit-dot' />
                    </div>
                    {/* Inner Rapid Ring */}
                    <div className='lth-orbit lth-orbit-inner' />
                    {/* Quantum Core */}
                    <div className='lth-core-orb'>
                        <Zap size={14} className='lth-core-icon' />
                    </div>
                </div>
                {message && (
                    <div className='lth-loader-telemetry'>
                        <span className='lth-loader-label'>{message}</span>
                        <div className='lth-loader-pulses'>
                            <span className='p-dot' />
                            <span className='p-dot' />
                            <span className='p-dot' />
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className='lth-welcome-loader'>
            {/* Ambient Background Grid & Cyber Atmosphere */}
            <div className='lth-ambient-bg'>
                <div className='lth-cyber-grid' />
                <div className='lth-glow-orb lth-glow-cyan' />
                <div className='lth-glow-orb lth-glow-gold' />
                <div className='lth-blur-mask' />
            </div>

            {/* Glowing Holographic Glass Card */}
            <div className='lth-glass-card'>
                <div className='lth-card-header'>
                    <div className='lth-logo-badge'>
                        <Activity size={22} className='lth-pulse-icon' />
                    </div>
                    <div className='lth-brand-meta'>
                        <h1 className='lth-brand-title'>
                            LEGACY <span className='text-cyan'>TRADING</span> <span className='text-gold'>HUB</span>
                        </h1>
                        <span className='lth-brand-subtitle'>INSTITUTIONAL QUANTUM TRADING NETWORK</span>
                    </div>
                </div>

                {/* Live Diagnostic Terminal Console */}
                <div className='lth-terminal'>
                    <div className='lth-terminal-header'>
                        <div className='terminal-dots'>
                            <span className='dot red' />
                            <span className='dot yellow' />
                            <span className='dot green' />
                        </div>
                        <span className='terminal-tag'>
                            <Cpu size={12} style={{ display: 'inline', marginRight: 4 }} />
                            legacy_kernel_v4.8
                        </span>
                    </div>
                    <div className='lth-terminal-body'>
                        {logs.map((log, index) => (
                            <div key={index} className='lth-log-row'>
                                <span className='lth-log-time'>
                                    {new Date().toISOString().split('T')[1].substring(0, 12)}
                                </span>
                                <span className='lth-log-msg'>{log}</span>
                            </div>
                        ))}
                        {progress < 100 && (
                            <div className='lth-log-row typing'>
                                <span className='cursor'>_</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Fast Progress Telemetry */}
                <div className='lth-progress-block'>
                    <div className='lth-progress-labels'>
                        <span className='lth-status-pill'>
                            <Sparkles size={12} className='text-gold' /> System Calibrating...
                        </span>
                        <span className='lth-pct-num'>{progress}%</span>
                    </div>
                    <div className='lth-track'>
                        <div className='lth-fill' style={{ width: `${progress}%` }}>
                            <div className='lth-beam' />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
