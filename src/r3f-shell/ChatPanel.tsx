import { useEffect, useRef, type FormEvent } from 'react';
import { bindChatPanel, submitChat } from '../ui/chat.ts';

export interface ChatPanelProps {
    multiplayerEnabled: boolean;
    playerName: string;
}

/**
 * Chrome-free chat: a single line at bottom-left showing the last message,
 * fading after a few seconds. Enter focuses the input to type, Esc closes it.
 * No panel, no header, no toggle button. Messages are appended through the
 * binding so network traffic never triggers a React render.
 */
export function ChatPanel({ multiplayerEnabled, playerName }: ChatPanelProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const logRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        const log = logRef.current;
        const input = inputRef.current;
        if (!root || !log || !input) return;

        return bindChatPanel({ root, log, input }, multiplayerEnabled, playerName);
    }, [multiplayerEnabled, playerName]);

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (inputRef.current) void submitChat(inputRef.current);
    }

    const className = ['chat-line-hud lp-gameplay', multiplayerEnabled ? '' : 'chat-hidden']
        .filter(Boolean)
        .join(' ');

    return (
        <div id="chat-panel" ref={rootRef} className={className} aria-label="Chat">
            <div id="chat-log" ref={logRef} className="chat-log" aria-live="polite" aria-relevant="additions" />
            <form className="chat-form" onSubmit={handleSubmit}>
                <input
                    id="chat-input"
                    ref={inputRef}
                    className="chat-input"
                    type="text"
                    maxLength={200}
                    placeholder="Say something… (Enter)"
                    aria-label="Chat message"
                />
            </form>
        </div>
    );
}
