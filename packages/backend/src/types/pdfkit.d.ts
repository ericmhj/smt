declare module 'pdfkit' {
  import { Readable } from 'node:stream';

  interface PDFDocumentOptions {
    margin?: number;
    size?: string | [number, number];
    layout?: 'portrait' | 'landscape';
  }

  class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);
    fontSize(size: number): this;
    font(name: string): this;
    text(text: string, options?: Record<string, unknown>): this;
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): this;
    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    end(): void;
    y: number;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  export default PDFDocument;
}
