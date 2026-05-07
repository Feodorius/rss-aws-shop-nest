import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../src/handlers/getProductsList';
import { products } from '../../src/data/products';
import { docClient } from '../../src/db/dynamodb';

jest.mock('../../src/db/dynamodb', () => ({
  docClient: { send: jest.fn() },
}));

const mockedSend = docClient.send as jest.Mock;

beforeEach(() => {
  const mockProducts = products.map(({ count: _count, ...p }) => p);
  const mockStocks = products.map((p) => ({ product_id: p.id, count: p.count }));
  mockedSend
    .mockResolvedValueOnce({ Items: mockProducts })
    .mockResolvedValueOnce({ Items: mockStocks });
});

afterEach(() => {
  jest.clearAllMocks();
});

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

  it('should return 500 on DynamoDB error', async () => {
    mockedSend.mockReset();
    mockedSend.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler({} as APIGatewayProxyEvent);
    expect(result.statusCode).toBe(500);
  });
});
