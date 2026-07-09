import { useEffect, useRef, useState, type FormEvent } from 'react';
import { bindChatPanel, submitChat, type ChatPanelBinding } from '../ui/chat.ts';

export interface ChatPanelProps {
    multiplayerEnabled: boolean;
    playerName: string;
}

/**
 * React presentation for chat. Messages are appended through the binding so
 * network activity does not cause React renders.
 */
export function ChatPanel({ multiplayerEnabled, playerName }: ChatPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const logRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const visibleRef = useRef(multiplayerEnabled);
    const [visible, setVisible] = useState(multiplayerEnabled);

    useEffect(() => {
        const panel = panelRef.current;
        const log = logRef.current;
        const input = inputRef.current;
        if (!panel || !log || !input) return;

        const binding: ChatPanelBinding = {
            panel,
            log,
            input,
            isVisible: () => visibleRef.current,
            setVisible(nextVisible) {
                visibleRef.current = nextVisible;
                setVisible(nextVisible);
                if (nextVisible) queueMicrotask(() => input.focus());
            },
        };

        return bindChatPanel(binding, multiplayerEnabled, playerName);
    }, [multiplayerEnabled, playerName]);

    function setChatVisible(nextVisible: boolean) {
        visibleRef.current = nextVisible;
        setVisible(nextVisible);
        if (nextVisible) queueMicrotask(() => inputRef.current?.focus());
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (inputRef.current) void submitChat(inputRef.current);
    }

    const className = [
        'lp-panel lp-gameplay',
        visible ? 'chat-visible' : 'chat-collapsed',
        multiplayerEnabled ? '' : 'chat-hidden',
    ].filter(Boolean).join(' ');

    return (
        <aside id="chat-panel" ref={panelRef} className={className} aria-label="Chat">
            <div className="chat-header">
                <h2>💬 Chat</h2>
                <button
                    type="button"
                    title="Toggle chat (T)"
                    aria-expanded={visible}
                    onClick={() => setChatVisible(!visibleRef.current)}
                >
                    {visible ? '−' : '+'}
                </button>
            </div>
            <div id="chat-log" ref={logRef} className="chat-log" aria-live="polite" aria-relevant="additions" />
            <form className="chat-form" onSubmit={handleSubmit}>
                <input
                    id="chat-input"
                    ref={inputRef}
                    type="text"
                    maxLength={200}
                    placeholder="Say something… (/tp x z)"
                />
            </form>
        </aside>
    );
}
