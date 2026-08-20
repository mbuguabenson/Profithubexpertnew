import React, { useEffect, useState } from 'react';
import { Lock, Wifi, CheckCircle2 } from 'lucide-react';
import './chunk-loader.scss';

interface ChunkLoaderProps {
    message?: string;
    isWelcome?: boolean;
}

export default function ChunkLoader({ message, isWelcome = false }: ChunkLoaderProps) {
    const [progress, setProgress] = useState(25);
    const [statusText, setStatusText] = useState(message || 'Initializing Deriv Bot account...');

    useEffect(() => {
        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                const next = prev + Math.floor(Math.random() * 20) + 12;
                if (next > 45 && next < 75) setStatusText('Analyzing live market ticks & algorithmic signals...');
                if (next >= 75) setStatusText('Connecting WebSocket streaming data feed...');
                return Math.min(next, 100);
            });
        }, 220);

        return () => clearInterval(timer);
    }, []);

    return (
        <div className='hub-360-loading-overlay'>
            {/* Ambient Radial Orbs */}
            <div className='ambient-orb ambient-orb--cyan' />
            <div className='ambient-orb ambient-orb--amber' />
            <div className='ambient-orb ambient-orb--emerald' />

            <div className='hub-360-container'>
                {/* Central 360 Radial Radar */}
                <div className='hub-360-radar-wrap'>
                    <div className='radar-ring-outer' />
                    <div className='radar-ring-spin' />
                    <div className='radar-dot radar-dot--amber' />
                    <div className='radar-dot radar-dot--cyan' />
                    <div className='radar-dot radar-dot--white' />
                    <div className='hub-360-center-badge'>
                        <span className='num-360'>360</span>
                    </div>
                </div>

                {/* Title & Subtitle */}
                <div className='hub-360-text-group'>
                    <span className='powered-by-tag'>POWERED BY DERIV</span>
                    <h2 className='hub-360-title'>360 Trading Hub</h2>
                    <p className='hub-360-sub'>{statusText}</p>
                </div>

                {/* Status Pills */}
                <div className='hub-360-pills-row'>
                    <div className='hub-pill'>
                        <Lock size={12} className='pill-icon text-cyan' />
                        <span>Encrypted</span>
                    </div>
                    <div className='hub-pill'>
                        <Wifi size={12} className='pill-icon text-emerald' />
                        <span>Connected</span>
                    </div>
                    <div className='hub-pill'>
                        <CheckCircle2 size={12} className='pill-icon text-purple' />
                        <span>Market Ready</span>
                    </div>
                </div>

                {/* Progress Bar & Deriv Branding */}
                <div className='hub-360-progress-container'>
                    <div className='progress-track'>
                        <div className='progress-fill' style={{ width: `${progress}%` }} />
                    </div>
                    <div className='deriv-badge-row'>
                        <div className='deriv-d-logo'>d</div>
                        <span className='deriv-brand-text'>Deriv</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
