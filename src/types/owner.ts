export interface OwnerDataRequest {
  name: string;
  email: string;
  password: string;
  avatar?: string;
  about: string;
  occupation: string;
  birthDate: Date;
  cvLinkPT?: string;
  cvLinkEN?: string;
}

export type OwnerDataOptionalRequest = Partial<OwnerDataRequest>;

export interface OwnerDataResponse {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  about: string;
  occupation: string;
  birthDate: Date;
  cvLinkPT: string | null;
  cvLinkEN: string | null;
  token?: string;
}
