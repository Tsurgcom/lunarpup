import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGame } from './GameProvider.tsx';

export function ChatPanel({ multiplayerEnabled }: { multiplayerEnabled: boolean }) {
    const {
        chatLines,
        appendChatLine,
        submitChatMessage,
        handleTpCommand,
    } = useGame();
    const inputRef = useRef<HTMLInputElement>(null);
    const [visible, setVisible] = useState(multiplayerEnabled);

    useEffect(() => {
        if (!multiplayerEnabled) {
            appendChatLine('system', 'Join with ?multiplayer to use chat.');
        }
    }, [appendChatLine, multiplayerEnabled]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 't' || event.key === 'T') {
                if (document.activeElement === inputRef.current) return;
                event.preventDefault();
                setVisible((current) => !current);
                return;
            }
            if (event.key === 'Enter' && document.activeElement !== inputRef.current && visible) {
                event.preventDefault();
                inputRef.current?.focus();
            }
            if (event.key === 'Escape' && document.activeElement === inputRef.current) {
                inputRef.current?.blur();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [visible]);

    useEffect(() => {
        if (visible) queueMicrotask(() => inputRef.current?.focus());
    }, [visible]);

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const input = inputRef.current;
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        if (text.startsWith('/tp')) {
            input.value = '';
            handleTpCommand(text);
            return;
        }

        if (submitChatMessage(text)) {
            input.value = '';
        }
    }

    const className = [
        visible ? 'chat-visible' : 'chat-collapsed',
        multiplayerEnabled ? '' : 'chat-hidden',
    ].filter(Boolean).join(' ');

    return (
        <aside id="chat-panel" className={className} aria-label="Chat">
            <div className="chat-header">
                <h2>💬 Chat</h2>
                <button
                    type="button"
                    title="Toggle chat (T)"
                    aria-expanded={visible}
                    onClick={() => setVisible((current) => !current)}
                >
                    {visible ? '−' : '+'}
                </button>
            </div>
            <div id="chat-log" className="chat-log" aria-live="polite" aria-relevant="additions">
                {chatLines.map((line) => (
                    <div key={line.id} className={`chat-line chat-${line.kind}`}>{line.text}</div>
                ))}
            </div>
            <form className="chat-form" onSubmit={handleSubmit}>
                <input
                    id="chat-input"
                    ref={inputRef}
                    type="text"
                    maxLength={200}
                    placeholder="Say something… (/tp x z)"
                    disabled={!multiplayerEnabled}
                />
            </form>
        </aside>
    );
}
