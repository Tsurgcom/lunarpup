import { isTauri } from "./detect";

/** Write plain text to the clipboard (Tauri plugin or browser API). */
export async function writeText(text: string): Promise<void> {
  if (isTauri()) {
    const { writeText: writeNative } = await import(
      "@tauri-apps/plugin-clipboard-manager"
    );
    await writeNative(text);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const output = document.createElement("textarea");
    output.value = text;
    document.body.append(output);
    output.select();
    document.execCommand("copy");
    output.remove();
  }
}
