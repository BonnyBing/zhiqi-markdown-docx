import JSZip from 'jszip';

export type DocxInspection = {
  readonly names: readonly string[];
  readonly contentTypes: string;
  readonly documentXml: string;
  readonly rels: string;
  readonly media: readonly string[];
};

export const inspectDocx = async (buffer: Buffer): Promise<DocxInspection> => {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  const read = async (name: string): Promise<string> =>
    (await zip.file(name)?.async('string')) ?? '';
  return {
    names,
    contentTypes: await read('[Content_Types].xml'),
    documentXml: await read('word/document.xml'),
    rels: await read('word/_rels/document.xml.rels'),
    media: names.filter((name) => name.startsWith('word/media/')),
  };
};
