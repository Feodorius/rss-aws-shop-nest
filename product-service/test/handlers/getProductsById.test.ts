import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../src/handlers/getProductsById';
import { products } from '../../src/data/products';

const makeEvent = (productId: string | undefined): APIGatewayProxyEvent =>
  ({ pathParameters: productId ? { productId } : null } as unknown as APIGatewayProxyEvent);

describe('getProductsById', () => {
  it('should return status 200 for an existing product', async () => {
    const existingId = products[0].id;
    const result = await handler(makeEvent(existingId));
    expect(result.statusCode).toBe(200);
  });

  it('should return the correct product', async () => {
    const expected = products[0];
    const result = await handler(makeEvent(expected.id));
    const body = JSON.parse(result.body);
    expect(body).toEqual(expected);
  });

  it('should return status 404 for a non-existing product', async () => {
    const result = await handler(makeEvent('non-existing-id'));
    expect(result.statusCode).toBe(404);
  });

  it('should return an error message for a non-existing product', async () => {
    const result = await handler(makeEvent('non-existing-id'));
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('message');
  });

  it('should include CORS header', async () => {
    const result = await handler(makeEvent(products[0].id));
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});
