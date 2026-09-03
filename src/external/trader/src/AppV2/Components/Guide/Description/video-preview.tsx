import React from 'react';
import { CaptionText } from '@deriv-com/quill-ui';
import { LabelPairedPlayMdFillIcon } from '@deriv/quill-icons';
import { Localize } from '@deriv/translations';

type TVideoPreview = {
    contract_type: string;
    toggleVideoPlayer: () => void;
    video_src: string;
    only_show_thumbnail?: boolean;
    custom_width?: string;
    custom_height?: string;
};

const VideoPreview = ({
    contract_type,
    toggleVideoPlayer,
    video_src,
    only_show_thumbnail = false,
    custom_width,
    custom_height,
}: TVideoPreview) => (
    <div className='guide-video__wrapper' onClick={toggleVideoPlayer} onKeyDown={toggleVideoPlayer}>
        <div className='guide-video__preview' data-testid='dt_video_preview'>
            <video
                className='guide-video'
                muted
                preload='auto'
                src={video_src}
                style={{ width: custom_width || '112px', height: custom_height || '73px', objectFit: 'cover' }}
            />
            <div className='guide-video__preview__icon__wrapper'>
                <LabelPairedPlayMdFillIcon className='guide-video__preview__icon' />
            </div>
        </div>
        {!only_show_thumbnail && (
            <CaptionText size='sm' className='guide-video__title'>
                <Localize i18n_default_text='How does it work?' />
            </CaptionText>
        )}
    </div>
);

export default VideoPreview;
