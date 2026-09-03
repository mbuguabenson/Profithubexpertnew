import React from 'react';

type TCFDCompareAccountsCarousel = {
    children: React.ReactNode;
    isRtl?: boolean;
};

const CFDCompareAccountsCarousel = ({ children }: TCFDCompareAccountsCarousel) => {
    return (
        <div className='cfd-compare-accounts-carousel'>
            <div className='cfd-compare-accounts-carousel__viewport' style={{ overflowX: 'auto' }}>
                <div className='cfd-compare-accounts-carousel__container'>{children}</div>
            </div>
        </div>
    );
};

export default CFDCompareAccountsCarousel;
