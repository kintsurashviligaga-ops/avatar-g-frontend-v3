import { parseServiceBlock, hasServiceBlock, stripDanglingServiceBlock } from './serviceBlocks';

describe('parseServiceBlock — intercept a hallucinated { "service": … } routing JSON', () => {
  it('strips a fenced ```json service block and extracts service + prompt', () => {
    const raw = 'Sure, creating that now:\n\n```json\n{ "service": "image", "prompt": "a red fox in snow" }\n```';
    const r = parseServiceBlock(raw);
    expect(r.service).toBe('image');
    expect(r.prompt).toBe('a red fox in snow');
    expect(r.text).toBe('Sure, creating that now:');
    expect(r.text).not.toMatch(/service|\{|\}|```/); // no raw JSON leaks
  });

  it('removes the WHOLE fence (nested objects, comments, trailing fields) — never a broken half-fence', () => {
    const raw = 'One moment:\n```json\n{\n  "service": "image",\n  "prompt": "fox",\n  "params": { "w": 1024 }\n}\n// this is how you call it\n```\n\nThanks!';
    const r = parseServiceBlock(raw);
    expect(r.service).toBe('image');
    expect(r.prompt).toBe('fox');
    expect(r.text).not.toMatch(/```|\{|\}|params|how you call/); // the entire fence is gone, no orphaned comment/fence
    expect(r.text).toContain('One moment:');
    expect(r.text).toContain('Thanks!');
  });

  it('strips a BARE (unfenced) flat service object', () => {
    const r = parseServiceBlock('{ "service": "video", "description": "a city timelapse" }');
    expect(r.service).toBe('video');
    expect(r.prompt).toBe('a city timelapse');
    expect(r.text).toBe('');
  });

  it('accepts alternate prompt field names (description / query / subject)', () => {
    expect(parseServiceBlock('{"service":"image","subject":"a cat"}').prompt).toBe('a cat');
    expect(parseServiceBlock('{"service":"music","query":"jazz"}').prompt).toBe('jazz');
  });

  it('returns service with a null prompt when the block has no subject field', () => {
    const r = parseServiceBlock('```json\n{ "service": "image" }\n```');
    expect(r.service).toBe('image');
    expect(r.prompt).toBeNull();
    expect(r.text).toBe('');
  });

  it('leaves ordinary prose (and unrelated JSON) untouched', () => {
    expect(parseServiceBlock('Here is a normal answer.')).toEqual({ text: 'Here is a normal answer.', service: null, prompt: null });
    const other = parseServiceBlock('```json\n{ "name": "Gaga", "age": 30 }\n```');
    expect(other.service).toBeNull();
    expect(other.text).toContain('"name": "Gaga"');
  });

  it('ignores an unknown service value', () => {
    expect(parseServiceBlock('{ "service": "banana", "prompt": "x" }').service).toBeNull();
  });

  it('does NOT bridge across an EARLIER unrelated code fence (only strips the service fence) (re-review fix)', () => {
    const raw = 'Example:\n```js\nconst client = new Client();\n```\nThen call:\n```json\n{ "service": "image", "size": 512 }\n```';
    const r = parseServiceBlock(raw);
    expect(r.service).toBe('image');
    expect(r.text).toContain('const client = new Client()'); // the JS example is preserved
    expect(r.text).toContain('```js');
    expect(r.text).not.toMatch(/"service"/); // only the routing fence is gone
  });

  it('hasServiceBlock is a cheap correct pre-check', () => {
    expect(hasServiceBlock('{ "service": "image" }')).toBe(true);
    expect(hasServiceBlock('{"service":"music"}')).toBe(true);
    expect(hasServiceBlock('just talking about a service here')).toBe(false);
    expect(hasServiceBlock('')).toBe(false);
  });
});

describe('stripDanglingServiceBlock — display-only strip (dominance + mid-stream)', () => {
  it('strips a complete block only when it DOMINATES the reply (short residual)', () => {
    expect(stripDanglingServiceBlock('Creating:\n```json\n{ "service": "image", "prompt": "fox" }\n```')).toBe('Creating:');
  });

  it('KEEPS a long teaching answer that merely contains an example service block (never corrupts it)', () => {
    const long = 'Our platform routes generation itself, so you never send JSON. But for reference, the internal '
      + 'shape used to look like this in older SDKs, and here is a thorough explanation of each field and why it '
      + 'exists and how the router consumes it before dispatching to a worker queue:\n```json\n{ "service": "image", "prompt": "x" }\n```';
    expect(long.length).toBeGreaterThan(200);
    expect(stripDanglingServiceBlock(long)).toBe(long); // untouched — the block does NOT dominate
  });

  it('hides a still-streaming PARTIAL routing block so raw JSON never flashes', () => {
    expect(stripDanglingServiceBlock('Sure:\n```json\n{ "service": "im')).toBe('Sure:');
    expect(stripDanglingServiceBlock('Sure:\n{ "service": "image", "prompt": "a fo')).toBe('Sure:');
  });

  it('leaves prose with no routing block alone', () => {
    expect(stripDanglingServiceBlock('Just a normal answer.')).toBe('Just a normal answer.');
  });

  it('NEVER deletes a COMPLETE non-media JSON whose key happens to be "service" (+ trailing prose) (re-review fix)', () => {
    const cfg = 'To expose it, add:\n{ "service": "auth", "port": 80 }\nThen restart the pod.';
    expect(stripDanglingServiceBlock(cfg)).toBe(cfg); // the config object AND the trailing instruction survive
    expect(stripDanglingServiceBlock('{ "service": "banana", "port": 8080 }')).toBe('{ "service": "banana", "port": 8080 }');
    const inline = 'Here is a snippet: { "service": "auth" } which configures the gateway and explains the setup.';
    expect(stripDanglingServiceBlock(inline)).toBe(inline);
  });

  it('KEEPS a long answer whose fenced example uses a non-media "service" value', () => {
    const long = 'Our k8s manifest exposes the deployment through a Service resource; here is a complete, thoroughly '
      + 'annotated example you can copy verbatim into your cluster and then apply with kubectl to wire everything up:\n'
      + '```yaml\n{ "service": "auth", "port": 8080, "replicas": 3 }\n```\nThat is the config.';
    expect(stripDanglingServiceBlock(long)).toBe(long); // complete object → never stripped
  });
});
