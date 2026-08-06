import { observer } from 'mobx-react-lite';
import DraggableResizeWrapper from '@/components/draggable/draggable-resize-wrapper';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import IframeWrapper from '@/components/iframe-wrapper';
import './profihub-modal.scss';

const ProfihubModal = observer(() => {
    const { dashboard } = useStore();
    const { is_profihub_modal_visible, setProfihubModalVisibility } = dashboard;

    const modalWidth = typeof window !== 'undefined' ? Math.min(700, window.innerWidth - 20) : 700;
    const modalHeight = typeof window !== 'undefined' ? Math.min(600, window.innerHeight - 40) : 600;

    return (
        <>
            {is_profihub_modal_visible && (
                <DraggableResizeWrapper
                    boundary='.main'
                    header={localize('Profihub Analysis Tool')}
                    onClose={setProfihubModalVisibility}
                    modalWidth={modalWidth}
                    modalHeight={modalHeight}
                    minWidth={320}
                    minHeight={350}
                    enableResizing
                >
                    <div className='profihub-modal-body'>
                        <IframeWrapper
                            src='https://analysisprofithub.vercel.app/'
                            title='Profihub'
                            className='profihub-modal-container'
                        />
                    </div>
                </DraggableResizeWrapper>
            )}
        </>
    );
});

export default ProfihubModal;
