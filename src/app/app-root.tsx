import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ErrorBoundary from '@/components/error-component/error-boundary';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { sanitizeAccountsList } from '@/utils/token-bridge';
import { getBrandLabel, getBrandWebsiteName } from '@/components/shared/utils/brand/brand';
import {
    Activity,
    CheckCircle2,
    Cpu,
    Lock,
    Radio,
    ShieldCheck,
    Sparkles,
    Zap,
} from 'lucide-react';
import './app-root.scss';

const AppContent = lazy(() => import('./app-content'));

const brandLabel = getBrandLabel();
const deploymentName = getBrandWebsiteName();

const AppRootLoader = () => {
    return <ChunkLoader message={`Loading ${brandLabel}...`} isWelcome={false} />;
};

const ErrorComponentWrapper = observer(() => {
    const { common } = useStore();

    if (!common.error || !common.has_error) return null;

    const handleClearError = () => {
        common.setError(false, {});
    };

    return (
        <div className="error-wrapper-backdrop">
            <div className="error-wrapper-modal">
                <h3 className="error-wrapper-title">
                    {common.error?.header || 'Notice'}
                </h3>
                <p className="error-wrapper-msg">
                    {common.error?.message || 'A temporary connection update occurred.'}
                </p>
                <div className="error-wrapper-actions">
                    <button onClick={handleClearError} className="btn-primary">
                        Continue to Trading
                    </button>
                    <button onClick={() => window.location.reload()} className="btn-secondary">
                        Refresh Page
                    </button>
                </div>
            </div>
        </div>
    );
});

const INIT_STEPS = [
    { label: 'Connecting to Deriv WebSocket Gateway', icon: <Radio size={16} className="text-cyan" /> },
    { label: 'Loading AI Trading & Parity Engines', icon: <Zap size={16} className="text-gold" /> },
    { label: 'Authenticating Secure Client Session', icon: <Lock size={16} className="text-emerald" /> },
    { label: 'Calibrating Multi-Synthetic Market Scanner', icon: <Activity size={16} className="text-purple" /> },
    { label: 'Initializing Neural Execution Pipeline', icon: <Cpu size={16} className="text-blue" /> },
    { label: 'Syncing Real-Time Ticks & Orderbook', icon: <Sparkles size={16} className="text-cyan" /> },
    { label: 'Finalizing Trading Workspace Environment', icon: <ShieldCheck size={16} className="text-emerald" /> },
];

const FRIENDLY_TIPS = [
    '💡 Tip: Set up your Risk Management rules to protect your profit targets automatically.',
    '🚀 Tip: AUTO X E/O continuously scans synthetic indices for the highest probability parity setups.',
    '⚡ Tip: Your connection communicates directly with Deriv WebSockets for sub-10ms latency.',
    '🎯 Tip: Combine Digit & Over/Under strategies with active scanners for optimal entry points.',
    '🛡️ Tip: You can pause automated trading anytime and your active contracts will complete safely.',
    '📊 Tip: Check the Live Digit Wave Stream to observe real-time tick velocity and trends.',
];

const WelcomeScreen = ({
    onFinished,
    isComplete,
    progress,
    statusMessage,
}: {
    onFinished: () => void;
    isComplete: boolean;
    progress: number;
    statusMessage: string;
}) => {
    const [exiting, setExiting] = useState(false);
    const [activeStep, setActiveStep] = useState(0);
    const [tipIndex, setTipIndex] = useState(0);

    // Cycle through initialization steps
    useEffect(() => {
        const stepTimer = window.setInterval(() => {
            setActiveStep(prev => (prev + 1) % INIT_STEPS.length);
        }, 1300);
        return () => window.clearInterval(stepTimer);
    }, []);

    // Cycle friendly trading tips
    useEffect(() => {
        const tipTimer = window.setInterval(() => {
            setTipIndex(prev => (prev + 1) % FRIENDLY_TIPS.length);
        }, 3000);
        return () => window.clearInterval(tipTimer);
    }, []);

    // Handle complete transition
    useEffect(() => {
        if (!isComplete) return;
        const exitTimer = window.setTimeout(() => {
            setExiting(true);
            window.setTimeout(onFinished, 650);
        }, 120);
        return () => window.clearTimeout(exitTimer);
    }, [isComplete, onFinished]);

    const currentStepObj = INIT_STEPS[activeStep] || INIT_STEPS[0];
    const roundedProgress = Math.min(100, Math.round(progress));

    return (
        <div className={`welcome-screen ${exiting ? 'welcome-screen--exit' : 'welcome-screen--visible'}`}>
            {/* Ambient Background Aurora Orbs */}
            <div className="ws-bg-orb ws-bg-orb--gold" />
            <div className="ws-bg-orb ws-bg-orb--cyan" />
            <div className="ws-bg-orb ws-bg-orb--purple" />

            {/* High-Tech Grid Pattern Overlay */}
            <div className="ws-grid-overlay" aria-hidden="true" />

            {/* Main Holographic Glassmorphic Card */}
            <div className="welcome-screen__card">

                {/* Top Status HUD Bar */}
                <div className="ws-hud-bar">
                    <div className="hud-status">
                        <span className="hud-dot" />
                        <span className="hud-text">QUANTUM NODE ACTIVE</span>
                    </div>
                    <div className="hud-version">
                        <Sparkles size={12} className="text-gold" />
                        <span>v3.5 PRO SUITE</span>
                    </div>
                </div>

                {/* Central Holographic Gyro-Core & Brand */}
                <div className="ws-brand-section">
                    <div className="ws-gyro-orb">
                        <div className="gyro-ring gyro-ring--1" />
                        <div className="gyro-ring gyro-ring--2" />
                        <div className="gyro-ring gyro-ring--3" />
                        <div className="gyro-core">
                            <Zap size={32} className="core-icon text-gold" />
                        </div>
                    </div>

                    <div className="ws-title-group">
                        <h1 className="ws-main-heading">
                            Welcome to <span className="ws-brand-gradient">{brandLabel}</span>
                        </h1>
                        <p className="ws-sub-heading">
                            Institutional Algorithmic Trading Platform • {deploymentName}
                        </p>
                    </div>
                </div>

                {/* High-Performance Architecture Badges */}
                <div className="ws-features-grid">
                    <div className="ws-feature-chip">
                        <Zap size={16} className="text-gold" />
                        <div className="chip-text">
                            <span className="chip-title">&lt; 10ms Latency</span>
                            <span className="chip-sub">Direct WS Gateway</span>
                        </div>
                    </div>
                    <div className="ws-feature-chip">
                        <ShieldCheck size={16} className="text-emerald" />
                        <div className="chip-text">
                            <span className="chip-title">Risk Control</span>
                            <span className="chip-sub">Automated Guardrails</span>
                        </div>
                    </div>
                    <div className="ws-feature-chip">
                        <Cpu size={16} className="text-cyan" />
                        <div className="chip-text">
                            <span className="chip-title">Neural Engine</span>
                            <span className="chip-sub">Real-Time Signals</span>
                        </div>
                    </div>
                </div>

                {/* Dynamic Progress Telemetry Section */}
                <div className="ws-progress-section">
                    <div className="ws-progress-header">
                        <div className="ws-step-indicator">
                            <span className="step-icon-wrap">{currentStepObj.icon}</span>
                            <span className="step-label">{statusMessage || currentStepObj.label}</span>
                        </div>
                        <span className="ws-percent-text">{roundedProgress}%</span>
                    </div>

                    <div className="ws-progress-track">
                        <div className="ws-progress-fill" style={{ width: `${roundedProgress}%` }}>
                            <span className="ws-progress-glow-head" />
                        </div>
                    </div>

                    {/* Step Progression Nodes */}
                    <div className="ws-dots-bar">
                        {INIT_STEPS.map((step, idx) => {
                            const isPast = idx < activeStep;
                            const isCurrent = idx === activeStep;
                            return (
                                <div
                                    key={idx}
                                    className={`ws-dot-item ${isCurrent ? 'ws-dot-item--active' : ''} ${isPast ? 'ws-dot-item--done' : ''}`}
                                    title={step.label}
                                >
                                    {isPast && <CheckCircle2 size={8} className="dot-check-icon" />}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Pro Trader Wisdom Tip Box */}
                <div className="ws-tip-box">
                    <span className="ws-tip-content">{FRIENDLY_TIPS[tipIndex]}</span>
                </div>

                {/* Futuristic Protocol Footer */}
                <div className="ws-footer-bar">
                    <span className="footer-item">
                        <span className="dot-green" /> WebSocket Active
                    </span>
                    <span className="dot-sep">•</span>
                    <span className="footer-item">🔒 256-Bit SSL Encrypted</span>
                    <span className="dot-sep">•</span>
                    <span className="footer-item">⚡ Deriv Node Connected</span>
                </div>
            </div>
        </div>
    );
};

const AppRoot = () => {
    const store = useStore();
    const api_base_initialized = useRef(false);
    const api_base_initialization_started = useRef(false);
    const [is_api_initialized, setIsApiInitialized] = useState(false);

    useTokenRefresh();
    const [showWelcome, setShowWelcome] = useState(true);
    const [progress, setProgress] = useState(0);
    const [statusIndex, setStatusIndex] = useState(0);
    const [isReducedMotion, setIsReducedMotion] = useState(false);
    const [welcomeForceExit, setWelcomeForceExit] = useState(false);

    const progressRef = useRef(0);
    const targetProgressRef = useRef(0);
    const statusIntervalRef = useRef<number | null>(null);
    const welcomeTimeoutRef = useRef<number | null>(null);
    const welcomeHardExitRef = useRef<number | null>(null);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setIsReducedMotion(mediaQuery.matches);
        const handleMotionChange = (event: MediaQueryListEvent) => {
            setIsReducedMotion(event.matches);
        };
        mediaQuery.addEventListener('change', handleMotionChange);
        return () => mediaQuery.removeEventListener('change', handleMotionChange);
    }, []);

    useEffect(() => {
        statusIntervalRef.current = window.setInterval(() => {
            setStatusIndex(prev => (prev + 1) % INIT_STEPS.length);
        }, 1600);
        return () => {
            if (statusIntervalRef.current) {
                window.clearInterval(statusIntervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
        let animationFrameId: number;
        const step = () => {
            const current = progressRef.current;
            const target = targetProgressRef.current;
            const increment = isReducedMotion ? 2 : Math.max(0.9, (target - current) * 0.15);
            const next = Math.min(100, current + increment);
            progressRef.current = next;
            setProgress(next);
            if (next < 100) {
                animationFrameId = window.requestAnimationFrame(step);
            }
        };
        animationFrameId = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(animationFrameId);
    }, [isReducedMotion]);

    useEffect(() => {
        if (is_api_initialized) {
            targetProgressRef.current = 100;
        } else {
            targetProgressRef.current = 70;
        }
    }, [is_api_initialized]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            if (!api_base_initialized.current) {
                console.warn('API initialization timeout reached; proceeding to app content.');
                setIsApiInitialized(true);
                targetProgressRef.current = 100;
            }
        }, 2000);

        const initializeApi = async () => {
            if (api_base_initialization_started.current) return;
            api_base_initialization_started.current = true;
            try {
                sanitizeAccountsList();
                await api_base.init();
                api_base_initialized.current = true;
            } catch (error) {
                console.error('API initialization failed:', error);
                api_base_initialized.current = false;
            } finally {
                setIsApiInitialized(true);
                targetProgressRef.current = 100;
                window.clearTimeout(timeoutId);
            }
        };
        initializeApi();
        return () => window.clearTimeout(timeoutId);
    }, []);

    useEffect(() => {
        welcomeTimeoutRef.current = window.setTimeout(() => {
            setWelcomeForceExit(true);
            setShowWelcome(false);
        }, 2600);

        welcomeHardExitRef.current = window.setTimeout(() => {
            setShowWelcome(false);
        }, 3600);

        return () => {
            if (welcomeTimeoutRef.current) {
                window.clearTimeout(welcomeTimeoutRef.current);
            }
            if (welcomeHardExitRef.current) {
                window.clearTimeout(welcomeHardExitRef.current);
            }
        };
    }, []);

    const statusMessage = INIT_STEPS[statusIndex % INIT_STEPS.length]?.label || 'Preparing Workspace';
    const welcomeComplete = (is_api_initialized && progress >= 95) || welcomeForceExit;

    if (showWelcome) {
        return (
            <WelcomeScreen
                onFinished={() => setShowWelcome(false)}
                isComplete={welcomeComplete}
                progress={progress}
                statusMessage={statusMessage}
            />
        );
    }

    if (!store || !is_api_initialized) return <AppRootLoader />;

    return (
        <Suspense fallback={<AppRootLoader />}>
            <ErrorBoundary root_store={store}>
                <ErrorComponentWrapper />
                <AppContent />
            </ErrorBoundary>
        </Suspense>
    );
};

export default AppRoot;
