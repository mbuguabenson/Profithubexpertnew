import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import DigitDisplay from './digit-display';
import LastDigitPointer from './last-digit-pointer';
import './last-digit-prediction.scss';

const display_array = Array.from(Array(10).keys()); // [0,1,2,...,9]

interface LastDigitPredictionProps {
    /** Called when user clicks a digit circle */
    onSelect?: (digit: number) => void;
    /** Currently selected digit (highlighted) */
    selected_digit?: number | null;
    /** Dimension of a single digit widget including margin (px) */
    dimension?: number;
    /** Live digit stats from SmartChart feed */
    digits?: number[];
    /** Live tick from SmartChart feed */
    tick?: {
        quote: number;
        pip_size: number;
        [key: string]: any;
    } | null;
}

/**
 * Digit distribution circles — migrated from deriv-app dtrader.
 *
 * Displays 10 circular widgets (0-9) with:
 * - SVG progress ring showing frequency percentage
 * - Digit number and percentage label
 * - Animated pointer on the current (last) digit
 * - Color coding: green = max, red = min, orange = current tick
 *
 * Reads tick data from `smart_trading` store (same source as the old component).
 */
const LastDigitPrediction = observer(
    ({ onSelect, selected_digit, dimension = 52, digits: propDigits, tick }: LastDigitPredictionProps) => {
        const store = useStore();
        const ticks = store?.smart_trading?.ticks || [];
        const storeDigit = store?.smart_trading?.last_digit;
        const { isMobile } = useDevice();

        // Build digit stats from the tick stream or prop
        const digits: number[] = useMemo(() => {
            // If propDigits is already exactly 10 counts/percentages (e.g. from some API)
            // Note: We also check if the sum > 0 or if it's literally just frequencies.
            // Actually, deriv-app usually passes an array of the last 1000 ticks (objects or numbers) as `digits`.

            const counts = Array(10).fill(0);
            const sourceArray =
                propDigits && propDigits.length > 10 ? propDigits : propDigits?.length === 10 ? propDigits : ticks;

            if (sourceArray === propDigits && propDigits.length === 10) {
                return propDigits;
            }

            if (Array.isArray(sourceArray)) {
                sourceArray.forEach((item: any) => {
                    let digit: number | null = null;
                    if (typeof item === 'number') {
                        // if item is already a digit 0-9
                        if (item >= 0 && item <= 9 && Number.isInteger(item)) {
                            digit = item;
                        } else {
                            // it might be a raw quote price, but usually we just get digits.
                            // If it's a raw quote, we'd need pip_size, which we don't have here.
                            // Assuming deriv passes actual last digits if it's numbers.
                        }
                    } else if (typeof item === 'object' && item !== null && item.quote !== undefined) {
                        const pip_size = item.pip_size || 0;
                        const quoteStr = Number(item.quote).toFixed(pip_size);
                        const last_char = quoteStr.slice(-1);
                        digit = parseInt(last_char, 10);
                    }

                    if (digit !== null && digit >= 0 && digit <= 9) {
                        counts[digit]++;
                    }
                });
            }

            return counts;
        }, [ticks, propDigits]);

        // Calculate total from digits array
        const total = useMemo(() => {
            return digits.reduce((sum, val) => sum + val, 0) || 1;
        }, [digits]);

        const min = Math.min(...digits);
        const max = Math.max(...digits);

        // Extract current digit and spot from live tick or store fallback
        const latest_digit = useMemo(() => {
            if (tick) {
                const pip_size = tick.pip_size || 0;
                const quote_price = typeof tick.quote === 'number' ? tick.quote.toFixed(pip_size) : '';
                const last_char = quote_price.slice(-1);
                const digit = last_char ? parseInt(last_char, 10) : null;
                return {
                    digit: isNaN(digit as number) ? null : digit,
                    spot: quote_price || null,
                };
            }
            return {
                digit: storeDigit !== undefined && storeDigit !== null ? storeDigit : null,
                spot: null as string | null,
            };
        }, [tick, storeDigit]);

        const currentDigit = latest_digit.digit;

        // Position offsets for the pointer arrow
        const digit_offset = useMemo(() => {
            const offsets: Record<number, { left: number; top: number }> = {};
            for (let i = 0; i < 10; i++) {
                offsets[i] = { left: 6 + dimension * i, top: 0 };
            }
            return offsets;
        }, [dimension]);

        const position =
            currentDigit !== null && currentDigit !== undefined ? (digit_offset[currentDigit] ?? null) : null;

        // Determine win/loss (not applicable in analysis view, but kept for API compat)
        const is_won = false;
        const is_lost = false;

        return (
            <div className='digits digits--trade'>
                {display_array.map(idx => (
                    <DigitDisplay
                        key={idx}
                        barrier={selected_digit !== null && selected_digit !== undefined ? selected_digit : null}
                        has_entry_spot={false}
                        is_digit_contract={false}
                        is_lost={is_lost}
                        is_won={is_won}
                        is_max={digits[idx] === max && total > 1}
                        is_min={digits[idx] === min && total > 1}
                        stats={digits[idx] || null}
                        status={null}
                        latest_digit={latest_digit}
                        value={idx}
                        onSelect={onSelect || null}
                        selected_digit={selected_digit ?? undefined}
                        isMobile={isMobile}
                    />
                ))}
                {!isMobile && <LastDigitPointer is_lost={is_lost} is_won={is_won} position={position} />}
            </div>
        );
    }
);

export default LastDigitPrediction;
