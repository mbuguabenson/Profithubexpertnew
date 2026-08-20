import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ErrorBoundary from '@/components/error-component/error-boundary';
// import ErrorComponent from '@/components/error-component/error-component';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { sanitizeAccountsList } from '@/utils/token-bridge';
import { getBrandLabel, getBrandWebsiteName } from '@/components/shared/utils/brand/brand';
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '90%', textAlign: 'center', color: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#f8fafc' }}>
                    {common.error?.header || 'Notice'}
                </h3>
                <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px', lineHeight: '1.5' }}>
                    {common.error?.message || 'A temporary connection update occurred.'}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                        onClick={handleClearError}
                        style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                    >
                        Continue to Trading
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        style={{ padding: '10px 20px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                    >
                        Refresh Page
                    </button>
                </div>
            </div>
        </div>
    );
});

const INIT_STEPS = [
    'Connecting to Deriv WebSocket',
    'Loading AI Trading Models',
    'Authenticating Secure Session',
    'Calibrating Market Scanner',
    'Initializing Trading Engine',
    'Syncing Live Markets',
    'Preparing Smart Signals',
    'Finalizing Workspace',
];

const WelcomeScreen = ({
    onFinished,
    isComplete,
    progress,
    statusMessage,
    loadingText,
}: {
    onFinished: () => void;
    isComplete: boolean;
    progress: number;
    statusMessage: string;
    loadingText: string;
}) => {
    const [exiting, setExiting] = useState(false);
    const [activeStep, setActiveStep] = useState(0);

    useEffect(() => {
        const stepTimer = window.setInterval(() => {
            setActiveStep(prev => (prev + 1) % INIT_STEPS.length);
        }, 1500);
        return () => window.clearInterval(stepTimer);
    }, []);

    useEffect(() => {
        if (!isComplete) return;
        const exitTimer = window.setTimeout(() => {
            setExiting(true);
            window.setTimeout(onFinished, 900);
        }, 120);
        return () => window.clearTimeout(exitTimer);
    }, [isComplete, onFinished]);

    return (
        <div className={`welcome-screen ${exiting ? 'welcome-screen--exit' : 'welcome-screen--visible'}`}>
            {/* Ambient neumorphism glow orbs */}
            <div className='welcome-screen__glow welcome-screen__glow--blue' />
            <div className='welcome-screen__glow welcome-screen__glow--green' />
            <div className='welcome-screen__glow welcome-screen__glow--gold' />

            {/* Floating particles */}
            <div className='welcome-screen__particles' aria-hidden='true'>
                {Array.from({ length: 18 }).map((_, i) => (
                    <span
                        key={i}
                        className='ws-particle'
                        style={{
                            left: `${(i * 5.5 + 4) % 100}%`,
                            top: `${(i * 8.3 + 6) % 100}%`,
                            width: `${(i % 3) + 3}px`,
                            height: `${(i % 3) + 3}px`,
                            animationDuration: `${14 + (i % 9)}s`,
                            animationDelay: `${(i * 0.5) % 7}s`,
                        }}
                    />
                ))}
            </div>

            {/* ✦ Main neumorphism card */}
            <div className='welcome-screen__content'>

                {/* Status badge */}
                <div className='ws-status-badge'>
                    <span className='ws-status-dot' />
                    <span className='ws-status-label'>SYSTEM INITIALIZING</span>
                </div>

                {/* Neumorphism orbital logo */}
                <div className='ws-orb-shell'>
                    <div className='ws-ring ws-ring--outer' />
                    <div className='ws-ring ws-ring--mid' />
                    <div className='ws-ring ws-ring--inner' />
                    <div className='ws-logo-core'>
                        <img
                            src='/logo_icon.svg'
                            alt={brandLabel}
                            style={{
                                width: '34px',
                                height: '34px',
                                objectFit: 'contain',
                                display: 'block',
                                filter: 'drop-shadow(0 0 10px rgba(79, 142, 247, 0.7))',
                            }}
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                        />
                    </div>
                </div>

                {/* Hero text — inset neumorphism panel */}
                <div className='ws-hero'>
                    <div className='ws-hero__label'>AI-Powered Trading Platform</div>
                    <h1 className='ws-hero__title'>
                        Welcome to <span className='ws-hero__brand'>{brandLabel}</span>
                    </h1>
                    <p className='ws-hero__subtitle'>Secure automated trading on {deploymentName}</p>
                </div>

                {/* Feature pills */}
                <div className='ws-badges'>
                    <span className='ws-badge'>⚡ Lightning Fast</span>
                    <span className='ws-badge'>🔒 Bank-Grade Security</span>
                    <span className='ws-badge'>🤖 AI-Driven</span>
                </div>

                {/* Step dots */}
                <div className='ws-step-dots' aria-hidden='true'>
                    {INIT_STEPS.map((_, i) => (
                        <span
                            key={i}
                            className={`ws-step-dot${i === activeStep ? ' ws-step-dot--active' : ''}`}
                        />
                    ))}
                </div>

                {/* Loading status */}
                <div className='ws-loading-copy'>
                    <div className='ws-loading-text'>{loadingText}</div>
                    <div className='ws-status' role='status' aria-live='polite'>{statusMessage}</div>
                </div>

                {/* Progress bar — inset neumorphism track */}
                <div className='ws-progress'>
                    <div className='ws-progress__track'>
                        <div className='ws-progress__fill' style={{ width: `${progress}%` }}>
                            <span className='ws-progress__shimmer' />
                        </div>
                    </div>
                    <div className='ws-progress__meta'>
                        <span className='ws-progress__label'>{Math.round(progress)}%</span>
                        <span className='ws-progress__step'>{INIT_STEPS[activeStep]}</span>
                    </div>
                </div>

                {/* Footer strip */}
                <div className='ws-footer'>
                    <span>v3.2.0 Pro</span>
                    <span className='ws-footer__sep'>•</span>
                    <span>Deriv Engine Pipeline</span>
                    <span className='ws-footer__sep'>•</span>
                    <span>Secure • Fast • Intelligent</span>
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

    // Proactively refresh OAuth token before expiry to prevent silent logouts
    useTokenRefresh();
    const [showWelcome, setShowWelcome] = useState(true);
    const [progress, setProgress] = useState(0);
    const [statusIndex, setStatusIndex] = useState(0);
    const [dotPhase, setDotPhase] = useState(0);
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
        }, 2000);
        return () => {
            if (statusIntervalRef.current) {
                window.clearInterval(statusIntervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const dotTimer = window.setInterval(() => {
            setDotPhase(prev => (prev + 1) % 4);
        }, 500);
        return () => window.clearInterval(dotTimer);
    }, []);

    useEffect(() => {
        let animationFrameId: number;
        const step = () => {
            const current = progressRef.current;
            const target = targetProgressRef.current;
            const increment = isReducedMotion ? 1.5 : Math.max(0.75, (target - current) * 0.12);
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
            targetProgressRef.current = 60;
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
                // Clean up any invalid bearer tokens left in localStorage from older flows
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
        }, 2500);

        welcomeHardExitRef.current = window.setTimeout(() => {
            console.warn('Forced welcome exit after hard timeout.');
            setShowWelcome(false);
        }, 3500);

        return () => {
            if (welcomeTimeoutRef.current) {
                window.clearTimeout(welcomeTimeoutRef.current);
            }
            if (welcomeHardExitRef.current) {
                window.clearTimeout(welcomeHardExitRef.current);
            }
        };
    }, []);

    const loadingText = `Initializing AI Trading Engine${'.'.repeat(dotPhase)}`;
    const statusMessage = INIT_STEPS[statusIndex % INIT_STEPS.length];
    const welcomeComplete = (is_api_initialized && progress >= 95) || welcomeForceExit;

    if (showWelcome) {
        return (
            <WelcomeScreen
                onFinished={() => setShowWelcome(false)}
                isComplete={welcomeComplete}
                progress={progress}
                statusMessage={statusMessage}
                loadingText={loadingText}
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
