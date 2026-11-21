import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { extractAuthContext, requireRole, hasPermission } from './rbac';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.MAIN_TABLE || 'OrderManagementTable';

interface ApiResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

function response(statusCode: number, data: unknown): ApiResponse {
  return {
    statusCode,
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  };
}

function errorResponse(statusCode: number, message: string, details?: unknown): ApiResponse {
  return response(statusCode, {
    error: message,
    details: details || undefined,
  });
}

async function createAuditLog(
  userId: string,
  operationType: string,
  targetTable: string,
  targetRecordId: string | undefined,
  operationContent: string,
  operationResult: string,
  errorMessage?: string
): Promise<void> {
  const auditLogId = uuidv4();
  const now = new Date().toISOString();
  
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: 'AUDIT',
        sk: `${now}#${auditLogId}`,
        auditLogId,
        userId,
        operationType,
        targetTable,
        targetRecordId,
        operationContent,
        operationResult,
        errorMessage,
        operationDate: now,
      },
    })
  );
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const path = event.path || '';
    const method = event.httpMethod || 'GET';
    const pathParts = path.split('/').filter(Boolean);
    
    let authContext;
    try {
      authContext = extractAuthContext(event);
    } catch (error) {
      return errorResponse(401, 'Unauthorized', (error as Error).message);
    }
    
    // GET /resources
    if (method === 'GET' && pathParts[pathParts.length - 1] === 'resources') {
      return await handleGetResources(authContext);
    }
    
    // POST /api/{tableIndex}/bulk
    if (method === 'POST' && pathParts.includes('bulk')) {
      const tableIndex = pathParts[pathParts.indexOf('api') + 1];
      return await handleBulkImport(event, authContext, tableIndex);
    }
    
    return errorResponse(404, 'Not Found');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return errorResponse(500, message);
  }
}

async function handleGetResources(authContext: any): Promise<ApiResponse> {
  try {
    if (!hasPermission(authContext.role, 'read:all')) {
      return errorResponse(403, 'Forbidden: insufficient permissions');
    }
    
    const resources = [
      {
        id: '受注案件',
        name: '受注案件',
        description: '受注案件の基本情報を管理',
        tableIndex: '0',
      },
      {
        id: '案件ステータスマスタ',
        name: '案件ステータスマスタ',
        description: '受注案件の進捗状況を管理',
        tableIndex: '1',
      },
      {
        id: '優先度マスタ',
        name: '優先度マスタ',
        description: '受注案件の優先度を管理',
        tableIndex: '2',
      },
      {
        id: '入荷予定',
        name: '入荷予定',
        description: '商品の入荷予定を管理',
        tableIndex: '3',
      },
      {
        id: '商品',
        name: '商品',
        description: '商品マスタ',
        tableIndex: '4',
      },
      {
        id: '案件商品紐付け',
        name: '案件商品紐付け',
        description: '受注案件と商品の紐付け',
        tableIndex: '5',
      },
      {
        id: '納期回答期限管理',
        name: '納期回答期限管理',
        description: '納期回答期限を管理',
        tableIndex: '6',
      },
      {
        id: '見積提出履歴',
        name: '見積提出履歴',
        description: '見積書の提出履歴を管理',
        tableIndex: '7',
      },
      {
        id: '手配期限管理',
        name: '手配期限管理',
        description: '商品の手配期限を管理',
        tableIndex: '8',
      },
      {
        id: '仕入先納期遅延報告',
        name: '仕入先納期遅延報告',
        description: '仕入先からの納期遅延を報告',
        tableIndex: '9',
      },
      {
        id: '顧客通知履歴',
        name: '顧客通知履歴',
        description: '顧客への通知内容を記録',
        tableIndex: '10',
      },
      {
        id: 'ユーザー',
        name: 'ユーザー',
        description: 'ユーザー情報を管理',
        tableIndex: '11',
      },
      {
        id: 'ユーザー権限',
        name: 'ユーザー権限',
        description: 'ユーザーの機能アクセス権限を管理',
        tableIndex: '12',
      },
    ];
    
    return response(200, {
      resources,
      total: resources.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return errorResponse(500, message);
  }
}

const TABLE_CONFIGS: Record<string, { name: string; pk: string; sk?: string }> = {
  '0': { name: '受注案件', pk: 'projectId' },
  '1': { name: '案件ステータスマスタ', pk: 'statusId' },
  '2': { name: '優先度マスタ', pk: 'priorityId' },
  '3': { name: '入荷予定', pk: 'arrivalPlanId' },
  '4': { name: '商品', pk: 'productId' },
  '5': { name: '案件商品紐付け', pk: 'projectProductLinkId' },
  '6': { name: '納期回答期限管理', pk: 'deliveryAnswerDeadlineId' },
  '7': { name: '見積提出履歴', pk: 'estimateSubmissionHistoryId' },
  '8': { name: '手配期限管理', pk: 'procurementDeadlineId' },
  '9': { name: '仕入先納期遅延報告', pk: 'supplierDelayReportId' },
  '10': { name: '顧客通知履歴', pk: 'customerNotificationHistoryId' },
  '11': { name: 'ユーザー', pk: 'userId' },
  '12': { name: 'ユーザー権限', pk: 'permissionId' },
};

async function handleBulkImport(
  event: APIGatewayProxyEvent,
  authContext: any,
  tableIndex: string
): Promise<ApiResponse> {
  try {
    // Check permissions
    if (!['admin', 'operator'].includes(authContext.role)) {
      return errorResponse(403, 'Forbidden: only admin and operator can import');
    }
    
    const tableConfig = TABLE_CONFIGS[tableIndex];
    if (!tableConfig) {
      return errorResponse(400, 'Invalid table index');
    }
    
    const body = event.body ? JSON.parse(event.body) : {};
    const items = body.items || [];
    
    if (!Array.isArray(items) || items.length === 0) {
      return errorResponse(400, 'Invalid request: items must be a non-empty array');
    }
    
    const now = new Date().toISOString();
    const processedItems = items.map((item: any) => ({
      ...item,
      [tableConfig.pk]: item[tableConfig.pk] || uuidv4(),
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
      createdBy: item.createdBy || authContext.userId,
      updatedBy: item.updatedBy || authContext.userId,
    }));
    
    const chunks = [];
    for (let i = 0; i < processedItems.length; i += 25) {
      chunks.push(processedItems.slice(i, i + 25));
    }
    
    let imported = 0;
    const errors: string[] = [];
    
    for (const chunk of chunks) {
      const requestItems: Record<string, any[]> = {};
      requestItems[TABLE_NAME] = chunk.map((item) => ({
        PutRequest: {
          Item: item,
        },
      }));
      
      try {
        await docClient.send(
          new BatchWriteCommand({
            RequestItems: requestItems,
          })
        );
        imported += chunk.length;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch write failed: ${errorMsg}`);
      }
    }
    
    // Create audit log
    await createAuditLog(
      authContext.userId,
      'BULK_IMPORT',
      tableConfig.name,
      undefined,
      `Imported ${imported} items to ${tableConfig.name}`,
      errors.length === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
      errors.length > 0 ? errors.join('; ') : undefined
    );
    
    return response(200, {
      imported,
      failed: items.length - imported,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return errorResponse(500, message);
  }
}