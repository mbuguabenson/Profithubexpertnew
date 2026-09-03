import classNames from 'classnames';

type TDigitSpot = {
    current_spot?: string | null;
    is_selected_winning?: boolean;
    is_lost?: boolean;
    is_won?: boolean;
};

const DigitSpot = ({ current_spot, is_selected_winning, is_lost, is_won }: TDigitSpot) => (
    <>
        <span className='digits__digit-spot-value'>{current_spot?.slice(0, -1)}</span>
        <span
            className={classNames('digits__digit-spot-last', {
                'digits__digit-spot-last--selected-win': is_selected_winning,
                'digits__digit-spot-last--win': is_won,
                'digits__digit-spot-last--loss': is_lost,
            })}
        >
            {current_spot?.slice(-1)}
        </span>
    </>
);

export default DigitSpot;
