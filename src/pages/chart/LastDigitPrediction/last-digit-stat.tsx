import classNames from 'classnames';

type TLastDigitStat = {
    is_max: boolean | null;
    is_min: boolean | null;
    is_selected?: boolean;
    percentage: number | null;
};

/**
 * SVG circular progress ring showing frequency percentage.
 * Migrated from deriv-app LastDigitPrediction.
 */
const LastDigitStat = ({ is_max, is_min, is_selected, percentage }: TLastDigitStat) => {
    // interpolate color opacity within 7.5 to 12.5 range
    let opacity = ((percentage ?? 0) - 10) / 4;
    opacity = Math.min(Math.max(opacity, -1), +1);
    opacity = ((opacity + 1) / 2) * 0.85 + 0.15;
    const w = 339.292;
    let p = (20 * (percentage ?? 0) - 102) / 3 / 100;
    p = Math.max(Math.min(p, 0.66), 0.06);

    return (
        <div
            className={classNames('digits__pie-container', {
                'digits__pie-container--selected': is_selected,
            })}
        >
            <svg className='digits__pie-progress' width='120' height='120' viewBox='0 0 120 120'>
                <circle className='progress__bg' cx='60' cy='60' r='54' fill='none' strokeWidth='12' />
                {percentage && (
                    <circle
                        className={classNames('progress__value', {
                            'progress__value--is-max': is_max,
                            'progress__value--is-min': is_min,
                        })}
                        cx='60'
                        cy='60'
                        r='54'
                        fill='none'
                        strokeOpacity={is_max || is_min ? 1 : opacity}
                        strokeWidth='12'
                        strokeDasharray={[w * p, w * (1 - p)].join(' ')}
                        strokeDashoffset={w * ((p + 1) / 2)}
                    />
                )}
            </svg>
        </div>
    );
};

export default LastDigitStat;
