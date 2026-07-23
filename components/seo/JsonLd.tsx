import type { ReactElement } from 'react';

/**
 * Server-rendered structured-data emitter (Iteration 5). Renders one
 * `<script type="application/ld+json">` holding the given schema object(s).
 *
 * `<` is escaped to `<` so no string value inside the JSON can ever close the script element early
 * (defense against `</script>` injection). Adds ZERO client JS and does NOT opt an ISR/static page out
 * of static rendering — safe to drop into any server component's JSX.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export default JsonLd;
