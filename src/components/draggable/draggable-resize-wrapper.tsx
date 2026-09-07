import React, { useState } from 'react';
import debounce from 'debounce';
import Draggable from './draggable';

type DraggableResizeWrapperProps = {
    boundary: string;
    children: React.ReactNode;
    onClose: () => void;
    enableResizing?: boolean;
    enableDragging?: boolean;
    header?: string | React.ReactNode;
    minHeight?: number;
    minWidth?: number;
    modalHeight?: number;
    modalWidth?: number;
};

const DraggableResizeWrapper: React.FC<DraggableResizeWrapperProps> = ({
    boundary,
    children,
    onClose,
    enableResizing = false,
    enableDragging = true,
    header = '',
    minHeight = 100,
    minWidth = 100,
    modalHeight = 400,
    modalWidth = 400,
}) => {
    const [show, setShow] = useState(false);
    const getInitialBounds = () => {
        const maxW = Math.max(minWidth, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 24);
        const maxH = Math.max(minHeight, (typeof window !== 'undefined' ? window.innerHeight : 800) - 70);
        const width = Math.min(modalWidth, maxW);
        const height = Math.min(modalHeight, maxH);
        const xAxis = Math.max(0, ((typeof window !== 'undefined' ? window.innerWidth : 1000) - width) / 2);
        const yAxis = Math.max(0, ((typeof window !== 'undefined' ? window.innerHeight : 800) - height) / 2);
        return { width, height, xAxis, yAxis };
    };

    const [initialValues, setInitialValues] = React.useState(getInitialBounds());

    const handleResize = debounce(() => {
        setInitialValues(getInitialBounds());
        setShow(true);
    }, 0);

    React.useEffect(() => {
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [handleResize]);

    return (
        <div id='draggable_resize_container'>
            {show && (
                <Draggable
                    boundary={boundary}
                    initialValues={initialValues}
                    minWidth={minWidth}
                    minHeight={minHeight}
                    enableResizing={enableResizing}
                    enableDragging={enableDragging}
                    header={header}
                    onClose={onClose}
                >
                    {children}
                </Draggable>
            )}
        </div>
    );
};

export default DraggableResizeWrapper;
