/**
 * lib/files/fileProcessor.ts
 * ===========================
 * Safe file parsing, token budget control, injection prevention.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_EXTRACTED_CHARS = 32000; // ~8K tokens
const DANGEROUS_PATTERNS = [
  /ignore previous instructions/i,
  /you are now/i,
  /system:\s/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<<SYS>>/i,
];

export interface ProcessedFile {
  name: string;
  type: string;
  content: string;
  tokens: number;
  safe: boolean;
  warnings: string[];
}

export interface FileProcessorOptions {
  maxSize?: number;
  maxChars?: number;
  sanitize?: boolean;
}

/**
 * Process a file buffer into extractable text content.
 */
export async function processFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  options: FileProcessorOptions = {},
): Promise<ProcessedFile> {
  const maxSize = options.maxSize || MAX_FILE_SIZE;
  const maxChars = options.maxChars || MAX_EXTRACTED_CHARS;
  const sanitize = options.sanitize !== false;
  const warnings: string[] = [];

  // Size check
  if (buffer.length > maxSize) {
    return {
      name: filename,
      type: mimeType,
      content: '',
      tokens: 0,
      safe: false,
      warnings: [`File exceeds max size: ${buffer.length} > ${maxSize}`],
    };
  }

  let content = '';

  // Extract text based on type
  if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
    content = buffer.toString('utf-8');
  } else if (mimeType === 'application/json') {
    try {
      const parsed = JSON.parse(buffer.toString('utf-8'));
      content = JSON.stringify(parsed, null, 2);
    } catch {
      content = buffer.toString('utf-8');
      warnings.push('JSON parse failed, using raw text');
    }
  } else if (mimeType === 'application/pdf') {
    // Basic PDF text extraction — read text between stream markers
    const raw = buffer.toString('latin1');
    const textParts: string[] = [];
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let match: RegExpExecArray | null;
    while ((match = streamRegex.exec(raw)) !== null) {
      // Extract printable ASCII-ish text
      const captured = match[1]!; // eslint-disable-line
      const chunk = captured.replace(/[^\x20-\x7E\n\r]/g, ' ').trim();
      if (chunk.length > 10) textParts.push(chunk);
    }
    content = textParts.join('\n\n') || '[PDF content could not be extracted — consider using OCR]';
    if (content.length < 50) warnings.push('PDF extraction yielded minimal text');
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    // Basic DOCX text extraction (from XML content)
    const raw = buffer.toString('utf-8');
    const textParts: string[] = [];
    const tagRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
    let matchDoc: RegExpExecArray | null;
    while ((matchDoc = tagRegex.exec(raw)) !== null) {
      const text = matchDoc[1]!; // eslint-disable-line
      if (text) textParts.push(text);
    }
    content = textParts.join(' ') || '[Document content could not be extracted]';
  } else if (mimeType.startsWith('image/')) {
    // For images, encode as base64 summary (actual vision would use GPT-4V)
    content = `[Image: ${filename}, ${mimeType}, ${buffer.length} bytes]`;
    warnings.push('Image uploaded — use with vision-capable model for analysis');
  } else {
    content = `[Unsupported file type: ${mimeType}]`;
    warnings.push(`Unsupported mime type: ${mimeType}`);
  }

  // Truncate to budget
  if (content.length > maxChars) {
    content = content.slice(0, maxChars) + '\n\n[...truncated to token budget]';
    warnings.push(`Content truncated from ${content.length} to ${maxChars} chars`);
  }

  // Injection prevention
  let safe = true;
  if (sanitize) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        warnings.push(`Potential injection detected: ${pattern.source}`);
        safe = false;
        // Don't strip — just flag. The chatEngine system prompt takes precedence.
        break;
      }
    }
  }

  const tokens = Math.ceil(content.length / 4);

  return { name: filename, type: mimeType, content, tokens, safe, warnings };
}

/**
 * Generate a signed URL placeholder (integrate with R2/S3 in production).
 */
export function generateSignedUrl(path: string, expiry: number = 3600): string {
  const base = process.env.NEXT_PUBLIC_STORAGE_URL || 'https://storage.myavatar.ge';
  const expires = Date.now() + expiry * 1000;
  // In production, use actual R2/S3 pre-signed URL generation
  return `${base}/${path}?expires=${expires}&sig=placeholder`;
}
