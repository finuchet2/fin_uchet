import { useEffect, useRef, useState } from "react";

type CustomSelectOption = {
  value: string;
  label: string;
};

export default function CustomSelect({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  className = "",
}: {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const focusOption = (index: number) => {
    optionRefs.current[index]?.focus();
  };

  return (
    <div className={`custom-select ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="custom-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            window.requestAnimationFrame(() => focusOption(Math.max(selectedIndex, 0)));
          }
        }}
      >
        <span>{selectedOption?.label ?? ""}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {isOpen && (
        <div className="custom-select__menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              className={`custom-select__option ${option.value === value ? "is-selected" : ""}`}
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusOption(Math.min(index + 1, options.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(Math.max(index - 1, 0));
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusOption(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusOption(options.length - 1);
                } else if (event.key === "Escape") {
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
