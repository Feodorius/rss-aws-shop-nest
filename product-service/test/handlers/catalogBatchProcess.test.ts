import { SQSEvent, SQSRecord } from 'aws-lambda';
import { handler } from '../../src/handlers/catalogBatchProcess';
import { docClient } from '../../src/db/dynamodb';
import { snsClient } from '../../src/db/sns';

jest.mock('../../src/db/dynamodb', () => ({
  docClient: { send: jest.fn() },
}));

jest.mock('../../src/db/sns', () => ({
  snsClient: { send: jest.fn() },
}));

const mockedDocClientSend = docClient.send as jest.Mock;
const mockedSnsClientSend = snsClient.send as jest.Mock;

const SNS_TOPIC_ARN = 'test-topic-arn';
const PRODUCTS_TABLE = 'products';
const STOCKS_TABLE = 'stocks';

function makeSqsEvent(records: object[]): SQSEvent {
  return {
    Records: records.map((body, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `rh-${i}`,
      body: JSON.stringify(body),
      attributes: {} as SQSRecord['attributes'],
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:eu-north-1:123456789012:catalogItemsQueue',
      awsRegion: 'eu-north-1',
    })),
  };
}

beforeEach(() => {
  process.env.PRODUCTS_TABLE = PRODUCTS_TABLE;
  process.env.STOCKS_TABLE = STOCKS_TABLE;
  process.env.SNS_TOPIC_ARN = SNS_TOPIC_ARN;
  mockedDocClientSend.mockResolvedValue({});
  mockedSnsClientSend.mockResolvedValue({});
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('catalogBatchProcess', () => {
  it('creates a product and stock record in DynamoDB for each SQS message', async () => {
    const event = makeSqsEvent([{ title: 'Widget', description: 'A widget', price: 50, count: 10 }]);

    await handler(event);

    expect(mockedDocClientSend).toHaveBeenCalledTimes(1);
    const command = mockedDocClientSend.mock.calls[0][0];
    const items = command.input.TransactItems;
    expect(items[0].Put.TableName).toBe(PRODUCTS_TABLE);
    expect(items[0].Put.Item).toMatchObject({ title: 'Widget', description: 'A widget', price: 50 });
    expect(items[1].Put.TableName).toBe(STOCKS_TABLE);
    expect(items[1].Put.Item).toMatchObject({ count: 10 });
  });

  it('publishes an SNS notification for each created product', async () => {
    const event = makeSqsEvent([{ title: 'Widget', price: 50, count: 10 }]);

    await handler(event);

    expect(mockedSnsClientSend).toHaveBeenCalledTimes(1);
    const command = mockedSnsClientSend.mock.calls[0][0];
    expect(command.input.TopicArn).toBe(SNS_TOPIC_ARN);
    expect(command.input.MessageAttributes.price.StringValue).toBe('50');
    const message = JSON.parse(command.input.Message);
    expect(message).toMatchObject({ title: 'Widget', price: 50, count: 10 });
  });

  it('processes all records in a batch', async () => {
    const event = makeSqsEvent([
      { title: 'Widget A', price: 50, count: 5 },
      { title: 'Widget B', price: 200, count: 3 },
      { title: 'Widget C', price: 10, count: 100 },
    ]);

    await handler(event);

    expect(mockedDocClientSend).toHaveBeenCalledTimes(3);
    expect(mockedSnsClientSend).toHaveBeenCalledTimes(3);
  });

  it('converts string price and count from CSV to numbers', async () => {
    const event = makeSqsEvent([{ title: 'Widget', price: '99.99', count: '7' }]);

    await handler(event);

    const dbCommand = mockedDocClientSend.mock.calls[0][0];
    expect(dbCommand.input.TransactItems[0].Put.Item.price).toBe(99.99);
    expect(dbCommand.input.TransactItems[1].Put.Item.count).toBe(7);

    const snsCommand = mockedSnsClientSend.mock.calls[0][0];
    expect(snsCommand.input.MessageAttributes.price.StringValue).toBe('99.99');
  });

  it('uses the default empty string for description when not provided', async () => {
    const event = makeSqsEvent([{ title: 'Widget', price: 10, count: 1 }]);

    await handler(event);

    const dbCommand = mockedDocClientSend.mock.calls[0][0];
    expect(dbCommand.input.TransactItems[0].Put.Item.description).toBe('');
  });

  it('assigns a unique id to each product', async () => {
    const event = makeSqsEvent([
      { title: 'Widget A', price: 10, count: 1 },
      { title: 'Widget B', price: 20, count: 2 },
    ]);

    await handler(event);

    const idA = mockedDocClientSend.mock.calls[0][0].input.TransactItems[0].Put.Item.id;
    const idB = mockedDocClientSend.mock.calls[1][0].input.TransactItems[0].Put.Item.id;
    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idA).not.toBe(idB);
  });

  it('throws if DynamoDB fails', async () => {
    mockedDocClientSend.mockRejectedValueOnce(new Error('DynamoDB error'));
    const event = makeSqsEvent([{ title: 'Widget', price: 10, count: 1 }]);

    await expect(handler(event)).rejects.toThrow('DynamoDB error');
  });

  it('throws if SNS publish fails', async () => {
    mockedSnsClientSend.mockRejectedValueOnce(new Error('SNS error'));
    const event = makeSqsEvent([{ title: 'Widget', price: 10, count: 1 }]);

    await expect(handler(event)).rejects.toThrow('SNS error');
  });

  it('sends SNS message with price attribute for high-priced product', async () => {
    const event = makeSqsEvent([{ title: 'Premium Widget', price: 250, count: 1 }]);

    await handler(event);

    const command = mockedSnsClientSend.mock.calls[0][0];
    expect(Number(command.input.MessageAttributes.price.StringValue)).toBeGreaterThan(100);
  });
});
