import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const envVars = dotenv.config({ path: path.join(__dirname, '../.env') }).parsed ?? {};

export class AuthorizationServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const basicAuthorizer = new NodejsFunction(this, 'BasicAuthorizerFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/handlers/basicAuthorizer.ts'),
      environment: envVars,
    });

    basicAuthorizer.addPermission('AllowApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    new cdk.CfnOutput(this, 'BasicAuthorizerArn', {
      value: basicAuthorizer.functionArn,
      exportName: 'BasicAuthorizerArn',
    });
  }
}
