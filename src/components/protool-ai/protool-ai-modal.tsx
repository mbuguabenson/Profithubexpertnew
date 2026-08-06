import React, { Component, type ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import DraggableResizeWrapper from '@/components/draggable/draggable-resize-wrapper';
import MobileFullPageModal from '@/components/shared_ui/mobile-full-page-modal';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import AutoTrades from '@/pages/auto-trades/auto-trades';
import './protool-ai-modal.scss';

// ── Error boundary ──────────────────────────────────────────────────────────
type EBState = { hasError: boolean; message: string };

class ProToolErrorBoundary extends Component<{ children: ReactNode }, EBState> {
    state: EBState = { hasError: false, message: '' };

    static getDerivedStateFromError(error: Error): EBState {
        return { hasError: true, message: error?.message ?? 'Unknown error' };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ProTool AI] Render error:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className='protool-ai-modal-error'>
                    <span className='protool-ai-modal-error__icon'>⚠️</span>
                    <p className='protool-ai-modal-error__title'>
                        {localize('ProTool AI failed to load')}
                    </p>
                    <p className='protool-ai-modal-error__desc'>
                        {this.state.message
                            ? this.state.message
                            : localize('Please close and reopen the panel, or refresh the page.')}
                    </p>
                    <button
                        className='protool-ai-modal-error__retry'
                        onClick={() => this.setState({ hasError: false, message: '' })}
                    >
                        {localize('Retry')}
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ── Modal component ─────────────────────────────────────────────────────────
const ProToolAiModal = observer(() => {
    const { dashboard } = useStore();
    const { is_protool_ai_modal_visible, setProToolAiModalVisibility } = dashboard;
    const { isDesktop } = useDevice();

    const handleClose = () => {
        setProToolAiModalVisibility(false);
    };

    if (!is_protool_ai_modal_visible) return null;

    const ModalBody = () => (
        <div className='protool-ai-modal-body'>
            <ProToolErrorBoundary>
                <React.Suspense
                    fallback={
                        <div className='protool-ai-modal-loading'>
                            {localize('Loading Automation AI...')}
                        </div>
                    }
                >
                    <AutoTrades isModal={true} />
                </React.Suspense>
            </ProToolErrorBoundary>
        </div>
    );

    if (!isDesktop) {
        return (
            <MobileFullPageModal
                is_modal_open={is_protool_ai_modal_visible}
                header={localize('ProTool AI')}
                onClickClose={handleClose}
                height_offset='80px'
            >
                <ModalBody />
            </MobileFullPageModal>
        );
    }

    return (
        <DraggableResizeWrapper
            boundary='.main'
            header={localize('ProTool AI - Automation & Analytics')}
            onClose={handleClose}
            modalWidth={900}
            modalHeight={650}
            minWidth={600}
            minHeight={450}
            enableResizing
        >
            <ModalBody />
        </DraggableResizeWrapper>
    );
});

export default ProToolAiModal;
