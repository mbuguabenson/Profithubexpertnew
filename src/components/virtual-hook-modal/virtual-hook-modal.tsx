import React, { useState, useEffect } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import './virtual-hook-modal.scss';

type TVirtualHookModalProps = {
  is_open?: boolean;
  onClose?: () => void;
};

export const VirtualHookModal: React.FC<TVirtualHookModalProps> = observer(({ is_open: propsIsOpen, onClose }) => {
  const { scanner } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(scanner.is_virtual_hook_enabled);
  const [consecutiveLosses, setConsecutiveLosses] = useState(scanner.virtual_loss_threshold);
  const [winsToActivate, setWinsToActivate] = useState(1);
  const [differsPrediction, setDiffersPrediction] = useState(0);

  useEffect(() => {
    if (propsIsOpen !== undefined) {
      setIsOpen(propsIsOpen);
    }
  }, [propsIsOpen]);

  // Listen for global openVhModal event
  useEffect(() => {
    const handleOpen = () => {
      const stored = JSON.parse(localStorage.getItem('vh_config') || '{}');
      setIsEnabled(stored.enabled ?? scanner.is_virtual_hook_enabled);
      setConsecutiveLosses(stored.consecutive_virtual_losses ?? scanner.virtual_loss_threshold);
      setWinsToActivate(stored.wins_to_activate ?? 1);
      setDiffersPrediction(stored.differs_prediction ?? 0);
      setIsOpen(true);
    };
    (window as any).openVhModal = handleOpen;
    return () => {
      delete (window as any).openVhModal;
    };
  }, [scanner]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) onClose();
  };

  const handleApply = () => {
    scanner.setVirtualHookEnabled(isEnabled);
    scanner.setVirtualLossThreshold(consecutiveLosses);

    const config = {
      enabled: isEnabled,
      consecutive_virtual_losses: consecutiveLosses,
      wins_to_activate: winsToActivate,
      differs_prediction: differsPrediction,
    };

    localStorage.setItem('vh_config', JSON.stringify(config));

    if (typeof window !== 'undefined') {
      (window as any).__VH__ = config;
      (window as any).__vh_current_losses_cnt = 0;

      // Sync checkbox on workspace block if Blockly workspace is active
      try {
        if ((window as any).Blockly?.derivWorkspace) {
          const blocks = (window as any).Blockly.derivWorkspace.getAllBlocks(false);
          const marketBlock = blocks?.find((b: any) => b.type === 'trade_definition_market');
          if (marketBlock) {
            marketBlock.setFieldValue(isEnabled ? 'TRUE' : 'FALSE', 'VH_ENABLED');
          }
        }
      } catch (err) {}
    }

    handleClose();
  };

  return (
    <div className="vh-modal-overlay" onClick={handleClose}>
      <div className="vh-modal-container" onClick={e => e.stopPropagation()}>
        <button className="vh-modal-close" onClick={handleClose}>×</button>
        
        {/* Header Icon */}
        <div className="vh-modal-header">
          <div className="vh-icon-glow">
            <span>⚡</span>
          </div>
          <h2>{localize('Virtual Hook')}</h2>
          <p className="vh-subtitle">{localize('Protect your balance with virtual trades')}</p>
        </div>

        {/* Enable / Disable Toggle Switch */}
        <div className="vh-toggle-bar">
          <label className={classNames('vh-switch', { active: isEnabled })}>
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={e => setIsEnabled(e.target.checked)}
            />
            <span className="vh-slider" />
          </label>
          <span className={classNames('vh-status-label', { enabled: isEnabled })}>
            {isEnabled ? localize('ENABLED') : localize('DISABLED')}
          </span>
        </div>

        {/* Settings Cards */}
        <div className="vh-cards-stack">
          {/* Card 1: Consecutive Virtual Losses */}
          <div className="vh-setting-card">
            <div className="vh-card-info">
              <div className="vh-card-icon">🔄</div>
              <div>
                <span className="vh-card-title">{localize('No of Consecutive Virtual Losses')}</span>
                <span className="vh-card-desc">{localize('Virtual trades before switching to real')}</span>
              </div>
            </div>
            <div className="vh-counter">
              <button
                className="vh-counter-btn"
                onClick={() => setConsecutiveLosses(Math.max(1, consecutiveLosses - 1))}
              >-</button>
              <span className="vh-counter-value">{consecutiveLosses}</span>
              <button
                className="vh-counter-btn"
                onClick={() => setConsecutiveLosses(Math.min(10, consecutiveLosses + 1))}
              >+</button>
            </div>
          </div>

          {/* Card 2: Wins on Real before switching to VH */}
          <div className="vh-setting-card">
            <div className="vh-card-info">
              <div className="vh-card-icon target">🎯</div>
              <div>
                <span className="vh-card-title">{localize('No of wins on Real before switching to VH')}</span>
                <span className="vh-card-desc">{localize('Wins to activate VH')}</span>
              </div>
            </div>
            <div className="vh-counter">
              <button
                className="vh-counter-btn"
                onClick={() => setWinsToActivate(Math.max(1, winsToActivate - 1))}
              >-</button>
              <span className="vh-counter-value">{winsToActivate}</span>
              <button
                className="vh-counter-btn"
                onClick={() => setWinsToActivate(Math.min(10, winsToActivate + 1))}
              >+</button>
            </div>
          </div>
        </div>

        {/* Apply Settings Button */}
        <button className="vh-apply-btn" onClick={handleApply}>
          ✓ {localize('Apply Settings')}
        </button>
      </div>
    </div>
  );
});

export default VirtualHookModal;
