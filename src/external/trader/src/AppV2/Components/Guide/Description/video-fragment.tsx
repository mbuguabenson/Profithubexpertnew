import React from 'react';
import classNames from 'classnames';
import { useDevice } from '@deriv-com/ui';
import { getUrlBase } from '@deriv/shared';
import { CONTRACT_LIST } from 'AppV2/Utils/trade-types-utils';

type TVideoFragment = {
    contract_type: string;
    is_mobile_forced?: boolean;
};

const VideoFragment = ({ contract_type, is_mobile_forced = false }: TVideoFragment) => {
    const { isMobile } = useDevice();
    const getVideoSource = React.useCallback(
        (extension: string) =>
            getUrlBase(
                `/public/videos/${contract_type.toLowerCase()}_${is_mobile_forced ? 'mobile' : isMobile ? 'mobile' : 'desktop'}.${extension}`
            ),
        [contract_type, isMobile]
    );

    return (
        <div className='guide-description__video-fragment'>
            <video
                src={getVideoSource('mp4')}
                autoPlay
                loop
                muted
                playsInline
                className={classNames('guide-description__video', {
                    'guide-description__video--accumulator': contract_type === CONTRACT_LIST.ACCUMULATOR,
                })}
            />
        </div>
    );
};

export default VideoFragment;
