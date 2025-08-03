export interface ServiceAddRequest {
  description: string;
  icon: string;
  category: string;
  complexity: string;
  deliveryTime: string;
  priceMin: number;
  priceMax: number;
  currency: string;
}

export interface Service {
  id: string;
  sId: string;
  title: string;
  description: string;
  category: string;
  complexity: string;
  deliveryTime: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
}
