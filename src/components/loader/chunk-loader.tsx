import React, { useEffect, useState } from 'react';
import { getBrandLabel } from '@/components/shared/utils/brand/brand';
import './chunk-loader.scss';

interface ChunkLoaderProps {
    message?: string;
    isWelcome?: boolean;
}

const INITIALIZATION_STEPS = [
    { title: 'Connecting to Deriv WebSocket', desc: 'Establishing ultra-low latency streaming pipe...' },
    { title: 'Loading Trading Engine', desc: 'Syncing 13+ automated bot strategies...' },
    { title: 'Calibrating AI Scanner', desc: 'Arming real-time tick analysis & pattern models...' },
    { title: 'Activating Risk Guard', desc: 'Configuring bulk trades & virtual risk filters...' },
    { title: 'Finalizing Terminal', desc: 'Launching ProfitHub Expert trading workspace...' },
];

export default function ChunkLoader({ message, isWelcome = false }: ChunkLoaderProps) {
    const brandName = getBrandLabel() || 'ProfitHub';
    const [progress, setProgress] = useState(18);
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        if (!isWelcome) return;

        // Smooth progress progression
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 95) return 95;
                const increment = Math.max(1, Math.floor((95 - prev) / 6));
                return Math.min(95, prev + increment);
            });
        }, 320);

        // Sequence step switcher
        const stepInterval = setInterval(() => {
            setStepIndex(prev => (prev + 1) % INITIALIZATION_STEPS.length);
        }, 1800);

        return () => {
            clearInterval(progressInterval);
            clearInterval(stepInterval);
        };
    }, [isWelcome]);

    if (!isWelcome) {
        return (
            <div className='chunk-loader-overlay clean'>
                <div className='compact-loader-card'>
                    <div className='compact-orbital-spinner'>
                        <div className='orbit-ring orbit-ring--outer' />
                        <div className='orbit-ring orbit-ring--inner' />
                        <div className='orbit-core' />
                    </div>
                    {message && (
                        <div className='compact-loader-text'>
                            <span className='compact-loader-msg'>{message}</span>
                            <span className='compact-loader-dots'>
                                <span />
                                <span />
                                <span />
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const currentStep = INITIALIZATION_STEPS[stepIndex];

    return (
        <div className='welcome-loader-screen'>
            {/* Background Ambient Glow Orbs */}
            <div className='ambient-glow ambient-glow--cyan' />
            <div className='ambient-glow ambient-glow--indigo' />
            <div className='ambient-glow ambient-glow--gold' />
            <div className='welcome-grid-overlay' />

            <div className='welcome-loader-container'>
                {/* Top Badge */}
                <div className='welcome-status-badge'>
                    <span className='status-dot' />
                    <span className='status-text'>SYSTEM INITIALIZING</span>
                </div>

                {/* Central Futuristic Brand Core */}
                <div className='brand-core-wrapper'>
                    <div className='orbital-ring orbital-ring--1' />
                    <div className='orbital-ring orbital-ring--2' />
                    <div className='orbital-ring orbital-ring--3' />
                    <div className='brand-emblem'>
                        <img
                            src='/logo.png'
                            alt={brandName}
                            className='brand-logo-img'
                            onError={e => {
                                // Fallback to SVG logo if image fails
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.parentElement?.querySelector('.brand-logo-fallback') as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                            }}
                        />
                        <div className='brand-logo-fallback' style={{ display: 'none' }}>
                            <svg width='36' height='36' viewBox='0 0 24 24' fill='none'>
                                <path
                                    d='M13 2L3 14h9l-1 8 10-12h-9l1-8z'
                                    fill='url(#ph_grad_loader)'
                                    stroke='#38bdf8'
                                    strokeWidth='1.5'
                                    strokeLinejoin='round'
                                />
                                <defs>
                                    <linearGradient id='ph_grad_loader' x1='0%' y1='0%' x2='100%' y2='100%'>
                                        <stop offset='0%' stopColor='#38bdf8' />
                                        <stop offset='100%' stopColor='#6366f1' />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Title and Tagline */}
                <div className='welcome-title-group'>
                    <h1 className='welcome-brand-name'>
                        {brandName} <span className='highlight-pro'>EXPERT</span>
                    </h1>
                    <p className='welcome-tagline'>
                        Institutional-Grade Algorithmic & AI Quantitative Trading Suite
                    </p>
                </div>

                {/* Dynamic Stepped Progress Section */}
                <div className='welcome-progress-card'>
                    <div className='progress-header'>
                        <div className='step-info'>
                            <span className='step-title'>{currentStep.title}</span>
                            <span className='step-desc'>{currentStep.desc}</span>
                        </div>
                        <div className='progress-percentage'>{progress}%</div>
                    </div>

                    <div className='progress-track'>
                        <div className='progress-bar-fill' style={{ width: `${progress}%` }}>
                            <div className='progress-shimmer' />
                        </div>
                    </div>

                    {message && (
                        <div className='progress-custom-msg'>
                            <span className='pulse-icon'>⚡</span> {message}
                        </div>
                    )}
                </div>

                {/* Feature Highlight Pills */}
                <div className='welcome-feature-dock'>
                    <div className='feature-pill'>
                        <span className='pill-icon'>🤖</span>
                        <span>13+ Trading Bots</span>
                    </div>
                    <div className='feature-pill'>
                        <span className='pill-icon'>📦</span>
                        <span>Bulk Multi-Runs</span>
                    </div>
                    <div className='feature-pill'>
                        <span className='pill-icon'>⚡</span>
                        <span>AI Market Scanner</span>
                    </div>
                    <div className='feature-pill'>
                        <span className='pill-icon'>🛡️</span>
                        <span>Virtual Risk Guard</span>
                    </div>
                </div>

                {/* Bottom Watermark */}
                <div className='welcome-footer-info'>
                    <span>v3.2.0 Pro Edition</span>
                    <span className='footer-separator'>•</span>
                    <span>Direct Deriv Engine Pipeline</span>
                </div>
            </div>
        </div>
    );
}
