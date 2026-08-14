import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

type RowActionsMenuProps = {
  children: React.ReactNode;
  label?: string;
  colorful?: boolean;
};

type MenuPosition = {
  left: number;
  top: number;
};

const MENU_WIDTH = 192;
const VIEWPORT_GAP = 8;

function getTextContent(node: React.ReactNode): string {
  return React.Children.toArray(node)
    .map(child => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (!React.isValidElement<Record<string, unknown>>(child)) return '';
      return getTextContent(child.props.children as React.ReactNode);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectActionVisuals(node: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(node).flatMap(child => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return [];
    if (child.type === React.Fragment || typeof child.type === 'string') {
      return collectActionVisuals(child.props.children as React.ReactNode);
    }
    return [child];
  });
}

function getActionLabel(element: React.ReactElement<Record<string, unknown>>) {
  const title = element.props.title;
  if (typeof title === 'string' && title.trim()) return title;

  const ariaLabel = element.props['aria-label'];
  if (typeof ariaLabel === 'string' && ariaLabel.trim()) return ariaLabel;

  const label = element.props.label;
  if (typeof label === 'string' && label.trim()) return label;

  const textContent = getTextContent(element.props.children as React.ReactNode);
  if (textContent) return textContent;

  return 'Thao tác';
}

function collectActions(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap(child => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return [];
    if (child.type === 'button' || child.type === 'a' || typeof child.props.onClick === 'function') return [child];
    return collectActions(child.props.children as React.ReactNode);
  });
}

export function RowActionsMenu({ children, label = 'Thao tác', colorful = false }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ left: VIEWPORT_GAP, top: VIEWPORT_GAP });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const actions = collectActions(children);

  const positionMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - VIEWPORT_GAP
    );
    const fitsBelow = rect.bottom + 6 + menuHeight <= window.innerHeight - VIEWPORT_GAP;
    const top = fitsBelow
      ? rect.bottom + 6
      : Math.max(VIEWPORT_GAP, rect.top - menuHeight - 6);

    setPosition({ left, top });
  };

  useLayoutEffect(() => {
    if (open) positionMenu();
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setOpen(false);

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <>
      <span className="flex w-full justify-center">
        <button
          ref={triggerRef}
          type="button"
          title={label}
          aria-label={label}
          aria-haspopup="menu"
          aria-controls={open ? menuId : undefined}
          aria-expanded={open}
          onClick={() => setOpen(current => !current)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-95"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </span>

      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className="fixed z-[120] w-48 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xl"
          style={position}
        >
          {actions.map((action, index) => {
            const actionLabel = getActionLabel(action);
            const originalOnClick = action.props.onClick as ((event: React.MouseEvent<HTMLElement>) => void) | undefined;
            const originalClassName = typeof action.props.className === 'string' ? action.props.className : '';
            const isNativeAction = action.type === 'button' || action.type === 'a';
            const isDanger = action.props.danger === true || /xóa|xoá/i.test(actionLabel);
            const actionVisuals = collectActionVisuals(action.props.children as React.ReactNode);
            const actionTone = !colorful
              ? isDanger ? 'text-rose-700 hover:bg-rose-50' : 'text-zinc-700 hover:bg-zinc-50'
              : /xóa|xoá/i.test(actionLabel)
                ? 'text-rose-500 hover:bg-rose-50'
                : /in\s/i.test(actionLabel)
                  ? 'text-[#ef1b2d] hover:bg-red-50'
                  : /sửa|edit/i.test(actionLabel)
                    ? 'text-amber-600 hover:bg-amber-50'
                    : 'text-zinc-600 hover:bg-zinc-50';

            if (!isNativeAction) {
              return (
                <button
                  key={action.key ?? `${actionLabel}-${index}`}
                  type="button"
                  role="menuitem"
                  disabled={action.props.disabled === true}
                  onClick={event => {
                    originalOnClick?.(event);
                    if (!event.defaultPrevented) setOpen(false);
                  }}
                  className={`flex min-h-10 w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${actionTone}`}
                >
                  {actionVisuals}
                  <span className="min-w-0 flex-1 truncate">{actionLabel}</span>
                </button>
              );
            }

            return React.cloneElement(action, {
              key: action.key ?? `${actionLabel}-${index}`,
              role: 'menuitem',
              title: undefined,
              className: `${originalClassName} !flex !h-auto !min-h-10 !w-full !items-center !justify-start !gap-2 !rounded-xl !border-0 !bg-transparent !px-3 !py-2 !text-left !text-sm !font-semibold !shadow-none ${actionTone}` ,
              onClick: (event: React.MouseEvent<HTMLElement>) => {
                originalOnClick?.(event);
                if (!event.defaultPrevented) setOpen(false);
              },
              children: (
                <>
                  {actionVisuals}
                  <span className="min-w-0 flex-1 truncate">{actionLabel}</span>
                </>
              )
            });
          })}
        </div>,
        document.body
      )}
    </>
  );
}
