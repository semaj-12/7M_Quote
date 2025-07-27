import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, PutBucketCorsCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

export interface S3UploadResult {
  key: string;
  url: string;
  signedUrl: string;
}

/**
 * Upload a PDF file to S3 and return URLs for viewing
 */
export async function uploadPdfToS3(
  filePath: string,
  originalName: string,
  userId: number
): Promise<S3UploadResult> {
  try {
    // Generate unique key for S3
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `drawings/user_${userId}/${timestamp}_${sanitizedName}`;

    // Read the file
    const fileContent = fs.readFileSync(filePath);

    // Upload to S3 with public read access
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: 'application/pdf',
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=3600',
      ACL: 'public-read', // Make publicly readable
      Metadata: {
        'original-name': originalName,
        'user-id': userId.toString(),
        'upload-timestamp': timestamp.toString(),
      },
    });

    await s3Client.send(uploadCommand);

    // Generate public URL and signed URL (force HTTPS)
    const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    const signedUrl = await generateSignedUrl(key);

    console.log(`PDF uploaded to S3: ${key}`);
    
    return {
      key,
      url: publicUrl,
      signedUrl,
    };
  } catch (error: any) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload PDF to S3: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Generate a signed URL for secure PDF viewing
 */
export async function generateSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentType: 'application/pdf',
      ResponseContentDisposition: 'inline',
    });

    const signedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn,
      // Force HTTPS protocol
      signableHeaders: new Set(['host'])
    });
    
    // Ensure the URL uses HTTPS
    const httpsUrl = signedUrl.replace(/^http:\/\//, 'https://');
    return httpsUrl;
  } catch (error: any) {
    console.error('Error generating signed URL:', error);
    throw new Error(`Failed to generate signed URL: ${error?.message || 'Unknown error'}`);
  }
}

// Stream file from S3 for proxy serving
export async function getFileStream(key: string): Promise<NodeJS.ReadableStream> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      throw new Error('No body in S3 response');
    }

    // Handle different stream types from AWS SDK
    const body = response.Body;
    if ('pipe' in body) {
      return body as NodeJS.ReadableStream;
    } else {
      // Convert other readable types to Node.js readable stream
      const { Readable } = await import('stream');
      return Readable.from(body as any);
    }
  } catch (error: any) {
    console.error('Error streaming from S3:', error);
    throw new Error(`Failed to stream file from S3: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Delete a PDF from S3
 */
export async function deletePdfFromS3(key: string): Promise<void> {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(deleteCommand);
    console.log(`PDF deleted from S3: ${key}`);
  } catch (error: any) {
    console.error('S3 delete error:', error);
    throw new Error(`Failed to delete PDF from S3: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Configure CORS for S3 bucket to allow browser PDF viewing
 */
export async function configureBucketCORS(): Promise<void> {
  try {
    const corsCommand = new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['Content-Length', 'Content-Type', 'ETag', 'x-amz-request-id'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    });

    await s3Client.send(corsCommand);
    console.log('S3 bucket CORS configured successfully');
  } catch (error: any) {
    console.error('Failed to configure S3 CORS:', error);
    // Don't throw - CORS config failure shouldn't break the app
  }
}

/**
 * Configure S3 bucket policy to allow public read access for drawings
 */
export async function configureBucketPolicy(): Promise<void> {
  try {
    const bucketPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${BUCKET_NAME}/drawings/*`
        }
      ]
    };

    const policyCommand = new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify(bucketPolicy)
    });

    await s3Client.send(policyCommand);
    console.log('S3 bucket policy configured for public read access');
  } catch (error: any) {
    console.error('Failed to configure S3 bucket policy:', error);
    // Don't throw - bucket policy failure shouldn't break the app
  }
}

/**
 * Check if S3 is properly configured
 */
export async function validateS3Configuration(): Promise<{ valid: boolean; message: string }> {
  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !BUCKET_NAME) {
      return {
        valid: false,
        message: 'Missing AWS credentials or bucket name',
      };
    }

    // Test S3 connection by listing objects (this will fail if credentials are invalid)
    const testCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: 'test-connection', // This key doesn't need to exist, we just need to test auth
    });

    try {
      await s3Client.send(testCommand);
    } catch (testError: any) {
      // If it's a NoSuchKey error, credentials are valid but object doesn't exist (which is fine)
      if (testError.name === 'NoSuchKey') {
        return { valid: true, message: 'S3 connection successful' };
      }
      // If it's an access denied error, credentials are invalid
      if (testError.name === 'AccessDenied' || testError.name === 'InvalidAccessKeyId') {
        return { valid: false, message: 'Invalid AWS credentials' };
      }
      // Other errors might indicate bucket doesn't exist or other issues
      return { valid: false, message: `S3 configuration error: ${testError.message}` };
    }

    // Configure CORS and bucket policy for PDF viewing
    await configureBucketCORS();
    await configureBucketPolicy();
    
    return { valid: true, message: 'S3 connection successful' };
  } catch (error: any) {
    return {
      valid: false,
      message: `S3 validation failed: ${error.message}`,
    };
  }
}