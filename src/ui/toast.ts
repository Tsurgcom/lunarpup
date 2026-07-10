/**
 * Stacking toast/notification component.
 *
 * Toasts append to a top-centered container and can either auto-dismiss after a
 * duration (transient pings) or persist until acted on (the update banner is
 * the one deliberately-persistent instance). This replaces the old one-off
 * `#update-notice` div, which conflated a toast's styling with a blocking
 * notice's behaviour and supported neither stacking nor auto-dismiss.
 */

export interface ToastOptions {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    /** ms before auto-dismiss; `null` keeps it until dismissed/acted on. */
    durationMs?: number | null;
}

export interface ToastHandle {
    dismiss(): void;
}

const DEFAULT_DURATION_MS = 4000;
let toastHost: HTMLElement | null = null;
const activeToastDisposers = new Set<() => void>();

export function registerToastHost(host: HTMLElement): () => void {
    if (toastHost && toastHost !== host) throw new Error('A toast host is already registered');
    toastHost = host;
    return () => {
        if (toastHost !== host) return;
        for (const dispose of [...activeToastDisposers]) dispose();
        toastHost = null;
    };
}

export function showToast(options: ToastOptions): ToastHandle {
    const container = toastHost;
    if (!container) throw new Error('Toast host is not mounted');

    const toast = document.createElement('div');
    toast.className = 'lp-panel lp-toast';

    const text = document.createElement('span');
    text.textContent = options.message;
    toast.appendChild(text);

    let dismissed = false;
    let timer = 0;
    let removeTimer = 0;
    const dispose = () => {
        window.clearTimeout(timer);
        window.clearTimeout(removeTimer);
        toast.remove();
        activeToastDisposers.delete(dispose);
    };
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        window.clearTimeout(timer);
        toast.classList.remove('lp-toast-in');
        removeTimer = window.setTimeout(dispose, 240);
    };
    activeToastDisposers.add(dispose);

    if (options.actionLabel) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'lp-button lp-button-primary';
        action.textContent = options.actionLabel;
        action.addEventListener('click', () => {
            options.onAction?.();
            dismiss();
        });
        toast.appendChild(action);
    }

    container.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('lp-toast-in');

    const duration = options.durationMs === undefined ? DEFAULT_DURATION_MS : options.durationMs;
    if (duration !== null) {
        timer = window.setTimeout(dismiss, duration);
    }

    return { dismiss };
}
