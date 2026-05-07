import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../db/dynamodb';
import { Product, Stock, ProductWithStock } from '../types/product';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('getProductsList event:', JSON.stringify(event));

  try {
    const [productsResult, stocksResult] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: process.env.PRODUCTS_TABLE })),
      docClient.send(new ScanCommand({ TableName: process.env.STOCKS_TABLE })),
    ]);

    const products = (productsResult.Items ?? []) as Product[];
    const stocks = (stocksResult.Items ?? []) as Stock[];

    const stockMap = new Map(stocks.map((s) => [s.product_id, s.count]));

    const productsWithStock: ProductWithStock[] = products.map((product) => ({
      ...product,
      count: stockMap.get(product.id) ?? 0,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(productsWithStock),
    };
  } catch (error) {
    console.error('getProductsList error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
