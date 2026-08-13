import classNames from 'classnames';

type TLastDigitPointer = {
    is_lost?: boolean;
    is_won?: boolean;
    position: {
        left: number;
        top: number;
    } | null;
};

/**
 * Animated arrow pointer below the active digit circle.
 * Migrated from deriv-app LastDigitPrediction.
 */
const LastDigitPointer = ({ is_lost, is_won, position }: TLastDigitPointer) => (
    <>
        {!!position && (
            <span
                className='digits__pointer'
                style={{ transform: `translate3d(calc(${position.left}px), ${position.top}px, 0px)` }}
            >
                <svg
                    className={classNames('digits__icon', {
                        'digits__icon--win': is_won,
                        'digits__icon--loss': is_lost,
                    })}
                    width='16'
                    height='16'
                    viewBox='0 0 16 16'
                >
                    <path
                        className='digits__icon-color'
                        d='M8 2l6 10H2z'
                        fill='currentColor'
                    />
                </svg>
            </span>
        )}
    </>
);

export default LastDigitPointer;
