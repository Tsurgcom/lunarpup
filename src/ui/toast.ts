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

export function showToast(options: ToastOptions): ToastHandle {
    let container = document.getElementById('lp-toasts');
    if (!container) {
        container = document.createElement('div');
        container.id = 'lp-toasts';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'lp-panel lp-toast';

    const text = document.createElement('span');
    text.textContent = options.message;
    toast.appendChild(text);

    let dismissed = false;
    let timer = 0;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        window.clearTimeout(timer);
        toast.classList.remove('lp-toast-in');
        window.setTimeout(() => toast.remove(), 240);
    };

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
