import { S3Event } from 'aws-lambda';
import { GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { Readable } from 'stream';
import csv from 'csv-parser';
import { s3Client } from '../db/s3';
import { sqsClient } from '../db/sqs';

const REQUIRED_FIELDS = ['title', 'price', 'count'];

function isValidRecord(record: Record<string, string>): boolean {
  return REQUIRED_FIELDS.every((field) => record[field] !== undefined && record[field] !== '');
}

export const handler = async (event: S3Event): Promise<void> => {
  console.log('importFileParser event:', JSON.stringify(event));

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing file: ${key} from bucket: ${bucket}`);

    const getResponse = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

    if (!getResponse.Body) {
      throw new Error(`Empty body for object ${key}`);
    }

    const validRecords: Record<string, string>[] = [];

    await new Promise<void>((resolve, reject) => {
      (getResponse.Body as Readable)
        .pipe(csv())
        .on('data', (data: Record<string, string>) => {
          if (!isValidRecord(data)) {
            console.warn('Skipping invalid record (missing required fields):', JSON.stringify(data));
            return;
          }
          validRecords.push(data);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    for (const csvRecord of validRecords) {
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: process.env.SQS_QUEUE_URL!,
          MessageBody: JSON.stringify(csvRecord),
        }),
      );
    }

    const parsedKey = key.replace('uploaded/', 'parsed/');

    await s3Client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${key}`,
        Key: parsedKey,
      }),
    );

    await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

    console.log(`Moved ${key} → ${parsedKey}`);
  }
};
