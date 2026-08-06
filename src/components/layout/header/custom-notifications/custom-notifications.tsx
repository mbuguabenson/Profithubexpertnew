import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { LegacyNotificationIcon } from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
import { Notifications, Tooltip, useDevice } from '@deriv-com/ui';
import './custom-notifications.scss';

const NOTIFICATIONS_STORAGE_KEY = 'profithub_platform_notifications';

const CustomNotifications = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { localize } = useTranslations();
    const { isMobile } = useDevice();
    const [notifications, setNotifications] = useState<any[]>([]);

    const loadNotifications = () => {
        try {
            const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || '[]';
            const items = JSON.parse(raw);
            // Format for @deriv-com/ui Notifications component
            setNotifications(items.map((n: any, idx: number) => ({
                id: n.id || String(idx),
                header: n.title || 'Platform Update',
                message: n.message || '',
                timestamp: n.timestamp || Date.now(),
                is_read: n.is_read || false,
            })));
        } catch {
            setNotifications([]);
        }
    };

    useEffect(() => {
        loadNotifications();
        // Periodically refresh notifications
        const iv = setInterval(loadNotifications, 5000);
        return () => clearInterval(iv);
    }, []);

    const clearAll = () => {
        try {
            localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify([]));
            setNotifications([]);
        } catch { /* ignore */ }
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className='notifications__wrapper'>
            <Tooltip
                as='button'
                onClick={() => {
                    setIsOpen(!isOpen);
                    // Mark all as read when opening
                    if (!isOpen && unreadCount > 0) {
                        try {
                            const updated = notifications.map(n => ({ ...n, is_read: true }));
                            localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
                            setNotifications(updated);
                        } catch { /* ignore */ }
                    }
                }}
                tooltipContent={localize('View notifications')}
                tooltipPosition='bottom'
            >
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    <LegacyNotificationIcon iconSize='sm' />
                    {unreadCount > 0 && (
                        <span className="ph-notification-badge">{unreadCount}</span>
                    )}
                </div>
            </Tooltip>
            <Notifications
                className={clsx('', {
                    'notifications__wrapper--mobile': isMobile,
                    'notifications__wrapper--desktop': !isMobile,
                })}
                componentConfig={{
                    clearButtonText: localize('Clear all'),
                    modalTitle: localize('Platform Notifications'),
                    noNotificationsMessage: localize('No notifications yet.'),
                    noNotificationsTitle: localize('Clear and up-to-date!'),
                }}
                isOpen={isOpen}
                notifications={notifications}
                setIsOpen={setIsOpen}
                clearNotificationsCallback={clearAll}
                loadMoreFunction={() => {}}
                isLoading={false}
            />
        </div>
    );
};

export default CustomNotifications;

