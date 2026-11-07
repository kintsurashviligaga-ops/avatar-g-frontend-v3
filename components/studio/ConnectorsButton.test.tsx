/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectorsButton, connectorRowState } from './ConnectorsButton';

jest.mock('./research/api', () => ({
  fetchConnectors: jest.fn(async () => ({ ok: true, connectors: [{ id: 'google_drive', label: 'Google Drive', status: 'connectable', linked: true }], limits: null })),
}));
const openConnectors = jest.fn();
jest.mock('./research/store', () => ({ researchActions: { openConnectors: () => openConnectors() } }));

describe('ConnectorsButton (GG 2026-11-07: beside „+")', () => {
  test('lists Drive with its real state and Gmail/Calendar as soon; Drive opens its sheet', async () => {
    render(<ConnectorsButton locale="en" className="" />);
    fireEvent.click(screen.getByTestId('composer-connectors'));
    await waitFor(() => expect(screen.getByTestId('connector-row-google_drive').getAttribute('data-state')).toBe('linked'));
    expect(screen.getByTestId('connector-row-gmail').getAttribute('data-state')).toBe('soon');
    expect(screen.getByTestId('connector-row-premiere').getAttribute('data-state')).toBe('export');
    expect((screen.getByTestId('connector-row-gmail') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('connector-row-google_drive'));
    expect(openConnectors).toHaveBeenCalled();
  });
  test('row state is honest', () => {
    expect(connectorRowState(undefined)).toBe('soon');
    expect(connectorRowState({ status: 'connectable' })).toBe('connect');
    expect(connectorRowState({ status: 'unavailable' })).toBe('off');
    expect(connectorRowState({ status: 'soon', linked: true })).toBe('linked');
  });
});
