import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  const { authorizationToken, methodArn } = event;

  if (!authorizationToken) {
    throw new Error('Unauthorized');
  }

  const [scheme, encodedCredentials] = authorizationToken.split(' ');

  if (scheme !== 'Basic' || !encodedCredentials) {
    throw new Error('Unauthorized');
  }

  const decoded = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
  const colonIndex = decoded.indexOf(':');

  if (colonIndex === -1) {
    throw new Error('Unauthorized');
  }

  const login = decoded.substring(0, colonIndex);
  const password = decoded.substring(colonIndex + 1);
  const expectedPassword = process.env[login];

  if (!expectedPassword || password !== expectedPassword) {
    return generatePolicy('user', 'Deny', methodArn);
  }

  return generatePolicy(login, 'Allow', methodArn);
};

function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };
}
