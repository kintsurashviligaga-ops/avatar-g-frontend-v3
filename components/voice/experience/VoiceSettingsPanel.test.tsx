import { VoicePreferencesProvider, useVoicePreferencesContext } from './VoicePreferencesProvider';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceSettingsPanel } from './VoiceSettingsPanel';
import { loadVoicePreferences, VOICE_PREFERENCES_EVENT } from '@/lib/voice/experience/preferences';

beforeEach(()=>localStorage.clear());
test.each([['ka','ხასიათი','მწვრთნელი'],['en','Personality','Coach'],['ru','Характер','Наставник']] as const)('%s accessible controls persist only for the signed-in account',async(locale,label,coach)=>{
 const {rerender}=render(<VoiceSettingsPanel userId="alice" locale={locale}/>);
 fireEvent.change(screen.getByLabelText(label),{target:{value:'coach'}});
 expect(screen.getByRole('option',{name:coach})).toBeInTheDocument();
 expect(loadVoicePreferences('alice',localStorage).personality).toBe('coach');
 rerender(<VoiceSettingsPanel userId="bob" locale={locale}/>);
 await waitFor(()=>expect(screen.getByLabelText(label)).toHaveValue('friendly'));
 expect(loadVoicePreferences('alice',localStorage).personality).toBe('coach');
});
test('voice and personality are independent; sarcasm is opt-in; reset deletes device preferences',()=>{
 render(<VoiceSettingsPanel userId="alice" locale="en"/>);
 fireEvent.change(screen.getByLabelText('Voice'),{target:{value:'Charon'}});
 fireEvent.change(screen.getByLabelText('Personality'),{target:{value:'sarcastic'}});
 expect(screen.getByLabelText('Sarcasm')).toHaveValue('light');
 expect(screen.getByLabelText('Voice')).toHaveValue('Charon');
 fireEvent.change(screen.getByLabelText('Personality'),{target:{value:'calm'}});
 expect(screen.getByLabelText('Sarcasm')).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Delete settings on this device'}));
 expect(localStorage.getItem('myavatar:voice:v1:alice')).toBeNull();
});
test('guests cannot write another account preference',()=>{
 render(<VoiceSettingsPanel locale="en"/>);
 window.dispatchEvent(new CustomEvent(VOICE_PREFERENCES_EVENT));
 expect(screen.getByLabelText('Personality')).toBeDisabled();
 expect(screen.getByText('Sign in to save preferences.')).toBeVisible();
});

function ActiveCallStyle() { const p=useVoicePreferencesContext(); return <output data-testid="active-style">{p?.preferences.personality}</output>; }
test('denied persistence still updates the active same-account call and reports unsaved state',()=>{
 const denied=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
 try {
  render(<><VoiceSettingsPanel userId="alice" locale="en"/><VoicePreferencesProvider userId="alice"><ActiveCallStyle/></VoicePreferencesProvider><VoicePreferencesProvider userId="bob"><ActiveCallStyle/></VoicePreferencesProvider></>);
  fireEvent.change(screen.getByLabelText('Personality'),{target:{value:'coach'}});
  expect(screen.getAllByTestId('active-style').map(el=>el.textContent)).toEqual(['coach','friendly']);
  expect(screen.getByText('Could not save settings; changes apply only here.')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Delete settings on this device'}));
  expect(screen.getAllByTestId('active-style').map(el=>el.textContent)).toEqual(['friendly','friendly']);
 } finally { denied.mockRestore(); }
});
