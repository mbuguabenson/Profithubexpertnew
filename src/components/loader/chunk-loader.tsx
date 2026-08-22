import { useEffect, useState } from 'react';
import { ShieldCheck, Zap, Activity } from 'lucide-react';
import './chunk-loader.scss';

interface ChunkLoaderProps {
    message?: string;
    isWelcome?: boolean;
}

export default function ChunkLoader({ message = 'Loading workspace...', isWelcome = false }: ChunkLoaderProps) {
    const [logs, setLogs] = useState<string[]>(['[SYSTEM] Boot sequence initiated...']);

    useEffect(() => {
        if (!isWelcome) return;

        const terminalMessages = [
            '[SYSTEM] Boot sequence initiated...',
            '[NET] Establishing secure connection to Deriv WebSocket...',
            '[AUTH] Validating quantum tokens...',
            '[CORE] Loading Neural Prediction Models...',
            '[MARKET] Fetching real-time liquidity streams...',
            '[AI] Synchronizing Deep Learning nodes...',
            '[INIT] System ready. Welcome to Profit Hub Expert.'
        ];

        let currentMsgIndex = 0;

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                const next = prev + Math.floor(Math.random() * 8) + 4;
                
                // Add logs based on progress thresholds
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
            <div className='ultimate-compact-loader'>
                <div className='ucl-spinner'>
                    <div className='ucl-ring ucl-ring-1' />
                    <div className='ucl-ring ucl-ring-2' />
                    <div className='ucl-core' />
                </div>
                {message && (
                    <div className='ucl-text'>
                        <span>{message}</span>
                        <span className='ucl-dots'>...</span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className='fx-welcome-loader'>
            {/* CSS-based Blurred FX Chart Background */}
            <div className='fx-background'>
                <div className='fx-grid' />
                <div className='fx-candlesticks' />
                <div className='fx-glow fx-glow-1' />
                <div className='fx-glow fx-glow-2' />
                <div className='fx-blur-overlay' />
            </div>

            {/* Smart Glowing Glass Card */}
            <div className='fx-glass-card'>
                <div className='fx-card-header'>
                    <div className='fx-logo-orb'>
                        <Activity size={24} className='icon-pulse' />
                    </div>
                    <div className='fx-brand'>
                        <h1 className='fx-title'>Profithub Expert</h1>
                        <span className='fx-subtitle'>QUANTUM TRADING ENGINE</span>
                    </div>
                </div>

                {/* Terminal Log Console */}
                <div className='fx-terminal'>
                    <div className='fx-terminal-header'>
                        <span className='dot red' />
                        <span className='dot yellow' />
                        <span className='dot green' />
                        <span className='terminal-title'>system_boot.exe</span>
                    </div>
                    <div className='fx-terminal-body'>
                        {logs.map((log, index) => (
                            <div key={index} className='fx-log-line'>
                                <span className='log-timestamp'>{new Date().toISOString().split('T')[1].substring(0, 12)}</span>
                                <span className='log-text'>{log}</span>
                            </div>
                        ))}
                        {progress < 100 && (
                            <div className='fx-log-line typing'>
                                <span className='cursor'>_</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Progress Tracking */}
                <div className='fx-progress-container'>
                    <div className='fx-progress-meta'>
                        <span className='status-text'>System Initializing...</span>
                        <span className='status-pct'>{progress}%</span>
                    </div>
                    <div className='fx-progress-track'>
                        <div className='fx-progress-fill' style={{ width: `${progress}%` }}>
                            <div className='fx-progress-glow' />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
