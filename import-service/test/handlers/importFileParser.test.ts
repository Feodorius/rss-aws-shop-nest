import { S3Event } from 'aws-lambda';
import { Readable } from 'stream';
import { handler } from '../../src/handlers/importFileParser';
import { s3Client } from '../../src/db/s3';

jest.mock('../../src/db/s3', () => ({
  s3Client: { send: jest.fn() },
}));

const mockedSend = s3Client.send as jest.Mock;

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
  const mockStream = Readable.from([CSV_CONTENT]);
  mockedSend
    .mockResolvedValueOnce({ Body: mockStream })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({});
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('importFileParser', () => {
  it('should call GetObjectCommand with correct bucket and key', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    const getCall = mockedSend.mock.calls[0][0];
    expect(getCall.input).toMatchObject({
      Bucket: 'rss-aws-import-bucket',
      Key: 'uploaded/products.csv',
    });
  });

  it('should log each parsed CSV record', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    const parsedLogs = logSpy.mock.calls
      .map((args) => args[0] as string)
      .filter((msg) => msg === 'Parsed record:');
    expect(parsedLogs).toHaveLength(2);
    logSpy.mockRestore();
  });

  it('should copy file to parsed/ folder', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    const copyCall = mockedSend.mock.calls[1][0];
    expect(copyCall.input).toMatchObject({
      Bucket: 'rss-aws-import-bucket',
      CopySource: 'rss-aws-import-bucket/uploaded/products.csv',
      Key: 'parsed/products.csv',
    });
  });

  it('should delete file from uploaded/ folder after copying', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    const deleteCall = mockedSend.mock.calls[2][0];
    expect(deleteCall.input).toMatchObject({
      Bucket: 'rss-aws-import-bucket',
      Key: 'uploaded/products.csv',
    });
  });

  it('should process all records before moving file', async () => {
    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/products.csv'));
    expect(mockedSend).toHaveBeenCalledTimes(3);
  });

  it('should decode URL-encoded keys', async () => {
    const mockStream = Readable.from([CSV_CONTENT]);
    mockedSend
      .mockReset()
      .mockResolvedValueOnce({ Body: mockStream })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await handler(makeEvent('rss-aws-import-bucket', 'uploaded/my+products.csv'));
    const getCall = mockedSend.mock.calls[0][0];
    expect(getCall.input.Key).toBe('uploaded/my products.csv');
  });
});
