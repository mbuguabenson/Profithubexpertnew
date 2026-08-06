export enum BridgeState {
    IDLE = 'IDLE',
    LOADING_IFRAME = 'LOADING_IFRAME',
    WAITING_READY = 'WAITING_READY',
    READY = 'READY',
    REQUESTING_SESSION = 'REQUESTING_SESSION',
    AUTHENTICATING = 'AUTHENTICATING',
    AUTHENTICATED = 'AUTHENTICATED',
    CONNECTED = 'CONNECTED',
    SYNCING = 'SYNCING',
    RECONNECTING = 'RECONNECTING',
    RECOVERING = 'RECOVERING',
    FAILED = 'FAILED',
    LOGGED_OUT = 'LOGGED_OUT'
}

type TransitionMap = Partial<Record<BridgeState, BridgeState[]>>;

export class BridgeStateMachine {
    private state: BridgeState = BridgeState.IDLE;
    private listeners: Set<(state: BridgeState, previousState: BridgeState) => void> = new Set();
    
    // Define allowed transitions for determinism
    private allowedTransitions: TransitionMap = {
        [BridgeState.IDLE]: [BridgeState.LOADING_IFRAME],
        [BridgeState.LOADING_IFRAME]: [BridgeState.WAITING_READY, BridgeState.FAILED],
        [BridgeState.WAITING_READY]: [BridgeState.READY, BridgeState.FAILED, BridgeState.RECOVERING],
        [BridgeState.READY]: [BridgeState.REQUESTING_SESSION, BridgeState.AUTHENTICATING],
        [BridgeState.REQUESTING_SESSION]: [BridgeState.AUTHENTICATING, BridgeState.LOGGED_OUT],
        [BridgeState.AUTHENTICATING]: [BridgeState.AUTHENTICATED, BridgeState.FAILED],
        [BridgeState.AUTHENTICATED]: [BridgeState.CONNECTED, BridgeState.SYNCING],
        [BridgeState.CONNECTED]: [BridgeState.SYNCING, BridgeState.RECONNECTING, BridgeState.LOGGED_OUT, BridgeState.FAILED],
        [BridgeState.SYNCING]: [BridgeState.CONNECTED, BridgeState.FAILED],
        [BridgeState.RECONNECTING]: [BridgeState.CONNECTED, BridgeState.FAILED],
        [BridgeState.RECOVERING]: [BridgeState.WAITING_READY, BridgeState.FAILED],
        [BridgeState.FAILED]: [BridgeState.IDLE, BridgeState.LOADING_IFRAME, BridgeState.RECOVERING],
        [BridgeState.LOGGED_OUT]: [BridgeState.IDLE, BridgeState.WAITING_READY]
    };

    constructor(initialState: BridgeState = BridgeState.IDLE) {
        this.state = initialState;
    }

    public getState(): BridgeState {
        return this.state;
    }

    public transitionTo(newState: BridgeState): boolean {
        const allowed = this.allowedTransitions[this.state];
        
        // Always allow transition to IDLE (e.g. during component unmount/detach)
        // Otherwise check if transition is allowed
        if (newState === BridgeState.IDLE || !allowed || allowed.includes(newState)) {
            const previousState = this.state;
            this.state = newState;
            console.log(`[Bridge State] Transition: ${previousState} -> ${newState}`);
            this.notifyListeners(previousState);
            return true;
        }

        console.warn(`[Bridge State] Invalid transition attempted: ${this.state} -> ${newState}`);
        return false;
    }

    public subscribe(listener: (state: BridgeState, previousState: BridgeState) => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(previousState: BridgeState) {
        this.listeners.forEach(listener => {
            try {
                listener(this.state, previousState);
            } catch (err) {
                console.error('Error notifying state listener', err);
            }
        });
    }
}
