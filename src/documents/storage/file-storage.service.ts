import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FileStorageService {
  private basePath = path.join(process.cwd(), 'uploads', 'documents');

  async saveFile(documentId: string, version: number, file: Express.Multer.File): Promise<string> {
    const docFolder = path.join(this.basePath, documentId);

    if (!fs.existsSync(docFolder)) {
      fs.mkdirSync(docFolder, { recursive: true });
    }

    const fileName = `v${version}_${file.originalname}`;
    const fullPath = path.join(docFolder, fileName);

    fs.writeFileSync(fullPath, file.buffer);

    return fullPath;
  }

  async deleteDocumentFolder(documentId: string) {
    const docFolder = path.join(this.basePath, documentId);
    if (fs.existsSync(docFolder)) {
      fs.rmSync(docFolder, { recursive: true, force: true });
    }
  }
}
