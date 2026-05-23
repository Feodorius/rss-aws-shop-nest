import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class ProductServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: 'products',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const stocksTable = new dynamodb.Table(this, 'StocksTable', {
      tableName: 'stocks',
      partitionKey: { name: 'product_id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const catalogItemsQueue = new sqs.Queue(this, 'CatalogItemsQueue', {
      queueName: 'catalogItemsQueue',
    });

    const createProductTopic = new sns.Topic(this, 'CreateProductTopic', {
      topicName: 'createProductTopic',
    });

    const emailPrimary = ssm.StringParameter.valueFromLookup(this, '/shop/sns-email-primary');
    const emailFiltered = ssm.StringParameter.valueFromLookup(this, '/shop/sns-email-filtered');

    createProductTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(emailPrimary),
    );

    createProductTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(emailFiltered, {
        filterPolicy: {
          price: sns.SubscriptionFilter.numericFilter({
            greaterThan: 100,
          }),
        },
      }),
    );

    const commonEnv = {
      PRODUCTS_TABLE: productsTable.tableName,
      STOCKS_TABLE: stocksTable.tableName,
    };

    const getProductsList = new NodejsFunction(this, 'GetProductsListFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/handlers/getProductsList.ts'),
      environment: commonEnv,
    });

    const getProductsById = new NodejsFunction(this, 'GetProductsByIdFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/handlers/getProductsById.ts'),
      environment: commonEnv,
    });

    const createProduct = new NodejsFunction(this, 'CreateProductFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/handlers/createProduct.ts'),
      environment: commonEnv,
    });

    const catalogBatchProcess = new NodejsFunction(this, 'CatalogBatchProcessFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/handlers/catalogBatchProcess.ts'),
      environment: {
        ...commonEnv,
        SNS_TOPIC_ARN: createProductTopic.topicArn,
      },
    });

    productsTable.grantReadData(getProductsList);
    stocksTable.grantReadData(getProductsList);
    productsTable.grantReadData(getProductsById);
    stocksTable.grantReadData(getProductsById);
    productsTable.grantWriteData(createProduct);
    stocksTable.grantWriteData(createProduct);
    productsTable.grantWriteData(catalogBatchProcess);
    stocksTable.grantWriteData(catalogBatchProcess);
    createProductTopic.grantPublish(catalogBatchProcess);

    catalogBatchProcess.addEventSource(
      new lambdaEventSources.SqsEventSource(catalogItemsQueue, { batchSize: 5 }),
    );

    const api = new apigateway.RestApi(this, 'ProductServiceApi', {
      restApiName: 'Product Service API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const productsResource = api.root.addResource('products');
    productsResource.addMethod('GET', new apigateway.LambdaIntegration(getProductsList));
    productsResource.addMethod('POST', new apigateway.LambdaIntegration(createProduct));

    const productByIdResource = productsResource.addResource('{productId}');
    productByIdResource.addMethod('GET', new apigateway.LambdaIntegration(getProductsById));

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Product Service API URL',
    });

    new cdk.CfnOutput(this, 'CatalogItemsQueueArn', {
      value: catalogItemsQueue.queueArn,
      exportName: 'CatalogItemsQueueArn',
    });

    new cdk.CfnOutput(this, 'CatalogItemsQueueUrl', {
      value: catalogItemsQueue.queueUrl,
      exportName: 'CatalogItemsQueueUrl',
    });
  }
}
