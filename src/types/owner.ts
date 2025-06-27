export interface OwnerDataRequest {
  name: string;
  email: string;
  password: string;
  avatar?: string;
  about: string;
  occupation: string;
  birthDate: Date;
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
  token?: string
}