import type { ReactNode } from 'react';
import type { LegacyRefresh, LegacyRoute, LegacyToast } from '../legacy-bridge';
import type { ActiveCheck } from '../visits';
import { dialogHost } from './dialog-host';
import type { DialogEnvironment } from './FormDialog';

/** The legacy shell services a form dialog needs. */
export interface DialogServices {
  readonly closeDialog: () => void;
  readonly viewContext: () => ActiveCheck;
  readonly dialogGeneration: () => number;
  readonly refresh: LegacyRefresh;
  readonly toast: LegacyToast;
  readonly route: LegacyRoute;
}

/**
 * The legacy openForm() sequence: bind to the visible view, close any open dialog, then open this one.
 * The dialog stays "present" only while that view is current, the dialog is open and no newer dialog
 * replaced it.
 */
export function openFormDialog(services: DialogServices, render: (env: DialogEnvironment) => ReactNode, active: ActiveCheck = services.viewContext()): void {
  services.closeDialog();
  const generation = services.dialogGeneration();
  const modal = document.querySelector<HTMLDialogElement>('#modal');
  dialogHost.show(render({
    active, present: () => active() && !!modal?.open && services.dialogGeneration() === generation,
    close: services.closeDialog, refresh: services.refresh, toast: services.toast, route: services.route
  }));
}
