import classNames from 'classnames';
import React from 'react';
import Field from '../field';

type TPasswordMeter = {
    children?: React.ReactNode | ((prop: { [key: string]: boolean }) => string);
    input: string;
    has_error?: boolean;
    custom_feedback_messages?: { [key: string]: string };
};

const PasswordMeter = ({ children, has_error, input, custom_feedback_messages }: TPasswordMeter) => {
    const [score, setScore] = React.useState<number>(0);

    React.useEffect(() => {
        if (!input || input.length === 0) {
            setScore(0);
            return;
        }
        let calculated = 1;
        if (input.length >= 8) calculated += 1;
        if (/[A-Z]/.test(input) && /[0-9]/.test(input)) calculated += 1;
        if (/[^A-Za-z0-9]/.test(input)) calculated += 1;
        setScore(Math.min(calculated, 4));
    }, [input]);

    const width_scale = (() => {
        if (has_error && input?.length) return 0.25;
        return 0.25 * (input?.length && score < 1 ? 1 : score);
    })();

    return (
        <React.Fragment>
            <div className='dc-password-meter__container'>
                {typeof children === 'function' ? children({ has_warning: false }) : children}
                <div className='dc-password-meter__bg' />
                <div
                    className={classNames('dc-password-meter', {
                        'dc-password-meter--weak': has_error || (input?.length && score < 3),
                        'dc-password-meter--strong': !has_error && input?.length && score >= 3,
                    })}
                    style={{ transform: `scale(${width_scale || 0}, 1)` }}
                />
            </div>
        </React.Fragment>
    );
};

export default PasswordMeter;
