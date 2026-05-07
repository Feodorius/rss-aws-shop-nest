import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { products } from '../src/data/products';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-north-1' });
const docClient = DynamoDBDocumentClient.from(client);

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || 'products';
const STOCKS_TABLE = process.env.STOCKS_TABLE || 'stocks';

async function fillTables() {
  console.log(`Filling tables: ${PRODUCTS_TABLE}, ${STOCKS_TABLE}`);

  for (const { count, ...product } of products) {
    await docClient.send(new PutCommand({ TableName: PRODUCTS_TABLE, Item: product }));
    await docClient.send(new PutCommand({ TableName: STOCKS_TABLE, Item: { product_id: product.id, count } }));
    console.log(`  Inserted: ${product.title} (count: ${count})`);
  }

  console.log('Done!');
}

fillTables().catch((err) => {
  console.error('Fill failed:', err);
  process.exit(1);
});
