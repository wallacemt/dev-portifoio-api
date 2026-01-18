export interface BadgeAddRequest {
  title: string;
  description: string;
  imageUrl: string;
  issuer: string;
  issueDate: Date;
  badgeUrl?: string;
  ownerId: string;
}

export type BadgeUpdate = Partial<Omit<BadgeAddRequest, "ownerId">>;

export interface Badge {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  issuer: string;
  issueDate: Date;
  badgeUrl?: string;
  ownerId: string;
  createdAt: Date;
}

export interface CertificationAddRequest {
  title: string;
  description: string;
  issuer: string;
  issueDate: Date;
  expirationDate?: Date;
  credentialId?: string;
  credentialUrl: string;
  certificateFile?: string;
  ownerId: string;
}

export type CertificationUpdate = Partial<Omit<CertificationAddRequest, "ownerId">>;

export interface Certification {
  id: string;
  title: string;
  description: string;
  issuer: string;
  issueDate: Date;
  expirationDate?: Date;
  credentialId?: string;
  credentialUrl: string;
  certificateFile?: string;
  ownerId: string;
  createdAt: Date;
}
