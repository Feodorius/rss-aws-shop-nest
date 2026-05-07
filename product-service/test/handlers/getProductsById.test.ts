import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../src/handlers/getProductsById';
import { products } from '../../src/data/products';
import { docClient } from '../../src/db/dynamodb';

jest.mock('../../src/db/dynamodb', () => ({
  docClient: { send: jest.fn() },
}));

const mockedSend = docClient.send as jest.Mock;

const makeEvent = (productId: string | undefined): APIGatewayProxyEvent =>
  ({ pathParameters: productId ? { productId } : null } as unknown as APIGatewayProxyEvent);

afterEach(() => {
  jest.clearAllMocks();
});

describe('getProductsById', () => {
  it('should return status 200 for an existing product', async () => {
    const { count, ...product } = products[0];
    mockedSend
      .mockResolvedValueOnce({ Item: product })
      .mockResolvedValueOnce({ Item: { product_id: product.id, count } });
    const result = await handler(makeEvent(product.id));
    expect(result.statusCode).toBe(200);
  });

  it('should return the correct product', async () => {
    const expected = products[0];
    const { count, ...product } = expected;
    mockedSend
      .mockResolvedValueOnce({ Item: product })
      .mockResolvedValueOnce({ Item: { product_id: product.id, count } });
    const result = await handler(makeEvent(expected.id));
    const body = JSON.parse(result.body);
    expect(body).toEqual(expected);
  });

  it('should return status 404 for a non-existing product', async () => {
    mockedSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Item: undefined });
    const result = await handler(makeEvent('non-existing-id'));
    expect(result.statusCode).toBe(404);
  });

  it('should return an error message for a non-existing product', async () => {
    mockedSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Item: undefined });
    const result = await handler(makeEvent('non-existing-id'));
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('message');
  });

  it('should include CORS header', async () => {
    const { count, ...product } = products[0];
    mockedSend
      .mockResolvedValueOnce({ Item: product })
      .mockResolvedValueOnce({ Item: { product_id: product.id, count } });
    const result = await handler(makeEvent(products[0].id));
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should return 500 on DynamoDB error', async () => {
    mockedSend.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent(products[0].id));
    expect(result.statusCode).toBe(500);
  });
});
