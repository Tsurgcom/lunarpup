let speedElement: HTMLDivElement | null = null;

export function bindSpeedHud(element: HTMLDivElement) {
    speedElement = element;

    return () => {
        if (speedElement === element) speedElement = null;
    };
}

export function updateSpeedHud(text: string) {
    if (speedElement) {
        speedElement.textContent = text;
        return;
    }

    const fallback = document.getElementById('speedometer');
    if (fallback) fallback.textContent = text;
}
