import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { IAuditLogEntry } from '../services/journal-types';
import { getAuditLog, exportAllData } from '../services/journal-storage';

const AuditLogTab = observer(() => {
    const [logs, setLogs] = useState<IAuditLogEntry[]>([]);

    useEffect(() => {
        setLogs(getAuditLog());
    }, []);

    const handleExportAll = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(exportAllData());
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `pro_journal_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        // Refresh to show export action in log
        setLogs(getAuditLog());
    };

    return (
        <div className="pj-audit-log-tab">
            <div className="pj-card" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc' }}>Data Management & Audit</h3>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                        All journal data is stored locally in your browser. Export frequently to prevent data loss.
                    </p>
                </div>
                <button className="pj-btn pj-btn--primary" onClick={handleExportAll}>
                    ⬇️ Download Full Backup JSON
                </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0', color: '#e2e8f0' }}>System Audit Trail</h4>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>Immutable record of modifications to your journal data.</p>
            </div>

            <div className="pj-table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Action</th>
                            <th>Record ID</th>
                            <th>Source</th>
                            <th>Changes (Prev ➔ New)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No audit logs recorded yet.</td></tr>
                        ) : (
                            logs.map(log => {
                                const isDelete = log.action.includes('deleted');
                                const isCreate = log.action.includes('created');
                                
                                return (
                                    <tr key={log.id}>
                                        <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{log.timestamp.replace('T', ' ')}</td>
                                        <td>
                                            <span style={{ 
                                                fontSize: '0.75rem', 
                                                textTransform: 'uppercase', 
                                                padding: '2px 8px', 
                                                borderRadius: '4px', 
                                                background: isDelete ? 'rgba(239, 68, 68, 0.1)' : isCreate ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                                color: isDelete ? '#ef4444' : isCreate ? '#10b981' : '#3b82f6'
                                            }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>
                                            {log.record_affected === 'all' ? 'GLOBAL' : log.record_affected.slice(0,12)+'...'}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{log.source}</td>
                                        <td style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>
                                            {isDelete ? (
                                                <span style={{ color: '#ef4444' }}>Soft Deleted: {log.previous_value}</span>
                                            ) : isCreate ? (
                                                <span style={{ color: '#10b981' }}>Created: {log.new_value}</span>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ color: '#94a3b8' }}>{log.previous_value}</span>
                                                    <span style={{ color: '#38bdf8' }}>➔</span>
                                                    <span>{log.new_value}</span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default AuditLogTab;
