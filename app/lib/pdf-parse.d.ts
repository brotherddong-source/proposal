declare module 'pdf-parse/lib/pdf-parse' {
  function pdfParse(
    dataBuffer: Buffer,
    options?: object
  ): Promise<{ text: string; numpages: number; info: object }>;
  export default pdfParse;
}
