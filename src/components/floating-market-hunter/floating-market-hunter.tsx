import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import DraggableResizeWrapper from '@/components/draggable/draggable-resize-wrapper';
import { Orbit } from 'lucide-react';
import './floating-market-hunter.scss';

const MarketHunterPro = lazy(() => import('../../pages/market-hunter-pro'));

// ─── Draggable hook for FAB ──────────────────────────────────────────────────
function useDraggable(initialPos: { x: number; y: number }) {
    const [pos, setPos] = useState(initialPos);
    const dragging = useRef(false);
    const offset = useRef({ x: 0, y: 0 });
    const ref = useRef<HTMLDivElement>(null);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        dragging.current = true;
        offset.current = {
            x: e.clientX - pos.x,
            y: e.clientY - pos.y,
        };
        e.preventDefault();
    }, [pos]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const newX = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - offset.current.x));
            const newY = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - offset.current.y));
            setPos({ x: newX, y: newY });
        };
        const onUp = () => { dragging.current = false; };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    return { pos, ref, onMouseDown };
}

// ─── Main Component ───────────────────────────────────────────────────────────
const FloatingMarketHunter = () => {
    const [isOpen, setIsOpen] = useState(false);

    // FAB button position
    const fab = useDraggable({ x: window.innerWidth - 80, y: window.innerHeight - 160 });

    const handleFabClick = useCallback((e: React.MouseEvent) => {
        // Only toggle if not dragging
        const dx = Math.abs(e.clientX - (fab.pos.x + 28));
        const dy = Math.abs(e.clientY - (fab.pos.y + 28));
        if (dx < 10 && dy < 10) {
            setIsOpen(prev => !prev);
        }
    }, [fab.pos]);

    const handleClosePanel = useCallback(() => {
        setIsOpen(false);
    }, []);

    return (
        <>
            {/* ── Floating AI Sphere Button ──────────────────────────────────── */}
            <div
                ref={fab.ref}
                className={`fmh-fab${isOpen ? ' fmh-fab--active' : ''}`}
                style={{ left: fab.pos.x, top: fab.pos.y }}
                onMouseDown={fab.onMouseDown}
                onClick={handleFabClick}
                title='Market Hunter Pro'
                role='button'
                aria-label='Open AI Scanner'
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(p => !p); }}
            >
                <div className='fmh-fab__ai-gloss'>
                    <span className='fmh-fab__ai-text'>AI</span>
                </div>
                <span className='fmh-fab__pulse' />
            </div>

            {/* ── Floating Draggable Resize Modal Card ──────────────────────── */}
            {isOpen && (
                <DraggableResizeWrapper
                    boundary='.main'
                    header='AI Scanner'
                    onClose={handleClosePanel}
                    modalWidth={526}
                    modalHeight={595}
                    minWidth={526}
                    minHeight={524}
                    enableResizing={true}
                >
                    <div className='fmh-dialog-body'>
                        <Suspense fallback={
                            <div className='fmh-dialog-loading'>
                                <Orbit size={32} strokeWidth={1} className='fmh-dialog-loading-icon' />
                                <span>Loading AI Scanner...</span>
                            </div>
                        }>
                            <MarketHunterPro />
                        </Suspense>
                    </div>
                </DraggableResizeWrapper>
            )}
        </>
    );
};

export default FloatingMarketHunter;

