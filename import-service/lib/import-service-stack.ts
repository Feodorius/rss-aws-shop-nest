import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

const BUCKET_ARN = 'arn:aws:s3:::rss-aws-import-bucket';

export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = s3.Bucket.fromBucketArn(this, 'ImportBucket', BUCKET_ARN);

    const catalogItemsQueue = sqs.Queue.fromQueueArn(
      this,
      'CatalogItemsQueue',
      cdk.Fn.importValue('CatalogItemsQueueArn'),
    );

    const importProductsFile = new NodejsFunction(this, 'ImportProductsFileFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/handlers/importProductsFile.ts'),
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });

    const importFileParser = new NodejsFunction(this, 'ImportFileParserFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/handlers/importFileParser.ts'),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        SQS_QUEUE_URL: catalogItemsQueue.queueUrl,
      },
    });

    bucket.grantPut(importProductsFile);
    bucket.grantReadWrite(importFileParser);
    catalogItemsQueue.grantSendMessages(importFileParser);

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(importFileParser),
      { prefix: 'uploaded/' },
    );

    const basicAuthorizerArn = cdk.Fn.importValue('BasicAuthorizerArn');
    const basicAuthorizerFn = lambda.Function.fromFunctionArn(
      this,
      'BasicAuthorizerFn',
      basicAuthorizerArn,
    );

    const authorizer = new apigateway.TokenAuthorizer(this, 'BasicTokenAuthorizer', {
      handler: basicAuthorizerFn,
      identitySource: apigateway.IdentitySource.header('Authorization'),
    });

    const api = new apigateway.RestApi(this, 'ImportServiceApi', {
      restApiName: 'Import Service API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    api.addGatewayResponse('UnauthorizedResponse', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });

    api.addGatewayResponse('AccessDeniedResponse', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });

    const importResource = api.root.addResource('import');
    importResource.addMethod('GET', new apigateway.LambdaIntegration(importProductsFile), {
      requestParameters: {
        'method.request.querystring.name': true,
      },
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Import Service API URL',
    });
  }
}
