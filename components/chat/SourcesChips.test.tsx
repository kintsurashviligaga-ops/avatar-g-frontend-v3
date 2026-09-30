/**
 * @jest-environment jsdom
 *
 * SourcesChips: grounding citations as compact, safe, new-tab chips.
 *
 * ⚠️ The Gemini API returns every grounding source as a vertexaisearch.cloud.google.com redirect with the
 * real site in the title. Labelling chips by URL host would print that Google host on every chip.
 */
import { fireEvent, render } from '@testing-library/react';
import { SourcesChips, sourceLabel } from './SourcesChips';

describe('sourceLabel', () => {
  it('uses the host without www, and keeps a title that adds something', () => {
    expect(sourceLabel({ url: 'https://www.bbc.com/news/1', title: 'Storm hits Tbilisi' })).toEqual({
      href: 'https://www.bbc.com/news/1',
      domain: 'bbc.com',
      title: 'Storm hits Tbilisi',
    });
    expect(sourceLabel({ url: 'https://civil.ge/x', title: 'civil.ge' })).toEqual({ href: 'https://civil.ge/x', domain: 'civil.ge' });
  });

  it('labels a Google grounding redirect by the site in its title', () => {
    const url = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123';
    expect(sourceLabel({ url, title: 'wikipedia.org' })).toEqual({ href: url, domain: 'wikipedia.org' });
    expect(sourceLabel({ url })).toEqual({ href: url, domain: 'google.com' });
  });

  it('rejects anything that is not an http(s) URL', () => {
    expect(sourceLabel({ url: 'javascript:alert(1)' })).toBeNull();
    expect(sourceLabel({ url: 'data:text/html,x' })).toBeNull();
    expect(sourceLabel({ url: 'https://' })).toBeNull();
  });
});

describe('<SourcesChips>', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ url: `https://site${i}.example/p`, title: `Page ${i}` }));

  it('renders nothing without usable sources', () => {
    const { container } = render(<SourcesChips sources={[{ url: 'javascript:alert(1)' }]} />);
    expect(container.firstChild).toBeNull();
  });

  it('opens each source in a new tab with noopener, deduplicated, with a localized label', () => {
    const { container, getByRole } = render(
      <SourcesChips
        locale="ka"
        sources={[
          { url: 'https://a.example/1', title: 'One' },
          { url: 'https://a.example/1', title: 'One again' },
          { url: 'https://b.example/2' },
        ]}
      />,
    );
    expect(getByRole('navigation', { name: 'წყაროები' })).toBeTruthy();
    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
      expect(a.querySelector('img')).toBeNull(); // favicon-less
    }
    expect(links[0]!.textContent).toContain('a.example');
    expect(links[0]!.textContent).toContain('One');
  });

  it('collapses past `max` behind a +N toggle', () => {
    const { container, getByRole } = render(<SourcesChips sources={many} locale="en" max={3} />);
    expect(container.querySelectorAll('a')).toHaveLength(3);
    fireEvent.click(getByRole('button', { name: '+5' }));
    expect(container.querySelectorAll('a')).toHaveLength(8);
    fireEvent.click(getByRole('button', { name: 'Less' }));
    expect(container.querySelectorAll('a')).toHaveLength(3);
  });
});
