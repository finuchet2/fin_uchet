import { useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TruncatedValueProps = {
  value: string;
  tooltipValue?: string;
  className?: string;
  children?: ReactNode;
  showTooltip?: boolean;
};

export default function TruncatedValue({
  value,
  tooltipValue = value,
  className,
  children,
  showTooltip = true,
}: TruncatedValueProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  const handleMouseEnter = (event: MouseEvent<HTMLSpanElement>) => {
    if (!showTooltip) return;
    const element = event.currentTarget;
    if (!value.includes("... ₽") && element.scrollWidth <= element.clientWidth) return;
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
    if (!value.includes("... ₽") && element.scrollWidth <= element.clientWidth) {
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
