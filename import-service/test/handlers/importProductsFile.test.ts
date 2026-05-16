import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../src/handlers/importProductsFile';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('../../src/db/s3', () => ({
  s3Client: {},
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const mockGetSignedUrl = getSignedUrl as jest.Mock;
const MOCK_SIGNED_URL = 'https://s3.amazonaws.com/rss-aws-import-bucket/uploaded/test.csv?signature=abc';

beforeEach(() => {
  process.env.BUCKET_NAME = 'rss-aws-import-bucket';
  mockGetSignedUrl.mockResolvedValue(MOCK_SIGNED_URL);
});

afterEach(() => {
  jest.clearAllMocks();
});

const makeEvent = (params?: Record<string, string>): APIGatewayProxyEvent =>
  ({ queryStringParameters: params ?? null } as unknown as APIGatewayProxyEvent);

describe('importProductsFile', () => {
  it('should return 400 when name query parameter is missing', async () => {
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({ message: expect.any(String) });
  });

  it('should return 200 with signed URL when name is provided', async () => {
    const result = await handler(makeEvent({ name: 'products.csv' }));
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(MOCK_SIGNED_URL);
  });

  it('should call getSignedUrl with correct key', async () => {
    await handler(makeEvent({ name: 'products.csv' }));
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    const command = mockGetSignedUrl.mock.calls[0][1];
    expect(command.input.Key).toBe('uploaded/products.csv');
    expect(command.input.Bucket).toBe('rss-aws-import-bucket');
  });

  it('should include CORS header in response', async () => {
    const result = await handler(makeEvent({ name: 'products.csv' }));
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should return 500 when getSignedUrl throws', async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error('S3 error'));
    const result = await handler(makeEvent({ name: 'products.csv' }));
    expect(result.statusCode).toBe(500);
  });
});
