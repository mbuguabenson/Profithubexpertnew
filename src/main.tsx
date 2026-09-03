import { configure } from 'mobx';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
// Removed AnalyticsInitializer import - analytics dependency removed
// See migrate-docs/ANALYTICS_IMPLEMENTATION_GUIDE.md for re-implementation
import { performVersionCheck } from './utils/version-check';
import './styles/index.scss';

// Configure MobX to handle multiple instances in production builds
configure({ isolateGlobalState: true });

// Perform version check FIRST - before any other operations
performVersionCheck();

// Global chunk-load failure handler: reload the page to recover from
// stale/cached index.html referencing missing chunks (pragmatic fallback).
window.addEventListener('error', (e: any) => {
    const msg = e?.message || '';
    if (/Loading chunk \d+ failed/.test(msg) || /Loading CSS chunk \d+ failed/.test(msg)) {
        console.warn('Chunk load failure detected, reloading to recover.');
        window.location.reload();
    }
});

window.addEventListener('unhandledrejection', (ev: any) => {
    const reason = ev?.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message;
    if (msg && /Loading chunk \d+ failed/.test(msg)) {
        console.warn('Chunk import rejection detected, reloading to recover.');
        window.location.reload();
    }
});

// Render the app directly; startup splash is handled inside AppRoot
ReactDOM.createRoot(document.getElementById('root')!).render(<AuthWrapper />);
