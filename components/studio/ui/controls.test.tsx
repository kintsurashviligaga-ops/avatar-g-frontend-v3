/**
 * @jest-environment jsdom
 *
 * Slider — lifted from the Surgical Editor into the shared control set (owner plan 2b) for the music panel's
 * Weirdness / Style influence. Its label names the input, it reports numbers, and the two classes globals.css keys the
 * 44px grab strip and the shrinkable track on are present.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Slider } from './controls';

test('the label is the range input\'s accessible name, and the value shows with its suffix', () => {
  render(<Slider label="Weirdness" min={0} max={100} value={70} suffix="" onChange={jest.fn()} />);
  const input = screen.getByRole('slider', { name: 'Weirdness' }) as HTMLInputElement;
  expect(input.value).toBe('70');
  expect(screen.getByText('70')).toBeTruthy();
});

test('onChange receives a number, not the input\'s string', () => {
  const onChange = jest.fn();
  render(<Slider label="Style influence" min={0} max={100} value={50} onChange={onChange} />);
  fireEvent.change(screen.getByRole('slider', { name: 'Style influence' }), { target: { value: '15' } });
  expect(onChange).toHaveBeenCalledWith(15);
});

test('the editor\'s look by default: a % suffix, one decimal for fractional steps', () => {
  const { rerender } = render(<Slider label="Volume" min={0} max={200} value={120} onChange={jest.fn()} />);
  expect(screen.getByText('120%')).toBeTruthy();
  rerender(<Slider label="Speed" min={0.5} max={2} step={0.05} value={1.25} suffix="×" onChange={jest.fn()} />);
  expect(screen.getByText(/1\.3×|1\.2×/)).toBeTruthy();
});

test('the grab strip and the shrinkable track: `appearance-none` (globals.css → 44px) and `min-w-0`', () => {
  render(<Slider label="Weirdness" min={0} max={100} value={50} onChange={jest.fn()} />);
  const cls = screen.getByRole('slider').className;
  expect(cls).toContain('appearance-none');
  expect(cls).toContain('min-w-0');
});

test('ends caption the scale and the hint sits under it; without either, the row is all there is', () => {
  const { container, rerender } = render(
    <Slider label="Weirdness" min={0} max={100} value={50} onChange={jest.fn()} ends={['Familiar', 'Experimental']} hint="≈ Approximate" />,
  );
  expect(screen.getByText('Familiar')).toBeTruthy();
  expect(screen.getByText('Experimental')).toBeTruthy();
  expect(screen.getByText('≈ Approximate')).toBeTruthy();
  rerender(<Slider label="Weirdness" min={0} max={100} value={50} onChange={jest.fn()} />);
  expect(container.firstElementChild!.className).toBe('flex items-center gap-3');
});

test('stacked: label and value above a full-width track — what a 300px settings column needs', () => {
  const { container } = render(
    <Slider stacked label="სტილის გავლენა" min={0} max={100} value={30} suffix="" onChange={jest.fn()} ends={['თავისუფალი', 'მკაცრი']} />,
  );
  const input = screen.getByRole('slider', { name: 'სტილის გავლენა' });
  expect(input.className).toContain('w-full');
  expect(input.className).not.toContain('flex-1');
  expect(container.querySelector('.w-20')).toBeNull(); // no fixed label column eating the width
  expect(screen.getByText('30')).toBeTruthy();
  expect(screen.getByText('მკაცრი')).toBeTruthy();
});

test('disabled is honoured', () => {
  render(<Slider label="Weirdness" min={0} max={100} value={50} onChange={jest.fn()} disabled />);
  expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
});

describe('Create-screen options: tick marks and an accent thumb', () => {
  test('ticks draws ticks + 1 decorative lines behind the track; the range keeps its name, value and onChange', () => {
    const onChange = jest.fn();
    render(<Slider stacked ticks={10} accentThumb label="Weirdness" min={0} max={100} value={50} suffix="%" onChange={onChange} />);
    const marks = screen.getByTestId('slider-ticks');
    expect(marks.getAttribute('aria-hidden')).toBe('true');
    expect(marks.children).toHaveLength(11);
    const input = screen.getByRole('slider', { name: 'Weirdness' }) as HTMLInputElement;
    expect(input.className).toContain('slider-accent');
    expect(input.className).toContain('appearance-none'); // globals.css keys the 44px strip and the thumb on it
    expect(input.className).toContain('relative'); // above the ticks, so the thumb is what a finger grabs
    expect(screen.getByText('50%')).toBeTruthy();
    fireEvent.change(input, { target: { value: '80' } });
    expect(onChange).toHaveBeenCalledWith(80);
  });

  test('without them the markup is exactly what it was — no ticks, no accent class', () => {
    const { container } = render(<Slider label="Weirdness" min={0} max={100} value={50} onChange={jest.fn()} />);
    expect(screen.queryByTestId('slider-ticks')).toBeNull();
    expect(screen.getByRole('slider').className).not.toContain('slider-accent');
    expect(container.firstElementChild!.className).toBe('flex items-center gap-3');
  });

  test('inline (not stacked) with ticks still lets the track take the row', () => {
    render(<Slider ticks={4} label="Weirdness" min={0} max={100} value={50} onChange={jest.fn()} />);
    expect(screen.getByTestId('slider-ticks').children).toHaveLength(5);
    expect(screen.getByTestId('slider-ticks').parentElement!.className).toContain('flex-1');
  });
});
