import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../db/dynamodb';
import { Product, Stock } from '../types/product';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('getProductsById event:', JSON.stringify(event));

  const productId = event.pathParameters?.productId;

  try {
    const [productResult, stockResult] = await Promise.all([
      docClient.send(new GetCommand({
        TableName: process.env.PRODUCTS_TABLE,
        Key: { id: productId },
      })),
      docClient.send(new GetCommand({
        TableName: process.env.STOCKS_TABLE,
        Key: { product_id: productId },
      })),
    ]);

    if (!productResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: `Product with id "${productId}" not found` }),
      };
    }

    const product = productResult.Item as Product;
    const stock = stockResult.Item as Stock | undefined;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ...product, count: stock?.count ?? 0 }),
    };
  } catch (error) {
    console.error('getProductsById error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
