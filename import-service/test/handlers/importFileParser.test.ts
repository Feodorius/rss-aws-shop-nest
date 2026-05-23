import { S3Event } from 'aws-lambda';
import { Readable } from 'stream';
import { handler } from '../../src/handlers/importFileParser';
import { s3Client } from '../../src/db/s3';
import { sqsClient } from '../../src/db/sqs';

jest.mock('../../src/db/s3', () => ({
  s3Client: { send: jest.fn() },
}));

jest.mock('../../src/db/sqs', () => ({
  sqsClient: { send: jest.fn() },
}));

const mockedS3Send = s3Client.send as jest.Mock;
const mockedSqsSend = sqsClient.send as jest.Mock;

const CSV_CONTENT =
  'id,title,description,price,count\n' +
  '1,Product 1,Description 1,10,5\n' +
  '2,Product 2,Description 2,20,3\n';

const makeEvent = (bucket: string, key: string): S3Event =>
  ({
    Records: [
      {
        s3: {
          bucket: { name: bucket },
          object: { key },
        },
      },
    ],
  }) as unknown as S3Event;

beforeEach(() => {
  process.env.SQS_QUEUE_URL = 'https://sqs.eu-north-1.amazonaws.com/123456789012/catalogItemsQueue';
  const mockStream = Readable.from([CSV_CONTENT]);
  mockedS3Send
    .mockResolvedValueOnce({ Body: mockStream })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({});
  mockedSqsSend.mockResolvedValue({});
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('importFileParser', () => {
  it('should call GetObjectCommand with correct bucket and key', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    const getCall = mockedS3Send.mock.calls[0][0];
    expect(getCall.input).toMatchObject({
      Bucket: 'rss-aws-import-bucket',
      Key: 'uploaded/products.csv',
    });
  });

  it('should send each parsed CSV record to SQS', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    expect(mockedSqsSend).toHaveBeenCalledTimes(2);
    const firstMessage = JSON.parse(mockedSqsSend.mock.calls[0][0].input.MessageBody);
    expect(firstMessage).toMatchObject({ title: 'Product 1', price: '10', count: '5' });
  });

  it('should copy file to parsed/ folder', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    const copyCall = mockedS3Send.mock.calls[1][0];
    expect(copyCall.input).toMatchObject({
      Bucket: 'rss-aws-import-bucket',
      CopySource: 'rss-aws-import-bucket/uploaded/products.csv',
      Key: 'parsed/products.csv',
    });
  });

  it('should delete file from uploaded/ folder after copying', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    const deleteCall = mockedS3Send.mock.calls[2][0];
    expect(deleteCall.input).toMatchObject({
      Bucket: 'rss-aws-import-bucket',
      Key: 'uploaded/products.csv',
    });
  });

  it('should process all records before moving file', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    expect(mockedS3Send).toHaveBeenCalledTimes(3);
  });

  it('should decode URL-encoded keys', async () => {
    const mockStream = Readable.from([CSV_CONTENT]);
    mockedS3Send
      .mockReset()
      .mockResolvedValueOnce({ Body: mockStream })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/my+products.csv'));
    const getCall = mockedS3Send.mock.calls[0][0];
    expect(getCall.input.Key).toBe('uploaded/my products.csv');
  });
});
