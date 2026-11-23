import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import TruncatedValue from "./TruncatedValue";

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
  disabled = false,
  menuPortal = false,
  strictTooltip = false,
}: {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  menuPortal?: boolean;
  strictTooltip?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8, minWidth: 260, maxHeight: 280 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex];

  useLayoutEffect(() => {
    if (!isOpen || !menuPortal || !triggerRef.current || !menuRef.current) return;

    const triggerBounds = triggerRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;
    const edge = 8;
    const gap = 6;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const targetMinWidth = Math.min(
      viewportWidth - edge * 2,
      viewportWidth < 768 ? triggerBounds.width : Math.max(triggerBounds.width, 280),
    );
    const menuWidth = Math.min(
      viewportWidth - edge * 2,
      Math.max(menuEl.offsetWidth, targetMinWidth),
    );
    const left = Math.max(edge, Math.min(triggerBounds.left, viewportWidth - menuWidth - edge));
    const naturalHeight = Math.min(menuEl.scrollHeight + 2, 280);

    let safeBottom = viewportHeight - edge;
    const bottomNav = document.querySelector(".bottom-nav");
    if (bottomNav) {
      const navRect = bottomNav.getBoundingClientRect();
      if (navRect.height > 0 && navRect.top < viewportHeight) {
        safeBottom = Math.min(safeBottom, navRect.top - edge);
      }
    }
    if (viewportWidth >= 768) {
      const stickyBar = document.querySelector(".operation-review__sticky-bar");
      if (stickyBar) {
        const stickyRect = stickyBar.getBoundingClientRect();
        if (stickyRect.height > 0 && stickyRect.top > triggerBounds.bottom) {
          safeBottom = Math.min(safeBottom, stickyRect.top - edge);
        }
      }
    }

    const spaceBelow = safeBottom - (triggerBounds.bottom + gap);
    const spaceAbove = triggerBounds.top - edge - gap;

    let maxHeight: number;
    let top: number;
    if (naturalHeight <= spaceBelow || spaceBelow >= spaceAbove) {
      maxHeight = Math.min(280, Math.max(120, Math.floor(spaceBelow)));
      top = triggerBounds.bottom + gap;
    } else {
      maxHeight = Math.min(280, Math.max(120, Math.floor(spaceAbove)));
      top = Math.max(edge, triggerBounds.top - Math.min(naturalHeight, maxHeight) - gap);
    }

    setMenuPosition({ left, top, minWidth: targetMinWidth, maxHeight });
  }, [isOpen, menuPortal, options.length]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    const closeOnResize = () => setIsOpen(false);

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [isOpen]);

  const focusOption = (index: number) => {
    optionRefs.current[index]?.focus();
  };

  const menu = isOpen ? (
    <div
      ref={menuRef}
      className={`custom-select__menu${menuPortal ? " custom-select__menu--portal" : ""}`}
      role="listbox"
      aria-label={ariaLabel}
      style={menuPortal ? menuPosition : undefined}
    >
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
          <span>{option.label}</span>
          {option.value === value && <Check className="custom-select__check" aria-hidden="true" />}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <div className={`custom-select ${className}`} ref={containerRef}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className="custom-select__trigger"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={() => setIsOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
              window.requestAnimationFrame(() => focusOption(Math.max(selectedIndex, 0)));
            }
          }}
        >
          <TruncatedValue value={selectedOption?.label ?? ""} strictOverflow={strictTooltip} className="custom-select__value" />
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
        </button>
        {!menuPortal && menu}
      </div>
      {menuPortal && menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}
