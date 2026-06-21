export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  /**
   * URL of the product image. Stored alongside the rest of the product model
   * in DynamoDB so the frontend never has to invent it. Optional because rows
   * created before this field existed don't carry one.
   */
  image?: string;
}

export interface Stock {
  product_id: string;
  count: number;
}

export interface ProductWithStock extends Product {
  count: number;
}
