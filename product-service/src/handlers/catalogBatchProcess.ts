import { SQSEvent } from 'aws-lambda';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand } from '@aws-sdk/client-sns';
import { docClient } from '../db/dynamodb';
import { snsClient } from '../db/sns';

export const handler = async (event: SQSEvent): Promise<void> => {
  console.log('catalogBatchProcess event:', JSON.stringify(event));

  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const { title, description = '', price, count } = body;
    const id = crypto.randomUUID();
    const numericPrice = Number(price);
    const numericCount = Number(count);

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: process.env.PRODUCTS_TABLE!,
              Item: { id, title, description, price: numericPrice },
            },
          },
          {
            Put: {
              TableName: process.env.STOCKS_TABLE!,
              Item: { product_id: id, count: numericCount },
            },
          },
        ],
      }),
    );

    await snsClient.send(
      new PublishCommand({
        TopicArn: process.env.SNS_TOPIC_ARN!,
        Subject: 'New product created',
        Message: JSON.stringify({ id, title, description, price: numericPrice, count: numericCount }),
        MessageAttributes: {
          price: {
            DataType: 'Number',
            StringValue: String(numericPrice),
          },
        },
      }),
    );
  }
};
