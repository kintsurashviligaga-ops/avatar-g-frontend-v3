import { loadGooglePicker } from './googlePicker';

test('blocked scripts time out and a subsequent click retries the loader successfully', async () => {
  jest.useFakeTimers();
  delete window.google;
  delete window.gapi;
  const first = loadGooglePicker();
  const failed = expect(first).rejects.toThrow('picker_timeout');
  jest.advanceTimersByTime(15_000);
  await failed;
  expect(document.querySelector('script[src="https://apis.google.com/js/api.js"]')).toBeNull();
  window.gapi = { load: jest.fn((_name, options) => { window.google = { picker: {} }; options.callback(); }) };
  await expect(loadGooglePicker()).resolves.toBeUndefined();
  expect(window.gapi.load).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
