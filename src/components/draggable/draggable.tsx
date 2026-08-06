import React, { useEffect, useRef, useState } from 'react';
import { LegacyClose1pxIcon } from '@deriv/quill-icons/Legacy';
import {
    calculateHeight,
    calculateWidth,
    calculateZindex,
    DRAGGABLE_CONSTANTS,
    EXTRA_BOTTOM_RIGHT_SAFETY_MARGIN,
    SAFETY_MARGIN,
    TDraggableProps,
} from './draggable-utils';
import './draggable.scss';

const Draggable: React.FC<TDraggableProps> = ({
    children,
    boundary,
    initialValues = {
        width: 400,
        height: 400,
        xAxis: 0,
        yAxis: 0,
    },
    minWidth = 100,
    minHeight = 100,
    enableResizing = false,
    enableDragging = true,
    header = '',
    onClose,
}) => {
    const [position, setPosition] = useState({ x: initialValues.xAxis, y: initialValues.yAxis });
    const [size, setSize] = useState({ width: initialValues.width, height: initialValues.height });
    const [zIndex, setZIndex] = useState(100);
    const [zoomScale, setZoomScale] = useState(1);

    const isResizing = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const draggableRef = useRef<HTMLDivElement>(null);
    const [boundaryRef, setBoundaryRef] = useState(
        document.querySelector(boundary ?? DRAGGABLE_CONSTANTS.BODY_REF) as HTMLElement | null
    );

    useEffect(() => {
        setSize({ width: initialValues.width, height: initialValues.height });
        setPosition({ x: initialValues.xAxis, y: initialValues.yAxis });
    }, [initialValues.height, initialValues.width, initialValues.xAxis, initialValues.yAxis]);

    useEffect(() => {
        const boundaryEl = document.querySelector(boundary ?? DRAGGABLE_CONSTANTS.BODY_REF) as HTMLElement | null;
        setBoundaryRef(boundaryEl);
        calculateZindex({ setZIndex });
    }, [boundary]);

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomScale(prev => Math.min(2.0, Number((prev + 0.15).toFixed(2))));
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomScale(prev => Math.max(0.5, Number((prev - 0.15).toFixed(2))));
    };

    const handleZoomReset = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomScale(1.0);
    };

    const handleMouseDown = (
        event: React.MouseEvent<HTMLElement, MouseEvent> | React.TouchEvent<HTMLElement> | null,
        action: string
    ) => {
        event?.stopPropagation();
        calculateZindex({ setZIndex });
        if (!action) return;
        const resize_direction = action;
        isResizing.current = action !== DRAGGABLE_CONSTANTS.MOVE && enableResizing;
        setIsDragging(action === DRAGGABLE_CONSTANTS.MOVE && enableDragging);

        const boundaryRect = boundaryRef?.getBoundingClientRect();
        const topOffset = boundaryRef?.offsetTop ?? 0;
        const leftOffset = boundaryRef?.offsetLeft ?? 0;

        let initialMouseX = 0;
        let initialMouseY = 0;

        if (event) {
            if ('touches' in event && event.touches.length > 0) {
                initialMouseX = event.touches[0].clientX;
                initialMouseY = event.touches[0].clientY;
            } else if ('clientX' in event) {
                initialMouseX = (event as React.MouseEvent).clientX;
                initialMouseY = (event as React.MouseEvent).clientY;
            }
        }

        const initialWidth = size?.width ?? initialValues.width;
        const initialHeight = size?.height ?? initialValues.height;
        const initialX = position?.x ?? 0;
        const initialY = position?.y ?? 0;
        const initialSelfRight = draggableRef.current?.getBoundingClientRect()?.right ?? size.width;
        const initialSelfBottom = draggableRef.current?.getBoundingClientRect()?.bottom ?? size.height;

        let previousStyle = {};
        const draggableContentBody = draggableRef.current?.querySelector(
            '#draggable-content-body'
        ) as HTMLElement | null;

        if (draggableContentBody) {
            const { style } = draggableContentBody;
            if (style && style.pointerEvents !== 'none') {
                previousStyle = { ...style };
                style.pointerEvents = 'none';
            }
        }

        const handleMouseMove = (e: MouseEvent | TouchEvent) => {
            if (!e) return;
            let clientX = 0;
            let clientY = 0;
            if ('touches' in e && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if ('clientX' in e) {
                clientX = (e as MouseEvent).clientX;
                clientY = (e as MouseEvent).clientY;
            } else {
                return;
            }

            const deltaX = clientX - initialMouseX;
            const deltaY = clientY - initialMouseY;
            try {
                if (isResizing.current) {
                    handleResize(deltaX, deltaY, clientX, clientY);
                } else {
                    handleDrag(deltaX, deltaY);
                }
            } catch (error) {
                handleMouseUp();
            }
        };

        const handleResize = (deltaX: number, deltaY: number, clientX: number, clientY: number) => {
            let newX = position?.x ?? 0;
            let newY = position?.y ?? 0;
            let newWidth = initialWidth;
            let newHeight = initialHeight;

            if (resize_direction.includes(DRAGGABLE_CONSTANTS.RIGHT)) {
                newWidth += deltaX;
            } else if (resize_direction.includes(DRAGGABLE_CONSTANTS.LEFT)) {
                newX = deltaX + initialX;
                newWidth -= deltaX;
            }

            if (resize_direction.includes(DRAGGABLE_CONSTANTS.BOTTOM)) {
                newHeight += deltaY;
            } else if (resize_direction.includes(DRAGGABLE_CONSTANTS.TOP)) {
                newY = deltaY + initialY;
                newHeight -= deltaY;
            }

            setPosition(prev => {
                const maxY = Math.max(newY, topOffset + SAFETY_MARGIN);
                const maxX = Math.max(newX, leftOffset + SAFETY_MARGIN);
                return { x: newWidth <= minWidth ? prev.x : maxX, y: newHeight <= minHeight ? prev.y : maxY };
            });

            const self = draggableRef.current?.getBoundingClientRect();

            setSize(prev => ({
                width: calculateWidth({
                    prevWidth: prev.width,
                    leftOffset,
                    boundaryRect,
                    initialSelfRight,
                    resize_direction,
                    newWidth,
                    minWidth,
                    clientX,
                    self,
                }),
                height: calculateHeight({
                    prevHeight: prev.height,
                    topOffset,
                    boundaryRect,
                    initialSelfBottom,
                    resize_direction,
                    newHeight,
                    minHeight,
                    clientY,
                    self,
                }),
            }));
        };

        const handleDrag = (deltaX: number, deltaY: number) => {
            const newX = deltaX + initialX;
            const newY = deltaY + initialY;
            const boundedX = Math.min(
                Math.max(newX, leftOffset + SAFETY_MARGIN),
                leftOffset +
                    (boundaryRect?.width ?? 0) -
                    size.width -
                    (SAFETY_MARGIN + EXTRA_BOTTOM_RIGHT_SAFETY_MARGIN * 2)
            );
            const boundedY = Math.min(
                Math.max(newY, topOffset + SAFETY_MARGIN),
                topOffset +
                    (boundaryRect?.height ?? 0) -
                    size.height -
                    (SAFETY_MARGIN + EXTRA_BOTTOM_RIGHT_SAFETY_MARGIN * 2)
            );
            setPosition({ x: boundedX, y: boundedY });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            isResizing.current = false;
            if (draggableContentBody?.style) {
                try {
                    Object.assign(draggableContentBody.style, previousStyle);
                } catch {
                    draggableContentBody.style.pointerEvents = 'unset';
                }
            }
            window.removeEventListener('mousemove', handleMouseMove as any);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove as any);
            window.removeEventListener('touchend', handleMouseUp);
            window.removeEventListener('touchcancel', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove as any);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchmove', handleMouseMove as any, { passive: true });
        window.addEventListener('touchend', handleMouseUp);
        window.addEventListener('touchcancel', handleMouseUp);
    };

    return (
        <div
            className={`draggable ${isDragging ? 'dragging' : ''}`}
            style={{
                position: 'absolute',
                top: position.y,
                left: position.x,
                zIndex,
                transform: zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
                transformOrigin: 'top left',
            }}
            onMouseDown={() => calculateZindex({ setZIndex })}
            onTouchStart={() => calculateZindex({ setZIndex })}
            onKeyDown={() => calculateZindex({ setZIndex })}
            data-testid='dt_react_draggable'
            tabIndex={0}
        >
            <div
                ref={draggableRef}
                className='draggable-content'
                data-testid='dt_react_draggable_content'
                style={{ width: size.width, height: size.height }}
            >
                <div
                    id='draggable-content__header'
                    data-testid='dt_react_draggable_handler'
                    className='draggable-content__header'
                    onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.MOVE)}
                    onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.MOVE)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLElement>) =>
                        e.key === 'Enter' && handleMouseDown(null, DRAGGABLE_CONSTANTS.MOVE)
                    }
                    tabIndex={0}
                >
                    <div className={`draggable-content__header__title`}>{header}</div>

                    {/* Mobile & Desktop Zoom Controls */}
                    <div className='draggable-zoom-controls' style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}>
                        <button type='button' className='draggable-zoom-btn' onClick={handleZoomOut} title='Zoom Out'>🔍-</button>
                        <button type='button' className='draggable-zoom-btn' onClick={handleZoomReset} title='Reset Zoom'>{Math.round(zoomScale * 100)}%</button>
                        <button type='button' className='draggable-zoom-btn' onClick={handleZoomIn} title='Zoom In'>🔍+</button>
                    </div>

                    <div
                        className={`draggable-content__header__close`}
                        data-testid='dt_react_draggable-close-modal'
                        onClick={onClose}
                    >
                        <LegacyClose1pxIcon
                            height='20px'
                            width='20px'
                            fill='var(--text-general)'
                            className='icon-general-fill-path'
                        />
                    </div>
                </div>
                <span className='draggable-content__body' id='draggable-content-body'>
                    {children}
                </span>
                {enableResizing && (
                    <>
                        <div
                            className='resizable-handle__top'
                            data-testid='dt_resizable-handle__top'
                            onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.TOP)}
                            onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.TOP)}
                            tabIndex={0}
                        />
                        <div
                            className='resizable-handle__right'
                            data-testid='dt_resizable-handle__right'
                            onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.RIGHT)}
                            onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.RIGHT)}
                            tabIndex={0}
                        />
                        <div
                            className='resizable-handle__bottom'
                            data-testid='dt_resizable-handle__bottom'
                            onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.BOTTOM)}
                            onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.BOTTOM)}
                            tabIndex={0}
                        />
                        <div
                            className='resizable-handle__left'
                            data-testid='dt_resizable-handle__left'
                            onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.LEFT)}
                            onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.LEFT)}
                            tabIndex={0}
                        />
                        <div
                            className='resizable-handle__top-right'
                            data-testid='dt_resizable-handle__top-right'
                            onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.TOP_RIGHT)}
                            onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.TOP_RIGHT)}
                            tabIndex={0}
                        />
                        <div
                            className='resizable-handle__bottom-right'
                            data-testid='dt_resizable-handle__bottom-right'
                            onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.BOTTOM_RIGHT)}
                            onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.BOTTOM_RIGHT)}
                            tabIndex={0}
                        />
                        <div
                            className='resizable-handle__bottom-left'
                            data-testid='dt_resizable-handle__bottom-left'
                            onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.BOTTOM_LEFT)}
                            onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.BOTTOM_LEFT)}
                            tabIndex={0}
                        />
                        <div
                            className='resizable-handle__top-left'
                            data-testid='dt_resizable-handle__top-left'
                            onMouseDown={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.TOP_LEFT)}
                            onTouchStart={e => handleMouseDown(e, DRAGGABLE_CONSTANTS.TOP_LEFT)}
                            tabIndex={0}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default Draggable;
