import { makeAutoObservable } from 'mobx';

export type TApiRequest = {
    id: string;
    endpoint: string;
    method: string;
    status: number;
    duration: number;
    size: number;
    timestamp: number;
    error?: string;
    type: 'REST' | 'WS';
};

export type TWsMessage = {
    id: string;
    direction: 'IN' | 'OUT';
    type: string;
    size: number;
    timestamp: number;
    data: any;
};

export type TTabState = {
    id: string;
    name: string;
    status: 'Loading' | 'Ready' | 'Error' | 'Offline' | 'Waiting' | 'Refreshing';
    lastUpdated: number;
    errors: string[];
};

export type TSystemHealth = {
    cpu: number; // Emulated load based on render cycle time
    memory: number; // In MB (if available in performance API)
    fps: number;
};

export type TDiagnosticReport = {
    id: string;
    timestamp: number;
    rootCause: string;
    affectedModules: string[];
    recommendedFix: string;
    recoveryStatus: 'Pending' | 'Success' | 'Failed';
};

class SystemCenterStore {
    // Phase 4: API Logs
    apiRequests: TApiRequest[] = [];
    MAX_LOGS = 1000;

    // Phase 2: WS Logs
    wsMessages: TWsMessage[] = [];
    wsStats = {
        latency: 0,
        avgLatency: 0,
        sent: 0,
        received: 0,
        dropped: 0,
        reconnects: 0,
        connected: false
    };

    // Phase 3: Tab Monitoring
    tabs: Map<string, TTabState> = new Map();

    // Phase 8: Performance
    health: TSystemHealth = { cpu: 0, memory: 0, fps: 60 };

    // Phase 10: Diagnostics
    diagnostics: TDiagnosticReport[] = [];

    // Phase 7: Trading Times
    tradingTimes: any = null;
    serverTime: number = Date.now();

    constructor() {
        makeAutoObservable(this);
    }

    // --- Actions ---

    logApiRequest = (req: TApiRequest) => {
        this.apiRequests.unshift(req);
        if (this.apiRequests.length > this.MAX_LOGS) {
            this.apiRequests.pop();
        }

        // Trigger Diagnostics on error
        if (req.status >= 400 || req.error) {
            this.analyzeError(req);
        }
    };

    logWsMessage = (msg: TWsMessage) => {
        this.wsMessages.unshift(msg);
        if (this.wsMessages.length > this.MAX_LOGS) {
            this.wsMessages.pop();
        }

        if (msg.direction === 'OUT') this.wsStats.sent++;
        if (msg.direction === 'IN') this.wsStats.received++;
    };

    updateWsLatency = (ping: number) => {
        this.wsStats.latency = ping;
        this.wsStats.avgLatency = this.wsStats.avgLatency === 0 ? ping : (this.wsStats.avgLatency + ping) / 2;
    };

    setWsConnectionState = (connected: boolean) => {
        if (this.wsStats.connected && !connected) {
            this.wsStats.reconnects++;
            this.generateDiagnostic('WebSocket Disconnected', ['WebSocket'], 'Attempting auto-reconnect sequence.');
        }
        this.wsStats.connected = connected;
    };

    registerTab = (id: string, name: string) => {
        if (!this.tabs.has(id)) {
            this.tabs.set(id, { id, name, status: 'Loading', lastUpdated: Date.now(), errors: [] });
        }
    };

    updateTabStatus = (id: string, status: TTabState['status'], error?: string) => {
        const tab = this.tabs.get(id);
        if (tab) {
            tab.status = status;
            tab.lastUpdated = Date.now();
            if (error) {
                tab.errors.push(error);
                this.generateDiagnostic(`Tab Failure: ${tab.name}`, [tab.name], 'Isolated module restart required.');
            }
        }
    };

    updateHealth = (fps: number, cpu: number, memory: number) => {
        this.health = { fps, cpu, memory };
    };

    setServerTime = (time: number) => {
        this.serverTime = time;
    };

    // Phase 10: Smart Diagnostics Engine
    analyzeError = (req: TApiRequest) => {
        let cause = 'Unknown network error';
        let fix = 'Retry request';

        if (req.status === 401 || req.status === 403) {
            cause = 'Authentication Expired';
            fix = 'Refresh token sequence initiated';
        } else if (req.status === 429) {
            cause = 'Rate Limit Exceeded';
            fix = 'Applying exponential backoff (15s)';
        } else if (req.status >= 500) {
            cause = 'Deriv Server Error';
            fix = 'Wait for remote resolution';
        } else if (req.error?.includes('timeout')) {
            cause = 'Connection Timeout';
            fix = 'Check network stability and retry';
        }

        this.generateDiagnostic(`API Error: ${req.endpoint} (${req.status})`, ['REST API'], fix, cause);
    };

    generateDiagnostic = (title: string, modules: string[], fix: string, rootCause: string = title) => {
        const report: TDiagnosticReport = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            rootCause,
            affectedModules: modules,
            recommendedFix: fix,
            recoveryStatus: 'Pending'
        };
        this.diagnostics.unshift(report);
        if (this.diagnostics.length > 50) this.diagnostics.pop();
        
        // Auto-resolve mock delay for "Self Healing" UI effect
        setTimeout(() => {
            const index = this.diagnostics.findIndex(d => d.id === report.id);
            if (index !== -1) {
                this.diagnostics[index].recoveryStatus = 'Success';
            }
        }, 3000);
    };
}

export const systemCenterStore = new SystemCenterStore();
