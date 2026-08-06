import { observer } from 'mobx-react-lite';
import { localize } from '@deriv-com/translations';
import { useStore } from '@/hooks/useStore';
import classNames from 'classnames';
import './scanner-parameters-modal.scss';

type TScannerParametersModalProps = {
    is_open: boolean;
    onClose: () => void;
    onLaunch: () => void;
};

export const ScannerParametersModal = observer(({ is_open, onClose, onLaunch }: TScannerParametersModalProps) => {
    const { entry_scanner } = useStore();

    if (!is_open) return null;

    return (
        <div className="scanner-modal-overlay">
            <div className="scanner-modal-content">
                <div className="scanner-modal-header">
                    <h3>{localize('Scanner Parameters')}</h3>
                </div>
                
                <div className="scanner-modal-body">
                    <div className="input-row">
                        <div className="input-group">
                            <label>{localize('STAKE')}</label>
                            <input 
                                type="number" 
                                value={entry_scanner.stake} 
                                onChange={(e) => entry_scanner.stake = Number(e.target.value)} 
                            />
                        </div>
                        <div className="input-group">
                            <label>{localize('MARTINGALE')}</label>
                            <input 
                                type="number" 
                                value={entry_scanner.martingale} 
                                onChange={(e) => entry_scanner.martingale = Number(e.target.value)} 
                            />
                        </div>
                    </div>

                    <div className="input-row">
                        <div className="input-group">
                            <label>{localize('NUMBER OF WINS')}</label>
                            <input 
                                type="number" 
                                value={entry_scanner.number_of_wins} 
                                onChange={(e) => entry_scanner.number_of_wins = Number(e.target.value)} 
                            />
                        </div>
                        <div className="input-group">
                            <label>{localize('NO. OF DIGITS TO CHECK')}</label>
                            <input 
                                type="number" 
                                value={entry_scanner.digits_to_check} 
                                onChange={(e) => entry_scanner.digits_to_check = Number(e.target.value)} 
                            />
                        </div>
                    </div>

                    <div className="input-row">
                        <div className="input-group">
                            <label>{localize('STOP LOSS')}</label>
                            <input 
                                type="number" 
                                value={entry_scanner.stop_loss} 
                                onChange={(e) => entry_scanner.stop_loss = Number(e.target.value)} 
                            />
                        </div>
                    </div>

                    <div className="toggle-row">
                        <span className="toggle-label">{localize('Use Martingale')}</span>
                        <div 
                            className={classNames('toggle-switch', { active: entry_scanner.use_martingale })}
                            onClick={() => entry_scanner.use_martingale = !entry_scanner.use_martingale}
                        >
                            <div className="toggle-knob"></div>
                        </div>
                    </div>
                </div>

                <div className="scanner-modal-footer">
                    <button className="btn-cancel" onClick={onClose}>{localize('Cancel')}</button>
                    <button className="btn-launch" onClick={onLaunch}>{localize('Launch Bot')}</button>
                </div>
            </div>
        </div>
    );
});

export default ScannerParametersModal;
