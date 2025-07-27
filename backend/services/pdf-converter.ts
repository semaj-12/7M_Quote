import pdf2pic from 'pdf2pic';
import path from 'path';
import fs from 'fs';

export interface PdfToImageOptions {
  density?: number;
  saveFilename?: string;
  savePath?: string;
  format?: 'png' | 'jpeg';
  width?: number;
  height?: number;
}

export async function convertPdfToImages(pdfPath: string, options: PdfToImageOptions = {}) {
  const {
    density = 200,
    format = 'png',
    width = 1200,
    height = 1600
  } = options;

  try {
    const convert = pdf2pic.fromPath(pdfPath, {
      density,
      saveFilename: options.saveFilename || "page",
      savePath: options.savePath || path.join(path.dirname(pdfPath), 'images'),
      format,
      width,
      height
    });

    // Convert all pages
    const results = await convert.bulk(-1, {
      responseType: "image"
    });

    return results;
  } catch (error) {
    console.error('PDF to image conversion failed:', error);
    throw new Error('Failed to convert PDF to images');
  }
}

export async function convertPdfPageToImage(pdfPath: string, pageNumber: number = 1, options: PdfToImageOptions = {}) {
  const {
    density = 200,
    format = 'png',
    width = 1200,
    height = 1600
  } = options;

  try {
    const convert = pdf2pic.fromPath(pdfPath, {
      density,
      format,
      width,
      height
    });

    const result = await convert(pageNumber, {
      responseType: "image"
    });

    return result;
  } catch (error) {
    console.error('PDF page conversion failed:', error);
    throw new Error('Failed to convert PDF page to image');
  }
}