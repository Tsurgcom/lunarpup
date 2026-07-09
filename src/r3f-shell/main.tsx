import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const root = document.getElementById('r3f-root');

if (!root) {
    throw new Error('Missing #r3f-root');
}

createRoot(root).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
