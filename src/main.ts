import './styles.css';

async function main() {
    const { bootstrap } = await import('./game/bootstrap.ts');
    await bootstrap();
}

window.addEventListener('load', () => {
    main().catch(console.error);
});
