import { useEffect, useRef, type FormEvent } from 'react';
import { useGame } from './GameProvider.tsx';

export function ChatPanel({ multiplayerEnabled, interactionEnabled = true }: { multiplayerEnabled: boolean; interactionEnabled?: boolean }) {
    const { chatLines, appendChatLine, submitChatMessage, handleTpCommand } = useGame();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!multiplayerEnabled) appendChatLine('system', 'Join with ?multiplayer to use chat.');
    }, [appendChatLine, multiplayerEnabled]);

    useEffect(() => {
        if (!interactionEnabled) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Enter' && document.activeElement !== inputRef.current && multiplayerEnabled) {
                event.preventDefault();
                inputRef.current?.focus();
            }
            if (event.key === 'Escape' && document.activeElement === inputRef.current) {
                inputRef.current?.blur();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [interactionEnabled, multiplayerEnabled]);

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
        if (submitChatMessage(text)) input.value = '';
    }

    const latestLine = chatLines.at(-1);
    const className = ['chat-line-hud lp-gameplay', multiplayerEnabled ? '' : 'chat-hidden']
        .filter(Boolean)
        .join(' ');

    return (
        <div id="chat-panel" className={className} aria-label="Chat">
            <div id="chat-log" className="chat-log" aria-live="polite" aria-relevant="additions">
                {latestLine && <div className={`chat-line chat-${latestLine.kind}`}>{latestLine.text}</div>}
            </div>
            <form className="chat-form" onSubmit={handleSubmit}>
                <input
                    id="chat-input"
                    ref={inputRef}
                    className="chat-input"
                    type="text"
                    maxLength={200}
                    placeholder="Say something… (Enter)"
                    aria-label="Chat message"
                    disabled={!multiplayerEnabled || !interactionEnabled}
                />
            </form>
        </div>
    );
}
