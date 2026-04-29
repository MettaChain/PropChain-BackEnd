import { Injectable } from '@nestjs/common';

export interface DocumentVersion {
  versionNumber: number;
  fileUrl: string;
  updatedBy: string;
  updatedAt: string;
  changeNote?: string;
}

@Injectable()
export class DocumentVersionService {
  private readonly store = new Map<string, DocumentVersion[]>();

  addVersion(
    documentId: string,
    fileUrl: string,
    updatedBy: string,
    changeNote?: string,
  ): DocumentVersion {
    const existing = this.store.get(documentId) ?? [];
    const version: DocumentVersion = {
      versionNumber: existing.length + 1,
      fileUrl,
      updatedBy,
      updatedAt: new Date().toISOString(),
      changeNote,
    };
    this.store.set(documentId, [...existing, version]);
    return version;
  }

  getVersions(documentId: string): DocumentVersion[] {
    return this.store.get(documentId) ?? [];
  }

  getLatest(documentId: string): DocumentVersion | null {
    const versions = this.getVersions(documentId);
    return versions.length > 0 ? (versions[versions.length - 1] ?? null) : null;
  }
}
