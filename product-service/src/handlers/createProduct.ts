import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../db/dynamodb';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function isValidProductBody(body: unknown): body is { title: string; description?: string; price: number; count: number; image?: string } {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (!b.title || typeof b.title !== 'string' || b.title.trim() === '') return false;
  if (typeof b.price !== 'number' || b.price < 0) return false;
  if (typeof b.count !== 'number' || b.count < 0 || !Number.isInteger(b.count)) return false;
  if (b.image !== undefined && (typeof b.image !== 'string' || b.image.trim() === '')) return false;
  return true;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('createProduct event:', JSON.stringify(event));

  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Invalid JSON body' }),
    };
  }

  if (!isValidProductBody(body)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'Invalid product data. Required: title (string), price (number >= 0), count (integer >= 0)',
      }),
    };
  }

  const { title, description = '', price, count, image } = body;
  const id = crypto.randomUUID();

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: process.env.PRODUCTS_TABLE,
              Item: { id, title, description, price, ...(image ? { image } : {}) },
            },
          },
          {
            Put: {
              TableName: process.env.STOCKS_TABLE,
              Item: { product_id: id, count },
            },
          },
        ],
      }),
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ id, title, description, price, count, ...(image ? { image } : {}) }),
    };
  } catch (error) {
    console.error('createProduct error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
