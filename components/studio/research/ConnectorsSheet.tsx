'use client';

/**
 * ConnectorsSheet — the research door to the user's documents: the Connectors body (ConnectorsBody — Local files works; Google
 * Drive, OneDrive, Notion and Dropbox are „Soon" with no connect button) in a sheet, opened from Deep Research (the „+" row,
 * the start sheet's „Manage", the list). The hub's Connectors tab (components/studio/hub) draws the same body.
 */
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { ConnectorsBody } from './ConnectorsBody';
import { researchCopy } from './copy';
import { researchActions } from './store';

export function ConnectorsSheet({ locale, authed }: { locale: string; authed: boolean }) {
  const c = researchCopy(locale);
  return (
    <BottomSheet open onClose={researchActions.closeConnectors} title={c.connHeading} closeLabel={c.close} testId="research-connectors-sheet">
      <ConnectorsBody locale={locale} authed={authed} />
    </BottomSheet>
  );
}
