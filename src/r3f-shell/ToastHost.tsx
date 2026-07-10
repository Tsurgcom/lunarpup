import { useLayoutEffect, useRef } from 'react';
import { registerToastHost } from '../ui/toast.ts';

export function ToastHost() {
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const host = ref.current;
        if (!host) return;
        return registerToastHost(host);
    }, []);

    return <div ref={ref} id="lp-toasts" role="status" aria-live="polite" />;
}
