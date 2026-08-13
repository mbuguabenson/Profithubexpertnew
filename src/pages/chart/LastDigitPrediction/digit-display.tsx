import classNames from 'classnames';
import Digit from './digit';
import DigitSpot from './digit-spot';
import LastDigitStat from './last-digit-stat';

type TDigitDisplay = {
    barrier: number | null;
    has_entry_spot: boolean;
    is_digit_contract?: boolean;
    is_lost?: boolean;
    is_max: boolean | null;
    is_min: boolean | null;
    is_won?: boolean;
    isMobile?: boolean;
    latest_digit: {
        digit: number | null;
        spot: string | null;
    };
    onSelect: ((digit_value: number) => void) | null;
    selected_digit?: number;
    status?: string | null;
    stats?: number | null;
    value: number;
};

/**
 * A single digit circle with stat ring, digit number, and spot.
 * Migrated from deriv-app LastDigitPrediction/digit-display.
 */
const DigitDisplay = ({
    barrier,
    is_digit_contract,
    has_entry_spot,
    is_lost,
    is_max,
    is_min,
    is_won,
    isMobile,
    onSelect,
    latest_digit,
    selected_digit,
    status,
    stats,
    value,
}: TDigitDisplay) => {
    const { digit, spot } = latest_digit;
    const is_latest = value === digit;
    const is_selected = value === barrier;
    const is_selected_winning = digit === barrier;
    const percentage = stats ? (stats * 100) / 1000 : null;

    const is_digit_selectable = typeof onSelect === 'function' && !status;
    const is_digit_selected = value === selected_digit && !status;

    return (
        <div
            className={classNames('digits__digit', {
                'digits__digit--latest': is_latest,
                'digits__digit--win': is_won && is_latest,
                'digits__digit--loss': is_lost && is_latest,
                'digits__digit--is-selectable': is_digit_selectable,
                'digits__digit--is-selected': is_digit_selected,
            })}
            onClick={() => {
                if (!is_digit_selectable || !onSelect) return;
                onSelect(value);
            }}
        >
            <LastDigitStat is_min={is_min} is_max={is_max} is_selected={is_selected} percentage={percentage} />
            {!!(is_digit_contract && is_latest && spot && status && has_entry_spot) && (
                <div className='digits__digit-spot'>
                    <DigitSpot
                        current_spot={spot}
                        is_lost={is_lost}
                        is_selected_winning={is_selected_winning}
                        is_won={is_won}
                    />
                </div>
            )}
            <Digit
                is_latest={is_latest}
                is_lost={is_lost}
                is_selected={is_selected}
                is_won={is_won}
                percentage={percentage}
                value={value}
            />
            {isMobile && is_latest && (
                <span className='digits__pointer digits__pointer--mobile'>
                    <svg
                        className={classNames('digits__icon', {
                            'digits__icon--win': is_won,
                            'digits__icon--loss': is_lost,
                        })}
                        width='16'
                        height='16'
                        viewBox='0 0 16 16'
                    >
                        <path className='digits__icon-color' d='M8 2l6 10H2z' fill='currentColor' />
                    </svg>
                </span>
            )}
        </div>
    );
};

export default DigitDisplay;
