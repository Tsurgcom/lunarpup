let speedElement: HTMLDivElement | null = null;

export function bindSpeedHud(element: HTMLDivElement) {
    speedElement = element;

    return () => {
        if (speedElement === element) speedElement = null;
    };
}

export function updateSpeedHud(text: string) {
    if (speedElement) speedElement.textContent = text;
}
