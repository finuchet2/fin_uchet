import { useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TruncatedValueProps = {
  value: string;
  tooltipValue?: string;
  className?: string;
  children?: ReactNode;
  showTooltip?: boolean;
  strictOverflow?: boolean;
  tooltipOnHover?: boolean;
  ariaLabel?: string;
};

export default function TruncatedValue({
  value,
  tooltipValue = value,
  className,
  children,
  showTooltip = true,
  strictOverflow = false,
  tooltipOnHover = false,
  ariaLabel,
}: TruncatedValueProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const hasManualTruncation = !strictOverflow && value.includes("... ₽");
  const shouldShowTooltip = (element: HTMLSpanElement) => (
    tooltipOnHover || hasManualTruncation || element.scrollWidth > element.clientWidth
  );

  const handleMouseEnter = (event: MouseEvent<HTMLSpanElement>) => {
    if (!showTooltip) return;
    const element = event.currentTarget;
    if (!shouldShowTooltip(element)) return;
    const rect = element.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.top });
    setVisible(true);
  };

  const handleMouseMove = (event: MouseEvent<HTMLSpanElement>) => {
    if (!showTooltip) {
      setVisible(false);
      return;
    }
    if (!visible) return;
    const element = event.currentTarget;
    if (!shouldShowTooltip(element)) {
      setVisible(false);
      return;
    }
    const rect = element.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.top });
  };

  return (
    <>
      <span
        className={className}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setVisible(false)}
      >
        {children ?? value}
      </span>
      {visible && typeof document !== "undefined"
        ? createPortal(
            <div className="ellipsis-tooltip" style={{ left: position.x, top: position.y }}>
              {tooltipValue}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
