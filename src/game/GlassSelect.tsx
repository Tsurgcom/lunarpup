import { useCallback, useEffect, useId, useRef, useState } from "react";

export type GlassSelectOption<T extends string> = {
  value: T;
  /** Static label; if omitted, `labelFor` is used. */
  label?: string;
};

type GlassSelectProps<T extends string> = {
  id?: string;
  label: string;
  value: T;
  options: readonly GlassSelectOption<T>[];
  /** Live label for the closed trigger / option (e.g. Auto with brackets). */
  labelFor: (value: T) => string;
  onChange: (value: T) => void;
};

/**
 * Custom glassy listbox — matches menu chrome, large tap targets for mobile.
 */
export function GlassSelect<T extends string>({
  id: idProp,
  label,
  value,
  options,
  labelFor,
  onChange,
}: GlassSelectProps<T>) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };

    // Capture so Esc isn't stolen by the pause menu first.
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  const selectedLabel = labelFor(value);

  return (
    <div className={`menu__select${open ? " is-open" : ""}`} ref={rootRef}>
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        className="menu__select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="menu__select-value">{selectedLabel}</span>
        <span className="menu__select-chevron" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={listId}
          className="menu__select-list"
          role="listbox"
          aria-labelledby={`${id}-label`}
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            const text = opt.label ?? labelFor(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                className={`menu__select-option${selected ? " is-selected" : ""}`}
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.value);
                  close();
                }}
              >
                {text}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
