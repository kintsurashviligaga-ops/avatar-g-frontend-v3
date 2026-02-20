import PDFDocument from 'pdfkit';
import type { AgentGAggregatedResult } from '@/lib/agent-g/types';

function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export async function renderPdf(goal: string, result: AgentGAggregatedResult): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 42 });

  const stream = doc as unknown as NodeJS.ReadableStream;
  doc.fontSize(18).text('Agent G Unified Output', { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(`Goal: ${goal}`);
  doc.moveDown();
  doc.fontSize(11).text(result.summary);
  doc.moveDown();

  result.subtasks.forEach((subtask, idx) => {
    doc.fontSize(12).text(`${idx + 1}. ${subtask.agent} / ${subtask.action}`);
    doc.fontSize(10).text(`Status: ${subtask.status}`);
    if (subtask.error) {
      doc.fontSize(10).text(`Error: ${subtask.error}`);
    }
    doc.fontSize(9).text(JSON.stringify(subtask.output || {}, null, 2));
    doc.moveDown();
  });

  doc.end();
  return toBuffer(stream);
}

export async function renderZipPackage(goal: string, result: AgentGAggregatedResult): Promise<Buffer> {
  const files: Array<{ name: string; content: Buffer }> = [
    { name: 'summary.txt', content: Buffer.from(result.summary, 'utf8') },
    { name: 'report.md', content: Buffer.from(result.markdown, 'utf8') },
    {
      name: 'meta.json',
      content: Buffer.from(JSON.stringify({ goal, generated_at: new Date().toISOString(), outputs: result.outputs }, null, 2), 'utf8'),
    },
  ];

  result.subtasks.forEach((subtask, index) => {
    files.push({
      name: `subtasks/${index + 1}-${subtask.agent}.json`,
      content: Buffer.from(JSON.stringify(subtask, null, 2), 'utf8'),
    });
  });

  return createUncompressedZip(files);
}

function createUncompressedZip(files: Array<{ name: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = file.content;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localData.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralDirectory, end]);
}
