import { useEffect, useRef, useState } from 'react';

/**
 * The "more actions" menu on an application card: a button that opens a short menu. The menu item
 * carries data-action, so the shell opens the confirmation dialog as it does for every other action.
 * Closes on Escape, on a click elsewhere, and after an item is chosen.
 */
export function AppMenu({ appId, appName, archived }: { appId: string; appName: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  return (
    <div className="app-menu" ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); trigger.current?.focus(); } }}>
      <button ref={trigger} type="button" className="icon-button" aria-label={`More actions for ${appName}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open ? (
        <div className="menu" role="menu" aria-label={`Actions for ${appName}`}>
          <button type="button" role="menuitem" className={archived ? '' : 'danger'} data-action={archived ? 'restore-application' : 'archive-application'} data-id={appId} onClick={() => setTimeout(() => setOpen(false))}>
            {archived ? 'Restore application' : 'Archive application'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
