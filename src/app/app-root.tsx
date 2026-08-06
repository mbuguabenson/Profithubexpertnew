import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ErrorBoundary from '@/components/error-component/error-boundary';
import ErrorComponent from '@/components/error-component/error-component';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { getBrandLabel, getBrandWebsiteName } from '@/components/shared/utils/brand/brand';
import './app-root.scss';

const AppContent = lazy(() => import('./app-content'));

const brandLabel = getBrandLabel();
const deploymentName = getBrandWebsiteName();

const AppRootLoader = () => {
    return <ChunkLoader message={`Loading ${brandLabel}...`} />;
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

const statusMessages = [
    'Loading AI Models',
    'Connecting to Deriv APIs',
    'Authenticating Secure Session',
    'Loading Market Scanner',
    'Initializing Trading Engine',
    'Syncing Live Markets',
    'Preparing Smart Signals',
    'Optimizing Performance',
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

    useEffect(() => {
        if (!isComplete) return;
        const exitTimer = window.setTimeout(() => {
            setExiting(true);
            window.setTimeout(onFinished, 800);
        }, 120);
        return () => window.clearTimeout(exitTimer);
    }, [isComplete, onFinished]);

    return (
        <div className={`welcome-screen ${exiting ? 'welcome-screen--exit' : 'welcome-screen--visible'}`}>
            <div
                className='welcome-screen__background'
                style={{ backgroundImage: "url('/assets/images/welcome-bg.jpg')" }}
            />
            <div className='welcome-screen__overlay' />
            <div className='welcome-screen__vignette' />
            <div className='welcome-screen__grid' aria-hidden='true' />
            <div className='welcome-screen__particles' aria-hidden='true'>
                {Array.from({ length: 24 }).map((_, index) => (
                    <span
                        key={index}
                        className='ws-particle'
                        style={{
                            left: `${(index * 4.2 + 3) % 100}%`,
                            top: `${(index * 7.1 + 5) % 100}%`,
                            width: `${(index % 4) + 3}px`,
                            height: `${(index % 4) + 3}px`,
                            animationDuration: `${16 + (index % 10)}s`,
                            animationDelay: `${(index * 0.4) % 8}s`,
                        }}
                    />
                ))}
            </div>

            <div className='welcome-screen__content'>
                <div className='ws-orb-shell'>
                    <div className='ws-ring ws-ring--outer' />
                    <div className='ws-ring ws-ring--mid' />
                    <div className='ws-ring ws-ring--inner' />
                    <div className='ws-logo-core'>
                        <img
                            src='/logo_light.png'
                            alt={brandLabel}
                            style={{ width: '44px', height: 'auto', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 0 14px rgba(255,255,255,0.5))' }}
                        />
                    </div>
                </div>

                <div className='ws-hero'>
                    <div className='ws-hero__label'>AI-Powered Trading Platform</div>
                    <h1 className='ws-hero__title'>Welcome to <span className='ws-hero__brand'>{brandLabel}</span></h1>
                    <p className='ws-hero__subtitle'>Secure automated trading on {deploymentName}</p>
                </div>

                <div className='ws-badges'>
                    <span className='ws-badge'>⚡ Lightning Fast</span>
                    <span className='ws-badge'>🔒 Bank-Grade Security</span>
                    <span className='ws-badge'>🤖 AI-Driven</span>
                </div>

                <div className='ws-loading-copy'>
                    <div className='ws-loading-text'>{loadingText}</div>
                    <div className='ws-status' role='status' aria-live='polite'>{statusMessage}</div>
                </div>

                <div className='ws-progress'>
                    <div className='ws-progress__track'>
                        <div className='ws-progress__fill' style={{ width: `${progress}%` }}>
                            <span className='ws-progress__shimmer' />
                        </div>
                    </div>
                    <div className='ws-progress__label'>{Math.round(progress)}%</div>
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
    const [showWelcome, setShowWelcome] = useState(true);
    const [backgroundLoaded, setBackgroundLoaded] = useState(false);
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
        const image = new Image();
        image.src = '/assets/images/welcome-bg.jpg';
        image.onload = () => {
            setBackgroundLoaded(true);
            targetProgressRef.current = 12;
        };
        image.onerror = () => {
            console.warn('Welcome background image failed to load, continuing without it.');
            setBackgroundLoaded(true);
        };
    }, []);

    useEffect(() => {
        statusIntervalRef.current = window.setInterval(() => {
            setStatusIndex(prev => (prev + 1) % statusMessages.length);
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
        const step = () => {
            const current = progressRef.current;
            const target = targetProgressRef.current;
            const increment = isReducedMotion ? 0.16 : Math.max(0.06, (target - current) * 0.04);
            const next = Math.min(100, current + increment);
            progressRef.current = next;
            setProgress(next);
            if (next < 100) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }, [isReducedMotion]);

    useEffect(() => {
        if (!backgroundLoaded) return;
        targetProgressRef.current = 36;
    }, [backgroundLoaded]);

    useEffect(() => {
        if (is_api_initialized) {
            targetProgressRef.current = 100;
        } else if (backgroundLoaded) {
            targetProgressRef.current = 78;
        }
    }, [is_api_initialized, backgroundLoaded]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            if (!api_base_initialized.current) {
                console.warn('API initialization timeout reached; proceeding to app content.');
                setIsApiInitialized(true);
            }
        }, 5000);

        const initializeApi = async () => {
            if (api_base_initialization_started.current) return;
            api_base_initialization_started.current = true;
            try {
                await api_base.init();
                api_base_initialized.current = true;
            } catch (error) {
                console.error('API initialization failed:', error);
                api_base_initialized.current = false;
            } finally {
                setIsApiInitialized(true);
                window.clearTimeout(timeoutId);
            }
        };
        initializeApi();
        return () => window.clearTimeout(timeoutId);
    }, []);

    useEffect(() => {
        welcomeTimeoutRef.current = window.setTimeout(() => {
            setWelcomeForceExit(true);
        }, 12000);

        welcomeHardExitRef.current = window.setTimeout(() => {
            console.warn('Forced welcome exit after hard timeout.');
            setShowWelcome(false);
        }, 15000);

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
    const statusMessage = statusMessages[statusIndex];
    const welcomeComplete = (is_api_initialized && progress >= 99 && backgroundLoaded) || welcomeForceExit;

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
