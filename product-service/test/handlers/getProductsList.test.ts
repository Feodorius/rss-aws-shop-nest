import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../src/handlers/getProductsList';
import { products } from '../../src/data/products';

describe('getProductsList', () => {
  it('should return status 200', async () => {
    const result = await handler({} as APIGatewayProxyEvent);
    expect(result.statusCode).toBe(200);
  });

  it('should return all products as JSON array', async () => {
    const result = await handler({} as APIGatewayProxyEvent);
    const body = JSON.parse(result.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(products.length);
  });

  it('should include CORS header', async () => {
    const result = await handler({} as APIGatewayProxyEvent);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should return products with required fields', async () => {
    const result = await handler({} as APIGatewayProxyEvent);
    const body = JSON.parse(result.body);
    body.forEach((product: { id: unknown; title: unknown; description: unknown; price: unknown; count: unknown }) => {
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('title');
      expect(product).toHaveProperty('description');
      expect(product).toHaveProperty('price');
      expect(product).toHaveProperty('count');
    });
  });
});
