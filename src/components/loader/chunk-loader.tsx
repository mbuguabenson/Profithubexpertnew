import { useEffect, useState } from 'react';
import { ShieldCheck, Zap, Activity } from 'lucide-react';
import './chunk-loader.scss';

interface ChunkLoaderProps {
    message?: string;
    isWelcome?: boolean;
}

export default function ChunkLoader({ message = 'Loading workspace...', isWelcome = false }: ChunkLoaderProps) {
    const [progress, setProgress] = useState(25);
    const [statusText, setStatusText] = useState(message);

    useEffect(() => {
        if (!isWelcome) return;

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                const next = prev + Math.floor(Math.random() * 15) + 8;
                if (next > 45 && next < 75) setStatusText('Initializing Neural Network...');
                if (next >= 75) setStatusText('Establishing Secure Data Feed...');
                return Math.min(next, 100);
            });
        }, 150);

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
        <div className='ultimate-welcome-loader'>
            {/* Ambient Background Lights */}
            <div className='uwl-ambient uwl-ambient--1' />
            <div className='uwl-ambient uwl-ambient--2' />

            <div className='uwl-container'>
                {/* Central Cybernetic Core */}
                <div className='uwl-core-wrapper'>
                    <div className='uwl-hex-grid' />
                    <div className='uwl-spin-ring uwl-spin-ring--outer' />
                    <div className='uwl-spin-ring uwl-spin-ring--inner' />
                    <div className='uwl-pulse-core' />
                    <div className='uwl-center-logo'>
                        <span>PRO</span>
                    </div>
                </div>

                {/* Typography */}
                <div className='uwl-text-group'>
                    <span className='uwl-eyebrow'>QUANTUM ENGINE</span>
                    <h1 className='uwl-title'>Profit Hub</h1>
                    <p className='uwl-subtitle'>{statusText}</p>
                </div>

                {/* Status Indicators */}
                <div className='uwl-status-row'>
                    <div className='uwl-status-badge'>
                        <ShieldCheck size={14} className='icon icon-shield' />
                        <span>Secured</span>
                    </div>
                    <div className='uwl-status-badge'>
                        <Zap size={14} className='icon icon-zap' />
                        <span>Connected</span>
                    </div>
                    <div className='uwl-status-badge'>
                        <Activity size={14} className='icon icon-activity' />
                        <span>Live Feed</span>
                    </div>
                </div>

                {/* Precision Progress Bar */}
                <div className='uwl-progress-box'>
                    <div className='uwl-progress-track'>
                        <div className='uwl-progress-fill' style={{ width: `${progress}%` }}>
                            <div className='uwl-progress-glow' />
                        </div>
                    </div>
                    <div className='uwl-progress-meta'>
                        <span className='meta-label'>System Boot</span>
                        <span className='meta-value'>{progress}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
